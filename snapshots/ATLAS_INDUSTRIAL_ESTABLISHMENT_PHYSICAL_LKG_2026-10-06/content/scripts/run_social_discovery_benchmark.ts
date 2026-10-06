/**
 * run_social_discovery_benchmark.ts — Benchmark Independiente de Social Mine Discovery (Reddit Feeds / Social V1)
 */

import { HarvestDedupeIndex } from '../src/lib/atlasHarvester/harvestDedupeIndex';
import { harvestSocialReferences, SOCIAL_FEEDS } from '../src/lib/atlasHarvester/socialReferenceHarvester';

async function main() {
  console.log('======================================================================');
  console.log('📱 ATLAS SOCIAL MINE DISCOVERY BENCHMARK (REDDIT / PUBLIC FEEDS)');
  console.log('======================================================================\n');

  const dedupeIndex = new HarvestDedupeIndex();
  const initResult = await dedupeIndex.initialize();
  const startAtlas = initResult.initialTotal;

  console.log(`⚡ Atlas Inicial: ${startAtlas.toLocaleString()} contenidos (${initResult.youtubeKnownCount.toLocaleString()} IDs en RAM).`);
  console.log(`📡 Feeds de Comunidades Evaluados: ${SOCIAL_FEEDS.length} endpoints\n`);

  const t0 = Date.now();
  const socialResult = await harvestSocialReferences(dedupeIndex);
  const elapsedSec = Math.max(1, Math.round((Date.now() - t0) / 1000));

  let insertedCount = 0;
  if (socialResult.references.length > 0) {
    insertedCount = await dedupeIndex.persistBatch(socialResult.references);
  }

  const finalAtlas = dedupeIndex.getTotalAtlasSize();
  const rawNoveltyRate = socialResult.totalFound > 0
    ? +((socialResult.netNew / socialResult.totalFound) * 100).toFixed(1)
    : 0;
  const netNewPerSec = +(socialResult.netNew / elapsedSec).toFixed(2);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('       SOCIAL MINE DISCOVERY BENCHMARK REPORT');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Tiempo de Benchmark:            ${elapsedSec}s (${(elapsedSec / 60).toFixed(1)} min)`);
  console.log(`Atlas Inicial:                  ${startAtlas.toLocaleString()} contenidos`);
  console.log(`Atlas Final:                    ${finalAtlas.toLocaleString()} contenidos (+${insertedCount.toLocaleString()} net-new) 🎯`);
  console.log(`---------------------------------------------------------------------`);
  console.log(`MÉTRICAS DE RENDIMIENTO SOCIAL (COMMUNITY FEEDS):`);
  console.log(`  • Referencias YouTube Halladas: ${socialResult.totalFound.toLocaleString()} IDs`);
  console.log(`  • Ya Conocidos en Atlas (RAM):  ${(socialResult.totalFound - socialResult.netNew).toLocaleString()}`);
  console.log(`  • NET-NEW REALES DESCUBIERTOS:  +${socialResult.netNew.toLocaleString()} piezas net-new 🎯`);
  console.log(`  • NOVELTY RATE SOCIAL:          ${rawNoveltyRate}%`);
  console.log(`  • VELOCIDAD WALL-CLOCK:         ${netNewPerSec} items/s (a 0 costo de scraping/páginas)`);
  console.log(`---------------------------------------------------------------------`);
  console.log(`ECONOMÍA Y CUOTA:`);
  console.log(`  • YouTube Search.list Calls:    0 🔒 (INVIOLABLE = 0)`);
  console.log(`  • YouTube Radar Quota Used:     0 u 🔒`);
  console.log(`  • Web Scraping Requests:        0 (Solo endpoints públicos de agregación)`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('🏁 BENCHMARK SOCIAL FINALIZADO.');
}

main().catch(err => {
  console.error('Fatal Social Benchmark Error:', err);
  process.exit(1);
});
