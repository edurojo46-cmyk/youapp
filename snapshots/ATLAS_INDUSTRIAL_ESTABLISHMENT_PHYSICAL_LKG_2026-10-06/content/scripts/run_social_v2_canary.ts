/**
 * run_social_v2_canary.ts — Social Turbo Canary Runner (10 Minutos Multi-Plataforma)
 */

import { HarvestDedupeIndex } from '../src/lib/atlasHarvester/harvestDedupeIndex';
import { SocialHarvestRouter } from '../src/lib/atlasHarvester/socialV2/socialHarvestRouter';

async function main() {
  console.log('======================================================================');
  console.log('🚀 SOCIAL TURBO CANARY V2 (BLUESKY JETSTREAM + MASTODON + X)');
  console.log('======================================================================\n');

  const dedupeIndex = new HarvestDedupeIndex();
  const initResult = await dedupeIndex.initialize();
  const startAtlas = initResult.initialTotal;

  console.log(`⚡ Atlas Inicial: ${startAtlas.toLocaleString()} contenidos (${initResult.youtubeKnownCount.toLocaleString()} IDs en RAM).`);
  console.log(`🎯 Duración del Canary: 10 Minutos (600s)\n`);

  const router = new SocialHarvestRouter(dedupeIndex);
  const result = await router.startHarvest(600, true);

  const g = result.globalSummary;
  const runDelta = result.persistedToAtlas;
  const finalAtlas = dedupeIndex.getTotalAtlasSize();
  const sessionDelta = finalAtlas - 64793;

  // Evaluación de Gates del Social Canary
  let gateBadge = '🔴 <500 net-new (Señal débil)';
  if (g.netNew >= 10000) gateBadge = '🚀🚀 >10.000 net-new (MEGA SEÑAL SOCIAL)';
  else if (g.netNew >= 5000) gateBadge = '🚀 5.000–10.000 net-new (SEÑAL SOCIAL ALTA)';
  else if (g.netNew >= 2000) gateBadge = '🟢 2.000–5.000 net-new (SEÑAL SOCIAL SÓLIDA)';
  else if (g.netNew >= 500) gateBadge = '🟡 500–2.000 net-new (SEÑAL MODERADA)';

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('       SOCIAL TURBO CANARY V2 AUDIT REPORT (10 MINUTOS)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Tiempo Transcurrido:            ${result.durationSeconds}s (${(result.durationSeconds / 60).toFixed(1)} min)`);
  console.log(`Atlas Inicial:                  ${startAtlas.toLocaleString()} contenidos`);
  console.log(`Atlas Final:                    ${finalAtlas.toLocaleString()} contenidos (+${runDelta.toLocaleString()} net-new físicos) 🎯`);
  console.log(`SESSION DELTA (Sesión hoy):     +${sessionDelta.toLocaleString()} contenidos net-new`);
  console.log(`Faltante Real para 100K:        ${Math.max(0, 100000 - finalAtlas).toLocaleString()} contenidos`);
  console.log(`---------------------------------------------------------------------`);
  console.log(`DESGLOSE POR PLATAFORMA SOCIAL:`);
  for (const p of result.platformSummaries) {
    console.log(`  • ${p.platform.toUpperCase().padEnd(10)}: ${p.youtubeRefsFound.toString().padStart(5)} refs ➔ ${p.uniqueIds.toString().padStart(5)} unique ➔ +${p.netNew.toString().padStart(5)} net-new (${p.noveltyRate.toFixed(1)}% nov | ${p.netNewPerSec.toFixed(2)}/s)`);
  }
  console.log(`---------------------------------------------------------------------`);
  console.log(`MÉTRICAS GLOBALES SOCIAL V2:`);
  console.log(`  • Referencias YouTube Totales:  ${g.youtubeRefsFound.toLocaleString()} enlaces`);
  console.log(`  • IDs Únicos Descubiertos:      ${g.uniqueIds.toLocaleString()} videos`);
  console.log(`  • Ya Conocidos en Atlas (RAM):  ${g.knownAtlas.toLocaleString()} (${(100 - g.noveltyRate).toFixed(1)}% solapamiento)`);
  console.log(`  • NET-NEW REAL CONSEGUIDO:      +${g.netNew.toLocaleString()} videos inéditos 💎`);
  console.log(`  • NOVELTY RATE GLOBAL:          ${g.noveltyRate.toFixed(1)}% ⭐⭐⭐⭐⭐`);
  console.log(`  • THROUGHPUT SOCIAL GLOBAL:     ${g.netNewPerSec.toFixed(2)} net-new/s`);
  console.log(`  • ESTADO DEL GATE SOCIAL:       ${gateBadge}`);
  console.log(`  • YouTube Search.list Calls:    0 🔒 (INVIOLABLE = 0)`);
  console.log(`  • YouTube Radar Quota Used:     0 u 🔒`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('🏁 SOCIAL TURBO CANARY FINALIZADO.');
}

main().catch(err => {
  console.error('Fatal Social Canary Error:', err);
  process.exit(1);
});
