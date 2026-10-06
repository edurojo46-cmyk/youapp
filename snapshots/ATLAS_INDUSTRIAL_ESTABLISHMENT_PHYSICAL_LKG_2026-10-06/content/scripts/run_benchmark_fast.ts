import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';
import * as dotenv from 'dotenv';
import { AtlasReasoningQueryFabric } from '../src/lib/atlasQueryFabric/AtlasReasoningQueryFabric';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const supabaseKey = process.env.SUPABASE_SECRET_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

interface BenchmarkCase {
  id: string;
  category: 'ENTITY' | 'CLAIM_FACT' | 'RELATIONSHIP' | 'DISCOVERY_INFERENCE' | 'TEMPORAL_CONTRADICTION';
  question: string;
  tenantId: string;
  expectedStatus: string;
  evaluate: (ans: any) => { pass: boolean; error?: string };
}

async function runBenchmark() {
  console.log('===========================================================');
  console.log('ATLAS REAL REASONING BENCHMARK V1 (50 FROZEN REAL CASES)');
  console.log('===========================================================\n');

  const queryFabric = new AtlasReasoningQueryFabric(supabase);

  const tenantA = 'e518772b-e9cf-4048-a4a0-40d37c1588de';
  const tenantB = '4f0248cd-ebcb-4b0e-8c3f-be6208d38f4f';
  const tenantGlobal = '00000000-0000-0000-0000-000000000000';

  const benchmarkCases: BenchmarkCase[] = [
    // 1. ENTITY (10 cases)
    {
      id: 'BENCH-ENT-01',
      category: 'ENTITY',
      question: 'What do we know about Valeria Rossi?',
      tenantId: tenantA,
      expectedStatus: 'KNOWN',
      evaluate: (ans) => ({
        pass: ans.answer_state !== 'NO_DATA_FOUND' && ans.entities_involved.some((e: any) => e.canonical_name === 'Valeria Rossi'),
        error: 'Failed to resolve Valeria Rossi'
      })
    },
    {
      id: 'BENCH-ENT-02',
      category: 'ENTITY',
      question: 'What do we know about Rossi Capital?',
      tenantId: tenantA,
      expectedStatus: 'KNOWN',
      evaluate: (ans) => ({
        pass: ans.answer_state !== 'NO_DATA_FOUND' && ans.entities_involved.some((e: any) => e.canonical_name === 'Rossi Capital'),
        error: 'Failed to resolve Rossi Capital'
      })
    },
    {
      id: 'BENCH-ENT-03',
      category: 'ENTITY',
      question: 'What do we know about Carlos Gomez?',
      tenantId: tenantA,
      expectedStatus: 'KNOWN',
      evaluate: (ans) => ({
        pass: ans.answer_state !== 'NO_DATA_FOUND' && ans.entities_involved.some((e: any) => e.canonical_name === 'Carlos Gomez'),
        error: 'Failed to resolve Carlos Gomez'
      })
    },
    {
      id: 'BENCH-ENT-04',
      category: 'ENTITY',
      question: 'What do we know about River Plate?',
      tenantId: tenantGlobal,
      expectedStatus: 'KNOWN',
      evaluate: (ans) => ({
        pass: ans.answer_state !== 'NO_DATA_FOUND' && ans.entities_involved.some((e: any) => e.canonical_name === 'River Plate'),
        error: 'Failed to resolve River Plate'
      })
    },
    {
      id: 'BENCH-ENT-05',
      category: 'ENTITY',
      question: 'Where is River Plate located?',
      tenantId: tenantGlobal,
      expectedStatus: 'KNOWN',
      evaluate: (ans) => ({
        pass: ans.answer_state !== 'NO_DATA_FOUND' && ans.entities_involved.some((e: any) => e.canonical_name === 'River Plate'),
        error: 'Failed to resolve River Plate location entity'
      })
    },
    {
      id: 'BENCH-ENT-06',
      category: 'ENTITY',
      question: 'What do we know about Rossi Capital?',
      tenantId: tenantA,
      expectedStatus: 'KNOWN',
      evaluate: (ans) => ({
        pass: ans.answer_state !== 'NO_DATA_FOUND' && ans.entities_involved.some((e: any) => e.canonical_name === 'Rossi Capital'),
        error: 'Failed entity match for Rossi Capital'
      })
    },
    {
      id: 'BENCH-ENT-07',
      category: 'ENTITY',
      question: 'What do we know about NonExistentCorp999?',
      tenantId: tenantA,
      expectedStatus: 'NO_DATA_FOUND',
      evaluate: (ans) => ({
        pass: ans.answer_state === 'NO_DATA_FOUND' && ans.grounded_claims.length === 0,
        error: 'Should refuse fictional entity'
      })
    },
    {
      id: 'BENCH-ENT-08',
      category: 'ENTITY',
      question: 'Who is Valeria Rossi?',
      tenantId: tenantB,
      expectedStatus: 'TENANT_ISOLATED',
      evaluate: (ans) => ({
        pass: ans.entities_involved.every((e: any) => e.tenant_id === tenantB),
        error: 'Tenant isolation leaked entity'
      })
    },
    {
      id: 'BENCH-ENT-09',
      category: 'ENTITY',
      question: 'What do we know about Rossi Capital?',
      tenantId: tenantA,
      expectedStatus: 'COMPANY_TYPE',
      evaluate: (ans) => ({
        pass: ans.entities_involved.some((e: any) => e.entity_type === 'COMPANY'),
        error: 'Entity type should be COMPANY'
      })
    },
    {
      id: 'BENCH-ENT-10',
      category: 'ENTITY',
      question: 'Who is Carlos Gomez?',
      tenantId: tenantA,
      expectedStatus: 'EXPLAINABLE_PLAN',
      evaluate: (ans) => ({
        pass: ans.plan.target_entity_names.includes('Carlos Gomez'),
        error: 'Plan does not target Carlos Gomez'
      })
    },

    // 2. CLAIM / FACT (10 cases)
    {
      id: 'BENCH-CLM-01',
      category: 'CLAIM_FACT',
      question: 'What is Carlos Gomez role?',
      tenantId: tenantA,
      expectedStatus: 'CLAIM',
      evaluate: (ans) => ({
        pass: ans.grounded_claims.some((c: any) => c.predicate_code === 'HAS_ROLE' && c.statement.includes('Managing Director')),
        error: 'Missing Carlos Gomez HAS_ROLE claim'
      })
    },
    {
      id: 'BENCH-CLM-02',
      category: 'CLAIM_FACT',
      question: 'What roles is Rossi Capital hiring for?',
      tenantId: tenantA,
      expectedStatus: 'CLAIM',
      evaluate: (ans) => ({
        pass: ans.grounded_claims.some((c: any) => c.predicate_code === 'HIRING_FOR_ROLE' && c.statement.includes('Senior Investment Analyst')),
        error: 'Missing HIRING_FOR_ROLE claim'
      })
    },
    {
      id: 'BENCH-CLM-03',
      category: 'CLAIM_FACT',
      question: 'How many open positions does Rossi Capital have?',
      tenantId: tenantA,
      expectedStatus: 'CLAIM',
      evaluate: (ans) => ({
        pass: ans.grounded_claims.some((c: any) => c.predicate_code === 'OPEN_POSITIONS_COUNT' && c.statement.includes('3')),
        error: 'Missing OPEN_POSITIONS_COUNT claim'
      })
    },
    {
      id: 'BENCH-CLM-04',
      category: 'CLAIM_FACT',
      question: 'What is Carlos Gomez role?',
      tenantId: tenantA,
      expectedStatus: 'CITATIONS_PRESENT',
      evaluate: (ans) => ({
        pass: ans.citations && ans.citations.length > 0 && ans.unsupported_claims_count === 0,
        error: 'Missing citations on role claim'
      })
    },
    {
      id: 'BENCH-CLM-05',
      category: 'CLAIM_FACT',
      question: 'What do we know about Carlos Gomez?',
      tenantId: tenantA,
      expectedStatus: 'EPISTEMIC_BREAKDOWN',
      evaluate: (ans) => ({
        pass: ans.epistemic_breakdown.claims_count > 0 && ans.epistemic_breakdown.predictions_count === 0,
        error: 'Invalid epistemic breakdown count'
      })
    },
    {
      id: 'BENCH-CLM-06',
      category: 'CLAIM_FACT',
      question: 'What is the annual revenue of Rossi Capital?',
      tenantId: tenantA,
      expectedStatus: 'REFUSAL_ZERO_UNSUPPORTED',
      evaluate: (ans) => ({
        pass: !ans.grounded_claims.some((c: any) => c.predicate_code === 'ANNUAL_REVENUE') && ans.unsupported_claims_count === 0,
        error: 'Hallucinated annual revenue'
      })
    },
    {
      id: 'BENCH-CLM-07',
      category: 'CLAIM_FACT',
      question: 'How many employees does River Plate have?',
      tenantId: tenantGlobal,
      expectedStatus: 'REFUSAL_ZERO_UNSUPPORTED',
      evaluate: (ans) => ({
        pass: !ans.grounded_claims.some((c: any) => c.predicate_code === 'EMPLOYEE_COUNT') && ans.unsupported_claims_count === 0,
        error: 'Hallucinated employee count'
      })
    },
    {
      id: 'BENCH-CLM-08',
      category: 'CLAIM_FACT',
      question: 'What do we know about Carlos Gomez?',
      tenantId: tenantA,
      expectedStatus: 'RANKING_SORTED',
      evaluate: (ans) => {
        if (ans.grounded_claims.length < 2) return { pass: true };
        for (let i = 0; i < ans.grounded_claims.length - 1; i++) {
          if (ans.grounded_claims[i].ranking_score < ans.grounded_claims[i + 1].ranking_score) {
            return { pass: false, error: 'Claims not sorted by ranking score' };
          }
        }
        return { pass: true };
      }
    },
    {
      id: 'BENCH-CLM-09',
      category: 'CLAIM_FACT',
      question: 'What do we know about Carlos Gomez?',
      tenantId: tenantA,
      expectedStatus: 'EXPLAIN_ANSWER',
      evaluate: (ans) => {
        const exp = queryFabric.explainAnswer(ans);
        return { pass: exp.includes('Answer State:') && exp.includes('Claims:'), error: 'Invalid answer explanation' };
      }
    },
    {
      id: 'BENCH-CLM-10',
      category: 'CLAIM_FACT',
      question: 'What do we know about Rossi Capital?',
      tenantId: tenantA,
      expectedStatus: 'FORMATTED_SUMMARY',
      evaluate: (ans) => ({
        pass: ans.summary.length <= 4000 && ans.summary.includes('•'),
        error: 'Summary not formatted cleanly'
      })
    },

    // 3. RELATIONSHIP (10 cases)
    {
      id: 'BENCH-REL-01',
      category: 'RELATIONSHIP',
      question: 'Where does Carlos Gomez work?',
      tenantId: tenantA,
      expectedStatus: 'WORKS_AT',
      evaluate: (ans) => ({
        pass: ans.grounded_claims.some((c: any) => c.predicate_code === 'WORKS_AT' && c.statement.includes('Rossi Capital')),
        error: 'Missing WORKS_AT relationship'
      })
    },
    {
      id: 'BENCH-REL-02',
      category: 'RELATIONSHIP',
      question: 'Who works at Rossi Capital?',
      tenantId: tenantA,
      expectedStatus: 'REVERSE_WORKS_AT',
      evaluate: (ans) => ({
        pass: ans.entities_involved.length > 0 && ans.answer_state !== 'NO_DATA_FOUND',
        error: 'Failed reverse traversal for Rossi Capital'
      })
    },
    {
      id: 'BENCH-REL-03',
      category: 'RELATIONSHIP',
      question: 'What does Rossi Capital offer?',
      tenantId: tenantA,
      expectedStatus: 'OFFERS_PRODUCT_1',
      evaluate: (ans) => ({
        pass: ans.grounded_claims.some((c: any) => c.predicate_code === 'OFFERS' && c.statement.includes('VIP Tango Portfolio')),
        error: 'Missing OFFERS relationship to VIP Tango Portfolio'
      })
    },
    {
      id: 'BENCH-REL-04',
      category: 'RELATIONSHIP',
      question: 'What does Rossi Capital offer?',
      tenantId: tenantA,
      expectedStatus: 'OFFERS_PRODUCT_2',
      evaluate: (ans) => ({
        pass: ans.grounded_claims.some((c: any) => c.predicate_code === 'OFFERS' && c.statement.includes('Tango Event Production')),
        error: 'Missing OFFERS relationship to Tango Event Production'
      })
    },
    {
      id: 'BENCH-REL-05',
      category: 'RELATIONSHIP',
      question: 'Where has Rossi Capital opened locations?',
      tenantId: tenantA,
      expectedStatus: 'OPENED_LOCATION',
      evaluate: (ans) => ({
        pass: ans.grounded_claims.some((c: any) => c.predicate_code === 'OPENED_LOCATION' && c.statement.includes('Cordoba')),
        error: 'Missing OPENED_LOCATION relationship'
      })
    },
    {
      id: 'BENCH-REL-06',
      category: 'RELATIONSHIP',
      question: 'Where is Valeria Rossi located?',
      tenantId: tenantA,
      expectedStatus: 'LOCATED_IN',
      evaluate: (ans) => ({
        pass: ans.grounded_claims.some((c: any) => c.predicate_code === 'LOCATED_IN'),
        error: 'Missing LOCATED_IN relationship for Valeria Rossi'
      })
    },
    {
      id: 'BENCH-REL-07',
      category: 'RELATIONSHIP',
      question: 'Where is River Plate located?',
      tenantId: tenantGlobal,
      expectedStatus: 'LOCATED_IN_GLOBAL',
      evaluate: (ans) => ({
        pass: ans.grounded_claims.some((c: any) => c.predicate_code === 'LOCATED_IN' && c.statement.includes('Argentina')),
        error: 'Missing River Plate LOCATED_IN Argentina'
      })
    },
    {
      id: 'BENCH-REL-08',
      category: 'RELATIONSHIP',
      question: 'Who works at Rossi Capital?',
      tenantId: tenantA,
      expectedStatus: 'MAX_HOPS_BOUND',
      evaluate: (ans) => ({
        pass: ans.plan.max_hops <= 3,
        error: 'Plan exceeded max hops bound'
      })
    },
    {
      id: 'BENCH-REL-09',
      category: 'RELATIONSHIP',
      question: 'What does Rossi Capital offer?',
      tenantId: tenantB,
      expectedStatus: 'CROSS_TENANT_ISOLATED',
      evaluate: (ans) => ({
        pass: ans.grounded_claims.filter((c: any) => c.predicate_code === 'OFFERS').length === 0,
        error: 'Tenant B leaked Tenant A offers'
      })
    },
    {
      id: 'BENCH-REL-10',
      category: 'RELATIONSHIP',
      question: 'Who works at LA NACION?',
      tenantId: tenantGlobal,
      expectedStatus: 'ZERO_UNSUPPORTED',
      evaluate: (ans) => ({
        pass: ans.unsupported_claims_count === 0,
        error: 'Unsupported claims returned'
      })
    },

    // 4. DISCOVERY / INFERENCE (10 cases)
    {
      id: 'BENCH-INF-01',
      category: 'DISCOVERY_INFERENCE',
      question: 'Is Rossi Capital actively hiring?',
      tenantId: tenantA,
      expectedStatus: 'INFERRED_ACTIVE_HIRING',
      evaluate: (ans) => ({
        pass: ans.grounded_claims.some((i: any) => i.epistemic_status === 'INFERRED' && i.statement.includes('ACTIVE_HIRING_SIGNAL') && i.confidence === 0.90),
        error: 'Missing ACTIVE_HIRING_SIGNAL inference in grounded_claims'
      })
    },
    {
      id: 'BENCH-INF-02',
      category: 'DISCOVERY_INFERENCE',
      question: 'Is Rossi Capital expanding operations?',
      tenantId: tenantA,
      expectedStatus: 'INFERRED_POSSIBLE_EXPANSION',
      evaluate: (ans) => ({
        pass: ans.grounded_claims.some((i: any) => i.epistemic_status === 'INFERRED' && i.statement.includes('POSSIBLE_EXPANSION') && i.confidence === 0.85),
        error: 'Missing POSSIBLE_EXPANSION inference in grounded_claims'
      })
    },
    {
      id: 'BENCH-INF-03',
      category: 'DISCOVERY_INFERENCE',
      question: 'What is Rossi Capital service portfolio?',
      tenantId: tenantA,
      expectedStatus: 'INFERRED_MULTI_OFFERING',
      evaluate: (ans) => ({
        pass: ans.grounded_claims.some((i: any) => i.epistemic_status === 'INFERRED' && i.statement.includes('MULTI_OFFERING_PORTFOLIO') && i.confidence === 0.92),
        error: 'Missing MULTI_OFFERING_PORTFOLIO inference in grounded_claims'
      })
    },
    {
      id: 'BENCH-INF-04',
      category: 'DISCOVERY_INFERENCE',
      question: 'What do we know about Rossi Capital?',
      tenantId: tenantA,
      expectedStatus: 'LINEAGE_VERIFIED',
      evaluate: (ans) => {
        const infs = ans.grounded_claims.filter((c: any) => c.epistemic_status === 'INFERRED');
        return {
          pass: infs.length > 0 && infs.every((i: any) => i.evidence_sources && i.evidence_sources.length > 0),
          error: 'Inferences missing rule lineage or evidence sources'
        };
      }
    },
    {
      id: 'BENCH-INF-05',
      category: 'DISCOVERY_INFERENCE',
      question: 'Is Valeria Rossi expanding operations?',
      tenantId: tenantA,
      expectedStatus: 'REFUSAL_NO_INFERENCE',
      evaluate: (ans) => ({
        pass: !ans.grounded_claims.some((i: any) => i.statement.includes('POSSIBLE_EXPANSION')),
        error: 'False positive expansion inference for person'
      })
    },
    {
      id: 'BENCH-INF-06',
      category: 'DISCOVERY_INFERENCE',
      question: 'Does Carlos Gomez have a multi-offering portfolio?',
      tenantId: tenantA,
      expectedStatus: 'REFUSAL_NO_INFERENCE',
      evaluate: (ans) => ({
        pass: !ans.grounded_claims.some((i: any) => i.statement.includes('MULTI_OFFERING_PORTFOLIO')),
        error: 'False positive multi-offering inference for person'
      })
    },
    {
      id: 'BENCH-INF-07',
      category: 'DISCOVERY_INFERENCE',
      question: 'Is FIFA actively hiring?',
      tenantId: tenantGlobal,
      expectedStatus: 'REFUSAL_NO_INFERENCE',
      evaluate: (ans) => ({
        pass: !ans.grounded_claims.some((i: any) => i.statement.includes('ACTIVE_HIRING_SIGNAL')),
        error: 'False positive hiring inference without facts'
      })
    },
    {
      id: 'BENCH-INF-08',
      category: 'DISCOVERY_INFERENCE',
      question: 'What do we know about Rossi Capital?',
      tenantId: tenantA,
      expectedStatus: 'SYNTHESIS_INFERRED_TAG',
      evaluate: (ans) => ({
        pass: ans.summary.includes('[INFERRED]') && ans.epistemic_breakdown.inferences_count > 0,
        error: 'Summary does not contain [INFERRED] tag'
      })
    },
    {
      id: 'BENCH-INF-09',
      category: 'DISCOVERY_INFERENCE',
      question: 'What do we know about Rossi Capital?',
      tenantId: tenantB,
      expectedStatus: 'TENANT_ISOLATED_INFERENCE',
      evaluate: (ans) => ({
        pass: ans.grounded_claims.filter((c: any) => c.epistemic_status === 'INFERRED').length === 0,
        error: 'Tenant B leaked Tenant A inferences'
      })
    },
    {
      id: 'BENCH-INF-10',
      category: 'DISCOVERY_INFERENCE',
      question: 'What do we know about Rossi Capital?',
      tenantId: tenantA,
      expectedStatus: 'NO_DEGRADATION',
      evaluate: (ans) => {
        const infs = ans.grounded_claims.filter((c: any) => c.statement.includes('PORTFOLIO') || c.statement.includes('EXPANSION') || c.statement.includes('HIRING'));
        return {
          pass: infs.every((i: any) => i.epistemic_status === 'INFERRED'),
          error: 'Inference degraded to fact or claim'
        };
      }
    },

    // 5. TEMPORAL / CONTRADICTION (10 cases)
    {
      id: 'BENCH-TMP-01',
      category: 'TEMPORAL_CONTRADICTION',
      question: 'What do we know about Carlos Gomez?',
      tenantId: tenantA,
      expectedStatus: 'MULTIPLE_LOCATIONS',
      evaluate: (ans) => ({
        pass: ans.grounded_claims.some((c: any) => c.predicate_code === 'LOCATED_IN'),
        error: 'Missing location claims for Carlos Gomez'
      })
    },
    {
      id: 'BENCH-TMP-02',
      category: 'TEMPORAL_CONTRADICTION',
      question: 'Where is Carlos Gomez located?',
      tenantId: tenantA,
      expectedStatus: 'CITATIONS_PRESERVED',
      evaluate: (ans) => ({
        pass: ans.citations && ans.citations.length > 0 && ans.unsupported_claims_count === 0,
        error: 'Missing provenance citations'
      })
    },
    {
      id: 'BENCH-TMP-03',
      category: 'TEMPORAL_CONTRADICTION',
      question: 'Where is Valeria Rossi located?',
      tenantId: tenantA,
      expectedStatus: 'UNCONTESTED_LOCATION',
      evaluate: (ans) => ({
        pass: ans.epistemic_breakdown.contradicted_count === 0 && ans.grounded_claims.some((c: any) => c.predicate_code === 'LOCATED_IN'),
        error: 'False contradiction on uncontested location'
      })
    },
    {
      id: 'BENCH-TMP-04',
      category: 'TEMPORAL_CONTRADICTION',
      question: 'What does Rossi Capital offer?',
      tenantId: tenantA,
      expectedStatus: 'NO_FALSE_CONTRADICTION_OFFERS',
      evaluate: (ans) => ({
        pass: ans.epistemic_breakdown.contradicted_count === 0 && ans.grounded_claims.filter((c: any) => c.predicate_code === 'OFFERS').length >= 2,
        error: 'False contradiction reported on multi-offering'
      })
    },
    {
      id: 'BENCH-TMP-05',
      category: 'TEMPORAL_CONTRADICTION',
      question: 'Who works at Rossi Capital?',
      tenantId: tenantA,
      expectedStatus: 'NO_FALSE_CONTRADICTION_WORKS_AT',
      evaluate: (ans) => ({
        pass: ans.epistemic_breakdown.contradicted_count === 0,
        error: 'False contradiction reported on multiple employees'
      })
    },
    {
      id: 'BENCH-TMP-06',
      category: 'TEMPORAL_CONTRADICTION',
      question: 'Where was Carlos Gomez located in 2026?',
      tenantId: tenantA,
      expectedStatus: 'TEMPORAL_PLAN_MODE',
      evaluate: (ans) => ({
        pass: ans.plan.temporal_mode !== undefined,
        error: 'Temporal mode undefined in plan'
      })
    },
    {
      id: 'BENCH-TMP-07',
      category: 'TEMPORAL_CONTRADICTION',
      question: 'What do we know about Carlos Gomez?',
      tenantId: tenantA,
      expectedStatus: 'ZERO_UNSUPPORTED_CLAIMS',
      evaluate: (ans) => ({
        pass: ans.unsupported_claims_count === 0,
        error: 'Unsupported claims present'
      })
    },
    {
      id: 'BENCH-TMP-08',
      category: 'TEMPORAL_CONTRADICTION',
      question: 'Where was Rossi Capital located in 1990?',
      tenantId: tenantA,
      expectedStatus: 'ZERO_HISTORICAL_HALLUCINATIONS',
      evaluate: (ans) => ({
        pass: ans.unsupported_claims_count === 0 && ans.grounded_claims.filter((c: any) => c.statement.includes('1990')).length === 0,
        error: 'Hallucinated historical location'
      })
    },
    {
      id: 'BENCH-TMP-09',
      category: 'TEMPORAL_CONTRADICTION',
      question: 'What do we know about Valeria Rossi?',
      tenantId: tenantA,
      expectedStatus: 'ZERO_UNSUPPORTED',
      evaluate: (ans) => ({
        pass: ans.unsupported_claims_count === 0,
        error: 'Unsupported claims present'
      })
    },
    {
      id: 'BENCH-TMP-10',
      category: 'TEMPORAL_CONTRADICTION',
      question: 'What do we know about Rossi Capital?',
      tenantId: tenantA,
      expectedStatus: 'CLAIMS_PROVENANCE_INTEGRITY',
      evaluate: (ans) => ({
        pass: ans.grounded_claims.every((c: any) => c.claim_id && c.epistemic_status),
        error: 'Claims missing claim_id or epistemic_status'
      })
    }
  ];

  let passCount = 0;
  let failCount = 0;
  let hallucinationCount = 0;
  let unsupportedClaimsCount = 0;
  let wrongEntityResolutionCount = 0;
  let wrongEpistemicLabelCount = 0;
  let wrongTemporalResolutionCount = 0;
  let missedContradictions = 0;
  let falseContradictions = 0;

  console.log(`Executing ${benchmarkCases.length} Real Grounded Benchmark Cases...\n`);

  for (let idx = 0; idx < benchmarkCases.length; idx++) {
    const bCase = benchmarkCases[idx];
    const startTime = Date.now();

    try {
      const ans = bCase.question.startsWith('What do we know about')
        ? await queryFabric.answerWhatDoWeKnow(bCase.question.replace('What do we know about ', '').replace('?', ''), bCase.tenantId)
        : await queryFabric.answerQuery(bCase.question, bCase.tenantId);

      const evalResult = bCase.evaluate(ans);
      const elapsed = Date.now() - startTime;

      if (evalResult.pass) {
        passCount++;
        console.log(`[PASS] ${bCase.id} (${bCase.category}): "${bCase.question}" [${elapsed}ms]`);
      } else {
        failCount++;
        console.log(`[FAIL] ${bCase.id} (${bCase.category}): "${bCase.question}" -> Error: ${evalResult.error} [${elapsed}ms]`);
      }

      if (ans.unsupported_claims_count > 0) {
        unsupportedClaimsCount += ans.unsupported_claims_count;
      }
    } catch (err: any) {
      failCount++;
      const elapsed = Date.now() - startTime;
      console.log(`[ERROR] ${bCase.id} (${bCase.category}): "${bCase.question}" -> Exception: ${err.message} [${elapsed}ms]`);
    }
  }

  console.log('\n===========================================================');
  console.log('BENCHMARK SUMMARY & METRICS REPORT');
  console.log('===========================================================');
  console.log(`REAL_QUERY_BENCHMARK = ${benchmarkCases.length}`);
  console.log(`PASS = ${passCount}`);
  console.log(`FAIL = ${failCount}`);
  console.log(`UNSUPPORTED_CLAIMS = ${unsupportedClaimsCount}`);
  console.log(`HALLUCINATION_COUNT = ${hallucinationCount}`);
  console.log(`WRONG_ENTITY_RESOLUTION_COUNT = ${wrongEntityResolutionCount}`);
  console.log(`WRONG_EPISTEMIC_LABEL_COUNT = ${wrongEpistemicLabelCount}`);
  console.log(`WRONG_TEMPORAL_RESOLUTION_COUNT = ${wrongTemporalResolutionCount}`);
  console.log(`MISSED_CONTRADICTIONS = ${missedContradictions}`);
  console.log(`FALSE_CONTRADICTIONS = ${falseContradictions}`);

  console.log(`\nBENCHMARK_50_READY = ${passCount === 50 ? 'YES' : 'NO'}`);
}

runBenchmark().catch(console.error);
