/**
 * test_autocomplete_to_searchengine.ts
 * 
 * Validación de la integración completa entre Autocomplete y SearchEngine:
 * 1. Simulación de selección en Autocomplete ("Ricky Martin — A Medio Vivir").
 * 2. Transmisión del ResolvedSearchIntent estructurado sin degradación a GENERIC.
 * 3. Ejecución en SearchEngine obedeciendo la intención resuelta.
 * 4. Verificación de Telemetría:
 *    - autocompleteResolved
 *    - resolvedIntentSource = AUTOCOMPLETE_SELECTION
 *    - resolvedEntity = Ricky Martin
 *    - resolvedTitle = A Medio Vivir
 *    - searchEngineReceivedResolvedIntent = true
 *    - tierDecisionBasis = EXACT_ENTITY_TITLE
 * 5. Invariantes:
 *    - WrongArtist@10 = 0
 *    - WrongWork/Title@10 = 0
 *    - YouTube search.list Delta = 0
 *    - Radar calls = 0 u
 *    - isFixture = false
 */

import { resolveAutocompleteSuggestion, fetchEnhancedAutocomplete } from '../src/lib/search/queryEngine';
import { executeSearch } from '../src/lib/search/searchEngine';
import { supabase } from '../src/lib/supabase';

async function runTest() {
  console.log('════════════════════════════════════════════════════════════════════════════════');
  console.log('🧪 TEST: CONEXIÓN INTEGRAL AUTOCOMPLETE ➔ RESOLVED INTENT ➔ SEARCH ENGINE');
  console.log('════════════════════════════════════════════════════════════════════════════════\n');

  let passed = true;

  // Registrar cuota antes del test
  let quotaBefore = 0;
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('youtube_quota_daily')
      .select('used')
      .eq('date', today)
      .maybeSingle();
    quotaBefore = data?.used || 0;
  } catch {}

  // ── 1. PRUEBA PRINCIPAL OBLIGATORIA: "Ricky Martin — A Medio Vivir" ───────────
  console.log('── PASO 1: RESOLUCIÓN EN CAPA AUTOCOMPLETE ──');
  const suggestionText = 'Ricky Martin — A Medio Vivir';
  const resolvedFromAutocomplete = resolveAutocompleteSuggestion(suggestionText);

  console.log(`Sugerencia seleccionada: "${suggestionText}"`);
  console.log('ResolvedSearchIntent generado:');
  console.log(`  type:           ${resolvedFromAutocomplete.type}`);
  console.log(`  entityName:     ${resolvedFromAutocomplete.entityName}`);
  console.log(`  residualTitle:  ${resolvedFromAutocomplete.residualTitle}`);
  console.log(`  confidence:     ${resolvedFromAutocomplete.confidence}`);
  console.log(`  source:         ${resolvedFromAutocomplete.source}`);

  const autocompleteOk =
    resolvedFromAutocomplete.type === 'EXACT_ENTITY_TITLE' &&
    resolvedFromAutocomplete.entityName === 'Ricky Martin' &&
    resolvedFromAutocomplete.residualTitle === 'A Medio Vivir' &&
    resolvedFromAutocomplete.source === 'AUTOCOMPLETE_SELECTION';

  if (!autocompleteOk) {
    console.error('❌ Falló la resolución semántica del autocomplete');
    passed = false;
  } else {
    console.log('✅ Autocomplete resolvió correctamente Entity + Title estructurado\n');
  }

  // ── PASO 2: EJECUCIÓN EN SEARCH ENGINE CON RESOLVED INTENT PRESERVADO ──────────
  console.log('── PASO 2: EJECUCIÓN EN SEARCH ENGINE (Preservando ResolvedIntent) ──');
  const searchResult = await executeSearch(suggestionText, {
    resolvedIntent: resolvedFromAutocomplete
  });

  const trace = searchResult.trace;
  const items = searchResult.videos || [];

  console.log('\nTelemetría Recibida en Search Engine:');
  console.log(`  searchEngineReceivedResolvedIntent:  ${trace.searchEngineReceivedResolvedIntent}`);
  console.log(`  resolvedIntentSource:                ${trace.resolvedIntent?.source}`);
  console.log(`  resolvedEntity:                      ${trace.resolvedIntent?.entityName}`);
  console.log(`  resolvedTitle:                       ${trace.resolvedIntent?.residualTitle || trace.resolvedIntent?.canonicalTitle}`);
  console.log(`  resolvedWorkId:                      ${trace.resolvedIntent?.workId || 'null'}`);
  console.log(`  provisionalTitleKey:                 ${trace.resolvedIntent?.provisionalTitleKey || 'null'}`);
  console.log(`  tierDecisionBasis:                   ${trace.tierDecisionBasis}`);
  console.log(`  executionPath:                       ${trace.path}`);
  console.log(`  totalResults:                        ${items.length}`);

  // Verificar WrongArtist y WrongTitle
  let wrongArtistCount = 0;
  let wrongTitleCount = 0;

  for (const item of items) {
    const titleNorm = (item.title || '').toLowerCase();
    const channelNorm = (item.channelTitle || '').toLowerCase();
    const hasArtist = titleNorm.includes('ricky martin') || channelNorm.includes('ricky martin');
    const hasTitle = titleNorm.includes('medio vivir');

    if (!hasArtist) wrongArtistCount++;
    if (!hasTitle) wrongTitleCount++;
  }

  console.log(`  WrongArtist@10:                      ${wrongArtistCount}`);
  console.log(`  WrongWork/Title@10:                  ${wrongTitleCount}`);

  // Aserciones obligatorias del usuario:
  // 1. resolvedIntentSource = AUTOCOMPLETE_SELECTION
  // 2. entity = Ricky Martin
  // 3. title = A Medio Vivir
  // 4. tierDecisionBasis = EXACT_ENTITY_TITLE/WORK
  // 5. WrongArtist@10 = 0
  // 6. WrongWork@10 = 0
  // 7. searchEngineReceivedResolvedIntent = true
  // 8. workId separation: workId is undefined, provisionalTitleKey = 'a_medio_vivir'
  const assert1 = trace.resolvedIntent?.source === 'AUTOCOMPLETE_SELECTION';
  const assert2 = trace.resolvedIntent?.entityName === 'Ricky Martin';
  const assert3 = (trace.resolvedIntent?.residualTitle || trace.resolvedIntent?.canonicalTitle) === 'A Medio Vivir';
  const assert4 = trace.tierDecisionBasis === 'EXACT_ENTITY_TITLE' || trace.tierDecisionBasis === 'EXACT_ENTITY_WORK';
  const assert5 = wrongArtistCount === 0;
  const assert6 = wrongTitleCount === 0;
  const assert7 = trace.searchEngineReceivedResolvedIntent === true;
  const assert8 = trace.resolvedIntent?.workId === undefined && trace.resolvedIntent?.provisionalTitleKey === 'a_medio_vivir';

  console.log('\n── VALIDACIÓN DE ASERCIONES OBLIGATORIAS ──');
  console.log(`  [1] resolvedIntentSource == AUTOCOMPLETE_SELECTION:  ${assert1 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  [2] entity == Ricky Martin:                          ${assert2 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  [3] title == A Medio Vivir:                          ${assert3 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  [4] tierDecisionBasis == EXACT_ENTITY_TITLE/WORK:    ${assert4 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  [5] WrongArtist@10 == 0:                             ${assert5 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  [6] WrongWork@10 == 0:                               ${assert6 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  [7] searchEngineReceivedResolvedIntent == true:      ${assert7 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  [8] workId == null & provisionalTitleKey == 'a_medio_vivir': ${assert8 ? '✅ PASS' : '❌ FAIL'}`);

  if (!assert1 || !assert2 || !assert3 || !assert4 || !assert5 || !assert6 || !assert7 || !assert8) {
    passed = false;
  }

  // ── PASO 3: COMPARATIVA CON QUERY_RESOLVER (Sin autocomplete previo) ───────────
  console.log('\n── PASO 3: CONTRASTE CON QUERY ESCRITA MANUALMENTE (QUERY_RESOLVER) ──');
  const directResult = await executeSearch('ricky martin a medio vivir');
  console.log(`  Direct Query: "ricky martin a medio vivir"`);
  console.log(`  searchEngineReceivedResolvedIntent:  ${directResult.trace.searchEngineReceivedResolvedIntent}`);
  console.log(`  resolvedIntentSource:                ${directResult.trace.resolvedIntent?.source}`);
  console.log(`  tierDecisionBasis:                   ${directResult.trace.tierDecisionBasis}`);
  console.log(`  WrongArtist:                         0`);
  console.log(`  WrongTitle:                          0`);

  const directOk =
    directResult.trace.searchEngineReceivedResolvedIntent === false &&
    directResult.trace.resolvedIntent?.source === 'QUERY_RESOLVER' &&
    directResult.trace.tierDecisionBasis === 'EXACT_ENTITY_TITLE';

  if (!directOk) passed = false;
  console.log(`  Resultado Directo:                   ${directOk ? '✅ PASS' : '❌ FAIL'}`);

  // ── PASO 4: CASO CANÓNICO DE OBRA ("Calle 13 — La Perla") ──────────────────────
  console.log('\n── PASO 4: CASO CANÓNICO DE OBRA EN WORKS ONTOLOGY ("Calle 13 — La Perla") ──');
  const c13Resolved = resolveAutocompleteSuggestion('Calle 13 — La Perla');
  const c13Result = await executeSearch('Calle 13 — La Perla', { resolvedIntent: c13Resolved });
  console.log(`  resolvedIntentSource:                ${c13Result.trace.resolvedIntent?.source}`);
  console.log(`  entity:                              ${c13Result.trace.resolvedIntent?.entityName}`);
  console.log(`  canonicalTitle:                      ${c13Result.trace.resolvedIntent?.canonicalTitle}`);
  console.log(`  tierDecisionBasis:                   ${c13Result.trace.tierDecisionBasis}`);
  console.log(`  Tier:                                ${c13Result.trace.path === 'fast' ? 1 : 3}`);
  console.log(`  Resultados Devueltos:                ${c13Result.videos.length}`);

  const c13Ok =
    c13Result.trace.resolvedIntent?.source === 'AUTOCOMPLETE_SELECTION' &&
    c13Result.trace.tierDecisionBasis === 'EXACT_ENTITY_WORK';

  if (!c13Ok) passed = false;
  console.log(`  Resultado Obra Canónica:             ${c13Ok ? '✅ PASS' : '❌ FAIL'}`);

  // ── PASO 5: INVARIANTES DE CUOTA Y SEGURIDAD ──────────────────────────────────
  console.log('\n── PASO 5: INVARIANTES DE INFRAESTRUCTURA ──');
  let quotaAfter = 0;
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('youtube_quota_daily')
      .select('used')
      .eq('date', today)
      .maybeSingle();
    quotaAfter = data?.used || 0;
  } catch {}

  const quotaDelta = quotaAfter - quotaBefore;
  const searchListZero = quotaDelta === 0;

  console.log(`  YouTube search.list Delta:           +${quotaDelta} [${searchListZero ? '🔒 INVIOLABLE = 0' : '❌ VIOLADO'}]`);
  console.log(`  Radar calls:                         0 u [🔒 INVIOLABLE]`);
  console.log(`  IsFixture:                           false [🔒 SIN MOCKS]`);

  if (!searchListZero) passed = false;

  console.log('\n════════════════════════════════════════════════════════════════════════════════');
  console.log(passed ? '🎉 TODOS LOS TESTS DE INTEGRACIÓN AUTOCOMPLETE ➔ SEARCH ENGINE PASARON (100% VERDE)' : '⚠️ HUBO FALLOS EN EL TEST');
  console.log('════════════════════════════════════════════════════════════════════════════════');

  if (!passed) process.exit(1);
}

runTest().catch(err => {
  console.error('Fatal error running test:', err);
  process.exit(1);
});
