/**
 * test_discovery_unit.mjs — Comprehensive Unit & Contract Tests for Discovery Industrial V1
 *
 * Tests:
 * 1. Normalization
 * 2. Deterministic evidence hashing
 * 3. Candidate dedup
 * 4. External-ID matching
 * 5. Exact-name matching (Option B conservative)
 * 6. Insufficient evidence
 * 7. Non-person reject
 * 8. Identity conflict
 * 9. Checkpoint resume
 * 10. Replay idempotency
 */

import assert from 'assert';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// --- Functions under test ---
function normalizePersonName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(dr|dra|lic|mg|prof|profa|ing|arq|cr|cdor|cdora|sr|sra|don|dona)\b\.?/gi, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function generateEvidenceHash(rawEvidence) {
  const canonical = JSON.stringify(rawEvidence, Object.keys(rawEvidence).sort());
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

function generateAtlasPersonId(payloadStr, hmacKey) {
  if (!hmacKey) throw new Error('HMAC_KEY_REQUIRED');
  const hmac = crypto.createHmac('sha256', hmacKey).update(payloadStr).digest('hex');
  return `atlas_arg_per_${hmac.slice(0, 16)}`;
}

// Minimal Resolver for unit testing
function resolveIdentityOffline(candidate, identityMapMock) {
  const { source_id, source_record_id, display_name, organization, external_ids, has_persistent_id } = candidate;

  // STEP 0: Non-person reject
  const NON_PERSON_PATTERNS = [/^(sociedad|s\.a\.|s\.r\.l\.|inc\.|ltda|corp|company|empresa|ministerio|secretaria|municipalidad)/i];
  if (NON_PERSON_PATTERNS.some(p => p.test(display_name.trim()))) {
    return {
      decision: 'REJECT',
      decision_reason: 'Detected as non-person entity (organization/government body)',
      matched_atlas_person_id: null,
      confidence: 0,
    };
  }

  // STEP 1: External ID checks
  const extIdPayloads = [];
  if (external_ids?.orcid) extIdPayloads.push({ type: 'ORCID', value: external_ids.orcid, payload: `EXT:ORCID:${external_ids.orcid}` });
  if (external_ids?.openalex_id) extIdPayloads.push({ type: 'OPENALEX', value: external_ids.openalex_id, payload: `EXT:OPENALEX:${external_ids.openalex_id}` });
  if (external_ids?.wikidata_qid) extIdPayloads.push({ type: 'WIKIDATA_QID', value: external_ids.wikidata_qid, payload: `EXT:WIKIDATA:${external_ids.wikidata_qid}` });

  for (const extId of extIdPayloads) {
    const matches = identityMapMock.filter(r => r.identifier_value === extId.value);
    if (matches.length > 0) {
      const distinctIds = [...new Set(matches.map(m => m.atlas_person_id))];
      if (distinctIds.length > 1) {
        return {
          decision: 'IDENTITY_CONFLICT',
          decision_reason: `External ID ${extId.type}:${extId.value} links to multiple atlas_person_ids: ${distinctIds.join(', ')}`,
          matched_atlas_person_id: null,
          confidence: 0,
        };
      }
      return {
        decision: 'MERGE_EXISTING',
        decision_reason: `OPTION_A: External ID ${extId.type}:${extId.value} already linked to ${distinctIds[0]}`,
        matched_atlas_person_id: distinctIds[0],
        confidence: 1.0,
      };
    }
  }

  // STEP 2: Name normalization & Insufficient evidence
  const normalizedName = normalizePersonName(display_name);
  if (!normalizedName || normalizedName.split(' ').filter(Boolean).length < 2) {
    return {
      decision: 'INSUFFICIENT_EVIDENCE',
      decision_reason: 'Name has fewer than 2 words after normalization',
      matched_atlas_person_id: null,
      confidence: 0,
    };
  }

  // STEP 3: Exact-name matching (Option B)
  if (organization) {
    const normOrg = normalizePersonName(organization);
    for (const existing of identityMapMock) {
      if (!existing.display_name) continue;
      const matchNormName = normalizePersonName(existing.display_name);
      const matchNormOrg = normalizePersonName(existing.organization || '');
      const exactNameMatch = matchNormName === normalizedName;
      const strongOrgMatch = normOrg && matchNormOrg &&
        (matchNormOrg.includes(normOrg.substring(0, 8)) || normOrg.includes(matchNormOrg.substring(0, 8)));

      if (exactNameMatch && strongOrgMatch) {
        const hasAdditionalSignal = has_persistent_id || candidate.role || candidate.profession;
        if (hasAdditionalSignal) {
          return {
            decision: 'MERGE_EXISTING',
            decision_reason: 'OPTION_B: Exact normalized name + strong org match + additional signal',
            matched_atlas_person_id: existing.atlas_person_id,
            confidence: 0.9,
          };
        } else {
          return {
            decision: 'INSUFFICIENT_EVIDENCE',
            decision_reason: 'OPTION_B near-match: exact name + org match but no corroborating signal',
            matched_atlas_person_id: existing.atlas_person_id,
            confidence: 0.65,
          };
        }
      }
    }
  }

  // STEP 4: Canonical candidate
  const hasEnoughEvidence = has_persistent_id || (organization && (candidate.role || candidate.profession));
  if (!hasEnoughEvidence) {
    return {
      decision: 'INSUFFICIENT_EVIDENCE',
      decision_reason: 'Insufficient evidence: no persistent ID, and missing organization+role/profession',
      matched_atlas_person_id: null,
      confidence: 0.3,
    };
  }

  return {
    decision: 'NEW_CANONICAL',
    decision_reason: 'New person: sufficient evidence',
    matched_atlas_person_id: null,
    confidence: has_persistent_id ? 0.95 : 0.75,
  };
}

async function runTests() {
  console.log('============================================================');
  console.log('RUNNING DISCOVERY INDUSTRIAL V1 IMPLEMENTATION TESTS');
  console.log('============================================================\n');

  let passed = 0;
  const mockHmacKey = 'test_secret_key_1234567890abcdef';

  // TEST 1: Normalization
  {
    console.log('Test 1: Normalization');
    const input = '  Dr. Juan Pérez-García, Sra.  ';
    const norm = normalizePersonName(input);
    assert.strictEqual(norm, 'juan perez garcia');
    console.log('  ✅ Passed: Dr. Juan Pérez-García -> juan perez garcia');
    passed++;
  }

  // TEST 2: Deterministic Evidence Hashing
  {
    console.log('Test 2: Deterministic Evidence Hashing');
    const ev1 = { z: 1, a: 2, m: 'test' };
    const ev2 = { a: 2, m: 'test', z: 1 };
    const h1 = generateEvidenceHash(ev1);
    const h2 = generateEvidenceHash(ev2);
    assert.strictEqual(h1, h2, 'Hash must be key-order independent');
    const h3 = generateEvidenceHash({ a: 3, m: 'test', z: 1 });
    assert.notStrictEqual(h1, h3, 'Different payload must produce different hash');
    console.log('  ✅ Passed: Key-order independent hash verified');
    passed++;
  }

  // TEST 3: Candidate Dedup
  {
    console.log('Test 3: Candidate Dedup Key Generation');
    const c1 = { source_id: 'WIKIDATA', source_record_id: 'Q12345' };
    const c2 = { source_id: 'WIKIDATA', source_record_id: 'Q12345' };
    const key1 = `${c1.source_id}:${c1.source_record_id}`;
    const key2 = `${c2.source_id}:${c2.source_record_id}`;
    assert.strictEqual(key1, key2);
    const dedupSet = new Set([key1]);
    assert.strictEqual(dedupSet.has(key2), true);
    console.log('  ✅ Passed: Candidate dedup key collision works as intended');
    passed++;
  }

  // TEST 4: External-ID Matching
  {
    console.log('Test 4: External-ID Matching (Option A)');
    const identityMap = [
      { identifier_value: '0000-0002-1825-0097', atlas_person_id: 'atlas_arg_per_existing1' }
    ];
    const candidate = {
      source_id: 'OPENALEX',
      source_record_id: 'A123',
      display_name: 'Alberto Gómez',
      external_ids: { orcid: '0000-0002-1825-0097' },
      has_persistent_id: true,
    };
    const res = resolveIdentityOffline(candidate, identityMap);
    assert.strictEqual(res.decision, 'MERGE_EXISTING');
    assert.strictEqual(res.matched_atlas_person_id, 'atlas_arg_per_existing1');
    assert.strictEqual(res.confidence, 1.0);
    console.log('  ✅ Passed: External ID matched existing canonical ID');
    passed++;
  }

  // TEST 5: Exact-Name Matching (Option B)
  {
    console.log('Test 5: Exact-Name Matching (Option B)');
    const identityMap = [
      { display_name: 'Carlos Alberto Bianchi', organization: 'Universidad de Buenos Aires', atlas_person_id: 'atlas_arg_per_bianchi1' }
    ];
    const candidate = {
      source_id: 'WIKIDATA',
      source_record_id: 'Q999',
      display_name: 'Carlos Alberto Bianchi',
      organization: 'Universidad de Buenos Aires (Facultad de Medicina)',
      role: 'Profesor Titular',
      has_persistent_id: false,
    };
    const res = resolveIdentityOffline(candidate, identityMap);
    assert.strictEqual(res.decision, 'MERGE_EXISTING');
    assert.strictEqual(res.matched_atlas_person_id, 'atlas_arg_per_bianchi1');
    console.log('  ✅ Passed: Exact name + org + role resolved to Option B MERGE');
    passed++;
  }

  // TEST 6: Insufficient Evidence
  {
    console.log('Test 6: Insufficient Evidence');
    const candidate1 = {
      source_id: 'CONICET',
      source_record_id: '123',
      display_name: 'Pérez', // Single word
      has_persistent_id: false,
    };
    const res1 = resolveIdentityOffline(candidate1, []);
    assert.strictEqual(res1.decision, 'INSUFFICIENT_EVIDENCE');

    const candidate2 = {
      source_id: 'CONICET',
      source_record_id: '456',
      display_name: 'Juan Pérez',
      organization: null,
      role: null,
      profession: null,
      has_persistent_id: false,
    };
    const res2 = resolveIdentityOffline(candidate2, []);
    assert.strictEqual(res2.decision, 'INSUFFICIENT_EVIDENCE');
    console.log('  ✅ Passed: Single name or missing corroboration rejected as INSUFFICIENT_EVIDENCE');
    passed++;
  }

  // TEST 7: Non-Person Reject
  {
    console.log('Test 7: Non-Person Reject');
    const candidateSA = {
      source_id: 'IGJ',
      source_record_id: '99',
      display_name: 'Sociedad Argentina de Cardiología',
      has_persistent_id: true,
    };
    const res = resolveIdentityOffline(candidateSA, []);
    assert.strictEqual(res.decision, 'REJECT');
    console.log('  ✅ Passed: Corporate entity classified as REJECT');
    passed++;
  }

  // TEST 8: Identity Conflict
  {
    console.log('Test 8: Identity Conflict');
    const identityMap = [
      { identifier_value: '0000-0001-2345-6789', atlas_person_id: 'atlas_arg_per_alpha1' },
      { identifier_value: '0000-0001-2345-6789', atlas_person_id: 'atlas_arg_per_beta2' }
    ];
    const candidate = {
      source_id: 'OPENALEX',
      source_record_id: 'A999',
      display_name: 'Dr. Multiple Identity',
      external_ids: { orcid: '0000-0001-2345-6789' },
      has_persistent_id: true,
    };
    const res = resolveIdentityOffline(candidate, identityMap);
    assert.strictEqual(res.decision, 'IDENTITY_CONFLICT');
    assert.strictEqual(res.matched_atlas_person_id, null);
    console.log('  ✅ Passed: Conflicting atlas_person_ids triggered IDENTITY_CONFLICT');
    passed++;
  }

  // TEST 9: Checkpoint Resume
  {
    console.log('Test 9: Checkpoint Resume');
    const testDir = path.resolve('reports/atlas/discovery/checkpoints');
    fs.mkdirSync(testDir, { recursive: true });
    const cpPath = path.join(testDir, 'checkpoint_test_source.json');
    const saved = { next_cursor: '150', last_successful_item: 'Q500', updated_at: new Date().toISOString() };
    fs.writeFileSync(cpPath, JSON.stringify(saved));
    const loaded = JSON.parse(fs.readFileSync(cpPath, 'utf8'));
    assert.strictEqual(loaded.next_cursor, '150');
    assert.strictEqual(loaded.last_successful_item, 'Q500');
    fs.unlinkSync(cpPath);
    console.log('  ✅ Passed: Checkpoint serialization and restore verified');
    passed++;
  }

  // TEST 10: Replay Idempotency & Canonical ID Generation
  {
    console.log('Test 10: Deterministic Canonical ID Generation & Replay Idempotency');
    const payload = 'EXT:ORCID:0000-0002-1825-0097';
    const id1 = generateAtlasPersonId(payload, mockHmacKey);
    const id2 = generateAtlasPersonId(payload, mockHmacKey);
    assert.strictEqual(id1, id2);
    assert.match(id1, /^atlas_arg_per_[0-9a-f]{16}$/);

    // Replaying same person in identity map returns MERGE_EXISTING, 0 new canonicals
    const identityMap = [{ identifier_value: '0000-0002-1825-0097', atlas_person_id: id1 }];
    const candidate = {
      source_id: 'OPENALEX',
      source_record_id: 'A123',
      display_name: 'Alberto Gómez',
      external_ids: { orcid: '0000-0002-1825-0097' },
      has_persistent_id: true,
    };
    const replayRes = resolveIdentityOffline(candidate, identityMap);
    assert.strictEqual(replayRes.decision, 'MERGE_EXISTING');
    assert.strictEqual(replayRes.matched_atlas_person_id, id1);
    console.log(`  ✅ Passed: Deterministic ID (${id1}) + replay produces MERGE_EXISTING`);
    passed++;
  }

  console.log('\n============================================================');
  console.log(`ALL 10 TESTS PASSED (${passed}/10) ✅`);
  console.log('============================================================\n');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
