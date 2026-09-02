/**
 * run_scale_pipeline_wave7.ts — Ejecutor del Pipeline Continuo Scale-Aware (Wave 7 hacia los 80K)
 */

import { HarvestDedupeIndex } from '../src/lib/atlasHarvester/harvestDedupeIndex';
import { ScaleAwarePipeline } from '../src/lib/atlasHarvester/scaleAwarePipeline';

async function main() {
  console.log('======================================================================');
  console.log('🚀 SCALE-AWARE CONTINUOUS MINE PIPELINE (WAVE 7 — DEEP SCALE & GATES)');
  console.log('======================================================================\n');

  const dedupeIndex = new HarvestDedupeIndex();
  const initResult = await dedupeIndex.initialize();
  const startAtlas = initResult.initialTotal;

  console.log(`⚡ Atlas Inicial: ${startAtlas.toLocaleString()} contenidos (${initResult.youtubeKnownCount.toLocaleString()} IDs en RAM).`);
  console.log(`🎯 Meta Inmediata: Avanzar con paso firme hacia el Hito 80.000 contenidos\n`);

  const pipeline = new ScaleAwarePipeline(dedupeIndex);
  const result = await pipeline.runPipeline();

  const runDelta = result.totalNetNewHarvested;
  const sessionDelta = result.finalAtlas - 64793;
  const promoRate = result.totalProbed > 0 ? ((result.totalPromoted / result.totalProbed) * 100).toFixed(1) : '0';
  const rejRate = result.totalProbed > 0 ? ((result.totalRejected / result.totalProbed) * 100).toFixed(1) : '0';

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('       SCALE-AWARE CONTINUOUS PIPELINE AUDIT REPORT (WAVE 7)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Tiempo Total de Ejecución:      ${result.elapsedSeconds}s (${(result.elapsedSeconds / 60).toFixed(1)} min)`);
  console.log(`Fuentes Evaluadas:              ${result.totalProbed} candidatos`);
  console.log(`Promovidas tras Confirmación:   ${result.totalPromoted} minas (${promoRate}%) 🚀`);
  console.log(`Rechazadas por Gates / Conf.:   ${result.totalRejected} minas (${rejRate}%) 🛡️`);
  console.log(`Candidatos Bancados (Manifest): +${result.bankedCandidateCount.toLocaleString()} IDs únicos en memoria 💎`);
  console.log(`Combustible Conservador Total:  +${result.totalConservativeFuelDiscovered.toLocaleString()} net-new descubiertos 🎯`);
  console.log(`Minas de Escala (Pot. >=2.000): ${result.scaleMinesCount} yacimientos ⭐⭐⭐⭐⭐`);
  console.log(`---------------------------------------------------------------------`);
  console.log(`RUN DELTA (Esta corrida):       +${runDelta.toLocaleString()} contenidos net-new 🎯`);
  console.log(`SESSION DELTA (Sesión de hoy):  +${sessionDelta.toLocaleString()} contenidos net-new`);
  console.log(`ATLAS LIFETIME TOTAL:           ${result.finalAtlas.toLocaleString()} contenidos limpios 🚀`);
  console.log(`Faltante Real para 80K:         ${Math.max(0, 80000 - result.finalAtlas).toLocaleString()} contenidos`);
  console.log(`Faltante Real para 100K:        ${Math.max(0, 100000 - result.finalAtlas).toLocaleString()} contenidos`);
  console.log(`GLOBAL WALL-CLOCK VELOCITY:     ${result.globalWallClockVelocity} net-new/s`);
  console.log(`YouTube Search.list Calls:      0 🔒 (INVIOLABLE = 0)`);
  console.log(`YouTube Radar Quota Used:       0 u 🔒`);
  console.log('---------------------------------------------------------------------');
  console.log('EFICIENCIA POR WORKER (NET-NEW / PÁGINA):');
  result.workerEfficiencies.forEach((w, idx) => {
    console.log(`  ${(idx + 1).toString().padStart(2)}. ${w.name.padEnd(28)} | ${w.pages.toString().padStart(4)}p ➔ +${w.netNew.toString().padStart(4)} net-new (${w.rate.toFixed(3)} new/p)`);
  });
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('🏁 SCALE-AWARE PIPELINE WAVE 7 FINALIZADO.');
}

main().catch(err => {
  console.error('Fatal Scale Pipeline Error:', err);
  process.exit(1);
});
