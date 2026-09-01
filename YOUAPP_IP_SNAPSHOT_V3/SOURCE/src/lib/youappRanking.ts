import type { NormalizedVideo, Intent, QueryUnderstanding } from './types/normalization';
import { detectIntent } from './intentDetector';

export const RANKING_VERSION = 2;
export const NORMALIZATION_VERSION = 1;
export const INTENT_DETECTOR_VERSION = 1;

export const MIN_YOU_SCORE = 60;

// ─── TIPOS ───────────────────────────────────────────────────────────────────

export interface ScoreBreakdown {
  relevance: { score: number; textMatch: number; intentMatch: number; entityMatch: number };
  quality: { score: number; confidence: number; source: 'real' | 'partial' | 'default' };
  freshness: { score: number; confidence: number; source: 'real' | 'default' };
  sourceConfidence: { score: number; confidence: number };
  personalization: { score: number; status: 'ACTIVE' | 'NEUTRAL' };
  metadataCompleteness: number;
  overallScoreConfidence: number;
}

export interface ScoredCandidate extends NormalizedVideo {
  rawYouScore: number;
  youScore: number;
  breakdown: ScoreBreakdown;
  whySelected: string;
  rankingVersion: number;
  normalizationVersion: number;
  intentDetectorVersion: number;
  queryUnderstanding: QueryUnderstanding;
}

export interface SignalOptions {
  slots?: number;
  maxPerChannel?: number;
  minYouScore?: number;
  diversifyTopics?: boolean;
}

// ─── WEIGHT PROFILES ─────────────────────────────────────────────────────────

export interface WeightProfile {
  relevance: number;
  quality: number;
  freshness: number;
  sourceConfidence: number;
  personalization: number;
}

const WEIGHT_PROFILES: Record<Intent, WeightProfile> = {
  news:        { relevance: 0.35, quality: 0.15, freshness: 0.30, sourceConfidence: 0.15, personalization: 0.05 },
  sports:      { relevance: 0.38, quality: 0.17, freshness: 0.25, sourceConfidence: 0.13, personalization: 0.07 },
  tech:        { relevance: 0.40, quality: 0.25, freshness: 0.15, sourceConfidence: 0.10, personalization: 0.10 },
  history:     { relevance: 0.45, quality: 0.30, freshness: 0.05, sourceConfidence: 0.10, personalization: 0.10 },
  documentary: { relevance: 0.40, quality: 0.35, freshness: 0.03, sourceConfidence: 0.10, personalization: 0.12 },
  tourism:     { relevance: 0.40, quality: 0.25, freshness: 0.15, sourceConfidence: 0.10, personalization: 0.10 },
  culture:     { relevance: 0.40, quality: 0.30, freshness: 0.10, sourceConfidence: 0.10, personalization: 0.10 },
  nature:      { relevance: 0.40, quality: 0.30, freshness: 0.10, sourceConfidence: 0.10, personalization: 0.10 },
  economy:     { relevance: 0.40, quality: 0.25, freshness: 0.20, sourceConfidence: 0.10, personalization: 0.05 },
  politics:    { relevance: 0.35, quality: 0.20, freshness: 0.25, sourceConfidence: 0.15, personalization: 0.05 },
  general:     { relevance: 0.40, quality: 0.25, freshness: 0.15, sourceConfidence: 0.10, personalization: 0.10 },
};

// ─── RELEVANCIA (40%) ────────────────────────────────────────────────────────

function scoreRelevance(c: NormalizedVideo, query: string, qu: QueryUnderstanding): { score: number, textMatch: number, intentMatch: number, entityMatch: number } {
  const q     = query.toLowerCase().trim();
  const terms = q.split(/\s+/).filter(t => t.length > 2);
  const title = c.title.toLowerCase();
  const desc  = c.description.toLowerCase();
  const ch    = c.channelTitle.toLowerCase();

  // 50% text match
  let textScore = 0;
  if (title.includes(q))   textScore = 100;
  else if (ch.includes(q)) textScore = 60;
  else {
    let hits = 0;
    for (const term of terms) {
      if (title.includes(term)) hits += 3;
      if (desc.includes(term))  hits += 1;
      if (ch.includes(term))    hits += 1;
    }
    textScore = Math.min(90, hits * 9);
  }
  if (/argentina|argentin/.test(title + ch)) textScore = Math.min(100, textScore + 5);

  // 30% intent match
  // Since we don't have video topic classification perfectly yet, we rely on entities and keywords.
  // Actually, we can use detectIntent on the video's title to see if it aligns!
  const videoQu = detectIntent(c.title + ' ' + c.description);
  
  let intentScore = 50;
  if (videoQu.primaryIntent === qu.primaryIntent) {
    intentScore = 100;
  } else if (qu.secondaryIntent && (videoQu.primaryIntent === qu.secondaryIntent || videoQu.secondaryIntent === qu.secondaryIntent || videoQu.secondaryIntent === qu.primaryIntent)) {
    intentScore = 80;
  } else if (qu.primaryIntent === 'general') {
    intentScore = 60;
  } else {
    intentScore = 20; // mismatch
  }

  // 20% entity match
  let entityScore = textScore;
  if (qu.entities.length > 0) {
    let hits = 0;
    for (const ent of qu.entities) {
      if (title.includes(ent)) hits += 3;
      if (desc.includes(ent))  hits += 1;
      if (ch.includes(ent))    hits += 1;
    }
    entityScore = Math.min(100, hits * (90 / Math.max(1, qu.entities.length * 5)));
  }

  const score = Math.round(
    textScore   * 0.50 +
    intentScore * 0.30 +
    entityScore * 0.20
  );
  
  return { score, textMatch: textScore, intentMatch: intentScore, entityMatch: entityScore };
}


// ─── CALIDAD (25%) ───────────────────────────────────────────────────────────

function scoreQuality(c: NormalizedVideo): { score: number; confidence: number; source: 'real' | 'partial' | 'default' } {
  let score = 40; 
  let confidence = 0;
  
  const hasViews = c.viewCount !== undefined;
  const hasDuration = c.durationSeconds !== undefined;

  if (hasViews) {
    // Logarithmic curve for views
    const n = c.viewCount!;
    const viewScore = n <= 0 ? 35 : Math.min(90, 35 + Math.log10(n) * 10);
    score += viewScore * 0.20;
    confidence += 50;
  }

  if (hasDuration) {
    confidence += 50;
    const secs = c.durationSeconds!;
    if (secs >= 600 && secs <= 3600)  score += 15; // 10-60 min: ideal
    else if (secs >= 180)             score += 8;  // 3-10 min: okay
    else if (secs < 30)               score -= 20; // shorts: penalize
  }

  if (c.contentState !== 'live') score += 5; // VOD bonus

  const finalScore = Math.min(100, Math.max(0, Math.round(score)));
  const source = confidence === 100 ? 'real' : confidence > 0 ? 'partial' : 'default';
  
  return { score: finalScore, confidence, source };
}

// ─── ACTUALIDAD ──────────────────────────────────────────────────────────────

function scoreFreshness(c: NormalizedVideo): { score: number; confidence: number; source: 'real' | 'default' } {
  if (!c.publishedAt) {
    return { score: 35, confidence: 0, source: 'default' };
  }
  
  const pubDate = new Date(c.publishedAt);
  const diffDays = (Date.now() - pubDate.getTime()) / (1000 * 3600 * 24);
  
  let score = 35;
  if (diffDays <= 1) score = 100;
  else if (diffDays <= 3) score = 95;
  else if (diffDays <= 7) score = 80;
  else if (diffDays <= 30) score = 70;
  else if (diffDays <= 90) score = 45;
  else if (diffDays <= 365) score = 20;
  else {
    const years = diffDays / 365;
    score = Math.max(0, 10 - Math.floor(years) * 2);
  }

  return { score, confidence: 100, source: 'real' };
}

// ─── CONFIANZA EN LA FUENTE (10%) ────────────────────────────────────────────

function scoreSourceConfidence(c: NormalizedVideo): { score: number; confidence: number } {
  let s = 50; // base (neutral)
  if (c.sourceVerified) s += 40;
  
  // Preferir creadores grandes o conocidos que a menudo publican sin estar verificados
  if (c.viewCount && c.viewCount > 1000000) s += 10;
  
  return { score: Math.min(100, s), confidence: 100 };
}

// ─── PERSONALIZACION (10%) ───────────────────────────────────────────────────

function scorePersonalization(c: NormalizedVideo): { score: number; status: 'ACTIVE' | 'NEUTRAL' } {
  try {
    const raw = localStorage.getItem('youapp_user_algorithm');
    if (!raw) return { score: 50, status: 'NEUTRAL' };
    const algo = JSON.parse(raw);
    let s = 50;
    if (c.contentState === 'live' && algo.actualidad) s += algo.actualidad * 2;
    if (c.sourceVerified && algo.expertos)    s += algo.expertos;
    if (c.viewCount && c.viewCount > 1000000 && algo.popularidad) s += algo.popularidad;
    s += (Math.random() * (algo.diversidad || 3));
    return { score: Math.min(100, Math.round(s)), status: 'ACTIVE' };
  } catch (e) {
    return { score: 50, status: 'NEUTRAL' };
  }
}

// ─── MOTOR DE SCORING ─────────────────────────────────────────────────────────

export function rankCandidates(query: string, candidates: NormalizedVideo[]): ScoredCandidate[] {
  const qu = detectIntent(query);
  const profile = WEIGHT_PROFILES[qu.primaryIntent];

  const scored: ScoredCandidate[] = candidates.map(c => {
    const relevance        = scoreRelevance(c, query, qu);
    const quality          = scoreQuality(c);
    const freshness        = scoreFreshness(c);
    const sourceConfidence = scoreSourceConfidence(c);
    const personalization  = scorePersonalization(c);

    const rawYouScore = (
      relevance.score        * profile.relevance        +
      quality.score          * profile.quality          +
      freshness.score        * profile.freshness        +
      sourceConfidence.score * profile.sourceConfidence +
      personalization.score  * profile.personalization
    );
    const youScore = Math.round(rawYouScore);

    const overallScoreConfidence = Math.round(
      100 * profile.relevance +
      quality.confidence * profile.quality +
      freshness.confidence * profile.freshness +
      sourceConfidence.confidence * profile.sourceConfidence +
      100 * profile.personalization
    );

    const reasons: string[] = [];
    if (relevance.score >= 75)      reasons.push(`Muy relevante para "${query}"`);
    else if (relevance.score >= 50) reasons.push(`Relacionado con "${query}"`);
    if (c.sourceVerified)           reasons.push('Fuente confirmada');
    if (freshness.score >= 80)      reasons.push('Contenido reciente');
    if (quality.score >= 75)        reasons.push('Contenido sustancial');
    if (reasons.length === 0)       reasons.push('Seleccionado por YouApp');

    return {
      ...c,
      rawYouScore,
      youScore,
      breakdown: { relevance, quality, freshness, sourceConfidence, personalization, metadataCompleteness: c.metadataCompleteness, overallScoreConfidence },
      whySelected: reasons.slice(0, 2).join(' · '),
      rankingVersion: RANKING_VERSION,
      normalizationVersion: NORMALIZATION_VERSION,
      intentDetectorVersion: INTENT_DETECTOR_VERSION,
      queryUnderstanding: qu
    };
  });

  return scored.sort((a, b) => {
    const diff = b.youScore - a.youScore;
    if (Math.abs(diff) < 5) return Math.random() - 0.5; // empate: shuffle
    return diff;
  });
}

export function buildDiverseTVSignal(scored: ScoredCandidate[], options: SignalOptions = {}): ScoredCandidate[] {
  const {
    slots = 5,
    maxPerChannel = 1,
    minYouScore = MIN_YOU_SCORE,
    diversifyTopics = true
  } = options;

  const signal: ScoredCandidate[] = [];
  const channelsUsed = new Set<string>();
  const topicsUsed = new Set<string>();

  for (const v of scored) {
    if (signal.length >= slots) break;
    if (v.youScore < minYouScore) continue;

    const channelId = v.channelId || v.channelTitle;
    if (maxPerChannel > 0 && channelsUsed.has(channelId)) continue;
    
    // Simplification for topics in signal diversification
    const videoTopic = v.queryUnderstanding.primaryIntent; 
    if (diversifyTopics && topicsUsed.has(videoTopic) && signal.length > 0) {
      // Allow it only if we're desperate
      if (scored.length > 10) continue; 
    }

    signal.push(v);
    channelsUsed.add(channelId);
    topicsUsed.add(videoTopic);
  }

  return signal;
}
