// ============================================================================
// ATLAS COMPARA V1 — Motor de Comparación Multi-Fuente por RSS Público (US$ 0)
// - Consulta 10 feeds RSS oficiales y públicos (caché 10 min en RAM).
// - Agrupa coberturas del mismo acontecimiento por entidades, cifras y términos.
// - Compara SOLO metadatos públicos (titular, bajada, fecha y enlace original).
//   Nunca copia artículos completos ni inventa hechos no presentes en las fuentes.
// ============================================================================

export interface RssFeedDef {
  id: string;
  name: string;
  domain: string;
  rssUrl: string;
}

export interface RssNewsItem {
  outletId: string;
  outletName: string;
  domain: string;
  title: string;
  description: string;
  url: string;
  publishedAt: string | null;
  thumbnailUrl: string | null;
}

export interface ComparedOutletItem extends RssNewsItem {
  matchScore: number;
  sharedSignals: string[];
  uniqueFocusTerms: string[];
  figuresMentioned: string[];
}

export interface AtlasCompareResult {
  ok: true;
  queryTitle: string;
  queryUrl: string | null;
  querySource: string | null;
  detectedEntities: string[];
  sourcesChecked: number;
  totalRssFeeds: number;
  matchedCount: number;
  sharedConcepts: string[];
  matches: ComparedOutletItem[];
  methodologyNote: string;
}

export const ATLAS_COMPARA_RSS_FEEDS: RssFeedDef[] = [
  {
    id: 'infobae',
    name: 'Infobae',
    domain: 'infobae.com',
    rssUrl: 'https://www.infobae.com/arc/outboundfeeds/rss/'
  },
  {
    id: 'lanacion',
    name: 'La Nación',
    domain: 'lanacion.com.ar',
    rssUrl: 'https://www.lanacion.com.ar/arc/outboundfeeds/rss/'
  },
  {
    id: 'clarin',
    name: 'Clarín',
    domain: 'clarin.com',
    rssUrl: 'https://www.clarin.com/rss/lo-ultimo/'
  },
  {
    id: 'ambito',
    name: 'Ámbito',
    domain: 'ambito.com',
    rssUrl: 'https://www.ambito.com/rss/pages/home.xml'
  },
  {
    id: 'pagina12',
    name: 'Página/12',
    domain: 'pagina12.com.ar',
    rssUrl: 'https://www.pagina12.com.ar/rss/portada'
  },
  {
    id: 'perfil',
    name: 'Perfil',
    domain: 'perfil.com',
    rssUrl: 'https://www.perfil.com/feed'
  },
  {
    id: 'tn',
    name: 'TN',
    domain: 'tn.com.ar',
    rssUrl: 'https://tn.com.ar/arc/outboundfeeds/rss/'
  },
  {
    id: 'bbc',
    name: 'BBC Mundo',
    domain: 'bbc.com',
    rssUrl: 'https://feeds.bbci.co.uk/mundo/rss.xml'
  },
  {
    id: 'dw',
    name: 'DW Español',
    domain: 'dw.com',
    rssUrl: 'https://rss.dw.com/xml/rss-sp-all'
  },
  {
    id: 'elpais',
    name: 'El País',
    domain: 'elpais.com',
    rssUrl: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada'
  }
];

const SPANISH_STOPWORDS = new Set([
  'para', 'como', 'pero', 'sobre', 'entre', 'desde', 'hasta', 'tras', 'ante', 'bajo',
  'contra', 'segun', 'este', 'esta', 'estos', 'estas', 'esos', 'esas', 'aquel', 'aquella',
  'todo', 'toda', 'todos', 'todas', 'otro', 'otra', 'otros', 'otras', 'mismo', 'misma',
  'donde', 'cuando', 'quien', 'quienes', 'cual', 'cuales', 'porque', 'aunque', 'mientras',
  'tambien', 'solo', 'sola', 'puede', 'pueden', 'podria', 'podrian', 'sera', 'seran',
  'fueron', 'habia', 'habra', 'tiene', 'tienen', 'hace', 'hacen', 'hizo', 'dijo', 'aseguro',
  'afirmo', 'senalo', 'explico', 'ahora', 'antes', 'despues', 'hoy', 'ayer', 'manana',
  'nuevo', 'nueva', 'nuevos', 'nuevas', 'mayor', 'menor', 'gran', 'parte', 'caso', 'anos',
  'pais', 'mundo', 'noticia', 'noticias', 'video', 'fotos', 'vivo', 'ultimo', 'ultima'
]);

const rssCache = new Map<string, { items: RssNewsItem[]; expiresAt: number }>();

function decodeEntities(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeToken(word: string): string {
  return word
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function extractKeywords(text: string): string[] {
  const words = text.split(/[\s,.;:!?()[\]"'«»“”/—–-]+/);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of words) {
    const norm = normalizeToken(w);
    if (norm.length < 4 || SPANISH_STOPWORDS.has(norm) || /^\d+$/.test(norm)) continue;
    if (!seen.has(norm)) {
      seen.add(norm);
      out.push(norm);
    }
  }
  return out;
}

function extractEntities(text: string): { display: string[]; normSet: Set<string> } {
  const matches = text.match(/\b[A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ]{2,}(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñA-ZÁÉÍÓÚÑ]{2,})?\b/g) || [];
  const normSet = new Set<string>();
  const display: string[] = [];
  for (const m of matches) {
    const clean = m.trim();
    const norm = normalizeToken(clean);
    if (norm.length < 3 || SPANISH_STOPWORDS.has(norm)) continue;
    if (!normSet.has(norm)) {
      normSet.add(norm);
      display.push(clean);
    }
  }
  return { display: display.slice(0, 12), normSet };
}

function extractFigures(text: string): string[] {
  const matches = text.match(/(?:\$|US\$|USD\s*)?\d+(?:[.,]\d+)?(?:\s*%|\s*millones|\s*mil|\s*pesos|\s*dólares|\s*puntos)?/gi) || [];
  return Array.from(
    new Set(
      matches
        .map((m) => m.trim())
        .filter((m) => m.length >= 2 && !/^(19|20)\d{2}$/.test(m))
    )
  ).slice(0, 6);
}

function parseRssXml(xml: string, feed: RssFeedDef): RssNewsItem[] {
  const items: RssNewsItem[] = [];
  const itemMatches = xml.match(/<(?:item|entry)\b[\s\S]*?<\/(?:item|entry)>/gi) || [];

  for (const block of itemMatches.slice(0, 35)) {
    const titleM = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const linkM =
      block.match(/<link[^>]*>([\s\S]*?)<\/link>/i) ||
      block.match(/<link[^>]+href=["']([^"']+)["']/i);
    const descM =
      block.match(/<description[^>]*>([\s\S]*?)<\/description>/i) ||
      block.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i);
    const dateM =
      block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) ||
      block.match(/<published[^>]*>([\s\S]*?)<\/published>/i) ||
      block.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i);
    const thumbM =
      block.match(/<media:content[^>]+url=["']([^"']+)["']/i) ||
      block.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i) ||
      block.match(/<enclosure[^>]+url=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i);

    const title = titleM?.[1] ? decodeEntities(titleM[1]) : '';
    const url = linkM?.[1] ? decodeEntities(linkM[1]) : '';
    if (!title || !/^https?:\/\//i.test(url)) continue;

    items.push({
      outletId: feed.id,
      outletName: feed.name,
      domain: feed.domain,
      title: title.slice(0, 160),
      description: descM?.[1] ? decodeEntities(descM[1]).slice(0, 240) : '',
      url,
      publishedAt: dateM?.[1] ? decodeEntities(dateM[1]) : null,
      thumbnailUrl: thumbM?.[1] ? decodeEntities(thumbM[1]) : null
    });
  }
  return items;
}

async function fetchSingleFeed(feed: RssFeedDef): Promise<RssNewsItem[]> {
  const now = Date.now();
  const cached = rssCache.get(feed.id);
  if (cached && cached.expiresAt > now) {
    return cached.items;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4800);
  try {
    const res = await fetch(feed.rssUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; YOUAPP-AtlasCompara/1.0)',
        Accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8'
      }
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const xml = await res.text();
    const items = parseRssXml(xml, feed);
    rssCache.set(feed.id, { items, expiresAt: now + 10 * 60 * 1000 });
    return items;
  } catch {
    clearTimeout(timer);
    return [];
  }
}

export async function compareNewsAcrossFeeds(params: {
  title: string;
  description?: string;
  url?: string;
  sourceName?: string;
}): Promise<AtlasCompareResult> {
  const queryTitle = params.title.trim();
  const queryText = `${queryTitle} ${params.description || ''}`.trim();
  const queryKeywords = extractKeywords(queryText);
  const queryKwSet = new Set(queryKeywords);
  const queryEntities = extractEntities(queryTitle);
  const queryFigures = new Set(extractFigures(queryText).map((f) => f.toLowerCase()));
  const cleanQueryUrl = (params.url || '').split('?')[0].replace(/\/$/, '').toLowerCase();

  const feedResults = await Promise.all(
    ATLAS_COMPARA_RSS_FEEDS.map(async (f) => {
      const list = await fetchSingleFeed(f);
      return { feed: f, list };
    })
  );

  const sourcesChecked = feedResults.filter((r) => r.list.length > 0).length;
  const bestByOutlet = new Map<string, ComparedOutletItem>();

  for (const { list } of feedResults) {
    for (const art of list) {
      const cleanArtUrl = art.url.split('?')[0].replace(/\/$/, '').toLowerCase();
      if (cleanQueryUrl && cleanArtUrl === cleanQueryUrl) continue;

      const artText = `${art.title} ${art.description}`;
      const artKeywords = extractKeywords(artText);
      const artEntities = extractEntities(art.title);
      const artFigures = extractFigures(artText);

      let score = 0;
      const sharedSignals: string[] = [];

      for (const ent of queryEntities.display) {
        const norm = normalizeToken(ent);
        if (artEntities.normSet.has(norm) || artKeywords.includes(norm)) {
          score += 3;
          if (!sharedSignals.includes(ent)) sharedSignals.push(ent);
        }
      }

      for (const kw of artKeywords) {
        if (queryKwSet.has(kw)) {
          score += 1.5;
          if (!sharedSignals.some((s) => normalizeToken(s) === kw)) {
            sharedSignals.push(kw);
          }
        }
      }

      for (const fig of artFigures) {
        if (queryFigures.has(fig.toLowerCase())) {
          score += 2;
          if (!sharedSignals.includes(fig)) sharedSignals.push(fig);
        }
      }

      // Umbral estricto para evitar falsos positivos
      if (score < 4.5 || sharedSignals.length < 2) continue;

      const uniqueFocusTerms = extractKeywords(art.title)
        .filter((k) => !queryKwSet.has(k))
        .slice(0, 4);

      const candidate: ComparedOutletItem = {
        ...art,
        matchScore: Math.round(score * 10) / 10,
        sharedSignals: sharedSignals.slice(0, 6),
        uniqueFocusTerms,
        figuresMentioned: artFigures
      };

      const prev = bestByOutlet.get(art.outletId);
      if (!prev || candidate.matchScore > prev.matchScore) {
        bestByOutlet.set(art.outletId, candidate);
      }
    }
  }

  const matches = Array.from(bestByOutlet.values())
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 8);

  // Conceptos compartidos por 2 o más medios (incluyendo el artículo base)
  const termCounts = new Map<string, number>();
  for (const m of matches) {
    for (const sig of m.sharedSignals) {
      const key = sig.toLowerCase();
      termCounts.set(key, (termCounts.get(key) || 1) + 1);
    }
  }
  const sharedConcepts = Array.from(termCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k)
    .slice(0, 8);

  return {
    ok: true,
    queryTitle,
    queryUrl: params.url || null,
    querySource: params.sourceName || null,
    detectedEntities: queryEntities.display.slice(0, 6),
    sourcesChecked,
    totalRssFeeds: ATLAS_COMPARA_RSS_FEEDS.length,
    matchedCount: matches.length,
    sharedConcepts,
    matches,
    methodologyNote:
      'Comparación basada exclusivamente en titulares, bajadas y metadatos RSS públicos. No copia notas completas ni declara veracidad automática: verificá siempre en cada fuente original.'
  };
}

export interface PortalLatestSection {
  portalId: string;
  portalName: string;
  domain: string;
  homeUrl: string;
  items: RssNewsItem[];
}

const DEFAULT_PORTAL_IDS = ['infobae', 'clarin', 'lanacion', 'tn', 'bbc', 'elpais'];
const PORTAL_HOME_URLS: Record<string, string> = {
  infobae: 'https://www.infobae.com/',
  clarin: 'https://www.clarin.com/',
  lanacion: 'https://www.lanacion.com.ar/',
  tn: 'https://tn.com.ar/',
  bbc: 'https://www.bbc.com/mundo',
  elpais: 'https://elpais.com/'
};

export async function getLatestFromPortals(
  perPortal = 3,
  portalIds: string[] = DEFAULT_PORTAL_IDS
): Promise<{ ok: true; perPortal: number; sections: PortalLatestSection[]; updatedAt: string }> {
  const limit = Math.max(1, Math.min(8, Math.round(perPortal || 3)));
  const wanted = portalIds
    .map((id) => ATLAS_COMPARA_RSS_FEEDS.find((f) => f.id === id))
    .filter((f): f is RssFeedDef => Boolean(f));

  const sections = await Promise.all(
    wanted.map(async (feed) => {
      let list = await fetchSingleFeed(feed);
      if (list.length === 0) {
        const fallbackFeed: RssFeedDef = {
          ...feed,
          id: `${feed.id}-gnews`,
          rssUrl: `https://news.google.com/rss/search?q=site:${encodeURIComponent(feed.domain)}&hl=es-419&gl=AR&ceid=AR:es-419`
        };
        list = await fetchSingleFeed(fallbackFeed);
      }
      return {
        portalId: feed.id,
        portalName: feed.name,
        domain: feed.domain,
        homeUrl: PORTAL_HOME_URLS[feed.id] || `https://${feed.domain}/`,
        items: list.slice(0, limit).map((it) => ({
          ...it,
          outletId: feed.id,
          outletName: feed.name,
          domain: feed.domain
        }))
      };
    })
  );

  return {
    ok: true,
    perPortal: limit,
    sections,
    updatedAt: new Date().toISOString()
  };
}
