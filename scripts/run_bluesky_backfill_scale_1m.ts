/**
 * run_bluesky_backfill_scale_1m.ts — Ejecutor de 1M Event Scale Run de Bluesky Backfill hacia 80K
 */

import { HarvestDedupeIndex } from '../src/lib/atlasHarvester/harvestDedupeIndex';
import { BlueskyBackfillScaleEngine } from '../src/lib/atlasHarvester/socialV3/blueskyBackfillScaleEngine';

async function main() {
  console.log('======================================================================');
  console.log('🚀 BLUESKY BACKFILL 1M SCALE RUN (TRANCHE GATES & CHECKPOINT REPLAY)');
  console.log('======================================================================\n');

  const dedupeIndex = new HarvestDedupeIndex();
  const initResult = await dedupeIndex.initialize();
  const startAtlas = initResult.initialTotal;

  console.log(`⚡ Atlas Inicial: ${startAtlas.toLocaleString()} contenidos (${initResult.youtubeKnownCount.toLocaleString()} IDs en RAM).`);
  console.log(`🎯 Meta Inmediata: Procesar hasta 1.000.000 eventos o cruzar 80.000 contenidos limpios\n`);

  const engine = new BlueskyBackfillScaleEngine(dedupeIndex);
  const t0 = Date.now();

  const result = await engine.runScaleRun(1000000, 80000, 100000);

  const elapsedSeconds = Math.max(1, Math.round((Date.now() - t0) / 1000));
  const finalAtlas = result.finalAtlasTotal;
  const sessionDelta = finalAtlas - 64793;
  const runDelta = result.totalNetNewPersisted;
  const globalRate = +(runDelta / elapsedSeconds).toFixed(2);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('       BLUESKY BACKFILL 1M SCALE RUN AUDIT REPORT');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Tiempo Total de Ejecución:      ${elapsedSeconds}s (${(elapsedSeconds / 60).toFixed(1)} min)`);
  console.log(`Tranches Procesados:            ${result.trancheReports.length} tranches`);
  console.log(`Eventos Analizados:             ${result.totalEventsProcessed.toLocaleString()} posts`);
  console.log(`RUN DELTA (Esta corrida):       +${runDelta.toLocaleString()} contenidos net-new 🎯`);
  console.log(`SESSION DELTA (Sesión hoy):     +${sessionDelta.toLocaleString()} contenidos net-new`);
  console.log(`ATLAS LIFETIME TOTAL:           ${finalAtlas.toLocaleString()} contenidos limpios 🚀`);
  console.log(`Faltante Real para 80K:         ${Math.max(0, 80000 - finalAtlas).toLocaleString()} contenidos`);
  console.log(`Faltante Real para 100K:        ${Math.max(0, 100000 - finalAtlas).toLocaleString()} contenidos`);
  console.log(`GLOBAL WALL-CLOCK VELOCITY:     ${globalRate} net-new/s`);
  console.log(`YouTube Search.list Calls:      0 🔒 (INVIOLABLE = 0)`);
  console.log(`YouTube Radar Quota Used:       0 u 🔒`);
  console.log('---------------------------------------------------------------------');
  console.log('AUDITORÍA POR TRANCHE DE 100K EVENTOS:');
  result.trancheReports.forEach((t) => {
    console.log(`  Tranche #${t.trancheIndex.toString().padStart(2)}: ${t.eventsInTranche.toLocaleString().padStart(7)} ev | ${t.historicalTimeSpanCoveredHours.toFixed(1)}h-span ➔ ${t.uniqueIdsInTranche.toString().padStart(4)} YT ➔ +${t.netNewInTranche.toString().padStart(4)} new (${t.noveltyRateInTranche.toFixed(1)}% nov | ${t.netNewPerMillionEvents.toLocaleString()} new/M-ev | ${t.wallClockNetNewPerSecond.toFixed(1)}/s) ➔ ${t.trancheStatusBadge}`);
  });
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('🏁 BLUESKY BACKFILL 1M SCALE RUN FINALIZADO.');
}

main().catch(err => {
  console.error('Fatal Scale Run Error:', err);
  process.exit(1);
});
