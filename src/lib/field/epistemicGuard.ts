/**
 * epistemicGuard.ts
 *
 * Motor de evaluación epistemológica para YOU FIELD ENGINE V1.1.
 * Audita el grado de respaldo, análisis o especulación del contenido con discernimiento contextual.
 *
 * Principio Invariante:
 * "El Epistemic Guard clasifica y contextualiza; no decide por sí solo qué es verdad ni reemplaza Quality/Relevance."
 */

import type { ContentItem } from '../search/types';
import type { EpistemicAssessment, EpistemicDistribution, EpistemicNature, EpistemicRigorProfile } from './epistemicTypes';
import type { ScheduleBlock } from '../tv/signalTypes';

// Helper para normalizar texto sin acentos
function normalizeText(str: string): string {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

// Contextos de análisis crítico / desmitificación histórica (convierten términos llamativos en documentado/interpretativo)
const HISTORICAL_CRITICAL_FRAMING = [
  'el mito de', 'mito vs realidad', 'la verdad sobre', 'desmintiendo', 'debunking',
  'historia del concepto', 'proyecto teorico', 'contexto historico', 'que dice la ciencia',
  'archivos desclasificados', 'analisis del proyecto', 'como funcionaba realmente',
  'investigacion historica', 'documental cientifico', 'patente original', 'que era realmente'
];

// Afirmaciones especulativas no fundamentadas / conspiraciones
const PSEUDOSCIENCE_AFFIRMATION = [
  'energia libre', 'energia infinita', 'free energy', 'generador de energia infinita',
  'generador secreto', 'arma que destruyo', 'lo ocultaron', 'tecnologia extraterrestre',
  'viajes en el tiempo', 'conspiracion illuminati', 'curacion cuantica milagrosa',
  'sociedad secreta', 'la elite lo mato', 'oculto por las petroleras', 'ovni', 'ovnis',
  'terremoto de nueva york', 'arma secreta oculta'
];

// Temas de debate y controversia histórica/técnica
const CONTROVERSIAL_PATTERNS = [
  ' vs ', ' versus ', 'guerra de las corrientes', 'war of the currents', 'edison vs tesla',
  'debate historico', 'debate', 'controversia', 'controversy', 'disputa de patentes', 'disputa',
  'patent war', 'marconi vs tesla', 'quien invento la radio', 'robo de ideas', 'conflicto de patentes',
  'conflicto de intereses', 'conflicto', 'rescision de contrato', 'regalias'
];

// Análisis, ensayos y lecturas de autor
const INTERPRETATIVE_PATTERNS = [
  'analisis', 'analysis', 'ensayo', 'essay', 'por que', 'why ', 'el impacto de',
  'la mente de', 'filosofia', 'perspectiva', 'perspective', 'interpretacion',
  'lecciones de', 'reflexion', 'como pensaba', 'vision de futuro', 'legado historico'
];

// Documentación de hechos, registros, academia y patentes
const DOCUMENTED_PATTERNS = [
  'biografia', 'biography', 'documental', 'documentary', 'patente', 'patent',
  'archivo', 'archive', 'historia oficial', 'universidad', 'university', 'ieee',
  'motor de induccion', 'induction motor', 'laboratorio', 'laboratory', 'colorado springs',
  'wardenclyffe', 'corriente alterna', 'alternating current', 'bobina de tesla', 'tesla coil',
  'conferencia', 'paper', 'academic', 'catedra', 'instituto de fisica', 'planos originales'
];


/**
 * Extrae fuentes reales y verificables a partir de los metadatos concretos del item.
 * NUNCA inventa fuentes artificiales.
 */
function extractRealSources(item: Partial<ContentItem> | null | undefined): {
  hasRealSources: boolean;
  sourcesSample: string[];
  sourceProvenance?: string;
} {
  if (!item) {
    return { hasRealSources: false, sourcesSample: [] };
  }

  const sources: string[] = [];
  let sourceProvenance: string | undefined;

  // 1. Provenance de publisher real
  const rawItem = item as any;
  if (rawItem.publisherName || rawItem.publisher_name) {
    const pub = rawItem.publisherName || rawItem.publisher_name;
    sources.push(`Editorial: ${pub}`);
    sourceProvenance = `Publisher: ${pub}`;
  }
  if (rawItem.articleUrl || rawItem.article_url) {
    const url = rawItem.articleUrl || rawItem.article_url;
    sources.push(`Artículo fuente: ${url}`);
  }

  // 2. Canal verificado / institucional
  if (item.isVerified || rawItem.isVerified) {
    const ch = item.channelName || rawItem.channelTitle || 'Institución / Creador Verificado';
    sources.push(`Canal Verificado: ${ch}`);
  }

  // 3. Menciones explícitas a patentes o papers en la descripción/título
  const fullText = normalizeText(`${item.title || ''} ${item.description || ''}`);
  const patentMatch = fullText.match(/us\s*patent\s*(no\.?|#)?\s*\d+/i) || fullText.match(/patente\s*(no\.?|#)?\s*\d+/i);
  if (patentMatch) {
    sources.push(`Registro de Patente: ${patentMatch[0].toUpperCase()}`);
  }

  if (fullText.includes('ieee')) {
    sources.push('Archivo IEEE');
  }
  if (fullText.includes('archivo general') || fullText.includes('national archives')) {
    sources.push('Archivos Históricos Nacionales');
  }

  return {
    hasRealSources: sources.length > 0,
    sourcesSample: sources,
    sourceProvenance
  };
}

/**
 * Evalúa la naturaleza epistemológica de un contenido con discernimiento contextual.
 */
export function evaluateEpistemicNature(
  item: Partial<ContentItem> | null | undefined,
  entityName: string = 'Tema central',
  roleName: string = 'Profundización'
): EpistemicAssessment {
  if (!item || (!item.title && !item.description)) {
    return {
      nature: 'unknown',
      confidenceScore: 1,
      confidenceNormalized: 0.2,
      confidenceLabel: 'Indeterminada',
      glyph: '?',
      label: 'SIN DETERMINAR',
      shortDescription: 'Evidencia o metadatos insuficientes para clasificar el rigor del contenido.',
      rationale: 'No se dispone de título, descripción ni procedencia editorial suficiente.',
      entityName,
      roleName,
      hasRealSources: false,
      sourcesCount: 0,
      sourcesSample: [],
      criteriaMatched: ['Falta de metadatos']
    };
  }

  const title = (item.title || '');
  const desc = (item.description || '');
  const fullText = normalizeText(`${title} ${desc} ${(item as any).channelName || (item as any).channelTitle || ''}`);

  // Si el texto es extremadamente pobre (menos de 15 caracteres)
  if (fullText.trim().length < 15) {
    return {
      nature: 'unknown',
      confidenceScore: 1,
      confidenceNormalized: 0.2,
      confidenceLabel: 'Indeterminada',
      glyph: '?',
      label: 'SIN DETERMINAR',
      shortDescription: 'Contenido con información textual insuficiente para una clasificación epistemológica certera.',
      rationale: 'Título demasiado breve sin descripción técnica.',
      entityName,
      roleName,
      hasRealSources: false,
      sourcesCount: 0,
      sourcesSample: [],
      criteriaMatched: ['Metadatos escasos']
    };
  }

  const realSourcesInfo = extractRealSources(item);

  // 1. Detectar encuadre crítico / histórico sobre conceptos polémicos
  const hasCriticalFraming = HISTORICAL_CRITICAL_FRAMING.some(p => fullText.includes(p));
  const hasPseudoscienceAffirmation = PSEUDOSCIENCE_AFFIRMATION.some(p => fullText.includes(p));

  const matchedControversial = CONTROVERSIAL_PATTERNS.filter(p => fullText.includes(p));
  const matchedInterpretive = INTERPRETATIVE_PATTERNS.filter(p => fullText.includes(p));
  const matchedDocumented = DOCUMENTED_PATTERNS.filter(p => fullText.includes(p));

  let nature: EpistemicNature = 'documented';
  let secondaryNature: EpistemicNature | undefined;
  let confidenceScore = 4;
  let confidenceNormalized = 0.8;
  let confidenceLabel: EpistemicAssessment['confidenceLabel'] = 'Alta';
  let glyph = '✓';
  let label = 'DOCUMENTADO';
  let shortDescription = 'Este contenido se apoya principalmente en hechos históricos documentados y verificables.';
  let rationale = `Basado en patentes, biografía histórica y literatura técnica sobre ${entityName}.`;
  let criteriaMatched: string[] = [];

  // CASO A: Afirmación pseudocientífica / conspirativa directa
  if (hasPseudoscienceAffirmation && !hasCriticalFraming) {
    nature = 'speculative';
    secondaryNature = undefined;
    confidenceScore = 4;
    confidenceNormalized = 0.85;
    confidenceLabel = 'Alta';
    glyph = '◇';
    label = 'ESPECULATIVO';
    shortDescription = 'Presenta hipótesis teóricas no verificadas o leyendas contemporáneas sin respaldo científico.';
    rationale = `Afirma conceptos no verificados experimentalmente sobre ${entityName}.`;
    criteriaMatched = ['Afirmación especulativa no académica'];
  }
  // CASO B: Encuadre crítico / desmitificación histórica
  else if (hasCriticalFraming) {
    nature = 'documented';
    secondaryNature = 'interpretive';
    confidenceScore = 4;
    confidenceNormalized = 0.85;
    confidenceLabel = 'Alta';
    glyph = '✓';
    label = 'DOCUMENTADO';
    shortDescription = 'Examina proyectos históricos o conceptos teóricos desde una perspectiva documental y desmitificadora.';
    rationale = `Trata el proyecto histórico desde el análisis de archivo y contexto científico desmitificador.`;
    criteriaMatched = ['Encuadre crítico histórico', 'Desmitificación'];
  }

  // CASO C: Debate o controversia histórica real (Guerra de las Corrientes, disputas de patentes)
  else if (matchedControversial.length > 0) {
    nature = 'controversial';
    secondaryNature = matchedDocumented.length > 0 ? 'documented' : 'interpretive';
    confidenceScore = 4;
    confidenceNormalized = 0.84;
    confidenceLabel = 'Alta';
    glyph = '⇄';
    label = 'CONTROVERTIDO';
    shortDescription = 'Aborda debates históricos o técnicos donde existen posiciones divergentes fundamentadas.';
    rationale = `Explora contrastes y disputas documentadas ("${matchedControversial.join(', ')}").`;
    criteriaMatched = matchedControversial;
  }
  // CASO D: Ensayos, lecturas de autor e interpretaciones
  else if (matchedInterpretive.length > 0) {
    nature = 'interpretive';
    secondaryNature = matchedDocumented.length > 0 ? 'documented' : undefined;
    confidenceScore = 4;
    confidenceNormalized = 0.80;
    confidenceLabel = 'Alta';
    glyph = '◐';
    label = 'INTERPRETATIVO';
    shortDescription = 'Ofrece análisis crítico, lecturas conceptuales y reflexiones contextuales del autor.';
    rationale = `Estructurado como ensayo explicativo o interpretación del impacto de ${entityName}.`;
    criteriaMatched = matchedInterpretive;
  }
  // CASO E: Especulación difusa / mención no crítica
  else if (fullText.includes('misterio') || fullText.includes('secreto') || fullText.includes('ovni') || fullText.includes('energia libre')) {
    nature = 'speculative';
    secondaryNature = 'interpretive';
    confidenceScore = 3;
    confidenceNormalized = 0.65;
    confidenceLabel = 'Media';
    glyph = '◇';
    label = 'ESPECULATIVO';
    shortDescription = 'Contenido con elementos de hipótesis no contrastadas o leyendas populares.';
    rationale = `Menciona enigmas o teorías de borde asociadas a ${entityName}.`;
    criteriaMatched = ['Mención de misterios o teorías no probadas'];
  }
  // CASO F: Documentado estándar
  else if (matchedDocumented.length > 0) {
    nature = 'documented';
    secondaryNature = undefined;
    confidenceScore = (item.isVerified || (item as any).trustScore) ? 5 : 4;
    confidenceNormalized = confidenceScore === 5 ? 0.95 : 0.85;
    confidenceLabel = confidenceScore === 5 ? 'Muy alta' : 'Alta';
    glyph = '✓';
    label = 'DOCUMENTADO';
    criteriaMatched = matchedDocumented;
  }
  // CASO G: Genérico sin marcas claras
  else {
    nature = 'documented';
    secondaryNature = 'interpretive';
    confidenceScore = 3;
    confidenceNormalized = 0.60;
    confidenceLabel = 'Media';
    glyph = '✓';
    label = 'DOCUMENTADO';
    shortDescription = 'Información general estructurada sobre el tema.';
    rationale = `Descripción alineada al tema general sin marcadores de controversia ni especulación.`;
    criteriaMatched = ['Contenido estándar general'];
  }

  return {
    nature,
    secondaryNature,
    confidenceScore,
    confidenceNormalized,
    confidenceLabel,
    glyph,
    label,
    shortDescription,
    rationale,
    entityName,
    roleName,
    hasRealSources: realSourcesInfo.hasRealSources,
    sourcesCount: realSourcesInfo.sourcesSample.length,
    sourcesSample: realSourcesInfo.sourcesSample,
    sourceProvenance: realSourcesInfo.sourceProvenance,
    criteriaMatched
  };
}

/**
 * Calcula la distribución epistemológica acumulada de una señal.
 */
export function calculateSignalEpistemicDistribution(
  schedule: ScheduleBlock[],
  entityName: string = 'Tema'
): EpistemicDistribution {
  if (!schedule || schedule.length === 0) {
    return {
      documentedPct: 70,
      interpretivePct: 20,
      controversialPct: 10,
      speculativePct: 0,
      unknownPct: 0,
      balanceRating: 'EQUILIBRADO Y SÓLIDO ✓',
      balanceDescription: 'Equilibrio óptimo: base documental sólida con espacio formativo y contextual.'
    };
  }

  let totalDuration = 0;
  const counts: Record<EpistemicNature, number> = {
    documented: 0,
    interpretive: 0,
    controversial: 0,
    speculative: 0,
    unknown: 0
  };

  schedule.forEach(block => {
    const duration = Math.max(block.durationSec || 600, 60);
    totalDuration += duration;
    const assessment = evaluateEpistemicNature(block.contentItem, entityName, block.role);
    counts[assessment.nature] += duration;
  });

  const documentedPct = Math.round((counts.documented / Math.max(1, totalDuration)) * 100);
  const interpretivePct = Math.round((counts.interpretive / Math.max(1, totalDuration)) * 100);
  const controversialPct = Math.round((counts.controversial / Math.max(1, totalDuration)) * 100);
  const speculativePct = Math.round((counts.speculative / Math.max(1, totalDuration)) * 100);
  const unknownPct = Math.max(0, 100 - (documentedPct + interpretivePct + controversialPct + speculativePct));

  let balanceRating: EpistemicDistribution['balanceRating'] = 'EQUILIBRADO Y SÓLIDO ✓';
  let balanceDescription = 'Predominio de hechos documentados con perspectiva analítica y espacio para el debate.';

  if (unknownPct > 40) {
    balanceRating = 'INDETERMINADO';
    balanceDescription = 'Una porción relevante de la señal carece de metadatos para auditar su naturaleza.';
  } else if (documentedPct >= 75) {
    balanceRating = 'DOCUMENTAL ESTRICTO';
    balanceDescription = 'Alta concentración en fuentes primarias y hechos estrictamente comprobables.';
  } else if (speculativePct > 25) {
    balanceRating = 'EXPLORATORIO';
    balanceDescription = 'Mayor apertura hacia hipótesis teóricas no comprobadas y leyendas.';
  } else if (documentedPct >= 45 && interpretivePct >= 15) {
    balanceRating = 'ALTO ✓';
    balanceDescription = 'Balance óptimo entre rigor histórico, comprensión profunda y diversidad de enfoques.';
  }

  return {
    documentedPct,
    interpretivePct,
    controversialPct,
    speculativePct,
    unknownPct,
    balanceRating,
    balanceDescription
  };
}

/**
 * Ponderador para reajustar los candidatos según el perfil de rigor seleccionado.
 * INVARIANTE: Solo se aplica a candidatos que YA superaron el Core Gate (Q >= 60, R >= 40).
 */
export function getRigorNatureMultiplier(
  nature: EpistemicNature,
  profile: EpistemicRigorProfile
): number {
  switch (profile) {
    case 'documentary':
      if (nature === 'documented') return 1.30;
      if (nature === 'interpretive') return 0.90;
      if (nature === 'controversial') return 0.60;
      if (nature === 'unknown') return 0.50;
      return 0.05; // Penaliza fuertemente lo especulativo en modo documental

    case 'exploratory':
      if (nature === 'speculative') return 1.30;
      if (nature === 'controversial') return 1.20;
      if (nature === 'interpretive') return 1.10;
      if (nature === 'unknown') return 0.90;
      return 0.85; // Acepta base documentada con mayor cuota de hipótesis

    case 'open':
      return 1.0; // Sin modificación de pesos

    case 'balanced':
    default:
      if (nature === 'documented') return 1.15;
      if (nature === 'interpretive') return 1.05;
      if (nature === 'controversial') return 0.95;
      if (nature === 'unknown') return 0.80;
      return 0.50;
  }
}
