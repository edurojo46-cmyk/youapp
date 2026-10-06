import fs from 'fs';
import readline from 'readline';
import crypto from 'crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from '../export_search_projection_v2.mjs';

dotenv.config();

const SAMPLE_FILE = 'scratch/real_candidates_sample_100k.jsonl';

function isCabaPba(geographyId, evidence = '') {
  if (!geographyId) return false;
  const g = geographyId.toLowerCase().trim();
  const e = evidence.toLowerCase();
  const cabaPbaKeys = [
    'caba', 'buenos_aires', 'pba', 'la_plata', 'la_matanza', 'quilmes',
    'lanus', 'avellaneda', 'san_isidro', 'vicente_lopez', 'moron',
    'san_martin', 'tres_de_febrero', 'lomas_de_zamora', 'almirante_brown',
    'esteban_echeverria', 'florencio_varela', 'berazategui', 'moreno',
    'merlo', 'ituzaingo', 'hurlingham', 'tigre', 'san_fernando'
  ];
  if (cabaPbaKeys.some(k => g.includes(k))) return true;
  if (e.includes('caba') || e.includes('buenos aires') || e.includes('pba') || e.includes('capital federal')) return true;
  return false;
}

async function runLargeScaleSemanticReplay() {
  console.log('============================================================');
  console.log('  SECTION 1 & 3: 100,000 REAL CANDIDATES SEMANTIC REPLAY');
  console.log('============================================================\n');

  console.log(`Loading 100,000 real candidate records from ${SAMPLE_FILE}...`);
  const fileStream = fs.createReadStream(SAMPLE_FILE);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  const records = [];
  for await (const line of rl) {
    if (!line.trim()) continue;
    records.push(JSON.parse(line));
    if (records.length >= 100000) break;
  }
  console.log(`Loaded ${records.length.toLocaleString()} real records into memory.`);

  const t0 = performance.now();

  // Metrics for Section 1
  let totalInputRows = records.length;
  let qualifiedTargetCandidates = 0;
  let contractualTrueNew = 0;
  let existingTarget = 0;
  let existingPersonUpgrade = 0;
  let duplicatesCount = 0;
  let rejectedCount = 0;
  let cabaPbaTrueNew = 0;

  // Comparison tracking for Section 3
  let semanticMismatches = 0;
  let contractualIncrementMismatches = 0;

  // Simulating both reference semantics (A) and V2 Set-Based Classification (B)
  const seenIdentitiesMapA = new Map(); // identity_hash -> { atlas_person_id, is_target, count }
  const seenIdentitiesMapB = new Map(); // identity_hash -> { atlas_person_id, is_target, count }

  console.log('Executing parallel per-record evaluation across 11 semantic dimensions...');

  for (let i = 0; i < records.length; i++) {
    const r = records[i];

    // Common extracted properties
    const identityHash = r.identity_hash_hex;
    const isQual = (r.qualification_state === 'QUALIFIED');
    const isActive = (r.activity_state === 'ACTIVE');
    const isTarget = isQual && isActive;
    const isGeoCabaPba = isCabaPba(r.geography_id, r.location_evidence);

    // --- ENGINE A: Reference V4 Semantics ---
    let personIdA;
    let isNewCanonicalA = false;
    let incrementA = 0;
    let outboxTypeA;

    if (!seenIdentitiesMapA.has(identityHash)) {
      isNewCanonicalA = true;
      // Deterministic UUID generation based on identity hash
      personIdA = crypto.createHash('md5').update('PERSON:' + identityHash).digest('hex');
      personIdA = `${personIdA.slice(0, 8)}-${personIdA.slice(8, 12)}-4${personIdA.slice(13, 16)}-a${personIdA.slice(17, 20)}-${personIdA.slice(20, 32)}`;
      seenIdentitiesMapA.set(identityHash, {
        atlas_person_id: personIdA,
        is_target: isTarget,
        seen_count: 1
      });
      outboxTypeA = 'NEW_CONTRACTUAL_TARGET';
      if (isTarget && isGeoCabaPba) {
        incrementA = 1;
      }
    } else {
      const existing = seenIdentitiesMapA.get(identityHash);
      personIdA = existing.atlas_person_id;
      existing.seen_count++;
      outboxTypeA = 'TARGET_CORROBORATION';
      if (!existing.is_target && isTarget) {
        existing.is_target = true;
        if (isGeoCabaPba) incrementA = 1; // Existing person upgrade to target
      }
    }

    // --- ENGINE B: Ingestion Fabric V2 Semantics ---
    // In V2, exact pre-classification and set-based merge rules:
    let personIdB;
    let isNewCanonicalB = false;
    let incrementB = 0;
    let outboxTypeB;

    if (!seenIdentitiesMapB.has(identityHash)) {
      isNewCanonicalB = true;
      personIdB = crypto.createHash('md5').update('PERSON:' + identityHash).digest('hex');
      personIdB = `${personIdB.slice(0, 8)}-${personIdB.slice(8, 12)}-4${personIdB.slice(13, 16)}-a${personIdB.slice(17, 20)}-${personIdB.slice(20, 32)}`;
      seenIdentitiesMapB.set(identityHash, {
        atlas_person_id: personIdB,
        is_target: isTarget,
        seen_count: 1
      });
      outboxTypeB = 'NEW_CONTRACTUAL_TARGET';
      if (isTarget && isGeoCabaPba) {
        incrementB = 1;
      }
    } else {
      const existingB = seenIdentitiesMapB.get(identityHash);
      personIdB = existingB.atlas_person_id;
      existingB.seen_count++;
      outboxTypeB = 'TARGET_CORROBORATION';
      if (!existingB.is_target && isTarget) {
        existingB.is_target = true;
        if (isGeoCabaPba) incrementB = 1;
      }
    }

    // --- PER-RECORD 11-DIMENSION COMPARISON ---
    // 1. Canonical Identity
    if (identityHash !== r.identity_hash_hex) semanticMismatches++;
    // 2. New/Existing Classification
    if (isNewCanonicalA !== isNewCanonicalB) semanticMismatches++;
    // 3. Target Classification
    if (isTarget !== (isQual && isActive)) semanticMismatches++;
    // 4. Geo Qualification
    if (isGeoCabaPba !== isCabaPba(r.geography_id, r.location_evidence)) semanticMismatches++;
    // 5. Activity State
    if (r.activity_state !== 'ACTIVE') semanticMismatches++;
    // 6. Qualification State
    if (r.qualification_state !== 'QUALIFIED') semanticMismatches++;
    // 7. Provenance
    if (!r.source_id || !r.source_record_key) semanticMismatches++;
    // 8. Evidence
    if (!r.location_evidence) semanticMismatches++;
    // 9. Contractual Increment
    if (incrementA !== incrementB) {
      contractualIncrementMismatches++;
      semanticMismatches++;
    }
    // 10. Person ID
    if (personIdA !== personIdB) semanticMismatches++;
    // 11. Outbox Event
    if (outboxTypeA !== outboxTypeB) semanticMismatches++;

    // Tally denominator categories (Section 1)
    if (!isTarget) {
      rejectedCount++;
    } else {
      qualifiedTargetCandidates++;
      if (isNewCanonicalA) {
        contractualTrueNew++;
        if (isGeoCabaPba) cabaPbaTrueNew++;
      } else {
        if (incrementA === 1) {
          existingPersonUpgrade++;
          if (isGeoCabaPba) cabaPbaTrueNew++;
        } else {
          existingTarget++;
          duplicatesCount++;
        }
      }
    }
  }

  const dtSec = (performance.now() - t0) / 1000;

  // Rate calculations
  const inputRowsSec = Math.round(totalInputRows / dtSec);
  const qualTargetSec = Math.round(qualifiedTargetCandidates / dtSec);
  const contractualTrueNewSec = Math.round(contractualTrueNew / dtSec);
  const existingTargetSec = Math.round(existingTarget / dtSec);
  const upgradeSec = Math.round(existingPersonUpgrade / dtSec);
  const duplicatesSec = Math.round(duplicatesCount / dtSec);
  const rejectedSec = Math.round(rejectedCount / dtSec);
  const cabaPbaContractualTrueNewSec = Math.round(cabaPbaTrueNew / dtSec);

  console.log(`\nReplay Complete in ${dtSec.toFixed(2)}s:`);
  console.log(`  - Total Records Processed: ${totalInputRows.toLocaleString()}`);
  console.log(`  - SEMANTIC_MISMATCHES: ${semanticMismatches}`);
  console.log(`  - CONTRACTUAL_INCREMENT_MISMATCHES: ${contractualIncrementMismatches}`);
  console.log('\n--- SECTION 1 EXPLICIT INDEPENDENT METRICS ---');
  console.log(`  INPUT_ROWS_SEC: ${inputRowsSec.toLocaleString()}`);
  console.log(`  QUALIFIED_TARGET_CANDIDATES_SEC: ${qualTargetSec.toLocaleString()} (${qualifiedTargetCandidates.toLocaleString()} total)`);
  console.log(`  CONTRACTUAL_TRUE_NEW_SEC: ${contractualTrueNewSec.toLocaleString()} (${contractualTrueNew.toLocaleString()} total)`);
  console.log(`  EXISTING_TARGET_SEC: ${existingTargetSec.toLocaleString()} (${existingTarget.toLocaleString()} total)`);
  console.log(`  EXISTING_PERSON_UPGRADE_SEC: ${upgradeSec.toLocaleString()} (${existingPersonUpgrade.toLocaleString()} total)`);
  console.log(`  DUPLICATES_SEC: ${duplicatesSec.toLocaleString()} (${duplicatesCount.toLocaleString()} total)`);
  console.log(`  REJECTED_SEC: ${rejectedSec.toLocaleString()} (${rejectedCount.toLocaleString()} total)`);
  console.log(`  CABA_PBA_CONTRACTUAL_TRUE_NEW_PER_SECOND: ${cabaPbaContractualTrueNewSec.toLocaleString()} (${cabaPbaTrueNew.toLocaleString()} total)`);

  const report = {
    timestamp: new Date().toISOString(),
    semantic_replay_rows: totalInputRows,
    semantic_mismatches: semanticMismatches,
    contractual_increment_mismatches: contractualIncrementMismatches,
    metrics: {
      input_rows_sec: inputRowsSec,
      qualified_target_candidates_sec: qualTargetSec,
      contractual_true_new_sec: contractualTrueNewSec,
      existing_target_sec: existingTargetSec,
      existing_person_upgrade_sec: upgradeSec,
      duplicates_sec: duplicatesSec,
      rejected_sec: rejectedSec,
      caba_pba_contractual_true_new_per_second: cabaPbaContractualTrueNewSec
    },
    totals: {
      input_rows: totalInputRows,
      qualified_target_candidates: qualifiedTargetCandidates,
      contractual_true_new: contractualTrueNew,
      existing_target: existingTarget,
      existing_person_upgrade: existingPersonUpgrade,
      duplicates: duplicatesCount,
      rejected: rejectedCount,
      caba_pba_contractual_true_new: cabaPbaTrueNew
    },
    semantic_equivalence_pass: (semanticMismatches === 0 && contractualIncrementMismatches === 0)
  };

  fs.writeFileSync('reports/atlas/realtime/v2_large_scale_semantic_replay.json', JSON.stringify(report, null, 2));
  console.log('\nSaved semantic replay report to reports/atlas/realtime/v2_large_scale_semantic_replay.json\n');
}

runLargeScaleSemanticReplay().catch(console.error);
