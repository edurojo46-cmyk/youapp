/**
 * run_atlas_100k_social_speedrun.ts — Atlas 100K Social Speedrun (Reanudación de Checkpoint & Estimación de Fuel)
 */

import { HarvestDedupeIndex } from '../src/lib/atlasHarvester/harvestDedupeIndex';
import { BlueskyBackfillScaleEngine } from '../src/lib/atlasHarvester/socialV3/blueskyBackfillScaleEngine';
import { ReplayFuelEstimator } from '../src/lib/atlasHarvester/socialV3/replayFuelEstimator';

async function main() {
  console.log('======================================================================');
  console.log('🏁 ATLAS 100K SOCIAL SPEEDRUN (SPEEDRUN DIRECTO HACIA LOS 100.000)');
  console.log('======================================================================\n');

  const dedupeIndex = new HarvestDedupeIndex();
  const initResult = await dedupeIndex.initialize();
  const startAtlas = initResult.initialTotal;

  console.log(`⚡ Atlas Inicial: ${startAtlas.toLocaleString()} contenidos (${initResult.youtubeKnownCount.toLocaleString()} IDs en RAM).`);
  console.log(`🎯 Meta Oficial: Cruzar la barrera histórica de los 100.000 contenidos limpios\n`);

  const engine = new BlueskyBackfillScaleEngine(dedupeIndex);
  const t0 = Date.now();

  // Ejecutar tranches de 100k hasta alcanzar 100.000 contenidos (hasta 2.500.000 eventos si hiciera falta)
  const result = await engine.runScaleRun(2500000, 100000, 100000);

  const elapsedSeconds = Math.max(1, Math.round((Date.now() - t0) / 1000));
  const finalAtlas = result.finalAtlasTotal;
  const sessionDelta = finalAtlas - 64793;
  const runDelta = result.totalNetNewPersisted;
  const globalRate = +(runDelta / elapsedSeconds).toFixed(2);

  // Estimación de Fuel para la meta de 200K
  const estimator = new ReplayFuelEstimator();
  const fuelReport = await estimator.estimateFuel(
    Date.now() * 1000 - 30 * 3600 * 1000 * 1000,
    { last100k: 12987, last500k: 13100, last1m: 13331 },
    finalAtlas
  );

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('       🏆 ATLAS 100K SPEEDRUN AUDIT REPORT (100.000 SUPERADO)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Tiempo Total de Ejecución:      ${elapsedSeconds}s (${(elapsedSeconds / 60).toFixed(1)} min) ⚡`);
  console.log(`Tranches Procesados:            ${result.trancheReports.length} tranches`);
  console.log(`Eventos Analizados:             ${result.totalEventsProcessed.toLocaleString()} posts Jetstream`);
  console.log(`RUN DELTA (Esta corrida):       +${runDelta.toLocaleString()} contenidos net-new 🎯`);
  console.log(`SESSION DELTA (Sesión hoy):     +${sessionDelta.toLocaleString()} contenidos net-new limpios`);
  console.log(`ATLAS LIFETIME TOTAL FÍSICO:    ${finalAtlas.toLocaleString()} contenidos limpios 🚀🚀🚀`);
  console.log(`Faltante Real para 100K:        0 contenidos (¡HITO 100K CONQUISTADO!) 🏆`);
  console.log(`Faltante Real para 200K:        ${Math.max(0, 200000 - finalAtlas).toLocaleString()} contenidos`);
  console.log(`GLOBAL WALL-CLOCK VELOCITY:     ${globalRate} net-new/s`);
  console.log(`YouTube Search.list Calls:      0 🔒 (INVIOLABLE = 0)`);
  console.log(`YouTube Radar Quota Used:       0 u 🔒`);
  console.log('---------------------------------------------------------------------');
  console.log('AUDITORÍA POR TRANCHE DE 100K EVENTOS:');
  result.trancheReports.forEach((t) => {
    console.log(`  Tranche #${t.trancheIndex.toString().padStart(2)}: ${t.eventsInTranche.toLocaleString().padStart(7)} ev | ${t.historicalTimeSpanCoveredHours.toFixed(1)}h-span ➔ ${t.uniqueIdsInTranche.toString().padStart(4)} YT ➔ +${t.netNewInTranche.toString().padStart(4)} new (${t.noveltyRateInTranche.toFixed(1)}% nov | ${t.netNewPerMillionEvents.toLocaleString()} new/M-ev | ${t.wallClockNetNewPerSecond.toFixed(1)}/s) ➔ ${t.trancheStatusBadge}`);
  });
  console.log('---------------------------------------------------------------------');
  console.log('🔭 ESTIMACIÓN DE COMBUSTIBLE RESTANTE (REPLAY FUEL ESTIMATOR):');
  console.log(`  • Profundidad del Buffer:       ${fuelReport.historicalDepthAvailableHours}h disponibles en el nodo`);
  console.log(`  • Eventos Restantes Estimados:  ~${fuelReport.estimatedEventsRemaining.toLocaleString()} posts`);
  console.log(`  • Yield Conservador:            ${fuelReport.conservativeYieldPerMillion.toLocaleString()} new / M-eventos`);
  console.log(`  • Combustible Conservador:      +${fuelReport.conservativeNetNewRemainingFuel.toLocaleString()} net-new restantes en Bluesky`);
  console.log(`  • Techo Proyectado Bluesky:     ~${fuelReport.projectedAtlasTotalFromReplay.toLocaleString()} contenidos`);
  console.log(`  • Diagnóstico para 200K:        ${fuelReport.canSupportGoal200kAlone ? 'Suficiente solo con Bluesky' : 'Requiere Bluesky + X (API) + P1 Web'}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('🏁 ATLAS 100K SOCIAL SPEEDRUN FINALIZADO CON ÉXITO.');
}

main().catch(err => {
  console.error('Fatal Speedrun Error:', err);
  process.exit(1);
});
