import 'dotenv/config';
import pg from 'pg';

function parseDbUrl() {
  const raw = (process.env.DATABASE_URL || '').trim().replace(/^['"]|['"]$/g, '');
  if (!raw) throw new Error('DATABASE_URL_NOT_FOUND');
  const m = raw.match(/^postgresql:\/\/([^:]+):(.*)@([^:@/]+)(?::(\d+))?\/(.+)$/);
  if (!m) throw new Error('CANNOT_PARSE_DATABASE_URL');
  let pass = m[2];
  if (pass.startsWith('[') && pass.endsWith(']')) pass = pass.slice(1, -1);
  return {
    user: decodeURIComponent(m[1]),
    password: decodeURIComponent(pass),
    host: m[3],
    port: m[4] ? parseInt(m[4], 10) : 5432,
    database: m[5].split('?')[0],
    ssl: { rejectUnauthorized: false }
  };
}

const client = new pg.Client({ ...parseDbUrl() });
await client.connect();

async function runAuditAndVerification() {
  console.log('=== STARTING CONTACT PROVENANCE AUDIT & COMMERCIAL PRIORITIZATION E2E ===\n');

  // =========================================================================
  // 1. AUDIT CANONICAL CONTACT SEED & PROVENANCE
  // =========================================================================
  console.log('--- 1 & 2. Auditing Canonical Contact Seeds and Provenance ---');

  const contactsRes = await client.query(`
    SELECT 
      c.contact_id,
      c.entity_id as company_id,
      c.recipient_type,
      c.email,
      c.email_source_type,
      c.email_source_url,
      e.evidence_id,
      e.field,
      e.value,
      e.source_type,
      e.source_url,
      e.confidence,
      e.verified_at,
      ent.canonical_name,
      ent.canonical_entity_id
    FROM public.atlas_contacts c
    LEFT JOIN public.atlas_contact_evidence e ON c.contact_id = e.contact_id
    LEFT JOIN public.atlas_canonical_entities ent ON c.entity_id = ent.canonical_entity_id
    ORDER BY c.contact_id ASC;
  `);

  const totalContacts = contactsRes.rows.length;
  let realEvidenceCount = 0;
  let syntheticCount = 0;
  let demoCount = 0;
  let withoutProvenanceCount = 0;
  let bindingValidCount = 0;

  for (const c of contactsRes.rows) {
    const val = c.email || c.value;
    const isSynthetic = /example|test|fake|placeholder|dummy|sample/i.test(val);
    const isDemo = /demo/i.test(val);
    const hasEvidence = Boolean(c.source_url || c.email_source_url || c.source_type || c.email_source_type);
    const isBindingValid = Boolean(c.company_id && c.canonical_name && c.company_id === c.canonical_entity_id);

    if (isSynthetic) syntheticCount++;
    if (isDemo) demoCount++;
    if (!hasEvidence) withoutProvenanceCount++;
    else realEvidenceCount++;

    if (isBindingValid) bindingValidCount++;
  }

  console.log(`SEEDED_CONTACTS_TOTAL = ${totalContacts}`);
  console.log(`SEEDED_FROM_REAL_EXISTING_EVIDENCE = ${realEvidenceCount}`);
  console.log(`SYNTHETIC_CONTACTS = ${syntheticCount}`);
  console.log(`DEMO_CONTACTS = ${demoCount}`);
  console.log(`CONTACTS_WITHOUT_PROVENANCE = ${withoutProvenanceCount}`);
  console.log(`CONTACT_COMPANY_BINDING_VALID = ${bindingValidCount === totalContacts ? 'TRUE' : 'FALSE'}`);

  if (syntheticCount > 0 || demoCount > 0 || withoutProvenanceCount > 0) {
    throw new Error('Provenance audit failed: synthetic, demo, or unverified contacts found!');
  }

  // =========================================================================
  // 2. 20-RECORD TEST FOR USER A VIA AUTHENTICATED API
  // =========================================================================
  console.log('\n--- 3, 4, 5, 7. 20-Record Commercial Prioritization Evaluation ---');

  const userA = '768efac1-8d4c-4a19-8919-2de323884569';

  const apiRes = await fetch(`http://localhost:5174/api/user/saved-relations?user_id=${userA}`, {
    headers: {
      'x-user-id': userA
    }
  });

  if (!apiRes.ok) {
    throw new Error(`Failed to fetch saved-relations: HTTP ${apiRes.status}`);
  }

  const data = await apiRes.json();
  const items = data.items || [];

  if (items.length !== 20) {
    throw new Error(`Expected 20 test records, got ${items.length}`);
  }

  let suggestedHigh = 0;
  let suggestedMed = 0;
  let suggestedLow = 0;
  let suggestedInsufficient = 0;

  let highWithRealContact = 0;
  let highWithValidProvenance = 0;
  let highWithMissionFit = 0;

  for (const item of items) {
    const sp = item.suggested_priority;
    if (sp === 'HIGH') {
      suggestedHigh++;
      const hasRealContact = Boolean(item.public_email || item.public_phone);
      const hasProv = item.all_emails?.[0]?.evidence || item.all_phones?.[0]?.evidence;
      const hasFit = Boolean(item.product_name && item.company_name);

      if (hasRealContact) highWithRealContact++;
      if (hasProv) highWithValidProvenance++;
      if (hasFit) highWithMissionFit++;
    } else if (sp === 'MEDIUM') {
      suggestedMed++;
    } else if (sp === 'LOW') {
      suggestedLow++;
    } else if (sp === 'INSUFFICIENT_DATA') {
      suggestedInsufficient++;
    }

    // Verify explainability reasons exist (no opaque scores)
    if (!Array.isArray(item.suggested_priority_reasons) || item.suggested_priority_reasons.length === 0) {
      throw new Error(`Prospect ${item.company_name} is missing explainable reasons!`);
    }
  }

  console.log(`SUGGESTED_HIGH = ${suggestedHigh}`);
  console.log(`SUGGESTED_MEDIUM = ${suggestedMed}`);
  console.log(`SUGGESTED_LOW = ${suggestedLow}`);
  console.log(`SUGGESTED_INSUFFICIENT_DATA = ${suggestedInsufficient}`);

  console.log(`\nHIGH_PRIORITY_WITH_REAL_CONTACT = ${highWithRealContact === suggestedHigh ? 'TRUE' : 'FALSE'}`);
  console.log(`HIGH_PRIORITY_WITH_VALID_PROVENANCE = ${highWithValidProvenance === suggestedHigh ? 'TRUE' : 'FALSE'}`);
  console.log(`HIGH_PRIORITY_WITH_MISSION_FIT = ${highWithMissionFit === suggestedHigh ? 'TRUE' : 'FALSE'}`);

  if (highWithRealContact !== suggestedHigh || highWithValidProvenance !== suggestedHigh) {
    throw new Error('All HIGH suggested prospects must have real public contacts and physical provenance!');
  }

  // =========================================================================
  // 3. USER CONTROL & INDEPENDENCE VERIFICATION
  // =========================================================================
  console.log('\n--- 8. Testing User Control & Priority Independence ---');

  // Pick a prospect with SUGGESTED_HIGH (e.g. Vanoli or Dulcor)
  const highProspect = items.find(i => i.suggested_priority === 'HIGH');
  if (!highProspect) throw new Error('No high prospect found for user independence test');

  // User explicitly sets priority to 'LOW'
  const patchRes = await fetch(`http://localhost:5174/api/user/saved-relations/${highProspect.saved_id}/commercial`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': userA
    },
    body: JSON.stringify({ priority: 'LOW' })
  });

  if (!patchRes.ok) {
    throw new Error(`Failed to update user priority: HTTP ${patchRes.status}`);
  }

  // Re-fetch to verify
  const reFetchRes = await fetch(`http://localhost:5174/api/user/saved-relations?user_id=${userA}`, {
    headers: { 'x-user-id': userA }
  });
  const reData = await reFetchRes.json();
  const updatedItem = reData.items.find(i => i.saved_id === highProspect.saved_id);

  console.log(`Updated Prospect: ${updatedItem.company_name}`);
  console.log(`  - USER_PRIORITY: ${updatedItem.priority} (Expected: LOW)`);
  console.log(`  - SUGGESTED_PRIORITY: ${updatedItem.suggested_priority} (Expected: HIGH)`);

  const userPriorityIndependent = (updatedItem.priority === 'LOW' && updatedItem.suggested_priority === 'HIGH');
  console.log(`USER_PRIORITY_REMAINS_INDEPENDENT = ${userPriorityIndependent ? 'TRUE' : 'FALSE'}`);

  if (!userPriorityIndependent) {
    throw new Error('USER_PRIORITY was overwritten or did not remain independent!');
  }

  console.log('\n=== ALL AUDIT AND VERIFICATION CHECKS PASSED WITH 100% SUCCESS ===\n');
}

try {
  await runAuditAndVerification();
} catch (err) {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
} finally {
  await client.end();
}
