export type PlacementSlot =
  | 'associated_rail'
  | 'editorial_pick'
  | 'thematic_block'
  | 'special_collab';

export type ExposureLevel = 'BASICO' | 'EDITORIAL' | 'DESTACADO';

export interface ExposureLevelDefinition {
  level: ExposureLevel;
  defaultSlot: PlacementSlot;
  label: string;
  badge: string;
  summary: string;
  contextualSidebarEligible: boolean;
}

export const EXPOSURE_LEVELS: Record<ExposureLevel, ExposureLevelDefinition> = {
  BASICO: {
    level: 'BASICO',
    defaultSlot: 'associated_rail',
    label: 'Básico',
    badge: 'Nivel Básico',
    summary: 'Presencia en el directorio y franja de repetidoras de Mi Señal.',
    contextualSidebarEligible: false
  },
  EDITORIAL: {
    level: 'EDITORIAL',
    defaultSlot: 'editorial_pick',
    label: 'Editorial',
    badge: 'Nivel Editorial',
    summary: 'Recomendaciones contextuales y contenidos seleccionados dentro de Mi Señal por afinidad temática.',
    contextualSidebarEligible: true
  },
  DESTACADO: {
    level: 'DESTACADO',
    defaultSlot: 'special_collab',
    label: 'Destacado',
    badge: 'Nivel Destacado',
    summary: 'Espacios promocionales prioritarios acordados (gratuitos o pagos en simulación con aviso visible).',
    contextualSidebarEligible: true
  }
};

export function slotToExposureLevel(slot?: PlacementSlot | string | null): ExposureLevel {
  if (slot === 'special_collab') return 'DESTACADO';
  if (slot === 'editorial_pick' || slot === 'thematic_block') return 'EDITORIAL';
  return 'BASICO';
}

export function exposureLevelToSlot(level: ExposureLevel): PlacementSlot {
  return EXPOSURE_LEVELS[level].defaultSlot;
}

export interface AffinityAnchorInput {
  name?: string | null;
  category?: string | null;
  mainTopic?: string | null;
  prompt?: string | null;
  description?: string | null;
  featuredVideoTitle?: string | null;
}

export interface AffinityCandidateInput {
  id: string;
  userId?: string | null;
  name: string;
  category: string;
  originPlatform: string;
  originUrl: string | null;
  featuredVideoUrl?: string | null;
  featuredVideoTitle?: string | null;
  description?: string | null;
}

export interface AtlasAffinitySuggestion {
  channel: AffinityCandidateInput;
  score: number;
  matchedClusters: string[];
  reason: string;
  recommendedExposure: ExposureLevel;
  alreadyAssociated: boolean;
}

export interface RepeaterMembershipInput {
  id: string;
  signalId: string;
  channelId: string;
  agreementId: string | null;
  membershipRole: 'owned' | 'followed' | 'repeater' | 'reciprocal_repeater';
  placementSlot: PlacementSlot;
  editorialOrder: number;
  attributionLabel: string;
  originPlatform: string;
  originUrl: string;
  featuredVideoUrl: string | null;
  featuredVideoTitle: string | null;
  isActive: boolean;
  channelName?: string;
  channelCategory?: string;
  referralClicks?: number;
}

export interface ViewerWatchContext {
  currentTitle?: string | null;
  currentTopic?: string | null;
  signalName?: string | null;
}

export interface ContextualRepeaterRecommendation {
  membership: RepeaterMembershipInput;
  exposureLevel: ExposureLevel;
  affinityScore: number;
  headline: string;
  subline: string;
  reasonLabel: string;
}

const STOPWORDS = new Set([
  'canal',
  'senal',
  'para',
  'como',
  'este',
  'esta',
  'estos',
  'estas',
  'desde',
  'sobre',
  'entre',
  'todo',
  'todos',
  'toda',
  'una',
  'uno',
  'unos',
  'unas',
  'del',
  'las',
  'los',
  'con',
  'por',
  'sin',
  'mas',
  'muy',
  'que',
  'quien',
  'cual',
  'youtube',
  'video',
  'videos',
  'oficial'
]);

const CLUSTER_LEXICON: Record<string, string[]> = {
  HISTORIA: [
    'historia',
    'historico',
    'historica',
    'imperio',
    'roma',
    'antiguo',
    'siglo',
    'revolucion',
    'industrial',
    'memoria',
    'archivo',
    'biografia',
    'origen',
    'origenes',
    'rerum',
    'novarum',
    'leon',
    'enigma',
    'guerra',
    'arqueologia'
  ],
  PROGRAMACION: [
    'programacion',
    'informatica',
    'computacion',
    'software',
    'codigo',
    'algoritmo',
    'algoritmos',
    'turing',
    'alan',
    'babbage',
    'lovelace',
    'ordenador',
    'computadora',
    'desarrollo',
    'sistemas',
    'inteligencia',
    'artificial',
    'datos',
    'web',
    'tecnologia'
  ],
  CIENCIA: [
    'ciencia',
    'cientifico',
    'fisica',
    'matematica',
    'matematicas',
    'astronomia',
    'universo',
    'cosmos',
    'biologia',
    'quimica',
    'investigacion',
    'descubrimiento',
    'laboratorio',
    'futuro',
    'energia'
  ],
  SOCIEDAD_TRABAJO: [
    'justicia',
    'social',
    'trabajo',
    'trabajadores',
    'derechos',
    'comunidad',
    'cultura',
    'educacion',
    'filosofia',
    'economia',
    'humanismo',
    'argentina',
    'cordoba',
    'papa'
  ],
  DOCUMENTAL_CINE: [
    'documental',
    'documentales',
    'cine',
    'serie',
    'cronica',
    'periodismo',
    'reportaje',
    'relato'
  ]
};

const CLUSTER_LABELS: Record<string, string> = {
  HISTORIA: 'Historia',
  PROGRAMACION: 'Programación y Computación',
  CIENCIA: 'Ciencia',
  SOCIEDAD_TRABAJO: 'Sociedad y Cultura',
  DOCUMENTAL_CINE: 'Documental'
};

const COMPLEMENTARY_PAIRS: Record<string, number> = {
  'HISTORIA|PROGRAMACION': 40,
  'HISTORIA|CIENCIA': 42,
  'HISTORIA|SOCIEDAD_TRABAJO': 44,
  'HISTORIA|DOCUMENTAL_CINE': 38,
  'PROGRAMACION|CIENCIA': 46,
  'PROGRAMACION|DOCUMENTAL_CINE': 34,
  'CIENCIA|DOCUMENTAL_CINE': 38,
  'SOCIEDAD_TRABAJO|DOCUMENTAL_CINE': 40,
  'CIENCIA|SOCIEDAD_TRABAJO': 32
};

export function normalizeTokens(parts: Array<string | null | undefined>): string[] {
  const raw = parts
    .filter(Boolean)
    .join(' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ');

  const out: string[] = [];
  const seen = new Set<string>();
  for (const tok of raw.split(/\s+/)) {
    if (tok.length < 3 || STOPWORDS.has(tok)) continue;
    if (!seen.has(tok)) {
      seen.add(tok);
      out.push(tok);
    }
  }
  return out;
}

function detectClusters(tokens: string[]): Map<string, number> {
  const hits = new Map<string, number>();
  for (const [cluster, words] of Object.entries(CLUSTER_LEXICON)) {
    let count = 0;
    for (const t of tokens) {
      if (words.some((w) => t === w || (t.length >= 5 && w.startsWith(t)) || (w.length >= 5 && t.startsWith(w)))) {
        count += 1;
      }
    }
    if (count > 0) hits.set(cluster, count);
  }
  return hits;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function computePairwiseAffinity(anchorTokens: string[], candidateTokens: string[]) {
  const anchorClusters = detectClusters(anchorTokens);
  const candClusters = detectClusters(candidateTokens);

  let score = 22;
  const sharedWords = anchorTokens.filter((t) => candidateTokens.includes(t));
  score += Math.min(30, sharedWords.length * 12);

  let bestClusterBonus = 0;
  let bestRelationText = '';
  const matchedClusters = new Set<string>();

  for (const [ac, aCount] of anchorClusters.entries()) {
    for (const [cc, cCount] of candClusters.entries()) {
      if (ac === cc) {
        const bonus = 46 + Math.min(12, (aCount + cCount) * 3);
        matchedClusters.add(CLUSTER_LABELS[cc] || cc);
        if (bonus > bestClusterBonus) {
          bestClusterBonus = bonus;
          bestRelationText = `Coincidencia directa en ${CLUSTER_LABELS[cc] || cc}`;
        }
      } else {
        const comp = COMPLEMENTARY_PAIRS[pairKey(ac, cc)] || 24;
        const bonus = comp + Math.min(10, (aCount + cCount) * 2);
        matchedClusters.add(CLUSTER_LABELS[ac] || ac);
        matchedClusters.add(CLUSTER_LABELS[cc] || cc);
        if (bonus > bestClusterBonus) {
          bestClusterBonus = bonus;
          bestRelationText = `Puente editorial entre ${CLUSTER_LABELS[ac] || ac} y ${CLUSTER_LABELS[cc] || cc}`;
        }
      }
    }
  }

  score += bestClusterBonus;
  const clamped = Math.max(25, Math.min(98, Math.round(score)));

  return {
    score: clamped,
    matchedClusters: Array.from(matchedClusters),
    sharedWords,
    relationText: bestRelationText || 'Complemento cultural para ampliar descubrimiento cruzado'
  };
}

/**
 * ATLAS Affinity — sugiere canales compatibles por afinidad temática pública.
 * Nunca utiliza datos privados de seguidores ni activa acuerdos sin aceptación humana.
 */
export function computeAtlasChannelAffinity(
  anchor: AffinityAnchorInput,
  candidates: AffinityCandidateInput[],
  options?: { ownChannelIds?: string[]; activePartnerChannelIds?: string[] }
): AtlasAffinitySuggestion[] {
  const ownSet = new Set(options?.ownChannelIds || []);
  const partnerSet = new Set(options?.activePartnerChannelIds || []);

  const anchorTokens = normalizeTokens([
    anchor.name,
    anchor.category,
    anchor.mainTopic,
    anchor.prompt,
    anchor.description,
    anchor.featuredVideoTitle
  ]);

  return candidates
    .filter((c) => !ownSet.has(c.id) && Boolean(c.originUrl))
    .map((c) => {
      const candTokens = normalizeTokens([
        c.name,
        c.category,
        c.description,
        c.featuredVideoTitle
      ]);
      const res = computePairwiseAffinity(anchorTokens, candTokens);
      const bonusMeta = (c.featuredVideoTitle ? 5 : 0) + (c.originUrl?.startsWith('https://') ? 4 : 0);
      const finalScore = Math.min(98, res.score + bonusMeta);
      const recommendedExposure: ExposureLevel = finalScore >= 68 ? 'EDITORIAL' : 'BASICO';

      return {
        channel: c,
        score: finalScore,
        matchedClusters: res.matchedClusters,
        reason: `${res.relationText}${c.featuredVideoTitle ? ` · Destacado: «${c.featuredVideoTitle}»` : ''}`,
        recommendedExposure,
        alreadyAssociated: partnerSet.has(c.id)
      };
    })
    .sort((a, b) => {
      if (a.alreadyAssociated !== b.alreadyAssociated) {
        return a.alreadyAssociated ? 1 : -1;
      }
      return b.score - a.score;
    });
}

/**
 * Repeater Engine — selecciona recomendaciones contextuales autorizadas para mostrar
 * en un espacio separado del reproductor (ej. caso «Alan Turing -> Canal Programación»).
 */
export function selectContextualRepeaterRecommendations(
  memberships: RepeaterMembershipInput[],
  context: ViewerWatchContext,
  limit = 2
): ContextualRepeaterRecommendation[] {
  const eligible = memberships.filter(
    (m) =>
      m.isActive !== false &&
      (m.membershipRole === 'repeater' || m.membershipRole === 'reciprocal_repeater') &&
      EXPOSURE_LEVELS[slotToExposureLevel(m.placementSlot)].contextualSidebarEligible
  );

  if (eligible.length === 0) return [];

  const contextTokens = normalizeTokens([
    context.currentTitle,
    context.currentTopic,
    context.signalName
  ]);

  const scored = eligible.map((m) => {
    const exposureLevel = slotToExposureLevel(m.placementSlot);
    const memberTokens = normalizeTokens([
      m.channelName,
      m.channelCategory,
      m.featuredVideoTitle,
      m.attributionLabel
    ]);
    const pair = computePairwiseAffinity(contextTokens, memberTokens);
    const tierBoost = exposureLevel === 'DESTACADO' ? 14 : 6;
    const totalScore = Math.min(99, pair.score + tierBoost);

    const chanLabel = m.channelName || m.attributionLabel.replace(/^(Canal asociado|Repetidora)\s*·\s*/i, '');
    const recommendedPiece = m.featuredVideoTitle || m.channelCategory || 'selección recomendada';

    return {
      membership: m,
      exposureLevel,
      affinityScore: totalScore,
      headline: `También en ${chanLabel}: ${recommendedPiece}`,
      subline:
        m.membershipRole === 'reciprocal_repeater'
          ? `Repetidora recíproca · ${m.originPlatform}`
          : `Repetidora activa · ${m.originPlatform}`,
      reasonLabel:
        context.currentTitle && pair.sharedWords.length > 0
          ? `Relacionado con «${context.currentTitle}»`
          : pair.relationText
    };
  });

  scored.sort((a, b) => b.affinityScore - a.affinityScore || a.membership.editorialOrder - b.membership.editorialOrder);
  return scored.slice(0, limit);
}

// ============================================================================
// ATLAS RED VIVA v1 — Motor matemático de crecimiento en cadena (7 días)
// S = 0.35*A + 0.30*N + 0.20*C + 0.15*Q  |  R = I * Pa * Pp * U
// ============================================================================

export interface RedVivaCandidateInput extends AffinityCandidateInput {
  isSmallOrNewSignal?: boolean;
  isCuratorSignal?: boolean;
  historicalConversion?: number | null; // 0..1 si existe historial real
  qualityScore?: number | null; // 0..1 si existe verificación previa
}

export interface RedVivaOpportunityFactors {
  A: number; // 0..1 Afinidad temática
  N: number; // 0..1 Audiencia potencialmente nueva (complementariedad)
  C: number; // 0..1 Conversión observada (0.55 neutro en arranque en frío)
  Q: number; // 0..1 Calidad y confiabilidad de la señal
}

export interface RedVivaOpportunityResult {
  channel: RedVivaCandidateInput;
  score: number; // 0..1
  scorePct: number; // 0..100
  factors: RedVivaOpportunityFactors;
  matchedClusters: string[];
  complementaryReason: string;
  isSmallOrCuratorSlot: boolean;
}

const COMPLEMENTARY_CLUSTER_PAIRS: [string, string][] = [
  ['HISTORIA', 'CIENCIA'],
  ['HISTORIA', 'TECNOLOGIA'],
  ['HISTORIA', 'SOCIEDAD'],
  ['CIENCIA', 'TECNOLOGIA'],
  ['DEPORTES', 'SOCIEDAD'],
  ['SOCIEDAD', 'CULTURA'],
  ['HISTORIA', 'CULTURA']
];

function areComplementaryClusters(a: string[], b: string[]): boolean {
  for (const ca of a) {
    for (const cb of b) {
      if (ca === cb) continue;
      const match = COMPLEMENTARY_CLUSTER_PAIRS.some(
        ([x, y]) => (x === ca && y === cb) || (x === cb && y === ca)
      );
      if (match) return true;
    }
  }
  return false;
}

export function computeRedVivaOpportunities(
  anchor: AffinityAnchorInput,
  candidates: RedVivaCandidateInput[],
  excludedChannelIds: string[] = [],
  options?: {
    allowedCategories?: string[];
    includeCurators?: boolean;
    limit?: number;
  }
): RedVivaOpportunityResult[] {
  const excludedSet = new Set(excludedChannelIds);
  const allowedCats = (options?.allowedCategories || []).map((c) => c.trim().toLowerCase()).filter(Boolean);
  const includeCurators = options?.includeCurators !== false;
  const limit = options?.limit ?? 6;

  const anchorTokens = normalizeTokens([
    anchor.name,
    anchor.category,
    anchor.mainTopic,
    anchor.prompt,
    anchor.description,
    anchor.featuredVideoTitle
  ]);
  const anchorClusters = detectClusters(anchorTokens);

  const scored: RedVivaOpportunityResult[] = [];

  for (const c of candidates) {
    if (excludedSet.has(c.id)) continue;
    if (!includeCurators && c.isCuratorSignal) continue;
    if (allowedCats.length > 0) {
      const catNorm = `${c.category} ${c.name} ${c.description || ''}`.toLowerCase();
      const matchesCat = allowedCats.some((ac) => catNorm.includes(ac));
      if (!matchesCat) continue;
    }

    const candTokens = normalizeTokens([
      c.name,
      c.category,
      c.description,
      c.featuredVideoTitle
    ]);
    const candClusters = detectClusters(candTokens);
    const pair = computePairwiseAffinity(anchorTokens, candTokens);

    // A: Afinidad temática (0..1)
    const A = Math.min(1, Math.max(0.15, pair.score / 100));

    // N: Audiencia potencialmente nueva (premia complementariedad real, evita clones idénticos)
    const complementary = areComplementaryClusters(anchorClusters, candClusters);
    const sameCategoryExact =
      Boolean(anchor.category) &&
      anchor.category!.trim().toLowerCase() === c.category.trim().toLowerCase();
    let N = 0.62;
    if (complementary) {
      N = 0.88;
    } else if (pair.matchedClusters.length > 0 && !sameCategoryExact) {
      N = 0.78;
    } else if (sameCategoryExact) {
      N = 0.56;
    } else if (candClusters.length > 0) {
      N = 0.72;
    }
    if (c.isCuratorSignal) N = Math.min(0.95, N + 0.06);

    // C: Conversión histórica (0.55 neutro optimista en arranque en frío para no castigar señales nuevas)
    const C =
      typeof c.historicalConversion === 'number' && !Number.isNaN(c.historicalConversion)
        ? Math.min(1, Math.max(0, c.historicalConversion))
        : 0.55;

    // Q: Calidad y confiabilidad observable
    let Q =
      typeof c.qualityScore === 'number' && !Number.isNaN(c.qualityScore)
        ? Math.min(1, Math.max(0, c.qualityScore))
        : 0.65;
    if (c.originUrl && c.originUrl.startsWith('https://')) Q += 0.14;
    if (c.featuredVideoTitle) Q += 0.11;
    if (c.description && c.description.trim().length >= 16) Q += 0.06;
    Q = Math.min(1, Q);

    // S = 0.35A + 0.30N + 0.20C + 0.15Q
    const rawS = 0.35 * A + 0.3 * N + 0.2 * C + 0.15 * Q;
    const score = Math.round(Math.min(1, Math.max(0, rawS)) * 100) / 100;
    const scorePct = Math.round(score * 100);

    const complementaryReason = complementary
      ? `Complementariedad alta (${anchorClusters[0] || 'Tema'} + ${candClusters[0] || c.category}) · Audiencia nueva`
      : c.isCuratorSignal
      ? `Curador YOUAPP · Audiencia nueva compatible (${c.category})`
      : c.isSmallOrNewSignal
      ? `Oportunidad para señal nueva · ${pair.relationText}`
      : pair.relationText;

    scored.push({
      channel: c,
      score,
      scorePct,
      factors: {
        A: Math.round(A * 100) / 100,
        N: Math.round(N * 100) / 100,
        C: Math.round(C * 100) / 100,
        Q: Math.round(Q * 100) / 100
      },
      matchedClusters: pair.matchedClusters,
      complementaryReason,
      isSmallOrCuratorSlot: Boolean(c.isSmallOrNewSignal || c.isCuratorSignal)
    });
  }

  scored.sort((a, b) => b.score - a.score);

  // Garantiza al menos 1 cupo en el top para una señal nueva/pequeña o curador YOUAPP
  const top = scored.slice(0, limit);
  const hasSmallInTop = top.some((x) => x.isSmallOrCuratorSlot);
  if (!hasSmallInTop) {
    const firstSmall = scored.find((x) => x.isSmallOrCuratorSlot);
    if (firstSmall && top.length > 0) {
      top[top.length - 1] = firstSmall;
    }
  }
  return top;
}

export function computeRedVivaReproduction(
  invitationsPerCycle: number,
  acceptProb: number,
  persistProb: number,
  eligibleNewRatio: number
): { R: number; status: 'expanding' | 'steady' | 'contracting' } {
  const raw = Math.max(0, invitationsPerCycle) * acceptProb * persistProb * eligibleNewRatio;
  const R = Math.round(raw * 100) / 100;
  const status = R > 1.02 ? 'expanding' : R >= 0.95 ? 'steady' : 'contracting';
  return { R, status };
}

export interface RedVivaSimulationConfig {
  initialSignals: number;
  weeks: number;
  acceptProb: number; // 0..1
  persistProb: number; // 0..1
  avgAudiencePerSignal: number;
  smallSignalShare: number; // 0..1
}

export interface RedVivaWeekPoint {
  week: number;
  activeSignals: number;
  trialsStarted: number;
  newPermanent: number;
  totalPermanentLinks: number;
  newAudienceWeek: number;
  cumulativeNewAudience: number;
  smallSignalsBoosted: number;
  saturationPct: number;
}

export interface RedVivaSimulationResult {
  points: RedVivaWeekPoint[];
  totalPermanentLinks: number;
  cumulativeNewAudience: number;
  smallSignalsBoostedTotal: number;
  finalActiveSignals: number;
  effectiveR: number;
  finalSaturationPct: number;
}

/**
 * Simulador semanal de ATLAS Red Viva (con tope real de 1 prueba visible por señal,
 * cupo para señales nuevas/curadores y curva realista de saturación anti-ciclos).
 */
export function simulateRedVivaPilot(config: RedVivaSimulationConfig): RedVivaSimulationResult {
  const initialSignals = Math.max(4, Math.min(200, Math.round(config.initialSignals)));
  const weeks = Math.max(2, Math.min(16, Math.round(config.weeks)));
  const pa = Math.min(1, Math.max(0.05, config.acceptProb));
  const pp = Math.min(1, Math.max(0.05, config.persistProb));
  const baseAudience = Math.max(50, config.avgAudiencePerSignal || 400);
  const smallShare = Math.min(0.8, Math.max(0.1, config.smallSignalShare || 0.35));

  const maxPossiblePairs = (initialSignals * (initialSignals - 1)) / 2;
  let activeSignals = initialSignals;
  let totalPermanentLinks = Math.max(1, Math.round(initialSignals * 0.25)); // parejas semilla iniciales A+B
  let cumulativeNewAudience = 0;
  let smallSignalsBoostedTotal = 0;
  const points: RedVivaWeekPoint[] = [];

  for (let week = 1; week <= weeks; week++) {
    const saturationRatio = Math.min(0.92, totalPermanentLinks / Math.max(1, maxPossiblePairs));
    const eligibleRatio = Math.max(0.12, 1 - saturationRatio);

    // Tope duro: como máximo 1 prueba temporal visible por señal activa
    const eligibleHostSlots = Math.min(activeSignals, Math.max(1, Math.round(totalPermanentLinks * 0.85)));
    const trialsStarted = Math.max(1, Math.round(eligibleHostSlots * pa * eligibleRatio));
    const newPermanent = Math.max(0, Math.round(trialsStarted * pp));

    totalPermanentLinks += newPermanent;

    // Nuevas señales voluntarias (curadores/creadores) atraídas por el efecto red
    const organicJoins = Math.round(newPermanent * 0.22);
    activeSignals += organicJoins;

    const smallBoostThisWeek = Math.max(0, Math.round(trialsStarted * smallShare));
    smallSignalsBoostedTotal += smallBoostThisWeek;

    // Audiencia nueva descubierta esa semana (descuenta solapamiento creciente)
    const discoveryRate = 0.085 * (0.45 + 0.55 * eligibleRatio);
    const newAudienceWeek = Math.round(
      (trialsStarted * 0.6 + newPermanent * 1.1) * baseAudience * discoveryRate
    );
    cumulativeNewAudience += newAudienceWeek;

    points.push({
      week,
      activeSignals,
      trialsStarted,
      newPermanent,
      totalPermanentLinks,
      newAudienceWeek,
      cumulativeNewAudience,
      smallSignalsBoosted: smallBoostThisWeek,
      saturationPct: Math.round(saturationRatio * 100)
    });
  }

  const last = points[points.length - 1];
  const effectiveR = Math.round((1.8 * pa * pp * (1 - (last?.saturationPct || 0) / 100)) * 100) / 100;

  return {
    points,
    totalPermanentLinks,
    cumulativeNewAudience,
    smallSignalsBoostedTotal,
    finalActiveSignals: activeSignals,
    effectiveR,
    finalSaturationPct: last?.saturationPct || 0
  };
}
