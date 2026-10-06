import { dbPool } from '../server/db.ts';
import { AtlasConceptIntegrityGate } from '../server/services/industrial/AtlasConceptIntegrityGate.ts';

async function main() {
  console.log('=== RUNNING ATLAS CONCEPT INTEGRITY GATE AUDIT ===');
  const gate = AtlasConceptIntegrityGate.getInstance();
  const report = await gate.auditRegistry(dbPool);

  console.log('\n--- AUDIT RESULTS ---');
  console.log('TOTAL_CONCEPTS_AUDITED:', report.total_concepts_audited);
  console.log('VALID_CONCEPTS_COUNT:', report.valid_concepts_count);
  console.log('INVALID_CONCEPTS_COUNT:', report.invalid_concepts_count);
  console.log('DUPLICATE_PAYLOAD_GROUPS:', report.duplicate_payload_groups);
  console.log('CROSS_CATEGORY_CONTAMINATIONS:', report.cross_category_contaminations);
  console.log('ISSUES_BY_CODE:', JSON.stringify(report.issues_by_code, null, 2));

  if (report.issues.length > 0) {
    console.log('\nISSUES FOUND:');
    for (const iss of report.issues) {
      console.log(`[${iss.code}] ${iss.concept_id} ("${iss.canonical_name}"): ${iss.message}`);
    }
  } else {
    console.log('\nALL CONCEPTS PASSED INTEGRITY GATE VALIDATION.');
  }

  console.log('PASSED:', report.passed);
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
