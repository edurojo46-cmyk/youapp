import type { VideoLearningEvent, VideoGenome, NarrativeScene } from './directorTypes.ts';

const STORAGE_EVENTS_KEY = 'atlas_video_learning_events_v1';
const STORAGE_GENOME_KEY = 'atlas_video_genome_ledger_v1';

/**
 * ATLAS VIDEO LEARNING LEDGER
 * Canonical store for human feedback events and pattern learning.
 */
class AtlasVideoLearningLedger {
  private events: VideoLearningEvent[] = [];
  private genomes: VideoGenome[] = [];

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const ev = window.localStorage.getItem(STORAGE_EVENTS_KEY);
        if (ev) this.events = JSON.parse(ev);
        const gn = window.localStorage.getItem(STORAGE_GENOME_KEY);
        if (gn) this.genomes = JSON.parse(gn);
      } else if (typeof window === 'undefined') {
        try {
          const fs = (globalThis as any).process ? (globalThis as any).require?.('fs') : undefined;
          const path = (globalThis as any).process ? (globalThis as any).require?.('path') : undefined;
          if (fs && path) {
            const diskPath = path.resolve('server/data/atlas_creative_genome_ledger.json');
            if (fs.existsSync(diskPath)) {
              const data = JSON.parse(fs.readFileSync(diskPath, 'utf8'));
              if (data.events) this.events = data.events;
              if (data.genomes) this.genomes = data.genomes;
            }
          }
        } catch {}
      }
    } catch {
      // Fallback
    }
  }

  private save() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STORAGE_EVENTS_KEY, JSON.stringify(this.events));
        window.localStorage.setItem(STORAGE_GENOME_KEY, JSON.stringify(this.genomes));
      } else if (typeof window === 'undefined') {
        try {
          const fs = (globalThis as any).process ? (globalThis as any).require?.('fs') : undefined;
          const path = (globalThis as any).process ? (globalThis as any).require?.('path') : undefined;
          if (fs && path) {
            const diskPath = path.resolve('server/data/atlas_creative_genome_ledger.json');
            const dir = path.dirname(diskPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(diskPath, JSON.stringify({ events: this.events, genomes: this.genomes }, null, 2), 'utf8');
          }
        } catch {}
      }
    } catch {
      // Fallback
    }
  }

  /**
   * Record human review feedback for a video & its scenes
   */
  recordFeedback(params: {
    VIDEO_ID: string;
    HUMAN_SCORE: number;
    HUMAN_LIKE: 'ME_GUSTA' | 'NO_ME_GUSTA';
    HUMAN_REASON: string;
    CRITERIA_SCORES?: {
      CUENTO: number;
      HOOK?: number;
      VISUALES: number;
      VIDEO_REAL: number;
      MUSICA: number;
      TEXTO: number;
      RITMO: number;
      ENDING?: number;
      RESULTADO_GENERAL: number;
    };
    SCENES?: NarrativeScene[];
  }) {
    const timestamp = new Date().toISOString();
    const eventId = `EVT_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const event: VideoLearningEvent = {
      eventId,
      VIDEO_ID: params.VIDEO_ID,
      SCENE_ID: 'OVERALL',
      ASSET_ID: params.VIDEO_ID,
      SOURCE: 'HUMAN_REVIEW_LAB',
      MEDIA_TYPE: 'VIDEO',
      FEATURES: {
        visualIntent: 'STORY_DIRECTOR_EXECUTION',
        emotion: params.HUMAN_LIKE === 'ME_GUSTA' ? 'POSITIVE' : 'NEGATIVE',
        concept: params.HUMAN_REASON,
        orientation: 'PORTRAIT',
        motionScore: 85,
        aestheticScore: params.HUMAN_SCORE * 20
      },
      DECISION: params.HUMAN_LIKE === 'ME_GUSTA' ? 'SELECTED' : 'REJECTED',
      HUMAN_SCORE: params.HUMAN_SCORE,
      HUMAN_REASON: params.HUMAN_REASON,
      HUMAN_LIKE: params.HUMAN_LIKE,
      WINNING_PATTERN: params.HUMAN_LIKE === 'ME_GUSTA' || (params.HUMAN_SCORE && params.HUMAN_SCORE >= 4)
        ? `TOPIC_${params.VIDEO_ID}_REASON_${params.HUMAN_REASON}`
        : undefined,
      LOSING_PATTERN: params.HUMAN_LIKE === 'NO_ME_GUSTA' || (params.HUMAN_SCORE && params.HUMAN_SCORE <= 2)
        ? `TOPIC_${params.VIDEO_ID}_REASON_${params.HUMAN_REASON}`
        : undefined,
      TIMESTAMP: timestamp
    };

    this.events.unshift(event);

    // Update genome if exists
    const genome = this.genomes.find(g => g.VIDEO_ID === params.VIDEO_ID);
    if (genome) {
      genome.HUMAN_SCORE = params.HUMAN_SCORE;
    }

    this.save();
    return event;
  }

  /**
   * Existing-First Learning: Query historical human decisions for similar scene concepts
   */
  getPatternWeight(features: { concept: string; emotion: string; mediaType: string; visualInterpretation?: string }): number {
    let weightModifier = 0;
    for (const ev of this.events) {
      const matchEmotion = ev.FEATURES.emotion === features.emotion;
      const matchConcept = ev.FEATURES.concept.toLowerCase().includes(features.concept.toLowerCase());
      const matchInterpretation = features.visualInterpretation && ev.FEATURES.visualInterpretation === features.visualInterpretation;

      if (matchEmotion || matchConcept || matchInterpretation) {
        if (ev.HUMAN_LIKE === 'ME_GUSTA' || (ev.HUMAN_SCORE && ev.HUMAN_SCORE >= 4)) {
          weightModifier += matchInterpretation ? 8 : 5; // pattern boosted
        } else if (ev.HUMAN_LIKE === 'NO_ME_GUSTA' || (ev.HUMAN_SCORE && ev.HUMAN_SCORE <= 2)) {
          weightModifier -= matchInterpretation ? 15 : 10; // pattern penalized
        }
      }
    }
    return Math.max(-30, Math.min(30, weightModifier));
  }

  /**
   * 10. VISUAL QUALITY MEMORY (ASSET_HUMAN_QUALITY_PRIOR)
   * Prevents rejected assets from re-appearing, prioritizes excellent assets.
   */
  getAssetQualityPrior(assetId: string): number {
    const assetEvents = this.events.filter(e => e.ASSET_ID === assetId);
    if (assetEvents.length === 0) return 0; // neutral prior

    let priorScore = 0;
    for (const ev of assetEvents) {
      if (ev.HUMAN_REASON === 'FEO' || ev.HUMAN_REASON === 'NO_TIENE_QUE_VER') {
        priorScore -= 35; // Heavy penalty for ugly/irrelevant
      } else if (ev.HUMAN_LIKE === 'NO_ME_GUSTA' || (ev.HUMAN_SCORE && ev.HUMAN_SCORE <= 2)) {
        priorScore -= 20;
      } else if (ev.HUMAN_REASON === 'EXCELENTE' || (ev.HUMAN_SCORE && ev.HUMAN_SCORE >= 5)) {
        priorScore += 25; // Prior boost
      } else if (ev.HUMAN_LIKE === 'ME_GUSTA') {
        priorScore += 10;
      }
    }
    return Math.max(-50, Math.min(40, priorScore));
  }

  getWinningPatterns(): string[] {
    return this.events
      .filter(e => e.WINNING_PATTERN)
      .map(e => e.WINNING_PATTERN!);
  }

  getLosingPatterns(): string[] {
    return this.events
      .filter(e => e.LOSING_PATTERN)
      .map(e => e.LOSING_PATTERN!);
  }

  recordGenome(genome: VideoGenome) {
    const existingIndex = this.genomes.findIndex(g => g.VIDEO_ID === genome.VIDEO_ID);
    if (existingIndex >= 0) {
      this.genomes[existingIndex] = genome;
    } else {
      this.genomes.unshift(genome);
    }
    this.save();
  }

  getGenome(videoId: string): VideoGenome | undefined {
    return this.genomes.find(g => g.VIDEO_ID === videoId);
  }

  getRecentTracks(): string[] {
    return this.events
      .filter(e => e.FEATURES?.concept?.startsWith('TRACK_USED:'))
      .map(e => e.FEATURES.concept.replace('TRACK_USED:', ''))
      .slice(0, 5);
  }

  recordTrackUsage(trackId: string) {
    this.events.unshift({
      eventId: `EVT_TRACK_${Date.now()}`,
      VIDEO_ID: 'RECENT_AUDIO_RENDER',
      SCENE_ID: 'AUDIO',
      ASSET_ID: trackId,
      SOURCE: 'AUTONOMOUS_EDITOR',
      MEDIA_TYPE: 'VIDEO',
      FEATURES: {
        visualIntent: 'MUSIC_SELECTION',
        emotion: 'NEUTRAL',
        concept: `TRACK_USED:${trackId}`,
        orientation: 'PORTRAIT',
        motionScore: 0,
        aestheticScore: 90
      },
      DECISION: 'SELECTED',
      TIMESTAMP: new Date().toISOString()
    });
    this.save();
  }

  getAllEvents(): VideoLearningEvent[] {
    return [...this.events];
  }

  getAllGenomes(): VideoGenome[] {
    return [...this.genomes];
  }

  /**
   * Find a previously learned VideoGenome by topic, niche or keyword.
   * If preferredNiche is supplied, prioritize exact niche match to prevent wrong cross-niche transfer.
   */
  findLearnedGenome(query: string, preferredNiche?: string): VideoGenome | undefined {
    const q = (query || '').toLowerCase().trim();
    const pNiche = (preferredNiche || '').toLowerCase().trim();

    if (pNiche) {
      const nicheMatch = this.genomes.find(g => (g.NICHE || '').toLowerCase() === pNiche);
      if (nicheMatch) return nicheMatch;
    }

    if (!q) return undefined;

    return this.genomes.find(g => {
      const topic = (g.TOPIC || '').toLowerCase();
      const niche = (g.NICHE || '').toLowerCase();
      const title = (g.STORY_TITLE || '').toLowerCase();
      const patterns = (g.LEARNED_PATTERNS || []).map(p => p.toLowerCase()).join(' ');
      return topic.includes(q) || q.includes(topic) || niche.includes(q) || title.includes(q) || patterns.includes(q);
    });
  }

  /**
   * Evaluates compatibility between incoming niche and candidate genome.
   * Prevents wrong pattern transfer (e.g. soup kitchen templates inside a quantum mechanics video).
   */
  checkCrossNicheCompatibility(incomingNiche: string, candidateGenome: VideoGenome): {
    compatible: boolean;
    wrongTransferDetected: boolean;
    reason: string;
  } {
    const inN = (incomingNiche || '').toUpperCase().trim();
    const genN = (candidateGenome.NICHE || '').toUpperCase().trim();

    if (inN === genN) {
      return {
        compatible: true,
        wrongTransferDetected: false,
        reason: `EXACT_NICHE_ALIGNMENT: [${inN}] matched seamlessly with learned genome.`
      };
    }

    const domainFamilies: Record<string, string[]> = {
      HUMAN_SOCIAL: ['COMMUNITY_SOLIDARITY', 'SOCIAL_JUSTICE', 'HUMANITARIAN_AID', 'MUTUAL_AID'],
      EXACT_SCIENCES: ['QUANTUM_PHYSICS', 'DEEP_SCIENCE', 'ASTROPHYSICS', 'MATHEMATICS', 'COSMOLOGY'],
      BIO_HEALTH: ['NEUROSCIENCE', 'COGNITIVE_PSYCHOLOGY', 'BIOLOGY', 'MEDICINE'],
      DOCUMENTARY_INVESTIGATIVE: ['DOCUMENTAL_NARRATIVO_Y_CIENCIA', 'INVESTIGATIVE_STORYTELLING', 'HISTORICAL_DOCUMENTARY', 'SCIENCE_MYSTERY', 'PHILOSOPHY_AND_OBSESSION']
    };

    let inFamily = 'OTHER';
    let genFamily = 'OTHER';

    for (const [fam, members] of Object.entries(domainFamilies)) {
      if (members.includes(inN)) inFamily = fam;
      if (members.includes(genN)) genFamily = fam;
    }

    if (inFamily !== 'OTHER' && genFamily !== 'OTHER' && inFamily !== genFamily) {
      return {
        compatible: false,
        wrongTransferDetected: true,
        reason: `WRONG_PATTERN_TRANSFER_PREVENTED: Cannot apply [${genFamily}:${genN}] domain templates to [${inFamily}:${inN}]. Rejected to preserve epistemic integrity.`
      };
    }

    return {
      compatible: true,
      wrongTransferDetected: false,
      reason: `COMPATIBLE_GENRE_FAMILY: Cross-niche abstract pacing compatible without domain collision.`
    };
  }

  /**
   * Incorporate verified Multimodal Video DNA directly into Creative Genome
   */
  incorporateMultimodalDnaToGenome(params: {
    videoId: string;
    topic: string;
    niche: string;
    storyTitle: string;
    storyStructure: string;
    pacing: 'SLOW' | 'MODERATE' | 'FAST';
    averageShotDuration: number;
    sceneTemplates: Array<{
      phase: string;
      visualIntent: string;
      action: string;
      textStyle?: string;
      durationSeconds: number;
    }>;
    learnedPatterns: string[];
    musicProfile: {
      trackId: string;
      title: string;
      status: 'APPROVED';
      BPM: number;
      EMOTION: string;
      INSTRUMENTATION: string[];
    };
    directorScore?: number;
  }): VideoGenome {
    const genome: VideoGenome = {
      VIDEO_ID: params.videoId,
      TOPIC: params.topic,
      NICHE: params.niche,
      STORY_TITLE: params.storyTitle,
      STORY_STRUCTURE: params.storyStructure,
      SCENE_COUNT: params.sceneTemplates.length,
      VIDEO_RATIO: 1.0,
      IMAGE_RATIO: 0.0,
      MUSIC_PROFILE: params.musicProfile,
      PACE: params.pacing,
      TEXT_DENSITY: 'LOW',
      AVERAGE_SHOT_DURATION: params.averageShotDuration,
      TRANSITIONS: 'CLEAN_CUT',
      LEARNED_PATTERNS: params.learnedPatterns,
      SCENE_TEMPLATES: params.sceneTemplates,
      DIRECTOR_SCORE: params.directorScore || 95,
      CREATED_AT: new Date().toISOString()
    };

    this.recordGenome(genome);
    return genome;
  }
}

export const AtlasVideoLearningLedgerInstance = new AtlasVideoLearningLedger();
