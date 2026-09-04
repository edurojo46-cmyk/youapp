import { executeSearch } from '../src/lib/search/searchEngine';

async function run() {
  console.log("=== BÚSQUEDA 1: Correcta ===");
  const correct = await executeSearch('queen bohemian rhapsody', { bypassCandidatePool: true }) as any;
  console.log(`Candidatos: ${correct.all.length}`);
  correct.all.slice(0,3).forEach((c: any) => console.log(` - ${c.title}`));
  console.log("Trace Query:", correct.trace?.normalizedQuery);
  console.log("Trace Retrieval:", correct.trace?.retrievalQuery || 'No trace retrieval');

  console.log("\n=== BÚSQUEDA 2: Con Typos ===");
  const typo = await executeSearch('quen boemian rapsody', { bypassCandidatePool: true }) as any;
  console.log(`Candidatos: ${typo.all.length}`);
  typo.all.slice(0,3).forEach((c: any) => console.log(` - ${c.title}`));
  console.log("Trace Query:", typo.trace?.normalizedQuery);
  console.log("Trace Retrieval:", typo.trace?.retrievalQuery || 'No trace retrieval');
  
  if (correct.all.length > 0 && correct.all[0]?.id === typo.all[0]?.id) {
    console.log("\n✅ ¡ÉXITO! Ambas consultas obtienen los mismos resultados base.");
  } else {
    console.log("\n❌ DISCREPANCIA EN LOS RESULTADOS.");
  }
  process.exit(0);
}

run().catch(console.error);
