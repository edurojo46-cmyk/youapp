/**
 * ATLAS — BULK SOURCE FRONTIER COORDINATOR
 * @server/services/industrial/BulkSourceFrontierCoordinator.ts
 *
 * Coordinates multi-source bounded acquisition OUTSIDE the frozen Tesla Wheel engine.
 *
 * ARCHITECTURAL PRINCIPLE:
 * - Tesla Wheel (IndustrialEmailTeslaWheel.harvestStream) is a FROZEN processing primitive.
 * - Source frontier selection and continuation logic lives strictly in this external coordinator.
 * - Mission target means: TARGET TRUE NET-NEW TO CURRENT ATLAS (not historical T0).
 * - If Source A yields candidates that already exist in Atlas DB, the coordinator advances
 *   to Source B until:
 *   1. TRUE_NET_NEW_TO_ATLAS >= target (TARGET_REACHED)
 *   2. Frontier exhausted with proof (all candidate sources depleted)
 *   3. Bounded row / time budget reached.
 *
 * CONSTITUTIONAL INVARIANTS:
 * - DO NOT modify src/lib/atlasIndustrialEmail/
 * - NO raw emails logged.
 * - NO category-specific logic.
 */

import path from 'path';
import fs from 'fs';
import type pg from 'pg';
import {
  IndustrialEmailTeslaWheel,
  type ScalableEmailSource
} from '../../../src/lib/atlasIndustrialEmail/IndustrialEmailTeslaWheel.ts';
import { PreexistingEmailAuthority } from '../../../src/lib/atlasIndustrialEmail/PreexistingEmailAuthority.ts';
import type { PublicEmailContact } from '../../../src/lib/atlasIndustrialEmail/types.ts';
import { CurrentAtlasEmailAuthorityGate } from './CurrentAtlasEmailAuthorityGate.ts';
import { BulkSourceKnowledgeAdapter } from './BulkSourceKnowledgeAdapter.ts';

export interface SourceExecutionResult {
  source_id: string;
  source_family: string;
  source_name: string;
  engine_rows_scanned: number;
  engine_extracted: number;
  engine_valid: number;
  engine_new_to_t0: number;
  engine_duplicates: number;
  atlas_duplicates: number;
  true_net_new_to_atlas: number;
  status: 'EXHAUSTED' | 'TARGET_MET' | 'FAILED';
}

export interface FrontierCoordinationResult {
  target: number;
  sources_executed: number;
  sources_available: number;
  total_public_observed: number;
  total_engine_new_to_t0: number;
  total_atlas_duplicates: number;
  total_true_net_new_to_atlas: number;
  total_ledger_persisted: number;
  total_canonically_persisted: number;
  total_authority_persisted: number;
  target_reached: boolean;
  terminal_reason: 'TARGET_REACHED' | 'SOURCE_FRONTIER_EXHAUSTED_WITH_PROOF' | 'BUDGET_LIMIT_REACHED' | 'TECHNICAL_FAILURE';
  source_results: SourceExecutionResult[];
}

export class BulkSourceFrontierCoordinator {
  private dbPool: pg.Pool;
  private authorityGate: CurrentAtlasEmailAuthorityGate;
  private t0Authority: PreexistingEmailAuthority;
  private kmAdapter: BulkSourceKnowledgeAdapter;

  constructor(dbPool: pg.Pool) {
    this.dbPool = dbPool;
    this.authorityGate = new CurrentAtlasEmailAuthorityGate(dbPool);
    this.t0Authority = new PreexistingEmailAuthority();
    this.kmAdapter = new BulkSourceKnowledgeAdapter(dbPool);
  }

  /**
   * Retrieves the eligible physical bulk frontier dynamically from public.atlas_source_knowledge_map (SSOT).
   * ZERO hardcoded source definitions remain.
   */
  public async getEligibleFrontier(): Promise<ScalableEmailSource[]> {
    return this.kmAdapter.getEligibleBulkFrontier();
  }

  /**
   * Audits registered bulk sources in Source KM and their physical readiness.
   */
  public async auditFrontierStatus() {
    return this.kmAdapter.auditRegisteredBulkSources();
  }

  /**
   * Executes bounded source continuation until target true-net-new is reached
   * or all available frontier sources from Source KM are exhausted with proof.
   */
  public async executeContinuation(options: {
    target: number;
    sources?: ScalableEmailSource[];
    maxSourcesToExecute?: number;
    missionId?: string;
  }): Promise<FrontierCoordinationResult> {
    const target = options.target;
    const frontier = options.sources || (await this.kmAdapter.getEligibleBulkFrontier());
    const maxSources = options.maxSourcesToExecute || frontier.length;

    await this.t0Authority.loadOrInitializeT0();

    const sessionEmailsSet = new Set<string>();
    const ledgerPath = path.resolve('reports/atlas/acquisition/atlas_public_emails_1m_ledger.jsonl');
    fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });

    let totalTrueNetNew = 0;
    let totalPublicObserved = 0;
    let totalEngineNewToT0 = 0;
    let totalAtlasDuplicates = 0;
    let totalLedgerPersisted = 0;
    let totalCanonicallyPersisted = 0;
    let totalAuthorityPersisted = 0;

    const sourceResults: SourceExecutionResult[] = [];

    const sourcesToRun = frontier.slice(0, maxSources);

    for (let i = 0; i < sourcesToRun.length; i++) {
      if (totalTrueNetNew >= target) {
        break;
      }

      const src = sourcesToRun[i];
      let sourceTrueNetNew = 0;
      let sourceAtlasDuplicates = 0;
      let sourceEngineNewToT0 = 0;
      let sourceLedgerPersisted = 0;

      try {
        const streamResult = await IndustrialEmailTeslaWheel.harvestStream(
          src,
          this.t0Authority,
          sessionEmailsSet,
          async (batch: PublicEmailContact[]) => {
            sourceEngineNewToT0 += batch.length;
            totalEngineNewToT0 += batch.length;

            // 1. Write batch to ledger
            for (const item of batch) {
              fs.appendFileSync(ledgerPath, JSON.stringify(item) + '\n', 'utf8');
              sourceLedgerPersisted++;
              totalLedgerPersisted++;
            }

            // 2. Evaluate batch against CURRENT Atlas Authority Gate
            const candidateList = batch.map(b => ({
              email_normalized: b.email_normalized,
              email_hash: b.email_hash
            }));

            const gateResult = await this.authorityGate.evaluateCandidates(candidateList);

            sourceAtlasDuplicates += gateResult.already_in_atlas;
            totalAtlasDuplicates += gateResult.already_in_atlas;

            if (gateResult.true_net_new_to_atlas > 0) {
              const trueNetNewEmails = new Set(gateResult.novel_candidates.map(c => c.email_normalized));
              const trueNetNewBatch = batch.filter(b => trueNetNewEmails.has(b.email_normalized));

              // 3. Insert true net-new into DB tables
              const dbClient = await this.dbPool.connect();
              try {
                // Canonical insertion
                const unnestSql = `
                  INSERT INTO public.atlas_public_email_contacts_1m
                    (email_normalized, email_hash, contact_type, associated_entity, entity_type, argentina_relation, argentina_relation_type, source_id, source_family, source_url, public_context, evidence, provenance, discovered_at, verified_at, mission_qualification_status)
                  SELECT * FROM UNNEST(
                    $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::boolean[], $7::text[], $8::text[], $9::text[], $10::text[], $11::text[], $12::text[], $13::jsonb[], $14::timestamptz[], $15::timestamptz[], $16::text[]
                  )
                  ON CONFLICT (email_normalized) DO NOTHING
                  RETURNING email_normalized;
                `;
                const insertRes = await dbClient.query(unnestSql, [
                  trueNetNewBatch.map(b => b.email_normalized),
                  trueNetNewBatch.map(b => b.email_hash),
                  trueNetNewBatch.map(b => b.contact_type),
                  trueNetNewBatch.map(b => b.associated_entity),
                  trueNetNewBatch.map(b => b.entity_type),
                  trueNetNewBatch.map(b => b.argentina_relation),
                  trueNetNewBatch.map(b => b.argentina_relation_type),
                  trueNetNewBatch.map(b => b.source_id),
                  trueNetNewBatch.map(b => b.source_family),
                  trueNetNewBatch.map(b => b.source_url),
                  trueNetNewBatch.map(b => b.public_context),
                  trueNetNewBatch.map(b => b.evidence),
                  trueNetNewBatch.map(b => JSON.stringify(b.provenance)),
                  trueNetNewBatch.map(b => b.discovered_at),
                  trueNetNewBatch.map(b => b.verified_at),
                  trueNetNewBatch.map(b => b.mission_qualification_status)
                ]);

                const canonicalCount = insertRes.rowCount || 0;
                totalCanonicallyPersisted += canonicalCount;

                // Sync to global authority
                const authSync = await this.authorityGate.syncNovelToAuthority(gateResult.novel_candidates);
                totalAuthorityPersisted += authSync.authority_inserted;

                sourceTrueNetNew += canonicalCount;
                totalTrueNetNew += canonicalCount;
              } finally {
                dbClient.release();
              }
            }
          },
          {
            targetRemaining: Math.max(1, target - totalTrueNetNew),
            batchSize: 1000
          }
        );

        const observed = streamResult.extractedCount;
        totalPublicObserved += observed;

        const engineDups = streamResult.duplicatesRejected + streamResult.alreadyExistedRejected;
        sourceAtlasDuplicates += engineDups;
        totalAtlasDuplicates += engineDups;

        sourceResults.push({
          source_id: src.source_id,
          source_family: src.source_family,
          source_name: src.source_name,
          engine_rows_scanned: streamResult.rowsScanned,
          engine_extracted: streamResult.extractedCount,
          engine_valid: streamResult.validCount,
          engine_new_to_t0: sourceEngineNewToT0,
          engine_duplicates: engineDups,
          atlas_duplicates: sourceAtlasDuplicates,
          true_net_new_to_atlas: sourceTrueNetNew,
          status: totalTrueNetNew >= target ? 'TARGET_MET' : 'EXHAUSTED'
        });
      } catch (err: any) {
        sourceResults.push({
          source_id: src.source_id,
          source_family: src.source_family,
          source_name: src.source_name,
          engine_rows_scanned: 0,
          engine_extracted: 0,
          engine_valid: 0,
          engine_new_to_t0: 0,
          engine_duplicates: 0,
          atlas_duplicates: 0,
          true_net_new_to_atlas: 0,
          status: 'FAILED'
        });
      }
    }

    const targetReached = totalTrueNetNew >= target;
    const isBudgetLimited = !targetReached && sourcesToRun.length < frontier.length;
    const allExhausted = !targetReached && sourcesToRun.length === frontier.length && sourcesToRun.every(s => {
      const r = sourceResults.find(res => res.source_id === s.source_id);
      return r && (r.status === 'EXHAUSTED' || r.status === 'TARGET_MET');
    });

    const terminalReason: 'TARGET_REACHED' | 'SOURCE_FRONTIER_EXHAUSTED_WITH_PROOF' | 'BUDGET_LIMIT_REACHED' | 'TECHNICAL_FAILURE' =
      targetReached
        ? 'TARGET_REACHED'
        : isBudgetLimited
          ? 'BUDGET_LIMIT_REACHED'
          : allExhausted
            ? 'SOURCE_FRONTIER_EXHAUSTED_WITH_PROOF'
            : 'TECHNICAL_FAILURE';

    return {
      target,
      sources_executed: sourceResults.length,
      sources_available: frontier.length,
      total_public_observed: totalPublicObserved,
      total_engine_new_to_t0: totalEngineNewToT0,
      total_atlas_duplicates: totalAtlasDuplicates,
      total_true_net_new_to_atlas: totalTrueNetNew,
      total_ledger_persisted: totalLedgerPersisted,
      total_canonically_persisted: totalCanonicallyPersisted,
      total_authority_persisted: totalAuthorityPersisted,
      target_reached: targetReached,
      terminal_reason: terminalReason,
      source_results: sourceResults
    };
  }
}
