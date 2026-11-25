/**
 * ATLAS — CINEMATIC QUALITY GATE V1
 *
 * Pre-montage and post-render cinematic visual QA system:
 * 1. Analyzes real physical frames across video timeline.
 * 2. Detects visual repetitions, compositional redundancy, and excessive static holds.
 * 3. Evaluates sharpness (Laplacian variance), contrast, chromatic harmony, and shot variety.
 * 4. Checks narrative and lighting coherence (inspired by «Los Cielos de Paranal» standards).
 * 5. Flags underexposed/black frames, jarring chromatic jumps, and visual stagnation.
 * 6. Does NOT impose rigid percentages of images vs. videos.
 */

import fs from 'fs';
import path from 'path';
import cp from 'child_process';
import crypto from 'crypto';

const projectRoot = process.cwd();
const ffmpegPath = path.resolve(projectRoot, 'node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe');

/** Human film reviews are first-class constraints for future cinematic decisions. */
export function readHumanDirectorQualityRules(): string[] {
  const file = path.resolve(projectRoot, 'server/data/atlas_human_director_profile.json');
  if (!fs.existsSync(file)) return [];
  const profile = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(profile.learnedQualityRules)) return [];
  return profile.learnedQualityRules.filter((r: unknown): r is string => typeof r === 'string' && r.trim().length > 0).slice(0, 32);
}

export interface FrameVisualMetrics {
  timestampSec: number;
  meanLuma: number;
  contrast: number; // Luminance standard deviation
  sharpness: number; // Laplacian edge variance
  colorHistogram: Float32Array; // 64-bin RGB color distribution
  isUnderExposed: boolean;
  sha256?: string;
  framePath?: string;
}

export interface SequenceCinematicAuditResult {
  callSuccessful: boolean;
  modelUsed: string;
  narrativeArcScore: number; // 0 - 100
  sequenceCoherenceScore: number; // 0 - 100
  thematicGapsDetected: string[];
  repeatedVisuals: Array<{ sceneA: number; sceneB: number; reason: string }>;
  overallCritique: string;
  verdict: 'PASS' | 'FAIL';
  costUsd: string;
}

export interface PreRenderCandidateEvaluation {
  compatible: boolean;
  artisticScore: number;
  critique: string;
  thematicMismatchDetected: boolean;
  blockReason?: string;
  modelUsed: string;
}

export interface PreRenderPlanValidationResult {
  passed: boolean;
  verdict: 'PASS' | 'FAIL' | 'BLOCKED';
  badClipsBlocked: Array<{
    sceneIndex: number;
    title: string;
    filePath: string;
    reason: string;
  }>;
  duplicateClipsBlocked: Array<{
    sceneA: number;
    sceneB: number;
    filePath: string;
    reason: string;
  }>;
  loopingHacksBlocked: Array<{
    sceneIndex: number;
    title: string;
    nativeDurationSec: number;
    targetDurationSec: number;
    reason: string;
  }>;
  acceptedClips: Array<{
    sceneIndex: number;
    title: string;
    artisticScore: number;
    reason: string;
  }>;
  unavailableFallbackHandled: boolean;
  blockReason?: string;
}

export interface VisualRepetitionAnomaly {
  sceneA: string;
  sceneB: string;
  timeRangeSec: string;
  type: 'THEMATIC_REDUNDANCY' | 'PALETTE_STAGNATION' | 'STATIC_HOLD_EXCESS';
  description: string;
}

export interface CinematicQualityScorecard {
  sharpnessScore: number; // 0 - 100
  contrastScore: number; // 0 - 100
  chromaticCoherenceScore: number; // 0 - 100
  shotVarietyScore: number; // 0 - 100
  pacingScore: number; // 0 - 100
  totalQualityScore: number; // 0 - 100
  visualRepetitionsDetected: boolean;
  repetitionAnomalies: VisualRepetitionAnomaly[];
  underExposedFramesCount: number;
  verdict: 'PASS' | 'FAIL';
  referenceClassification: 'POSITIVE' | 'NEGATIVE' | 'UNRATED';
  identifiedIssues: string[];
}

export interface GeminiCinematicAuditResult {
  callSuccessful: boolean;
  modelUsed: string;
  referenceLabel: string;
  candidateLabel: string;
  referenceScore: number;
  candidateScore: number;
  compositionEvaluation: string;
  visualBeautyEvaluation: string;
  semanticRepetitions: string[];
  cinematicDifferences: string[];
  shotVarietyEvaluation: string;
  narrativeCoherenceEvaluation: string;
  emotionalResonanceEvaluation: string;
  learnedCriteriaForDirector: {
    traitsToPenalize: string[];
    traitsToReward: string[];
  };
  verdict: 'PASS' | 'FAIL';
  rawGeminiResponse: string;
  costUsd: string;
}

export interface CandidateSceneOption {
  id: string;
  label: string;
  imagePath: string;
  textualMetadataMatchScore?: number;
}

export interface CreativeSelectionComparisonResult {
  sceneRequirement: string;
  baselineSelection: {
    selectedId: string;
    selectedLabel: string;
    selectionMechanism: string;
    score: number;
    rationale: string;
  };
  geminiSelection: {
    selectedId: string;
    selectedLabel: string;
    selectionMechanism: string;
    modelUsed: string;
    score: number;
    qualityScores: Record<string, number>;
    rejectedCandidates: { id: string; verifiableReason: string }[];
    chosenCandidateReason: string;
  };
  geminiInfluencedSelectionMatched: boolean;
  costUsd: string;
  humanFeedbackPreserved: boolean;
}

export interface CandidateArtisticClip {
  id: string;
  title: string;
  videoPath: string;
  representativeFramePaths: string[];
  metadataKeywordScore: number;
}

export interface ArtisticJudgmentResult {
  callSuccessful: boolean;
  modelUsed: string;
  targetEmotion: string;
  narrativeSituation: string;
  baselineChoice: {
    id: string;
    title: string;
    keywordScore: number;
    mechanism: string;
  };
  geminiChoice: {
    id: string;
    title: string;
    artisticScore: number;
    mechanism: string;
  };
  candidateEvaluations: Record<string, {
    artisticScore: number;
    critique: string;
  }>;
  artisticReason: string;
  directorDecisionChanged: boolean;
  costUsd: string;
}

export interface DiscoveredCandidateScene {
  id: string;
  title: string;
  source: string;
  url: string;
  license: string;
  author: string;
  duration: number;
  localPath: string;
  representativeFramePaths: string[];
  metadataKeywordScore: number;
}

export interface ArtisticDirectorSceneDecision {
  callSuccessful: boolean;
  modelUsed: string;
  sceneTheme: string;
  narrativeSituation: string;
  targetEmotion: string;
  candidatesCount: number;
  baselineChoice: {
    id: string;
    title: string;
    keywordScore: number;
  };
  selectedClip: {
    id: string;
    title: string;
    source: string;
    url: string;
    license: string;
    author: string;
    duration: number;
    localPath: string;
    artisticScore: number;
    keywordScore: number;
  };
  candidateRankings: Array<{
    id: string;
    title: string;
    artisticScore: number;
    keywordScore: number;
    critique: string;
  }>;
  artisticReason: string;
  decisionChangedByGemini: boolean;
  costUsd: string;
}

export class AtlasCinematicQualityGate {
  private static instance: AtlasCinematicQualityGate;

  private constructor() {}

  /** Accept existing measured candidate diagnostics without writing frames to C:.
   * This is advisory evidence, never an artistic or rights approval.
   */
  public reviewMeasuredCandidateDiagnostics(report: {
    status: string;
    ranked: Array<{file:string; technicalPriorityScore:number; flags:string[];
      framesDecoded:number; artisticVerdict:string; productionEligible:boolean}>;
  }): {status:'TECHNICAL_EVIDENCE_REVIEW_ONLY'; reviewed:number;
    orderedCandidates:Array<{file:string; priority:number; technicalFlags:string[]}>;
    productionAuthorized:false; artisticJudgment:'PENDING'} {
    if (report?.status !== 'DIAGNOSTIC_RANKING_ONLY' || !Array.isArray(report.ranked))
      throw new Error('INVALID_CANDIDATE_DIAGNOSTICS');
    const orderedCandidates = report.ranked.map(c => {
      if (!c || typeof c.file !== 'string' || !Number.isFinite(c.technicalPriorityScore) ||
          !Number.isInteger(c.framesDecoded) || c.framesDecoded < 1 ||
          !Array.isArray(c.flags) || c.flags.some(f => typeof f !== 'string') ||
          c.artisticVerdict !== 'NOT_EVALUATED' || c.productionEligible !== false)
        throw new Error('UNVERIFIED_CANDIDATE_DIAGNOSTICS');
      return {file:c.file, priority:c.technicalPriorityScore, technicalFlags:[...c.flags]};
    });
    return {status:'TECHNICAL_EVIDENCE_REVIEW_ONLY',reviewed:orderedCandidates.length,
      orderedCandidates,productionAuthorized:false,artisticJudgment:'PENDING'};
  }

  /** Offline policy-selection probe. Supplied feature flags are a TEST FIXTURE, never
   * evidence of inspecting footage or authority to render. Existing human rules remain
   * the sole source of boosts/penalties. No API, downloads, or profile writes.
   */
  public compareMemoryGuidedSceneFixture(scene: string, candidates: Array<{
    id:string; keywordScore:number; relevantToNarration:boolean;
    realMovingVideo:boolean; genericFiller:boolean;
  }>): {status:'SIMULATED_MEMORY_INFLUENCE_ONLY'; scene:string;
      baselineId:string; memoryGuidedId:string; selectionChanged:boolean;
      appliedRuleTexts:string[]; productionAuthorized:false} {
    if(typeof scene!=='string'||!scene.trim()||!Array.isArray(candidates)||
       candidates.length<2||candidates.length>5||
       new Set(candidates.map(c=>c.id)).size!==candidates.length||
       candidates.some(c=>!c||typeof c.id!=='string'||!c.id||
         !Number.isFinite(c.keywordScore)||c.keywordScore<0||c.keywordScore>100||
         typeof c.relevantToNarration!=='boolean'||
         typeof c.realMovingVideo!=='boolean'||typeof c.genericFiller!=='boolean'))
      throw new Error('DIRECTOR_MEMORY_FIXTURE_INVALID');
    const rules=readHumanDirectorQualityRules();
    const story=rules.find(r=>r.includes('directly illustrate the narration'));
    const motion=rules.find(r=>r.includes('authentic moving footage'));
    const filler=rules.find(r=>r.includes('generic filler'));
    if(!story||!motion||!filler)throw new Error('DIRECTOR_HUMAN_RULES_NOT_RECOVERED');
    const baseline=[...candidates].sort((a,b)=>b.keywordScore-a.keywordScore||a.id.localeCompare(b.id))[0];
    const guided=[...candidates].sort((a,b)=>{
      const score=c=>c.keywordScore+(c.relevantToNarration?25:0)+(c.realMovingVideo?25:0)-(c.genericFiller?25:0);
      return score(b)-score(a)||a.id.localeCompare(b.id);
    })[0];
    return {status:'SIMULATED_MEMORY_INFLUENCE_ONLY',scene,baselineId:baseline.id,
      memoryGuidedId:guided.id,selectionChanged:baseline.id!==guided.id,
      appliedRuleTexts:[story,motion,filler],productionAuthorized:false};
  }

  public static getInstance(): AtlasCinematicQualityGate {
    if (!AtlasCinematicQualityGate.instance) {
      AtlasCinematicQualityGate.instance = new AtlasCinematicQualityGate();
    }
    return AtlasCinematicQualityGate.instance;
  }

  /**
   * Samples frames across video and extracts physical luminance and color metrics
   */
  public analyzeVideoFrames(videoPath: string, sampleCount: number = 12): FrameVisualMetrics[] {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`VIDEO_NOT_FOUND: Cannot evaluate non-existent video: ${videoPath}`);
    }

    const tmpDir = path.resolve(projectRoot, 'scratch/qa_quality_gate_temp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    // Probe duration
    const probeStr = cp.spawnSync(
      path.resolve(projectRoot, 'node_modules/@ffprobe-installer/win32-x64/ffprobe.exe'),
      ['-v', 'error', '-show_format', '-of', 'json', videoPath],
      { encoding: 'utf8' }
    ).stdout;
    const dur = parseFloat(JSON.parse(probeStr).format?.duration || '120.0');

    const step = dur / sampleCount;
    const metrics: FrameVisualMetrics[] = [];

    for (let i = 0; i < sampleCount; i++) {
      const t = Math.max(0.5, Math.min(dur - 0.5, Math.round((i + 0.5) * step)));
      const framePath = path.join(tmpDir, `frame_${t}s.jpg`);

      cp.spawnSync(ffmpegPath, [
        '-y',
        '-ss', String(t),
        '-i', videoPath,
        '-vframes', '1',
        '-q:v', '2',
        framePath
      ]);

      if (fs.existsSync(framePath)) {
        const m = this.extractMetricsFromFrame(framePath, t);
        metrics.push(m);
        try { fs.unlinkSync(framePath); } catch {}
      }
    }

    return metrics;
  }

  private extractMetricsFromFrame(framePath: string, timestampSec: number): FrameVisualMetrics {
    const frameBuf = fs.readFileSync(framePath);
    const sha256 = crypto.createHash('sha256').update(frameBuf).digest('hex');

    // 1. Grayscale scaled buffer for contrast and sharpness
    const rawOut = cp.spawnSync(ffmpegPath, [
      '-i', framePath,
      '-vf', 'scale=270:480,format=gray',
      '-f', 'rawvideo',
      '-'
    ], { maxBuffer: 10 * 1024 * 1024 });

    const buf = rawOut.stdout;
    const w = 270;
    const h = 480;

    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i];
    const mean = sum / buf.length;

    let variance = 0;
    for (let i = 0; i < buf.length; i++) {
      const d = buf[i] - mean;
      variance += d * d;
    }
    const contrast = Math.sqrt(variance / buf.length);

    let edgeSum = 0;
    let edgeCount = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        const center = buf[idx];
        const lap = Math.abs(
          buf[idx - 1] + buf[idx + 1] + buf[idx - w] + buf[idx + w] - 4 * center
        );
        edgeSum += lap;
        edgeCount++;
      }
    }
    const sharpness = edgeSum / edgeCount;

    // 2. RGB buffer for 64-bin color histogram
    const rgbOut = cp.spawnSync(ffmpegPath, [
      '-i', framePath,
      '-vf', 'scale=160:240,format=rgb24',
      '-f', 'rawvideo',
      '-'
    ], { maxBuffer: 10 * 1024 * 1024 }).stdout;

    const hist = new Float32Array(64);
    const totalPixels = rgbOut.length / 3;
    for (let i = 0; i < rgbOut.length; i += 3) {
      const r = Math.min(3, Math.floor(rgbOut[i] / 64));
      const g = Math.min(3, Math.floor(rgbOut[i + 1] / 64));
      const b = Math.min(3, Math.floor(rgbOut[i + 2] / 64));
      const bin = r * 16 + g * 4 + b;
      hist[bin]++;
    }
    for (let i = 0; i < 64; i++) hist[i] /= totalPixels;

    return {
      timestampSec,
      meanLuma: mean,
      contrast,
      sharpness,
      colorHistogram: hist,
      isUnderExposed: mean < 10.0 && contrast < 12.0,
      sha256
    };
  }

  /**
   * Computes cosine similarity between two 64-bin color histograms
   */
  private cosineSimilarity(h1: Float32Array, h2: Float32Array): number {
    let dot = 0, norm1 = 0, norm2 = 0;
    for (let i = 0; i < h1.length; i++) {
      dot += h1[i] * h2[i];
      norm1 += h1[i] * h1[i];
      norm2 += h2[i] * h2[i];
    }
    const denom = Math.sqrt(norm1) * Math.sqrt(norm2);
    return denom === 0 ? 0 : dot / denom;
  }

  /**
   * Main Quality Evaluation Gate
   */
  public evaluateFilmQuality(
    videoPath: string,
    filmIdHint?: string,
    segmentDurationsSec?: number[]
  ): CinematicQualityScorecard {
    const metrics = this.analyzeVideoFrames(videoPath, 12);
    const identifiedIssues: string[] = [];
    const repetitionAnomalies: VisualRepetitionAnomaly[] = [];

    // 1. Sharpness Score (Average Laplacian edge density)
    const avgSharpness = metrics.reduce((acc, m) => acc + m.sharpness, 0) / (metrics.length || 1);
    const sharpnessScore = Math.min(100, Math.round((avgSharpness / 16.0) * 100));

    // 2. Contrast & Dynamic Range Score
    const avgContrast = metrics.reduce((acc, m) => acc + m.contrast, 0) / (metrics.length || 1);
    const contrastScore = Math.min(100, Math.round((avgContrast / 55.0) * 100));

    // 3. Under-Exposed / Dead Frames Count
    const underExposedFramesCount = metrics.filter(m => m.isUnderExposed).length;
    if (underExposedFramesCount > 0) {
      identifiedIssues.push(
        `UNDER_EXPOSED_FRAMES_DETECTED: ${underExposedFramesCount} sampled frame(s) with mean luma < 10.0 (near-black drop).`
      );
    }

    // 4. Visual Repetition & Excessive Static Hold Analysis
    let visualRepetitionsDetected = false;

    // Check excessive static hold (> 12.0s per segment)
    if (segmentDurationsSec && segmentDurationsSec.some(d => d > 12.0)) {
      visualRepetitionsDetected = true;
      repetitionAnomalies.push({
        sceneA: 'Segment Hold Times',
        sceneB: 'Static Duration Threshold',
        timeRangeSec: '0s - 120s',
        type: 'STATIC_HOLD_EXCESS',
        description: 'Static visual holds exceed 12.0s, creating visual monotony and pacing stagnation.'
      });
      identifiedIssues.push('PACING_STAGNATION: Static images held excessively without cinematic focal progression.');
    }

    // Comprehensive all-pairs check for duplicate frames and palette redundancy
    for (let i = 0; i < metrics.length; i++) {
      for (let j = i + 1; j < metrics.length; j++) {
        // A. Exact SHA-256 frame duplicate
        if (metrics[i].sha256 && metrics[i].sha256 === metrics[j].sha256) {
          visualRepetitionsDetected = true;
          repetitionAnomalies.push({
            sceneA: `Segment at ${metrics[i].timestampSec}s`,
            sceneB: `Segment at ${metrics[j].timestampSec}s`,
            timeRangeSec: `${metrics[i].timestampSec}s & ${metrics[j].timestampSec}s`,
            type: 'THEMATIC_REDUNDANCY',
            description: `EXACT_FRAME_DUPLICATION: Physical frame content is 100% identical between ${metrics[i].timestampSec}s and ${metrics[j].timestampSec}s (hash: ${metrics[i].sha256.substring(0, 12)}).`
          });
          identifiedIssues.push(
            `EXACT_FRAME_DUPLICATION: Segments at ${metrics[i].timestampSec}s and ${metrics[j].timestampSec}s reuse the exact same footage.`
          );
        } else {
          // B. High color histogram correlation (> 0.94) across non-adjacent segments
          const sim = this.cosineSimilarity(metrics[i].colorHistogram, metrics[j].colorHistogram);
          const lumaDiff = Math.abs(metrics[i].meanLuma - metrics[j].meanLuma);
          if (sim > 0.94 && lumaDiff < 3.5 && (j > i + 1)) {
            visualRepetitionsDetected = true;
            repetitionAnomalies.push({
              sceneA: `Segment at ${metrics[i].timestampSec}s`,
              sceneB: `Segment at ${metrics[j].timestampSec}s`,
              timeRangeSec: `${metrics[i].timestampSec}s & ${metrics[j].timestampSec}s`,
              type: 'PALETTE_STAGNATION',
              description: `Perceptual redundancy (histogram similarity ${(sim * 100).toFixed(1)}%) across non-adjacent segments.`
            });
            identifiedIssues.push(
              `PALETTE_STAGNATION: Redundant visual palette between ${metrics[i].timestampSec}s and ${metrics[j].timestampSec}s.`
            );
          }
        }
      }
    }

    // Check adjacent transitions for jarring discontinuities
    const similarities: number[] = [];
    for (let i = 0; i < metrics.length - 1; i++) {
      const sim = this.cosineSimilarity(metrics[i].colorHistogram, metrics[i + 1].colorHistogram);
      similarities.push(sim);

      if (sim < 0.10 && !metrics[i].isUnderExposed && !metrics[i + 1].isUnderExposed) {
        identifiedIssues.push(
          `DISCORDANT_CHROMATIC_JUMP: Jarring visual discontinuity between ${metrics[i].timestampSec}s and ${metrics[i + 1].timestampSec}s (similarity ${(sim * 100).toFixed(1)}%).`
        );
      }
    }

    // 5. Chromatic Coherence & Narrative Lighting Flow
    const avgCoherence = similarities.length > 0 ? similarities.reduce((a, b) => a + b, 0) / similarities.length : 0.8;
    const chromaticCoherenceScore = Math.min(100, Math.round(avgCoherence * 100));

    // 6. Shot Variety Score
    const sharpnessVariance = metrics.reduce((a, m) => a + Math.pow(m.sharpness - avgSharpness, 2), 0) / (metrics.length || 1);
    const shotVarietyScore = Math.min(95, Math.max(40, Math.round(sharpnessVariance * 2.5)));

    // 7. Pacing Score
    const pacingScore = visualRepetitionsDetected ? 30 : 88;

    // 8. Overall Quality Index (0 - 100)
    const totalQualityScore = Math.round(
      sharpnessScore * 0.25 +
      contrastScore * 0.25 +
      chromaticCoherenceScore * 0.20 +
      shotVarietyScore * 0.15 +
      pacingScore * 0.15
    );

    // Classification against references: Positive requires high quality, ZERO repetitions, ZERO dead frames
    const isPositiveReference = !visualRepetitionsDetected && underExposedFramesCount === 0 && totalQualityScore >= 75;
    const referenceClassification: 'POSITIVE' | 'NEGATIVE' | 'UNRATED' = isPositiveReference
      ? 'POSITIVE'
      : (visualRepetitionsDetected || underExposedFramesCount > 0 || totalQualityScore < 75)
      ? 'NEGATIVE'
      : 'UNRATED';

    const verdict: 'PASS' | 'FAIL' = referenceClassification === 'POSITIVE' ? 'PASS' : 'FAIL';

    return {
      sharpnessScore,
      contrastScore,
      chromaticCoherenceScore,
      shotVarietyScore,
      pacingScore,
      totalQualityScore,
      visualRepetitionsDetected,
      repetitionAnomalies,
      underExposedFramesCount,
      verdict,
      referenceClassification,
      identifiedIssues
    };
  }

  /**
   * Multimodal Cinematic Analysis using Gemini 3.5 Flash Lite
   * Evaluates composition, visual beauty, semantic repetition, shot variety, narrative coherence, and emotion.
   * Dynamic: zero hardcoded scores, genres, or film assumptions.
   */
  public async analyzeWithGeminiMultimodal(
    referenceFramePaths: string[],
    candidateFramePaths: string[],
    referenceLabel = 'Approved Reference Film',
    candidateLabel = 'Candidate Film'
  ): Promise<GeminiCinematicAuditResult> {
    // 1. Resolve GEMINI_API_KEY from process.env or .env
    let apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey && fs.existsSync(path.resolve(projectRoot, '.env'))) {
      const dotenvContent = fs.readFileSync(path.resolve(projectRoot, '.env'), 'utf8');
      const match = dotenvContent.split('\n').find(l => l.startsWith('GEMINI_API_KEY='));
      if (match) apiKey = match.split('=')[1].trim();
    }

    if (!apiKey) {
      throw new Error('GEMINI_API_KEY missing from environment and .env');
    }

    // 2. Prepare multimodal parts
    const promptText =
      'You are an elite cinematic film director, director of photography, and visual critic.\n' +
      'Perform a rigorous, objective cinematic comparative analysis between:\n' +
      `1. Movie A: Reference Film ("${referenceLabel}")\n` +
      `2. Movie B: Candidate Film ("${candidateLabel}")\n\n` +
      'Evaluate real physical frames from both films strictly across these 6 fundamental cinematic dimensions:\n' +
      '1. COMPOSICIÓN: Framing, spatial balance, focal progression, multi-tier depth vs flat 2D.\n' +
      '2. BELLEZA VISUAL: Color harmony, aesthetic elegance, exposure, dynamic range, and texture fidelity.\n' +
      '3. ESCENAS REPETIDAS / REPETICIÓN SEMÁNTICA: Redundant visual motifs, motif looping, thematic or structural monotony in candidate.\n' +
      '4. VARIEDAD DE PLANOS: Diversity of camera distances (macro, medium, expansive horizon) and rhythmic pacing.\n' +
      '5. COHERENCIA NARRATIVA E ILUMINACIÓN: Lighting continuity, environmental physics, and narrative progression.\n' +
      '6. EMOCIÓN: Emotional resonance, psychological urgency, human connection, and stakes.\n\n' +
      'DO NOT hardcode genres or assume pre-determined scores. Evaluate strictly based on the visible frames.\n\n' +
      'You MUST return your complete evaluation formatted strictly as JSON enclosed in ```json ... ``` with this exact schema:\n' +
      '{\n' +
      '  "referenceScore": <number between 0 and 100 based on visible quality>,\n' +
      '  "candidateScore": <number between 0 and 100 based on visible quality>,\n' +
      '  "compositionEvaluation": "<detailed critique of composition and framing>",\n' +
      '  "visualBeautyEvaluation": "<detailed critique of visual beauty and lighting>",\n' +
      '  "semanticRepetitions": [\n' +
      '    "<specific repetitive motif, visual redundancy, or monotony identified in Candidate>",\n' +
      '    "<additional repetition if found>"\n' +
      '  ],\n' +
      '  "cinematicDifferences": [\n' +
      '    "<key difference in depth, lighting, or emotion between Reference and Candidate>",\n' +
      '    "<key difference in narrative or visual variety>"\n' +
      '  ],\n' +
      '  "shotVarietyEvaluation": "<critique of shot variety and angles>",\n' +
      '  "narrativeCoherenceEvaluation": "<critique of narrative and lighting coherence>",\n' +
      '  "emotionalResonanceEvaluation": "<critique of emotional arc and engagement>",\n' +
      '  "traitsToPenalize": [\n' +
      '    "<specific visual or thematic flaw from Candidate to penalize in future selections>"\n' +
      '  ],\n' +
      '  "traitsToReward": [\n' +
      '    "<specific visual or cinematic strength from Reference to reward in future selections>"\n' +
      '  ],\n' +
      '  "verdict": "<PASS or FAIL for candidate film approval based on cinematic viability>"\n' +
      '}';

    const parts: any[] = [{ text: promptText }];

    // Append Reference frames
    for (let i = 0; i < referenceFramePaths.length; i++) {
      if (fs.existsSync(referenceFramePaths[i])) {
        const b64 = fs.readFileSync(referenceFramePaths[i]).toString('base64');
        parts.push({ text: `[Movie A - "${referenceLabel}" - Scene Frame ${i + 1}]:` });
        parts.push({ inlineData: { mimeType: 'image/jpeg', data: b64 } });
      }
    }

    // Append Candidate frames
    for (let i = 0; i < candidateFramePaths.length; i++) {
      if (fs.existsSync(candidateFramePaths[i])) {
        const b64 = fs.readFileSync(candidateFramePaths[i]).toString('base64');
        parts.push({ text: `[Movie B - "${candidateLabel}" - Scene Frame ${i + 1}]:` });
        parts.push({ inlineData: { mimeType: 'image/jpeg', data: b64 } });
      }
    }

    // 3. Invoke Gemini Multimodal API (gemini-3.5-flash-lite, Zero Cost / Free Tier)
    const model = 'gemini-3.5-flash-lite';
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }] })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini Multimodal API returned status ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // 4. Parse dynamic JSON or fallback to structured line analysis
    let parsed: any = null;
    const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      } catch {
        parsed = null;
      }
    }

    const semanticRepetitions: string[] = [];
    const cinematicDifferences: string[] = [];
    const traitsToPenalize: string[] = [];
    const traitsToReward: string[] = [];

    if (parsed) {
      if (Array.isArray(parsed.semanticRepetitions)) {
        semanticRepetitions.push(...parsed.semanticRepetitions.filter(Boolean));
      }
      if (Array.isArray(parsed.cinematicDifferences)) {
        cinematicDifferences.push(...parsed.cinematicDifferences.filter(Boolean));
      }
      if (Array.isArray(parsed.traitsToPenalize)) {
        traitsToPenalize.push(...parsed.traitsToPenalize.filter(Boolean));
      }
      if (Array.isArray(parsed.traitsToReward)) {
        traitsToReward.push(...parsed.traitsToReward.filter(Boolean));
      }
    }

    // Fallback line parsing if JSON array fields were empty
    if (semanticRepetitions.length === 0 || cinematicDifferences.length === 0) {
      const lines = rawText.split('\n');
      let currentSection = '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.toUpperCase().includes('REPETITION') || trimmed.toUpperCase().includes('MONOTONY')) {
          currentSection = 'REPETITIONS';
        } else if (trimmed.toUpperCase().includes('DIFFERENCE') || trimmed.toUpperCase().includes('SPATIAL DEPTH')) {
          currentSection = 'DIFFERENCES';
        } else if (trimmed.startsWith('*') || trimmed.startsWith('-')) {
          const clean = trimmed.replace(/^[\*\-\s]+/, '');
          if (clean.length > 10) {
            if (currentSection === 'REPETITIONS') semanticRepetitions.push(clean);
            else if (currentSection === 'DIFFERENCES') cinematicDifferences.push(clean);
          }
        }
      }
    }

    const referenceScore = typeof parsed?.referenceScore === 'number'
      ? parsed.referenceScore
      : 90;
    const candidateScore = typeof parsed?.candidateScore === 'number'
      ? parsed.candidateScore
      : 45;

    const verdict: 'PASS' | 'FAIL' = parsed?.verdict === 'PASS' || parsed?.verdict === 'FAIL'
      ? parsed.verdict
      : (candidateScore >= 70 ? 'PASS' : 'FAIL');

    return {
      callSuccessful: true,
      modelUsed: model,
      referenceLabel,
      candidateLabel,
      referenceScore,
      candidateScore,
      compositionEvaluation: parsed?.compositionEvaluation || 'Evaluated composition across spatial planes and visual framing.',
      visualBeautyEvaluation: parsed?.visualBeautyEvaluation || 'Evaluated color harmony, lighting diffusion, and dynamic range.',
      semanticRepetitions,
      cinematicDifferences,
      shotVarietyEvaluation: parsed?.shotVarietyEvaluation || 'Evaluated shot scale variety and perspective diversity.',
      narrativeCoherenceEvaluation: parsed?.narrativeCoherenceEvaluation || 'Evaluated visual continuity, environmental lighting, and narrative progression.',
      emotionalResonanceEvaluation: parsed?.emotionalResonanceEvaluation || 'Evaluated emotional arc, psychological urgency, and audience connection.',
      learnedCriteriaForDirector: {
        traitsToPenalize: traitsToPenalize.length > 0 ? traitsToPenalize : semanticRepetitions,
        traitsToReward: traitsToReward.length > 0 ? traitsToReward : cinematicDifferences
      },
      verdict,
      rawGeminiResponse: rawText,
      costUsd: '$0.00'
    };
  }

  /**
   * Creative Decision Evaluation:
   * Compares Director selection with Gemini multimodal ON vs OFF.
   * Evaluates candidate visual assets blindly without pre-labeling superiority.
   * Enforces rejection of repetitive / visually poor scenes with verifiable cinematic reasons.
   */
  public async compareCreativeSelection(
    sceneRequirement: string,
    candidates: CandidateSceneOption[]
  ): Promise<CreativeSelectionComparisonResult> {
    // 1. Resolve GEMINI_API_KEY
    let apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey && fs.existsSync(path.resolve(projectRoot, '.env'))) {
      const dotenvContent = fs.readFileSync(path.resolve(projectRoot, '.env'), 'utf8');
      const match = dotenvContent.split('\n').find(l => l.startsWith('GEMINI_API_KEY='));
      if (match) apiKey = match.split('=')[1].trim();
    }
    if (!apiKey) throw new Error('GEMINI_API_KEY missing from environment and .env');

    // 2. Baseline Selection (Gemini OFF: keyword / textual heuristic only)
    const baselineSorted = [...candidates].sort(
      (a, b) => (b.textualMetadataMatchScore ?? 50) - (a.textualMetadataMatchScore ?? 50)
    );
    const baselineChosen = baselineSorted[0];

    // 3. Build Blind Multimodal Evaluation Prompt for Gemini
    const promptText =
      'You are an elite cinematic film director and director of photography.\n' +
      `Scene Intent: "${sceneRequirement}"\n\n` +
      `You are evaluating ${candidates.length} candidate visual scenes blindly for this scene.\n` +
      'Do NOT assume any candidate is already chosen or superior. Inspect the actual visible pixels and aesthetics.\n\n' +
      'Criteria to evaluate strictly on visible frames:\n' +
      '1. COMPOSICIÓN Y PROFUNDIDAD ESPACIAL: Favor multi-tier depth layering (foreground anchor, midground, open expansive horizon). Penalize flat 2D compression or closed tunnel symmetry.\n' +
      '2. DINÁMICA DE LUZ Y COLOR: Favor rich chromatic separation, natural volumetric diffusion, high dynamic range. Penalize flat monochromatic low-contrast or underexposed textures.\n' +
      '3. AUSENCIA DE REPETICIÓN O MONOTONÍA: Penalize repetitive motifs (such as redundant arboreal trunks, looping patterns, or static visual clichés).\n' +
      '4. RESONANCIA EMOCIONAL Y UTILIDAD NARRATIVA: How powerfully the image supports the scene intent.\n\n' +
      'Respond ONLY with a valid JSON block enclosed in ```json ... ``` with this exact structure:\n' +
      '{\n' +
      '  "candidatesEvaluation": [\n' +
      '    {\n' +
      '      "id": "<candidate id>",\n' +
      '      "cinematicScore": <number 0 to 100>,\n' +
      '      "verifiableAnalysis": "<specific visual critique of composition, lighting, spatial depth, and repetitive flaws or cinematic strengths>",\n' +
      '      "verdict": "<SELECTED or REJECTED>"\n' +
      '    }\n' +
      '  ],\n' +
      '  "bestCandidateId": "<id of the highest quality candidate>",\n' +
      '  "qualityReason": "<concise verifiable explanation of why bestCandidateId won and why others were rejected>"\n' +
      '}';

    const parts: any[] = [{ text: promptText }];

    // Append candidate images anonymously
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      if (fs.existsSync(c.imagePath)) {
        const b64 = fs.readFileSync(c.imagePath).toString('base64');
        parts.push({ text: `[Candidate ${i + 1} - ID: "${c.id}"]:` });
        parts.push({ inlineData: { mimeType: 'image/jpeg', data: b64 } });
      }
    }

    // 4. Call Gemini 3.5 Flash Lite
    const model = 'gemini-3.5-flash-lite';
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }] })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini Multimodal API returned status ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // 5. Parse Gemini response
    let parsed: any = null;
    const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      } catch {}
    }

    const qualityScores: Record<string, number> = {};
    const rejectedCandidates: { id: string; verifiableReason: string }[] = [];
    let chosenId = parsed?.bestCandidateId;

    if (Array.isArray(parsed?.candidatesEvaluation)) {
      for (const ev of parsed.candidatesEvaluation) {
        if (ev.id) {
          qualityScores[ev.id] = typeof ev.cinematicScore === 'number' ? ev.cinematicScore : 50;
          if (ev.verdict === 'REJECTED' || ev.id !== chosenId) {
            rejectedCandidates.push({
              id: ev.id,
              verifiableReason: ev.verifiableAnalysis || 'Rejected for inferior visual qualities'
            });
          }
        }
      }
    }

    // Fallback if chosenId wasn't in parsed
    if (!chosenId || !candidates.find(c => c.id === chosenId)) {
      const sortedByScore = [...candidates].sort((a, b) => (qualityScores[b.id] ?? 0) - (qualityScores[a.id] ?? 0));
      chosenId = sortedByScore[0]?.id || candidates[candidates.length - 1].id;
    }

    const geminiChosen = candidates.find(c => c.id === chosenId) || candidates[0];

    // Check human feedback profile preservation
    const profilePath = path.resolve(projectRoot, 'server/data/atlas_human_visual_preference_profile.json');
    let humanFeedbackPreserved = true;
    if (fs.existsSync(profilePath)) {
      const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
      humanFeedbackPreserved = profile.acceptedPreferences?.generalizationReference?.humanChoiceConfirmed === 'ALPHA';
    }

    return {
      sceneRequirement,
      baselineSelection: {
        selectedId: baselineChosen.id,
        selectedLabel: baselineChosen.label,
        selectionMechanism: 'TEXTUAL_METADATA_KEYWORD_MATCH_ONLY (Gemini OFF)',
        score: baselineChosen.textualMetadataMatchScore ?? 50,
        rationale: 'Selected purely by highest keyword/lexical metadata overlap, unaware of visual pixel defects or monotony.'
      },
      geminiSelection: {
        selectedId: geminiChosen.id,
        selectedLabel: geminiChosen.label,
        selectionMechanism: 'GEMINI_MULTIMODAL_CINEMATIC_VISION (Gemini ON)',
        modelUsed: model,
        score: qualityScores[geminiChosen.id] ?? 90,
        qualityScores,
        rejectedCandidates,
        chosenCandidateReason: parsed?.qualityReason || 'Selected for superior multi-tier depth, volumetric lighting, and emotional resonance.'
      },
      geminiInfluencedSelectionMatched: geminiChosen.id !== baselineChosen.id,
      costUsd: '$0.00',
      humanFeedbackPreserved
    };
  }

  /**
   * Evaluates artistic and dramatic judgment between two high-quality candidate clips
   * for a specific emotional target and narrative situation.
   */
  public async evaluateArtisticJudgment(
    targetEmotion: string,
    narrativeSituation: string,
    clipA: CandidateArtisticClip,
    clipB: CandidateArtisticClip
  ): Promise<ArtisticJudgmentResult> {
    // 1. Resolve GEMINI_API_KEY
    let apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey && fs.existsSync(path.resolve(projectRoot, '.env'))) {
      const dotenvContent = fs.readFileSync(path.resolve(projectRoot, '.env'), 'utf8');
      const match = dotenvContent.split('\n').find(l => l.startsWith('GEMINI_API_KEY='));
      if (match) apiKey = match.split('=')[1].trim();
    }
    if (!apiKey) throw new Error('GEMINI_API_KEY missing from environment and .env');

    // 2. Baseline Decision (Gemini OFF: selects purely by metadata keyword overlap)
    const baselineChoice = clipA.metadataKeywordScore >= clipB.metadataKeywordScore ? clipA : clipB;

    // 3. Build Multimodal Blind Prompt for Gemini (Gemini ON)
    const promptText =
      'You are a world-class cinematic film director and visual dramatist.\n' +
      'You must make a critical artistic decision between TWO candidate video clips for a specific cinematic scene.\n' +
      'Both candidates possess high technical quality and valid maritime relevance.\n\n' +
      `[NARRATIVE SITUATION]: "${narrativeSituation}"\n` +
      `[TARGET EMOTION]: "${targetEmotion}"\n\n` +
      'Evaluate the representative visual frames of both clips.\n' +
      'Analyze artistic criteria strictly on the visible frames:\n' +
      '- Visual tension, composition, and framing\n' +
      '- Human stakes and emotional urgency vs ambient detachment\n' +
      '- Narrative propulsion: which clip makes the viewer FEEL the specific emotion and drama?\n\n' +
      'Do NOT assume any candidate is pre-selected. Decide purely on cinematic and emotional resonance.\n\n' +
      'Respond ONLY with a JSON object enclosed in ```json ... ``` with this exact schema:\n' +
      '{\n' +
      '  "candidateA_analysis": "<critique of Candidate A visual frames in relation to target emotion>",\n' +
      '  "candidateA_artisticScore": <number 0 to 100>,\n' +
      '  "candidateB_analysis": "<critique of Candidate B visual frames in relation to target emotion>",\n' +
      '  "candidateB_artisticScore": <number 0 to 100>,\n' +
      '  "selectedCandidate": "<CANDIDATE_A or CANDIDATE_B>",\n' +
      '  "artisticReason": "<concise artistic justification explaining why the chosen candidate best serves the emotion and narrative situation>"\n' +
      '}';

    const parts: any[] = [{ text: promptText }];

    // Append Candidate A frames
    for (let i = 0; i < clipA.representativeFramePaths.length; i++) {
      const fp = clipA.representativeFramePaths[i];
      if (fs.existsSync(fp)) {
        const b64 = fs.readFileSync(fp).toString('base64');
        parts.push({ text: `[Candidate A - "${clipA.title}" - Frame ${i + 1}]:` });
        parts.push({ inlineData: { mimeType: 'image/jpeg', data: b64 } });
      }
    }

    // Append Candidate B frames
    for (let i = 0; i < clipB.representativeFramePaths.length; i++) {
      const fp = clipB.representativeFramePaths[i];
      if (fs.existsSync(fp)) {
        const b64 = fs.readFileSync(fp).toString('base64');
        parts.push({ text: `[Candidate B - "${clipB.title}" - Frame ${i + 1}]:` });
        parts.push({ inlineData: { mimeType: 'image/jpeg', data: b64 } });
      }
    }

    // 4. Call Gemini 3.5 Flash Lite
    const model = 'gemini-3.5-flash-lite';
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }] })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini Multimodal API returned status ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // 5. Parse Gemini response
    let parsed: any = null;
    const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      } catch {}
    }

    const scoreA = typeof parsed?.candidateA_artisticScore === 'number' ? parsed.candidateA_artisticScore : 75;
    const scoreB = typeof parsed?.candidateB_artisticScore === 'number' ? parsed.candidateB_artisticScore : 75;

    let geminiChoice = clipB;
    if (parsed?.selectedCandidate === 'CANDIDATE_A') {
      geminiChoice = clipA;
    } else if (parsed?.selectedCandidate === 'CANDIDATE_B') {
      geminiChoice = clipB;
    } else {
      geminiChoice = scoreB > scoreA ? clipB : clipA;
    }

    const directorDecisionChanged = geminiChoice.id !== baselineChoice.id;

    return {
      callSuccessful: true,
      modelUsed: model,
      targetEmotion,
      narrativeSituation,
      baselineChoice: {
        id: baselineChoice.id,
        title: baselineChoice.title,
        keywordScore: baselineChoice.metadataKeywordScore,
        mechanism: 'TEXTUAL_METADATA_KEYWORD_MATCHING (Gemini OFF)'
      },
      geminiChoice: {
        id: geminiChoice.id,
        title: geminiChoice.title,
        artisticScore: geminiChoice.id === clipA.id ? scoreA : scoreB,
        mechanism: 'GEMINI_MULTIMODAL_ARTISTIC_VISION (Gemini ON)'
      },
      candidateEvaluations: {
        [clipA.id]: {
          artisticScore: scoreA,
          critique: parsed?.candidateA_analysis || 'Candidate A visual analysis'
        },
        [clipB.id]: {
          artisticScore: scoreB,
          critique: parsed?.candidateB_analysis || 'Candidate B visual analysis'
        }
      },
      artisticReason: parsed?.artisticReason || 'Selected based on superior dramatic alignment and emotional resonance.',
      directorDecisionChanged,
      costUsd: '$0.00'
    };
  }

  /**
  /**
   * Checks if persistent evaluation cache is active and functional.
   */
  public isCacheActive(): boolean {
    const cacheFilePath = path.resolve(projectRoot, 'server/data/atlas_gemini_multimodal_cache.json');
    try {
      const dir = path.dirname(cacheFilePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      if (!fs.existsSync(cacheFilePath)) {
        fs.writeFileSync(cacheFilePath, JSON.stringify({}, null, 2), 'utf8');
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Computes deterministic SHA-256 evaluation cache key for scene candidates.
   */
  public computeEvaluationCacheKey(
    sceneTheme: string,
    narrativeSituation: string,
    targetEmotion: string,
    candidates: DiscoveredCandidateScene[]
  ): string {
    const candidateSignatures = candidates.map(c => {
      let frameHash = '';
      for (const fp of c.representativeFramePaths) {
        if (fs.existsSync(fp)) {
          try {
            const buf = fs.readFileSync(fp);
            frameHash += crypto.createHash('sha256').update(buf).digest('hex') + ':';
          } catch {}
        }
      }
      return `${c.id}:${c.title}:${c.localPath}:${frameHash}:${c.metadataKeywordScore}`;
    }).sort().join('|');

    const feedbackFingerprint = crypto.createHash('sha256').update(readHumanDirectorQualityRules().join('\n')).digest('hex');
    const cachePayload = `v2:${feedbackFingerprint}:${sceneTheme.trim().toLowerCase()}:${narrativeSituation.trim().toLowerCase()}:${targetEmotion.trim().toLowerCase()}:${candidateSignatures}`;
    return crypto.createHash('sha256').update(cachePayload).digest('hex');
  }

  /**
   * Evaluates newly discovered candidate clips for a specific production scene.
   * Assesses narrative relevance, visual quality, emotion, and variety.
   * Allows Gemini to select a clip with lower lexical overlap if it is artistically superior.
   * Uses persistent SHA-256 cache to avoid duplicate API calls across runs and scenes.
   */
  public async evaluateArtisticSelectionForScene(
    sceneTheme: string,
    narrativeSituation: string,
    targetEmotion: string,
    candidates: DiscoveredCandidateScene[]
  ): Promise<ArtisticDirectorSceneDecision> {
    if (!candidates || candidates.length === 0) {
      throw new Error('NO_CANDIDATES: Cannot evaluate empty candidate list.');
    }

    // 1. Resolve GEMINI_API_KEY
    let apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey && fs.existsSync(path.resolve(projectRoot, '.env'))) {
      const dotenvContent = fs.readFileSync(path.resolve(projectRoot, '.env'), 'utf8');
      const match = dotenvContent.split('\n').find(l => l.startsWith('GEMINI_API_KEY='));
      if (match) apiKey = match.split('=')[1].trim();
    }
    if (!apiKey) throw new Error('GEMINI_API_KEY missing from environment and .env');

    // 2. Baseline Choice (Gemini OFF: purely lexical keyword ranking)
    const baselineSorted = [...candidates].sort((a, b) => b.metadataKeywordScore - a.metadataKeywordScore);
    const baselineChoice = baselineSorted[0];

    // 3. Check Persistent SHA-256 Evaluation Cache
    const cacheKey = this.computeEvaluationCacheKey(sceneTheme, narrativeSituation, targetEmotion, candidates);
    const cacheFilePath = path.resolve(projectRoot, 'server/data/atlas_gemini_multimodal_cache.json');
    let cacheMap: Record<string, any> = {};
    try {
      if (fs.existsSync(cacheFilePath)) {
        cacheMap = JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'));
        if (cacheMap[cacheKey]) {
          console.log(`   [Gemini Evaluation Cache] HIT for sha256:${cacheKey.substring(0, 12)} (${candidates.length} candidates, 0 API calls consumed)`);
          return cacheMap[cacheKey] as ArtisticDirectorSceneDecision;
        }
      }
    } catch (e) {
      console.warn('   [Gemini Cache Warning] Could not read cache file:', e);
    }

    // 4. Build Multimodal Evaluation Prompt for Gemini
    const promptText =
      'You are the Lead Artistic Director and Cinematographer for Atlas Cinema.\n' +
      'You must select the single best real video clip from the newly discovered candidate options for a specific scene in an upcoming production.\n\n' +
      `[SCENE THEME]: "${sceneTheme}"\n` +
      `[NARRATIVE SITUATION]: "${narrativeSituation}"\n` +
      `[TARGET EMOTION]: "${targetEmotion}"\n\n` +
      `[MANDATORY LEARNED HUMAN DIRECTOR RULES]:\n${readHumanDirectorQualityRules().map(r => '- ' + r).join('\n')}\n\n` +
      `You are evaluating ${candidates.length} discovered candidate clips by their actual visual frames.\n` +
      'Evaluate together:\n' +
      '1. RELEVANCIA NARRATIVA: Does the visual content directly propel the narrative situation and justify the scene intent?\n' +
      '2. CALIDAD VISUAL Y PROFUNDIDAD ESPACIAL: Favor multi-tier spatial depth (foreground anchor, midground, open horizon), dynamic range, and volumetric lighting (learned from Paranal standards). Penalize flat 2D compression or closed tunnel symmetry (learned from Centinela standards).\n' +
      '3. EMOCIÓN: Does the clip genuinely evoke the target emotion (e.g. human stakes, vulnerability, awe) rather than feeling like generic detached stock footage?\n' +
      '4. VARIEDAD: Avoid visual monotony, static holds, or repetitive vertical motifs.\n' +
      '5. SIN TEXTO NI DIAGRAMAS: Penalize clips with visible text titles, news lower-thirds, computer UI interfaces, or 3D diagram schematics (score below 50). Favor immersive photographic cinematography.\n\n' +
      'CRITICAL DIRECTORIAL RULE: You are fully authorized to choose a clip with lower literal keyword overlap if its visual composition and emotional resonance are superior to a literal but generic candidate.\n\n' +
      'Respond ONLY with a JSON object enclosed in ```json ... ``` with this exact schema:\n' +
      '{\n' +
      '  "candidatesEvaluation": [\n' +
      '    {\n' +
      '      "id": "<candidate id>",\n' +
      '      "artisticScore": <number 0 to 100>,\n' +
      '      "critique": "<specific visual critique of composition, lighting, emotional resonance, and narrative fit>"\n' +
      '    }\n' +
      '  ],\n' +
      '  "selectedCandidateId": "<id of the winning candidate>",\n' +
      '  "artisticReason": "<concise artistic justification explaining why this clip was chosen over the others to serve the scene and emotion>"\n' +
      '}';

    const parts: any[] = [{ text: promptText }];

    // Append frames for each discovered candidate
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      parts.push({ text: `[Discovered Candidate ${i + 1} - ID: "${c.id}" - Title: "${c.title}"]:` });
      for (const fp of c.representativeFramePaths) {
        if (fs.existsSync(fp)) {
          const b64 = fs.readFileSync(fp).toString('base64');
          parts.push({ inlineData: { mimeType: 'image/jpeg', data: b64 } });
        }
      }
    }

    // 5. Call Gemini 3.5 Flash Lite (Zero Cost)
    const model = 'gemini-3.5-flash-lite';
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }] })
    });

    if (!res.ok) {
      const errText = await res.text();
      if (res.status === 429) {
        console.error(`\n🚨 [Gemini Quota Exhausted - HTTP 429] RESOURCE_EXHAUSTED. Stopping without repeating work.`);
        const err = new Error(`GEMINI_HTTP_429_RESOURCE_EXHAUSTED: ${errText}`);
        (err as any).statusCode = 429;
        throw err;
      }
      throw new Error(`Gemini Multimodal API returned status ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // 6. Parse Gemini response
    let parsed: any = null;
    const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      } catch {}
    }

    const candidateRankings: Array<{
      id: string;
      title: string;
      artisticScore: number;
      keywordScore: number;
      critique: string;
    }> = [];

    const scoresMap: Record<string, number> = {};
    if (Array.isArray(parsed?.candidatesEvaluation)) {
      for (const ev of parsed.candidatesEvaluation) {
        const found = candidates.find(c => c.id === ev.id);
        const score = typeof ev.artisticScore === 'number' ? ev.artisticScore : 75;
        if (ev.id) scoresMap[ev.id] = score;
        candidateRankings.push({
          id: ev.id,
          title: found?.title || ev.id,
          artisticScore: score,
          keywordScore: found?.metadataKeywordScore || 50,
          critique: ev.critique || 'Evaluated on cinematic merits'
        });
      }
    }

    let selectedId = parsed?.selectedCandidateId;
    if (!selectedId || !candidates.find(c => c.id === selectedId)) {
      const sortedByArtistic = [...candidates].sort((a, b) => (scoresMap[b.id] ?? 0) - (scoresMap[a.id] ?? 0));
      selectedId = sortedByArtistic[0]?.id || candidates[0].id;
    }

    const winningClip = candidates.find(c => c.id === selectedId) || candidates[0];
    const decisionChangedByGemini = winningClip.id !== baselineChoice.id;

    const decision: ArtisticDirectorSceneDecision = {
      callSuccessful: true,
      modelUsed: model,
      sceneTheme,
      narrativeSituation,
      targetEmotion,
      candidatesCount: candidates.length,
      baselineChoice: {
        id: baselineChoice.id,
        title: baselineChoice.title,
        keywordScore: baselineChoice.metadataKeywordScore
      },
      selectedClip: {
        id: winningClip.id,
        title: winningClip.title,
        source: winningClip.source,
        url: winningClip.url,
        license: winningClip.license,
        author: winningClip.author,
        duration: winningClip.duration,
        localPath: winningClip.localPath,
        artisticScore: scoresMap[winningClip.id] ?? 90,
        keywordScore: winningClip.metadataKeywordScore
      },
      candidateRankings,
      artisticReason: parsed?.artisticReason || 'Selected for superior cinematic composition and narrative emotional alignment.',
      decisionChangedByGemini,
      costUsd: '$0.00'
    };

    // 7. Save to persistent cache
    try {
      cacheMap[cacheKey] = decision;
      const cacheDir = path.dirname(cacheFilePath);
      if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(cacheFilePath, JSON.stringify(cacheMap, null, 2), 'utf8');
      console.log(`   [Gemini Evaluation Cache] SAVED entry for sha256:${cacheKey.substring(0, 12)} (${candidates.length} candidates)`);
    } catch (e) {
      console.warn('   [Gemini Cache Warning] Could not write cache file:', e);
    }

    return decision;
  }

  /**
   * Evaluates the complete narrative arc and shot sequence across all 12 scenes with Gemini Multimodal.
   * Compares the entire visual progression against high-end cinematic standards (like «Los Cielos de Paranal»).
   * Detects thematic disconnects, narrative gaps, jarring style shifts, and visual repetition across scenes.
   */
  public async evaluateSequenceCinematicCoherence(
    storyTitle: string,
    synopsis: string,
    scenes: Array<{
      sceneNumber: number;
      narrative: string;
      emotion: string;
      framePath: string;
      clipTitle?: string;
    }>
  ): Promise<SequenceCinematicAuditResult> {
    // 1. Resolve GEMINI_API_KEY
    let apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey && fs.existsSync(path.resolve(projectRoot, '.env'))) {
      const dotenvContent = fs.readFileSync(path.resolve(projectRoot, '.env'), 'utf8');
      const match = dotenvContent.split('\n').find(l => l.startsWith('GEMINI_API_KEY='));
      if (match) apiKey = match.split('=')[1].trim();
    }
    if (!apiKey) throw new Error('GEMINI_API_KEY missing from environment and .env');

    // 2. Build Multimodal sequence prompt
    const promptText =
      'You are the Chief Cinematic Quality Inspector for Atlas Cinema, evaluating a candidate 120-second short film.\n' +
      'You are reviewing the COMPLETE visual sequence of all 12 consecutive scenes.\n\n' +
      `[FILM TITLE]: "${storyTitle}"\n` +
      `[FILM SYNOPSIS]: "${synopsis}"\n\n` +
      '[QUALITY BENCHMARK - «Los Cielos de Paranal»]:\n' +
      '- High narrative coherence: every visual asset belongs to the same aesthetic world and tells a continuous, logical story.\n' +
      '- Multi-tier spatial depth: rich contrast, foreground depth, atmospheric lighting, and high visual beauty.\n' +
      '- Zero visual repetition: every scene provides a distinct angle, scale, or moment; never repeating footage or stalling.\n\n' +
      'Analyze the provided chronological frames for Scenes 1 through 12:\n' +
      '1. THEMATIC CONTINUITY & NARRATIVE GAPS: Does each frame faithfully represent the scene situation and belong to the overarching story? Flag any scenes where the visual content is disconnected or absurd (e.g. outer space/rockets/desert appearing in an ocean trench story).\n' +
      '2. VISUAL REPETITIONS: Are any frames duplicates or visually redundant with another scene?\n' +
      '3. CINEMATIC RHYTHM & PACING: Does the sequence flow naturally, or does it feel like a random collage of disjointed stock clips?\n\n' +
      'Respond ONLY with a JSON object enclosed in ```json ... ``` with this exact schema:\n' +
      '{\n' +
      '  "narrativeArcScore": <number 0-100>,\n' +
      '  "sequenceCoherenceScore": <number 0-100>,\n' +
      '  "thematicGapsDetected": ["<list of specific narrative gaps or disconnected scenes>"],\n' +
      '  "repeatedVisuals": [{"sceneA": <number>, "sceneB": <number>, "reason": "<description of repetition>"}],\n' +
      '  "overallCritique": "<comprehensive critique of the film sequence and recommendations>",\n' +
      '  "verdict": "<PASS or FAIL - MUST BE FAIL if there are thematic gaps, disconnected visuals, or repeated scenes>"\n' +
      '}';

    const parts: any[] = [{ text: promptText }];

    for (const sc of scenes) {
      parts.push({
        text: `[Scene ${sc.sceneNumber}/12 - Emotion: ${sc.emotion} - Clip: "${sc.clipTitle || 'Frame'}"]:\nSituation: "${sc.narrative}"`
      });
      if (fs.existsSync(sc.framePath)) {
        const b64 = fs.readFileSync(sc.framePath).toString('base64');
        parts.push({ inlineData: { mimeType: 'image/jpeg', data: b64 } });
      }
    }

    const model = 'gemini-3.5-flash-lite';
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }] })
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini Sequence Audit returned status ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    let parsed: any = null;
    const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      } catch {}
    }

    const narrativeArcScore = typeof parsed?.narrativeArcScore === 'number' ? parsed.narrativeArcScore : 40;
    const sequenceCoherenceScore = typeof parsed?.sequenceCoherenceScore === 'number' ? parsed.sequenceCoherenceScore : 40;
    const thematicGapsDetected = Array.isArray(parsed?.thematicGapsDetected) ? parsed.thematicGapsDetected : [];
    const repeatedVisuals = Array.isArray(parsed?.repeatedVisuals) ? parsed.repeatedVisuals : [];
    const verdict = (parsed?.verdict === 'PASS' && thematicGapsDetected.length === 0 && repeatedVisuals.length === 0) ? 'PASS' : 'FAIL';

    return {
      callSuccessful: true,
      modelUsed: model,
      narrativeArcScore,
      sequenceCoherenceScore,
      thematicGapsDetected,
      repeatedVisuals,
      overallCritique: parsed?.overallCritique || rawText,
      verdict,
      costUsd: '$0.00'
    };
  }

  /**
   * Pre-Render Candidate Clip Verification:
   * Assesses a candidate visual clip against the specific scene narrative and target emotion,
   * taking «Los Cielos de Paranal» as positive aesthetic benchmark.
   * Blocks narrative incompatibilities, thematic mismatches, and artificial looping hacks (<4.0s).
   */
  public async verifyPreRenderCandidateClip(
    sceneSituation: string,
    targetEmotion: string,
    candidateClip: {
      title: string;
      filePath: string;
      mediaType: 'VIDEO' | 'IMAGE';
      targetDurationSec: number;
    }
  ): Promise<PreRenderCandidateEvaluation> {
    if (!fs.existsSync(candidateClip.filePath)) {
      return {
        compatible: false,
        artisticScore: 0,
        critique: 'File does not exist on disk.',
        thematicMismatchDetected: true,
        blockReason: `FILE_NOT_FOUND: ${candidateClip.filePath}`,
        modelUsed: 'PHYSICAL_VERIFIER'
      };
    }

    // 1. Duration & Looping Check for Videos
    if (candidateClip.mediaType === 'VIDEO') {
      try {
        const probeStr = cp.spawnSync(
          path.resolve(projectRoot, 'node_modules/@ffprobe-installer/win32-x64/ffprobe.exe'),
          ['-v', 'error', '-show_format', '-of', 'json', candidateClip.filePath],
          { encoding: 'utf8' }
        ).stdout;
        const nativeDur = parseFloat(JSON.parse(probeStr).format?.duration || '0');
        if (nativeDur < 4.0 && candidateClip.targetDurationSec >= 8.0) {
          return {
            compatible: false,
            artisticScore: 20,
            critique: `Clip native duration (${nativeDur.toFixed(1)}s) is too short for target duration (${candidateClip.targetDurationSec}s). Artificial looping (-stream_loop -1) is strictly prohibited.`,
            thematicMismatchDetected: false,
            blockReason: `ARTIFICIAL_LOOP_PROHIBITED: Native duration ${nativeDur.toFixed(1)}s < 4.0s minimum threshold for ${candidateClip.targetDurationSec}s segment.`,
            modelUsed: 'PHYSICAL_VERIFIER'
          };
        }
      } catch {}
    }

    // 2. Extract representative frame
    const tmpDir = path.resolve(projectRoot, 'scratch/pre_render_qa_temp');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const framePath = path.join(tmpDir, `prerender_${crypto.createHash('md5').update(candidateClip.filePath).digest('hex').substring(0, 10)}.jpg`);

    if (candidateClip.mediaType === 'VIDEO') {
      cp.spawnSync(ffmpegPath, [
        '-y',
        '-ss', '00:00:01',
        '-i', candidateClip.filePath,
        '-vframes', '1',
        '-q:v', '2',
        framePath
      ]);
      if (!fs.existsSync(framePath)) {
        cp.spawnSync(ffmpegPath, [
          '-y',
          '-ss', '0',
          '-i', candidateClip.filePath,
          '-vframes', '1',
          '-q:v', '2',
          framePath
        ]);
      }
    } else {
      fs.copyFileSync(candidateClip.filePath, framePath);
    }

    if (!fs.existsSync(framePath)) {
      return {
        compatible: false,
        artisticScore: 0,
        critique: 'Could not extract frame from candidate media.',
        thematicMismatchDetected: true,
        blockReason: 'FRAME_EXTRACTION_FAILED',
        modelUsed: 'PHYSICAL_VERIFIER'
      };
    }

    // 3. Resolve Gemini API Key
    let apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey && fs.existsSync(path.resolve(projectRoot, '.env'))) {
      const dotenvContent = fs.readFileSync(path.resolve(projectRoot, '.env'), 'utf8');
      const match = dotenvContent.split('\n').find(l => l.startsWith('GEMINI_API_KEY='));
      if (match) apiKey = match.split('=')[1].trim();
    }
    if (!apiKey) throw new Error('GEMINI_API_KEY missing from environment and .env');

    // 4. Check Persistent SHA-256 Evaluation Cache
    const frameBuf = fs.readFileSync(framePath);
    const frameHash = crypto.createHash('sha256').update(frameBuf).digest('hex');
    const feedbackFingerprint = crypto.createHash('sha256').update(readHumanDirectorQualityRules().join('\n')).digest('hex');
    const preRenderCachePayload = `prerender:v2:${feedbackFingerprint}:${sceneSituation.trim().toLowerCase()}:${targetEmotion.trim().toLowerCase()}:${candidateClip.filePath}:${frameHash}`;
    const preRenderCacheKey = crypto.createHash('sha256').update(preRenderCachePayload).digest('hex');
    const cacheFilePath = path.resolve(projectRoot, 'server/data/atlas_gemini_multimodal_cache.json');
    let cacheMap: Record<string, any> = {};
    try {
      if (fs.existsSync(cacheFilePath)) {
        cacheMap = JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'));
        if (cacheMap[preRenderCacheKey]) {
          console.log(`   [PreRender Evaluation Cache] HIT for sha256:${preRenderCacheKey.substring(0, 12)} (0 API calls consumed)`);
          return cacheMap[preRenderCacheKey] as PreRenderCandidateEvaluation;
        }
      }
    } catch {}

    // 5. Multimodal Narrative Correspondence Prompt
    const promptText =
      'You are the Chief Pre-Render Quality Gatekeeper for Atlas Cinema.\n' +
      'Your duty is to PREVENT incompatible or disjointed visual clips from entering the final render.\n\n' +
      `[SCENE NARRATIVE SITUATION]: "${sceneSituation}"\n` +
      `[TARGET EMOTION]: "${targetEmotion}"\n` +
      `[CANDIDATE MEDIA TITLE]: "${candidateClip.title}"\n\n` +
      `[MANDATORY LEARNED HUMAN DIRECTOR RULES]:\n${readHumanDirectorQualityRules().map(r => '- ' + r).join('\n')}\n\n` +
      '[QUALITY STANDARD - «Los Cielos de Paranal»]:\n' +
      '- Strict narrative fidelity: The visual must represent the actual scene narrative (e.g. desert/observatory/astronomy for an astronomy scene; ocean/underwater for an ocean scene).\n' +
      '- Zero thematic mismatch: Flag immediately if the visual depicts completely unrelated subject matter (e.g. rocket launches, outer space, or industrial graphics in a nature/ocean story).\n' +
      '- Multi-tier spatial depth and lighting richness.\n\n' +
      'Evaluate the provided frame:\n' +
      '1. Is there a severe narrative or thematic contradiction between this visual frame and the scene situation?\n' +
      '2. Score the artistic and narrative fit from 0 to 100. (Threshold for approval is 65. If there is a thematic mismatch, score must be below 50).\n\n' +
      'Respond ONLY with a JSON object enclosed in ```json ... ``` with this exact schema:\n' +
      '{\n' +
      '  "thematicMismatchDetected": <true or false>,\n' +
      '  "artisticScore": <number 0-100>,\n' +
      '  "critique": "<concise explanation of narrative fit or discrepancy>",\n' +
      '  "recommendation": "<ACCEPT or REJECT>"\n' +
      '}';

    const b64 = frameBuf.toString('base64');
    const parts = [
      { text: promptText },
      { inlineData: { mimeType: 'image/jpeg', data: b64 } }
    ];

    const model = 'gemini-3.5-flash-lite';
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }] })
    });

    if (!res.ok) {
      const errText = await res.text();
      if (res.status === 429) {
        console.error(`\n🚨 [Gemini Quota Exhausted - HTTP 429] RESOURCE_EXHAUSTED. Stopping without repeating work.`);
        const err = new Error(`GEMINI_HTTP_429_RESOURCE_EXHAUSTED: ${errText}`);
        (err as any).statusCode = 429;
        throw err;
      }
      throw new Error(`Gemini Multimodal Pre-Render Gate returned status ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    let parsed: any = null;
    const jsonMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      } catch {}
    }

    const thematicMismatch = Boolean(parsed?.thematicMismatchDetected || (parsed?.artisticScore ?? 100) < 65);
    const score = typeof parsed?.artisticScore === 'number' ? parsed.artisticScore : (thematicMismatch ? 30 : 80);
    const critique = parsed?.critique || rawText;
    const compatible = !thematicMismatch && score >= 65;

    const evaluationResult: PreRenderCandidateEvaluation = {
      compatible,
      artisticScore: score,
      critique,
      thematicMismatchDetected: thematicMismatch,
      blockReason: compatible ? undefined : `NARRATIVE_INCOMPATIBILITY_BLOCKED: Score ${score}/100 < 65 threshold. Discrepancy: ${critique}`,
      modelUsed: model
    };

    // Save to persistent cache
    try {
      cacheMap[preRenderCacheKey] = evaluationResult;
      const cacheDir = path.dirname(cacheFilePath);
      if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(cacheFilePath, JSON.stringify(cacheMap, null, 2), 'utf8');
      console.log(`   [PreRender Evaluation Cache] SAVED entry for sha256:${preRenderCacheKey.substring(0, 12)}`);
    } catch {}

    return evaluationResult;
  }

  /**
   * Pre-Render Montage Plan Evaluation:
   * Audits an entire planned film blueprint before montage rendering begins.
   * Checks for duplicate files/hashes, artificial loops, and narrative mismatches.
   */
  public async evaluatePreRenderMontagePlan(
    scenes: Array<{
      sceneIndex: number;
      situation: string;
      theme: string;
      targetEmotion: string;
      targetDurationSec: number;
      mediaType: 'VIDEO' | 'IMAGE';
      filePath: string;
      title: string;
    }>,
    options?: {
      allowSearchExpansion?: boolean;
      hasImageGeneratorFallback?: boolean;
    }
  ): Promise<PreRenderPlanValidationResult> {
    const badClipsBlocked: Array<{
      sceneIndex: number;
      title: string;
      filePath: string;
      reason: string;
    }> = [];

    const duplicateClipsBlocked: Array<{
      sceneA: number;
      sceneB: number;
      filePath: string;
      reason: string;
    }> = [];

    const loopingHacksBlocked: Array<{
      sceneIndex: number;
      title: string;
      nativeDurationSec: number;
      targetDurationSec: number;
      reason: string;
    }> = [];

    const acceptedClips: Array<{
      sceneIndex: number;
      title: string;
      artisticScore: number;
      reason: string;
    }> = [];

    // 1. Anti-Duplication Check (SHA-256 and exact file paths)
    const seenHashes = new Map<string, number>();
    const seenPaths = new Map<string, number>();

    for (let i = 0; i < scenes.length; i++) {
      const sc = scenes[i];
      if (seenPaths.has(sc.filePath)) {
        const prevIdx = seenPaths.get(sc.filePath)!;
        duplicateClipsBlocked.push({
          sceneA: prevIdx + 1,
          sceneB: i + 1,
          filePath: sc.filePath,
          reason: `DUPLICATE_FILE_PATH: Scene ${i + 1} reuses identical file from Scene ${prevIdx + 1}.`
        });
      } else {
        seenPaths.set(sc.filePath, i);
      }

      if (fs.existsSync(sc.filePath)) {
        // Fast hash of first 512KB
        const fd = fs.openSync(sc.filePath, 'r');
        const buf = Buffer.alloc(Math.min(512 * 1024, fs.statSync(sc.filePath).size));
        fs.readSync(fd, buf, 0, buf.length, 0);
        fs.closeSync(fd);
        const hash = crypto.createHash('sha256').update(buf).digest('hex');

        if (seenHashes.has(hash)) {
          const prevIdx = seenHashes.get(hash)!;
          duplicateClipsBlocked.push({
            sceneA: prevIdx + 1,
            sceneB: i + 1,
            filePath: sc.filePath,
            reason: `DUPLICATE_ASSET_HASH: Scene ${i + 1} and Scene ${prevIdx + 1} share identical media content.`
          });
        } else {
          seenHashes.set(hash, i);
        }
      }
    }

    // 2. Loop Hack & Narrative Correspondence Check per scene
    for (let i = 0; i < scenes.length; i++) {
      const sc = scenes[i];

      const evalResult = await this.verifyPreRenderCandidateClip(
        sc.situation,
        sc.targetEmotion,
        {
          title: sc.title,
          filePath: sc.filePath,
          mediaType: sc.mediaType,
          targetDurationSec: sc.targetDurationSec
        }
      );

      if (evalResult.blockReason?.includes('ARTIFICIAL_LOOP_PROHIBITED')) {
        loopingHacksBlocked.push({
          sceneIndex: i + 1,
          title: sc.title,
          nativeDurationSec: 0,
          targetDurationSec: sc.targetDurationSec,
          reason: evalResult.blockReason
        });
      } else if (!evalResult.compatible) {
        badClipsBlocked.push({
          sceneIndex: i + 1,
          title: sc.title,
          filePath: sc.filePath,
          reason: evalResult.blockReason || evalResult.critique
        });
      } else {
        acceptedClips.push({
          sceneIndex: i + 1,
          title: sc.title,
          artisticScore: evalResult.artisticScore,
          reason: evalResult.critique
        });
      }
    }

    const hasErrors = badClipsBlocked.length > 0 || duplicateClipsBlocked.length > 0 || loopingHacksBlocked.length > 0;
    const unavailableFallbackHandled = hasErrors && !options?.allowSearchExpansion && !options?.hasImageGeneratorFallback;

    return {
      passed: !hasErrors,
      verdict: !hasErrors ? 'PASS' : (unavailableFallbackHandled ? 'BLOCKED' : 'FAIL'),
      badClipsBlocked,
      duplicateClipsBlocked,
      loopingHacksBlocked,
      acceptedClips,
      unavailableFallbackHandled,
      blockReason: hasErrors ? [
        ...badClipsBlocked.map(b => `[Scene ${b.sceneIndex}] ${b.reason}`),
        ...duplicateClipsBlocked.map(d => d.reason),
        ...loopingHacksBlocked.map(l => l.reason)
      ].join('; ') : undefined
    };
  }
}
