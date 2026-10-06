/**
 * socialTelemetryV3.ts — Telemetría Social V3 con Reconciliación Matemática Exacta y Métricas de Valor
 */

export interface PlatformTelemetrySnapshot {
  platform: 'bluesky' | 'mastodon' | 'x' | 'reddit';
  mode: 'live' | 'backfill';
  eventsScanned: number;
  youtubeRefsFound: number;
  uniqueIdsDiscovered: number;
  duplicateWithinPlatform: number;
  knownAtStart: number;
  netNew: number;
  uniqueRate: number;       // uniqueIdsDiscovered / youtubeRefsFound
  noveltyRate: number;      // netNew / uniqueIdsDiscovered
  refVelocity: number;      // youtubeRefsFound / elapsedSeconds
  netNewVelocity: number;   // netNew / elapsedSeconds
  socialValue: number;      // uniqueRate * noveltyRate * refVelocity
}

export interface GlobalSocialTelemetrySnapshot {
  elapsedSeconds: number;
  globalUniqueYouTubeIds: number;
  alreadyKnownAtRunStart: number;
  crossPlatformDuplicates: number;
  duplicateWithinPlatformsSum: number;
  globalNetNew: number;
  initialAtlasOverlapRate: number;
  socialNoveltyRate: number;
  globalNetNewPerSec: number;
  projectedNetNewPerHour: number;
  projectedNetNewPerDay: number;
  platformSnapshots: PlatformTelemetrySnapshot[];
}

export class SocialTelemetryTracker {
  private startTime = Date.now();
  private platformUniqueSets: Map<string, Set<string>> = new Map([
    ['bluesky_live', new Set()],
    ['bluesky_backfill', new Set()],
    ['mastodon_live', new Set()],
    ['x_live', new Set()],
    ['x_backfill', new Set()]
  ]);

  private platformRawRefs: Map<string, number> = new Map();
  private platformKnownAtStart: Map<string, number> = new Map();
  private platformNetNew: Map<string, number> = new Map();

  private globalUniqueSet = new Set<string>();
  private globalKnownAtStartSet = new Set<string>();
  private globalNetNewSet = new Set<string>();

  // 10-Minute Buckets
  private bucketIntervalMinutes = 10;
  private buckets: Array<{
    bucketIndex: number;
    startSec: number;
    endSec: number;
    netNew: number;
    unique: number;
    refs: number;
  }> = [];

  private currentBucket = {
    index: 0,
    netNew: 0,
    unique: 0,
    refs: 0
  };

  recordEvent(platformKey: string, videoId: string, isKnownAtStart: boolean) {
    this.platformRawRefs.set(platformKey, (this.platformRawRefs.get(platformKey) || 0) + 1);
    this.currentBucket.refs++;

    const pSet = this.platformUniqueSets.get(platformKey) || new Set();
    const isFirstInPlatform = !pSet.has(videoId);
    pSet.add(videoId);
    this.platformUniqueSets.set(platformKey, pSet);

    const isFirstGlobal = !this.globalUniqueSet.has(videoId);
    this.globalUniqueSet.add(videoId);

    if (isFirstGlobal) {
      this.currentBucket.unique++;
      if (isKnownAtStart) {
        this.globalKnownAtStartSet.add(videoId);
      } else {
        this.globalNetNewSet.add(videoId);
        this.currentBucket.netNew++;
      }
    }

    if (isFirstInPlatform) {
      if (isKnownAtStart) {
        this.platformKnownAtStart.set(platformKey, (this.platformKnownAtStart.get(platformKey) || 0) + 1);
      } else {
        this.platformNetNew.set(platformKey, (this.platformNetNew.get(platformKey) || 0) + 1);
      }
    }
  }

  flushBucket(elapsedSeconds: number) {
    const bucketIdx = Math.floor(elapsedSeconds / (this.bucketIntervalMinutes * 60));
    if (bucketIdx > this.currentBucket.index) {
      this.buckets.push({
        bucketIndex: this.currentBucket.index,
        startSec: this.currentBucket.index * this.bucketIntervalMinutes * 60,
        endSec: elapsedSeconds,
        netNew: this.currentBucket.netNew,
        unique: this.currentBucket.unique,
        refs: this.currentBucket.refs
      });
      this.currentBucket = {
        index: bucketIdx,
        netNew: 0,
        unique: 0,
        refs: 0
      };
    }
  }

  getSnapshot(): GlobalSocialTelemetrySnapshot {
    const elapsedSeconds = Math.max(1, Math.round((Date.now() - this.startTime) / 1000));
    const globalUnique = this.globalUniqueSet.size;
    const knownAtStart = this.globalKnownAtStartSet.size;
    const globalNetNew = this.globalNetNewSet.size;

    // INVARIANT MATHEMATICAL CHECK: globalUnique === knownAtStart + globalNetNew
    if (globalUnique !== knownAtStart + globalNetNew) {
      throw new Error(`[TELEMETRY_INVARIANT_FAIL] globalUnique (${globalUnique}) !== knownAtStart (${knownAtStart}) + globalNetNew (${globalNetNew})`);
    }

    let sumPlatformUniques = 0;
    let sumPlatformRefs = 0;
    const platformSnapshots: PlatformTelemetrySnapshot[] = [];

    for (const [key, pSet] of this.platformUniqueSets.entries()) {
      const uCount = pSet.size;
      sumPlatformUniques += uCount;
      const refs = this.platformRawRefs.get(key) || 0;
      sumPlatformRefs += refs;
      const kn = this.platformKnownAtStart.get(key) || 0;
      const net = this.platformNetNew.get(key) || 0;

      const [pName, pMode] = key.split('_') as [PlatformTelemetrySnapshot['platform'], PlatformTelemetrySnapshot['mode']];
      const uRate = refs > 0 ? +(uCount / refs).toFixed(3) : 0;
      const novRate = uCount > 0 ? +(net / uCount).toFixed(3) : 0;
      const rVel = +(refs / elapsedSeconds).toFixed(2);
      const netVel = +(net / elapsedSeconds).toFixed(2);
      const sVal = +(uRate * novRate * rVel * 100).toFixed(1);

      platformSnapshots.push({
        platform: pName,
        mode: pMode,
        eventsScanned: refs,
        youtubeRefsFound: refs,
        uniqueIdsDiscovered: uCount,
        duplicateWithinPlatform: Math.max(0, refs - uCount),
        knownAtStart: kn,
        netNew: net,
        uniqueRate: uRate,
        noveltyRate: +(novRate * 100).toFixed(1),
        refVelocity: rVel,
        netNewVelocity: netVel,
        socialValue: sVal
      });
    }

    const crossPlatformDupes = Math.max(0, sumPlatformUniques - globalUnique);
    const initialOverlapRate = globalUnique > 0 ? +((knownAtStart / globalUnique) * 100).toFixed(2) : 0;
    const socialNoveltyRate = globalUnique > 0 ? +((globalNetNew / globalUnique) * 100).toFixed(2) : 0;
    const globalNetNewPerSec = +(globalNetNew / elapsedSeconds).toFixed(3);
    const projectedNetNewPerHour = Math.round(globalNetNewPerSec * 3600);
    const projectedNetNewPerDay = Math.round(projectedNetNewPerHour * 24);

    return {
      elapsedSeconds,
      globalUniqueYouTubeIds: globalUnique,
      alreadyKnownAtRunStart: knownAtStart,
      crossPlatformDuplicates: crossPlatformDupes,
      duplicateWithinPlatformsSum: Math.max(0, sumPlatformRefs - sumPlatformUniques),
      globalNetNew,
      initialAtlasOverlapRate: initialOverlapRate,
      socialNoveltyRate,
      globalNetNewPerSec,
      projectedNetNewPerHour,
      projectedNetNewPerDay,
      platformSnapshots
    };
  }

  getBuckets() {
    return this.buckets;
  }
}
