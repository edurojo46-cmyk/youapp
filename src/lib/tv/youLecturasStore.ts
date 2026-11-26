// ============================================================================
// ATLAS WEB POINTER V1 — Mis Lecturas (0 Cuota API · Solo punteros)
// - Guarda referencias a artículos, noticias, investigaciones, blogs y recetas
//   sin copiar ni alojar el contenido original.
// - Persiste en localStorage + sincroniza en Supabase user_metadata.
// ============================================================================

import { supabase } from '../supabase';

const STORAGE_KEY = 'youapp_lecturas_v1';

export const DEFAULT_LECTURA_TOPICS = [
  'Actualidad',
  'Economía',
  'Cultura',
  'Deportes',
  'Ciencia',
  'Tecnología'
];

export interface LecturaItem {
  id: string;
  url: string;
  title: string;
  description: string;
  sourceName: string;
  domain: string;
  thumbnailUrl: string;
  faviconUrl: string;
  publishedAt: string | null;
  topic: string;
  read: boolean;
  favorite: boolean;
  embeddable?: boolean;
  addedAt: string;
}

export interface LecturasWorkspace {
  topics: string[];
  items: LecturaItem[];
  updatedAt: string;
}

function defaultWorkspace(): LecturasWorkspace {
  return {
    topics: [...DEFAULT_LECTURA_TOPICS],
    items: [],
    updatedAt: new Date().toISOString()
  };
}

export function normalizeWebUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(candidate);
    if (!u.hostname || !u.hostname.includes('.')) return null;
    // Limpia parámetros de rastreo comunes (utm_*, fbclid, gclid) para evitar duplicados
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'].forEach(
      (p) => u.searchParams.delete(p)
    );
    return u.toString();
  } catch {
    return null;
  }
}

function formatDomainAsSource(hostname: string): string {
  const clean = hostname.replace(/^www\./i, '');
  const base = clean.split('.')[0] || clean;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

export async function resolveWebPointer(
  rawUrl: string,
  topic = 'Actualidad',
  titleHint?: string
): Promise<{ ok: true; item: LecturaItem } | { ok: false; error: string }> {
  const normalized = normalizeWebUrl(rawUrl);
  if (!normalized) {
    return {
      ok: false,
      error: 'Pegá una URL web válida (ej. https://www.diario.com/articulo).'
    };
  }

  let domain = '';
  try {
    domain = new URL(normalized).hostname.replace(/^www\./i, '');
  } catch {
    domain = 'web';
  }

  const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
  let title = titleHint?.trim() || formatDomainAsSource(domain);
  let description = '';
  let sourceName = formatDomainAsSource(domain);
  let thumbnailUrl = '';
  let publishedAt: string | null = null;
  let finalUrl = normalized;
  let embeddable = false;

  let gotRemoteMeta = false;

  // 1. Metadata local (Vite dev middleware en localhost / LAN)
  if (
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      /^192\.168\./.test(window.location.hostname))
  ) {
    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`/api/mitv/social-meta?url=${encodeURIComponent(normalized)}`, {
        signal: controller.signal
      });
      window.clearTimeout(timer);
      if (res.ok) {
        const meta = await res.json();
        if (typeof meta?.title === 'string' && meta.title.trim()) {
          title = meta.title.trim();
          gotRemoteMeta = true;
        }
        if (typeof meta?.description === 'string' && meta.description.trim()) {
          description = meta.description.trim();
        }
        if (typeof meta?.siteName === 'string' && meta.siteName.trim()) {
          sourceName = meta.siteName.trim();
        }
        if (typeof meta?.thumbnailUrl === 'string' && meta.thumbnailUrl.trim()) {
          thumbnailUrl = meta.thumbnailUrl.trim();
        }
        if (typeof meta?.publishedAt === 'string' && meta.publishedAt.trim()) {
          publishedAt = meta.publishedAt.trim();
        }
        if (typeof meta?.finalUrl === 'string' && /^https?:\/\//i.test(meta.finalUrl)) {
          finalUrl = normalizeWebUrl(meta.finalUrl) || normalized;
        }
        if (typeof meta?.embeddable === 'boolean') {
          embeddable = meta.embeddable;
        }
      }
    } catch {
      // continúa al fallback público
    }
  }

  // 2. Fallback público CORS-friendly (funciona en youapptv.com / celular · obtiene foto, título y bajada oficial OG)
  if (!gotRemoteMeta || !thumbnailUrl) {
    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 6000);
      const mlRes = await fetch(
        `https://api.microlink.io/?url=${encodeURIComponent(normalized)}`,
        { signal: controller.signal }
      );
      window.clearTimeout(timer);
      if (mlRes.ok) {
        const mlJson = await mlRes.json();
        const d = mlJson?.data;
        if (d) {
          if (!gotRemoteMeta && typeof d.title === 'string' && d.title.trim()) {
            title = d.title.trim();
            gotRemoteMeta = true;
          }
          if (!description && typeof d.description === 'string' && d.description.trim()) {
            description = d.description.trim();
          }
          if (typeof d.publisher === 'string' && d.publisher.trim()) {
            sourceName = d.publisher.trim();
          }
          const imgUrl = d.image?.url || d.logo?.url || '';
          if (!thumbnailUrl && typeof imgUrl === 'string' && /^https?:\/\//i.test(imgUrl)) {
            thumbnailUrl = imgUrl;
          }
          if (!publishedAt && typeof d.date === 'string' && d.date.trim()) {
            publishedAt = d.date.trim();
          }
        }
        // Verifica encabezados reales de Microlink para saber si el diario permite vista embebida en iframe
        const hdrs = mlJson?.headers && typeof mlJson.headers === 'object' ? mlJson.headers : null;
        if (hdrs) {
          const xfo = String(hdrs['x-frame-options'] || hdrs['X-Frame-Options'] || '').toLowerCase();
          const csp = String(hdrs['content-security-policy'] || hdrs['Content-Security-Policy'] || '').toLowerCase();
          const faMatch = csp.match(/frame-ancestors\s+([^;]+)/i);
          const blocksFrame =
            xfo.includes('deny') ||
            xfo.includes('sameorigin') ||
            Boolean(faMatch && !faMatch[1].includes('*'));
          embeddable = !blocksFrame;
        }
      }
    } catch {
      // fallback silencioso
    }
  }

  // 3. Si no llegó título, extraer un titular legible desde el slug de la URL
  if (!gotRemoteMeta && (!titleHint || !titleHint.trim())) {
    try {
      const parts = new URL(finalUrl).pathname.split('/').filter(Boolean);
      const slug = [...parts].reverse().find((p) => p.includes('-') && p.length > 10);
      if (slug) {
        const cleanSlug = decodeURIComponent(slug)
          .replace(/\.[a-z0-9]+$/i, '')
          .replace(/[-_]+/g, ' ')
          .trim();
        if (cleanSlug.length > 6) {
          title = cleanSlug.charAt(0).toUpperCase() + cleanSlug.slice(1);
        }
      }
    } catch {
      // ignore
    }
  }

  return {
    ok: true,
    item: {
      id: `lec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      url: finalUrl,
      title: title.slice(0, 150),
      description: description.slice(0, 240),
      sourceName: sourceName.slice(0, 60),
      domain,
      thumbnailUrl,
      faviconUrl,
      publishedAt,
      topic: topic.trim() || 'Actualidad',
      read: false,
      favorite: false,
      embeddable,
      addedAt: new Date().toISOString()
    }
  };
}

export interface ReaderArticleContent {
  title?: string;
  paragraphs: string[];
}

const readerCache = new Map<string, ReaderArticleContent>();

function cleanMarkdownToParagraphs(markdown: string): string[] {
  if (!markdown) return [];
  const rawBlocks = markdown
    .replace(/\r\n/g, '\n')
    // Eliminar imágenes markdown y bloques de código/HTML sueltos
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`~>]+/g, '')
    .split(/\n{2,}/);

  const noiseRe =
    /^(suscrib|iniciar sesi|registr|ingres|compartir|seguir|aceptar cookies|pol[ií]tica de privacidad|t[eé]rminos|publicidad|copyright|todos los derechos|ver m[aá]s|leer tambi[eé]n|te puede interesar|men[uú]|buscar|últimas noticias|newsletter|descarg[aá] la app)/i;

  const out: string[] = [];
  for (const block of rawBlocks) {
    const line = block.replace(/\s+/g, ' ').trim();
    if (line.length < 40) continue;
    if (/^https?:\/\//i.test(line)) continue;
    if (noiseRe.test(line)) continue;
    // Descartar líneas que son solo listas de links/secciones separadas por | o •
    if ((line.match(/[|•]/g) || []).length >= 3) continue;
    out.push(line);
    if (out.length >= 28) break;
  }
  return out;
}

/** Extrae el contenido editorial limpio para Modo Lectura en portales que bloquean iframe (Clarín, La Nación, BBC, etc.) */
export async function fetchArticleReaderContent(url: string): Promise<ReaderArticleContent | null> {
  const cleanUrl = normalizeWebUrl(url);
  if (!cleanUrl) return null;
  const cached = readerCache.get(cleanUrl);
  if (cached) return cached;

  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 9000);
    const res = await fetch(`https://r.jina.ai/${cleanUrl}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
    window.clearTimeout(timer);
    if (!res.ok) return null;
    const json = await res.json();
    const data = json?.data;
    const contentText = typeof data?.content === 'string' ? data.content : '';
    const paragraphs = cleanMarkdownToParagraphs(contentText);
    if (paragraphs.length === 0) return null;
    const result: ReaderArticleContent = {
      title: typeof data?.title === 'string' && data.title.trim() ? data.title.trim() : undefined,
      paragraphs
    };
    readerCache.set(cleanUrl, result);
    return result;
  } catch {
    return null;
  }
}

export function loadLecturasWorkspace(): LecturasWorkspace {
  if (typeof window === 'undefined') return defaultWorkspace();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultWorkspace();
    const parsed = JSON.parse(raw);
    const topics: string[] =
      Array.isArray(parsed?.topics) && parsed.topics.length > 0
        ? parsed.topics.filter((t: unknown): t is string => typeof t === 'string' && t.trim().length > 0)
        : [...DEFAULT_LECTURA_TOPICS];
    const items: LecturaItem[] = Array.isArray(parsed?.items) ? parsed.items : [];
    return {
      topics,
      items,
      updatedAt: typeof parsed?.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString()
    };
  } catch {
    return defaultWorkspace();
  }
}

export function saveLecturasWorkspace(ws: LecturasWorkspace): LecturasWorkspace {
  const stamped: LecturasWorkspace = { ...ws, updatedAt: new Date().toISOString() };
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stamped));
    } catch {
      // ignore quota
    }
  }
  void syncLecturasToCloud(stamped);
  return stamped;
}

async function syncLecturasToCloud(ws: LecturasWorkspace): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user || user.is_anonymous) return;
    const compact = {
      topics: ws.topics.slice(0, 20),
      updatedAt: ws.updatedAt,
      items: ws.items.slice(0, 60).map((it) => ({
        id: it.id,
        url: it.url,
        title: it.title.slice(0, 120),
        description: it.description.slice(0, 160),
        sourceName: it.sourceName.slice(0, 48),
        domain: it.domain,
        thumbnailUrl: it.thumbnailUrl,
        faviconUrl: it.faviconUrl,
        publishedAt: it.publishedAt,
        topic: it.topic,
        read: it.read,
        favorite: it.favorite,
        addedAt: it.addedAt
      }))
    };
    await supabase.auth.updateUser({
      data: { youapp_lecturas_v1: compact }
    });
  } catch {
    // fallback silencioso a localStorage
  }
}

export async function loadLecturasFromCloud(): Promise<LecturasWorkspace | null> {
  try {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (!user || user.is_anonymous) return null;
    const cloud = (user.user_metadata as any)?.youapp_lecturas_v1;
    if (!cloud || !Array.isArray(cloud.items)) return null;

    const local = loadLecturasWorkspace();
    const byUrl = new Map<string, LecturaItem>();
    for (const it of local.items) byUrl.set(it.url, it);
    for (const cit of cloud.items as LecturaItem[]) {
      if (!cit?.url) continue;
      if (!byUrl.has(cit.url)) byUrl.set(cit.url, cit);
    }
    const mergedTopics = Array.from(
      new Set([...local.topics, ...(Array.isArray(cloud.topics) ? cloud.topics : [])])
    );
    const merged: LecturasWorkspace = {
      topics: mergedTopics.length > 0 ? mergedTopics : [...DEFAULT_LECTURA_TOPICS],
      items: Array.from(byUrl.values()).sort(
        (a, b) => (Date.parse(b.addedAt) || 0) - (Date.parse(a.addedAt) || 0)
      ),
      updatedAt: new Date().toISOString()
    };
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      } catch {
        // ignore
      }
    }
    return merged;
  } catch {
    return null;
  }
}

export interface PortalLatestGroup {
  portalId: string;
  portalName: string;
  domain: string;
  homeUrl: string;
  items: LecturaItem[];
}

export const PORTAL_FEED_DEFS: Array<{
  id: string;
  name: string;
  domain: string;
  homeUrl: string;
  rssUrl: string;
  fallbackRssUrl?: string;
}> = [
  {
    id: 'infobae',
    name: 'Infobae',
    domain: 'infobae.com',
    homeUrl: 'https://www.infobae.com/',
    rssUrl: 'https://www.infobae.com/arc/outboundfeeds/rss/'
  },
  {
    id: 'clarin',
    name: 'Clarín',
    domain: 'clarin.com',
    homeUrl: 'https://www.clarin.com/',
    rssUrl: 'https://www.clarin.com/rss/lo-ultimo/'
  },
  {
    id: 'lanacion',
    name: 'La Nación',
    domain: 'lanacion.com.ar',
    homeUrl: 'https://www.lanacion.com.ar/',
    rssUrl: 'https://www.lanacion.com.ar/arc/outboundfeeds/rss/'
  },
  {
    id: 'tn',
    name: 'TN',
    domain: 'tn.com.ar',
    homeUrl: 'https://tn.com.ar/',
    rssUrl: 'https://news.google.com/rss/search?q=site:tn.com.ar&hl=es-419&gl=AR&ceid=AR:es-419',
    fallbackRssUrl: 'https://tn.com.ar/arc/outboundfeeds/rss/'
  },
  {
    id: 'bbc',
    name: 'BBC Mundo',
    domain: 'bbc.com',
    homeUrl: 'https://www.bbc.com/mundo',
    rssUrl: 'https://feeds.bbci.co.uk/mundo/rss.xml'
  },
  {
    id: 'elpais',
    name: 'El País',
    domain: 'elpais.com',
    homeUrl: 'https://elpais.com/',
    rssUrl: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada'
  }
];

const PORTALS_CACHE_KEY = 'youapp_lecturas_portals_v1';
const PORTALS_CACHE_TTL_MS = 12 * 60 * 1000;

function stripHtmlText(raw: string): string {
  return String(raw || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function loadCachedPortalsLatest(): PortalLatestGroup[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PORTALS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.groups)) return null;
    if (typeof parsed.expiresAt === 'number' && parsed.expiresAt > Date.now()) {
      return parsed.groups as PortalLatestGroup[];
    }
    return null;
  } catch {
    return null;
  }
}

function saveCachedPortalsLatest(groups: PortalLatestGroup[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      PORTALS_CACHE_KEY,
      JSON.stringify({
        groups,
        expiresAt: Date.now() + PORTALS_CACHE_TTL_MS
      })
    );
  } catch {
    // ignore quota
  }
}

async function fetchPortalViaRss2Json(
  def: (typeof PORTAL_FEED_DEFS)[number],
  perPortal: number
): Promise<LecturaItem[]> {
  const urlsToTry = [def.rssUrl, ...(def.fallbackRssUrl ? [def.fallbackRssUrl] : [])];
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(def.domain)}&sz=64`;
  for (const rssUrl of urlsToTry) {
    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 5500);
      const res = await fetch(
        `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`,
        { signal: controller.signal }
      );
      window.clearTimeout(timer);
      if (!res.ok) continue;
      const data = await res.json();
      if (data?.status !== 'ok' || !Array.isArray(data?.items) || data.items.length === 0) continue;
      const nowIso = new Date().toISOString();
      return data.items.slice(0, perPortal).map((it: any, idx: number): LecturaItem => {
        const thumb =
          (typeof it?.thumbnail === 'string' && /^https?:\/\//i.test(it.thumbnail) && it.thumbnail) ||
          (typeof it?.enclosure?.link === 'string' &&
            /^https?:\/\//i.test(it.enclosure.link) &&
            it.enclosure.link) ||
          '';
        return {
          id: `portal-${def.id}-${idx}-${String(it?.link || '').slice(-12)}`,
          url: String(it?.link || def.homeUrl),
          title: stripHtmlText(it?.title || def.name).slice(0, 160),
          description: stripHtmlText(it?.description || '').slice(0, 220),
          sourceName: def.name,
          domain: def.domain,
          thumbnailUrl: thumb,
          faviconUrl,
          publishedAt: typeof it?.pubDate === 'string' ? it.pubDate : null,
          topic: 'Actualidad',
          read: false,
          favorite: false,
          embeddable: false,
          addedAt: nowIso
        };
      });
    } catch {
      // try next url
    }
  }
  return [];
}

/** Obtiene las 3 últimas notas en vivo de cada portal (caché 12 min · local Vite API o fallback CORS público) */
export async function fetchPortalsLatest(perPortal = 3, forceRefresh = false): Promise<PortalLatestGroup[]> {
  if (!forceRefresh) {
    const cached = loadCachedPortalsLatest();
    if (cached && cached.some((g) => g.items.length > 0)) {
      return cached;
    }
  }

  // 1. Middleware local Vite (localhost / LAN Wi-Fi) — ultra rápido y sin límites CORS
  if (
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      /^192\.168\./.test(window.location.hostname))
  ) {
    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 6500);
      const res = await fetch(`/api/lecturas/portals-latest?perPortal=${perPortal}`, {
        signal: controller.signal
      });
      window.clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        if (data?.ok && Array.isArray(data.sections) && data.sections.length > 0) {
          const nowIso = new Date().toISOString();
          const groups: PortalLatestGroup[] = data.sections.map((sec: any) => {
            const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(sec.domain)}&sz=64`;
            return {
              portalId: sec.portalId,
              portalName: sec.portalName,
              domain: sec.domain,
              homeUrl: sec.homeUrl,
              items: (Array.isArray(sec.items) ? sec.items : []).slice(0, perPortal).map(
                (it: any, idx: number): LecturaItem => ({
                  id: `portal-${sec.portalId}-${idx}-${String(it.url || '').slice(-12)}`,
                  url: String(it.url || sec.homeUrl),
                  title: String(it.title || sec.portalName).slice(0, 160),
                  description: String(it.description || '').slice(0, 220),
                  sourceName: sec.portalName,
                  domain: sec.domain,
                  thumbnailUrl: typeof it.thumbnailUrl === 'string' ? it.thumbnailUrl : '',
                  faviconUrl,
                  publishedAt: typeof it.publishedAt === 'string' ? it.publishedAt : null,
                  topic: 'Actualidad',
                  read: false,
                  favorite: false,
                  embeddable: false,
                  addedAt: nowIso
                })
              )
            };
          });
          if (groups.some((g) => g.items.length > 0)) {
            saveCachedPortalsLatest(groups);
            return groups;
          }
        }
      }
    } catch {
      // cae al fallback CORS público
    }
  }

  // 2. Fallback público CORS-friendly (youapptv.com / APK Android) en tandas de 2 para evitar 429
  const groups: PortalLatestGroup[] = [];
  for (let i = 0; i < PORTAL_FEED_DEFS.length; i += 2) {
    const batch = PORTAL_FEED_DEFS.slice(i, i + 2);
    const results = await Promise.all(
      batch.map(async (def) => ({
        portalId: def.id,
        portalName: def.name,
        domain: def.domain,
        homeUrl: def.homeUrl,
        items: await fetchPortalViaRss2Json(def, perPortal)
      }))
    );
    groups.push(...results);
  }
  if (groups.some((g) => g.items.length > 0)) {
    saveCachedPortalsLatest(groups);
  }
  return groups;
}
