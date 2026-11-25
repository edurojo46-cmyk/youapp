/**
 * ATLAS — VIDEO DIRECTOR TYPES & CONTRACTS
 */

export interface NarrativeScene {
  SCENE_ID: string;
  STORY_TEXT: string;
  VISUAL_INTENT: string;
  ACTION: string;
  CHARACTERS: string;
  LOCATION: string;
  EMOTION: string;
  CONCEPT: string;
  DURATION_SECONDS: number;
}

export interface DirectorCandidate {
  candidateId: string;
  source: 'WIKIMEDIA_VIDEO' | 'NASA_VIDEO' | 'INTERNET_ARCHIVE_VIDEO' | 'EUROPEANA_VIDEO' | 'WIKIMEDIA_PHOTO';
  mediaType: 'VIDEO' | 'IMAGE';
  title: string;
  url: string;
  previewUrl: string;
  width: number;
  height: number;
  orientation: 'PORTRAIT' | 'LANDSCAPE' | 'SQUARE';
  durationSeconds?: number;
  fps?: number;
  license: string;
  rightsStatus: string;
  // Director Score components (0 - 100)
  SEMANTIC_SCORE: number;
  NARRATIVE_SCORE: number;
  AESTHETIC_SCORE: number;
  CINEMATIC_SCORE?: number;
  MOTION_SCORE: number;
  EMOTIONAL_SCORE: number;
  TECHNICAL_QUALITY: number;
  TOPIC_STYLE_MATCH?: number;
  REFERENCE_STYLE_MATCH?: number;
  HUMAN_PREFERENCE_SCORE: number;
  NON_GENERIC_SCORE?: number;
  GENERIC_VISUAL_PENALTY?: number;
  HUMAN_EXACT_ASSET_SELECTION?: boolean;
  ATLAS_DIRECTOR_SCORE: number;
}

export interface MusicTrackApproval {
  trackId: string;
  title: string;
  artist: string;
  source: string;
  localPath: string;
  webPath: string;
  status: 'APPROVED' | 'REJECTED' | 'UNREVIEWED' | 'REFERENCE_ONLY';
  THEME: string;
  EMOTION: string;
  BPM: number;
  ENERGY: 'LOW' | 'MEDIUM' | 'HIGH';
  INSTRUMENTATION: string[];
  qualityScore: number;
}

export interface VideoLearningEvent {
  eventId: string;
  VIDEO_ID: string;
  SCENE_ID: string;
  ASSET_ID: string;
  SOURCE: string;
  MEDIA_TYPE: 'VIDEO' | 'IMAGE';
  FEATURES: {
    visualIntent: string;
    emotion: string;
    concept: string;
    visualInterpretation?: string;
    candidatesEvaluated?: number;
    orientation: string;
    motionScore: number;
    aestheticScore: number;
    cinematicScore?: number;
  };
  DECISION: 'SELECTED' | 'REJECTED' | 'FALLBACK';
  DIRECTOR_SCORE?: number;
  HUMAN_SCORE?: number; // 1 to 5
  HUMAN_REASON?: 'NO_TIENE_QUE_VER' | 'FEO' | 'MUSICA_MALA' | 'ABURRIDO' | 'DEMASIADO_LENTO' | 'DEMASIADO_RAPIDO' | 'TEXTO_MAL' | 'EXCELENTE' | string;
  HUMAN_LIKE?: 'ME_GUSTA' | 'NO_ME_GUSTA';
  WINNING_PATTERN?: string;
  LOSING_PATTERN?: string;
  TIMESTAMP: string;
}

export interface VideoGenome {
  VIDEO_ID: string;
  TOPIC: string;
  STORY_TITLE: string;
  STORY_STRUCTURE: string;
  SCENE_COUNT: number;
  VIDEO_RATIO: number;
  IMAGE_RATIO: number;
  MUSIC_PROFILE: {
    trackId: string;
    title: string;
    status: 'APPROVED';
    BPM: number;
    EMOTION: string;
    INSTRUMENTATION: string[];
  };
  PACE: 'SLOW' | 'MODERATE' | 'FAST';
  TEXT_DENSITY: 'LOW' | 'MEDIUM' | 'HIGH';
  AVERAGE_SHOT_DURATION: number;
  TRANSITIONS: string;
  DIRECTOR_SCORE: number;
  HUMAN_SCORE?: number;
  NICHE?: string;
  LEARNED_PATTERNS?: string[];
  SCENE_TEMPLATES?: Array<{
    phase: string;
    visualIntent: string;
    action: string;
    textStyle?: string;
    durationSeconds: number;
  }>;
  CREATED_AT: string;
}

/**
 * 1. REFERENCE STYLE PROFILE & VIDEO REFERENCE LIBRARY
 */
export interface VideoReference {
  referenceId: string;
  title: string;
  sourceUrl: string;
  platform: 'YOUTUBE' | 'TIKTOK' | 'INSTAGRAM' | 'OTHER';
  topicCategory: string;
  userLikedElements: Array<'MUSIC' | 'VISUALS' | 'PACE' | 'TEXT' | 'STORY' | 'EDITING' | 'HOOK' | 'ENDING' | 'EVERYTHING'>;
  hookDurationSeconds: number;
  shotCount: number;
  avgShotDurationSeconds: number;
  shotVarietyScore: number; // 0-100
  videoImageRatio: number; // e.g. 0.85 = 85% video
  cameraMotion: 'STATIC' | 'SLOW_PAN_ZOOM' | 'DYNAMIC_HANDHELD' | 'KINETIC';
  textStyle: {
    fontFamily: string;
    maxLines: number;
    position: 'TOP' | 'CENTER' | 'BOTTOM';
    contrastStyle: 'OUTLINE' | 'SEMI_TRANSPARENT_BOX' | 'DROP_SHADOW';
  };
  textDensity: 'LOW' | 'MEDIUM' | 'HIGH';
  transitions: 'CLEAN_CUT' | 'DISSOLVE' | 'WHIP_PAN' | 'ZOOM_PUNCH';
  pace: 'SLOW' | 'MODERATE' | 'FAST';
  colorStyle: 'WARM_CINEMATIC' | 'COLD_HIGH_CONTRAST' | 'NATURAL_EARTH' | 'ETHEREAL';
  musicStyle: string;
  musicEnergyCurve: 'STEADY' | 'BUILD_UP' | 'CRESCENDO_DROP' | 'CONTEMPLATIVE_WAVE';
  storyStructure: 'HOOK_CONTEXT_CONFLICT_DEVELOPMENT_TURNING_POINT_RESOLUTION_FINAL_LINE';
  emotionalCurve: string;
  endingStyle: 'CALL_TO_ACTION_FAST' | 'CONTEMPLATIVE_FADE' | 'PHILOSOPHICAL_QUESTION';
  verifiedNonInfringing: boolean;
  notes?: string;
  thumbnailUrl?: string;
  durationSeconds?: number;
  addedAt: string;
}

/**
 * 8. ATLAS REFERENCE SEGMENT & DEEP TIMELINE LEARNING
 */
export type SegmentComponentType =
  | 'TODO'
  | 'IMAGEN'
  | 'VIDEO'
  | 'TIPO_DE_PLANO'
  | 'MOVIMIENTO'
  | 'RITMO'
  | 'CORTE'
  | 'TRANSICION'
  | 'MUSICA'
  | 'ENTRADA_DE_MUSICA'
  | 'CAMBIO_MUSICAL'
  | 'TEXTO'
  | 'TIPOGRAFIA'
  | 'COLOR'
  | 'ILUMINACION'
  | 'COMPOSICION'
  | 'EMOCION'
  | 'GANCHO'
  | 'FORMA_DE_CONTAR'
  | 'FINAL';

export interface AtlasReferenceSegment {
  segmentId: string;
  referenceId: string;
  startSecond: number;
  endSecond: number;
  duration: number;
  feedbackType: 'ME_GUSTA' | 'NO_ME_GUSTA';
  likedComponents: SegmentComponentType[];
  dislikedComponents: SegmentComponentType[];
  humanScore: number; // 1-5
  comment: string;
  analysis?: {
    shotType?: string;
    shotDuration?: number;
    cameraMotion?: string;
    transitionType?: string;
    lighting?: string;
    colorProfile?: string;
    composition?: string;
    textStyle?: string;
    pace?: 'SLOW' | 'MODERATE' | 'FAST';
    musicTempo?: number;
    musicEnergy?: 'LOW' | 'MEDIUM' | 'HIGH';
    emotionalTone?: string;
    narrativeFunction?: string;
  };
  createdAt: string;
}

export type CanonicalRightsStatus =
  | 'OWNED_BY_USER'
  | 'PUBLIC_DOMAIN_VERIFIED'
  | 'OPEN_LICENSE_VERIFIED'
  | 'PLATFORM_LICENSE_VERIFIED'
  | 'USER_PERMISSION_CONFIRMED'
  | 'RIGHTS_UNCLEAR'
  | 'RESTRICTED';

export const CANONICAL_REUSE_PERMITTED_STATUSES: readonly CanonicalRightsStatus[] = [
  'OWNED_BY_USER',
  'PUBLIC_DOMAIN_VERIFIED',
  'OPEN_LICENSE_VERIFIED',
  'PLATFORM_LICENSE_VERIFIED',
  'USER_PERMISSION_CONFIRMED'
] as const;

export function isProductiveReusePermitted(rightsStatus?: string): boolean {
  if (!rightsStatus) return false;
  return CANONICAL_REUSE_PERMITTED_STATUSES.includes(rightsStatus as CanonicalRightsStatus);
}

export interface AtlasReferenceFrame {
  frameId: string;
  referenceId: string;
  timestampSeconds: number;
  filePath: string;
  webPath: string;
  sha256: string;
  sourceUrl: string;
  rightsStatus: CanonicalRightsStatus;
  humanAction?: 'SOLO_REFERENCIA' | 'GUARDAR_EN_BANCO' | 'USAR_EN_VIDEO';
  humanExactAssetSelection?: boolean;
  assignedSceneId?: string;
  createdAt: string;
}

export interface AtlasReferenceClip {
  clipId: string;
  referenceId: string;
  startSecond: number;
  endSecond: number;
  duration: number;
  filePath: string;
  webPath: string;
  sha256: string;
  sourceUrl: string;
  rightsStatus: CanonicalRightsStatus;
  humanAction?: 'SOLO_REFERENCIA' | 'GUARDAR_EN_BANCO' | 'USAR_EN_VIDEO';
  humanExactAssetSelection?: boolean;
  assignedSceneId?: string;
  createdAt: string;
}

/**
 * 15. ATLAS HUMAN DIRECTOR PROFILE (Aggregated Multi-Reference Learning)
 */
export interface AtlasHumanDirectorProfile {
  preferredShotTypes: string[];
  targetShotDuration: number;
  preferredPace: 'SLOW' | 'MODERATE' | 'FAST';
  preferredMusicStyles: string[];
  preferredTransitions: string[];
  preferredLighting: string[];
  preferredMotionLevel: 'STATIC' | 'SLOW_PAN_ZOOM' | 'DYNAMIC_HANDHELD' | 'KINETIC';
  maxTextLines: number;
  dislikedPatterns: string[];
  winningPatterns: string[];
  rejectedTrackIds?: string[];
  totalSegmentsLearned: number;
  lastUpdated: string;
}

/**
 * 9. AUTONOMOUS EDITOR DECISION ENGINE CONTRACTS
 */
export interface EditorSceneInstruction {
  sceneId: string;
  assetId: string;
  mediaType: 'VIDEO' | 'IMAGE';
  sourceUrl: string;
  startTime: number;
  duration: number;
  targetAspect: '9:16';
  cropSettings: {
    xOffsetRatio: number;
    yOffsetRatio: number;
    scale: number;
  };
  imageMotion?: {
    type: 'KEN_BURNS_ZOOM_IN' | 'KEN_BURNS_ZOOM_OUT' | 'PAN_LEFT' | 'PAN_RIGHT';
    intensity: number;
  };
  transitionIn: 'CUT' | 'FADE_0.3S' | 'DISSOLVE_0.5S';
  caption: {
    text: string;
    maxLines: 2 | 3;
    displayStart: number;
    displayDuration: number;
    highlightKeywords: string[];
  };
}

export interface EditorCompositionPlan {
  compositionId: string;
  videoId: string;
  targetDurationSeconds: number;
  scenes: EditorSceneInstruction[];
  audioPlan: {
    trackId: string;
    musicPath: string;
    fadeInSeconds: number;
    fadeOutSeconds: number;
    duckingLevels: { duringSpeech: number; transitionPeak: number };
    totalDuration: number;
  };
  ctaPlan: {
    startSecond: number;
    durationSecond: number;
    overlayType: 'END_CARD_MODAL';
    destinationUrl: string;
  };
  directorScore: number;
  predictedQualityScore: number;
  createdAt: string;
}

/**
 * 13. PERFORMANCE LEARNING & POST-PUBLICATION METRICS
 */
export interface VideoPerformanceMetrics {
  videoId: string;
  publishedAt: string;
  platforms: string[];
  views: number;
  retentionRatePercent: number; // e.g. 64%
  completionRatePercent: number; // e.g. 42%
  rewatchRatePercent: number;
  shares: number;
  saves: number;
  comments: number;
  followerConversion: number;
  viewVelocityPerDay: number;
  audiencePerformanceScore: number; // 0-100
  humanQualityScore: number; // 0-100
  compositeSuccessRank: number; // Combined weighted score
  lastSyncedAt: string;
}
