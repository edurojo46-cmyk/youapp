/**
 * socialHarvestRouter.ts — Enrutador Multired de Social Harvester V2 (Bluesky, Mastodon, X)
 */

import { BlueskyJetstreamHarvester } from './blueskyJetstreamHarvester';
import { MastodonSocialHarvester } from './mastodonSocialHarvester';
import { XSocialHarvester } from './xSocialHarvester';
import { SocialMineIntelligence } from './socialMineIntelligence';
import { HarvestDedupeIndex } from '../harvestDedupeIndex';
import { globalCandidateManifest } from '../mineCandidateManifest';
import type { YouTubeHarvestReference } from '../types';

export interface SocialHarvestSummary {
  platform: 'bluesky' | 'mastodon' | 'x' | 'global';
  eventsScanned: number;
  youtubeRefsFound: number;
  uniqueIds: number;
  knownAtlas: number;
  netNew: number;
  noveltyRate: number;
  netNewPerSec: number;
}

export class SocialHarvestRouter {
  private dedupeIndex: HarvestDedupeIndex;
  private bluesky: BlueskyJetstreamHarvester;
  private mastodon: MastodonSocialHarvester;
  private xHarvester: XSocialHarvester;
  public intelligence: SocialMineIntelligence;

  private isRunning = false;
  private pendingPersistBatch: YouTubeHarvestReference[] = [];
  private uniqueDiscoveredGlobal = new Set<string>();

  private stats = {
    bluesky: { events: 0, refs: 0, unique: new Set<string>(), known: 0, netNew: 0 },
    mastodon: { events: 0, refs: 0, unique: new Set<string>(), known: 0, netNew: 0 },
    x: { events: 0, refs: 0, unique: new Set<string>(), known: 0, netNew: 0 }
  };

  constructor(dedupeIndex: HarvestDedupeIndex) {
    this.dedupeIndex = dedupeIndex;
    this.bluesky = new BlueskyJetstreamHarvester();
    this.mastodon = new MastodonSocialHarvester();
    this.xHarvester = new XSocialHarvester();
    this.intelligence = new SocialMineIntelligence();
  }

  async startHarvest(durationSeconds = 600, persistToDb = true): Promise<{
    durationSeconds: number;
    platformSummaries: SocialHarvestSummary[];
    globalSummary: SocialHarvestSummary;
    persistedToAtlas: number;
  }> {
    const t0 = Date.now();
    this.isRunning = true;

    console.log(`⚡ [INICIANDO SOCIAL TURBO CANARY (${(durationSeconds / 60).toFixed(0)} MINUTOS)]`);
    console.log(`  Plataformas activas: Bluesky Jetstream + Mastodon Fediverse + X Stream`);
    console.log(`  Atlas RAM Dedupe: ${this.dedupeIndex.getTotalAtlasSize().toLocaleString()} contenidos cargados\n`);

    // Iniciar harvesters concurrentes
    this.bluesky.startStream((refs) => this.handleIncomingRefs('bluesky', refs));
    this.mastodon.startHarvest((refs) => this.handleIncomingRefs('mastodon', refs));
    this.xHarvester.startHarvest((refs) => this.handleIncomingRefs('x', refs));

    // Monitoreo en vivo cada 30 segundos
    const progressInterval = setInterval(() => {
      const elapsed = Math.max(1, Math.round((Date.now() - t0) / 1000));
      const totalNet = this.stats.bluesky.netNew + this.stats.mastodon.netNew + this.stats.x.netNew;
      const rate = +(totalNet / elapsed).toFixed(2);
      console.log(`  ⏱️ [${elapsed}s/${durationSeconds}s] Social Net-New: +${totalNet} (${rate}/s) | Bsky: +${this.stats.bluesky.netNew} | Mstdn: +${this.stats.mastodon.netNew} | X: +${this.stats.x.netNew}`);
    }, 30000);

    // Esperar duración
    await new Promise(r => setTimeout(r, durationSeconds * 1000));

    clearInterval(progressInterval);
    this.isRunning = false;

    this.bluesky.stopStream();
    this.mastodon.stopHarvest();
    this.xHarvester.stopHarvest();

    // Persistir remanente en Atlas DB si se solicita
    let persistedToAtlas = this.totalPersistedCount;
    if (persistToDb && this.pendingPersistBatch.length > 0) {
      const remainder = this.pendingPersistBatch.splice(0, this.pendingPersistBatch.length);
      const count = await this.dedupeIndex.persistBatch(remainder);
      persistedToAtlas += count;
    }

    const elapsed = Math.max(1, Math.round((Date.now() - t0) / 1000));

    const makeSummary = (p: 'bluesky' | 'mastodon' | 'x'): SocialHarvestSummary => {
      const st = this.stats[p];
      const uCount = st.unique.size;
      const nov = uCount > 0 ? +((st.netNew / uCount) * 100).toFixed(1) : 0;
      const rate = +(st.netNew / elapsed).toFixed(2);
      return {
        platform: p,
        eventsScanned: st.events,
        youtubeRefsFound: st.refs,
        uniqueIds: uCount,
        knownAtlas: st.known,
        netNew: st.netNew,
        noveltyRate: nov,
        netNewPerSec: rate
      };
    };

    const bskySummary = makeSummary('bluesky');
    const mstdnSummary = makeSummary('mastodon');
    const xSummary = makeSummary('x');

    const totalUniqueGlobal = this.uniqueDiscoveredGlobal.size;
    const totalNetGlobal = bskySummary.netNew + mstdnSummary.netNew + xSummary.netNew;
    const globalNov = totalUniqueGlobal > 0 ? +((totalNetGlobal / totalUniqueGlobal) * 100).toFixed(1) : 0;
    const globalRate = +(totalNetGlobal / elapsed).toFixed(2);

    const globalSummary: SocialHarvestSummary = {
      platform: 'global',
      eventsScanned: bskySummary.eventsScanned + mstdnSummary.eventsScanned + xSummary.eventsScanned,
      youtubeRefsFound: bskySummary.youtubeRefsFound + mstdnSummary.youtubeRefsFound + xSummary.youtubeRefsFound,
      uniqueIds: totalUniqueGlobal,
      knownAtlas: (bskySummary.knownAtlas + mstdnSummary.knownAtlas + xSummary.knownAtlas),
      netNew: totalNetGlobal,
      noveltyRate: globalNov,
      netNewPerSec: globalRate
    };

    return {
      durationSeconds: elapsed,
      platformSummaries: [bskySummary, mstdnSummary, xSummary],
      globalSummary,
      persistedToAtlas
    };
  }

  private totalPersistedCount = 0;

  private async handleIncomingRefs(platform: 'bluesky' | 'mastodon' | 'x', refs: YouTubeHarvestReference[]) {
    const st = this.stats[platform];
    st.events += refs.length;

    for (const ref of refs) {
      st.refs++;
      if (!st.unique.has(ref.videoId)) {
        st.unique.add(ref.videoId);
        this.uniqueDiscoveredGlobal.add(ref.videoId);

        const isKnown = this.dedupeIndex.isDuplicate(ref.videoId);
        this.intelligence.recordDiscovery(ref.category || 'general_social', ref.videoId, isKnown);

        if (isKnown) {
          st.known++;
        } else {
          st.netNew++;
          this.dedupeIndex.markSeen(ref.videoId);
          this.pendingPersistBatch.push(ref);
          globalCandidateManifest.addCandidate(ref, `social_${platform}`, this.dedupeIndex.getTotalAtlasSize());
        }
      }
    }

    if (this.pendingPersistBatch.length >= 50) {
      const batch = this.pendingPersistBatch.splice(0, this.pendingPersistBatch.length);
      const count = await this.dedupeIndex.persistBatch(batch);
      this.totalPersistedCount += count;
    }
  }
}
