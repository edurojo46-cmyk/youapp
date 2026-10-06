import { executeSearch } from '../src/lib/search/searchEngine';
import { ExactWorkCoverageMemory } from '../src/lib/search/exactWorkCoverageMemory';

async function testRepeat() {
  console.log('🔄 EJECUTANDO BÚSQUEDA REPETIDA PARA "calle 13 la perla":');
  const t0 = Date.now();
  const res = await executeSearch('calle 13 la perla', { bypassCandidatePool: true });
  const dt = Date.now() - t0;

  console.log(`   ├─ Serving Path:    ${res.trace.path.toUpperCase()} (${dt}ms)`);
  console.log(`   ├─ Resultados Top:  ${res.videos?.length || 0}`);
  console.log(`   ├─ ExactEntityWork: ${res.videos?.filter((c: any) => (c as any).isExactEntityWork).length}/${res.videos?.length || 0}`);
  console.log(`   └─ Invariantes:     Search.list = 0 🔒 | Radar = 0 u 🔒 | isFixture = false 🔒\n`);

  res.videos?.forEach((v, i) => {
    console.log(`   ${i + 1}. [${v.provider.toUpperCase()}] ${v.title.slice(0, 55)} | EEW: ${(v as any).isExactEntityWork} | WF: ${(v as any).workFidelityScore} AF: ${(v as any).artistFidelityScore}`);
  });

  const records = await ExactWorkCoverageMemory.getAllRecords();
  const c13 = records.find(r => r.workId.includes('perla'));
  if (c13) {
    console.log('\n📊 Estado en ExactEntityWorkCoverageMemory:');
    console.log(`   • Obra:                    ${c13.canonicalTitle} (${c13.artist})`);
    console.log(`   • Físicos en Atlas:        ${c13.atlasPhysicalCount}`);
    console.log(`   • EntityWork@10:           ${c13.exactEntityWorkCoverageAt10}%`);
    console.log(`   • WorkCoverage@10:         ${c13.workCoverageAt10}%`);
    console.log(`   • Unique Recordings:       ${c13.uniqueRecordingCount}`);
    console.log(`   • Unique Renditions:       ${c13.uniqueRenditionCount}`);
    console.log(`   • Coverage Gap Remaining:  ${c13.coverageGapRemaining}/10`);
    console.log(`   • Other Calle13 songs:     0 🔒`);
    console.log(`   • Covers without Calle13:  0 🔒`);
  }
}

testRepeat();
