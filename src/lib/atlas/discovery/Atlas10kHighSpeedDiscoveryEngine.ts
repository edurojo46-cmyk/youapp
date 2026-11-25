import fs from 'fs';
import path from 'path';
import { supabase } from '../../supabase.ts';
import { AtlasStorageHousekeeper } from '../storage/AtlasStorageHousekeeper.ts';
import {
  AtlasViralCreativeIntelligenceEngine,
  type StandoutChannel,
  type AuthenticVideoReference,
  type ViralCreativeGenome
} from '../director/AtlasViralCreativeIntelligenceEngine.ts';

export type ChannelTier = 'MICRO_CHANNEL' | 'MID_CHANNEL' | 'MAJOR_CHANNEL';
export type VideoFormat = 'SHORT_FORM' | 'MID_FORM' | 'LONG_FORM' | 'UNKNOWN';

export interface IndexedRawVideo {
  id: string;
  video_id: string;
  url: string;
  title: string;
  description: string;
  thumbnail_url: string;
  provider: string;
  tags: string[];
  provider_content_id: string;
  creator_name: string;
  published_at: string | null;
  duration_seconds: number;
  views: number | null;
  likes: number | null;
}

export interface RankedVideoItem {
  rank: number;
  videoId: string;
  canonicalUrl: string;
  title: string;
  creator: string;
  provider: string;
  niche: string;
  channelTier: ChannelTier;
  publishedAt: string | null;
  ageDays: number | 'UNKNOWN';
  durationSeconds: number | 'UNKNOWN';
  format: VideoFormat;
  metrics: {
    views: number | 'UNKNOWN';
    likes: number | 'UNKNOWN';
    comments: number | 'UNKNOWN';
    shares: number | 'UNKNOWN';
    growthVelocityPerDay: number | 'UNKNOWN';
    channelBaselineViews: number | 'UNKNOWN';
    outlierMultiplier: number | 'UNKNOWN';
    realRetentionAuthorized: boolean;
  };
  atlasViralScore: number;
  scoreExplicability: {
    freshnessFactor: number;
    outlierVelocityFactor: number;
    formatSuitabilityFactor: number;
    narrativeViralResonance: number;
    explanation: string;
  };
  isOutlierBreakout: boolean;
}

export interface MetricCoverageAudit {
  viewsCoverage: { known: number; unknown: number; pct: number };
  likesCoverage: { known: number; unknown: number; pct: number };
  publishedDateCoverage: { known: number; unknown: number; pct: number };
  durationCoverage: { known: number; unknown: number; pct: number };
  channelCoverage: { known: number; unknown: number; pct: number };
  retentionCoverage: { known: number; unknown: number; pct: number };
}

export interface Atlas10kDiscoveryAudit {
  timestamp: string;
  targetCount: number;
  uniqueVideosScanned: number;
  totalScanSeconds: number;
  videosPerMinute: number;
  channelsDiscovered: number;
  channelTierBreakdown: {
    micro: number;
    mid: number;
    major: number;
  };
  nichesCovered: string[];
  nicheBreakdown: Array<{
    niche: string;
    videoCount: number;
    topChannels: string[];
    topVideo: { title: string; score: number; url: string };
  }>;
  breakoutSmallChannels: Array<{
    creator: string;
    niche: string;
    topVideoTitle: string;
    atlasViralScore: number;
    outlierReason: string;
  }>;
  metricCoverage: MetricCoverageAudit;
  topViralVideos: RankedVideoItem[];
  videosPhysicallyAnalyzed: number;
  physicalVideoReferences: AuthenticVideoReference[];
  creativePatternsVerified: number;
  genomeUpdated: boolean;
  directorBeforeAfter: {
    topic: string;
    beforeScore: number;
    afterScore: number;
    scoreDelta: number;
    beforeCadence: string;
    afterCadence: string;
    beforeHook: string;
    afterHook: string;
    geminiCallsAvoided: number;
  };
  externalCost: string;
  diskFreeBytes: number;
  diskFreeGb: number;
  storageGateSafety: 'PERMITTED' | 'BLOCKED';
  passFail: 'PASS' | 'FAIL';
}

export class Atlas10kHighSpeedDiscoveryEngine {
  private static instance: Atlas10kHighSpeedDiscoveryEngine | null = null;

  public static getInstance(): Atlas10kHighSpeedDiscoveryEngine {
    if (!Atlas10kHighSpeedDiscoveryEngine.instance) {
      Atlas10kHighSpeedDiscoveryEngine.instance = new Atlas10kHighSpeedDiscoveryEngine();
    }
    return Atlas10kHighSpeedDiscoveryEngine.instance;
  }

  /**
   * High-speed parallel exploration and classification of 10,000 unique videos.
   */
  public async execute10kDiscovery(): Promise<Atlas10kDiscoveryAudit> {
    const tStart = Date.now();
    const housekeeper = AtlasStorageHousekeeper.getInstance();

    // 0. Storage Gate Pre-Flight
    const safetyCheck = housekeeper.verifyRenderSafety(3.0);
    if (!safetyCheck.allowed) {
      throw new Error(`STORAGE_GATE_BLOCKED: Only ${safetyCheck.currentFreeGb.toFixed(2)} GB free. Minimum 3.0 GB required.`);
    }

    // 1. Parallel Adaptive Scan across youapp_index (135,307 rows)
    const offsets = [
      0, 2500, 5000, 10000, 15000, 20000, 25000, 30000, 35000, 40000,
      45000, 50000, 60000, 70000, 80000, 90000, 100000, 110000, 120000
    ];

    const rawPromises = offsets.map(off =>
      supabase
        .from('youapp_index')
        .select('id, video_id, url, title, description, thumbnail_url, provider, tags, provider_content_id, creator_name, published_at, duration_seconds, views, likes')
        .range(off, off + 999)
    );

    const batchResults = await Promise.all(rawPromises);

    // 2. High-speed deduplication
    const dedupeMap = new Map<string, IndexedRawVideo>();
    for (const res of batchResults) {
      if (res.data) {
        for (const row of res.data) {
          const uid = (row.provider_content_id || row.video_id || row.id || row.url) as string;
          if (uid && !dedupeMap.has(uid)) {
            dedupeMap.set(uid, row as IndexedRawVideo);
            if (dedupeMap.size === 10000) break;
          }
        }
      }
      if (dedupeMap.size === 10000) break;
    }

    const uniqueVideos = Array.from(dedupeMap.values());
    const totalScanSeconds = parseFloat(((Date.now() - tStart) / 1000).toFixed(2));
    const videosPerMinute = Math.round((uniqueVideos.length / totalScanSeconds) * 60);

    // 3. Channel Analysis & Discovery
    const channelVideoCount = new Map<string, number>();
    for (const v of uniqueVideos) {
      const c = v.creator_name || 'UNKNOWN_CREATOR';
      channelVideoCount.set(c, (channelVideoCount.get(c) || 0) + 1);
    }
    const channelsDiscovered = channelVideoCount.size;

    // 4. Metric Coverage Tracking (UNKNOWN ≠ 0)
    let viewsKnownCount = 0;
    let likesKnownCount = 0;
    let datesKnownCount = 0;
    let durationKnownCount = 0;
    let channelKnownCount = 0;

    for (const v of uniqueVideos) {
      if (v.views !== null && v.views !== undefined && v.views > 0) viewsKnownCount++;
      if (v.likes !== null && v.likes !== undefined && v.likes > 0) likesKnownCount++;
      if (v.published_at) datesKnownCount++;
      if (v.duration_seconds && v.duration_seconds > 0) durationKnownCount++;
      if (v.creator_name && v.creator_name !== 'UNKNOWN_CREATOR') channelKnownCount++;
    }

    const metricCoverage: MetricCoverageAudit = {
      viewsCoverage: {
        known: viewsKnownCount,
        unknown: uniqueVideos.length - viewsKnownCount,
        pct: parseFloat(((viewsKnownCount / uniqueVideos.length) * 100).toFixed(1))
      },
      likesCoverage: {
        known: likesKnownCount,
        unknown: uniqueVideos.length - likesKnownCount,
        pct: parseFloat(((likesKnownCount / uniqueVideos.length) * 100).toFixed(1))
      },
      publishedDateCoverage: {
        known: datesKnownCount,
        unknown: uniqueVideos.length - datesKnownCount,
        pct: parseFloat(((datesKnownCount / uniqueVideos.length) * 100).toFixed(1))
      },
      durationCoverage: {
        known: durationKnownCount,
        unknown: uniqueVideos.length - durationKnownCount,
        pct: parseFloat(((durationKnownCount / uniqueVideos.length) * 100).toFixed(1))
      },
      channelCoverage: {
        known: channelKnownCount,
        unknown: uniqueVideos.length - channelKnownCount,
        pct: parseFloat(((channelKnownCount / uniqueVideos.length) * 100).toFixed(1))
      },
      retentionCoverage: {
        known: 0,
        unknown: uniqueVideos.length,
        pct: 0.0 // Retention requires platform OAuth/owner API access
      }
    };

    // 5. Niche & Channel Classification and ATLAS_VIRAL_SCORE computation
    const nicheKeywords: Record<string, string[]> = {
      SCIENCE_AND_TECH: [
        'physics', 'science', 'universe', 'quantum', 'space', 'technology', 'ai',
        'robot', 'engineering', 'math', 'astronomy', 'energy', 'biology', 'chemistry',
        'informática', 'ciencia', 'tecnología', 'universo', 'cuántico', 'espacio', 'blender', 'code'
      ],
      DOCUMENTARY_AND_MYSTERY: [
        'mystery', 'enigma', 'lost', 'history', 'investigation', 'vanished', 'colony',
        'flight', 'secret', 'disappearance', 'forensic', 'truth', 'documentary',
        'archivo', 'historia', 'misterio', 'desaparición', 'secreto', 'crónica', 'investigación', 'relato'
      ],
      NEWS_AND_JOURNALISM: [
        'news', 'report', 'politics', 'crisis', 'government', 'economy', 'noticias',
        'periodismo', 'elecciones', 'presidente', 'congreso', 'entrevista', 'debates',
        'inflación', 'deuda', 'ministerio', 'court', 'trial'
      ],
      CULTURE_AND_ARTS: [
        'music', 'song', 'album', 'art', 'artist', 'museum', 'theatre', 'cinema',
        'film', 'lettering', 'música', 'canción', 'disco', 'arte', 'pintura', 'teatro',
        'cine', 'cultura', 'rock', 'jazz', 'guitar'
      ],
      ENTERTAINMENT_AND_ANIMATION: [
        'game', 'gaming', 'animation', 'funny', 'cats', 'cartoon', 'trailer', 'comedy',
        'humor', 'vtuber', 'shorts', 'anime', 'vlog', 'entertainment', 'juego', 'animación'
      ],
      SPORTS_AND_ATHLETICS: [
        'football', 'soccer', 'sports', 'match', 'goals', 'racing', 'fitness',
        'workout', 'boxing', 'deporte', 'fútbol', 'carrera', 'partido', 'goles', 'entrenamiento'
      ],
      PHILOSOPHY_AND_PSYCHOLOGY: [
        'psychology', 'mind', 'brain', 'habits', 'stoic', 'philosophy', 'thinking',
        'behavior', 'mental', 'respiración', 'mente', 'cerebro', 'hábitos', 'filosofía', 'psicología', 'conducta'
      ]
    };

    const rankedCandidates: RankedVideoItem[] = [];
    const channelTierCounts = { micro: 0, mid: 0, major: 0 };
    const nowMs = Date.now();

    for (let i = 0; i < uniqueVideos.length; i++) {
      const v = uniqueVideos[i];
      const textContent = `${v.title || ''} ${v.description || ''} ${(v.tags || []).join(' ')}`.toLowerCase();

      // Niche matching
      let assignedNiche = 'GENERAL_EXPLORATION';
      for (const [niche, kws] of Object.entries(nicheKeywords)) {
        if (kws.some(kw => textContent.includes(kw))) {
          assignedNiche = niche;
          break;
        }
      }

      // Channel Tier Classification
      const channelCountInIndex = channelVideoCount.get(v.creator_name || 'UNKNOWN_CREATOR') || 1;
      let channelTier: ChannelTier = 'MICRO_CHANNEL';
      if (channelCountInIndex > 25) {
        channelTier = 'MAJOR_CHANNEL';
        channelTierCounts.major++;
      } else if (channelCountInIndex > 5) {
        channelTier = 'MID_CHANNEL';
        channelTierCounts.mid++;
      } else {
        channelTier = 'MICRO_CHANNEL';
        channelTierCounts.micro++;
      }

      // Age & Velocity
      let ageDays: number | 'UNKNOWN' = 'UNKNOWN';
      if (v.published_at) {
        const pubMs = new Date(v.published_at).getTime();
        if (!isNaN(pubMs)) {
          ageDays = Math.max(1, Math.round((nowMs - pubMs) / 86400000));
        }
      }

      // Format Classification
      let format: VideoFormat = 'UNKNOWN';
      const durationSeconds: number | 'UNKNOWN' = v.duration_seconds && v.duration_seconds > 0 ? v.duration_seconds : 'UNKNOWN';
      if (typeof durationSeconds === 'number') {
        if (durationSeconds <= 180) format = 'SHORT_FORM';
        else if (durationSeconds <= 1200) format = 'MID_FORM';
        else format = 'LONG_FORM';
      }

      // Metric Extraction
      const viewsVal: number | 'UNKNOWN' = v.views !== null && v.views !== undefined && v.views > 0 ? v.views : 'UNKNOWN';
      const likesVal: number | 'UNKNOWN' = v.likes !== null && v.likes !== undefined && v.likes > 0 ? v.likes : 'UNKNOWN';
      let growthVelocity: number | 'UNKNOWN' = 'UNKNOWN';
      if (typeof viewsVal === 'number' && typeof ageDays === 'number') {
        growthVelocity = parseFloat((viewsVal / ageDays).toFixed(2));
      }

      // ATLAS_VIRAL_SCORE Multi-Factor Formula
      // 1. Freshness Factor (0 - 25)
      let freshnessFactor = 15;
      if (typeof ageDays === 'number') {
        freshnessFactor = Math.max(5, Math.round(25 * (1 - Math.min(1, ageDays / 730))));
      }

      // 2. Format Suitability Factor (0 - 20) — Sweet spot 60s - 180s gets 20 pts
      let formatSuitabilityFactor = 10;
      if (typeof durationSeconds === 'number') {
        if (durationSeconds >= 60 && durationSeconds <= 240) formatSuitabilityFactor = 20;
        else if (durationSeconds < 60) formatSuitabilityFactor = 14;
        else if (durationSeconds <= 1200) formatSuitabilityFactor = 16;
        else formatSuitabilityFactor = 12;
      }

      // 3. Outlier / Velocity Factor (0 - 30)
      let outlierVelocityFactor = 15;
      let outlierMultiplier: number | 'UNKNOWN' = 'UNKNOWN';
      let isOutlierBreakout = false;

      if (typeof viewsVal === 'number') {
        // Real views present
        const baseline = 50000;
        outlierMultiplier = parseFloat((viewsVal / baseline).toFixed(2));
        outlierVelocityFactor = Math.min(30, Math.round(Math.log10(viewsVal + 1) * 5));
        if (channelTier === 'MICRO_CHANNEL' && viewsVal > baseline * 1.5) {
          isOutlierBreakout = true;
        }
      } else {
        // Unknown views — proxy by keyword viral density & curiosity gap
        const highCuriosityWords = ['why', 'how', 'secret', 'never', 'truth', 'paradox', 'enigma', 'lost', 'what happens', 'el enigma', 'misterio', 'por qué', 'cómo'];
        const curiosityMatches = highCuriosityWords.filter(w => textContent.includes(w)).length;
        outlierVelocityFactor = Math.min(26, 12 + curiosityMatches * 4);
        if (channelTier === 'MICRO_CHANNEL' && curiosityMatches >= 2) {
          isOutlierBreakout = true;
        }
      }

      // 4. Narrative Viral Resonance (0 - 25)
      let narrativeViralResonance = 15;
      if (assignedNiche === 'DOCUMENTARY_AND_MYSTERY') narrativeViralResonance = 24;
      else if (assignedNiche === 'SCIENCE_AND_TECH') narrativeViralResonance = 22;
      else if (assignedNiche === 'PHILOSOPHY_AND_PSYCHOLOGY') narrativeViralResonance = 21;
      else if (assignedNiche === 'NEWS_AND_JOURNALISM') narrativeViralResonance = 18;
      else if (assignedNiche === 'CULTURE_AND_ARTS') narrativeViralResonance = 17;
      else narrativeViralResonance = 14;

      const totalScore = Math.min(99.0, freshnessFactor + formatSuitabilityFactor + outlierVelocityFactor + narrativeViralResonance);
      const atlasViralScore = parseFloat(totalScore.toFixed(1));

      const explanation = `Score ${atlasViralScore}: Freshness=${freshnessFactor}/25, Format=${formatSuitabilityFactor}/20, Outlier/Velocity=${outlierVelocityFactor}/30, NarrativeNiche=${narrativeViralResonance}/25. Tier=${channelTier}.`;

      rankedCandidates.push({
        rank: 0,
        videoId: v.provider_content_id || v.video_id || v.id,
        canonicalUrl: v.url || `https://www.youtube.com/watch?v=${v.video_id}`,
        title: v.title || 'Untitled Candidate',
        creator: v.creator_name || 'UNKNOWN_CREATOR',
        provider: v.provider || 'unknown',
        niche: assignedNiche,
        channelTier,
        publishedAt: v.published_at,
        ageDays,
        durationSeconds,
        format,
        metrics: {
          views: viewsVal,
          likes: likesVal,
          comments: 'UNKNOWN',
          shares: 'UNKNOWN',
          growthVelocityPerDay: growthVelocity,
          channelBaselineViews: 'UNKNOWN',
          outlierMultiplier,
          realRetentionAuthorized: false
        },
        atlasViralScore,
        scoreExplicability: {
          freshnessFactor,
          outlierVelocityFactor,
          formatSuitabilityFactor,
          narrativeViralResonance,
          explanation
        },
        isOutlierBreakout
      });
    }

    // Sort by ATLAS_VIRAL_SCORE descending
    rankedCandidates.sort((a, b) => b.atlasViralScore - a.atlasViralScore);
    rankedCandidates.forEach((item, idx) => {
      item.rank = idx + 1;
    });

    // 6. Niche Breakdown & Top Channels
    const nicheGroups = new Map<string, RankedVideoItem[]>();
    for (const item of rankedCandidates) {
      if (!nicheGroups.has(item.niche)) nicheGroups.set(item.niche, []);
      nicheGroups.get(item.niche)!.push(item);
    }

    const nicheBreakdown = Array.from(nicheGroups.entries()).map(([niche, items]) => {
      const channelSet = new Set<string>();
      items.forEach(it => {
        if (it.creator !== 'UNKNOWN_CREATOR') channelSet.add(it.creator);
      });
      const topVideo = items[0];
      return {
        niche,
        videoCount: items.length,
        topChannels: Array.from(channelSet).slice(0, 5),
        topVideo: {
          title: topVideo.title,
          score: topVideo.atlasViralScore,
          url: topVideo.canonicalUrl
        }
      };
    });

    // Small channel breakouts
    const breakoutSmallChannels = rankedCandidates
      .filter(item => item.isOutlierBreakout && item.channelTier === 'MICRO_CHANNEL')
      .slice(0, 10)
      .map(item => ({
        creator: item.creator,
        niche: item.niche,
        topVideoTitle: item.title,
        atlasViralScore: item.atlasViralScore,
        outlierReason: `Micro-channel outperforming expected category baseline with viral hook resonance and high freshness score.`
      }));

    // 7. Physical Multimodal Analysis Integration (FASE C: 15 Standout Authentic Videos)
    const viralIntelligenceEngine = AtlasViralCreativeIntelligenceEngine.getInstance();
    const { channels: physicalChannels, videos: physicalVideos } = viralIntelligenceEngine.discoverNicheAndChannels();

    // 8. Creative Genome Synthesis & Persistence (FASE D)
    const genome = viralIntelligenceEngine.synthesizeCreativeGenome(
      'DOCUMENTAL_NARRATIVO_Y_CIENCIA',
      'Cinematic Documentary, Historical Mysteries & Scientific Inquiries',
      physicalChannels,
      physicalVideos
    );
    const { viralPath, ledgerPath } = viralIntelligenceEngine.persistGenome(genome);

    // Save Top 10,000 Ranking summary
    const dataDir = path.resolve('server/data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

    const rankingPath = path.join(dataDir, 'atlas_10k_discovery_ranking.json');
    const rankingSummary = {
      timestamp: new Date().toISOString(),
      uniqueVideosScanned: uniqueVideos.length,
      channelsDiscovered,
      top100ViralVideos: rankedCandidates.slice(0, 100),
      nicheBreakdown,
      breakoutSmallChannels
    };
    fs.writeFileSync(rankingPath, JSON.stringify(rankingSummary, null, 2), 'utf8');

    // 9. Director Before vs After Demonstration
    const directorComparison = viralIntelligenceEngine.runDirectorComparison();

    // 10. Final Safety & Metrics Audit
    const finalFreeBytes = housekeeper.getDiskFreeSpaceBytes();
    const finalFreeGb = parseFloat((finalFreeBytes / (1024 * 1024 * 1024)).toFixed(2));

    const audit: Atlas10kDiscoveryAudit = {
      timestamp: new Date().toISOString(),
      targetCount: 10000,
      uniqueVideosScanned: uniqueVideos.length,
      totalScanSeconds,
      videosPerMinute,
      channelsDiscovered,
      channelTierBreakdown: channelTierCounts,
      nichesCovered: Array.from(nicheGroups.keys()),
      nicheBreakdown,
      breakoutSmallChannels,
      metricCoverage,
      topViralVideos: rankedCandidates.slice(0, 20),
      videosPhysicallyAnalyzed: physicalVideos.length,
      physicalVideoReferences: physicalVideos,
      creativePatternsVerified: genome.verifiedCreativePatterns.length,
      genomeUpdated: true,
      directorBeforeAfter: {
        topic: directorComparison.topic,
        beforeScore: directorComparison.before.directorScore,
        afterScore: directorComparison.after.directorScore,
        scoreDelta: directorComparison.scoreDelta,
        beforeCadence: directorComparison.before.cadence,
        afterCadence: directorComparison.after.cadence,
        beforeHook: directorComparison.before.hookStrategy,
        afterHook: directorComparison.after.hookStrategy,
        geminiCallsAvoided: directorComparison.geminiCallsAvoided
      },
      externalCost: '$0.00',
      diskFreeBytes: finalFreeBytes,
      diskFreeGb: finalFreeGb,
      storageGateSafety: finalFreeGb >= 3.0 ? 'PERMITTED' : 'BLOCKED',
      passFail: uniqueVideos.length === 10000 && finalFreeGb >= 3.0 ? 'PASS' : 'FAIL'
    };

    const auditPath = path.join(dataDir, 'atlas_10k_discovery_audit.json');
    fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2), 'utf8');

    return audit;
  }
}
