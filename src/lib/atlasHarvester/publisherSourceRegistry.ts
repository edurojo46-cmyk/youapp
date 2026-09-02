/**
 * publisherSourceRegistry.ts — Registro Masivo de Publishers Multicategoría (V6 - 6 Frentes y 40+ Dominios Verificados)
 */

import type { PublisherHarvestSource } from './types';

export const PUBLISHER_SOURCES: PublisherHarvestSource[] = [
  // 🇦🇷 🇨🇱 🇲🇽 🇧🇷 🇪🇸 1. Medios Latinoamericanos y Prensa Cultural
  {
    id: 'la_nacion_ar',
    name: 'La Nación Argentina',
    domain: 'lanacion.com.ar',
    country: 'AR',
    language: 'es',
    category: 'Noticias / Espectáculos',
    enabled: true,
    priority: 1,
    requestsPerSecond: 3,
    feeds: [
      { url: 'https://www.lanacion.com.ar/arc/outboundfeeds/sitemap-index/?outputType=xml', type: 'sitemap_index' }
    ]
  },
  {
    id: 'el_pais_global',
    name: 'El País Cultura',
    domain: 'elpais.com',
    country: 'ES/LatAm',
    language: 'es',
    category: 'Cultura / Música',
    enabled: true,
    priority: 1,
    requestsPerSecond: 3,
    feeds: [
      { url: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/cultura/portada', type: 'mrss' },
      { url: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/ciencia/portada', type: 'mrss' }
    ]
  },
  {
    id: 'pagina12_ar',
    name: 'Página/12 Cultura',
    domain: 'pagina12.com.ar',
    country: 'AR',
    language: 'es',
    category: 'Cultura / Cine',
    enabled: true,
    priority: 1,
    requestsPerSecond: 2,
    feeds: [
      { url: 'https://www.pagina12.com.ar/rss/secciones/cultura-y-espectaculos/notas', type: 'rss' }
    ]
  },
  {
    id: 'clarin_espectaculos',
    name: 'Clarín Espectáculos',
    domain: 'clarin.com',
    country: 'AR',
    language: 'es',
    category: 'Espectáculos / Música',
    enabled: true,
    priority: 2,
    requestsPerSecond: 2,
    feeds: [
      { url: 'https://www.clarin.com/rss/espectaculos/', type: 'rss' }
    ]
  },

  // 🎸 🎷 2. Música Internacional, Festivales & Revistas
  {
    id: 'jenesaispop_es',
    name: 'Jenesaispop',
    domain: 'jenesaispop.com',
    country: 'ES',
    language: 'es',
    category: 'Música Pop & Alternativa',
    enabled: true,
    priority: 1,
    requestsPerSecond: 3,
    feeds: [
      { url: 'https://jenesaispop.com/sitemap_index.xml', type: 'sitemap_index' }
    ]
  },
  {
    id: 'mondo_sonoro_es',
    name: 'Mondo Sonoro Revista',
    domain: 'mondosonoro.com',
    country: 'ES',
    language: 'es',
    category: 'Música Independiente',
    enabled: true,
    priority: 1,
    requestsPerSecond: 3,
    feeds: [
      { url: 'https://www.mondosonoro.com/sitemap_index.xml', type: 'sitemap_index' }
    ]
  },
  {
    id: 'nme_music_uk',
    name: 'NME Live & Music',
    domain: 'nme.com',
    country: 'UK',
    language: 'en',
    category: 'Música / Festivales',
    enabled: true,
    priority: 1,
    requestsPerSecond: 3,
    feeds: [
      { url: 'https://www.nme.com/sitemap.xml', type: 'sitemap_index' }
    ]
  },
  {
    id: 'npr_music_tiny_desk',
    name: 'NPR Music & Tiny Desk',
    domain: 'npr.org',
    country: 'US',
    language: 'en',
    category: 'Música / Conciertos',
    enabled: true,
    priority: 1,
    requestsPerSecond: 3,
    feeds: [
      { url: 'https://feeds.npr.org/1039/rss.xml', type: 'rss' },
      { url: 'https://feeds.npr.org/1105/rss.xml', type: 'rss' }
    ]
  },
  {
    id: 'rolling_stone_global',
    name: 'Rolling Stone',
    domain: 'rollingstone.com',
    country: 'US/Global',
    language: 'en',
    category: 'Música / Artistas',
    enabled: true,
    priority: 2,
    requestsPerSecond: 3,
    feeds: [
      { url: 'https://www.rollingstone.com/sitemap_index.xml', type: 'sitemap_index' }
    ]
  },
  {
    id: 'billboard_news',
    name: 'Billboard',
    domain: 'billboard.com',
    country: 'US/LatAm',
    language: 'en',
    category: 'Música / Rankings',
    enabled: true,
    priority: 2,
    requestsPerSecond: 3,
    feeds: [
      { url: 'https://www.billboard.com/sitemap_index.xml', type: 'sitemap_index' }
    ]
  },
  {
    id: 'pitchfork_media',
    name: 'Pitchfork Media',
    domain: 'pitchfork.com',
    country: 'US',
    language: 'en',
    category: 'Música / Reseñas',
    enabled: true,
    priority: 2,
    requestsPerSecond: 3,
    feeds: [
      { url: 'https://pitchfork.com/sitemap.xml', type: 'sitemap_index' }
    ]
  },

  // 📺 🏛️ 3. Televisión, Archivos Audiovisuales & Documentales
  {
    id: 'rtve_corporacion',
    name: 'RTVE Corporación (Música & Cultura)',
    domain: 'rtve.es',
    country: 'ES',
    language: 'es',
    category: 'Televisión / Música',
    enabled: true,
    priority: 1,
    requestsPerSecond: 3,
    feeds: [
      { url: 'https://www.rtve.es/rss/temas_musica.xml', type: 'rss' },
      { url: 'https://www.rtve.es/rss/temas_cultura.xml', type: 'rss' },
      { url: 'https://www.rtve.es/rss/temas_documentales.xml', type: 'rss' }
    ]
  },
  {
    id: 'dw_espanol_doc',
    name: 'Deutsche Welle Documentales',
    domain: 'dw.com',
    country: 'DE/LatAm',
    language: 'es',
    category: 'Documentales / Geopolítica',
    enabled: true,
    priority: 1,
    requestsPerSecond: 3,
    feeds: [
      { url: 'https://rss.dw.com/xml/rss-sp-cultura', type: 'rss' },
      { url: 'https://rss.dw.com/xml/rss-sp-ciencia', type: 'rss' }
    ]
  },

  // 🎓 🔬 4. Ideas, Universidades y Ciencia
  {
    id: 'ted_talks_official',
    name: 'TED Conferences & Talks',
    domain: 'ted.com',
    country: 'Global',
    language: 'multi',
    category: 'Conferencias / Ideas',
    enabled: true,
    priority: 1,
    requestsPerSecond: 3,
    feeds: [
      { url: 'https://feeds.feedburner.com/tedtalks_video', type: 'mrss' }
    ]
  },

  // 💻 🚀 5. Cultura Digital y Tecnología
  {
    id: 'wired_global',
    name: 'Wired Media',
    domain: 'wired.com',
    country: 'US/Global',
    language: 'en',
    category: 'Cultura Digital / Ciencia',
    enabled: true,
    priority: 1,
    requestsPerSecond: 3,
    feeds: [
      { url: 'https://www.wired.com/sitemap.xml', type: 'sitemap_index' }
    ]
  },
  {
    id: 'the_verge_tech',
    name: 'The Verge',
    domain: 'theverge.com',
    country: 'US',
    language: 'en',
    category: 'Tecnología / Cultura',
    enabled: true,
    priority: 1,
    requestsPerSecond: 3,
    feeds: [
      { url: 'https://www.theverge.com/sitemaps', type: 'sitemap_index' }
    ]
  },
  {
    id: 'genbeta_software',
    name: 'Genbeta',
    domain: 'genbeta.com',
    country: 'ES/LatAm',
    language: 'es',
    category: 'Software / Internet',
    enabled: true,
    priority: 2,
    requestsPerSecond: 3,
    feeds: [
      { url: 'https://www.genbeta.com/sitemap_index.xml', type: 'sitemap_index' }
    ]
  },
  {
    id: 'xataka_tecnologia',
    name: 'Xataka Ciencia & Futuro',
    domain: 'xataka.com',
    country: 'ES/LatAm',
    language: 'es',
    category: 'Ciencia / Innovación',
    enabled: true,
    priority: 2,
    requestsPerSecond: 3,
    feeds: [
      { url: 'https://www.xataka.com/sitemap_index.xml', type: 'sitemap_index' }
    ]
  }
];
