import { BENCHMARK_QUERIES } from './benchmarkData';
import { executeSearch } from './src/lib/search/searchEngine';
import fs from 'fs';
import path from 'path';

async function generateFixtures() {
  console.log(`Generando fixtures para ${BENCHMARK_QUERIES.length} queries...`);
  const fixtures = [];
  
  for (const q of BENCHMARK_QUERIES) {
    console.log(`Buscando: "${q.query}"...`);
    const searchRes = await executeSearch(q.query, {
      forceExternal: true,
      routingMode: 'all' // Trae todos los providers para que el fixture contenga el universo completo
    });
    
    // Asignar relevanceJudgments basados en la relevancia calculada por el motor,
    // para congelar el estado y usarlo como ground truth en el benchmark determinista.
    const relevanceJudgments: Record<string, number> = {};
    const candidates = {};
    
    // Guardar los candidatos en el fixture para no llamar a la red en el test
    for (const item of searchRes.all) {
      candidates[item.id] = item;
      if (item.relevanceScore >= 70) {
        relevanceJudgments[item.id] = 2; // muy relevante
      } else if (item.relevanceScore >= 40) {
        relevanceJudgments[item.id] = 1; // parcial
      } else {
        relevanceJudgments[item.id] = 0; // irrelevante
      }
    }
    
    fixtures.push({
      query: q.query,
      category: q.category,
      expected: {
        intent: q.expectedIntent,
        topic: q.expectedTopic,
        format: q.expectedFormat,
        freshness: q.freshness
      },
      candidates: Object.values(candidates),
      relevanceJudgments,
      routerDecisions: searchRes.trace.routerDecisions
    });
    
    // Pausa para no saturar APIs
    await new Promise(r => setTimeout(r, 1000));
  }
  
  const outputPath = path.join(process.cwd(), 'benchmarkFixtures.json');
  fs.writeFileSync(outputPath, JSON.stringify(fixtures, null, 2), 'utf-8');
  console.log(`Fixtures generados y guardados en ${outputPath}`);
}

generateFixtures().catch(console.error);
