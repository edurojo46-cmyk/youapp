/**
 * ATLAS — CANONICAL SOURCE DEDUPER
 * Canonicalizes URLs/domains and filters out already explored, exhausted, or saturated sources.
 */

import pg from 'pg';
import type { CandidateSource } from './types.ts';

export class CanonicalSourceDeduper {
  private knownSourceIds: Set<string> = new Set();
  private knownCanonicalUrls: Set<string> = new Set();
  private exhaustedHosts: Set<string> = new Set();

  /**
   * Initializes dedupe filter from PostgreSQL SSOT
   */
  public async loadFromSsot(pool: pg.Pool): Promise<{ totalKnown: number; totalExhausted: number }> {
    const client = await pool.connect();
    try {
      const res = await client.query(`
        SELECT source_id, canonical_url, current_status 
        FROM public.atlas_source_knowledge_map;
      `);

      for (const row of res.rows) {
        if (row.source_id) this.knownSourceIds.add(row.source_id.toLowerCase().trim());
        if (row.canonical_url) {
          const normUrl = this.canonicalizeUrl(row.canonical_url);
          this.knownCanonicalUrls.add(normUrl);
          if (row.current_status === 'EXHAUSTED' || row.current_status === 'DORMANT') {
            try {
              const u = new URL(normUrl);
              this.exhaustedHosts.add(u.hostname.toLowerCase());
            } catch (e) {}
          }
        }
      }

      return {
        totalKnown: this.knownSourceIds.size,
        totalExhausted: this.exhaustedHosts.size
      };
    } finally {
      client.release();
    }
  }

  /**
   * Normalizes URL for canonical identity comparison
   */
  public canonicalizeUrl(rawUrl: string): string {
    try {
      const u = new URL(rawUrl.trim());
      let path = u.pathname.replace(/\/+$/, '');
      if (!path) path = '/';
      return `${u.protocol}//${u.hostname.toLowerCase()}${path}${u.search}`;
    } catch (e) {
      return rawUrl.trim().toLowerCase();
    }
  }

  /**
   * Filters a candidate stream, discarding duplicates and known dead endpoints
   */
  public filterCandidates(candidates: CandidateSource[]): {
    dedupedCandidates: CandidateSource[];
    discardedCount: number;
  } {
    const deduped: CandidateSource[] = [];
    const seenInBatch = new Set<string>();
    let discarded = 0;

    for (const c of candidates) {
      if (c.isControl) {
        deduped.push(c);
        continue;
      }

      const normUrl = this.canonicalizeUrl(c.url);
      const normId = c.candidateId.toLowerCase().trim();

      // Check if already known in SSOT
      if (this.knownSourceIds.has(normId) || this.knownCanonicalUrls.has(normUrl)) {
        discarded++;
        continue;
      }

      // Check if already seen in current batch
      if (seenInBatch.has(normUrl)) {
        discarded++;
        continue;
      }

      seenInBatch.add(normUrl);
      deduped.push(c);
    }

    return {
      dedupedCandidates: deduped,
      discardedCount: discarded
    };
  }
}
