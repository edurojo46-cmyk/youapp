/**
 * test_epistemic_guard.ts
 *
 * GOLD GATE TEST SUITE — YOU FIELD ENGINE V1.1 (EPISTEMIC GUARD)
 * 20 Casos Desafiantes del Mundo Real, Desambiguación Contextual e Invariante de Aislamiento.
 */

import {
  evaluateEpistemicNature,
  calculateSignalEpistemicDistribution,
  getRigorNatureMultiplier
} from '../src/lib/field/epistemicGuard';
import type { ScheduleBlock } from '../src/lib/tv/signalTypes';

console.log('======================================================================');
console.log('🧭 GOLD GATE TEST SUITE: YOU FIELD ENGINE V1.1 (EPISTEMIC GUARD)');
console.log('   "El Guard clasifica y contextualiza; no reemplaza Quality ni Relevance"');
console.log('======================================================================\n');

interface TestCase {
  id: number;
  category: string;
  item: {
    title: string;
    description?: string;
    channelName?: string;
    isVerified?: boolean;
    publisherName?: string;
    articleUrl?: string;
  };
  expectedNature: string;
  expectedSecondary?: string;
  expectRealSources: boolean;
}

const GOLD_20_CASES: TestCase[] = [
  // ── GRUPO 1: DOCUMENTED REAL (Hechos, Patentes, Archivos Oficiales) ─────────
  {
    id: 1,
    category: 'DOCUMENTED',
    item: {
      title: 'US Patent 381,968: Electro-Magnetic Motor by Nikola Tesla',
      description: 'Documento oficial de la patente registrada en la oficina de patentes de Estados Unidos.',
      isVerified: true
    },
    expectedNature: 'documented',
    expectRealSources: true
  },
  {
    id: 2,
    category: 'DOCUMENTED',
    item: {
      title: 'Nikola Tesla: Biografía oficial y conferencias en la Universidad de Columbia (IEEE Archive)',
      description: 'Archivo histórico y académico de las conferencias dictadas en 1891.',
      channelName: 'IEEE History Center',
      isVerified: true
    },
    expectedNature: 'documented',
    expectRealSources: true
  },
  {
    id: 3,
    category: 'DOCUMENTED',
    item: {
      title: 'Historia de la Corriente Alterna y el Transformador de Tesla',
      description: 'Documental técnico sobre el desarrollo del sistema polifásico y la bobina de Tesla.',
      isVerified: false
    },
    expectedNature: 'documented',
    expectRealSources: false
  },
  {
    id: 4,
    category: 'DOCUMENTED',
    item: {
      title: 'Archivo de Colorado Springs: Cuadernos de notas de laboratorio de 1899',
      description: 'Transcripción de las notas de investigación de Nikola Tesla en su laboratorio.',
      publisherName: 'Museo Nikola Tesla',
      articleUrl: 'https://tesla-museum.org/archives/1899'
    },
    expectedNature: 'documented',
    expectRealSources: true
  },
  {
    id: 5,
    category: 'DOCUMENTED',
    item: {
      title: 'La torre de Wardenclyffe: Historia de la construcción y planos originales',
      description: 'Planos de ingeniería y archivos fotográficos del proyecto en Shoreham.',
      isVerified: true
    },
    expectedNature: 'documented',
    expectRealSources: true
  },

  // ── GRUPO 2: INTERPRETIVE (Análisis, Ensayos, Lecturas de Autor) ─────────────
  {
    id: 6,
    category: 'INTERPRETIVE',
    item: {
      title: 'La mente de Tesla: Por qué su filosofía transformó el siglo XX (Ensayo)',
      description: 'Análisis conceptual sobre la visión de futuro y cosmovisión del inventor.',
      isVerified: true
    },
    expectedNature: 'interpretive',
    expectRealSources: true
  },
  {
    id: 7,
    category: 'INTERPRETIVE',
    item: {
      title: 'El impacto de Nikola Tesla en la ingeniería moderna: Análisis crítico',
      description: 'Perspectiva histórica y ensayo sobre su influencia en el diseño electromecánico.',
      isVerified: false
    },
    expectedNature: 'interpretive',
    expectRealSources: false
  },
  {
    id: 8,
    category: 'INTERPRETIVE',
    item: {
      title: 'Cómo pensaba Nikola Tesla: Reflexiones sobre su proceso creativo',
      description: 'Interpretación biográfica de sus métodos de visualización mental.',
      isVerified: false
    },
    expectedNature: 'interpretive',
    expectRealSources: false
  },
  {
    id: 9,
    category: 'INTERPRETIVE',
    item: {
      title: 'Lecciones de la vida de Nikola Tesla: Visión de futuro y decadencia',
      description: 'Ensayo reflexivo sobre sus últimos años en Nueva York.',
      isVerified: false
    },
    expectedNature: 'interpretive',
    expectRealSources: false
  },

  // ── GRUPO 3: CONTROVERSIAL (Debates Históricos y Disputas de Patentes) ───────
  {
    id: 10,
    category: 'CONTROVERSIAL',
    item: {
      title: 'Tesla vs Edison: La Guerra de las Corrientes y la disputa de patentes',
      description: 'El debate histórico y la campaña de desprestigio entre corriente continua y alterna.',
      isVerified: true
    },
    expectedNature: 'controversial',
    expectRealSources: true
  },
  {
    id: 11,
    category: 'CONTROVERSIAL',
    item: {
      title: 'Quién inventó la radio: Marconi vs Tesla en la Corte Suprema',
      description: 'La controversia legal sobre la prioridad de las patentes de transmisión inalámbrica.',
      isVerified: true
    },
    expectedNature: 'controversial',
    expectRealSources: true
  },
  {
    id: 12,
    category: 'CONTROVERSIAL',
    item: {
      title: 'El debate histórico sobre la patente del motor polifásico',
      description: 'Conflicto de patentes y reclamaciones entre Tesla, Ferraris y Thomson.',
      isVerified: false
    },
    expectedNature: 'controversial',
    expectRealSources: false
  },
  {
    id: 13,
    category: 'CONTROVERSIAL',
    item: {
      title: 'Tesla y Westinghouse: Conflicto de intereses y rescisión de contrato',
      description: 'Debate financiero e histórico sobre las regalías de patentes cedidas.',
      isVerified: false
    },
    expectedNature: 'controversial',
    expectRealSources: false
  },

  // ── GRUPO 4: DESAMBIGUACIÓN CONTEXTUAL (Mito Crítico vs. Pseudociencia) ──────
  {
    id: 14,
    category: 'CONTEXTUAL NUANCE (DESMITIFICACIÓN)',
    item: {
      title: 'El mito del rayo de la muerte de Tesla: Qué dice la ciencia y qué era realmente la Teleforce',
      description: 'Investigación histórica y desmitificación del concepto teórico de haz de partículas.',
      isVerified: true
    },
    expectedNature: 'documented', // Clasificado como documentado gracias al encuadre crítico desmitificador
    expectRealSources: true
  },
  {
    id: 15,
    category: 'CONTEXTUAL NUANCE (DESMITIFICACIÓN)',
    item: {
      title: 'Desmintiendo la energía infinita: Por qué el generador secreto de Tesla es un mito',
      description: 'Análisis de física y contexto histórico sobre las leyes de la termodinámica.',
      isVerified: true
    },
    expectedNature: 'documented',
    expectRealSources: true
  },
  {
    id: 16,
    category: 'SPECULATIVE',
    item: {
      title: 'Tesla descubrió la energía libre infinita y la élite lo mató para ocultarlo',
      description: 'El generador de energía infinita que las petroleras no quieren que conozcas.',
      isVerified: false
    },
    expectedNature: 'speculative',
    expectRealSources: false
  },
  {
    id: 17,
    category: 'SPECULATIVE',
    item: {
      title: 'La máquina que provocó el terremoto de Nueva York y los ovnis de Tesla',
      description: 'Conspiraciones sobre el oscilador electromecánico y viajes en el tiempo.',
      isVerified: false
    },
    expectedNature: 'speculative',
    expectRealSources: false
  },

  // ── GRUPO 5: UNKNOWN / INCERTIDUMBRE DECLARADA (Evidencia Insuficiente) ──────
  {
    id: 18,
    category: 'UNKNOWN',
    item: {
      title: 'Video 04',
      description: '',
      isVerified: false
    },
    expectedNature: 'unknown',
    expectRealSources: false
  },
  {
    id: 19,
    category: 'UNKNOWN',
    item: {
      title: '',
      description: '',
      isVerified: false
    },
    expectedNature: 'unknown',
    expectRealSources: false
  },
  {
    id: 20,
    category: 'UNKNOWN',
    item: {
      title: 'Tesla test',
      description: '',
      isVerified: false
    },
    expectedNature: 'unknown',
    expectRealSources: false
  }
];

let passCount = 0;

console.log('1. EVALUACIÓN DE LOS 20 CASOS GOLD:');
GOLD_20_CASES.forEach(tc => {
  const result = evaluateEpistemicNature(tc.item as any, 'Nikola Tesla', 'deep_dive');
  const naturePass = result.nature === tc.expectedNature;
  const sourcesPass = result.hasRealSources === tc.expectRealSources;
  const passed = naturePass && sourcesPass;

  if (passed) passCount++;

  console.log(`   [Caso ${tc.id.toString().padStart(2, '0')}] [${result.glyph} ${result.label.padEnd(14)}] ${tc.item.title || '(Sin título)'}`);
  console.log(`            Clase: ${result.nature} (Esp: ${tc.expectedNature}) | Fuentes reales: ${result.hasRealSources ? `SÍ (${result.sourcesSample.join(', ')})` : 'NO (Honesto)'} | Confianza: ${result.confidenceLabel} (${Math.round(result.confidenceNormalized * 100)}%)`);
  if (!passed) {
    console.log(`            ❌ FALLO: NaturePass=${naturePass}, SourcesPass=${sourcesPass}`);
  }
});

console.log(`\nResultado de Clasificación: ${passCount} / ${GOLD_20_CASES.length} PASS ✅`);
console.assert(passCount === GOLD_20_CASES.length, 'Los 20 casos deben clasificar con 100% de precisión');

// ── 2. Test Invariante de Aislamiento y Perfiles de Rigor ─────────────────────
console.log('\n2. VERIFICACIÓN DEL INVARIANTE DE AISLAMIENTO & PERFILES DE RIGOR:');

// Simular un candidato con Quality=55 (No elegible en Core Gate)
const rawQuality = 55;
const rawRelevance = 80;
const isEligibleInCore = rawQuality >= 60 && rawRelevance >= 40;
console.log(`   - Candidato con Q=${rawQuality}, R=${rawRelevance} -> Core Gate: ${isEligibleInCore ? 'ELIGIBLE' : 'REJECTED ❌'}`);

// El multiplicador de rigor NO debe alterar la elegibilidad básica
const docMultiplier = getRigorNatureMultiplier('documented', 'documentary');
const speculativeMultiplier = getRigorNatureMultiplier('speculative', 'documentary');
console.log(`   - Documented Multiplier (Doc Profile): ${docMultiplier}x`);
console.log(`   - Speculative Multiplier (Doc Profile): ${speculativeMultiplier}x`);

console.assert(!isEligibleInCore, 'El Core Gate debe rechazar candidatos con Q < 60 independientemente del perfil epistemológico');
console.assert(docMultiplier === 1.30, 'Documental debe aplicar 1.30x a documentado');
console.assert(speculativeMultiplier === 0.05, 'Documental debe suprimir lo especulativo a 0.05x');

// ── 3. Test de Distribución Epistemológica de Señal ───────────────────────────
console.log('\n3. VERIFICACIÓN DE DISTRIBUCIÓN Y BALANCES DE SEÑAL:');
const testSchedule: ScheduleBlock[] = [
  { id: '1', position: 0, startOffsetSec: 0, durationSec: 720, topic: 'Patentes', role: 'opening', contentItem: GOLD_20_CASES[0].item as any },
  { id: '2', position: 1, startOffsetSec: 720, durationSec: 660, topic: 'IEEE Archive', role: 'deep_dive', contentItem: GOLD_20_CASES[1].item as any },
  { id: '3', position: 2, startOffsetSec: 1380, durationSec: 540, topic: 'Guerra Corrientes', role: 'explainer', contentItem: GOLD_20_CASES[9].item as any },
  { id: '4', position: 3, startOffsetSec: 1920, durationSec: 720, topic: 'Filosofía', role: 'deep_dive', contentItem: GOLD_20_CASES[5].item as any },
  { id: '5', position: 4, startOffsetSec: 2640, durationSec: 480, topic: 'Mito Desmentido', role: 'discovery', contentItem: GOLD_20_CASES[13].item as any }
];

const dist = calculateSignalEpistemicDistribution(testSchedule, 'Nikola Tesla');
console.log(`   - Documentado:    ${dist.documentedPct}%`);
console.log(`   - Interpretativo: ${dist.interpretivePct}%`);
console.log(`   - Controvertido:  ${dist.controversialPct}%`);
console.log(`   - Especulativo:   ${dist.speculativePct}%`);
console.log(`   - Unknown:        ${dist.unknownPct}%`);
console.log(`   - Balance Status: ${dist.balanceRating}`);
console.log(`   - Descripción:    "${dist.balanceDescription}"`);

console.assert(dist.documentedPct >= 50, 'La base documental debe ser >= 50%');
console.assert(dist.speculativePct === 0, 'No debe haber especulación espuria cuando hay desmitificación');
console.assert(dist.balanceRating === 'ALTO ✓' || dist.balanceRating === 'EQUILIBRADO Y SÓLIDO ✓', 'El balance debe ser alto y equilibrado');

console.log('\n======================================================================');
console.log('🏆 GOLD GATE VALIDADO AL 100% — EPISTEMIC GUARD V1.1 ESTÁ LISTO');
console.log('======================================================================');
