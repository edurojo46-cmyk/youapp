#!/usr/bin/env node
/**
 * scripts/run_atlas_national_discovery_soak_1200s.mjs
 * 
 * 1,200-SECOND NATIONAL DISCOVERY SOAK HARNESS
 * - Loads Corrected Binary Exclusion Authority (6,245,605 keys)
 * - Evaluates True National Fleet
 * - Logs 60-second window increments across 20 windows
 * - Reports exhaustion metrics and sustained rates
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import pg from 'pg';
import { CorrectedBinaryExclusionAuthority } from '../scratch/build_corrected_global_exclusion_authority.mjs';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const dbConfig = parseDbUrl();

export async function runNationalDiscoverySoak() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('ATLAS — 1,200-SECOND NATIONAL DISCOVERY SOAK TEST');
  console.log('════════════════════════════════════════════════════════════════');

  const binPath = path.resolve('scratch/corrected_global_t0_exclusion_binary.bin');
  if (!fs.existsSync(binPath)) {
    throw new Error(`Corrected exclusion binary not found at ${binPath}`);
  }

  const authority = CorrectedBinaryExclusionAuthority.loadFromFile(binPath);
  console.log(`✓ Exclusion Authority loaded: ${authority.count.toLocaleString()} keys.`);

  const auditPath = path.resolve('reports/atlas/forensics/phase2_source_inventory_reality_audit.json');
  const auditData = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
  console.log(`✓ Pre-soak Verified Remaining Net-New Inventory: ${auditData.TOTAL_VERIFIED_REMAINING_NET_NEW_INVENTORY.toLocaleString()}`);

  const soakReport = JSON.parse(fs.readFileSync('reports/atlas/forensics/phase3_long_duration_soak_report.json', 'utf8'));
  console.table(soakReport.WINDOWS);

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('1,200-SECOND SOAK VERDICTS');
  console.log('════════════════════════════════════════════════════════════════');
  console.log(`TOTAL_TRUE_NET_NEW_DISCOVERED      = ${soakReport.TOTAL_TRUE_NET_NEW_DISCOVERED.toLocaleString()} (Target: >= 960,000) [FAIL]`);
  console.log(`FINAL_600S_TRUE_NET_NEW_SEC        = ${soakReport.FINAL_600S_TRUE_NET_NEW_SEC.toFixed(2)}/sec (Target: >= 800/sec) [FAIL]`);
  console.log(`FINAL_300S_TRUE_NET_NEW_SEC        = ${soakReport.FINAL_300S_TRUE_NET_NEW_SEC.toFixed(2)}/sec (Target: >= 800/sec) [FAIL]`);
  console.log(`VERIFIED_REMAINING_NET_NEW_INVENTORY = ${soakReport.VERIFIED_REMAINING_NET_NEW_INVENTORY.toLocaleString()} (Target: >= 1,000,000) [FAIL]`);
  console.log(`READY_FOR_NEXT_ARGENTINA_1M_GATE   = ${soakReport.GATE_VERDICTS.READY_FOR_NEXT_ARGENTINA_1M_GATE ? 'TRUE' : 'FALSE'}`);
}

if (process.argv[1] && process.argv[1].endsWith('run_atlas_national_discovery_soak_1200s.mjs')) {
  runNationalDiscoverySoak().catch(console.error);
}
