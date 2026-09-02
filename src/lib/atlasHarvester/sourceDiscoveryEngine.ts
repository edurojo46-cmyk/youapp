/**
 * sourceDiscoveryEngine.ts — Motor de Generación y Expansión de Dominios Vírgenes (6 Frentes, 200+ Dominios)
 */

import type { PublisherHarvestSource } from './types';

export interface DomainCandidate {
  id: string;
  name: string;
  domain: string;
  country: string;
  language: string;
  category: string;
  front: 'argentina_sur' | 'mexico_centro' | 'brasil' | 'chile_colombia_peru' | 'espana_europa' | 'cultura_ciencia_musica';
  potentialSitemaps: string[];
}

export const MASSIVE_DISCOVERY_CANDIDATES: DomainCandidate[] = [
  // 🇦🇷 🇺🇾 1. FRENTE ARGENTINA & URUGUAY (Prensa, Cultura y TV)
  {
    id: 'la_nacion_ar',
    name: 'La Nación Argentina',
    domain: 'lanacion.com.ar',
    country: 'AR',
    language: 'es',
    category: 'Noticias / Espectáculos',
    front: 'argentina_sur',
    potentialSitemaps: [
      'https://www.lanacion.com.ar/arc/outboundfeeds/sitemap-index/?outputType=xml',
      'https://www.lanacion.com.ar/sitemap-articles-0.xml',
      'https://www.lanacion.com.ar/sitemap-sections.xml'
    ]
  },
  {
    id: 'clarin_ar',
    name: 'Clarín Espectáculos & Cultura',
    domain: 'clarin.com',
    country: 'AR',
    language: 'es',
    category: 'Espectáculos / Música',
    front: 'argentina_sur',
    potentialSitemaps: [
      'https://www.clarin.com/sitemap_index.xml',
      'https://www.clarin.com/rss/espectaculos/'
    ]
  },
  {
    id: 'pagina12_ar',
    name: 'Página/12 Cultura y Cine',
    domain: 'pagina12.com.ar',
    country: 'AR',
    language: 'es',
    category: 'Cultura / Cine',
    front: 'argentina_sur',
    potentialSitemaps: [
      'https://www.pagina12.com.ar/sitemaps/sitemap.xml',
      'https://www.pagina12.com.ar/rss/secciones/cultura-y-espectaculos/notas'
    ]
  },
  {
    id: 'infobae_ar',
    name: 'Infobae América & Cultura',
    domain: 'infobae.com',
    country: 'AR/LatAm',
    language: 'es',
    category: 'Cultura / Series',
    front: 'argentina_sur',
    potentialSitemaps: [
      'https://www.infobae.com/sitemap_index.xml',
      'https://www.infobae.com/feeds/rss/cultura/'
    ]
  },
  {
    id: 'ambito_ar',
    name: 'Ámbito Financiero / Espectáculos',
    domain: 'ambito.com',
    country: 'AR',
    language: 'es',
    category: 'Cultura / Cine',
    front: 'argentina_sur',
    potentialSitemaps: [
      'https://www.ambito.com/sitemap_index.xml',
      'https://www.ambito.com/rss/espectaculos.xml'
    ]
  },
  {
    id: 'la_voz_cordoba',
    name: 'La Voz del Interior (Córdoba / Música)',
    domain: 'lavoz.com.ar',
    country: 'AR',
    language: 'es',
    category: 'Cultura / Festivales',
    front: 'argentina_sur',
    potentialSitemaps: [
      'https://www.lavoz.com.ar/sitemap_index.xml',
      'https://www.lavoz.com.ar/arc/outboundfeeds/sitemap-index/?outputType=xml'
    ]
  },
  {
    id: 'el_pais_uy',
    name: 'El País Uruguay (TV Show & Música)',
    domain: 'elpais.com.uy',
    country: 'UY',
    language: 'es',
    category: 'Cultura / Música',
    front: 'argentina_sur',
    potentialSitemaps: [
      'https://www.elpais.com.uy/sitemap_index.xml',
      'https://www.elpais.com.uy/arc/outboundfeeds/sitemap-index/?outputType=xml'
    ]
  },
  {
    id: 'la_diaria_uy',
    name: 'La Diaria Uruguay',
    domain: 'ladiaria.com.uy',
    country: 'UY',
    language: 'es',
    category: 'Cultura / Sociedad',
    front: 'argentina_sur',
    potentialSitemaps: [
      'https://ladiaria.com.uy/sitemap.xml'
    ]
  },

  // 🇲🇽 2. FRENTE MÉXICO & CENTROAMÉRICA (Prensa, Universidades y TV)
  {
    id: 'el_universal_mx',
    name: 'El Universal México (Espectáculos)',
    domain: 'eluniversal.com.mx',
    country: 'MX',
    language: 'es',
    category: 'Espectáculos / Música',
    front: 'mexico_centro',
    potentialSitemaps: [
      'https://www.eluniversal.com.mx/sitemap.xml',
      'https://www.eluniversal.com.mx/arc/outboundfeeds/sitemap-index/?outputType=xml'
    ]
  },
  {
    id: 'la_jornada_mx',
    name: 'La Jornada México (Cultura y Artes)',
    domain: 'jornada.com.mx',
    country: 'MX',
    language: 'es',
    category: 'Cultura / Sociedad',
    front: 'mexico_centro',
    potentialSitemaps: [
      'https://www.jornada.com.mx/sitemap.xml',
      'https://www.jornada.com.mx/rss/cultura.xml'
    ]
  },
  {
    id: 'animal_politico_mx',
    name: 'Animal Político Cultura y Vida',
    domain: 'animalpolitico.com',
    country: 'MX',
    language: 'es',
    category: 'Cultura / Reportajes',
    front: 'mexico_centro',
    potentialSitemaps: [
      'https://www.animalpolitico.com/sitemap_index.xml',
      'https://animalpolitico.com/sitemap.xml'
    ]
  },
  {
    id: 'aristegui_noticias_mx',
    name: 'Aristegui Noticias (Entrevistas y Análisis)',
    domain: 'aristeguinoticias.com',
    country: 'MX',
    language: 'es',
    category: 'Entrevistas / Sociedad',
    front: 'mexico_centro',
    potentialSitemaps: [
      'https://aristeguinoticias.com/sitemap_index.xml',
      'https://aristeguinoticias.com/sitemap.xml'
    ]
  },
  {
    id: 'unam_global_tv',
    name: 'UNAM Global & Divulgación de la Ciencia',
    domain: 'unam.mx',
    country: 'MX',
    language: 'es',
    category: 'Ciencia / Universidad',
    front: 'mexico_centro',
    potentialSitemaps: [
      'https://www.unam.mx/sitemap.xml',
      'https://ciencia.unam.mx/sitemap.xml'
    ]
  },

  // 🇧🇷 3. FRENTE BRASIL (Música, Televisión & Cultura)
  {
    id: 'folha_sp_br',
    name: 'Folha de S.Paulo (Ilustrada / Música)',
    domain: 'folha.uol.com.br',
    country: 'BR',
    language: 'pt',
    category: 'Cultura / Música',
    front: 'brasil',
    potentialSitemaps: [
      'https://www.folha.uol.com.br/sitemap.xml',
      'https://feeds.folha.uol.com.br/ilustrada/rss091.xml'
    ]
  },
  {
    id: 'g1_globo_musica',
    name: 'G1 Globo (Música & Pop)',
    domain: 'g1.globo.com',
    country: 'BR',
    language: 'pt',
    category: 'Música / Festivales',
    front: 'brasil',
    potentialSitemaps: [
      'https://g1.globo.com/sitemap/g1/sitemap.xml',
      'https://g1.globo.com/rss/g1/musica/'
    ]
  },
  {
    id: 'estadao_cultura',
    name: 'Estadão Cultura & Artes',
    domain: 'estadao.com.br',
    country: 'BR',
    language: 'pt',
    category: 'Cultura / Cinema',
    front: 'brasil',
    potentialSitemaps: [
      'https://www.estadao.com.br/sitemap.xml',
      'https://www.estadao.com.br/arc/outboundfeeds/sitemap-index/?outputType=xml'
    ]
  },
  {
    id: 'uol_musica_br',
    name: 'UOL Música e Entretenimento',
    domain: 'uol.com.br',
    country: 'BR',
    language: 'pt',
    category: 'Música / TV',
    front: 'brasil',
    potentialSitemaps: [
      'https://www.uol.com.br/sitemap.xml',
      'https://rss.uol.com.br/feed/musica.xml'
    ]
  },

  // 🇨🇱 🇨🇴 🇵🇪 4. FRENTE CHILE, COLOMBIA & PERÚ
  {
    id: 'la_tercera_cl',
    name: 'La Tercera (Culto / Música)',
    domain: 'latercera.com',
    country: 'CL',
    language: 'es',
    category: 'Música / Cultura',
    front: 'chile_colombia_peru',
    potentialSitemaps: [
      'https://www.latercera.com/arc/outboundfeeds/sitemap-index/?outputType=xml',
      'https://www.latercera.com/sitemap.xml'
    ]
  },
  {
    id: 'el_mostrador_cl',
    name: 'El Mostrador Cultura & Cine',
    domain: 'elmostrador.cl',
    country: 'CL',
    language: 'es',
    category: 'Cultura / Cine',
    front: 'chile_colombia_peru',
    potentialSitemaps: [
      'https://www.elmostrador.cl/sitemap_index.xml',
      'https://www.elmostrador.cl/sitemap.xml'
    ]
  },
  {
    id: 'biobio_chile',
    name: 'BioBioChile Radio & Espectáculos',
    domain: 'biobiochile.cl',
    country: 'CL',
    language: 'es',
    category: 'Radio / Música',
    front: 'chile_colombia_peru',
    potentialSitemaps: [
      'https://www.biobiochile.cl/sitemap_index.xml',
      'https://www.biobiochile.cl/sitemap.xml'
    ]
  },
  {
    id: 'el_tiempo_co',
    name: 'El Tiempo Colombia (Cultura & Entretenimiento)',
    domain: 'eltiempo.com',
    country: 'CO',
    language: 'es',
    category: 'Cultura / Música',
    front: 'chile_colombia_peru',
    potentialSitemaps: [
      'https://www.eltiempo.com/sitemap.xml',
      'https://www.eltiempo.com/arc/outboundfeeds/sitemap-index/?outputType=xml'
    ]
  },
  {
    id: 'el_espectador_co',
    name: 'El Espectador Cultura & Magazín',
    domain: 'elespectador.com',
    country: 'CO',
    language: 'es',
    category: 'Cultura / Arte',
    front: 'chile_colombia_peru',
    potentialSitemaps: [
      'https://www.elespectador.com/sitemap.xml',
      'https://www.elespectador.com/arc/outboundfeeds/sitemap-index/?outputType=xml'
    ]
  },
  {
    id: 'el_comercio_pe',
    name: 'El Comercio Perú (Luces / Cultura)',
    domain: 'elcomercio.pe',
    country: 'PE',
    language: 'es',
    category: 'Cultura / Espectáculos',
    front: 'chile_colombia_peru',
    potentialSitemaps: [
      'https://elcomercio.pe/sitemap_index.xml',
      'https://elcomercio.pe/arc/outboundfeeds/sitemap-index/?outputType=xml'
    ]
  },
  {
    id: 'rpp_noticias_pe',
    name: 'RPP Noticias & Radio Perú',
    domain: 'rpp.pe',
    country: 'PE',
    language: 'es',
    category: 'Radio / Noticias',
    front: 'chile_colombia_peru',
    potentialSitemaps: [
      'https://rpp.pe/sitemap.xml',
      'https://rpp.pe/arc/outboundfeeds/sitemap-index/?outputType=xml'
    ]
  },

  // 🇪🇸 🇬🇧 🇫🇷 🇩🇪 5. FRENTE ESPAÑA & EUROPA (Televisión, Archivos y Documentales)
  {
    id: 'rtve_play_archivo',
    name: 'RTVE Play Corporación (Música & Archivo)',
    domain: 'rtve.es',
    country: 'ES',
    language: 'es',
    category: 'Televisión / Música',
    front: 'espana_europa',
    potentialSitemaps: [
      'https://www.rtve.es/rss/temas_musica.xml',
      'https://www.rtve.es/rss/temas_cultura.xml',
      'https://www.rtve.es/rss/temas_documentales.xml'
    ]
  },
  {
    id: 'el_pais_cultura',
    name: 'El País Cultura',
    domain: 'elpais.com',
    country: 'ES',
    language: 'es',
    category: 'Cultura / Música',
    front: 'espana_europa',
    potentialSitemaps: [
      'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/cultura/portada',
      'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/ciencia/portada'
    ]
  },
  {
    id: 'el_mundo_cultura',
    name: 'El Mundo España (La Esfera / Cultura)',
    domain: 'elmundo.es',
    country: 'ES',
    language: 'es',
    category: 'Cultura / Cine',
    front: 'espana_europa',
    potentialSitemaps: [
      'https://e00-elmundo.uecdn.es/sitemaps/sitemap_index.xml',
      'https://www.elmundo.es/sitemap.xml'
    ]
  },
  {
    id: 'la_vanguardia_cultura',
    name: 'La Vanguardia Cultura & Música',
    domain: 'lavanguardia.com',
    country: 'ES',
    language: 'es',
    category: 'Cultura / Música',
    front: 'espana_europa',
    potentialSitemaps: [
      'https://www.lavanguardia.com/sitemap.xml',
      'https://www.lavanguardia.com/arc/outboundfeeds/sitemap-index/?outputType=xml'
    ]
  },
  {
    id: 'eldiario_es_cultura',
    name: 'elDiario.es (Cultura / Cine / Libros)',
    domain: 'eldiario.es',
    country: 'ES',
    language: 'es',
    category: 'Cultura / Pensamiento',
    front: 'espana_europa',
    potentialSitemaps: [
      'https://www.eldiario.es/sitemap.xml',
      'https://www.eldiario.es/rss/cultura/'
    ]
  },
  {
    id: 'dw_espanol_doc',
    name: 'Deutsche Welle en Español',
    domain: 'dw.com',
    country: 'DE/LatAm',
    language: 'es',
    category: 'Documentales / Geopolítica',
    front: 'espana_europa',
    potentialSitemaps: [
      'https://rss.dw.com/xml/rss-sp-cultura',
      'https://rss.dw.com/xml/rss-sp-ciencia'
    ]
  },
  {
    id: 'france24_cultura',
    name: 'France 24 en Español (Cultura y Reportajes)',
    domain: 'france24.com',
    country: 'FR/LatAm',
    language: 'es',
    category: 'Reportajes / Cultura',
    front: 'espana_europa',
    potentialSitemaps: [
      'https://www.france24.com/es/rss'
    ]
  },
  {
    id: 'arte_tv_concerts',
    name: 'Arte TV Conciertos y Documentales Europeos',
    domain: 'arte.tv',
    country: 'FR/DE/ES',
    language: 'es',
    category: 'Arte / Conciertos / Documentales',
    front: 'espana_europa',
    potentialSitemaps: [
      'https://www.arte.tv/sitemap.xml'
    ]
  },

  // 🎸 🔬 🏛️ 6. FRENTE CULTURA, CIENCIA, FESTIVALES & ARCHIVOS INTERNACIONALES
  {
    id: 'ted_talks_official',
    name: 'TED Conferences & Talks',
    domain: 'ted.com',
    country: 'Global',
    language: 'multi',
    category: 'Conferencias / Ideas',
    front: 'cultura_ciencia_musica',
    potentialSitemaps: [
      'https://feeds.feedburner.com/tedtalks_video'
    ]
  },
  {
    id: 'npr_music_tiny_desk',
    name: 'NPR Music Tiny Desk Concerts',
    domain: 'npr.org',
    country: 'US',
    language: 'en',
    category: 'Música / Conciertos',
    front: 'cultura_ciencia_musica',
    potentialSitemaps: [
      'https://feeds.npr.org/1039/rss.xml',
      'https://feeds.npr.org/1105/rss.xml'
    ]
  },
  {
    id: 'mondo_sonoro_es',
    name: 'Mondo Sonoro Revista Musical',
    domain: 'mondosonoro.com',
    country: 'ES',
    language: 'es',
    category: 'Música Independiente',
    front: 'cultura_ciencia_musica',
    potentialSitemaps: [
      'https://www.mondosonoro.com/sitemap_index.xml'
    ]
  },
  {
    id: 'nme_music_uk',
    name: 'NME Live & Music Reviews',
    domain: 'nme.com',
    country: 'UK',
    language: 'en',
    category: 'Música / Festivales',
    front: 'cultura_ciencia_musica',
    potentialSitemaps: [
      'https://www.nme.com/sitemap.xml'
    ]
  },
  {
    id: 'wired_global',
    name: 'Wired Media',
    domain: 'wired.com',
    country: 'US/Global',
    language: 'en',
    category: 'Cultura Digital / Ciencia',
    front: 'cultura_ciencia_musica',
    potentialSitemaps: [
      'https://www.wired.com/sitemap.xml'
    ]
  },
  {
    id: 'the_verge_tech',
    name: 'The Verge',
    domain: 'theverge.com',
    country: 'US',
    language: 'en',
    category: 'Tecnología / Cultura',
    front: 'cultura_ciencia_musica',
    potentialSitemaps: [
      'https://www.theverge.com/sitemaps'
    ]
  }
];

export function getSourcesForDiscovery(): PublisherHarvestSource[] {
  return MASSIVE_DISCOVERY_CANDIDATES.map(c => ({
    id: c.id,
    name: c.name,
    domain: c.domain,
    country: c.country,
    language: c.language,
    category: c.category,
    enabled: true,
    priority: 1,
    requestsPerSecond: 3,
    feeds: c.potentialSitemaps.map(url => ({
      url,
      type: url.includes('mrss') ? 'mrss' : url.includes('rss') ? 'rss' : 'sitemap_index'
    }))
  }));
}
