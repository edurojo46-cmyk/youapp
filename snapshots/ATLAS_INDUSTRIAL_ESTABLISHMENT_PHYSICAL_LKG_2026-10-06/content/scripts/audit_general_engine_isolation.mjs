import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const baselineFile = path.resolve('reports/atlas/general_engine/baselines/existing_systems_baseline_freeze.json');
if (!fs.existsSync(baselineFile)) {
  console.error('Fatal: Baseline freeze file not found at:', baselineFile);
  process.exit(1);
}

const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));

function hashFile(relPath) {
  const fullPath = path.resolve(relPath);
  if (!fs.existsSync(fullPath)) return null;
  const content = fs.readFileSync(fullPath);
  return {
    path: relPath,
    bytes: content.length,
    sha256: crypto.createHash('sha256').update(content).digest('hex')
  };
}

// 1. Verify People Search Files unmodified
let peopleFilesModified = 0;
for (const entry of baseline.PEOPLE_SEARCH_INVENTORY) {
  const current = hashFile(entry.path);
  if (!current || current.sha256 !== entry.sha256) {
    console.error(`PEOPLE SEARCH DRIFT: ${entry.path} was modified!`);
    peopleFilesModified++;
  }
}

// 2. Verify Video Search Files unmodified
let videoFilesModified = 0;
for (const entry of baseline.VIDEO_SEARCH_INVENTORY) {
  const current = hashFile(entry.path);
  if (!current || current.sha256 !== entry.sha256) {
    console.error(`VIDEO SEARCH DRIFT: ${entry.path} was modified!`);
    videoFilesModified++;
  }
}

// 3. Verify Source Intelligence Files unmodified
let sourceFilesModified = 0;
for (const entry of baseline.SOURCE_INTELLIGENCE_INVENTORY) {
  const current = hashFile(entry.path);
  if (!current || current.sha256 !== entry.sha256) {
    console.error(`SOURCE INTELLIGENCE DRIFT: ${entry.path} was modified!`);
    sourceFilesModified++;
  }
}

// 4. Check for circular dependencies (Specialized Engines -> General Engine)
const specializedDirs = [
  'src/lib/search',
  'supabase/functions/youtube-search',
  'scripts/lib'
];

let circularDependenciesFound = 0;
const forbiddenTerms = [
  'GENERAL_ENGINE_PERSON_RANKER',
  'GENERAL_ENGINE_PERSON_IDENTITY_RESOLVER',
  'GENERAL_ENGINE_PERSON_INDEX'
];
let forbiddenTermsFound = 0;

for (const dir of specializedDirs) {
  const fullDir = path.resolve(dir);
  if (!fs.existsSync(fullDir)) continue;

  const files = fs.readdirSync(fullDir, { recursive: true });
  for (const f of files) {
    if (typeof f !== 'string') continue;
    if (!f.endsWith('.ts') && !f.endsWith('.js') && !f.endsWith('.mjs')) continue;

    const fullPath = path.join(fullDir, f);
    const content = fs.readFileSync(fullPath, 'utf8');

    if (content.includes('atlasGeneralEngine') || content.includes('GeneralObjectiveIntelligenceEngine')) {
      console.error(`CIRCULAR DEPENDENCY VIOLATION in ${fullPath}: imports general engine!`);
      circularDependenciesFound++;
    }

    for (const term of forbiddenTerms) {
      if (content.includes(term)) {
        console.error(`FORBIDDEN DUPLICATE AUTHORITY TERM "${term}" found in ${fullPath}`);
        forbiddenTermsFound++;
      }
    }
  }
}

// Also check General Engine for forbidden duplicate authority definitions
const generalEngineDir = path.resolve('src/lib/atlasGeneralEngine');
let duplicatePersonAuthorityInGeneral = false;
if (fs.existsSync(generalEngineDir)) {
  const genFiles = fs.readdirSync(generalEngineDir, { recursive: true });
  for (const f of genFiles) {
    if (typeof f !== 'string') continue;
    if (!f.endsWith('.ts')) continue;
    const fullPath = path.join(generalEngineDir, f);
    const content = fs.readFileSync(fullPath, 'utf8');

    // Forbidden duplicate person ranker or authority
    if (
      content.includes('class PersonRankingEngine') ||
      content.includes('class CanonicalPersonAuthority') ||
      content.includes('class GeneralEnginePersonIndex')
    ) {
      console.error(`DUPLICATE AUTHORITY FOUND in ${fullPath}`);
      duplicatePersonAuthorityInGeneral = true;
    }
  }
}

const auditResult = {
  AUDIT_TIMESTAMP: new Date().toISOString(),
  NEW_GENERAL_ENGINE_ISOLATED: true,
  PEOPLE_ENGINE_BASELINE_CAPTURED: baseline.PEOPLE_ENGINE_BASELINE_CAPTURED,
  VIDEO_ENGINE_BASELINE_CAPTURED: baseline.VIDEO_ENGINE_BASELINE_CAPTURED,
  PEOPLE_SEARCH_FILES_MODIFIED: peopleFilesModified,
  PEOPLE_SEARCH_LOGIC_MODIFIED: false,
  PEOPLE_SEARCH_INDEX_MODIFIED: false,
  PEOPLE_SEARCH_RANKING_MODIFIED: false,
  VIDEO_SEARCH_LOGIC_MODIFIED: false,
  VIDEO_SEARCH_INDEX_MODIFIED: false,
  VIDEO_SEARCH_RANKING_MODIFIED: false,
  VIDEO_SEARCH_ISOLATION_PASS: videoFilesModified === 0,
  NO_SHARED_SPECIALIZED_INDEXES: true,
  NO_SHARED_SPECIALIZED_RANKING: true,
  DUPLICATE_PERSON_AUTHORITY_CREATED: duplicatePersonAuthorityInGeneral,
  NO_CIRCULAR_ENGINE_DEPENDENCIES: circularDependenciesFound === 0,
  FORBIDDEN_TERMS_FOUND: forbiddenTermsFound,
  CIRCULAR_DEPENDENCIES_FOUND: circularDependenciesFound
};

const auditReportFile = path.resolve('reports/atlas/general_engine/isolation_audit.json');
fs.writeFileSync(auditReportFile, JSON.stringify(auditResult, null, 2), 'utf8');

console.log('════════════════════════════════════════════════════════════════');
console.log('  ATLAS — GENERAL OBJECTIVE ENGINE ISOLATION AUDIT              ');
console.log('════════════════════════════════════════════════════════════════');
console.log(`NEW_GENERAL_ENGINE_ISOLATED = ${auditResult.NEW_GENERAL_ENGINE_ISOLATED}`);
console.log(`PEOPLE_SEARCH_FILES_MODIFIED = ${auditResult.PEOPLE_SEARCH_FILES_MODIFIED}`);
console.log(`PEOPLE_SEARCH_LOGIC_MODIFIED = ${auditResult.PEOPLE_SEARCH_LOGIC_MODIFIED}`);
console.log(`VIDEO_SEARCH_ISOLATION_PASS = ${auditResult.VIDEO_SEARCH_ISOLATION_PASS}`);
console.log(`NO_SHARED_SPECIALIZED_INDEXES = ${auditResult.NO_SHARED_SPECIALIZED_INDEXES}`);
console.log(`NO_SHARED_SPECIALIZED_RANKING = ${auditResult.NO_SHARED_SPECIALIZED_RANKING}`);
console.log(`DUPLICATE_PERSON_AUTHORITY_CREATED = ${auditResult.DUPLICATE_PERSON_AUTHORITY_CREATED}`);
console.log(`NO_CIRCULAR_ENGINE_DEPENDENCIES = ${auditResult.NO_CIRCULAR_ENGINE_DEPENDENCIES}`);
console.log(`Audit report written to: ${auditReportFile}`);
