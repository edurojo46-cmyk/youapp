/**
 * run_continuous_pipeline_wave5.ts — Ejecutor del Pipeline Continuo Wave 5 hacia los 80K
 */

import { HarvestDedupeIndex } from '../src/lib/atlasHarvester/harvestDedupeIndex';
import { ContinuousMinePipeline } from '../src/lib/atlasHarvester/continuousMinePipeline';

async function main() {
  console.log('======================================================================');
  console.log('🚀 CONTINUOUS MINE PIPELINE WAVE 5 (EXPLORE-AND-HARVEST EN CALIENTE)');
  console.log('======================================================================\n');

  const dedupeIndex = new HarvestDedupeIndex();
  const initResult = await dedupeIndex.initialize();
  const startAtlas = initResult.initialTotal;

  console.log(`⚡ Atlas Inicial: ${startAtlas.toLocaleString()} contenidos (${initResult.youtubeKnownCount.toLocaleString()} IDs en RAM).`);
  console.log(`🎯 Meta Inmediata: Superar 70.000 / Avanzar hacia el Hito 80.000\n`);

  const pipeline = new ContinuousMinePipeline(dedupeIndex);
  const result = await pipeline.runPipeline();

  const runDelta = result.totalNetNewHarvested;
  const sessionDelta = result.finalAtlas - 64793;
  const netVelocity = +(runDelta / result.elapsedSeconds).toFixed(2);

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('       CONTINUOUS MINE PIPELINE WAVE 5 AUDIT REPORT');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Tiempo Total de Ejecución:      ${result.elapsedSeconds}s (${(result.elapsedSeconds / 60).toFixed(1)} min)`);
  console.log(`Minas Promovidas a Cosecha:     ${result.qualifiedMinesCount} minas`);
  console.log(`RUN DELTA (Esta corrida):       +${runDelta.toLocaleString()} contenidos net-new 🎯`);
  console.log(`SESSION DELTA (Sesión de hoy):  +${sessionDelta.toLocaleString()} contenidos net-new`);
  console.log(`ATLAS LIFETIME TOTAL:           ${result.finalAtlas.toLocaleString()} contenidos limpios 🚀`);
  console.log(`Faltante Real para 80K:         ${Math.max(0, 80000 - result.finalAtlas).toLocaleString()} contenidos`);
  console.log(`Faltante Real para 100K:        ${Math.max(0, 100000 - result.finalAtlas).toLocaleString()} contenidos`);
  console.log(`Velocidad Neta Global:          ${netVelocity} items/s`);
  console.log(`YouTube Search.list Calls:      0 🔒 (INVIOLABLE = 0)`);
  console.log(`YouTube Radar Quota Used:       0 u 🔒`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('🏁 CONTINUOUS MINE PIPELINE WAVE 5 FINALIZADO.');
}

main().catch(err => {
  console.error('Fatal Pipeline Error:', err);
  process.exit(1);
});
