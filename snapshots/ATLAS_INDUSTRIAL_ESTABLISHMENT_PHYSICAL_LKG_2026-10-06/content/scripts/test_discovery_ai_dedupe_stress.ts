/**
 * test_discovery_ai_dedupe_stress.ts — Stress Test de Deduplicación de Misiones (10.000 Enqueues Idénticos)
 */

import { analyzeAtlasGap } from '../src/lib/atlasDiscoveryAI/atlasGapAnalyzer';
import { enqueueDiscoveryMission, createDiscoveryKey, getQueueStats, resetQueueStats, setSharedDedupeIndex } from '../src/lib/atlasDiscoveryAI/discoveryMissionQueue';
import { HarvestDedupeIndex } from '../src/lib/atlasHarvester/harvestDedupeIndex';

async function main() {
  console.log('======================================================================');
  console.log('🛡️ STRESS TEST: DEDUPLICACIÓN DE MISIONES DISCOVERY (10.000 ENQUEUES)');
  console.log('======================================================================\n');

  const dedupeIndex = new HarvestDedupeIndex();
  await dedupeIndex.initialize();
  setSharedDedupeIndex(dedupeIndex);

  const testQuery = 'Spinetta entrevista Badia 1987';
  const gapRequest = analyzeAtlasGap({
    query: testQuery,
    atlasResultCount: 2,
    qualityQualifiedCount: 2,
    relevanceQualifiedCount: 2,
    coverageScore: 0.25,
    qualityScore: 0.8,
    entities: ['Luis Alberto Spinetta', 'Juan Alberto Badía']
  });

  const key = createDiscoveryKey(gapRequest);
  console.log(`🔑 Clave de Descubrimiento Generada: "${key}"`);
  console.log('🚀 Disparando 10.000 llamadas concurrentes a enqueueDiscoveryMission()...\n');

  resetQueueStats();
  const t0 = Date.now();
  const enqueueCalls = 10000;
  const promises: Promise<void>[] = [];

  for (let i = 0; i < enqueueCalls; i++) {
    promises.push(enqueueDiscoveryMission(gapRequest));
  }

  await Promise.all(promises);
  const enqueueTimeMs = Date.now() - t0;

  // Esperar a que la cola complete la única misión real
  await new Promise(r => setTimeout(r, 4000));

  const stats = getQueueStats();

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('       STRESS TEST RESULTADOS DE DEDUPLICACIÓN');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Total Peticiones Enqueue:       ${stats.totalEnqueueCalls.toLocaleString()} llamadas`);
  console.log(`Tiempo de Enqueue en RAM:       ${enqueueTimeMs} ms (${(enqueueTimeMs / stats.totalEnqueueCalls).toFixed(4)} ms/llamada)`);
  console.log(`Misiones Creadas / En Cola:     ${stats.totalMissionsCreated} misión única ✅ (Esperado: 1)`);
  console.log(`Peticiones Reutilizadas / Dedup: ${stats.totalMissionsDeduplicated.toLocaleString()} llamadas (${((stats.totalMissionsDeduplicated / stats.totalEnqueueCalls) * 100).toFixed(2)}% ahorro) 🛡️`);
  console.log(`Llamadas Reales a Gemini:       ${stats.totalMissionsCreated} llamada`);
  console.log(`Ahorro de Costo Gemini:         $${(stats.totalMissionsDeduplicated * 0.0004).toFixed(2)} USD ahorrados`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (stats.totalMissionsCreated === 1 && stats.totalMissionsDeduplicated === enqueueCalls - 1) {
    console.log('✅ ASSERTION PASSED: Exactamente 1 misión creada y 9.999 misiones deduplicadas.');
  } else {
    console.error('❌ ASSERTION FAILED: Deduplicación no alcanzó el 100% esperado.');
    process.exit(1);
  }

  console.log('🏁 STRESS TEST DE DEDUPLICACIÓN COMPLETADO CON ÉXITO.');
}

main().catch(console.error);
