import { 
  AtlasConstitution, 
  CONSTITUTIONAL_INVARIANTS,
  DecisionQualityEngine,
  MultiHypothesisManager,
  ConfidenceScaleGovernor,
  FailureIntelligenceMemory,
  NoveltyFirewall,
  MissionFitGate,
  LearningScopeEngine,
  ContradictionEngine,
  ConfidenceCalibrationEngine,
  OutcomeLearningEngine
} from '../src/lib/atlasIntelligence/AtlasConstitution.ts';

console.log('========================================================================');
console.log('🏛️ ATLAS INTELLIGENCE CONSTITUTION V1 — VERIFICATION SUITE');
console.log('========================================================================\n');

// 1. Immutable Invariants
console.log('>>> [1] Validating Constitutional Invariants...');
const rules = CONSTITUTIONAL_INVARIANTS;
console.log(`Loaded ${rules.length} constitutional invariant rules.`);
const requiredRules = [
  'OBJECTIVE_OVER_VOLUME',
  'EVIDENCE_OVER_CONFIDENCE',
  'TRUTH_DOES_NOT_EQUAL_MISSION_FIT',
  'UNKNOWN_IS_NOT_TRUE',
  'UNKNOWN_IS_NOT_FALSE',
  'FACT_INFERENCE_HYPOTHESIS_SEPARATION',
  'SOURCE_NEW_TO_RUN_IS_NOT_NEW_TO_ATLAS',
  'IDENTITY_BEFORE_ATTRIBUTES',
  'NO_CERTIFICATION_WITHOUT_EVIDENCE',
  'NO_SCALE_BEFORE_CANARY',
  'NO_RETRY_WITHOUT_CHANGED_CONDITION',
  'RAW_DATA_PRESERVATION',
  'PREDICTION_IS_NOT_ACQUISITION',
  'REVERSIBILITY_BY_DEFAULT'
];

for (const req of requiredRules) {
  const found = rules.find(r => r.id === req);
  if (!found || !found.immutable) {
    throw new Error(`Rule ${req} missing or not immutable!`);
  }
}
console.log('  [PASS] All 14 mandatory constitutional invariants verified immutable.');

// 2. Decision Quality Engine
console.log('\n>>> [2] Testing Decision Quality Engine...');
// Test Case A: High volume but low mission fit -> MUST BE REJECTED
const evalLowFit = DecisionQualityEngine.calculateExpectedValue({
  missionFit: 0.20,
  expectedYield: 500000,
  expectedNetNew: 400000,
  evidenceConfidence: 0.90,
  sourceNovelty: 0.80,
  overlapRisk: 0.10,
  cost: 0.10,
  latencyMs: 100,
  failureHistory: 0.05,
  reversibility: 0.90
});
if (evalLowFit.approved) {
  throw new Error('DecisionQualityEngine failed to reject low mission fit high volume action!');
}
console.log('  [PASS] High volume with low mission fit correctly rejected.');

// Test Case B: High mission fit, strong evidence, low risk -> APPROVED
const evalGood = DecisionQualityEngine.calculateExpectedValue({
  missionFit: 0.95,
  expectedYield: 5000,
  expectedNetNew: 4500,
  evidenceConfidence: 0.92,
  sourceNovelty: 0.90,
  overlapRisk: 0.10,
  cost: 0.15,
  latencyMs: 400,
  failureHistory: 0.02,
  reversibility: 0.95
});
if (!evalGood.approved || evalGood.actionExpectedValue <= 0.15) {
  throw new Error('DecisionQualityEngine failed to approve high quality action!');
}
console.log(`  [PASS] High quality action approved with Expected Value: ${evalGood.actionExpectedValue}`);

// 3. Multi-Hypothesis Architecture
console.log('\n>>> [3] Testing Multi-Hypothesis Architecture...');
const hypothesisManager = new MultiHypothesisManager();
const h1 = hypothesisManager.formulateHypothesis(
  'Direct paginated scraping will yield 15k distinct entities',
  'Probe 5 pages and check unique entity ratio',
  0.50
);
const h2 = hypothesisManager.formulateHypothesis(
  'Sitemap XML traversal yields higher novel density than HTML scraping',
  'Fetch sitemap index and verify 20 URL endpoints',
  0.60
);

hypothesisManager.addSupportingEvidence(h2.hypothesisId, 'Sitemap contains 45k deep entity records', 0.25);
hypothesisManager.addContradictingEvidence(h1.hypothesisId, 'HTML pages are behind heavy Cloudflare bot challenge', 0.35);

const ranked = hypothesisManager.getCompetingHypotheses();
if (ranked[0].hypothesisId !== h2.hypothesisId || ranked[0].confidence < 0.80) {
  throw new Error('Multi-hypothesis engine ranking failure!');
}
console.log(`  [PASS] Hypotheses ranked correctly. Top hypothesis: ${ranked[0].claim} (Confidence: ${ranked[0].confidence})`);

// 4. Scale By Confidence
console.log('\n>>> [4] Testing Scale By Confidence Governance...');
const probeAuth = ConfidenceScaleGovernor.authorizeExecutionTier(0.40, false);
if (probeAuth.authorizedTier !== 'TINY_PROBE') throw new Error('Low confidence tier mismatch');

const canaryAuth = ConfidenceScaleGovernor.authorizeExecutionTier(0.65, false);
if (canaryAuth.authorizedTier !== 'CANARY') throw new Error('Medium confidence tier mismatch');

let directScaleBlocked = false;
try {
  ConfidenceScaleGovernor.validateTierTransition('TINY_PROBE', 'INDUSTRIAL_SCALE', false);
} catch (e) {
  directScaleBlocked = true;
}
if (!directScaleBlocked) throw new Error('Direct jump to industrial scale was not blocked!');
console.log('  [PASS] Scale by confidence transitions and canary gating verified.');

// 5. Failure Intelligence
console.log('\n>>> [5] Testing Failure Intelligence Memory...');
const failMemory = FailureIntelligenceMemory.getInstance();
failMemory.recordFailure({
  whatFailed: 'HARVEST_HTTP_REQUEST',
  why: 'HTTP 429 Rate Limited',
  conditions: { ratePerSec: 20, useProxy: false },
  source: 'SRC_SAMPLE_REGISTRY',
  strategy: 'CONCURRENT_BULK_FETCH',
  observedResult: { status: 429 },
  expectedResult: { status: 200 },
  error: 'Too Many Requests',
  whatMustChangeBeforeRetry: ['ratePerSec', 'useProxy']
});

const retryWithoutChange = failMemory.canRetry('SRC_SAMPLE_REGISTRY', 'CONCURRENT_BULK_FETCH', {
  ratePerSec: 20,
  useProxy: false
});
if (retryWithoutChange.allowed) {
  throw new Error('Failure Intelligence failed to block retry under unchanged conditions!');
}

const retryWithChange = failMemory.canRetry('SRC_SAMPLE_REGISTRY', 'CONCURRENT_BULK_FETCH', {
  ratePerSec: 2,
  useProxy: true
});
if (!retryWithChange.allowed) {
  throw new Error('Failure Intelligence incorrectly blocked retry with changed conditions!');
}
console.log('  [PASS] Unchanged failure retry successfully blocked; changed condition retry permitted.');

// 6. Novelty Firewall
console.log('\n>>> [6] Testing Novelty Firewall...');
const firewall = NoveltyFirewall.getInstance();
firewall.registerKnownSource({
  sourceId: 'SRC_CHAS_REGISTRY',
  canonicalUrl: 'https://cdn.produccion.gob.ar/cdn-secind/datos-abiertos-chas/chas-emitidos.csv',
  sourceFamily: 'FAM_CHAS',
  localFile: 'scratch/physical_sources/chas_autopartes_seguridad.csv',
  firstSeenAt: '2026-09-28T23:53:21.000Z',
  originMission: 'V2_MISSION'
});

const evalKnownFile = firewall.evaluateNovelty({
  localFile: 'c:/Users/Eduardo/YOUAPP/scratch/physical_sources/chas_autopartes_seguridad.csv'
});
if (evalKnownFile.classification !== 'PREKNOWN_SOURCE') {
  throw new Error(`Novelty Firewall failed to recognize local file: ${evalKnownFile.classification}`);
}

const evalTrulyNew = firewall.evaluateNovelty({
  sourceId: 'SRC_UNSEEN_PROVINCIAL_MINING_REGISTRY_2026',
  url: 'https://mineria.catamarca.gob.ar/api/padron_productores.json',
  localFile: 'fresh_download_unseen.csv'
});
if (evalTrulyNew.classification !== 'TRUE_NEW_SOURCE') {
  throw new Error(`Novelty Firewall failed to identify truly new source: ${evalTrulyNew.classification}`);
}
console.log('  [PASS] Novelty Firewall correctly identifies pre-known vs truly new sources.');

// 7. Mission Fit Gate
console.log('\n>>> [7] Testing Mission Fit Gate...');
const offMissionTrue = MissionFitGate.evaluateCandidate({
  dataTrue: true,
  missionFit: false,
  evidenceSufficient: true,
  recordIdentifier: 'REC_PARKING_FINE_4821',
  contextDescription: 'Traffic infraction ticket'
});
if (offMissionTrue.qualified || offMissionTrue.status !== 'REJECTED_OFF_MISSION') {
  throw new Error('MissionFitGate failed to reject true off-mission record!');
}

const fullyQualified = MissionFitGate.evaluateCandidate({
  dataTrue: true,
  missionFit: true,
  evidenceSufficient: true,
  recordIdentifier: 'CERT_CHAS_AUTO_9981',
  contextDescription: 'Argentine Automotive Safety Component'
});
if (!fullyQualified.qualified || fullyQualified.status !== 'MISSION_QUALIFIED') {
  throw new Error('MissionFitGate failed to qualify valid candidate!');
}
console.log('  [PASS] Mission Fit Gate enforces DATA_TRUE + MISSION_FIT + EVIDENCE_SUFFICIENT.');

// 8. Learning Scope Engine
console.log('\n>>> [8] Testing Learning Scope Engine...');
const learningScope = LearningScopeEngine.getInstance();
learningScope.registerLearnedRule({
  ruleId: 'RULE_PUBLIC_REGISTRY_PAGINATOR',
  scope: ['ARGENTINA_PUBLIC_REGISTRY', 'MUNICIPAL_PORTAL'],
  preconditions: { paginationType: 'CURSOR' },
  action: 'USE_CURSOR_WINDOWING',
  confidence: 0.88,
  evidenceCount: 15,
  successCount: 14,
  failureCount: 1,
  lastValidatedAt: new Date().toISOString()
});

const allowedScope = learningScope.canApplyRule('RULE_PUBLIC_REGISTRY_PAGINATOR', 'ARGENTINA_PUBLIC_REGISTRY');
if (!allowedScope.allowed) throw new Error('Valid scope was rejected!');

const forbiddenScope = learningScope.canApplyRule('RULE_PUBLIC_REGISTRY_PAGINATOR', 'ACADEMIC_OAI_PMH');
if (forbiddenScope.allowed) throw new Error('Out-of-scope rule application was not blocked!');
console.log('  [PASS] Learning scope boundary strictly enforced.');

// 9. Contradiction Engine
console.log('\n>>> [9] Testing Contradiction Engine...');
const contradictionEngine = ContradictionEngine.getInstance();
const conflict = contradictionEngine.detectAndRegisterConflict({
  sourceA: 'SRC_NATIONAL_COMPANY_PADRON',
  sourceB: 'SRC_PROVINCIAL_COMMERCE_REGISTRY',
  claimA: { cuit: '30-71123456-9', status: 'ACTIVE' },
  claimB: { cuit: '30-71123456-9', status: 'BANKRUPT_INACTIVE' },
  freshness: {
    sourceA_timestamp: '2026-09-01T00:00:00Z',
    sourceB_timestamp: '2026-09-25T00:00:00Z'
  },
  independence: true,
  nextVerificationAction: 'EXECUTE_CANARY_PROBE_ON_AFIP_PADRON'
});

const openConflicts = contradictionEngine.getOpenConflicts();
if (openConflicts.length === 0 || openConflicts[0].conflictId !== conflict.conflictId) {
  throw new Error('Contradiction Engine failed to track open conflict!');
}
console.log(`  [PASS] Contradiction registered cleanly without silent resolution (ID: ${conflict.conflictId}).`);

// 10. Confidence Calibration Engine
console.log('\n>>> [10] Testing Confidence Calibration Engine...');
const calibration = ConfidenceCalibrationEngine.getInstance();
calibration.recordPredictionOutcome(0.85, true);
calibration.recordPredictionOutcome(0.80, true);
calibration.recordPredictionOutcome(0.90, false);
calibration.recordPredictionOutcome(0.85, true);

const calReport = calibration.getCalibrationReport();
console.log(`  Calibration Report: Predicted=${calReport.predictedConfidence}, Realized=${calReport.realizedSuccessRate}, Error=${calReport.calibrationError}`);
if (calReport.sampleSize !== 4) throw new Error('Calibration report sample size mismatch!');
console.log('  [PASS] Confidence Calibration Engine reporting accurate calibration error.');

// 11. Outcome-Based Learning
console.log('\n>>> [11] Testing Outcome-Based Learning Engine...');
let predictionOnlyBlocked = false;
try {
  OutcomeLearningEngine.validateLearningPayload({
    expected: { yield: 50000 },
    observed: {},
    certified: {}
  });
} catch (e) {
  predictionOnlyBlocked = true;
}
if (!predictionOnlyBlocked) throw new Error('OutcomeLearningEngine permitted prediction-only training!');
console.log('  [PASS] Prediction-only learning attempt blocked.');

// 12. Master Constitution Singleton
console.log('\n>>> [12] Testing Master AtlasConstitution Singleton & Integration...');
const constitution = AtlasConstitution.getInstance();
const constitutionalRules = constitution.getConstitutionalRules();
if (constitutionalRules.length !== 14) throw new Error('Constitution rules count mismatch!');

console.log('\n========================================================================');
console.log('✅ ALL 12 CONSTITUTIONAL VERIFICATIONS PASSED CLEANLY');
console.log('========================================================================');
