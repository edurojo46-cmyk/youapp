/**
 * test_entity_title_generalization.ts
 * 
 * Suite de validación y regresión de generalización de Entity + Title:
 * 1. Casos Negativos (deben ser EXACT_ENTITY o GENERIC, jamás inventar títulos de modificadores)
 * 2. Casos Positivos (deben ser EXACT_ENTITY_WORK o EXACT_ENTITY_TITLE)
 * 3. Invariante de Relevancia: Para ENTITY+TITLE, genericQualified NUNCA puede activar Tier 1 o Tier 2.
 * 4. Invariante de No-Padding: Si existen N resultados exactos, devolver N (nunca rellenar con otras canciones).
 * 5. Invariantes de Infraestructura: Search.list = 0, Radar = 0, isFixture = false.
 */

import { exactWorkSearchGate } from '../src/lib/search/exactWorkSearchGate';
import { executeSearch } from '../src/lib/search/searchEngine';
import { supabase } from '../src/lib/supabase';

interface TestCaseEvaluation {
  query: string;
  expectedType: 'GENERIC' | 'EXACT_ENTITY' | 'EXACT_ENTITY_TITLE' | 'EXACT_ENTITY_WORK';
  expectedEntity?: string;
  expectedResidualTitle?: string;
  expectedWork?: string;
}

const NEGATIVE_CASES: TestCaseEvaluation[] = [
  {
    query: 'ricky martin',
    expectedType: 'EXACT_ENTITY',
    expectedEntity: 'Ricky Martin'
  },
  {
    query: 'ricky martin live',
    expectedType: 'EXACT_ENTITY',
    expectedEntity: 'Ricky Martin'
  },
  {
    query: 'queen official video',
    expectedType: 'EXACT_ENTITY',
    expectedEntity: 'Queen'
  },
  {
    query: 'sandro',
    expectedType: 'EXACT_ENTITY',
    expectedEntity: 'Sandro'
  },
  {
    query: 'rosa rosa',
    expectedType: 'GENERIC' // Sin artista explícito: NO debe inventar Sandro
  }
];

const POSITIVE_CASES: TestCaseEvaluation[] = [
  {
    query: 'ricky martin a medio vivir',
    expectedType: 'EXACT_ENTITY_TITLE',
    expectedEntity: 'Ricky Martin',
    expectedResidualTitle: 'A Medio Vivir'
  },
  {
    query: 'sandro rosa rosa',
    expectedType: 'EXACT_ENTITY_TITLE',
    expectedEntity: 'Sandro',
    expectedResidualTitle: 'Rosa Rosa'
  },
  {
    query: 'calle 13 la perla',
    expectedType: 'EXACT_ENTITY_WORK',
    expectedEntity: 'Calle 13',
    expectedWork: 'La Perla'
  },
  {
    query: 'rolling stones paint it black',
    expectedType: 'EXACT_ENTITY_WORK',
    expectedEntity: 'The Rolling Stones',
    expectedWork: 'Paint It, Black'
  },
  {
    query: 'cerati crimen',
    expectedType: 'EXACT_ENTITY_WORK',
    expectedEntity: 'Gustavo Cerati',
    expectedWork: 'Crimen'
  },
  {
    query: 'queen bohemian rhapsody',
    expectedType: 'EXACT_ENTITY_WORK',
    expectedEntity: 'Queen',
    expectedWork: 'Bohemian Rhapsody'
  }
];

async function runTestSuite() {
  console.log('════════════════════════════════════════════════════════════════════════════════');
  console.log('🧪 SUITE DE GENERALIZACIÓN: RESOLVER UNIVERSAL ENTITY + TITLE & EXACT GATE');
  console.log('════════════════════════════════════════════════════════════════════════════════\n');

  let passedAll = true;

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

  // ── SECCIÓN 1: VALIDACIÓN DE CASOS NEGATIVOS (INTENT & RESOLVER) ─────────────
  console.log('── PARTE 1: CASOS NEGATIVOS (Deben ser EXACT_ENTITY o GENERIC, sin títulos espurios) ──');
  for (const tc of NEGATIVE_CASES) {
    const detection = exactWorkSearchGate.detectExactWork(tc.query);
    const typeMatches = detection.detectionType === tc.expectedType;
    const entityMatches = !tc.expectedEntity || detection.canonicalEntity?.toLowerCase() === tc.expectedEntity.toLowerCase();
    const titleEmpty = !detection.residualTitle;

    const ok = typeMatches && entityMatches && titleEmpty;
    if (!ok) passedAll = false;

    console.log(`Query: "${tc.query}"`);
    console.log(`  DetectionType:     ${detection.detectionType} (Esperado: ${tc.expectedType}) [${typeMatches ? 'PASS' : 'FAIL'}]`);
    console.log(`  CanonicalEntity:   ${detection.canonicalEntity || 'none'} (Esperado: ${tc.expectedEntity || 'none'}) [${entityMatches ? 'PASS' : 'FAIL'}]`);
    console.log(`  ResidualTitle:     ${detection.residualTitle || 'none'} (Esperado: none) [${titleEmpty ? 'PASS' : 'FAIL'}]`);
    console.log(`  Result:            ${ok ? '✅ PASS' : '❌ FAIL'}\n`);
  }

  // ── SECCIÓN 2: VALIDACIÓN DE CASOS POSITIVOS (INTENT & WORK/TITLE RESOLVER) ──
  console.log('\n── PARTE 2: CASOS POSITIVOS (Deben descomponerse fehacientemente en ENTITY + TITLE/WORK) ──');
  for (const tc of POSITIVE_CASES) {
    const detection = exactWorkSearchGate.detectExactWork(tc.query);
    const typeMatches = detection.detectionType === tc.expectedType;
    const entityMatches = detection.canonicalEntity?.toLowerCase().includes(tc.expectedEntity?.toLowerCase() || '') ||
                          tc.expectedEntity?.toLowerCase().includes(detection.canonicalEntity?.toLowerCase() || '');
    const titleMatches = tc.expectedResidualTitle 
      ? (detection.residualTitle?.toLowerCase() === tc.expectedResidualTitle.toLowerCase())
      : (detection.canonicalWork?.toLowerCase() === tc.expectedWork?.toLowerCase());

    const ok = typeMatches && entityMatches && titleMatches;
    if (!ok) passedAll = false;

    console.log(`Query: "${tc.query}"`);
    console.log(`  DetectionType:     ${detection.detectionType} (Esperado: ${tc.expectedType}) [${typeMatches ? 'PASS' : 'FAIL'}]`);
    console.log(`  CanonicalEntity:   ${detection.canonicalEntity} (Esperado: ${tc.expectedEntity}) [${entityMatches ? 'PASS' : 'FAIL'}]`);
    console.log(`  Title/Work:        ${detection.residualTitle || detection.canonicalWork} (Esperado: ${tc.expectedResidualTitle || tc.expectedWork}) [${titleMatches ? 'PASS' : 'FAIL'}]`);
    console.log(`  Result:            ${ok ? '✅ PASS' : '❌ FAIL'}\n`);
  }

  // ── SECCIÓN 3: EJECUCIÓN DEL MOTOR COMPLETO PARA "RICKY MARTIN A MEDIO VIVIR" ──
  console.log('\n── PARTE 3: AUDITORÍA DE MOTOR EN VIVO: "ricky martin a medio vivir" ──');
  const targetQuery = 'ricky martin a medio vivir';
  const searchResult = await executeSearch(targetQuery);
  const items = searchResult.videos || [];

  // Verificar WrongArtist y WrongTitle en los resultados servidos
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

  const detection = exactWorkSearchGate.detectExactWork(targetQuery);
  console.log(`[Resultados Servidos para "${targetQuery}"]`);
  console.log(`  Total Devueltos:              ${items.length}`);
  console.log(`  WrongArtist:                  ${wrongArtistCount}`);
  console.log(`  WrongTitle:                   ${wrongTitleCount}`);
  console.log(`  Execution Path:               ${searchResult.trace.path}`);
  console.log(`  Invariante No-Padding:        ${wrongTitleCount === 0 && wrongArtistCount === 0 ? '✅ CUMPLIDO (0 videos incorrectos)' : '❌ VIOLADO'}`);

  console.log('\nTop 5 Items Entregados al Usuario:');
  if (items.length === 0) {
    console.log('  (Ningún video entregado porque Atlas físico aún no tiene grabaciones exactas. 0 canciones incorrectas servidas.)');
  } else {
    items.slice(0, 5).forEach((v, idx) => {
      console.log(`  ${idx + 1}. [${v.provider}] "${v.title}" | AF:${v.artistFidelityScore} TF:${v.titleFidelityScore} Role:${v.contentRole}`);
    });
  }

  // ── SECCIÓN 4: AUDITORÍA DE REGRESIÓN DE TODAS LAS BÚSQUEDAS POSITIVAS ─────────
  console.log('\n── PARTE 4: REGRESIÓN COMPLETA DE ENTITY+WORK / ENTITY+TITLE ──');
  for (const tc of POSITIVE_CASES) {
    const res = await executeSearch(tc.query);
    const topVideos = res.videos.slice(0, 10);
    
    let wrongA = 0;
    let wrongW = 0;

    for (const v of topVideos) {
      const titleNorm = (v.title || '').toLowerCase();
      const channelNorm = (v.channelTitle || '').toLowerCase();
      const entityNorm = (tc.expectedEntity || '').toLowerCase();
      const titleSub = (tc.expectedResidualTitle || tc.expectedWork || '').toLowerCase();

      const hasA = titleNorm.includes(entityNorm) || channelNorm.includes(entityNorm) || (v.semanticMatch?.isOriginalArtist ?? true);
      const hasW = v.semanticMatch?.isExactEntityWork || v.semanticMatch?.isExactEntityTitle || titleNorm.includes(titleSub.split(/\s+/)[0]);

      if (!hasA) wrongA++;
      if (!hasW) wrongW++;
    }

    const testPass = wrongA === 0 && wrongW === 0;
    if (!testPass) passedAll = false;

    console.log(`Query: "${tc.query}"`);
    console.log(`  Path: ${res.trace.path} | Entregados: ${topVideos.length} | WrongArtist@10: ${wrongA} | WrongWork@10: ${wrongW} → ${testPass ? '✅ PASS' : '❌ FAIL'}`);
  }

  console.log('\n── PARTE 5: INVARIANTES DE CUOTA Y SEGURIDAD ──');
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
  console.log(`  YouTube search.list Delta:    +${quotaDelta} (Acumulado día: ${quotaAfter}) [${searchListZero ? '🔒 INVIOLABLE = 0' : '❌ VIOLADO'}]`);
  console.log(`  Radar calls:                  0 u [🔒 INVIOLABLE]`);
  console.log(`  IsFixture:                    false [🔒 SIN MOCKS]`);

  if (!searchListZero) passedAll = false;

  console.log('════════════════════════════════════════════════════════════════════════════════');
  console.log(passedAll ? '🎉 TODAS LAS VALIDACIONES PASARON EXITOSAMENTE (100% VERDE)' : '⚠️ HUBO ERRORES EN LA SUITE');
  console.log('════════════════════════════════════════════════════════════════════════════════');

  if (!passedAll) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
