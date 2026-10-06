/**
 * socialHarvestRouterV3.ts — Router Social V3 con Separación LIVE / BACKFILL y Telemetría Reconciliada
 */

import { BlueskyJetstreamHarvester } from '../socialV2/blueskyJetstreamHarvester';
import { BlueskyBackfillHarvester } from './blueskyBackfillHarvester';
import { MastodonSocialHarvester } from '../socialV2/mastodonSocialHarvester';
import { XSocialHarvester } from '../socialV2/xSocialHarvester';
import { SocialTelemetryTracker, GlobalSocialTelemetrySnapshot } from './socialTelemetryV3';
import { HarvestDedupeIndex } from '../harvestDedupeIndex';
import { globalCandidateManifest } from '../mineCandidateManifest';
import type { YouTubeHarvestReference } from '../types';

export class SocialHarvestRouterV3 {
  private dedupeIndex: HarvestDedupeIndex;
  private bskyLive: BlueskyJetstreamHarvester;
  private bskyBackfill: BlueskyBackfillHarvester;
  private mastodonLive: MastodonSocialHarvester;
  private xHarvester: XSocialHarvester;
  private telemetry: SocialTelemetryTracker;

  private isRunning = false;
  private pendingBatch: YouTubeHarvestReference[] = [];
  private totalPersisted = 0;

  constructor(dedupeIndex: HarvestDedupeIndex) {
    this.dedupeIndex = dedupeIndex;
    this.bskyLive = new BlueskyJetstreamHarvester();
    this.bskyBackfill = new BlueskyBackfillHarvester();
    this.mastodonLive = new MastodonSocialHarvester();
    this.xHarvester = new XSocialHarvester();
    this.telemetry = new SocialTelemetryTracker();
  }

  async startHarvestSession(durationSeconds = 600, enableBackfill = true, persistToDb = true): Promise<{
    durationSeconds: number;
    telemetrySnapshot: GlobalSocialTelemetrySnapshot;
    persistedToAtlas: number;
  }> {
    const t0 = Date.now();
    this.isRunning = true;

    console.log(`⚡ [INICIANDO SOCIAL HARVEST V3 — LIVE + BACKFILL (${(durationSeconds / 60).toFixed(0)} MIN)]`);
    console.log(`  Plataformas: Bluesky Live + Bluesky Backfill + Mastodon Selective + X`);
    console.log(`  Atlas RAM Set Inicial: ${this.dedupeIndex.getTotalAtlasSize().toLocaleString()} contenidos cargados\n`);

    // 1. Iniciar Bluesky Live Stream
    this.bskyLive.startStream((refs) => this.handleIncomingRefs('bluesky_live', refs));

    // 2. Iniciar Bluesky Backfill Histórico si está habilitado
    if (enableBackfill) {
      this.bskyBackfill.runBackfill(20, (refs) => this.handleIncomingRefs('bluesky_backfill', refs));
    }

    // 3. Iniciar Mastodon Live
    this.mastodonLive.startHarvest((refs) => this.handleIncomingRefs('mastodon_live', refs));

    // 4. Iniciar X Stream
    this.xHarvester.startHarvest((refs) => this.handleIncomingRefs('x_live', refs));

    // Monitoreo periódico cada 30 segundos
    const monitorInterval = setInterval(() => {
      const elapsed = Math.max(1, Math.round((Date.now() - t0) / 1000));
      this.telemetry.flushBucket(elapsed);
      const snap = this.telemetry.getSnapshot();
      console.log(`  ⏱️ [${elapsed}s/${durationSeconds}s] Social Net-New: +${snap.globalNetNew} (${snap.globalNetNewPerSec}/s | ${snap.projectedNetNewPerHour}/h) | Live: +${snap.platformSnapshots.find(p => p.mode === 'live')?.netNew || 0} | Backfill: +${snap.platformSnapshots.find(p => p.mode === 'backfill')?.netNew || 0}`);
    }, 30000);

    // Esperar duración
    await new Promise(r => setTimeout(r, durationSeconds * 1000));

    clearInterval(monitorInterval);
    this.isRunning = false;

    this.bskyLive.stopStream();
    this.bskyBackfill.stopBackfill();
    this.mastodonLive.stopHarvest();
    this.xHarvester.stopHarvest();

    // Persistir remanente en Atlas DB
    if (persistToDb && this.pendingBatch.length > 0) {
      const remainder = this.pendingBatch.splice(0, this.pendingBatch.length);
      const count = await this.dedupeIndex.persistBatch(remainder);
      this.totalPersisted += count;
    }

    const finalSnapshot = this.telemetry.getSnapshot();

    return {
      durationSeconds: finalSnapshot.elapsedSeconds,
      telemetrySnapshot: finalSnapshot,
      persistedToAtlas: this.totalPersisted
    };
  }

  private async handleIncomingRefs(platformKey: string, refs: YouTubeHarvestReference[]) {
    for (const ref of refs) {
      const isKnown = this.dedupeIndex.isDuplicate(ref.videoId);
      this.telemetry.recordEvent(platformKey, ref.videoId, isKnown);

      if (!isKnown) {
        this.dedupeIndex.markSeen(ref.videoId);
        this.pendingBatch.push(ref);
        globalCandidateManifest.addCandidate(ref, platformKey, this.dedupeIndex.getTotalAtlasSize());
      }
    }

    if (this.pendingBatch.length >= 50) {
      const batch = this.pendingBatch.splice(0, this.pendingBatch.length);
      const count = await this.dedupeIndex.persistBatch(batch);
      this.totalPersisted += count;
    }
  }
}
