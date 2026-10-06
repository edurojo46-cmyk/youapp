import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const manifestPath = path.resolve('reports/atlas/pathfinder/blind_test_v2/BLIND_V2_CODE_FREEZE_MANIFEST.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

console.log('=== VERIFYING POST-BLIND CRYPTOGRAPHIC FREEZE INTEGRITY ===');
let allMatch = true;
const hasher = crypto.createHash('sha256');

for (const item of manifest.files) {
  const content = fs.readFileSync(path.resolve(item.path));
  const sha256 = crypto.createHash('sha256').update(content).digest('hex');
  if (sha256 !== item.sha256) {
    console.error(`MISMATCH on ${item.path}: expected ${item.sha256}, got ${sha256}`);
    allMatch = false;
  }
  hasher.update(item.path + ':' + sha256);
}

const postRootHash = hasher.digest('hex');
console.log(`POST_BLIND_ROOT_SHA256 = ${postRootHash}`);
console.log(`PRE_BLIND_ROOT_SHA256  = ${manifest.treeHashes.fullFreezeHash}`);
console.log(`HASH_MATCH_PRE_POST    = ${postRootHash === manifest.treeHashes.fullFreezeHash}`);
console.log(`POST_FREEZE_INTELLIGENCE_CODE_CHANGES = ${allMatch ? 0 : 1}`);

// Now read execution report
const reportPath = path.resolve('reports/atlas/pathfinder/blind_test_v2/BLIND_TEST_V2_EXECUTION_REPORT.json');
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

const prePlansDir = path.resolve('reports/atlas/pathfinder/blind_test_v2/pre_execution_plans');

console.log('\n=== MISSION TABLE ===');
const tableRows = [];

const timeToOntologyList = [];
const timeToSchemaList = [];
const timeToFirstQualifiedList = [];
const timeToFirstSearchableList = [];
const timeToTargetList = [];

for (const rep of report.executionReports) {
  const planPath = path.join(prePlansDir, `${rep.objectiveId}_plan_before_execution.json`);
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));

  const primaryUnit = plan.primaryUnit;
  const isMissionDefined = plan.primaryUnitCategory === 'MISSION_DEFINED';
  const qualified = rep.metrics.missionQualifiedRecords;
  const tFirstQual = rep.telemetry ? rep.telemetry.time_to_first_qualified : 'N/A';
  const tFirstSearch = rep.telemetry ? rep.telemetry.time_to_first_searchable_database : 'N/A';
  const tTarget = rep.telemetry ? rep.telemetry.time_to_target_qualified : 'N/A';
  const pathsTested = rep.metrics.pathsTested;
  const productivePaths = qualified > 0 ? 1 : 0;
  const status = rep.status;

  tableRows.push({
    objectiveId: rep.objectiveId,
    primaryUnit,
    isMissionDefined: isMissionDefined ? 'YES' : 'NO',
    qualified: `${qualified}/${rep.metrics.targetQuantity}`,
    timeFirstQualified: `${tFirstQual}ms`,
    timeFirstSearchable: `${tFirstSearch}ms`,
    timeTarget: `${tTarget}ms`,
    pathsTested,
    productivePaths,
    status
  });

  if (rep.telemetry) {
    timeToOntologyList.push(rep.telemetry.time_to_ontology);
    timeToSchemaList.push(rep.telemetry.time_to_schema);
    timeToFirstQualifiedList.push(rep.telemetry.time_to_first_qualified);
    timeToFirstSearchableList.push(rep.telemetry.time_to_first_searchable_database);
    timeToTargetList.push(rep.telemetry.time_to_target_qualified);
  }
}

console.table(tableRows);

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 !== 0 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

console.log('\n=== SUMMARY METRICS ===');
console.log(`OBJECTIVES_TOTAL = ${report.executionReports.length}`);
const passCount = report.executionReports.filter(r => r.status === 'COMPLETE').length;
const partialCount = report.executionReports.filter(r => r.status === 'PARTIAL').length;
const frontierExhaustedCount = report.executionReports.filter(r => r.status === 'FRONTIER_EXHAUSTED').length;
const insufficientEvidenceCount = report.executionReports.filter(r => r.status === 'INSUFFICIENT_EVIDENCE').length;
const failCount = report.executionReports.filter(r => r.status === 'FAIL' || r.status === 'TECHNICAL_FAILURE').length;

console.log(`PASS = ${passCount}`);
console.log(`PARTIAL = ${partialCount}`);
console.log(`FRONTIER_EXHAUSTED = ${frontierExhaustedCount}`);
console.log(`INSUFFICIENT_EVIDENCE = ${insufficientEvidenceCount}`);
console.log(`FAIL = ${failCount}`);

console.log(`MISSION_DEFINED_ENTITY_TYPES_CREATED = ${report.diversityAudit.missionDefinedPrimaryUnitsCreated.length}`);
const allPrimaryUnits = new Set([...report.diversityAudit.builtInPrimaryUnitsUsed, ...report.diversityAudit.missionDefinedPrimaryUnitsCreated]);
console.log(`UNIQUE_PRIMARY_UNIT_TYPES = ${allPrimaryUnits.size} (${Array.from(allPrimaryUnits).join(', ')})`);
console.log(`UNIQUE_SCHEMA_FAMILIES = ${report.diversityAudit.schemaFieldsetDiversity}`);
console.log(`UNIQUE_ENGINE_COMBINATIONS = ${report.diversityAudit.engineCombinationDiversity}`);

console.log(`MEDIAN_TIME_TO_ONTOLOGY = ${median(timeToOntologyList)}ms`);
console.log(`MEDIAN_TIME_TO_SCHEMA = ${median(timeToSchemaList)}ms`);
console.log(`MEDIAN_TIME_TO_FIRST_QUALIFIED = ${median(timeToFirstQualifiedList)}ms`);
console.log(`MEDIAN_TIME_TO_FIRST_SEARCHABLE_DATABASE = ${median(timeToFirstSearchableList)}ms`);
console.log(`MEDIAN_TIME_TO_TARGET = ${median(timeToTargetList)}ms`);

const totalPathsTested = report.executionReports.reduce((acc, r) => acc + r.metrics.pathsTested, 0);
const totalProductivePaths = report.executionReports.reduce((acc, r) => acc + (r.metrics.missionQualifiedRecords > 0 ? 1 : 0), 0);
console.log(`TOTAL_PATHS_TESTED = ${totalPathsTested}`);
console.log(`TOTAL_PRODUCTIVE_PATHS = ${totalProductivePaths}`);
console.log(`PATH_PRODUCTIVITY_RATE = ${totalPathsTested > 0 ? (totalProductivePaths / totalPathsTested * 100).toFixed(1) : 0}%`);
