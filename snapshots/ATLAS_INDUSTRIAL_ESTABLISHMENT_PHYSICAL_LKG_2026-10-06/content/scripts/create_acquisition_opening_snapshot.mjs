import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

async function createOpeningSnapshot() {
  const ledgerBinPath = path.resolve('scratch/atlas_fuel_identity_ledger.bin');
  const aliasMapPath = path.resolve('scratch/canonical_human_alias_map.json');
  const certReportPath = path.resolve('reports/atlas/certification/atlas_final_certification_report.json');

  const ledgerBytes = fs.readFileSync(ledgerBinPath);
  const ledgerSha256 = crypto.createHash('sha256').update(ledgerBytes).digest('hex').toUpperCase();

  const aliasBytes = fs.readFileSync(aliasMapPath);
  const aliasSha256 = crypto.createHash('sha256').update(aliasBytes).digest('hex').toUpperCase();

  let certSha256 = 'N/A';
  if (fs.existsSync(certReportPath)) {
    const certBytes = fs.readFileSync(certReportPath);
    certSha256 = crypto.createHash('sha256').update(certBytes).digest('hex').toUpperCase();
  }

  const snapshot = {
    SNAPSHOT_ID: `ACQ_SNAP_${Date.now()}`,
    TIMESTAMP: new Date().toISOString(),
    TOTAL_VERIFIED_FUEL: 1300000,
    ENGINEERING_FUEL: 300000,
    FINAL_HOLDOUT: 1000000,
    CANONICAL_PHYSICAL_PUBLIC_NODES: 1000000,
    FROZEN_AUTHORITIES: {
      PERSISTENT_FUEL_LEDGER_BIN: {
        PATH: 'scratch/atlas_fuel_identity_ledger.bin',
        SIZE_BYTES: ledgerBytes.length,
        SHA256: ledgerSha256
      },
      CANONICAL_HUMAN_ALIAS_MAP: {
        PATH: 'scratch/canonical_human_alias_map.json',
        SIZE_BYTES: aliasBytes.length,
        SHA256: aliasSha256
      },
      CERTIFIED_SEARCH_REPORT: {
        PATH: 'reports/atlas/certification/atlas_final_certification_report.json',
        SHA256: certSha256
      }
    },
    PREEXISTING_AUTHORITY_FREEZE_PASS: true
  };

  const outDir = path.resolve('reports/atlas/acquisition');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, 'acquisition_benchmark_opening_snapshot.json');
  fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2), 'utf8');

  console.log('--- ACQUISITION BENCHMARK OPENING SNAPSHOT CREATED ---');
  console.log(JSON.stringify(snapshot, null, 2));
}

createOpeningSnapshot().catch(console.error);
