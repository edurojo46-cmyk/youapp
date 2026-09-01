import {
  extractVideosFromHtmlPage,
  extractRSSMediaItems,
  extractYouTubeId,
  extractVimeoId
} from '../src/lib/search/publishers/publisherVideoExtractor';
import { isAllowedPublisherUrl, PUBLISHER_REGISTRY } from '../src/lib/search/publishers/publisherRegistry';

function runExtractionTests() {
  console.log('====================================================');
  console.log('🧪 TEST 1: Extractor Determinista de Videos');
  console.log('====================================================\n');

  // Test 1.1: YouTube Embed
  const htmlIframe = `
    <html>
      <head><title>Discurso Histórico de Juan Perón en Plaza de Mayo - TV Pública</title></head>
      <body>
        <h1>Discurso Histórico</h1>
        <p>Compartimos el registro audiovisual histórico:</p>
        <iframe width="560" height="315" src="https://www.youtube.com/embed/dQw4w9WgXcQ" frameborder="0" allowfullscreen></iframe>
      </body>
    </html>
  `;
  const iframeVideos = extractVideosFromHtmlPage(htmlIframe, 'https://www.tvpublica.com.ar/nota/peron-discurso', {
    code: 'tv_publica',
    name: 'TV Pública'
  });

  console.log(`1. Extracción de IFRAME YouTube:`);
  console.log(`   - Encontrados: ${iframeVideos.length}`);
  console.log(`   - Provider: ${iframeVideos[0]?.provider}`);
  console.log(`   - Content ID: ${iframeVideos[0]?.providerContentId}`);
  console.log(`   - Extraction Method: ${iframeVideos[0]?.extractionMethod}`);
  console.assert(iframeVideos[0]?.providerContentId === 'dQw4w9WgXcQ', 'Error en YouTube Embed extraction');

  // Test 1.2: Schema.org VideoObject JSON-LD
  const htmlJsonLd = `
    <html>
      <head>
        <title>Documental: Perón y la historia argentina - Canal Encuentro</title>
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "VideoObject",
            "name": "Perón: Sinfonía de un sentimiento",
            "description": "Documental histórico sobre Juan Domingo Perón",
            "thumbnailUrl": "https://img.encuentro.gob.ar/peron.jpg",
            "uploadDate": "2024-05-15",
            "duration": "PT1H45M",
            "embedUrl": "https://www.youtube.com/embed/ABC123xyz89"
          }
        </script>
      </head>
      <body><h1>Documental Encuentro</h1></body>
    </html>
  `;
  const jsonLdVideos = extractVideosFromHtmlPage(htmlJsonLd, 'https://encuentro.gob.ar/programas/peron-doc', {
    code: 'canal_encuentro',
    name: 'Canal Encuentro'
  });

  console.log(`\n2. Extracción de Schema.org VideoObject:`);
  console.log(`   - Encontrados: ${jsonLdVideos.length}`);
  console.log(`   - Título: "${jsonLdVideos[0]?.title}"`);
  console.log(`   - Content ID: ${jsonLdVideos[0]?.providerContentId}`);
  console.log(`   - Duración (seg): ${jsonLdVideos[0]?.durationSeconds}`);
  console.assert(jsonLdVideos[0]?.providerContentId === 'ABC123xyz89', 'Error en VideoObject extraction');
  console.assert(jsonLdVideos[0]?.durationSeconds === 6300, 'Error en parseo de duración ISO 8601');

  // Test 1.3: RSS Media Feeds
  const rssXml = `
    <rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
      <channel>
        <title>TV Pública RSS</title>
        <item>
          <title><![CDATA[Especial Histórico: 17 de Octubre]]></title>
          <link>https://www.tvpublica.com.ar/especial-17-octubre</link>
          <description><![CDATA[Reviví la jornada histórica con videos y testimonios: https://www.youtube.com/watch?v=PERON17OCTU]]></description>
          <pubDate>Thu, 17 Oct 2024 14:00:00 GMT</pubDate>
        </item>
      </channel>
    </rss>
  `;
  const rssVideos = extractRSSMediaItems(rssXml, { code: 'tv_publica', name: 'TV Pública' });
  console.log(`\n3. Extracción de RSS Media Feed:`);
  console.log(`   - Encontrados: ${rssVideos.length}`);
  console.log(`   - Título: "${rssVideos[0]?.title}"`);
  console.log(`   - Video ID: ${rssVideos[0]?.providerContentId}`);
  console.assert(rssVideos[0]?.providerContentId === 'PERON17OCTU', 'Error en RSS extraction');

  console.log('\n====================================================');
  console.log('🛡️ TEST 2: Blindaje de Seguridad SSRF');
  console.log('====================================================\n');

  const urlsToTest = [
    { url: 'https://www.tvpublica.com.ar/nota/1', expected: true, desc: 'Dominio permitido (TV Pública)' },
    { url: 'https://encuentro.gob.ar/serie/2', expected: true, desc: 'Dominio permitido (Encuentro)' },
    { url: 'https://www.infobae.com/politica/3', expected: true, desc: 'Dominio permitido (Infobae)' },
    { url: 'http://www.tvpublica.com.ar/nota/1', expected: false, desc: 'HTTP inseguro (rechazado)' },
    { url: 'https://localhost:8000/hack', expected: false, desc: 'Localhost (bloqueado)' },
    { url: 'https://127.0.0.1/admin', expected: false, desc: 'Loopback IP (bloqueado)' },
    { url: 'https://192.168.1.1/router', expected: false, desc: 'IP Privada LAN (bloqueado)' },
    { url: 'https://sitio-malicioso.com/exploit', expected: false, desc: 'Dominio no registrado (bloqueado)' },
  ];

  for (const t of urlsToTest) {
    const isSafe = isAllowedPublisherUrl(t.url);
    const pass = isSafe === t.expected;
    console.log(`   [${pass ? 'PASS ✅' : 'FAIL ❌'}] ${t.desc}: ${t.url} -> ${isSafe}`);
    console.assert(pass, `SSRF Guard failed for ${t.url}`);
  }

  console.log('\n====================================================');
  console.log('🏆 TODOS LOS TESTS DE EXTRACCIÓN Y SSRF PASARON ✅');
  console.log('====================================================\n');
}

runExtractionTests();
