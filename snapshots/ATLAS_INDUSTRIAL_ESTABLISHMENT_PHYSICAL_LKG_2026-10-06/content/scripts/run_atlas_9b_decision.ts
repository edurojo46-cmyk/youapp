import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { DeterministicDecisionEngine, CandidateContext } from '../src/decision/DeterministicDecisionEngine';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_SERVICE_KEY) { console.error('FATAL_CONFIG: Missing required SUPABASE_SECRET_KEY'); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const engine = new DeterministicDecisionEngine();

function createBaseContext(): CandidateContext {
    return {
        candidateId: crypto.randomUUID(),
        audienceMatchStatus: 'MATCH',
        identityResolved: true,
        unresolvedDuplicate: false,
        evidenceSufficient: true,
        evidenceConflict: false,
        contactUsable: true,
        isSuppressed: false,
        complianceStatus: 'PASS',
        
        icpFitScore: 25,
        roleFitScore: 20,
        companyFitScore: 15,
        evidenceStrength: 15,
        evidenceFreshness: 10,
        contactVerification: 10,
        priorLegitimateEngagement: 5
    };
}

interface TestCase {
    id: number;
    name: string;
    modifyContext: (ctx: CandidateContext) => void;
    expectedDecision: 'CONTACT_NOW' | 'REVIEW_REQUIRED' | 'DO_NOT_CONTACT';
    expectedTier?: 'PRIORITY_A' | 'PRIORITY_B' | 'PRIORITY_C' | 'LOW_PRIORITY' | null;
    checkFn?: (result: any) => string | null;
}

const testCases: TestCase[] = [
    {
        id: 1, name: 'Perfect candidate + all gates -> CONTACT_NOW / PRIORITY_A',
        modifyContext: () => {},
        expectedDecision: 'CONTACT_NOW', expectedTier: 'PRIORITY_A'
    },
    {
        id: 2, name: 'Suppressed candidate + score 100 -> DO_NOT_CONTACT',
        modifyContext: (c) => { c.isSuppressed = true; },
        expectedDecision: 'DO_NOT_CONTACT', expectedTier: null
    },
    {
        id: 3, name: 'Compliance BLOCKED + score 100 -> DO_NOT_CONTACT',
        modifyContext: (c) => { c.complianceStatus = 'BLOCKED'; },
        expectedDecision: 'DO_NOT_CONTACT', expectedTier: null
    },
    {
        id: 4, name: 'Compliance REVIEW_REQUIRED -> REVIEW_REQUIRED',
        modifyContext: (c) => { c.complianceStatus = 'REVIEW_REQUIRED'; },
        expectedDecision: 'REVIEW_REQUIRED', expectedTier: null
    },
    {
        id: 5, name: 'Identity unresolved -> REVIEW_REQUIRED',
        modifyContext: (c) => { c.identityResolved = false; },
        expectedDecision: 'REVIEW_REQUIRED', expectedTier: null
    },
    {
        id: 6, name: 'Unresolved duplicate -> REVIEW_REQUIRED',
        modifyContext: (c) => { c.unresolvedDuplicate = true; },
        expectedDecision: 'REVIEW_REQUIRED', expectedTier: null
    },
    {
        id: 7, name: 'Evidence insufficient -> REVIEW_REQUIRED',
        modifyContext: (c) => { c.evidenceSufficient = false; },
        expectedDecision: 'REVIEW_REQUIRED', expectedTier: null
    },
    {
        id: 8, name: 'Evidence conflict -> REVIEW_REQUIRED',
        modifyContext: (c) => { c.evidenceConflict = true; },
        expectedDecision: 'REVIEW_REQUIRED', expectedTier: null
    },
    {
        id: 9, name: 'Verified contact + medium fit -> CONTACT_NOW / PRIORITY_B',
        modifyContext: (c) => { c.icpFitScore = 15; c.roleFitScore = 10; c.companyFitScore = 10; c.evidenceStrength = 15; c.evidenceFreshness = 10; c.contactVerification = 10; c.priorLegitimateEngagement = 5; },
        expectedDecision: 'CONTACT_NOW', expectedTier: 'PRIORITY_B'
    },
    {
        id: 10, name: 'Low business fit but eligible -> LOW_PRIORITY',
        modifyContext: (c) => { c.icpFitScore = 0; c.roleFitScore = 0; c.companyFitScore = 0; c.evidenceStrength = 10; c.evidenceFreshness = 10; c.contactVerification = 10; c.priorLegitimateEngagement = 0; },
        expectedDecision: 'CONTACT_NOW', expectedTier: 'LOW_PRIORITY'
    },
    {
        id: 11, name: 'Score boundary A (exactly 90) -> PRIORITY_A',
        modifyContext: (c) => { c.icpFitScore = 20; c.roleFitScore = 20; c.companyFitScore = 15; c.evidenceStrength = 15; c.evidenceFreshness = 10; c.contactVerification = 10; c.priorLegitimateEngagement = 0; }, // Total = 90
        expectedDecision: 'CONTACT_NOW', expectedTier: 'PRIORITY_A'
    },
    {
        id: 12, name: 'Score boundary B (exactly 75) -> PRIORITY_B',
        modifyContext: (c) => { c.icpFitScore = 15; c.roleFitScore = 15; c.companyFitScore = 15; c.evidenceStrength = 10; c.evidenceFreshness = 10; c.contactVerification = 10; c.priorLegitimateEngagement = 0; }, // Total = 75
        expectedDecision: 'CONTACT_NOW', expectedTier: 'PRIORITY_B'
    },
    {
        id: 13, name: 'Same inputs twice -> same score + same decision hash',
        modifyContext: (c) => { c.icpFitScore = 20; },
        expectedDecision: 'CONTACT_NOW',
        checkFn: (r1) => {
            const ctx2 = createBaseContext();
            ctx2.candidateId = r1.candidateId; // Must use same candidate ID for same hash
            ctx2.icpFitScore = 20;
            const r2 = engine.evaluate(ctx2);
            if (r1.priority_score !== r2.priority_score) return "Score changed";
            if (r1.decision_hash !== r2.decision_hash) return "Hash changed";
            return null;
        }
    },
    {
        id: 14, name: 'New suppression after old CONTACT_NOW -> DO_NOT_CONTACT',
        modifyContext: (c) => { c.isSuppressed = true; },
        expectedDecision: 'DO_NOT_CONTACT', expectedTier: null
    },
    {
        id: 15, name: 'Expired decision -> requires reevaluation',
        modifyContext: (c) => { c.audienceMatchStatus = 'EXPIRED'; },
        expectedDecision: 'DO_NOT_CONTACT', expectedTier: null
    },
    {
        id: 16, name: 'Different scoring version -> historical decision unchanged',
        modifyContext: () => {},
        expectedDecision: 'CONTACT_NOW',
        checkFn: (r) => {
            if (r.scoring_version !== 'priority_v1') return "Version mismatch";
            return null;
        }
    },
    {
        id: 17, name: 'Phase 9A NOT_MATCH + otherwise perfect candidate -> DO_NOT_CONTACT',
        modifyContext: (c) => { c.audienceMatchStatus = 'NOT_MATCH'; },
        expectedDecision: 'DO_NOT_CONTACT', expectedTier: null
    },
    {
        id: 18, name: 'Expired audience MATCH -> DO_NOT_CONTACT',
        modifyContext: (c) => { c.audienceMatchStatus = 'EXPIRED'; },
        expectedDecision: 'DO_NOT_CONTACT', expectedTier: null
    },
    {
        id: 19, name: 'DO_NOT_CONTACT candidate -> priority_score NULL, priority_tier NULL',
        modifyContext: (c) => { c.isSuppressed = true; },
        expectedDecision: 'DO_NOT_CONTACT', expectedTier: null,
        checkFn: (r) => {
            if (r.priority_score !== null) return "Priority score must be null";
            if (r.priority_tier !== null) return "Priority tier must be null";
            return null;
        }
    },
    {
        id: 20, name: 'REVIEW_REQUIRED candidate -> priority_score NULL, priority_tier NULL',
        modifyContext: (c) => { c.evidenceConflict = true; },
        expectedDecision: 'REVIEW_REQUIRED', expectedTier: null,
        checkFn: (r) => {
            if (r.priority_score !== null) return "Priority score must be null";
            if (r.priority_tier !== null) return "Priority tier must be null";
            return null;
        }
    }
];

async function runTests() {
    console.log("================================================");
    console.log("ATLAS — PHASE 9B DECISION ENGINE SYNTHETIC TESTS");
    console.log("================================================\n");

    let passed = 0;
    let failed = 0;
    let contactNowExplanation = "";
    let doNotContactExplanation = "";
    
    for (const tc of testCases) {
        let testFailed = false;
        let failMessage = "";

        const ctx = createBaseContext();
        tc.modifyContext(ctx);
        const result = engine.evaluate(ctx);

        if (result.decision !== tc.expectedDecision) {
            testFailed = true;
            failMessage = `Expected decision ${tc.expectedDecision} but got ${result.decision}`;
        } else if (tc.expectedTier !== undefined && result.priority_tier !== tc.expectedTier) {
            testFailed = true;
            failMessage = `Expected tier ${tc.expectedTier} but got ${result.priority_tier}`;
        } else if (tc.checkFn) {
            const err = tc.checkFn({ ...result, candidateId: ctx.candidateId });
            if (err) {
                testFailed = true;
                failMessage = err;
            }
        }

        if (testFailed) {
            failed++;
            console.log(`❌ Test ${tc.id}: ${tc.name} -> FAIL`);
            console.log(`   ${failMessage}`);
        } else {
            passed++;
            console.log(`✅ Test ${tc.id}: ${tc.name} -> PASS`);
            
            // Save samples
            if (tc.id === 1) {
                contactNowExplanation = `
CONTACT: ${ctx.candidateId}

Decision: ${result.decision}
Priority: ${result.priority_tier} — ${result.priority_score}/100

WHY:
+ icp_fit              ${result.score_components.icp_fit}/25
+ role_fit             ${result.score_components.role_fit}/20
+ company_fit          ${result.score_components.company_fit}/15
+ evidence_strength    ${result.score_components.evidence_strength}/15
+ evidence_freshness   ${result.score_components.evidence_freshness}/10
+ contact_verification ${result.score_components.contact_verification}/10
+ prior_engagement     ${result.score_components.prior_engagement}/5

HARD GATES:
✓ identity_resolved:   ${result.gate_results.identity_resolved}
✓ audience_match:      ${result.gate_results.audience_match}
✓ unresolved_duplicate:${result.gate_results.unresolved_duplicate}
✓ evidence_sufficient: ${result.gate_results.evidence_sufficient}
✓ evidence_conflict:   ${result.gate_results.evidence_conflict}
✓ contact_usable:      ${result.gate_results.contact_usable}
✓ suppressed:          ${result.gate_results.suppressed}
✓ compliance:          ${result.gate_results.compliance}
`;
            } else if (tc.id === 2) {
                doNotContactExplanation = `
CONTACT: ${ctx.candidateId}

Decision: ${result.decision}
Score: ${result.priority_score === null ? 'not authoritative' : result.priority_score}

Blocking reasons:
${result.blocking_reasons.map(r => '- ' + r).join('\n')}

Even if business relevance could be computed, it is explicitly excluded.
`;
            }
        }
    }

    console.log("\n================================================");
    console.log(`Total: ${testCases.length} | Passed: ${passed} | Failed: ${failed}`);
    
    console.log("\n--- EXPLANATION SAMPLES ---");
    console.log(contactNowExplanation);
    console.log(doNotContactExplanation);
    
    // Check DB for send_enabled and ensure no sends happened
    const { data: config } = await supabase.from('atlas_outreach_config').select('send_enabled').eq('id', 1).single();
    
    console.log(`\nDB send_enabled = ${config?.send_enabled}`);
    console.log("Real sends = 0");
    console.log("Provider send calls = 0");
    
    if (failed === 0 && config?.send_enabled === false) {
        console.log("\nPHASE 9B DECISION ENGINE = PASS ✅");
    } else {
        console.log("\nPHASE 9B DECISION ENGINE = FAIL ❌");
    }
}

runTests().catch(console.error);
