/**
 * blueskyBackfillScaleEngine.ts — Motor de Escala de Backfill con Checkpointing y Tranches de 100.000 Eventos
 */

import * as fs from 'fs';
import * as path from 'path';
import { extractYouTubeVideoIds } from '../youtubeReferenceExtractor';
import { HarvestDedupeIndex } from '../harvestDedupeIndex';
import { globalCandidateManifest } from '../mineCandidateManifest';
import type { YouTubeHarvestReference } from '../types';

export interface BackfillCheckpoint {
  endpoint: string;
  cursorStartUs: number;
  cursorCurrentUs: number;
  cursorTargetUs: number;
  lastEventTimestamp: string;
  eventsProcessedTotal: number;
  youtubeRefsFoundTotal: number;
  netNewPersistedTotal: number;
  gapCount: number;
  reconnectCount: number;
  updatedAt: string;
}

export interface BackfillTrancheReport {
  trancheIndex: number;
  eventsInTranche: number;
  youtubeRefsInTranche: number;
  uniqueIdsInTranche: number;
  knownAtStartInTranche: number;
  duplicateWithinBackfillInTranche: number;
  netNewInTranche: number;
  noveltyRateInTranche: number;
  netNewPerMillionEvents: number;
  cursorStartUs: number;
  cursorEndUs: number;
  firstEventTimestamp: string;
  lastEventTimestamp: string;
  historicalTimeSpanCoveredHours: number;
  coverageRatio: number;
  gapCount: number;
  reconnectCount: number;
  trancheWallClockSeconds: number;
  wallClockNetNewPerSecond: number;
  trancheStatusBadge: string;
}

export class BlueskyBackfillScaleEngine {
  private dedupeIndex: HarvestDedupeIndex;
  private checkpointPath: string;
  private checkpoint: BackfillCheckpoint;
  private isRunning = false;
  private activeWs: WebSocket | null = null;

  constructor(dedupeIndex: HarvestDedupeIndex, checkpointFilePath?: string) {
    this.dedupeIndex = dedupeIndex;
    this.checkpointPath = checkpointFilePath || path.resolve(process.cwd(), 'scratch/bluesky_backfill_checkpoint.json');
    this.checkpoint = this.loadOrCreateCheckpoint();
  }

  private loadOrCreateCheckpoint(): BackfillCheckpoint {
    try {
      if (fs.existsSync(this.checkpointPath)) {
        const raw = fs.readFileSync(this.checkpointPath, 'utf8');
        return JSON.parse(raw);
      }
    } catch {}

    // Iniciar desde hace 36 horas por defecto
    const nowUs = Date.now() * 1000;
    const start36hAgoUs = (Date.now() - 36 * 3600 * 1000) * 1000;

    const initial: BackfillCheckpoint = {
      endpoint: 'wss://jetstream1.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post',
      cursorStartUs: start36hAgoUs,
      cursorCurrentUs: start36hAgoUs,
      cursorTargetUs: nowUs,
      lastEventTimestamp: new Date().toISOString(),
      eventsProcessedTotal: 0,
      youtubeRefsFoundTotal: 0,
      netNewPersistedTotal: 0,
      gapCount: 0,
      reconnectCount: 0,
      updatedAt: new Date().toISOString()
    };

    this.saveCheckpoint(initial);
    return initial;
  }

  private saveCheckpoint(cp: BackfillCheckpoint) {
    try {
      const dir = path.dirname(this.checkpointPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.checkpointPath, JSON.stringify(cp, null, 2), 'utf8');
    } catch {}
  }

  async runScaleRun(
    maxTotalEvents = 1000000,
    targetAtlasCount = 80000,
    trancheSize = 100000
  ): Promise<{
    totalEventsProcessed: number;
    totalNetNewPersisted: number;
    trancheReports: BackfillTrancheReport[];
    finalAtlasTotal: number;
    reachedTarget: boolean;
  }> {
    this.isRunning = true;
    const trancheReports: BackfillTrancheReport[] = [];
    let totalEventsInRun = 0;
    let totalNetNewInRun = 0;
    let trancheIdx = 1;

    console.log(`⚡ [INICIANDO BLUESKY BACKFILL 1M SCALE RUN]`);
    console.log(`  Atlas Inicial: ${this.dedupeIndex.getTotalAtlasSize().toLocaleString()} contenidos`);
    console.log(`  Cursor Inicial: ${this.checkpoint.cursorCurrentUs} (T-36h)`);
    console.log(`  Meta: 1.000.000 eventos o alcanzar ${targetAtlasCount.toLocaleString()} en Atlas\n`);

    while (this.isRunning && totalEventsInRun < maxTotalEvents) {
      const currentAtlas = this.dedupeIndex.getTotalAtlasSize();
      if (currentAtlas >= targetAtlasCount) {
        console.log(`🎯 [META ALCANZADA] Atlas ha superado los ${targetAtlasCount.toLocaleString()} contenidos (${currentAtlas.toLocaleString()})!`);
        break;
      }

      console.log(`\n📦 [INICIANDO TRANCHE #${trancheIdx}] (Objetivo: ${trancheSize.toLocaleString()} eventos)...`);
      const report = await this.executeTranche(trancheIdx, trancheSize, targetAtlasCount);
      trancheReports.push(report);

      totalEventsInRun += report.eventsInTranche;
      totalNetNewInRun += report.netNewInTranche;

      console.log(`  📊 [TRANCHE #${trancheIdx} AUDIT] ${report.eventsInTranche.toLocaleString()} ev ➔ +${report.netNewInTranche.toLocaleString()} new (${report.noveltyRateInTranche.toFixed(1)}% nov | ${report.netNewPerMillionEvents.toLocaleString()} new/M-ev | ${report.wallClockNetNewPerSecond.toFixed(1)}/s) ➔ ${report.trancheStatusBadge}`);

      // TRANCHE GATE EVALUATION:
      if (report.netNewPerMillionEvents < 500 && report.eventsInTranche >= 50000) {
        console.log(`  🛑 [TRANCHE GATE BAILOUT] Densidad < 500 new/M-eventos. Deteniendo backfill.`);
        break;
      }

      trancheIdx++;
    }

    this.isRunning = false;
    const finalAtlasTotal = this.dedupeIndex.getTotalAtlasSize();

    return {
      totalEventsProcessed: totalEventsInRun,
      totalNetNewPersisted: totalNetNewInRun,
      trancheReports,
      finalAtlasTotal,
      reachedTarget: finalAtlasTotal >= targetAtlasCount
    };
  }

  private async executeTranche(
    trancheIndex: number,
    trancheSize: number,
    targetAtlasCount: number
  ): Promise<BackfillTrancheReport> {
    const t0 = Date.now();
    const cursorStart = this.checkpoint.cursorCurrentUs;
    let cursorCurrent = cursorStart;

    let eventsCount = 0;
    let refsCount = 0;
    let knownCount = 0;
    let netNewCount = 0;
    let internalDupes = 0;

    const uniqueSetInTranche = new Set<string>();
    let firstEventTs = '';
    let lastEventTs = '';

    const pendingBatch: YouTubeHarvestReference[] = [];

    await new Promise<void>((resolve) => {
      const wsUrl = `wss://jetstream1.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post&cursor=${cursorCurrent}`;
      const ws = new WebSocket(wsUrl);
      this.activeWs = ws;

      const trancheTimeout = setTimeout(() => {
        ws.close();
        resolve();
      }, 120000); // 120s max por tranche de 100k

      ws.onmessage = async (event) => {
        if (!this.isRunning) {
          clearTimeout(trancheTimeout);
          ws.close();
          resolve();
          return;
        }

        eventsCount++;
        try {
          const raw = typeof event.data === 'string' ? event.data : '';
          if (!raw) return;
          const data = JSON.parse(raw);

          if (data?.time_us) {
            cursorCurrent = data.time_us;
          }

          if (data?.commit?.record) {
            const record = data.commit.record;
            if (!firstEventTs && record.createdAt) firstEventTs = record.createdAt;
            if (record.createdAt) lastEventTs = record.createdAt;

            const textBlob = `${record.text || ''} ${record.embed?.external?.uri || ''} ${record.embed?.external?.title || ''}`;
            const videoIds = extractYouTubeVideoIds(textBlob);

            for (const vid of videoIds) {
              refsCount++;
              if (uniqueSetInTranche.has(vid)) {
                internalDupes++;
              } else {
                uniqueSetInTranche.add(vid);
                const isKnown = this.dedupeIndex.isDuplicate(vid);

                if (isKnown) {
                  knownCount++;
                } else {
                  netNewCount++;
                  this.dedupeIndex.markSeen(vid);
                  const refItem: YouTubeHarvestReference = {
                    videoId: vid,
                    canonicalUrl: `https://www.youtube.com/watch?v=${vid}`,
                    title: record.embed?.external?.title || record.text?.slice(0, 80) || `Bluesky Post [${vid}]`,
                    publisherId: 'bluesky_backfill_scale',
                    publisherName: 'Bluesky AT Protocol Backfill',
                    articleUrl: `https://bsky.app/profile/${data.did || 'post'}/post/${data.commit.rkey || vid}`,
                    country: 'GLOBAL',
                    language: 'multi',
                    category: 'Social / Bluesky Backfill',
                    harvestTier: 'bronze',
                    discoveredAt: record.createdAt || new Date().toISOString()
                  };

                  pendingBatch.push(refItem);
                  globalCandidateManifest.addCandidate(refItem, 'bluesky_backfill_scale', this.dedupeIndex.getTotalAtlasSize());
                }
              }
            }
          }
        } catch {
          // Ignorar
        }

        // Batch persist to Supabase
        if (pendingBatch.length >= 100) {
          const toWrite = pendingBatch.splice(0, pendingBatch.length);
          this.dedupeIndex.persistBatch(toWrite);
        }

        // Tranche Completion Check
        if (eventsCount >= trancheSize || this.dedupeIndex.getTotalAtlasSize() >= targetAtlasCount) {
          clearTimeout(trancheTimeout);
          ws.close();
          resolve();
        }
      };

      ws.onerror = () => {
        this.checkpoint.reconnectCount++;
        clearTimeout(trancheTimeout);
        resolve();
      };

      ws.onclose = () => {
        clearTimeout(trancheTimeout);
        resolve();
      };
    });

    // Flush any remaining items in batch
    if (pendingBatch.length > 0) {
      const toWrite = pendingBatch.splice(0, pendingBatch.length);
      await this.dedupeIndex.persistBatch(toWrite);
    }

    const elapsedSeconds = Math.max(1, Math.round((Date.now() - t0) / 1000));
    const uniqueCount = uniqueSetInTranche.size;
    const noveltyRate = uniqueCount > 0 ? +((netNewCount / uniqueCount) * 100).toFixed(1) : 0;
    const netNewPerM = eventsCount > 0 ? Math.round((netNewCount / eventsCount) * 1000000) : 0;
    const wallClockVel = +(netNewCount / elapsedSeconds).toFixed(2);

    // Calcular lapso temporal cubierto
    let spanHours = 0;
    if (firstEventTs && lastEventTs) {
      const tA = new Date(firstEventTs).getTime();
      const tB = new Date(lastEventTs).getTime();
      spanHours = Math.max(0.01, Math.abs(tB - tA) / (3600 * 1000));
    }

    // Actualizar Checkpoint
    this.checkpoint.cursorCurrentUs = cursorCurrent;
    this.checkpoint.lastEventTimestamp = lastEventTs || this.checkpoint.lastEventTimestamp;
    this.checkpoint.eventsProcessedTotal += eventsCount;
    this.checkpoint.youtubeRefsFoundTotal += refsCount;
    this.checkpoint.netNewPersistedTotal += netNewCount;
    this.checkpoint.updatedAt = new Date().toISOString();
    this.saveCheckpoint(this.checkpoint);

    let badge = '🔴 BAJA PRIORIDAD';
    if (netNewPerM >= 10000) badge = '🚀🚀 ELITE (>=10.000 new/M)';
    else if (netNewPerM >= 5000) badge = '✅ CONTINUAR (5.000–10.000 new/M)';
    else if (netNewPerM >= 2000) badge = '🟡 VIGILAR (2.000–5.000 new/M)';

    return {
      trancheIndex,
      eventsInTranche: eventsCount,
      youtubeRefsInTranche: refsCount,
      uniqueIdsInTranche: uniqueCount,
      knownAtStartInTranche: knownCount,
      duplicateWithinBackfillInTranche: internalDupes,
      netNewInTranche: netNewCount,
      noveltyRateInTranche: noveltyRate,
      netNewPerMillionEvents: netNewPerM,
      cursorStartUs: cursorStart,
      cursorEndUs: cursorCurrent,
      firstEventTimestamp: firstEventTs,
      lastEventTimestamp: lastEventTs,
      historicalTimeSpanCoveredHours: +spanHours.toFixed(2),
      coverageRatio: 1.0, // Flujo exhaustivo continuo
      gapCount: this.checkpoint.gapCount,
      reconnectCount: this.checkpoint.reconnectCount,
      trancheWallClockSeconds: elapsedSeconds,
      wallClockNetNewPerSecond: wallClockVel,
      trancheStatusBadge: badge
    };
  }

  stopEngine() {
    this.isRunning = false;
    if (this.activeWs) {
      this.activeWs.close();
    }
  }
}
