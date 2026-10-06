import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';
import * as dotenv from 'dotenv';
import { AtlasReasoningQueryFabric } from '../src/lib/atlasQueryFabric/AtlasReasoningQueryFabric';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const supabaseKey = process.env.SUPABASE_SECRET_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const queryFabric = new AtlasReasoningQueryFabric(supabase);
  const tenantA = 'e518772b-e9cf-4048-a4a0-40d37c1588de';

  const queries = [
    { name: 'POSSIBLE_EXPANSION', q: '¿Rossi Capital parece estar expandiéndose y por qué?' },
    { name: 'ACTIVE_HIRING_SIGNAL', q: '¿Rossi Capital presenta señales de contratación activa?' },
    { name: 'MULTI_OFFERING_PORTFOLIO', q: '¿Rossi Capital posee una cartera de múltiples ofertas?' },
  ];

  console.log('=== SECTION 9: INFERENCE QUERYABILITY AUDIT ===');
  for (const item of queries) {
    console.log(`\nQuery: "${item.q}" (${item.name})`);
    const plan = await queryFabric.planQuery(item.q, tenantA);
    console.log('Plan Intent:', plan.intent, '| Target Entities:', plan.target_entity_names, '| Predicates:', plan.predicates);
    const ans = await queryFabric.answerQuery(item.q, tenantA);
    console.log('Answer State:', ans.answer_state);
    console.log('Entities Involved:', ans.entities_involved.map(e => e.canonical_name));
    console.log('Claims Count:', ans.grounded_claims.length);
    console.log('Claims:', ans.grounded_claims.map(c => ({
      stmt: c.statement,
      pred: c.predicate_code,
      status: c.epistemic_status
    })));
  }
}

main().catch(console.error);
