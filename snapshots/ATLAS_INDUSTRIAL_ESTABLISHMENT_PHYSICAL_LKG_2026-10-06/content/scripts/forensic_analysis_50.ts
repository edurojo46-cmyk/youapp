import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';
import * as dotenv from 'dotenv';
import { AtlasReasoningQueryFabric } from '../src/lib/atlasQueryFabric/AtlasReasoningQueryFabric';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const supabaseKey = process.env.SUPABASE_SECRET_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function runForensics() {
  const queryFabric = new AtlasReasoningQueryFabric(supabase);

  const tenantA = 'e518772b-e9cf-4048-a4a0-40d37c1588de';
  const tenantB = '4f0248cd-ebcb-4b0e-8c3f-be6208d38f4f';
  const tenantGlobal = '00000000-0000-0000-0000-000000000000';

  console.log('--- FORENSIC RUN OF ALL 50 CASES ---');

  // Let us inspect what is currently stored in DB for each tenant
  const { data: entities } = await supabase.from('atlas_canonical_entities').select('*');
  const { data: facts } = await supabase.from('atlas_semantic_facts').select('*');
  const { data: rels } = await supabase.from('atlas_semantic_relationships').select('*');
  const { data: infs } = await supabase.from('atlas_semantic_inferences').select('*');

  console.log(`DB Snapshot: Entities=${entities?.length}, Facts=${facts?.length}, Relationships=${rels?.length}, Inferences=${infs?.length}`);

  // Let's test each of the 18 failing cases from preliminary run individually to capture full trace
  const testCases = [
    { id: 'BENCH-ENT-08', cat: 'ENTITY', q: 'Who is Valeria Rossi?', tenant: tenantB },
    { id: 'BENCH-CLM-02', cat: 'CLAIM_FACT', q: 'What roles is Rossi Capital hiring for?', tenant: tenantA },
    { id: 'BENCH-CLM-04', cat: 'CLAIM_FACT', q: 'What is Carlos Gomez role?', tenant: tenantA },
    { id: 'BENCH-CLM-06', cat: 'CLAIM_FACT', q: 'What is the annual revenue of Rossi Capital?', tenant: tenantA },
    { id: 'BENCH-CLM-07', cat: 'CLAIM_FACT', q: 'How many employees does River Plate have?', tenant: tenantGlobal },
    { id: 'BENCH-REL-05', cat: 'RELATIONSHIP', q: 'Where has Rossi Capital opened locations?', tenant: tenantA },
    { id: 'BENCH-REL-07', cat: 'RELATIONSHIP', q: 'Where is River Plate located?', tenant: tenantGlobal },
    { id: 'BENCH-REL-10', cat: 'RELATIONSHIP', q: 'Who works at LA NACION?', tenant: tenantGlobal },
    { id: 'BENCH-INF-01', cat: 'DISCOVERY_INFERENCE', q: 'Is Rossi Capital actively hiring?', tenant: tenantA },
    { id: 'BENCH-INF-02', cat: 'DISCOVERY_INFERENCE', q: 'Is Rossi Capital expanding operations?', tenant: tenantA },
    { id: 'BENCH-INF-03', cat: 'DISCOVERY_INFERENCE', q: 'What is Rossi Capital service portfolio?', tenant: tenantA },
    { id: 'BENCH-INF-04', cat: 'DISCOVERY_INFERENCE', q: 'What do we know about Rossi Capital?', tenant: tenantA },
    { id: 'BENCH-INF-08', cat: 'DISCOVERY_INFERENCE', q: 'What do we know about Rossi Capital?', tenant: tenantA },
    { id: 'BENCH-INF-10', cat: 'DISCOVERY_INFERENCE', q: 'What do we know about Rossi Capital?', tenant: tenantA },
    { id: 'BENCH-TMP-02', cat: 'TEMPORAL_CONTRADICTION', q: 'Where is Carlos Gomez located?', tenant: tenantA },
    { id: 'BENCH-TMP-07', cat: 'TEMPORAL_CONTRADICTION', q: 'What do we know about Carlos Gomez?', tenant: tenantA },
    { id: 'BENCH-TMP-08', cat: 'TEMPORAL_CONTRADICTION', q: 'Where was Rossi Capital located in 1990?', tenant: tenantA },
    { id: 'BENCH-TMP-09', cat: 'TEMPORAL_CONTRADICTION', q: 'What do we know about Valeria Rossi?', tenant: tenantA },
  ];

  for (const tc of testCases) {
    console.log(`\n==================================================`);
    console.log(`CASE ${tc.id} (${tc.cat}): "${tc.q}" [Tenant: ${tc.tenant}]`);
    const plan = await queryFabric.planQuery(tc.q, tc.tenant);
    console.log('PLAN:', JSON.stringify({
      intent: plan.intent,
      target_entities: plan.target_entity_names,
      predicates: plan.predicates,
      temporal_mode: plan.temporal_mode,
      as_of: plan.as_of_date
    }));

    const ans = tc.q.startsWith('What do we know about')
      ? await queryFabric.answerWhatDoWeKnow(tc.q.replace('What do we know about ', '').replace('?', ''), tc.tenant)
      : await queryFabric.answerQuery(tc.q, tc.tenant);

    console.log('ANSWER STATE:', ans.answer_state);
    console.log('ENTITIES INVOLVED:', ans.entities_involved.map(e => e.canonical_name));
    console.log('CLAIMS COUNT:', ans.grounded_claims.length);
    console.log('CLAIMS:', ans.grounded_claims.map(c => ({
      stmt: c.statement,
      pred: c.predicate_code,
      status: c.epistemic_status,
      conf: c.confidence,
      has_sources: (c.evidence_sources && c.evidence_sources.length > 0)
    })));
    console.log('EPISTEMIC BREAKDOWN:', ans.epistemic_breakdown);
    console.log('SUMMARY:', ans.summary);
  }
}

runForensics().catch(console.error);
