export type PublisherCategory = 'institutional' | 'archive' | 'news' | 'culture' | 'educational';

export interface PublisherSource {
  code: string;
  name: string;
  category: PublisherCategory;
  country: string;
  domains: string[];               // Dominios permitidos para SSRF allowlist
  searchUrlTemplate?: string;      // Template para on-demand discovery
  rssFeeds: string[];              // Feeds para background ingestion
  videoSitemaps?: string[];
  capabilities: {
    htmlDiscovery: boolean;
    rss: boolean;
    videoSitemap: boolean;
    jsonLd: boolean;
  };
  reputationWeight: number;        // 1.0 a 1.3
}

export const PUBLISHER_REGISTRY: Record<string, PublisherSource> = {
  // ── Institucionales & Archivos Públicos (Prioridad Máxima) ────────────────
  tv_publica: {
    code: 'tv_publica',
    name: 'TV Pública Argentina',
    category: 'institutional',
    country: 'AR',
    domains: ['tvpublica.com.ar', 'www.tvpublica.com.ar'],
    searchUrlTemplate: 'https://www.tvpublica.com.ar/?s={query}',
    rssFeeds: ['https://www.tvpublica.com.ar/feed/'],
    capabilities: { htmlDiscovery: true, rss: true, videoSitemap: true, jsonLd: true },
    reputationWeight: 1.25,
  },
  canal_encuentro: {
    code: 'canal_encuentro',
    name: 'Canal Encuentro',
    category: 'educational',
    country: 'AR',
    domains: ['encuentro.gob.ar', 'www.encuentro.gob.ar', 'educ.ar'],
    searchUrlTemplate: 'http://encuentro.gob.ar/buscador?q={query}',
    rssFeeds: [],
    capabilities: { htmlDiscovery: true, rss: false, videoSitemap: true, jsonLd: true },
    reputationWeight: 1.25,
  },
  agn: {
    code: 'agn',
    name: 'Archivo General de la Nación',
    category: 'archive',
    country: 'AR',
    domains: ['argentina.gob.ar', 'www.argentina.gob.ar'],
    searchUrlTemplate: 'https://www.argentina.gob.ar/interior/archivo-general?q={query}',
    rssFeeds: [],
    capabilities: { htmlDiscovery: true, rss: false, videoSitemap: false, jsonLd: true },
    reputationWeight: 1.30,
  },
  biblioteca_nacional: {
    code: 'biblioteca_nacional',
    name: 'Biblioteca Nacional Mariano Moreno',
    category: 'archive',
    country: 'AR',
    domains: ['bn.gov.ar', 'www.bn.gov.ar'],
    searchUrlTemplate: 'https://www.bn.gov.ar/buscar?q={query}',
    rssFeeds: [],
    capabilities: { htmlDiscovery: true, rss: false, videoSitemap: false, jsonLd: true },
    reputationWeight: 1.20,
  },

  // ── Medios Periodísticos ──────────────────────────────────────────────────
  infobae: {
    code: 'infobae',
    name: 'Infobae',
    category: 'news',
    country: 'AR',
    domains: ['infobae.com', 'www.infobae.com'],
    searchUrlTemplate: 'https://www.infobae.com/search/{query}/',
    rssFeeds: ['https://www.infobae.com/arc/outboundfeeds/rss/?outputType=xml'],
    capabilities: { htmlDiscovery: true, rss: true, videoSitemap: true, jsonLd: true },
    reputationWeight: 1.10,
  },
  la_nacion: {
    code: 'la_nacion',
    name: 'La Nación',
    category: 'news',
    country: 'AR',
    domains: ['lanacion.com.ar', 'www.lanacion.com.ar'],
    searchUrlTemplate: 'https://www.lanacion.com.ar/buscar/?query={query}',
    rssFeeds: ['https://servicios.lanacion.com.ar/herramientas/rss/origen=2'],
    capabilities: { htmlDiscovery: true, rss: true, videoSitemap: true, jsonLd: true },
    reputationWeight: 1.15,
  },
  clarin: {
    code: 'clarin',
    name: 'Clarín',
    category: 'news',
    country: 'AR',
    domains: ['clarin.com', 'www.clarin.com'],
    searchUrlTemplate: 'https://www.clarin.com/tema/{query}.html',
    rssFeeds: ['https://www.clarin.com/rss/lo-ultimo/'],
    capabilities: { htmlDiscovery: true, rss: true, videoSitemap: true, jsonLd: true },
    reputationWeight: 1.10,
  },
  pagina12: {
    code: 'pagina12',
    name: 'Página/12',
    category: 'news',
    country: 'AR',
    domains: ['pagina12.com.ar', 'www.pagina12.com.ar'],
    searchUrlTemplate: 'https://www.pagina12.com.ar/buscador?q={query}',
    rssFeeds: ['https://www.pagina12.com.ar/rss/portada'],
    capabilities: { htmlDiscovery: true, rss: true, videoSitemap: false, jsonLd: true },
    reputationWeight: 1.10,
  }
};

export function getAllowedPublisherDomains(): Set<string> {
  const allowed = new Set<string>();
  for (const publisher of Object.values(PUBLISHER_REGISTRY)) {
    for (const domain of publisher.domains) {
      allowed.add(domain.toLowerCase());
    }
  }
  return allowed;
}

export function isAllowedPublisherUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    if (parsed.protocol !== 'https:') return false;
    const hostname = parsed.hostname.toLowerCase();
    
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.') || hostname.startsWith('10.') || hostname.startsWith('172.')) {
      return false;
    }

    const allowed = getAllowedPublisherDomains();
    return allowed.has(hostname) || Array.from(allowed).some(d => hostname.endsWith(`.${d}`));
  } catch {
    return false;
  }
}
