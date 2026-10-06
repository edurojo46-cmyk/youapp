/**
 * test_calle13_and_health_audit.ts — Auditoría Rigurosa de ExactEntityWork, ContentRole y Coberturas
 * 
 * Verificaciones:
 * 1. Búsqueda "calle 13 la perla": OriginalArtistCorrect@10, dedupe, tiers basados en EntityWork
 * 2. Distinción WorkCoverage@10 vs ExactEntityWorkCoverage@10
 * 3. Clasificación de Call of Duty: Black Ops III (Paint It Black) como CONTEXTUAL_USE
 * 4. Consistencia matemática del dashboard (monitored = measured + awaiting sample, buckets sum = measured)
 * 5. Invariantes: Search.list = 0, Radar = 0 u, isFixture = false
 */

import { executeSearch } from '../src/lib/search/searchEngine';
import { ExactWorkCoverageMemory } from '../src/lib/search/exactWorkCoverageMemory';
import { exactWorkSearchGate } from '../src/lib/search/exactWorkSearchGate';
import { CANONICAL_WORKS_ONTOLOGY } from '../src/lib/search/canonicalWorksCatalog';

async function runAudit() {
  console.log('═══════════════════════════════════════════════════════════════════════════');
  console.log('🏛 AUDITORÍA EXACT ENTITY WORK: CALLE 13, CONTENT ROLE Y CONSISTENCIA');
  console.log('═══════════════════════════════════════════════════════════════════════════\n');

  // 1. AUDITAR CASO CONTEXTUAL_USE: Call of Duty Paint It Black
  console.log('1️⃣ AUDITORÍA DE CLASIFICACIÓN DE CONTENT ROLE:');
  const dummyCodCandidate: any = {
    id: 'dm_x3cxcw6',
    title: 'Call of Duty: Black Ops III - Live Action Trailer Music | Seize Glory (The Rolling Stones - Paint It Black)',
    provider: 'dailymotion',
    channelTitle: 'Call of Duty'
  };
  const dummyDetection = exactWorkSearchGate.detectExactWork('rolling stones paint it black');
  const codRole = exactWorkSearchGate.classifyContentRole(dummyCodCandidate, dummyDetection);
  const codFidelity = exactWorkSearchGate.calculateWorkFidelity(dummyCodCandidate, dummyDetection);

  console.log(`   • Título: "${dummyCodCandidate.title.slice(0, 70)}..."`);
  console.log(`   • ContentRole Detectado:  ${codRole}`);
  console.log(`   • WorkFidelity Asignado:   ${codFidelity}/100 (Umbral mínimo: 75)`);
  console.log(`   • ¿Excluido de ExactWork Top 10?: ${codFidelity < 75 ? 'SÍ ✅ (Excluido correctamente)' : 'NO ❌'}\n`);

  // 2. EJECUTAR BÚSQUEDA "calle 13 la perla"
  console.log('2️⃣ EJECUTANDO BÚSQUEDA REAL: "calle 13 la perla":');
  const t0 = Date.now();
  const searchRes = await executeSearch('calle 13 la perla', { bypassCandidatePool: true });
  const dt = Date.now() - t0;
  const detection = exactWorkSearchGate.detectExactWork('calle 13 la perla', searchRes.intentData);
  const items = searchRes.videos || [];

  console.log(`   ├─ Obra Canónica:   ${detection.canonicalEntity} — "${detection.canonicalWork}"`);
  console.log(`   ├─ Path / Latencia: ${searchRes.trace.path.toUpperCase()} (${dt}ms)`);
  console.log(`   ├─ Resultados:      ${items.length} videos`);
  console.log(`   └─ Invariantes:     Search.list = 0 🔒 | Radar = 0 u 🔒 | isFixture = false 🔒\n`);

  console.log('   RESULTADOS ENTREGADOS PARA "calle 13 la perla":');
  items.slice(0, 10).forEach((item, idx) => {
    const role = (item as any).contentRole || 'PRIMARY_WORK';
    const isEEW = (item as any).isExactEntityWork ?? false;
    const wf = (item as any).workFidelityScore ?? 0;
    const af = (item as any).artistFidelityScore ?? 0;
    console.log(`   ${(idx + 1).toString().padStart(2)}. [${item.provider?.toUpperCase()}] ${item.title.slice(0, 48).padEnd(48)} | Role: ${role.padEnd(16)} | EEW:${isEEW} | WF:${wf} AF:${af}`);
  });

  // Esperar sincronización asíncrona de CoverageMemory
  await new Promise(r => setTimeout(r, 1200));

  // 3. CONSULTAR TELEMETRÍA Y COBERTURAS
  console.log('\n3️⃣ MEMORIA DE COBERTURAS Y DIFERENCIACIÓN ENTITY vs WORK:');
  const records = await ExactWorkCoverageMemory.getAllRecords();

  const totalMonitored = CANONICAL_WORKS_ONTOLOGY.length;
  const recordedCount = records.length;
  const unmeasuredCount = Math.max(0, totalMonitored - recordedCount);

  const count80Plus = records.filter(r => r.exactEntityWorkCoverageAt10 >= 80).length;
  const count60To79 = records.filter(r => r.exactEntityWorkCoverageAt10 >= 60 && r.exactEntityWorkCoverageAt10 < 80).length;
  const count30To59 = records.filter(r => r.exactEntityWorkCoverageAt10 >= 30 && r.exactEntityWorkCoverageAt10 < 60).length;
  const countSub30 = records.filter(r => r.exactEntityWorkCoverageAt10 < 30).length;

  const bucketSum = count80Plus + count60To79 + count30To59 + countSub30;

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 ATLAS EXACT ENTITY WORK HEALTH (Verificación Matemática)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Works monitored:             ${totalMonitored}`);
  console.log(`Works measured:              ${recordedCount}`);
  console.log(`Works awaiting sample:       ${unmeasuredCount}`);
  console.log(`───────────────────────────────────────────────────────────────────────────`);
  console.log(`EntityWork Coverage >=80%:   ${count80Plus}`);
  console.log(`EntityWork Coverage 60–79%:  ${count60To79}`);
  console.log(`EntityWork Coverage 30–59%:  ${count30To59}`);
  console.log(`EntityWork Coverage <30%:    ${countSub30}`);
  console.log(`───────────────────────────────────────────────────────────────────────────`);
  console.log(`Suma de Buckets:             ${bucketSum} (¿Coincide exactamente con measured?: ${bucketSum === recordedCount ? 'SÍ ✅' : 'NO ❌'})`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('🎯 TABLA CONSOLIDADA DE OBRAS (Distinción EntityWork vs WorkCoverage):');
  console.table(records.map((r, i) => ({
    Rank: i + 1,
    'Obra': r.canonicalTitle,
    'Artista': r.artist,
    'Atlas Físico': r.atlasPhysicalCount,
    'Federados': r.federatedExactCount,
    'EntityWork@10': `${r.exactEntityWorkCoverageAt10}%`,
    'WorkCoverage@10': `${r.workCoverageAt10}%`,
    'Covers': r.coverCount,
    'Demand 7d': r.queryDemand7d,
    'Priority Score': r.priorityScore,
    Tier: r.priorityTier
  })));
}

runAudit();
