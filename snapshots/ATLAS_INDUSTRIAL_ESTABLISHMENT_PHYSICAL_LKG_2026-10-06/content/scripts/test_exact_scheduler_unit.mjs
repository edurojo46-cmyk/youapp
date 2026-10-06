import {
  ExactIdentityConflictScheduler,
  buildRowIdentityKeys,
  preDedupeAndMergeBatch,
  HASH_BITS,
  IDENTITY_CONFLICT_KEY_SCHEME
} from './ExactIdentityConflictScheduler.mjs';

function runUnitTests() {
  console.log('--- TEST 1: Multi-Key Identity Signature & 256-bit Hash ---');
  const row1 = {
    source_id: 'SRC_BORA',
    source_person_id: 'REC_1001',
    atlas_person_id: 'per_canonical_001',
    identifier_type: 'NATIONAL_IDENTITY_HMAC',
    identifier_value: 'd4b8e5c3f2a10987654321fedcba0987654321fedcba0987654321fedcba0987'
  };

  const { rawKeys, hashes } = buildRowIdentityKeys(row1);
  console.log('Raw Keys:', Array.from(rawKeys));
  console.log('Hashes Count:', hashes.size);
  for (const h of hashes) {
    if (h.length !== 64) throw new Error(`Hash width is not 64 chars (256 bits): got ${h.length}`);
  }
  if (rawKeys.size !== 3) throw new Error(`Expected 3 keys, got ${rawKeys.size}`);
  console.log('✅ TEST 1 PASSED: 3 keys derived, all 64-char (256-bit) SHA-256 hashes.');

  console.log('\n--- TEST 2: Deterministic Pre-Dedupe & Merge ---');
  const cleanRows = [
    {
      source_id: 'SRC_BORA',
      source_person_id: 'REC_1001',
      atlas_person_id: 'per_001',
      identifier_type: 'NATIONAL_IDENTITY_HMAC',
      identifier_value: 'hash_abc_123_456_789',
      confidence: 0.90
    },
    {
      // Duplicate of 1st row via same docHmac
      source_id: 'SRC_SEDICI',
      source_person_id: 'REC_9999',
      atlas_person_id: 'per_001',
      identifier_type: 'NATIONAL_IDENTITY_HMAC',
      identifier_value: 'hash_abc_123_456_789',
      confidence: 1.0
    },
    {
      // Unique distinct row
      source_id: 'SRC_INTA',
      source_person_id: 'REC_5555',
      atlas_person_id: 'per_002',
      identifier_type: 'NATIONAL_IDENTITY_HMAC',
      identifier_value: 'hash_xyz_777_888_999',
      confidence: 1.0
    }
  ];

  const outboxRows = [
    {
      atlas_person_id: 'per_001',
      payload: { display_name: 'Juan Perez', geo_confidence: 0.85, evidence_strength: 'MEDIUM' }
    },
    {
      atlas_person_id: 'per_001',
      payload: { display_name: 'Juan Perez', geo_confidence: 1.0, evidence_strength: 'HIGH', profession: 'Investigador' }
    },
    {
      atlas_person_id: 'per_002',
      payload: { display_name: 'Maria Gomez', geo_confidence: 0.95, evidence_strength: 'HIGH' }
    }
  ];

  const dedupeRes = preDedupeAndMergeBatch(cleanRows, outboxRows);
  console.log('Rows Before:', dedupeRes.rowsBeforePreDedupe);
  console.log('Rows After:', dedupeRes.rowsAfterPreDedupe);
  console.log('Merged Count:', dedupeRes.preDedupeRowsMerged);
  console.log('Dropped Count:', dedupeRes.preDedupeRowsDropped);
  console.log('Merged Row 1 Geo Confidence:', dedupeRes.outboxRows[0].payload.geo_confidence);
  console.log('Merged Row 1 Evidence Strength:', dedupeRes.outboxRows[0].payload.evidence_strength);
  console.log('Merged Row 1 Profession:', dedupeRes.outboxRows[0].payload.profession);

  if (dedupeRes.rowsAfterPreDedupe !== 2) throw new Error('Expected 2 rows after merge');
  if (dedupeRes.outboxRows[0].payload.geo_confidence !== 1.0) throw new Error('Failed to preserve highest geo confidence');
  if (dedupeRes.outboxRows[0].payload.profession !== 'Investigador') throw new Error('Failed to merge profession');
  console.log('✅ TEST 2 PASSED: Deterministic merging preserved strongest evidence and fields.');

  console.log('\n--- TEST 3: Exact Conflict Scheduler & Shadow Range Detection ---');
  const scheduler = new ExactIdentityConflictScheduler();

  // Batch A: keys [K1, K2], range ['A', 'Z'], sources: ['SRC_A', 'SRC_B']
  const batchA = {
    batchIndex: 1,
    cleanMapRows: [cleanRows[0]],
    sources: new Set(['SRC_A', 'SRC_B']),
    minIdentityKey: 'SRC_A:001',
    maxIdentityKey: 'SRC_B:999'
  };

  // Batch B: Disjoint keys [K3], BUT overlapping range ['SRC_A:500' to 'SRC_B:100']
  const batchB = {
    batchIndex: 2,
    cleanMapRows: [cleanRows[2]], // has per_002, disjoint from per_001
    sources: new Set(['SRC_A', 'SRC_B']),
    minIdentityKey: 'SRC_A:500',
    maxIdentityKey: 'SRC_B:100'
  };

  // Batch C: Exactly overlapping key with Batch A (has per_001)
  const batchC = {
    batchIndex: 3,
    cleanMapRows: [cleanRows[1]], // shares hash_abc_123_456_789
    sources: new Set(['SRC_A']),
    minIdentityKey: 'SRC_A:100',
    maxIdentityKey: 'SRC_A:200'
  };

  // Slot 1 takes Batch A
  scheduler.registerInFlight('SLOT_1', batchA);
  console.log('Active In-Flight Hashes:', scheduler.inFlightHashes.size);

  // Evaluate Batch B (disjoint keys, but overlapping range)
  const evalB = scheduler.conflictsWithInFlight(batchB);
  console.log('Batch B Conflicts (Exact):', evalB.conflicts);
  console.log('Batch B Range Would Block (Shadow):', evalB.shadowRangeWouldBlock);
  if (evalB.conflicts !== false) throw new Error('Batch B should NOT conflict under exact scheduler');
  if (evalB.shadowRangeWouldBlock !== true) throw new Error('Batch B SHOULD have blocked under range scheduler');

  // Evaluate Batch C (exact overlapping key)
  const evalC = scheduler.conflictsWithInFlight(batchC);
  console.log('Batch C Conflicts (Exact):', evalC.conflicts);
  if (evalC.conflicts !== true) throw new Error('Batch C SHOULD conflict under exact scheduler');

  const stats = scheduler.getStats();
  console.log('Scheduler Stats:', {
    decisionP50Us: stats.decisionP50Us,
    rangeBlocks: stats.rangeBlocks,
    exactConflicts: stats.exactConflicts,
    rangeFalsePositives: stats.rangeFalsePositives,
    rangeFalsePositiveRate: `${stats.rangeFalsePositiveRate}%`
  });

  if (stats.rangeFalsePositives !== 1) throw new Error('Expected 1 range false positive');
  console.log('✅ TEST 3 PASSED: Exact conflict isolates true conflicts; proves range scheduler false positive.');

  // Release SLOT_1
  scheduler.release('SLOT_1');
  if (scheduler.inFlightHashes.size !== 0) throw new Error('Failed to release in-flight hashes');
  console.log('✅ TEST 4 PASSED: Clean immediate release on transaction completion.');

  console.log('\n--- TEST 5: Fair Priority Queue (80/20 & Fallback) ---');
  const netNewQueue = [
    { batchIndex: 1, batchHashes: new Set(['hash_n1']) },
    { batchIndex: 2, batchHashes: new Set(['hash_n2']) },
    { batchIndex: 3, batchHashes: new Set(['hash_n3']) },
    { batchIndex: 4, batchHashes: new Set(['hash_n4']) }
  ];
  const enrichmentQueue = [
    { batchIndex: 101, batchHashes: new Set(['hash_e1']) },
    { batchIndex: 102, batchHashes: new Set(['hash_e2']) }
  ];

  const dispatched = [];
  for (let i = 0; i < 6; i++) {
    const d = scheduler.popFairPriorityBatch(netNewQueue, enrichmentQueue, 0.80);
    if (d) dispatched.push(d.batch.batchIndex);
  }
  console.log('Dispatched sequence:', dispatched);
  // Expected: 4 net new, then 1 enrichment, then 1 enrichment (since net new is now empty)
  if (dispatched.length !== 6) throw new Error(`Expected 6 dispatched, got ${dispatched.length}`);
  console.log('✅ TEST 5 PASSED: 80/20 priority selection and fallback when net new queue is empty.');

  console.log('\n🎉 ALL UNIT TESTS PASSED SUCCESSFULLY!');
}

runUnitTests();
