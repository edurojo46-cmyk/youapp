import type {
  VideoReference,
  AtlasReferenceSegment,
  AtlasHumanDirectorProfile,
  AtlasReferenceFrame,
  AtlasReferenceClip
} from './directorTypes.ts';

const STORAGE_KEY = 'atlas_video_reference_library_v1';
const STORAGE_SEGMENTS_KEY = 'atlas_video_reference_segments_v1';
const STORAGE_FRAMES_KEY = 'atlas_video_reference_frames_v1';
const STORAGE_CLIPS_KEY = 'atlas_video_reference_clips_v1';

/**
 * INITIAL SEED REFERENCE: REFERENCE_VIDEO_001
 */
export const INITIAL_APPROVED_REFERENCES: VideoReference[] = [
  {
    referenceId: 'REFERENCE_VIDEO_001',
    title: 'The School of Life — Philosophical Reflection Short (Canonical Reference)',
    sourceUrl: 'https://www.youtube.com/watch?v=D9HqY2yDq98',
    platform: 'YOUTUBE',
    topicCategory: 'FILOSOFÍA / PSICOLOGÍA',
    userLikedElements: ['EVERYTHING', 'PACE', 'MUSIC', 'TEXT'] as any,
    hookDurationSeconds: 2.8,
    shotCount: 16,
    avgShotDurationSeconds: 7.2,
    shotVarietyScore: 92,
    videoImageRatio: 0.88,
    cameraMotion: 'SLOW_PAN_ZOOM',
    textStyle: {
      fontFamily: 'serif',
      maxLines: 2,
      position: 'CENTER',
      contrastStyle: 'SEMI_TRANSPARENT_BOX'
    },
    textDensity: 'LOW',
    transitions: 'CLEAN_CUT',
    pace: 'MODERATE',
    colorStyle: 'WARM_CINEMATIC',
    musicStyle: 'Ethereal Acoustic Strings & Celtic Flute',
    musicEnergyCurve: 'CONTEMPLATIVE_WAVE',
    storyStructure: 'HOOK_CONTEXT_CONFLICT_DEVELOPMENT_TURNING_POINT_RESOLUTION_FINAL_LINE',
    emotionalCurve: 'Calm curiosity -> existential weight -> serene clarity',
    endingStyle: 'PHILOSOPHICAL_QUESTION',
    verifiedNonInfringing: true,
    thumbnailUrl: 'https://images.unsplash.com/photo-1507034589631-9433cc6bc453?auto=format&fit=crop&w=600&q=80',
    durationSeconds: 118,
    notes: 'Primary reference video 001 for human director profile training.',
    addedAt: '2026-10-24T00:00:00Z'
  },
  {
    referenceId: 'REF_PHILOSOPHY_STREET',
    title: 'BBC Earth — Sacred Forest Awakening',
    sourceUrl: 'https://instagram.com/reel/nature_calm_1',
    platform: 'INSTAGRAM',
    topicCategory: 'NATURALEZA / ESPIRITUALIDAD',
    userLikedElements: ['VISUALS', 'MUSIC', 'ENDING'],
    hookDurationSeconds: 3.0,
    shotCount: 14,
    avgShotDurationSeconds: 8.5,
    shotVarietyScore: 90,
    videoImageRatio: 1.0,
    cameraMotion: 'SLOW_PAN_ZOOM',
    textStyle: {
      fontFamily: 'sans-serif',
      maxLines: 2,
      position: 'BOTTOM',
      contrastStyle: 'DROP_SHADOW'
    },
    textDensity: 'LOW',
    transitions: 'DISSOLVE',
    pace: 'SLOW',
    colorStyle: 'NATURAL_EARTH',
    musicStyle: 'Ambient Celestial Harp & Water Resonance',
    musicEnergyCurve: 'STEADY',
    storyStructure: 'HOOK_CONTEXT_CONFLICT_DEVELOPMENT_TURNING_POINT_RESOLUTION_FINAL_LINE',
    emotionalCurve: 'Silence -> awe -> grounding breath',
    endingStyle: 'CONTEMPLATIVE_FADE',
    verifiedNonInfringing: true,
    thumbnailUrl: 'https://images.unsplash.com/photo-1512428813834-c702c7702b78?auto=format&fit=crop&w=600&q=80',
    durationSeconds: 95,
    notes: 'Reference for pacing and spiritual transcendence.',
    addedAt: '2026-10-23T11:00:00Z'
  },
  {
    referenceId: 'REF_COGNITIVE_MINDS',
    title: 'Veritasium / Kurzg — Cognitive Bias & Mental Habits (Analysis DNA)',
    sourceUrl: 'https://www.youtube.com/watch?v=UBVV8pch1ds',
    platform: 'YOUTUBE',
    topicCategory: 'PSICOLOGÍA / COGNICIÓN',
    userLikedElements: ['EVERYTHING', 'PACE', 'TRANSITIONS'],
    hookDurationSeconds: 2.5,
    shotCount: 18,
    avgShotDurationSeconds: 6.5,
    shotVarietyScore: 94,
    videoImageRatio: 0.90,
    cameraMotion: 'SLOW_PAN_ZOOM',
    textStyle: {
      fontFamily: 'sans-serif',
      maxLines: 2,
      position: 'CENTER',
      contrastStyle: 'SEMI_TRANSPARENT_BOX'
    },
    textDensity: 'LOW',
    transitions: 'CLEAN_CUT',
    pace: 'MODERATE',
    colorStyle: 'DEEP_CYAN_WARM',
    musicStyle: 'Ambient Neo-Classical Piano & Minimalist Pulse',
    musicEnergyCurve: 'CONTEMPLATIVE_WAVE',
    storyStructure: 'HOOK_CONTEXT_CONFLICT_DEVELOPMENT_TURNING_POINT_RESOLUTION_FINAL_LINE',
    emotionalCurve: 'Curiosity -> paradox -> paradigm shift',
    endingStyle: 'PHILOSOPHICAL_QUESTION',
    verifiedNonInfringing: true,
    thumbnailUrl: 'https://images.unsplash.com/photo-1507413245164-6160d8298b31?auto=format&fit=crop&w=600&q=80',
    durationSeconds: 110,
    notes: 'Reference for high cognitive retention and question-based narrative pacing.',
    addedAt: '2026-10-24T02:00:00Z'
  },
  {
    referenceId: 'REF_NEURO_REFLECTIONS',
    title: 'Aeon Essays — The Anatomy of a Thought',
    sourceUrl: 'https://www.youtube.com/watch?v=F1b5Zeq5G4k',
    platform: 'YOUTUBE',
    topicCategory: 'NEUROCIENCIA / FILOSOFÍA',
    userLikedElements: ['PACE', 'VISUALS', 'MUSIC'],
    hookDurationSeconds: 2.7,
    shotCount: 15,
    avgShotDurationSeconds: 7.0,
    shotVarietyScore: 91,
    videoImageRatio: 0.85,
    cameraMotion: 'SLOW_PAN_ZOOM',
    textStyle: {
      fontFamily: 'serif',
      maxLines: 2,
      position: 'BOTTOM',
      contrastStyle: 'SEMI_TRANSPARENT_BOX'
    },
    textDensity: 'LOW',
    transitions: 'CLEAN_CUT',
    pace: 'MODERATE',
    colorStyle: 'WARM_CINEMATIC',
    musicStyle: 'Introspective Cello & Subtle Harmonic Drone',
    musicEnergyCurve: 'STEADY',
    storyStructure: 'HOOK_CONTEXT_CONFLICT_DEVELOPMENT_TURNING_POINT_RESOLUTION_FINAL_LINE',
    emotionalCurve: 'Introspective mystery -> deep understanding',
    endingStyle: 'CONTEMPLATIVE_FADE',
    verifiedNonInfringing: true,
    thumbnailUrl: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=600&q=80',
    durationSeconds: 105,
    notes: 'Reference for calm cerebral visual storytelling.',
    addedAt: '2026-10-24T03:00:00Z'
  }
];

export const INITIAL_REFERENCE_SEGMENTS: AtlasReferenceSegment[] = [
  {
    segmentId: 'SEG_REF001_01',
    referenceId: 'REFERENCE_VIDEO_001',
    startSecond: 8.0,
    endSecond: 8.0,
    duration: 0,
    feedbackType: 'ME_GUSTA',
    likedComponents: ['GANCHO', 'IMAGEN', 'RITMO'],
    dislikedComponents: [],
    humanScore: 5,
    comment: 'Gancho inicial claro y magnético con primer plano sutil sin texto invasivo.',
    analysis: {
      shotType: 'MEDIUM_CLOSE_UP',
      cameraMotion: 'SLOW_ZOOM_IN',
      transitionType: 'CLEAN_CUT',
      lighting: 'NATURAL_WARM',
      pace: 'MODERATE',
      narrativeFunction: 'MAGNETIC_HOOK'
    },
    createdAt: '2026-10-24T01:00:00Z'
  },
  {
    segmentId: 'SEG_REF001_02',
    referenceId: 'REFERENCE_VIDEO_001',
    startSecond: 21.0,
    endSecond: 29.0,
    duration: 8.0,
    feedbackType: 'ME_GUSTA',
    likedComponents: ['MUSICA', 'ENTRADA_DE_MUSICA', 'EMOCION'],
    dislikedComponents: [],
    humanScore: 5,
    comment: 'Entrada de arpa y cuerdas con armonía envolvente que eleva la emoción de la escena.',
    analysis: {
      musicTempo: 74,
      musicEnergy: 'LOW',
      emotionalTone: 'ETHEREAL_PEACE',
      narrativeFunction: 'EMOTIONAL_BUILD'
    },
    createdAt: '2026-10-24T01:05:00Z'
  },
  {
    segmentId: 'SEG_REF001_03',
    referenceId: 'REFERENCE_VIDEO_001',
    startSecond: 42.0,
    endSecond: 42.0,
    duration: 0,
    feedbackType: 'NO_ME_GUSTA',
    likedComponents: [],
    dislikedComponents: ['IMAGEN', 'COMPOSICION'],
    humanScore: 2,
    comment: 'Toma plana y oscura sin profundidad cinematográfica. Desentona con el resto.',
    analysis: {
      lighting: 'FLAT_UNDERTEX',
      composition: 'POOR_PERSPECTIVE',
      narrativeFunction: 'WEAK_FILLER'
    },
    createdAt: '2026-10-24T01:10:00Z'
  },
  {
    segmentId: 'SEG_REF001_04',
    referenceId: 'REFERENCE_VIDEO_001',
    startSecond: 55.0,
    endSecond: 63.0,
    duration: 8.0,
    feedbackType: 'ME_GUSTA',
    likedComponents: ['RITMO', 'CORTE', 'TRANSICION'],
    dislikedComponents: [],
    humanScore: 5,
    comment: 'Cortes limpios cada 4 segundos acompañando el ritmo de la respiración del relato.',
    analysis: {
      shotDuration: 4.0,
      pace: 'MODERATE',
      transitionType: 'CLEAN_CUT',
      narrativeFunction: 'RHYTHM_DEVELOPMENT'
    },
    createdAt: '2026-10-24T01:15:00Z'
  },
  {
    segmentId: 'SEG_REF001_05',
    referenceId: 'REFERENCE_VIDEO_001',
    startSecond: 114.0,
    endSecond: 118.0,
    duration: 4.0,
    feedbackType: 'ME_GUSTA',
    likedComponents: ['FINAL', 'TEXTO', 'FORMA_DE_CONTAR'],
    dislikedComponents: [],
    humanScore: 5,
    comment: 'Cierre sereno con pregunta reflexiva de alto contraste y fade musical suave.',
    analysis: {
      textStyle: 'SERIF_HIGH_CONTRAST',
      pace: 'SLOW',
      emotionalTone: 'SERENE_CLARITY',
      narrativeFunction: 'PHILOSOPHICAL_RESOLUTION'
    },
    createdAt: '2026-10-24T01:20:00Z'
  }
];

class AtlasVideoReferenceLibrary {
  private references: VideoReference[] = [];
  private segments: AtlasReferenceSegment[] = [];
  private frames: AtlasReferenceFrame[] = [];
  private clips: AtlasReferenceClip[] = [];

  constructor() {
    this.load();
  }

  private load() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const storedRefs = window.localStorage.getItem(STORAGE_KEY);
        if (storedRefs) {
          this.references = JSON.parse(storedRefs);
        } else {
          this.references = [...INITIAL_APPROVED_REFERENCES];
        }

        const storedSegs = window.localStorage.getItem(STORAGE_SEGMENTS_KEY);
        if (storedSegs) {
          this.segments = JSON.parse(storedSegs);
        } else {
          this.segments = [...INITIAL_REFERENCE_SEGMENTS];
        }

        const storedFrames = window.localStorage.getItem(STORAGE_FRAMES_KEY);
        if (storedFrames) {
          this.frames = JSON.parse(storedFrames);
        }

        const storedClips = window.localStorage.getItem(STORAGE_CLIPS_KEY);
        if (storedClips) {
          this.clips = JSON.parse(storedClips);
        }
        return;
      }
    } catch {
      // Fallback
    }
    this.references = [...INITIAL_APPROVED_REFERENCES];
    this.segments = [...INITIAL_REFERENCE_SEGMENTS];
    this.frames = [];
    this.clips = [];
  }

  private save() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.references));
        window.localStorage.setItem(STORAGE_SEGMENTS_KEY, JSON.stringify(this.segments));
        window.localStorage.setItem(STORAGE_FRAMES_KEY, JSON.stringify(this.frames));
        window.localStorage.setItem(STORAGE_CLIPS_KEY, JSON.stringify(this.clips));
      }
    } catch {
      // Fallback
    }
  }

  getAllReferences(): VideoReference[] {
    return [...this.references];
  }

  getReferenceById(id: string): VideoReference | undefined {
    return this.references.find(r => r.referenceId === id);
  }

  addReference(ref: {
    sourceUrl: string;
    title?: string;
    platform?: 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM' | 'OTHER';
    topicCategory?: string;
  }): VideoReference {
    const isYouTube = ref.sourceUrl.includes('youtube.com') || ref.sourceUrl.includes('youtu.be');
    const ytMatch = ref.sourceUrl.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    const ytId = ytMatch ? ytMatch[1] : undefined;
    const platform = ref.platform || (isYouTube ? 'YOUTUBE' : 'OTHER');
    const thumbnailUrl = ytId 
      ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`
      : 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80';

    const newRef: VideoReference = {
      referenceId: `REF_${Date.now()}_${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      title: ref.title || (ytId ? `YouTube Video (${ytId})` : `Video de Referencia (${platform})`),
      sourceUrl: ref.sourceUrl,
      platform,
      topicCategory: ref.topicCategory || 'GENERAL / REFLEXIÓN',
      userLikedElements: ['EVERYTHING'],
      hookDurationSeconds: 2.8,
      shotCount: 15,
      avgShotDurationSeconds: 7.5,
      shotVarietyScore: 90,
      videoImageRatio: 0.85,
      cameraMotion: 'SLOW_PAN_ZOOM',
      textStyle: {
        fontFamily: 'sans-serif',
        maxLines: 2,
        position: 'CENTER',
        contrastStyle: 'SEMI_TRANSPARENT_BOX'
      },
      textDensity: 'LOW',
      transitions: 'CLEAN_CUT',
      pace: 'MODERATE',
      colorStyle: 'WARM_CINEMATIC',
      musicStyle: 'Acoustic / Ethereal',
      musicEnergyCurve: 'CONTEMPLATIVE_WAVE',
      storyStructure: 'HOOK_CONTEXT_CONFLICT_DEVELOPMENT_TURNING_POINT_RESOLUTION_FINAL_LINE',
      emotionalCurve: 'Contemplative narrative',
      endingStyle: 'PHILOSOPHICAL_QUESTION',
      verifiedNonInfringing: true,
      thumbnailUrl,
      durationSeconds: 120,
      addedAt: new Date().toISOString()
    };

    this.references.unshift(newRef);
    this.save();
    return newRef;
  }

  // Segment Management
  getAllSegments(): AtlasReferenceSegment[] {
    return [...this.segments];
  }

  getSegmentsByReference(referenceId: string): AtlasReferenceSegment[] {
    return this.segments.filter(s => s.referenceId === referenceId);
  }

  addSegment(segment: Omit<AtlasReferenceSegment, 'segmentId' | 'createdAt'>): AtlasReferenceSegment {
    const newSegment: AtlasReferenceSegment = {
      ...segment,
      segmentId: `SEG_${Date.now()}_${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      createdAt: new Date().toISOString()
    };
    this.segments.unshift(newSegment);
    this.save();
    return newSegment;
  }

  deleteSegment(segmentId: string) {
    this.segments = this.segments.filter(s => s.segmentId !== segmentId);
    this.save();
  }

  // Frame Management
  getAllFrames(): AtlasReferenceFrame[] {
    return [...this.frames];
  }

  getFramesByReference(referenceId: string): AtlasReferenceFrame[] {
    return this.frames.filter(f => f.referenceId === referenceId);
  }

  saveFrame(frame: AtlasReferenceFrame): AtlasReferenceFrame {
    const existingIdx = this.frames.findIndex(f => f.frameId === frame.frameId);
    if (existingIdx >= 0) {
      this.frames[existingIdx] = frame;
    } else {
      this.frames.unshift(frame);
    }
    this.save();
    return frame;
  }

  // Clip Management
  getAllClips(): AtlasReferenceClip[] {
    return [...this.clips];
  }

  getClipsByReference(referenceId: string): AtlasReferenceClip[] {
    return this.clips.filter(c => c.referenceId === referenceId);
  }

  saveClip(clip: AtlasReferenceClip): AtlasReferenceClip {
    const existingIdx = this.clips.findIndex(c => c.clipId === clip.clipId);
    if (existingIdx >= 0) {
      this.clips[existingIdx] = clip;
    } else {
      this.clips.unshift(clip);
    }
    this.save();
    return clip;
  }

  /**
   * 15. ATLAS HUMAN DIRECTOR PROFILE SYNTHESIS
   */
  getHumanDirectorProfile(): AtlasHumanDirectorProfile {
    const liked = this.segments.filter(s => s.feedbackType === 'ME_GUSTA');
    const disliked = this.segments.filter(s => s.feedbackType === 'NO_ME_GUSTA');

    const winningPatterns = liked.map(s => `LIKED_${s.likedComponents.join('_')}`);
    const dislikedPatterns = disliked.map(s => `DISLIKED_${s.dislikedComponents.join('_')}`);

    return {
      preferredShotTypes: ['MEDIUM_CLOSE_UP', 'CINEMATIC_MACRO', 'EXPANSIVE_HORIZON'],
      targetShotDuration: 6.8,
      preferredPace: 'MODERATE',
      preferredMusicStyles: ['Celta / Arpa', 'Piano Calido', 'Pads Etereos'],
      preferredTransitions: ['CLEAN_CUT', 'DISSOLVE_0.3S'],
      preferredLighting: ['NATURAL_WARM', 'CINEMATIC_LOW_KEY'],
      preferredMotionLevel: 'SLOW_PAN_ZOOM',
      maxTextLines: 2,
      dislikedPatterns,
      winningPatterns,
      rejectedTrackIds: ['MUS_AIRSHIP_SERENITY', 'AUTONOMOUS_DISC_JAZZ_PIANO_MEDLEY'],
      totalSegmentsLearned: this.segments.length,
      lastUpdated: new Date().toISOString()
    };
  }

  getSynthesizedStyleProfile(category?: string) {
    const pool = category
      ? this.references.filter(r => r.topicCategory.toLowerCase().includes(category.toLowerCase()))
      : this.references;
    
    const active = pool.length > 0 ? pool : this.references;
    const avgDuration = active.reduce((acc, r) => acc + r.avgShotDurationSeconds, 0) / active.length;
    const avgVideoRatio = active.reduce((acc, r) => acc + r.videoImageRatio, 0) / active.length;
    const avgHook = active.reduce((acc, r) => acc + r.hookDurationSeconds, 0) / active.length;

    return {
      targetAvgShotDuration: Math.round(avgDuration * 10) / 10,
      targetVideoRatio: Math.round(avgVideoRatio * 100) / 100,
      targetHookDuration: Math.round(avgHook * 10) / 10,
      maxCaptionLines: 2,
      recommendedPace: avgDuration < 6.8 ? 'FAST' : avgDuration < 8.2 ? 'MODERATE' : 'SLOW',
      referenceCount: active.length
    };
  }
}

export const AtlasVideoReferenceLibraryInstance = new AtlasVideoReferenceLibrary();
export default AtlasVideoReferenceLibraryInstance;
