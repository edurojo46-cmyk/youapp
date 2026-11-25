/**
 * src/lib/atlasRadar/atlasDiscoveryFrontier.ts
 * 
 * Persistent Atlas Discovery Frontier.
 * Tracks next page, cursor, offset, resumption token, date partition, and exhaustion state per source.
 * Survives process restarts, shadow table truncations, and benchmark resets.
 */

import fs from 'fs';
import path from 'path';
import type { DiscoveryFrontierState } from './millionRadarTypes.ts';

const DEFAULT_FRONTIER_PATH = path.resolve('scratch/atlas_discovery_frontier.json');

export class AtlasDiscoveryFrontier {
  private frontierMap: Map<string, DiscoveryFrontierState>;
  private filePath: string;

  constructor(filePath: string = DEFAULT_FRONTIER_PATH) {
    this.filePath = filePath;
    this.frontierMap = new Map();
    this.load();
  }

  private load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const data: DiscoveryFrontierState[] = JSON.parse(raw);
        for (const item of data) {
          this.frontierMap.set(item.sourceId, item);
        }
      }
    } catch (err) {
      console.warn(`[FRONTIER WARN] Failed to load frontier from ${this.filePath}:`, err);
    }
  }

  save() {
    try {
      const data = Array.from(this.frontierMap.values());
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.error(`[FRONTIER ERROR] Failed to save frontier to ${this.filePath}:`, err);
    }
  }

  getState(sourceId: string): DiscoveryFrontierState {
    let state = this.frontierMap.get(sourceId);
    if (!state) {
      state = {
        sourceId,
        nextPage: 1,
        nextOffset: 0,
        nextCursor: undefined,
        resumptionToken: null,
        isExhausted: false
      };
      this.frontierMap.set(sourceId, state);
    }
    return state;
  }

  updateCursor(sourceId: string, cursor: string | null) {
    const s = this.getState(sourceId);
    s.nextCursor = cursor || undefined;
    s.lastSuccessfulFetchAt = new Date().toISOString();
    this.save();
  }

  updateResumptionToken(sourceId: string, token: string | null) {
    const s = this.getState(sourceId);
    s.resumptionToken = token;
    s.lastSuccessfulFetchAt = new Date().toISOString();
    if (!token) {
      // Reached the end of resumption tokens
      s.isExhausted = true;
    }
    this.save();
  }

  advanceOffset(sourceId: string, delta: number) {
    const s = this.getState(sourceId);
    s.nextOffset = (s.nextOffset || 0) + delta;
    s.lastSuccessfulFetchAt = new Date().toISOString();
    this.save();
  }

  markExhausted(sourceId: string) {
    const s = this.getState(sourceId);
    s.isExhausted = true;
    s.lastSuccessfulFetchAt = new Date().toISOString();
    this.save();
  }

  isSourceExhausted(sourceId: string): boolean {
    const s = this.frontierMap.get(sourceId);
    return s?.isExhausted === true;
  }

  getAllStates(): DiscoveryFrontierState[] {
    return Array.from(this.frontierMap.values());
  }
}
