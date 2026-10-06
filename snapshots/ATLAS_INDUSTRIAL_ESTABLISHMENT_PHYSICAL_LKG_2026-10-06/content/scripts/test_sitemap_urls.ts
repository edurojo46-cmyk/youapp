/**
 * test_sitemap_urls.ts — Verificador Rápido de Sitemaps y Feeds Activos
 */

const TEST_URLS = [
  { name: 'Jenesaispop', url: 'https://jenesaispop.com/sitemap_index.xml' },
  { name: 'Billboard', url: 'https://www.billboard.com/sitemap_index.xml' },
  { name: 'Rolling Stone', url: 'https://www.rollingstone.com/sitemap_index.xml' },
  { name: 'Pitchfork', url: 'https://pitchfork.com/sitemap.xml' },
  { name: 'Stereogum', url: 'https://www.stereogum.com/sitemap.xml' },
  { name: 'Mondo Sonoro', url: 'https://www.mondosonoro.com/sitemap_index.xml' },
  { name: 'NME', url: 'https://www.nme.com/sitemap.xml' },
  { name: 'El País', url: 'https://elpais.com/sitemaps/sitemap_index.xml' },
  { name: 'La Nación AR', url: 'https://www.lanacion.com.ar/arc/outboundfeeds/sitemap-index/?outputType=xml' },
  { name: 'Clarín AR', url: 'https://www.clarin.com/sitemap/sitemap-index.xml' },
  { name: 'Infobae', url: 'https://www.infobae.com/arc/outboundfeeds/sitemap-index/?outputType=xml' },
  { name: 'Perfil AR', url: 'https://www.perfil.com/sitemap.xml' },
  { name: 'Página 12', url: 'https://www.pagina12.com.ar/sitemaps/sitemap-index.xml' },
  { name: 'RTVE', url: 'https://www.rtve.es/sitemaps/sitemap-index.xml' },
  { name: 'France24 ES', url: 'https://www.france24.com/es/sitemap_index.xml' },
  { name: 'DW Español', url: 'https://rss.dw.com/xml/rss-sp-cultura' },
  { name: 'TED Talks', url: 'https://feeds.feedburner.com/tedtalks_video' },
  { name: 'NPR Music', url: 'https://feeds.npr.org/1039/rss.xml' },
  { name: 'KEXP Podcast', url: 'https://kexp.org/podcasts/live-on-kexp/feed/' },
  { name: 'The Verge', url: 'https://www.theverge.com/sitemaps' },
  { name: 'Wired', url: 'https://www.wired.com/sitemap.xml' },
  { name: 'Ars Technica', url: 'https://arstechnica.com/sitemap.xml' },
  { name: 'Reddit ListenToThis', url: 'https://www.reddit.com/r/listentothis/top.json?t=month&limit=50' },
  { name: 'Reddit FullConcerts', url: 'https://www.reddit.com/r/FullConcerts/top.json?t=all&limit=50' },
  { name: 'Reddit Documentaries', url: 'https://www.reddit.com/r/Documentaries/top.json?t=year&limit=50' }
];

async function run() {
  console.log('Testing live sitemap & feed URLs...\n');
  for (const item of TEST_URLS) {
    try {
      const res = await fetch(item.url, {
        signal: AbortSignal.timeout(5000),
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          'Accept': '*/*'
        }
      });
      console.log(`[${res.status === 200 ? '✅ 200' : '❌ ' + res.status}] ${item.name.padEnd(24)} : ${item.url}`);
    } catch (err: any) {
      console.log(`[❌ ERR] ${item.name.padEnd(24)} : ${err?.message || err}`);
    }
  }
}

run();
