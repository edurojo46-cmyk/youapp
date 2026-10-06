import fs from 'fs';
import path from 'path';
import readline from 'readline';
import crypto from 'crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import { PreexistingEmailAuthority } from '../src/lib/atlasIndustrialEmail/PreexistingEmailAuthority.ts';
import { EMAIL_EXTRACTION_REGEX, EmailNormalizerAndClassifier } from '../src/lib/atlasIndustrialEmail/EmailNormalizerAndClassifier.ts';

dotenv.config();

async function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('   ATLAS — GLOBAL T0 AUTHORITY + FRONTIER INTEGRITY AUDIT        ');
  console.log('════════════════════════════════════════════════════════════════\n');

  // =========================================================================
  // OBJETIVO 1 — RECONSTRUIR AUTORIDAD GLOBAL T0
  // =========================================================================
  const globalAuthoritySet = new Set();
  const historicalAuthoritySet = new Set();

  // A. Load historical authority binary / json
  const auth = new PreexistingEmailAuthority();
  await auth.loadOrInitializeT0();
  
  // Also load from jsonl ledger to get the actual email strings if available
  const ledgerPath = path.resolve('reports/atlas/acquisition/atlas_public_emails_1m_ledger.jsonl');
  if (fs.existsSync(ledgerPath)) {
    const rl = readline.createInterface({ input: fs.createReadStream(ledgerPath), crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const doc = JSON.parse(line);
        const em = doc.NORMALIZED_EMAIL || doc.email_normalized || doc.email;
        if (em) {
          const norm = EmailNormalizerAndClassifier.normalizeEmail(em);
          if (norm) {
            historicalAuthoritySet.add(norm);
            globalAuthoritySet.add(norm);
          }
        }
      } catch {}
    }
  }

  // Also check v2 & v3 ledgers
  const otherLedgers = [
    'reports/atlas/acquisition/atlas_public_emails_v3_ledger.jsonl',
    'reports/atlas/acquisition/atlas_public_emails_v2_ledger.jsonl'
  ];
  for (const lp of otherLedgers) {
    if (fs.existsSync(lp)) {
      const rl = readline.createInterface({ input: fs.createReadStream(lp), crlfDelay: Infinity });
      for await (const line of rl) {
        if (!line.trim()) continue;
        try {
          const doc = JSON.parse(line);
          const em = doc.NORMALIZED_EMAIL || doc.email_normalized || doc.email;
          if (em) {
            const norm = EmailNormalizerAndClassifier.normalizeEmail(em);
            if (norm) {
              historicalAuthoritySet.add(norm);
              globalAuthoritySet.add(norm);
            }
          }
        } catch {}
      }
    }
  }

  console.log(`Historical Authority Loaded: ${historicalAuthoritySet.size.toLocaleString()} unique emails.`);

  // B. Load PostgreSQL database before the last run (i.e. T0 baseline of 9,705)
  // Let's inspect PostgreSQL current rows and identify what was added in the last run vs what was there before
  const pool = new pg.Pool(parseDbUrl());
  const res = await pool.query('SELECT email_normalized, source_id, discovered_at FROM public.atlas_public_email_contacts_1m;');
  const postgresCurrentRows = res.rows;
  console.log(`PostgreSQL Current Rows: ${postgresCurrentRows.length.toLocaleString()}`);

  // Build the pre-run PostgreSQL set (the 9,705 emails that were in DB before the last run)
  // In the last run, 47,310 rows were added.
  // Let's identify the 9,705 original emails:
  // Before the run, the sources were GCBA_ADMINISTRADORES, BA_DATOS_..., etc., discovered earlier.
  // Actually, we can add all postgres emails to the global authority set!
  for (const r of postgresCurrentRows) {
    globalAuthoritySet.add(r.email_normalized);
  }

  console.log(`GLOBAL_UNION_COUNT = ${globalAuthoritySet.size.toLocaleString()}`);

  // Compute GLOBAL_AUTHORITY_HASH
  const sortedEmails = Array.from(globalAuthoritySet).sort();
  const sha = crypto.createHash('sha256');
  for (const em of sortedEmails) {
    sha.update(em + '\n');
  }
  const globalAuthorityHash = sha.digest('hex');
  console.log(`GLOBAL_AUTHORITY_HASH = ${globalAuthorityHash}\n`);

  // =========================================================================
  // AUDIT SPECIFIC: SRC_PROVEEDORES_SISTEMA_LEGACY
  // =========================================================================
  const legacyCsv = path.resolve('scratch/physical_sources/proveedores_sistema_legacy.csv');
  const uniqueLegacyEmails = new Set();
  if (fs.existsSync(legacyCsv)) {
    const rl = readline.createInterface({ input: fs.createReadStream(legacyCsv, { encoding: 'latin1' }), crlfDelay: Infinity });
    for await (const line of rl) {
      const matches = line.match(EMAIL_EXTRACTION_REGEX);
      if (matches) {
        for (const raw of matches) {
          const norm = EmailNormalizerAndClassifier.normalizeEmail(raw);
          if (norm) uniqueLegacyEmails.add(norm);
        }
      }
    }
  }

  let legacyAlreadyInHistorical = 0;
  for (const em of uniqueLegacyEmails) {
    if (historicalAuthoritySet.has(em) || auth.isPreexisting(em)) {
      legacyAlreadyInHistorical++;
    }
  }
  const legacyActuallyNetNew = uniqueLegacyEmails.size - legacyAlreadyInHistorical;

  console.log('--- AUDITORÍA ESPECÍFICA: SRC_PROVEEDORES_SISTEMA_LEGACY ---');
  console.log(`TOTAL_VALID_EMAILS = ${uniqueLegacyEmails.size.toLocaleString()}`);
  console.log(`ALREADY_IN_GLOBAL_AUTHORITY = ${legacyAlreadyInHistorical.toLocaleString()} (${((legacyAlreadyInHistorical / uniqueLegacyEmails.size) * 100).toFixed(2)}%)`);
  console.log(`ACTUALLY_NET_NEW = ${legacyActuallyNetNew.toLocaleString()}\n`);

  // =========================================================================
  // OBJETIVO 2 — RECONCILIAR LOS 47.310 REPORTADOS EN LA ÚLTIMA CORRIDA
  // =========================================================================
  // In the last run, 47,310 emails were reported as certified true net-new.
  // Breakdown of top producers in that run:
  // 1. SRC_PROVEEDORES_SISTEMA_LEGACY: 41,479
  // 2. SRC_BA_PADRON_ESTABLECIMIENTOS: 2,309
  // 3. SRC_BA_AUTORIDADES_2026: 2,092
  // 4. SRC_BA_AUTORIDADES_2025: 620
  // 5. SRC_BA_AUTORIDADES_2024: 239
  // 6. SRC_GCBA_ADMINISTRADORES: 23
  // 7. ECO_UBA_EXACTAS: 4
  // 8. SRC_BA_ALOJAMIENTOS: 3
  // 9. SRC_BA_OFERTA_GASTRO: 1
  // 10. SRC_DNDA_2017: 1
  // + ECO_ web harvests (538 emails)

  // Let's check each of the 47,310 rows:
  // Query rows from Postgres that were inserted by the run (e.g. source_id = 'SRC_PROVEEDORES_SISTEMA_LEGACY', etc.)
  let reportedNetNew = 47310;
  let falseNetNewDueToT0Shrinkage = 0;
  let certifiedNetNewAfterGlobalRecheck = 0;

  // Check rows in Postgres
  const lastRunSources = [
    'SRC_PROVEEDORES_SISTEMA_LEGACY',
    'SRC_BA_PADRON_ESTABLECIMIENTOS',
    'SRC_BA_AUTORIDADES_2026',
    'SRC_BA_AUTORIDADES_2025',
    'SRC_BA_AUTORIDADES_2024',
    'SRC_GCBA_ADMINISTRADORES',
    'SRC_BA_ALOJAMIENTOS',
    'SRC_BA_OFERTA_GASTRO',
    'SRC_DNDA_2017'
  ];

  // We can query all rows by source_id
  const runRowsRes = await pool.query(`
    SELECT email_normalized, source_id 
    FROM public.atlas_public_email_contacts_1m 
    WHERE source_id IN (${lastRunSources.map(s => `'${s}'`).join(',')}) OR source_id LIKE 'ECO_%' OR source_id LIKE 'SRC_DISC_%';
  `);

  console.log(`Rows in Postgres from last run candidate sources: ${runRowsRes.rows.length.toLocaleString()}`);

  const sourceBreakdown = {};
  for (const row of runRowsRes.rows) {
    const isPreexistingInHistorical = historicalAuthoritySet.has(row.email_normalized) || auth.isPreexisting(row.email_normalized);
    const src = row.source_id;
    if (!sourceBreakdown[src]) {
      sourceBreakdown[src] = { total: 0, preexisting: 0, trulyNetNew: 0 };
    }
    sourceBreakdown[src].total++;
    if (isPreexistingInHistorical) {
      sourceBreakdown[src].preexisting++;
      falseNetNewDueToT0Shrinkage++;
    } else {
      sourceBreakdown[src].trulyNetNew++;
      certifiedNetNewAfterGlobalRecheck++;
    }
  }

  console.log('\n--- DESGLOSE POR FUENTE EN LA ÚLTIMA CORRIDA ---');
  console.table(Object.entries(sourceBreakdown).map(([source, stats]) => ({
    Source: source,
    Total: stats.total,
    PreexistingInHistorical: stats.preexisting,
    ActuallyNetNew: stats.trulyNetNew
  })));

  console.log(`REPORTED_NET_NEW = ${reportedNetNew.toLocaleString()}`);
  console.log(`FALSE_NET_NEW_DUE_TO_T0_SHRINKAGE = ${falseNetNewDueToT0Shrinkage.toLocaleString()}`);
  console.log(`CERTIFIED_NET_NEW_AFTER_GLOBAL_RECHECK = ${certifiedNetNewAfterGlobalRecheck.toLocaleString()}\n`);

  // =========================================================================
  // OBJETIVO 3 — FRONTIER REAL
  // =========================================================================
  const urlsDiscovered = 105803;
  const urlsHarvested = 3164;
  const urlsPending = urlsDiscovered - urlsHarvested;
  const harvestCoverage = parseFloat(((urlsHarvested / urlsDiscovered) * 100).toFixed(2));
  
  // Estimate productive pending URLs:
  // In the run, 3,164 URLs yielded productive pages and discovery.
  // Out of 102,639 pending URLs, estimating based on academic/gov density (~15-25% productive):
  const productivePendingUrlsEstimate = Math.round(urlsPending * 0.18);

  const trueFrontierExhaustionProven = false; // Strictly FALSE as 102,639 URLs remain unharvested!

  console.log('--- AUDITORÍA DE FRONTIER REAL ---');
  console.log(`URLS_DISCOVERED = ${urlsDiscovered.toLocaleString()}`);
  console.log(`URLS_HARVESTED = ${urlsHarvested.toLocaleString()}`);
  console.log(`URLS_PENDING = ${urlsPending.toLocaleString()}`);
  console.log(`HARVEST_COVERAGE = ${harvestCoverage}%`);
  console.log(`PRODUCTIVE_PENDING_URLS_ESTIMATE = ~${productivePendingUrlsEstimate.toLocaleString()}`);
  console.log(`TRUE_FRONTIER_EXHAUSTION_PROVEN = FALSE\n`);

  // Save detailed audit report
  const auditReportPath = path.resolve('reports/atlas/acquisition/GLOBAL_T0_FRONTIER_INTEGRITY_AUDIT.json');
  fs.writeFileSync(auditReportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    postgres_current_count: postgresCurrentRows.length,
    historical_authority_count: historicalAuthoritySet.size,
    global_union_count: globalAuthoritySet.size,
    global_authority_hash: globalAuthorityHash,
    legacy_dataset_audit: {
      total_valid_emails: uniqueLegacyEmails.size,
      already_in_global_authority: legacyAlreadyInHistorical,
      actually_net_new: legacyActuallyNetNew
    },
    last_run_reconciliation: {
      reported_net_new: reportedNetNew,
      false_net_new_due_to_t0_shrinkage: falseNetNewDueToT0Shrinkage,
      certified_net_new_after_global_recheck: certifiedNetNewAfterGlobalRecheck,
      source_breakdown: sourceBreakdown
    },
    frontier_audit: {
      urls_discovered: urlsDiscovered,
      urls_harvested: urlsHarvested,
      urls_pending: urlsPending,
      harvest_coverage_pct: harvestCoverage,
      productive_pending_urls_estimate: productivePendingUrlsEstimate,
      true_frontier_exhaustion_proven: false
    },
    ready_to_rerun_500k: false,
    final_status: 'NOT_CERTIFIED_RECONCILED'
  }, null, 2), 'utf8');

  // Freeze the unified global T0 authority to file for future runs
  const unifiedBinPath = path.resolve('scratch/global_preexisting_public_email_authority.bin');
  const unifiedJsonPath = path.resolve('scratch/global_preexisting_public_email_authority.json');
  
  const hashes64 = new Set();
  for (const em of globalAuthoritySet) {
    const h = crypto.createHash('sha256').update(em).digest().subarray(0, 8).toString('hex');
    hashes64.add(h);
  }
  const buf = Buffer.alloc(hashes64.size * 8);
  let off = 0;
  for (const h of hashes64) {
    buf.write(h, off, 8, 'hex');
    off += 8;
  }
  fs.writeFileSync(unifiedBinPath, buf);
  fs.writeFileSync(unifiedJsonPath, JSON.stringify({
    total_preexisting_emails: globalAuthoritySet.size,
    global_authority_hash: globalAuthorityHash,
    frozen_at: new Date().toISOString(),
    sample: Array.from(globalAuthoritySet).slice(0, 50)
  }, null, 2));

  console.log(`[Freeze] Persisted updated global authority to ${unifiedBinPath} (${globalAuthoritySet.size.toLocaleString()} emails).\n`);

  // Print exact devolution format
  console.log('==================================================');
  console.log('DEVOLUCIÓN BREVE:');
  console.log('==================================================');
  console.log(`GLOBAL_T0_COUNT = ${globalAuthoritySet.size.toLocaleString()}`);
  console.log(`GLOBAL_T0_HASH = ${globalAuthorityHash}`);
  console.log(`LAST_RUN_REPORTED_NET_NEW = 47.310`);
  console.log(`LAST_RUN_FALSE_NET_NEW = ${falseNetNewDueToT0Shrinkage.toLocaleString()}`);
  console.log(`LAST_RUN_CERTIFIED_NET_NEW = ${certifiedNetNewAfterGlobalRecheck.toLocaleString()}`);
  console.log(`LEGACY_DATASET_ACTUALLY_NET_NEW = ${legacyActuallyNetNew.toLocaleString()}`);
  console.log(`URLS_PENDING = ${urlsPending.toLocaleString()}`);
  console.log(`HARVEST_COVERAGE = ${harvestCoverage}%`);
  console.log(`TRUE_FRONTIER_EXHAUSTION_PROVEN = FALSE`);
  console.log(`READY_TO_RERUN_500K = FALSE`);
  console.log(`FINAL_STATUS = PROVISIONALLY_NOT_CERTIFIED`);
  console.log('==================================================');

  await pool.end();
}

main().catch(err => {
  console.error('[FATAL ERROR]:', err);
  process.exit(1);
});
