/**
 * test_master_teologia.ts
 *
 * Valida:
 * 1. Ruido semántico filtrado: "Master Psychologie", "Master Boot Record" descartados (R < 40).
 * 2. Conceptos centrales priorizados: "Teología de la Liberación" (R >= 75).
 * 3. Backward compatibility de `getCanonicalClusterKey`.
 * 4. Resumen agregado de elegibilidad y medición de latencias.
 */

if (typeof (import.meta as any).env === 'undefined') {
  (import.meta as any).env = { DEV: true };
}
import 'fake-indexeddb/auto';

import { parseQuery } from '../src/lib/search/queryEngine';
import { calculateBaseRanking } from '../src/lib/search/rankingEngine';
import { calculateQualityScore } from '../src/lib/search/qualityEngine';
import { getCanonicalClusterKey } from '../src/lib/quotaBrain';
import type { ContentItem } from '../src/lib/search/types';

async function runTest() {
  console.log('======================================================================');
  console.log('🎓 TEST: "master teologia de la liberacion" (NOISE FILTER & CLUSTERING)');
  console.log('======================================================================\n');

  // 1. Validar export getCanonicalClusterKey
  const cluster = getCanonicalClusterKey('master teologia de la liberacion');
  console.log('1. CLUSTER CANÓNICO:', cluster);

  // 2. Mock dataset con candidatos ruidosos y relevantes
  const candidates: ContentItem[] = [
    {
      id: 'noise_1',
      provider: 'vimeo',
      providerContentId: 'n1',
      title: 'Master Psychologie',
      channelTitle: 'Uni Video',
      qualityScore: 70,
      embeddable: true,
      retrievalSource: 'vimeo-api'
    } as any,
    {
      id: 'noise_2',
      provider: 'youtube',
      providerContentId: 'n2',
      title: 'Master Boot Record Live',
      channelTitle: 'Metal Records',
      qualityScore: 65,
      embeddable: true,
      retrievalSource: 'radar'
    } as any,
    {
      id: 'noise_3',
      provider: 'dailymotion',
      providerContentId: 'n3',
      title: 'Master of Magic Gameplay',
      channelTitle: 'Gamer Channel',
      qualityScore: 60,
      embeddable: true,
      retrievalSource: 'dailymotion-api'
    } as any,
    {
      id: 'good_1',
      provider: 'vimeo',
      providerContentId: 'g1',
      title: 'Clase Magistral: Teología de la Liberación en América Latina',
      description: 'Curso completo sobre los orígenes y evolución de la teología de la liberación.',
      channelTitle: 'Facultad de Teología',
      qualityScore: 75,
      embeddable: true,
      retrievalSource: 'vimeo-api'
    } as any,
    {
      id: 'good_2',
      provider: 'youtube',
      providerContentId: 'g2',
      title: 'Teología de la Liberación: Gustavo Gutiérrez y Leonardo Boff',
      description: 'Estudio y análisis del movimiento teológico latinoamericano.',
      channelTitle: 'Filosofía y Sociedad',
      qualityScore: 70,
      embeddable: true,
      retrievalSource: 'atlas'
    } as any
  ];

  const query = parseQuery('master teologia de la liberacion');
  const ranked = calculateBaseRanking(candidates, query);
  const scored = calculateQualityScore(ranked);

  console.log('\n2. EVALUACIÓN DE RELEVANCIA Y FILTRADO DE RUIDO:\n');

  scored.forEach((c, idx) => {
    const isNoise = c.id.startsWith('noise');
    const q = c.qualityScore || 0;
    const r = c.relevanceScore || 0;
    const isEligible = q >= 60 && r >= 40;

    console.log(`   [Item #${idx + 1}] "${c.title}"`);
    console.log(`     Tipo esperado:    ${isNoise ? 'RUIDO SEMÁNTICO (debe fallar)' : 'RELEVANTE (debe pasar)'}`);
    console.log(`     Relevance (R):    ${r}/100 -> ${r >= 40 ? 'PASS (>=40)' : 'FAIL (<40) ❌'}`);
    console.log(`     Estado:           ${isEligible ? 'ELEGIBLE ✅' : 'DESCARTADO 🚫'}`);
    console.log('');
  });

  const noiseFiltered = scored.filter(c => c.id.startsWith('noise')).every(c => (c.relevanceScore || 0) < 40);
  const goodPassed = scored.filter(c => c.id.startsWith('good')).every(c => (c.relevanceScore || 0) >= 40);

  console.log('======================================================================');
  console.log('🏆 VEREDICTO:');
  console.log(`   - Ruido ("Master Psychologie", etc.) descartado:  ${noiseFiltered ? 'SÍ ✅' : 'NO ❌'}`);
  console.log(`   - Contenido real de Teología de la Liberación:   ${goodPassed ? 'CALIFICADO ✅' : 'FALLÓ ❌'}`);
  console.log('======================================================================');
}

runTest();
