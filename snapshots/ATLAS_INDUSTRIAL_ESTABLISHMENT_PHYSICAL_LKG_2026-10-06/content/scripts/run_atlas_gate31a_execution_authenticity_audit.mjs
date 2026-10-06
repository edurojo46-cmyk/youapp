/**
 * scripts/run_atlas_gate31a_execution_authenticity_audit.mjs
 * 
 * ATLAS GATE #31A: MILLION INDUSTRIAL RUN EXECUTION AUTHENTICITY & REPRODUCIBILITY AUDIT
 * 
 * Executes the forensic authenticity audit of Gate #31:
 * - Performs full static code audit across engine and runner.
 * - Proves data plane origin and checks cold-run authenticity.
 * - Reconciles ARCA row semantics, duplicate semantics, and partition equations.
 * - Audits monotonic wall clock vs simulated clock.
 * - Audits physical ledger and physical search shadow index.
 * - Re-queries production SSOT to prove SSOT_MUTATION = FALSE.
 * - Verifies bit-for-bit preservation of all historical artifacts.
 * - Emits reports/atlas/discovery/atlas_gate31_execution_authenticity_audit_v1.json.
 * - STOPS cleanly without automatically rerunning Gate #31.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { AtlasGate31ExecutionAuthenticityAuditor } from '../src/lib/atlas/discovery/audit/AtlasGate31ExecutionAuthenticityAuditor.mjs';

console.log('================================================================================');
console.log('ATLAS GATE #31A: MILLION INDUSTRIAL RUN EXECUTION AUTHENTICITY AUDIT');
console.log('================================================================================\n');

const auditor = new AtlasGate31ExecutionAuthenticityAuditor({
  workspaceRoot: process.cwd()
});

async function run() {
  const auditReport = await auditor.runAudit();

  const reportPath = path.resolve('reports/atlas/discovery/atlas_gate31_execution_authenticity_audit_v1.json');
  fs.writeFileSync(reportPath, JSON.stringify(auditReport, null, 2), 'utf8');

  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(reportPath)).digest('hex');

  console.log('Audit completed successfully.');
  console.log(`Execution Classification:        ${auditReport.execution_classification}`);
  console.log(`Final Certification Decision:    ${auditReport.final_certification_decision}`);
  console.log(`Operational Status:              ${auditReport.operational_status}`);
  console.log(`Saved Audit Report:              ${reportPath}`);
  console.log(`Report SHA256:                   ${sha256}`);
  console.log('\n================================================================================');
  console.log('GATE #31A COMPLETE. EXECUTION HALTED (STOP).');
  console.log('================================================================================\n');
}

run().catch(err => {
  console.error('CRITICAL ERROR IN GATE #31A AUDIT:', err);
  process.exit(1);
});
