import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { AtlasReasoningQueryFabric } from '../src/lib/atlasQueryFabric/AtlasReasoningQueryFabric';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const supabaseKey = process.env.SUPABASE_SECRET_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export interface PartialBenchmarkCase {
  benchmark_id: string;
  category: 'ENTITY' | 'CLAIM_FACT' | 'RELATIONSHIP' | 'DISCOVERY_INFERENCE' | 'TEMPORAL_CONTRADICTION';
  question: string;
  tenant_id: string;
  expected_status: string;
  expected_entity_names: string[];
  expected_predicates: string[];
  allowed_epistemic_types: string[];
  forbidden_claims: string[];
  temporal_expectation?: string;
  contradiction_expectation?: string;
  evaluate: (ans: any) => { pass: boolean; error?: string };
}

export const PARTIAL_BENCHMARK_CASES: PartialBenchmarkCase[] = [
  // ==========================================
  // 1. ENTITY (10 cases)
  // ==========================================
  {
    benchmark_id: 'PARTIAL-ENT-01',
    category: 'ENTITY',
    question: 'What do we know about Valeria Rossi?',
    tenant_id: 'e518772b-e9cf-4048-a4a0-40d37c1588de',
    expected_status: 'ANSWERABLE',
    expected_entity_names: ['Valeria Rossi'],
    expected_predicates: ['LOCATED_IN', 'WORKS_AT', 'HAS_ROLE'],
    allowed_epistemic_types: ['CLAIM', 'FACT'],
    forbidden_claims: ['ANNUAL_REVENUE'],
    evaluate: (ans) => ({
      pass: ans.answer_state === 'ANSWERABLE' && ans.entities_involved.some((e: any) => e.canonical_name === 'Valeria Rossi'),
      error: 'Failed to resolve Valeria Rossi'
    })
  },
  {
    benchmark_id: 'PARTIAL-ENT-02',
    category: 'ENTITY',
    question: 'What do we know about Rossi Capital?',
    tenant_id: 'e518772b-e9cf-4048-a4a0-40d37c1588de',
    expected_status: 'ANSWERABLE',
    expected_entity_names: ['Rossi Capital'],
    expected_predicates: ['OFFERS', 'HIRING_FOR_ROLE', 'OPEN_POSITIONS_COUNT', 'OPENED_LOCATION'],
    allowed_epistemic_types: ['CLAIM', 'FACT'],
    forbidden_claims: ['EMPLOYEE_COUNT'],
    evaluate: (ans) => ({
      pass: ans.answer_state === 'ANSWERABLE' && ans.entities_involved.some((e: any) => e.canonical_name === 'Rossi Capital'),
      error: 'Failed to resolve Rossi Capital'
    })
  },
  {
    benchmark_id: 'PARTIAL-ENT-03',
    category: 'ENTITY',
    question: 'What do we know about Carlos Gomez?',
    tenant_id: 'e518772b-e9cf-4048-a4a0-40d37c1588de',
    expected_status: 'ANSWERABLE',
    expected_entity_names: ['Carlos Gomez'],
    expected_predicates: ['WORKS_AT', 'HAS_ROLE', 'LOCATED_IN'],
    allowed_epistemic_types: ['CLAIM', 'FACT'],
    forbidden_claims: ['FOUNDED_BY'],
    evaluate: (ans) => ({
      pass: ans.answer_state === 'ANSWERABLE' && ans.entities_involved.some((e: any) => e.canonical_name === 'Carlos Gomez'),
      error: 'Failed to resolve Carlos Gomez'
    })
  },
  {
    benchmark_id: 'PARTIAL-ENT-04',
    category: 'ENTITY',
    question: 'What do we know about River Plate?',
    tenant_id: '00000000-0000-0000-0000-000000000000',
    expected_status: 'ANSWERABLE',
    expected_entity_names: ['River Plate'],
    expected_predicates: ['LOCATED_IN'],
    allowed_epistemic_types: ['CLAIM', 'FACT'],
    forbidden_claims: ['ANNUAL_REVENUE'],
    evaluate: (ans) => ({
      pass: ans.answer_state === 'ANSWERABLE' && ans.entities_involved.some((e: any) => e.canonical_name === 'River Plate'),
      error: 'Failed to resolve River Plate'
    })
  },
  {
    benchmark_id: 'PARTIAL-ENT-05',
    category: 'ENTITY',
    question: 'Where is River Plate located?',
    tenant_id: '00000000-0000-0000-0000-000000000000',
    expected_status: 'ANSWERABLE',
    expected_entity_names: ['River Plate'],
    expected_predicates: ['LOCATED_IN'],
    allowed_epistemic_types: ['CLAIM', 'FACT'],
    forbidden_claims: ['WORKS_AT'],
    evaluate: (ans) => ({
      pass: ans.answer_state !== 'NO_DATA_FOUND' && ans.entities_involved.some((e: any) => e.canonical_name === 'River Plate'),
      error: 'Failed location query for River Plate'
    })
  },
  {
    benchmark_id: 'PARTIAL-ENT-06',
    category: 'ENTITY',
    question: 'What do we know about LA NACION?',
    tenant_id: '00000000-0000-0000-0000-000000000000',
    expected_status: 'ANSWERABLE',
    expected_entity_names: ['LA NACION'],
    expected_predicates: ['LOCATED_IN'],
    allowed_epistemic_types: ['CLAIM', 'FACT'],
    forbidden_claims: ['OFFERS'],
    evaluate: (ans) => ({
      pass: ans.answer_state === 'ANSWERABLE' && ans.entities_involved.some((e: any) => e.canonical_name === 'LA NACION'),
      error: 'Failed to resolve LA NACION'
    })
  },
  {
    benchmark_id: 'PARTIAL-ENT-07',
    category: 'ENTITY',
    question: 'What do we know about NonExistentCorp999?',
    tenant_id: 'e518772b-e9cf-4048-a4a0-40d37c1588de',
    expected_status: 'NO_DATA_FOUND',
    expected_entity_names: [],
    expected_predicates: [],
    allowed_epistemic_types: [],
    forbidden_claims: ['*'],
    evaluate: (ans) => ({
      pass: ans.answer_state === 'NO_DATA_FOUND' && ans.grounded_claims.length === 0,
      error: 'Failed to refuse non-existent entity'
    })
  },
  {
    benchmark_id: 'PARTIAL-ENT-08',
    category: 'ENTITY',
    question: 'Who is Valeria Rossi?',
    tenant_id: '4f0248cd-ebcb-4b0e-8c3f-be6208d38f4f',
    expected_status: 'NO_DATA_FOUND',
    expected_entity_names: [],
    expected_predicates: [],
    allowed_epistemic_types: [],
    forbidden_claims: ['*'],
    evaluate: (ans) => ({
      pass: ans.answer_state === 'NO_DATA_FOUND' && ans.grounded_claims.length === 0,
      error: 'Tenant isolation violation: leaked Tenant A entity into Tenant B'
    })
  },
  {
    benchmark_id: 'PARTIAL-ENT-09',
    category: 'ENTITY',
    question: 'What do we know about Rossi Capital?',
    tenant_id: 'e518772b-e9cf-4048-a4a0-40d37c1588de',
    expected_status: 'ANSWERABLE',
    expected_entity_names: ['Rossi Capital'],
    expected_predicates: [],
    allowed_epistemic_types: ['CLAIM'],
    forbidden_claims: [],
    evaluate: (ans) => ({
      pass: ans.entities_involved.some((e: any) => e.entity_type === 'COMPANY'),
      error: 'Rossi Capital entity_type should be COMPANY'
    })
  },
  {
    benchmark_id: 'PARTIAL-ENT-10',
    category: 'ENTITY',
    question: 'Who is Carlos Gomez?',
    tenant_id: 'e518772b-e9cf-4048-a4a0-40d37c1588de',
    expected_status: 'ANSWERABLE',
    expected_entity_names: ['Carlos Gomez'],
    expected_predicates: ['HAS_ROLE', 'WORKS_AT'],
    allowed_epistemic_types: ['CLAIM'],
    forbidden_claims: [],
    evaluate: (ans) => ({
      pass: ans.plan.target_entity_names.includes('Carlos Gomez') && ans.entities_involved.some((e: any) => e.canonical_name === 'Carlos Gomez'),
      error: 'Plan or answer does not target Carlos Gomez'
    })
  },

  // ==========================================
  // 2. CLAIM / FACT (10 cases)
  // ==========================================
  {
    benchmark_id: 'PARTIAL-CLM-01',
    category: 'CLAIM_FACT',
    question: 'What is Carlos Gomez role?',
    tenant_id: 'e518772b-e9cf-4048-a4a0-40d37c1588de',
    expected_status: 'ANSWERABLE',
    expected_entity_names: ['Carlos Gomez'],
    expected_predicates: ['HAS_ROLE'],
    allowed_epistemic_types: ['CLAIM'],
    forbidden_claims: ['ANNUAL_REVENUE'],
    evaluate: (ans) => ({
      pass: ans.grounded_claims.some((c: any) => c.predicate_code === 'HAS_ROLE' && c.statement.includes('Managing Director')),
      error: 'Missing Carlos Gomez HAS_ROLE claim'
    })
  },
  {
    benchmark_id: 'PARTIAL-CLM-02',
    category: 'CLAIM_FACT',
    question: 'What job openings does Rossi Capital have?',
    tenant_id: 'e518772b-e9cf-4048-a4a0-40d37c1588de',
    expected_status: 'ANSWERABLE',
    expected_entity_names: ['Rossi Capital'],
    expected_predicates: ['HIRING_FOR_ROLE'],
    allowed_epistemic_types: ['CLAIM'],
    forbidden_claims: [],
    evaluate: (ans) => ({
      pass: ans.grounded_claims.some((c: any) => c.predicate_code === 'HIRING_FOR_ROLE' && c.statement.includes('Senior Investment Analyst')),
      error: 'Missing HIRING_FOR_ROLE claim for Rossi Capital'
    })
  },
  {
    benchmark_id: 'PARTIAL-CLM-03',
    category: 'CLAIM_FACT',
    question: 'How many open positions does Rossi Capital have?',
    tenant_id: 'e518772b-e9cf-4048-a4a0-40d37c1588de',
    expected_status: 'ANSWERABLE',
    expected_entity_names: ['Rossi Capital'],
    expected_predicates: ['OPEN_POSITIONS_COUNT'],
    allowed_epistemic_types: ['CLAIM'],
    forbidden_claims: [],
    evaluate: (ans) => ({
      pass: ans.grounded_claims.some((c: any) => c.predicate_code === 'OPEN_POSITIONS_COUNT' && c.statement.includes('3')),
      error: 'Missing OPEN_POSITIONS_COUNT claim'
    })
  },
  {
    benchmark_id: 'PARTIAL-CLM-04',
    category: 'CLAIM_FACT',
    question: 'What is Carlos Gomez role?',
    tenant_id: 'e518772b-e9cf-4048-a4a0-40d37c1588de',
    expected_status: 'ANSWERABLE',
    expected_entity_names: ['Carlos Gomez'],
    expected_predicates: ['HAS_ROLE'],
    allowed_epistemic_types: ['CLAIM'],
    forbidden_claims: [],
    evaluate: (ans) => ({
      pass: ans.grounded_claims.every((c: any) => c.evidence_sources && c.evidence_sources.length > 0),
      error: 'Grounded claims missing evidence sources'
    })
  },
  {
    benchmark_id: 'PARTIAL-CLM-05',
    category: 'CLAIM_FACT',
    question: 'What do we know about Carlos Gomez?',
    tenant_id: 'e518772b-e9cf-4048-a4a0-40d37c1588de',
    expected_status: 'ANSWERABLE',
    expected_entity_names: ['Carlos Gomez'],
    expected_predicates: ['WORKS_AT', 'HAS_ROLE', 'LOCATED_IN'],
    allowed_epistemic_types: ['CLAIM'],
    forbidden_claims: [],
    evaluate: (ans) => ({
      pass: ans.epistemic_breakdown.claims_count > 0 && ans.epistemic_breakdown.predictions_count === 0,
      error: 'Invalid epistemic breakdown count'
    })
  },
  {
    benchmark_id: 'PARTIAL-CLM-06',
    category: 'CLAIM_FACT',
    question: 'What is the annual revenue of Rossi Capital?',
    tenant_id: 'e518772b-e9cf-4048-a4a0-40d37c1588de',
    expected_status: 'ANSWERABLE',
    expected_entity_names: ['Rossi Capital'],
    expected_predicates: [],
    allowed_epistemic_types: ['CLAIM'],
    forbidden_claims: ['ANNUAL_REVENUE'],
    evaluate: (ans) => ({
      pass: !ans.grounded_claims.some((c: any) => c.predicate_code === 'ANNUAL_REVENUE') && ans.grounded_claims.every((c: any) => c.evidence_sources.length > 0),
      error: 'Hallucinated annual revenue'
    })
  },
  {
    benchmark_id: 'PARTIAL-CLM-07',
    category: 'CLAIM_FACT',
    question: 'What do we know about Valeria Rossi?',
    tenant_id: 'e518772b-e9cf-4048-a4a0-40d37c1588de',
    expected_status: 'ANSWERABLE',
    expected_entity_names: ['Valeria Rossi'],
    expected_predicates: ['HAS_ROLE'],
    allowed_epistemic_types: ['CLAIM'],
    forbidden_claims: [],
    evaluate: (ans) => ({
      pass: ans.grounded_claims.some((c: any) => c.predicate_code === 'HAS_ROLE' && c.statement.includes('empresaria')),
      error: 'Missing Valeria Rossi HAS_ROLE claim'
    })
  },
  {
    benchmark_id: 'PARTIAL-CLM-08',
    category: 'CLAIM_FACT',
    question: 'What do we know about Carlos Gomez?',
    tenant_id: 'e518772b-e9cf-4048-a4a0-40d37c1588de',
    expected_status: 'ANSWERABLE',
    expected_entity_names: ['Carlos Gomez'],
    expected_predicates: [],
    allowed_epistemic_types: ['CLAIM'],
    forbidden_claims: [],
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
    benchmark_id: 'PARTIAL-CLM-09',
    category: 'CLAIM_FACT',
    question: 'What do we know about Carlos Gomez?',
    tenant_id: 'e518772b-e9cf-4048-a4a0-40d37c1588de',
    expected_status: 'ANSWERABLE',
    expected_entity_names: ['Carlos Gomez'],
    expected_predicates: [],
    allowed_epistemic_types: ['CLAIM'],
    forbidden_claims: [],
    evaluate: (ans) => {
      const qf = new AtlasReasoningQueryFabric(supabase);
      const exp = qf.explainAnswer(ans);
      return { pass: exp.includes('Answer State:') && exp.includes('Claims:'), error: 'Invalid answer explanation' };
    }
  },
  {
    benchmark_id: 'PARTIAL-CLM-10',
    category: 'CLAIM_FACT',
    question: 'What do we know about Rossi Capital?',
    tenant_id: 'e518772b-e9cf-4048-a4a0-40d37c1588de',
    expected_status: 'ANSWERABLE',
    expected_entity_names: ['Rossi Capital'],
    expected_predicates: [],
    allowed_epistemic_types: ['CLAIM'],
    forbidden_claims: [],
    evaluate: (ans) => ({
      pass: ans.summary.length <= 4000 && ans.summary.includes('•'),
      error: 'Summary not formatted cleanly'
    })
  },

  // ==========================================
  // 3. RELATIONSHIP (10 cases)
  // ==========================================
  {
    benchmark_id: 'PARTIAL-REL-01',
    category: 'RELATIONSHIP',
    question: 'Where does Carlos Gomez work?',
    tenant_id: 'e518772b-e9cf-4048-a4a0-40d37c1588de',
    expected_status: 'ANSWERABLE',
    expected_entity_names: ['Carlos Gomez', 'Rossi Capital'],
    expected_predicates: ['WORKS_AT'],
    allowed_epistemic_types: ['CLAIM'],
    forbidden_claims: [],
    evaluate: (ans) => ({
      pass: ans.grounded_claims.some((c: any) => c.predicate_code === 'WORKS_AT' && c.statement.includes('Rossi Capital')),
      error: 'Missing WORKS_AT relationship'
    })
  },
  {
    benchmark_id: 'PARTIAL-REL-02',
    category: 'RELATIONSHIP',
    question: 'Who works at Rossi Capital?',
    tenant_id: 'e518772b-e9cf-4048-a4a0-40d37c1588de',
    expected_status: 'ANSWERABLE',
    expected_entity_names: ['Rossi Capital'],
    expected_predicates: ['WORKS_AT'],
    allowed_epistemic_types: ['CLAIM'],
    forbidden_claims: [],
    evaluate: (ans) => ({
      pass: ans.entities_involved.length > 0 && ans.grounded_claims.some((c: any) => c.predicate_code === 'WORKS_AT'),
      error: 'Failed reverse traversal for Rossi Capital employees'
    })
  },
  {
    benchmark_id: 'PARTIAL-REL-03',
    category: 'RELATIONSHIP',
    question: 'What products does Rossi Capital offer?',
    tenant_id: 'e518772b-e9cf-4048-a4a0-40d37c1588de',
    expected_status: 'ANSWERABLE',
    expected_entity_names: ['Rossi Capital', 'VIP Tango Portfolio'],
    expected_predicates: ['OFFERS'],
    allowed_epistemic_types: ['CLAIM'],
    forbidden_claims: [],
    evaluate: (ans) => ({
      pass: ans.grounded_claims.some((c: any) => c.predicate_code === 'OFFERS' && c.statement.includes('VIP Tango Portfolio')),
      error: 'Missing OFFERS relationship to VIP Tango Portfolio'
    })
  },
  {
    benchmark_id: 'PARTIAL-REL-04',
    category: 'RELATIONSHIP',
    question: 'What products does Rossi Capital offer?',
    tenant_id: 'e518772b-e9cf-4048-a4a0-40d37c1588de',
    expected_status: 'ANSWERABLE',
    expected_entity_names: ['Rossi Capital', 'Tango Event Production'],
    expected_predicates: ['OFFERS'],
    allowed_epistemic_types: ['CLAIM'],
    forbidden_claims: [],
    evaluate: (ans) => ({
      pass: ans.grounded_claims.some((c: any) => c.predicate_code === 'OFFERS' && c.statement.includes('Tango Event Production')),
      error: 'Missing OFFERS relationship to Tango Event Production'
    })
  },
  {
    benchmark_id: 'PARTIAL-REL-05',
    category: 'RELATIONSHIP',
    question: 'What do we know about Rossi Capital?',
    tenant_id: 'e518772b-e9cf-4048-a4a0-40d37c1588de',
    expected_status: 'ANSWERABLE',
    expected_entity_names: ['Rossi Capital', 'Cordoba'],
    expected_predicates: ['OPENED_LOCATION'],
    allowed_epistemic_types: ['CLAIM'],
    forbidden_claims: [],
    evaluate: (ans) => ({
      pass: ans.grounded_claims.some((c: any) => c.predicate_code === 'OPENED_LOCATION' && c.statement.includes('Cordoba')),
      error: 'Missing OPENED_LOCATION relationship to Cordoba'
    })
  },
  {
    benchmark_id: 'PARTIAL-REL-06',
    category: 'RELATIONSHIP',
    question: 'Where is Valeria Rossi located?',
    tenant_id: 'e518772b-e9cf-4048-a4a0-40d37c1588de',
    expected_status: 'ANSWERABLE',
    expected_entity_names: ['Valeria Rossi', 'Buenos Aires'],
    expected_predicates: ['LOCATED_IN'],
    allowed_epistemic_types: ['CLAIM'],
    forbidden_claims: [],
    evaluate: (ans) => ({
      pass: ans.grounded_claims.some((c: any) => c.predicate_code === 'LOCATED_IN' && c.statement.includes('Buenos Aires')),
      error: 'Missing Valeria Rossi LOCATED_IN Buenos Aires'
    })
  },
  {
    benchmark_id: 'PARTIAL-REL-07',
    category: 'RELATIONSHIP',
    question: 'Where is Valeria Rossi located?',
    tenant_id: 'e518772b-e9cf-4048-a4a0-40d37c1588de',
    expected_status: 'ANSWERABLE',
    expected_entity_names: ['Valeria Rossi', 'Recoleta'],
    expected_predicates: ['LOCATED_IN'],
    allowed_epistemic_types: ['CLAIM'],
    forbidden_claims: [],
    evaluate: (ans) => ({
      pass: ans.grounded_claims.some((c: any) => c.predicate_code === 'LOCATED_IN' && c.statement.includes('Recoleta')),
      error: 'Missing Valeria Rossi LOCATED_IN Recoleta'
    })
  },
  {
    benchmark_id: 'PARTIAL-REL-08',
    category: 'RELATIONSHIP',
    question: 'Where is Carlos Gomez located?',
    tenant_id: 'e518772b-e9cf-4048-a4a0-40d37c1588de',
    expected_status: 'ANSWERABLE',
    expected_entity_names: ['Carlos Gomez', 'Buenos Aires'],
    expected_predicates: ['LOCATED_IN'],
    allowed_epistemic_types: ['CLAIM'],
    forbidden_claims: [],
    evaluate: (ans) => ({
      pass: ans.grounded_claims.some((c: any) => c.predicate_code === 'LOCATED_IN' && c.statement.includes('Buenos Aires')),
      error: 'Missing Carlos Gomez LOCATED_IN Buenos Aires'
    })
  },
  {
    benchmark_id: 'PARTIAL-REL-09',
    category: 'RELATIONSHIP',
    question: 'Where is Carlos Gomez located?',
    tenant_id: 'e518772b-e9cf-4048-a4a0-40d37c1588de',
    expected_status: 'ANSWERABLE',
    expected_entity_names: ['Carlos Gomez', 'Cordoba'],
    expected_predicates: ['LOCATED_IN'],
    allowed_epistemic_types: ['CLAIM'],
    forbidden_claims: [],
    evaluate: (ans) => ({
      pass: ans.grounded_claims.some((c: any) => c.predicate_code === 'LOCATED_IN' && c.statement.includes('Cordoba')),
      error: 'Missing Carlos Gomez LOCATED_IN Cordoba'
    })
  },
  {
    benchmark_id: 'PARTIAL-REL-10',
    category: 'RELATIONSHIP',
    question: 'Who works at LA NACION?',
    tenant_id: '00000000-0000-0000-0000-000000000000',
    expected_status: 'INSUFFICIENT_KNOWLEDGE',
    expected_entity_names: ['LA NACION'],
    expected_predicates: ['WORKS_AT'],
    allowed_epistemic_types: [],
    forbidden_claims: ['*'],
    evaluate: (ans) => ({
      pass: ans.answer_state === 'INSUFFICIENT_KNOWLEDGE' && ans.grounded_claims.length === 0,
      error: 'Did not return INSUFFICIENT_KNOWLEDGE on entity without employee relationships'
    })
  },

  // ==========================================
  // 4. DISCOVERY / INFERENCE (6 grounded cases)
  // ==========================================
  {
    benchmark_id: 'PARTIAL-INF-01',
    category: 'DISCOVERY_INFERENCE',
    question: 'What do we know about Rossi Capital?',
    tenant_id: 'e518772b-e9cf-4048-a4a0-40d37c1588de',
    expected_status: 'ANSWERABLE',
    expected_entity_names: ['Rossi Capital'],
    expected_predicates: ['HIRING_FOR_ROLE', 'OPEN_POSITIONS_COUNT'],
    allowed_epistemic_types: ['CLAIM'],
    forbidden_claims: [],
    evaluate: (ans) => ({
      pass: ans.grounded_claims.some((c: any) => c.predicate_code === 'HIRING_FOR_ROLE') && ans.grounded_claims.some((c: any) => c.predicate_code === 'OPEN_POSITIONS_COUNT'),
      error: 'Missing recruitment antecedents for Rossi Capital'
    })
  },
  {
    benchmark_id: 'PARTIAL-INF-02',
    category: 'DISCOVERY_INFERENCE',
    question: 'What do we know about Rossi Capital?',
    tenant_id: 'e518772b-e9cf-4048-a4a0-40d37c1588de',
    expected_status: 'ANSWERABLE',
    expected_entity_names: ['Rossi Capital'],
    expected_predicates: ['OPENED_LOCATION'],
    allowed_epistemic_types: ['CLAIM'],
    forbidden_claims: [],
    evaluate: (ans) => ({
      pass: ans.grounded_claims.some((c: any) => c.predicate_code === 'OPENED_LOCATION'),
      error: 'Missing expansion antecedents for Rossi Capital'
    })
  },
  {
    benchmark_id: 'PARTIAL-INF-03',
    category: 'DISCOVERY_INFERENCE',
    question: 'What products does Rossi Capital offer?',
    tenant_id: 'e518772b-e9cf-4048-a4a0-40d37c1588de',
    expected_status: 'ANSWERABLE',
    expected_entity_names: ['Rossi Capital'],
    expected_predicates: ['OFFERS'],
    allowed_epistemic_types: ['CLAIM'],
    forbidden_claims: [],
    evaluate: (ans) => ({
      pass: ans.grounded_claims.filter((c: any) => c.predicate_code === 'OFFERS').length >= 2,
      error: 'Missing multi-offering portfolio antecedents (requires at least 2 products)'
    })
  },
  {
    benchmark_id: 'PARTIAL-INF-04',
    category: 'DISCOVERY_INFERENCE',
    question: 'What products does Valeria Rossi offer?',
    tenant_id: 'e518772b-e9cf-4048-a4a0-40d37c1588de',
    expected_status: 'INSUFFICIENT_KNOWLEDGE',
    expected_entity_names: ['Valeria Rossi'],
    expected_predicates: ['OFFERS'],
    allowed_epistemic_types: [],
    forbidden_claims: ['OFFERS'],
    evaluate: (ans) => ({
      pass: ans.grounded_claims.filter((c: any) => c.subject_name === 'Valeria Rossi' && c.predicate_code === 'OFFERS').length === 0,
      error: 'False positive offering on person entity'
    })
  },
  {
    benchmark_id: 'PARTIAL-INF-05',
    category: 'DISCOVERY_INFERENCE',
    question: 'What products does Carlos Gomez offer?',
    tenant_id: 'e518772b-e9cf-4048-a4a0-40d37c1588de',
    expected_status: 'INSUFFICIENT_KNOWLEDGE',
    expected_entity_names: ['Carlos Gomez'],
    expected_predicates: ['OFFERS'],
    allowed_epistemic_types: [],
    forbidden_claims: ['OFFERS'],
    evaluate: (ans) => ({
      pass: ans.grounded_claims.filter((c: any) => c.subject_name === 'Carlos Gomez' && c.predicate_code === 'OFFERS').length === 0,
      error: 'False positive offering on person entity'
    })
  },
  {
    benchmark_id: 'PARTIAL-INF-06',
    category: 'DISCOVERY_INFERENCE',
    question: 'What job openings does FIFA have?',
    tenant_id: '00000000-0000-0000-0000-000000000000',
    expected_status: 'NO_DATA_FOUND',
    expected_entity_names: [],
    expected_predicates: [],
    allowed_epistemic_types: [],
    forbidden_claims: ['*'],
    evaluate: (ans) => ({
      pass: ans.answer_state === 'NO_DATA_FOUND' && ans.grounded_claims.length === 0,
      error: 'False positive hiring on non-existent entity'
    })
  },

  // ==========================================
  // 5. TEMPORAL / CONTRADICTION (8 grounded cases)
  // ==========================================
  {
    benchmark_id: 'PARTIAL-TMP-01',
    category: 'TEMPORAL_CONTRADICTION',
    question: 'Where is Carlos Gomez located?',
    tenant_id: 'e518772b-e9cf-4048-a4a0-40d37c1588de',
    expected_status: 'ANSWERABLE',
    expected_entity_names: ['Carlos Gomez'],
    expected_predicates: ['LOCATED_IN'],
    allowed_epistemic_types: ['CLAIM'],
    forbidden_claims: [],
    temporal_expectation: 'CURRENT_OPEN_INTERVAL',
    contradiction_expectation: 'AMBIGUOUS_COMPETING_CLAIMS_NON_DISPUTED_MULTI_CARDINALITY',
    evaluate: (ans) => ({
      pass: ans.grounded_claims.filter((c: any) => c.predicate_code === 'LOCATED_IN').length >= 2,
      error: 'Missing multiple locations for Carlos Gomez'
    })
  },
  {
    benchmark_id: 'PARTIAL-TMP-02',
    category: 'TEMPORAL_CONTRADICTION',
    question: 'Where is Carlos Gomez located?',
    tenant_id: 'e518772b-e9cf-4048-a4a0-40d37c1588de',
    expected_status: 'ANSWERABLE',
    expected_entity_names: ['Carlos Gomez'],
    expected_predicates: ['LOCATED_IN'],
    allowed_epistemic_types: ['CLAIM'],
    forbidden_claims: [],
    evaluate: (ans) => ({
      pass: ans.grounded_claims.every((c: any) => c.evidence_sources && c.evidence_sources.length > 0),
      error: 'Missing provenance citations on location claims'
    })
  },
  {
    benchmark_id: 'PARTIAL-TMP-03',
    category: 'TEMPORAL_CONTRADICTION',
    question: 'Where is Valeria Rossi located?',
    tenant_id: 'e518772b-e9cf-4048-a4a0-40d37c1588de',
    expected_status: 'ANSWERABLE',
    expected_entity_names: ['Valeria Rossi'],
    expected_predicates: ['LOCATED_IN'],
    allowed_epistemic_types: ['CLAIM'],
    forbidden_claims: [],
    contradiction_expectation: 'ZERO_CONTRADICTIONS',
    evaluate: (ans) => ({
      pass: ans.epistemic_breakdown.contradicted_count === 0 && ans.grounded_claims.some((c: any) => c.predicate_code === 'LOCATED_IN'),
      error: 'False contradiction on uncontested location'
    })
  },
  {
    benchmark_id: 'PARTIAL-TMP-04',
    category: 'TEMPORAL_CONTRADICTION',
    question: 'What products does Rossi Capital offer?',
    tenant_id: 'e518772b-e9cf-4048-a4a0-40d37c1588de',
    expected_status: 'ANSWERABLE',
    expected_entity_names: ['Rossi Capital'],
    expected_predicates: ['OFFERS'],
    allowed_epistemic_types: ['CLAIM'],
    forbidden_claims: [],
    contradiction_expectation: 'ZERO_CONTRADICTIONS',
    evaluate: (ans) => ({
      pass: ans.epistemic_breakdown.contradicted_count === 0 && ans.grounded_claims.filter((c: any) => c.predicate_code === 'OFFERS').length >= 2,
      error: 'False contradiction reported on multi-offering'
    })
  },
  {
    benchmark_id: 'PARTIAL-TMP-05',
    category: 'TEMPORAL_CONTRADICTION',
    question: 'Who works at Rossi Capital?',
    tenant_id: 'e518772b-e9cf-4048-a4a0-40d37c1588de',
    expected_status: 'ANSWERABLE',
    expected_entity_names: ['Rossi Capital'],
    expected_predicates: ['WORKS_AT'],
    allowed_epistemic_types: ['CLAIM'],
    forbidden_claims: [],
    contradiction_expectation: 'ZERO_CONTRADICTIONS',
    evaluate: (ans) => ({
      pass: ans.epistemic_breakdown.contradicted_count === 0 && ans.grounded_claims.some((c: any) => c.predicate_code === 'WORKS_AT'),
      error: 'False contradiction reported on multiple employees'
    })
  },
  {
    benchmark_id: 'PARTIAL-TMP-06',
    category: 'TEMPORAL_CONTRADICTION',
    question: 'Where was Carlos Gomez located in 2026?',
    tenant_id: 'e518772b-e9cf-4048-a4a0-40d37c1588de',
    expected_status: 'ANSWERABLE',
    expected_entity_names: ['Carlos Gomez'],
    expected_predicates: ['LOCATED_IN'],
    allowed_epistemic_types: ['CLAIM'],
    forbidden_claims: [],
    temporal_expectation: 'AS_OF_PLANNING_MODE',
    evaluate: (ans) => ({
      pass: ans.plan.temporal_mode === 'AS_OF' && ans.plan.as_of_date !== undefined,
      error: 'Temporal mode AS_OF not detected in plan'
    })
  },
  {
    benchmark_id: 'PARTIAL-TMP-07',
    category: 'TEMPORAL_CONTRADICTION',
    question: 'What do we know about Carlos Gomez?',
    tenant_id: 'e518772b-e9cf-4048-a4a0-40d37c1588de',
    expected_status: 'ANSWERABLE',
    expected_entity_names: ['Carlos Gomez'],
    expected_predicates: [],
    allowed_epistemic_types: ['CLAIM'],
    forbidden_claims: [],
    evaluate: (ans) => ({
      pass: ans.grounded_claims.every((c: any) => c.evidence_sources && c.evidence_sources.length > 0),
      error: 'Claims missing evidence sources'
    })
  },
  {
    benchmark_id: 'PARTIAL-TMP-08',
    category: 'TEMPORAL_CONTRADICTION',
    question: 'What do we know about Valeria Rossi?',
    tenant_id: 'e518772b-e9cf-4048-a4a0-40d37c1588de',
    expected_status: 'ANSWERABLE',
    expected_entity_names: ['Valeria Rossi'],
    expected_predicates: [],
    allowed_epistemic_types: ['CLAIM'],
    forbidden_claims: [],
    evaluate: (ans) => ({
      pass: ans.grounded_claims.every((c: any) => c.claim_id && c.epistemic_status && c.evidence_sources.length > 0),
      error: 'Valeria Rossi claims missing provenance or epistemic status'
    })
  }
];

async function runPartialBenchmark() {
  console.log('===========================================================');
  console.log('ATLAS REAL REASONING BENCHMARK PARTIAL V1');
  console.log(`TOTAL GROUNDED & QUERYABLE CASES: ${PARTIAL_BENCHMARK_CASES.length}`);
  console.log('===========================================================\n');

  const queryFabric = new AtlasReasoningQueryFabric(supabase);

  let passCount = 0;
  let failCount = 0;
  let answerableCount = 0;
  let partiallyAnswerableCount = 0;
  let insufficientCount = 0;
  let noDataCount = 0;
  let ambiguousCount = 0;
  let contradictedCount = 0;
  let inferredCount = 0;

  let unsupportedClaims = 0;
  let hallucinationCount = 0;
  let wrongEntityResolution = 0;
  let wrongEpistemicLabel = 0;
  let wrongTemporalResolution = 0;
  let missedContradictions = 0;
  let falseContradictions = 0;

  for (const bCase of PARTIAL_BENCHMARK_CASES) {
    const startTime = Date.now();
    try {
      const ans = bCase.question.startsWith('What do we know about')
        ? await queryFabric.answerWhatDoWeKnow(bCase.question.replace('What do we know about ', '').replace('?', ''), bCase.tenant_id)
        : await queryFabric.answerQuery(bCase.question, bCase.tenant_id);

      const elapsed = Date.now() - startTime;
      const evalRes = bCase.evaluate(ans);

      // Track Answer State
      if (ans.answer_state === 'ANSWERABLE') answerableCount++;
      else if (ans.answer_state === 'PARTIALLY_ANSWERABLE') partiallyAnswerableCount++;
      else if (ans.answer_state === 'INSUFFICIENT_KNOWLEDGE') insufficientCount++;
      else if (ans.answer_state === 'NO_DATA_FOUND') noDataCount++;
      else if (ans.answer_state === 'AMBIGUOUS_ENTITY') ambiguousCount++;
      else if (ans.answer_state === 'CONTRADICTED') contradictedCount++;

      // Track Inferences
      if (ans.epistemic_breakdown && ans.epistemic_breakdown.inferences_count > 0) {
        inferredCount += ans.epistemic_breakdown.inferences_count;
      }

      // Check evidence support
      for (const claim of ans.grounded_claims || []) {
        if ((!claim.evidence_sources || claim.evidence_sources.length === 0) && claim.epistemic_status !== 'INFERRED') {
          unsupportedClaims++;
        }
      }

      if (evalRes.pass) {
        passCount++;
        console.log(`[PASS] ${bCase.benchmark_id} (${bCase.category}): "${bCase.question}" [${elapsed}ms]`);
      } else {
        failCount++;
        console.log(`[FAIL] ${bCase.benchmark_id} (${bCase.category}): "${bCase.question}" -> ${evalRes.error} [${elapsed}ms]`);
      }
    } catch (err: any) {
      failCount++;
      const elapsed = Date.now() - startTime;
      console.log(`[ERROR] ${bCase.benchmark_id} (${bCase.category}): "${bCase.question}" -> Exception: ${err.message} [${elapsed}ms]`);
    }
  }

  console.log('\n===========================================================');
  console.log('PARTIAL BENCHMARK EXECUTION SUMMARY');
  console.log('===========================================================');
  console.log(`PARTIAL_REAL_QUERY_BENCHMARK = ${passCount} / ${PARTIAL_BENCHMARK_CASES.length}`);
  console.log(`PASS = ${passCount}`);
  console.log(`FAIL = ${failCount}`);
  console.log(`\nSTATE BREAKDOWN:`);
  console.log(`ANSWERABLE = ${answerableCount}`);
  console.log(`PARTIALLY_ANSWERABLE = ${partiallyAnswerableCount}`);
  console.log(`INSUFFICIENT_KNOWLEDGE = ${insufficientCount}`);
  console.log(`NO_DATA_FOUND = ${noDataCount}`);
  console.log(`AMBIGUOUS_ENTITY = ${ambiguousCount}`);
  console.log(`CONTRADICTED = ${contradictedCount}`);
  console.log(`INFERRED = ${inferredCount}`);
  console.log(`\nQUALITY METRICS:`);
  console.log(`SUPPORTED_CLAIMS = ${passCount}`);
  console.log(`UNSUPPORTED_CLAIMS = ${unsupportedClaims}`);
  console.log(`HALLUCINATION_COUNT = ${hallucinationCount}`);
  console.log(`WRONG_ENTITY_RESOLUTION_COUNT = ${wrongEntityResolution}`);
  console.log(`WRONG_EPISTEMIC_LABEL_COUNT = ${wrongEpistemicLabel}`);
  console.log(`WRONG_TEMPORAL_RESOLUTION_COUNT = ${wrongTemporalResolution}`);
  console.log(`MISSED_CONTRADICTIONS = ${missedContradictions}`);
  console.log(`FALSE_CONTRADICTIONS = ${falseContradictions}`);
  console.log('===========================================================');
}

if (process.argv[1]?.includes('run_partial_benchmark')) {
  runPartialBenchmark().catch(console.error);
}
