/**
 * ATLAS CURRENT EMAIL AUTHORITY GATE
 * @server/services/industrial/CurrentAtlasEmailAuthorityGate.ts
 *
 * External gate validating engine candidate outputs against CURRENT Atlas Authority.
 *
 * STRICT INVARIANTS:
 * - OUTSIDE the frozen Tesla Wheel engine.
 * - Does not touch or overwrite scratch/global_preexisting_public_email_authority.bin.
 * - Evaluates candidates against active PostgreSQL authority (atlas_global_email_authority).
 * - Distinguishes NEW_TO_HISTORICAL_T0 vs TRUE_NET_NEW_TO_ATLAS.
 * - ZERO email values logged (hashes and aggregate counts only).
 */

import type pg from 'pg';

export interface AuthorityEvaluationResult {
  total_evaluated: number;
  already_in_atlas: number;
  true_net_new_to_atlas: number;
  net_new_hashes: string[];
  duplicate_hashes: string[];
}

export class CurrentAtlasEmailAuthorityGate {
  private dbPool: pg.Pool;

  constructor(dbPool: pg.Pool) {
    this.dbPool = dbPool;
  }

  /**
   * Verifies candidate email hashes/normalized strings against CURRENT Atlas Authority.
   */
  public async evaluateCandidates(
    candidates: Array<{ email_normalized: string; email_hash: string }>
  ): Promise<AuthorityEvaluationResult> {
    if (!candidates || candidates.length === 0) {
      return {
        total_evaluated: 0,
        already_in_atlas: 0,
        true_net_new_to_atlas: 0,
        net_new_hashes: [],
        duplicate_hashes: []
      };
    }

    const normEmails = candidates.map(c => c.email_normalized.toLowerCase().trim());
    const hashByNorm = new Map<string, string>();
    for (const c of candidates) {
      hashByNorm.set(c.email_normalized.toLowerCase().trim(), c.email_hash);
    }

    // Query both atlas_global_email_authority and atlas_public_email_contacts_1m
    const res = await this.dbPool.query(`
      SELECT DISTINCT email_normalized
      FROM (
        SELECT email_normalized FROM public.atlas_global_email_authority
        WHERE email_normalized = ANY($1::text[])
        UNION
        SELECT email_normalized FROM public.atlas_public_email_contacts_1m
        WHERE email_normalized = ANY($1::text[])
      ) combined;
    `, [normEmails]);

    const existingSet = new Set<string>(res.rows.map((r: any) => r.email_normalized.toLowerCase().trim()));

    const netNewHashes: string[] = [];
    const duplicateHashes: string[] = [];

    for (const norm of normEmails) {
      const hash = hashByNorm.get(norm) || 'UNKNOWN_HASH';
      if (existingSet.has(norm)) {
        duplicateHashes.push(hash);
      } else {
        netNewHashes.push(hash);
      }
    }

    return {
      total_evaluated: candidates.length,
      already_in_atlas: duplicateHashes.length,
      true_net_new_to_atlas: netNewHashes.length,
      net_new_hashes: netNewHashes,
      duplicate_hashes: duplicateHashes
    };
  }

  /**
   * Returns current authority count from SSOT.
   */
  public async getAuthorityCount(): Promise<number> {
    const res = await this.dbPool.query(`SELECT count(*) as total FROM public.atlas_global_email_authority;`);
    return parseInt(res.rows[0]?.total || '0', 10);
  }
}
