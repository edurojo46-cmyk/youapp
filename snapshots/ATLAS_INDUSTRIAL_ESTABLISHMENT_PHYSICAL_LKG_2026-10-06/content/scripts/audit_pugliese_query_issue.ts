/**
 * scripts/audit_pugliese_query_issue.ts
 * Auditoría profunda de interpretación, inventario físico Atlas y contratos de Edge/Supabase.
 */

import { supabase } from '../src/lib/supabase';
import { exactWorkSearchGate } from '../src/lib/search/exactWorkSearchGate';
import { resolveEntityV2 } from '../src/lib/atlasBootstrap/entityResolverV2';
import { parseQuery } from '../src/lib/search/queryEngine';
import { retrieveInternalCandidates } from '../src/lib/search/retrievalEngine';
import { externalSearch } from '../src/lib/search/providers/externalSearch';

async function audit() {
  console.log('════════════════════════════════════════════════════════════════════════');
  console.log('1. AUDITORÍA DE INTERPRETACIÓN ACTUAL');
  console.log('════════════════════════════════════════════════════════════════════════');

  const q1 = 'osvaldo pugliese la yumba en el colon';
  const d1 = exactWorkSearchGate.detectExactWork(q1);
  console.log(`Query: "${q1}"`);
  console.log('Interpretación actual detectExactWork:');
  console.log(`  detectionType:   ${d1.detectionType}`);
  console.log(`  canonicalEntity: ${d1.canonicalEntity}`);
  console.log(`  canonicalWork:   ${d1.canonicalWork}`);
  console.log(`  residualTitle:   "${d1.residualTitle}"`);
  console.log(`  workTokens:      [${d1.workTokens?.join(', ')}]`);
  console.log(`  topic:           ${d1.topic}`);
  console.log(`  isExactEntityTitle: ${d1.isExactEntityTitle}`);
  console.log(`  isExactWork:     ${d1.isExactWork}`);

  const q2 = 'osvaldo pugliese en el colon';
  const d2 = exactWorkSearchGate.detectExactWork(q2);
  console.log(`\nQuery: "${q2}"`);
  console.log('Interpretación actual detectExactWork:');
  console.log(`  detectionType:   ${d2.detectionType}`);
  console.log(`  canonicalEntity: ${d2.canonicalEntity}`);
  console.log(`  canonicalWork:   ${d2.canonicalWork}`);
  console.log(`  residualTitle:   "${d2.residualTitle}"`);
  console.log(`  workTokens:      [${d2.workTokens?.join(', ')}]`);
  console.log(`  topic:           ${d2.topic}`);

  console.log('\n════════════════════════════════════════════════════════════════════════');
  console.log('7. AUDITORÍA FÍSICA DE ATLAS (youapp_index)');
  console.log('════════════════════════════════════════════════════════════════════════');

  // Buscar todos los de Osvaldo Pugliese
  const { data: puglieseRows } = await supabase
    .from('youapp_index')
    .select('id, provider, provider_content_id, title, creator_name, description')
    .or('title.ilike.%osvaldo pugliese%,creator_name.ilike.%osvaldo pugliese%,title.ilike.%pugliese%');

  const pugliesePhysical = puglieseRows || [];

  // Buscar La Yumba
  const { data: yumbaRows } = await supabase
    .from('youapp_index')
    .select('id, provider, provider_content_id, title, creator_name, description')
    .ilike('title', '%la yumba%');

  const yumbaPhysical = yumbaRows || [];

  // Buscar Colón
  const { data: colonRows } = await supabase
    .from('youapp_index')
    .select('id, provider, provider_content_id, title, creator_name, description')
    .or('title.ilike.%teatro colon%,title.ilike.%teatro colón%,title.ilike.%en el colon%,title.ilike.%en el colón%');

  const colonPhysical = colonRows || [];

  // Cruces
  const puglieseColonPhysical = pugliesePhysical.filter(r => 
    /teatro\s+col[oó]n|en\s+el\s+col[oó]n|\bcol[oó]n\b/i.test(r.title + ' ' + (r.description || ''))
  );

  const puglieseLaYumbaPhysical = pugliesePhysical.filter(r => 
    /la\s+yumba/i.test(r.title + ' ' + (r.description || ''))
  );

  const puglieseLaYumbaColonPhysical = pugliesePhysical.filter(r => 
    /la\s+yumba/i.test(r.title + ' ' + (r.description || '')) &&
    /teatro\s+col[oó]n|en\s+el\s+col[oó]n|\bcol[oó]n\b/i.test(r.title + ' ' + (r.description || ''))
  );

  console.log(`PugliesePhysical:                 ${pugliesePhysical.length}`);
  console.log(`LaYumbaPhysical:                  ${yumbaPhysical.length}`);
  console.log(`ColonPhysical:                    ${colonPhysical.length}`);
  console.log(`PuglieseColonPhysical:            ${puglieseColonPhysical.length}`);
  console.log(`PuglieseLaYumbaPhysical:          ${puglieseLaYumbaPhysical.length}`);
  console.log(`PuglieseLaYumbaColonPhysical:     ${puglieseLaYumbaColonPhysical.length}`);

  if (puglieseLaYumbaColonPhysical.length > 0) {
    console.log('\nActivos que cumplen Pugliese + La Yumba + Colón en Atlas:');
    puglieseLaYumbaColonPhysical.forEach((r, i) => {
      console.log(`  [${i+1}] [${r.provider}:${r.provider_content_id}] "${r.title}"`);
    });
  } else {
    console.log('\nNo hay activos físicos que contengan simultáneamente Pugliese + La Yumba + Colón.');
  }

  if (puglieseColonPhysical.length > 0) {
    console.log('\nActivos Pugliese + Colón en Atlas:');
    puglieseColonPhysical.forEach((r, i) => {
      console.log(`  [${i+1}] [${r.provider}:${r.provider_content_id}] "${r.title}"`);
    });
  }

  if (puglieseLaYumbaPhysical.length > 0) {
    console.log('\nActivos Pugliese + La Yumba en Atlas:');
    puglieseLaYumbaPhysical.forEach((r, i) => {
      console.log(`  [${i+1}] [${r.provider}:${r.provider_content_id}] "${r.title}"`);
    });
  }

  // Clasificación diagnóstica Atlas
  if (puglieseLaYumbaColonPhysical.length === 0) {
    console.log('\nDiagnóstico inicial Atlas para "Pugliese La Yumba Colón": COVERAGE_GAP');
  }

  console.log('\n════════════════════════════════════════════════════════════════════════');
  console.log('8. AUDITORÍA EXTERNAL SEARCH CANDIDATES (Federated Open Search)');
  console.log('════════════════════════════════════════════════════════════════════════');
  const extResults = await externalSearch({ query: q1, limit: 20 });
  console.log(`Candidatos obtenidos por externalSearch: ${extResults.length}`);
  extResults.forEach((c, i) => {
    const af = exactWorkSearchGate.calculateArtistFidelity(c, d1);
    const tf = exactWorkSearchGate.calculateTitleFidelity(c, d1);
    console.log(`  [${i+1}] [${c.provider}] Q:${c.qualityScore} R:${c.relevanceScore} AF:${af} TF:${tf} "${c.title}"`);
  });
}

audit().catch(console.error);
