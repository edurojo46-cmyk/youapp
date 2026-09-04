import { executeSearch } from '../src/lib/search/searchEngine';
import { supabase } from '../src/lib/supabase';

async function testCase(query: string, description: string, expectedGap: boolean) {
  console.log(`\n======================================================`);
  console.log(`🔍 TEST CASE: ${description}`);
  console.log(`   Query: "${query}"`);
  console.log(`======================================================\n`);

  const response = await executeSearch(query, { forceExternal: false, bypassAtlas: false });
  
  const results = response.videos || [];
  const related = response.relatedResults || [];
  const coverage = response.coverage;
  const expansion = response.expansion;

  console.log(`--- RESULTS SUMMARY ---`);
  console.log(`Exact Results:    ${results.length}`);
  console.log(`Related Results:  ${related.length}`);
  console.log(`Gap Detected:     ${coverage?.gapDetected}`);
  console.log(`Expansion:        ${expansion?.activated ? 'Yes (' + expansion.reason + ')' : 'No'}`);
  
  if (coverage?.gapDetected !== expectedGap) {
    console.log(`⚠️ WARNING: Expected Gap=${expectedGap}, but got ${coverage?.gapDetected}`);
  }

  if (results.length > 0) {
    console.log(`\n--- TOP EXACT RESULTS (Max 5) ---`);
    console.table(results.slice(0, 5).map((r, i) => ({
       Rank: i + 1,
       Title: r.title.length > 40 ? r.title.substring(0, 40) + '...' : r.title,
       Role: r.semanticMatch?.contentRole || 'Unknown',
       EvConf: r.semanticMatch?.primaryWorkConfidence?.toFixed(2) || '-',
       Qual: Math.round(r.qualityScore || 0),
       Spec: r.semanticMatch?.workSpecificity || 0
    })));
  }

  if (related.length > 0) {
    console.log(`\n--- RELATED RESULTS (Expansion) ---`);
    console.table(related.map((r, i) => ({
       Rank: i + 1,
       Title: r.title.length > 40 ? r.title.substring(0, 40) + '...' : r.title,
       RelType: r.semanticMatch?.relationshipType || 'Unknown',
       RelScore: r.semanticMatch?.relationshipScore || 0,
       Qual: Math.round(r.qualityScore || 0)
    })));
  }
}

async function main() {
  // Configurar para test artificial si es necesario (ej: borrando cache o manipulando pool). 
  // Por ahora ejecutamos búsqueda real.

  await testCase('los pericos pupilas lejanas', 'Caso A - Suficiente cobertura (Exact = 7, sin expansión)', false);

  // Para el Caso B, "Cerati [obra rara]", usamos una canción con pocos videos en la base de datos de test.
  await testCase('gustavo cerati vivo', 'Caso B - Cerati con posible GAP (Expansión hacia Soda Stereo)', true);
  
  await testCase('gustavo cerati en obras', 'Caso C - Cerati con Venue', true);
  
  // Salimos
  process.exit(0);
}

main().catch(console.error);
