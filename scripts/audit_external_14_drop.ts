import { parseQuery } from '../src/lib/search/queryEngine';
import { externalSearch } from '../src/lib/search/providers/externalSearch';
import { exactWorkSearchGate } from '../src/lib/search/exactWorkSearchGate';
import { calculateQualityScore } from '../src/lib/search/qualityEngine';
import { calculateBaseRanking } from '../src/lib/search/rankingEngine';

async function auditExternal14() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('8. AUDITORÍA DETALLADA: EXTERNAL CANDIDATES vs ELIGIBILITY DROP');
  console.log('════════════════════════════════════════════════════════════════\n');

  const queryStr = 'osvaldo pugliese la yumba en el colon';
  const parsed = parseQuery(queryStr);
  const detection = exactWorkSearchGate.detectExactWork(queryStr);

  console.log('Detection actual:', {
    detectionType: detection.detectionType,
    canonicalEntity: detection.canonicalEntity,
    residualTitle: detection.residualTitle,
    workTokens: detection.workTokens
  });

  // Consultar adaptadores externos
  const externalCandidates = await externalSearch.search(parsed, [], {
    routingMode: 'all',
    excludeProviders: ['youtube'] // respetar cero search.list
  });

  console.log(`\nTotal candidatos devueltos por adaptadores externos: ${externalCandidates.length}`);

  // Calcular calidad y relevancia para cada candidato
  const scoredQuality = calculateQualityScore(externalCandidates);
  for (let i = 0; i < externalCandidates.length; i++) {
    externalCandidates[i].qualityScore = scoredQuality[i].qualityScore;
    externalCandidates[i].relevanceScore = calculateBaseRanking(externalCandidates[i], parsed).relevanceScore;
  }

  // Candidatos externos que pasan Q>=60 y R>=40
  const q60r40 = externalCandidates.filter(c => (c.qualityScore || 0) >= 60 && (c.relevanceScore || 0) >= 40);
  console.log(`Candidatos que cumplen Q>=60 / R>=40: ${q60r40.length}`);

  console.log('\nDetalle de los candidatos Q>=60 / R>=40 y por qué fueron descartados:');
  q60r40.forEach((c, i) => {
    const af = exactWorkSearchGate.calculateArtistFidelity(c, detection);
    const tf = exactWorkSearchGate.calculateTitleFidelity(c, detection);
    const role = exactWorkSearchGate.classifyContentRole(c, detection);
    
    // Check de elegibilidad actual
    const passesRole = (
      role === 'PRIMARY_WORK' ||
      role === 'OFFICIAL_VIDEO' ||
      role === 'LIVE_PERFORMANCE' ||
      role === 'TV_PERFORMANCE' ||
      role === 'REMASTER' ||
      role === 'LYRIC'
    );

    const isExactEntityTitle = (
      detection.detectionType === 'EXACT_ENTITY_TITLE' &&
      passesRole &&
      af >= 85 &&
      tf >= 75
    );

    let dropReason = '';
    if (!passesRole) dropReason = `disallowed_role(${role})`;
    else if (af < 85) dropReason = `low_artist_fidelity(AF=${af}<85)`;
    else if (tf < 75) dropReason = `low_title_fidelity(TF=${tf}<75, buscaba "${detection.residualTitle}")`;
    else dropReason = 'QUALIFIED';

    console.log(`[${i+1}] [${c.provider}] Q:${c.qualityScore} R:${c.relevanceScore} | AF:${af} TF:${tf} | Role:${role}`);
    console.log(`    Título: "${c.title}"`);
    console.log(`    Elegibilidad: ${isExactEntityTitle ? 'QUALIFIED ✅' : 'DROPPED ❌'} | Motivo: ${dropReason}\n`);
  });
}

auditExternal14().catch(console.error);
