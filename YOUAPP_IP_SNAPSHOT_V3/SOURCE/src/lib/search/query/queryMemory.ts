/**
 * queryMemory.ts — Fase 5: Query Memory
 *
 * Guarda el SIGNIFICADO de las búsquedas, no solo las cadenas.
 *
 * Principio:
 *   "Boca", "Boca Juniors", "videos de Boca", "quiero ver Boca", "contenido xeneize"
 *   → reutilizan el mismo conocimiento.
 *
 * Qué guarda:
 *   - El significado (intent, topic, entities, language) — esto es duradero
 *   - Un cache temporal de IDs — se invalida por TTL (la fuente de verdad es Atlas/ranking)
 *
 * Qué NO guarda:
 *   - candidate_ids uuid[] permanentes (quedan obsoletos a escala)
 */

import { supabase } from '../../supabase';
import { norm } from '../queryEngine';

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface QueryMeaning {
  canonicalQuery: string;
  primaryIntent: 'general' | 'news' | 'tutorial' | 'documentary' | 'entertainment' | 'live';
  topic?: string;
  entities: string[];
  language: string;
  freshnessScore: number; // 0=atemporal, 100=muy volátil
  aliases: string[];
}

export interface MemoryLookupResult {
  found: boolean;
  meaning?: QueryMeaning;
  cachedIds?: string[];      // IDs válidos del cache temporal (si no expiró)
  cacheExpired?: boolean;    // true si había cache pero expiró
  atlasCoverage: number;     // % de cobertura conocida en Atlas
  shouldUseCachedIds: boolean;
}

// ── Normalización de queries para matching semántico ────────────────────────

const NOISE_WORDS = new Set([
  'quiero', 'ver', 'busco', 'buscar', 'videos', 'de', 'sobre', 'acerca',
  'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
  'me', 'mi', 'mis', 'tu', 'tus', 'su', 'sus',
  'contenido', 'canal', 'programa', 'serie', 'documental',
]);

export function extractCanonicalQuery(rawQuery: string): string {
  const normalized = norm(rawQuery);
  const words = normalized.split(/\s+/);
  const meaningful = words.filter(w => w.length > 2 && !NOISE_WORDS.has(w));
  return meaningful.join(' ') || normalized;
}

// Entidades conocidas (aliases rápidos sin API)
const ENTITY_ALIASES: Record<string, string[]> = {
  'boca juniors': ['boca', 'xeneize', 'la academia azul y oro'],
  'river plate': ['river', 'millonario', 'la banda de nunez'],
  'inteligencia artificial': ['ia', 'ai', 'artificial intelligence', 'machine learning'],
  'historia argentina': ['argentina historia', 'historia de argentina'],
  'segunda guerra mundial': ['ww2', 'wwii', 'segunda guerra'],
  'cambio climatico': ['calentamiento global', 'climate change', 'medio ambiente'],
};

export function findEntityMatch(canonical: string): string | undefined {
  for (const [entity, aliases] of Object.entries(ENTITY_ALIASES)) {
    if (canonical.includes(entity) || aliases.some(a => canonical.includes(a))) {
      return entity;
    }
  }
  return undefined;
}

// ── Detección de intent (Level 0 — solo código) ──────────────────────────────

export function detectIntent(rawQuery: string): QueryMeaning['primaryIntent'] {
  const q = norm(rawQuery);
  if (/en vivo|live|directo/.test(q)) return 'live';
  if (/noticias|breaking|ultimo momento|hoy|2026/.test(q)) return 'news';
  if (/como|tutorial|aprend|guia|paso a paso|how to/.test(q)) return 'tutorial';
  if (/documental|documentary|historia de|historia del/.test(q)) return 'documentary';
  if (/pelicula|serie|episodio|temporada|capitulo/.test(q)) return 'entertainment';
  return 'general';
}

// Freshness score según el intent
function getFreshnessScore(intent: QueryMeaning['primaryIntent'], rawQuery: string): number {
  if (intent === 'live') return 100;
  if (intent === 'news') return 85;
  const q = norm(rawQuery);
  if (/hoy|ahora|ultimo|reciente|nuevo/.test(q)) return 70;
  if (/2026|2025/.test(q)) return 60;
  if (intent === 'tutorial') return 20;
  if (intent === 'documentary') return 15;
  return 40; // general
}

// Detección básica de idioma de la query
function detectLanguage(rawQuery: string): string {
  const q = norm(rawQuery);
  const es = /\b(el|la|de|en|que|los|con|para|una|del|por|pero|como)\b/.test(q);
  const pt = /\b(de|da|do|em|que|os|com|para|um|uma|esse)\b/.test(q);
  if (es && !pt) return 'es';
  if (pt && !es) return 'pt';
  return 'en';
}

// ── API pública ─────────────────────────────────────────────────────────────

/**
 * Buscar en Query Memory si hay conocimiento previo sobre esta búsqueda.
 * Si se encuentra, devuelve el significado y opcionalmente IDs cacheados.
 * Si no, devuelve found=false para que el motor construya el significado.
 */
export async function lookupQueryMemory(rawQuery: string): Promise<MemoryLookupResult> {
  const canonical = extractCanonicalQuery(rawQuery);

  try {
    // 1. Buscar por canonical_query exacto
    let { data: memory } = await supabase
      .from('query_memory')
      .select('*')
      .eq('canonical_query', canonical)
      .maybeSingle();

    // 2. Si no encontramos exacto, buscar en aliases
    if (!memory) {
      const { data: aliasMatches } = await supabase
        .from('query_memory')
        .select('*')
        .contains('aliases', [canonical])
        .limit(1);

      memory = aliasMatches?.[0] || null;
    }

    if (!memory) {
      return { found: false, atlasCoverage: 0, shouldUseCachedIds: false };
    }

    const now = new Date();
    const cacheExpired = memory.cache_expires_at
      ? new Date(memory.cache_expires_at) < now
      : true;

    const meaning: QueryMeaning = {
      canonicalQuery: memory.canonical_query,
      primaryIntent: memory.primary_intent || 'general',
      topic: memory.topic,
      entities: memory.entities || [],
      language: memory.language || 'es',
      freshnessScore: memory.freshness_score || 40,
      aliases: memory.aliases || [],
    };

    // Solo usar IDs cacheados si:
    // - El cache no expiró
    // - La query no es de tipo volátil (news/live)
    const shouldUseCachedIds =
      !cacheExpired &&
      (memory.cached_content_ids?.length ?? 0) > 0 &&
      meaning.primaryIntent !== 'news' &&
      meaning.primaryIntent !== 'live';

    // Actualizar contador de búsquedas (best-effort)
    supabase
      .from('query_memory')
      .update({
        search_count: (memory.search_count || 1) + 1,
        last_searched_at: now.toISOString(),
      })
      .eq('canonical_query', memory.canonical_query)
      .then(() => {})
      .catch(() => {});

    return {
      found: true,
      meaning,
      cachedIds: shouldUseCachedIds ? memory.cached_content_ids : undefined,
      cacheExpired,
      atlasCoverage: memory.atlas_coverage || 0,
      shouldUseCachedIds,
    };

  } catch (err) {
    // Query Memory es best-effort: nunca bloquear la búsqueda si falla
    console.warn('[QueryMemory] Lookup failed, continuing without memory:', err);
    return { found: false, atlasCoverage: 0, shouldUseCachedIds: false };
  }
}

/**
 * Guardar o actualizar el conocimiento sobre una búsqueda.
 * Solo guarda el SIGNIFICADO. El cache temporal de IDs tiene TTL según el freshness.
 */
export async function saveQueryMemory(params: {
  rawQuery: string;
  resultIds?: string[];
  atlasCoverage?: number;
  additionalAliases?: string[];
}): Promise<void> {
  const canonical = extractCanonicalQuery(params.rawQuery);
  const intent = detectIntent(params.rawQuery);
  const freshnessScore = getFreshnessScore(intent, params.rawQuery);
  const language = detectLanguage(params.rawQuery);
  const entityMatch = findEntityMatch(canonical);

  // TTL del cache temporal según volatilidad:
  // - news/live: 30 min (muy volátil)
  // - trending: 2 horas
  // - general: 4 horas
  // - tutorial/documentary: 24 horas (casi estático)
  const cacheTTLMs =
    intent === 'live' || intent === 'news' ? 30 * 60 * 1000 :
    freshnessScore > 60 ? 2 * 60 * 60 * 1000 :
    intent === 'tutorial' || intent === 'documentary' ? 24 * 60 * 60 * 1000 :
    4 * 60 * 60 * 1000;

  const cacheExpiresAt = new Date(Date.now() + cacheTTLMs).toISOString();

  try {
    // Buscar si ya existe
    const { data: existing } = await supabase
      .from('query_memory')
      .select('aliases, search_count')
      .eq('canonical_query', canonical)
      .maybeSingle();

    // Fusionar aliases sin duplicados
    const currentAliases = existing?.aliases || [];
    const allAliases = [...new Set([
      ...currentAliases,
      ...(params.additionalAliases || []),
      params.rawQuery !== canonical ? norm(params.rawQuery) : '',
    ])].filter(Boolean);

    await supabase.from('query_memory').upsert({
      canonical_query: canonical,
      primary_intent: intent,
      topic: entityMatch || null,
      entities: entityMatch ? [entityMatch] : [],
      language,
      aliases: allAliases,
      cached_content_ids: params.resultIds?.slice(0, 100) || null, // max 100 IDs en cache
      cache_expires_at: cacheExpiresAt,
      atlas_coverage: params.atlasCoverage ?? 0,
      freshness_score: freshnessScore,
      search_count: (existing?.search_count || 0) + 1,
      last_searched_at: new Date().toISOString(),
    }, { onConflict: 'canonical_query' });

  } catch (err) {
    // Best-effort: nunca bloquear por fallos de memoria
    console.warn('[QueryMemory] Save failed:', err);
  }
}

/**
 * Registrar que una búsqueda fue resuelta por Atlas (útil para atlas_coverage)
 */
export async function markQueryResolvedByAtlas(rawQuery: string, coveragePercent: number): Promise<void> {
  const canonical = extractCanonicalQuery(rawQuery);
  try {
    await supabase
      .from('query_memory')
      .update({ atlas_coverage: coveragePercent })
      .eq('canonical_query', canonical);
  } catch {
    // Best-effort
  }
}
