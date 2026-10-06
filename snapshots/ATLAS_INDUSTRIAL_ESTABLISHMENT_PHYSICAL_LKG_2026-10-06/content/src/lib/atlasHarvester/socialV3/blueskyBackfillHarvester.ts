/**
 * blueskyBackfillHarvester.ts — Harvester de Backfill Histórico con Jetstream Cursor Replay y Novelty Decay
 */

import { extractYouTubeVideoIds } from '../youtubeReferenceExtractor';
import type { YouTubeHarvestReference } from '../types';

export interface BackfillWindowResult {
  windowLabel: string;
  hoursAgoStart: number;
  hoursAgoEnd: number;
  hoursSpan: number;
  eventsScanned: number;
  youtubeRefsFound: number;
  uniqueYouTubeIds: number;
  knownAtlas: number;
  netNew: number;
  noveltyRate: number;
  netNewPerHourOfHistory: number;
  netNewPerMillionEvents: number;
}

export class BlueskyBackfillHarvester {
  private isRunning = false;
  private activeWs: WebSocket | null = null;

  async runDeepProbe(
    windows: Array<{ label: string; hoursAgoStart: number; hoursAgoEnd: number }>,
    isDuplicateCheck: (videoId: string) => boolean,
    onReferencesFound?: (refs: YouTubeHarvestReference[]) => void
  ): Promise<BackfillWindowResult[]> {
    this.isRunning = true;
    const results: BackfillWindowResult[] = [];

    for (const w of windows) {
      if (!this.isRunning) break;

      const cursorUs = (Date.now() - w.hoursAgoStart * 3600 * 1000) * 1000;
      const targetEndUs = (Date.now() - w.hoursAgoEnd * 3600 * 1000) * 1000;
      const wsUrl = `wss://jetstream1.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post&cursor=${cursorUs}`;

      let eventsInWindow = 0;
      let refsInWindow = 0;
      const uniqueIdsInWindow = new Set<string>();
      let knownCount = 0;
      let netNewCount = 0;
      const windowBatch: YouTubeHarvestReference[] = [];

      await new Promise<void>((resolve) => {
        const ws = new WebSocket(wsUrl);
        this.activeWs = ws;

        const timeout = setTimeout(() => {
          ws.close();
          resolve();
        }, 15000); // 15s max por ventana de sondeo

        ws.onmessage = (event) => {
          if (!this.isRunning) {
            clearTimeout(timeout);
            ws.close();
            resolve();
            return;
          }

          eventsInWindow++;
          try {
            const raw = typeof event.data === 'string' ? event.data : '';
            if (!raw) return;
            const data = JSON.parse(raw);

            // Verificar si superamos la ventana de corte
            if (data?.time_us && data.time_us > targetEndUs) {
              clearTimeout(timeout);
              ws.close();
              resolve();
              return;
            }

            if (data?.commit?.record) {
              const record = data.commit.record;
              const textBlob = `${record.text || ''} ${record.embed?.external?.uri || ''} ${record.embed?.external?.title || ''}`;
              const videoIds = extractYouTubeVideoIds(textBlob);

              for (const vid of videoIds) {
                refsInWindow++;
                if (!uniqueIdsInWindow.has(vid)) {
                  uniqueIdsInWindow.add(vid);
                  const isKnown = isDuplicateCheck(vid);

                  if (isKnown) {
                    knownCount++;
                  } else {
                    netNewCount++;
                    const refItem: YouTubeHarvestReference = {
                      videoId: vid,
                      canonicalUrl: `https://www.youtube.com/watch?v=${vid}`,
                      title: record.embed?.external?.title || record.text?.slice(0, 80) || `Bluesky Backfill [${vid}]`,
                      publisherId: 'bluesky_backfill_discovery',
                      publisherName: 'Bluesky AT Protocol Backfill',
                      articleUrl: `https://bsky.app/profile/${data.did || 'post'}/post/${data.commit.rkey || vid}`,
                      country: 'GLOBAL',
                      language: 'multi',
                      category: 'Social / Bluesky Backfill',
                      harvestTier: 'bronze',
                      discoveredAt: record.createdAt || new Date().toISOString()
                    };
                    windowBatch.push(refItem);
                  }
                }
              }
            }
          } catch {
            // Ignorar
          }

          // Límite por ventana para el Deep Probe (ej. 15.000 posts analizados por ventana)
          if (eventsInWindow >= 15000) {
            clearTimeout(timeout);
            ws.close();
            resolve();
          }
        };

        ws.onerror = () => {
          clearTimeout(timeout);
          resolve();
        };

        ws.onclose = () => {
          clearTimeout(timeout);
          resolve();
        };
      });

      const hoursSpan = Math.max(1, w.hoursAgoStart - w.hoursAgoEnd);
      const uniqueCount = uniqueIdsInWindow.size;
      const noveltyRate = uniqueCount > 0 ? +((netNewCount / uniqueCount) * 100).toFixed(1) : 0;
      const netNewPerHour = +(netNewCount / hoursSpan).toFixed(1);
      const netNewPerM = eventsInWindow > 0 ? Math.round((netNewCount / eventsInWindow) * 1000000) : 0;

      results.push({
        windowLabel: w.label,
        hoursAgoStart: w.hoursAgoStart,
        hoursAgoEnd: w.hoursAgoEnd,
        hoursSpan,
        eventsScanned: eventsInWindow,
        youtubeRefsFound: refsInWindow,
        uniqueYouTubeIds: uniqueCount,
        knownAtlas: knownCount,
        netNew: netNewCount,
        noveltyRate,
        netNewPerHourOfHistory: netNewPerHour,
        netNewPerMillionEvents: netNewPerM
      });

      if (onReferencesFound && windowBatch.length > 0) {
        onReferencesFound(windowBatch);
      }
    }

    return results;
  }

  stopBackfill(): void {
    this.isRunning = false;
    if (this.activeWs) {
      this.activeWs.close();
    }
  }
}
