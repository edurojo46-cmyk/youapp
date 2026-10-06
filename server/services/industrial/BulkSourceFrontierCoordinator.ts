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

  constructor(dbPool: pg.Pool) {
    this.dbPool = dbPool;
    this.authorityGate = new CurrentAtlasEmailAuthorityGate(dbPool);
    this.t0Authority = new PreexistingEmailAuthority();
  }

  /**
   * Authoritative list of pre-configured physical bulk sources
   */
  public static getPreconfiguredFrontier(): ScalableEmailSource[] {
    return [
      {
        source_id: 'SRC_SIPRO_NACION_LEGACY',
        source_family: 'PUBLIC_PROCUREMENT_REGISTRY',
        source_name: 'Sistema de Información de Proveedores del Estado Nacional (SIPRO Legacy)',
        url: 'https://infra.datos.gob.ar/catalog/modernizacion/dataset/2/distribution/2.12/download/proveedores-sistema-legacy.csv',
        local_path: path.resolve('scratch/physical_sources/proveedores_sistema_legacy.csv'),
        format: 'LOCAL_FILE',
        jurisdiction: 'ARGENTINA / NACIONAL',
        estimated_supply: 55000
      },
      {
        source_id: 'SRC_GCBA_ADMINISTRADORES',
        source_family: 'MUNICIPAL_PROFESSIONAL_REGISTRY',
        source_name: 'Registro Público de Administradores de Consorcios (CABA)',
        url: 'https://cdn.buenosaires.gob.ar/datosabiertos/datasets/defensa-al-consumidor/administradores-consorcio/administradores-consorcio.csv',
        local_path: path.resolve('scratch/physical_sources/gcba_administradores_consorcio.csv'),
        format: 'LOCAL_FILE',
        jurisdiction: 'ARGENTINA / CABA',
        estimated_supply: 8500
      },
      {
        source_id: 'SRC_GCBA_AUTORIDADES_2026',
        source_family: 'PUBLIC_ADMINISTRATION_DIRECTORY',
        source_name: 'Estructura y Autoridades del Gobierno de la Ciudad (2026)',
        url: 'https://cdn.buenosaires.gob.ar/datosabiertos/datasets/secretaria-general/estructura-gobierno/estructura-gobierno-2026.csv',
        local_path: path.resolve('scratch/physical_sources/gcba_autoridades_2026.csv'),
        format: 'LOCAL_FILE',
        jurisdiction: 'ARGENTINA / CABA',
        estimated_supply: 2200
      },
      {
        source_id: 'SRC_GCBA_AUTORIDADES_2025',
        source_family: 'PUBLIC_ADMINISTRATION_DIRECTORY',
        source_name: 'Estructura y Autoridades del Gobierno de la Ciudad (2025)',
        url: 'https://cdn.buenosaires.gob.ar/datosabiertos/datasets/secretaria-general/estructura-gobierno/estructura-gobierno-2025.csv',
        local_path: path.resolve('scratch/physical_sources/gcba_autoridades_2025.csv'),
        format: 'LOCAL_FILE',
        jurisdiction: 'ARGENTINA / CABA',
        estimated_supply: 2500
      },
      {
        source_id: 'SRC_GCBA_AUTORIDADES_2024',
        source_family: 'PUBLIC_ADMINISTRATION_DIRECTORY',
        source_name: 'Estructura y Autoridades del Gobierno de la Ciudad (2024)',
        url: 'https://cdn.buenosaires.gob.ar/datosabiertos/datasets/secretaria-general/estructura-gobierno/estructura-gobierno-2024.csv',
        local_path: path.resolve('scratch/physical_sources/gcba_autoridades_2024.csv'),
        format: 'LOCAL_FILE',
        jurisdiction: 'ARGENTINA / CABA',
        estimated_supply: 2100
      },
      {
        source_id: 'SRC_PROVEEDORES_MODERNIZACION',
        source_family: 'PUBLIC_PROCUREMENT_REGISTRY',
        source_name: 'Directorio de Proveedores de Modernización de la Nación',
        url: 'https://infra.datos.gob.ar/catalog/modernizacion/dataset/2/distribution/2.1/download/proveedores-modernizacion.csv',
        local_path: path.resolve('scratch/physical_sources/proveedores_modernizacion.csv'),
        format: 'LOCAL_FILE',
        jurisdiction: 'ARGENTINA / NACIONAL',
        estimated_supply: 5000
      },
      {
        source_id: 'SRC_SSN_PRODUCTORES_SEGUROS',
        source_family: 'PROFESSIONAL_LICENSING_REGISTRY',
        source_name: 'Registro de Productores y Asesores de Seguros de la Nación (SSN)',
        url: 'https://datosabiertos.ssn.gob.ar/dataset/productores-asesores',
        local_path: path.resolve('scratch/physical_sources/productores_asesores_ssn.csv'),
        format: 'LOCAL_FILE',
        jurisdiction: 'ARGENTINA / NACIONAL',
        estimated_supply: 35000
      },
      {
        source_id: 'SRC_SSS_PROFESIONALES_SALUD',
        source_family: 'HEALTH_PROFESSIONALS_REGISTRY',
        source_name: 'Registro Nacional de Prestadores de la Salud (SSSalud)',
        url: 'https://datos.gob.ar/dataset/salud-registro-prestadores',
        local_path: path.resolve('scratch/physical_sources/registro_profesionales_sss.csv'),
        format: 'LOCAL_FILE',
        jurisdiction: 'ARGENTINA / NACIONAL',
        estimated_supply: 45000
      },
      {
        source_id: 'SRC_AUDIENCIAS_PUBLICAS_PEN',
        source_family: 'PUBLIC_ADMINISTRATION_DIRECTORY',
        source_name: 'Registro Único de Audiencias Públicas del Poder Ejecutivo Nacional',
        url: 'https://datos.gob.ar/dataset/justicia-audiencias',
        local_path: path.resolve('scratch/physical_sources/audiencias_2024.csv'),
        format: 'LOCAL_FILE',
        jurisdiction: 'ARGENTINA / NACIONAL',
        estimated_supply: 1000
      }
    ];
  }

  /**
   * Executes bounded source continuation until target true-net-new is reached
   * or all available frontier sources are exhausted with proof.
   */
  public async executeContinuation(options: {
    target: number;
    sources?: ScalableEmailSource[];
    maxSourcesToExecute?: number;
    missionId?: string;
  }): Promise<FrontierCoordinationResult> {
    const target = options.target;
    const frontier = options.sources || BulkSourceFrontierCoordinator.getPreconfiguredFrontier();
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
