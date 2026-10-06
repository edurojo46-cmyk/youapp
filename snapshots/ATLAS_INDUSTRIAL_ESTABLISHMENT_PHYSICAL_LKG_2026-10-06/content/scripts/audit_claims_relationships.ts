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
  const tenantGlobal = '00000000-0000-0000-0000-000000000000';

  console.log('=== SECTIONS 10 & 11: CLAIMS & RELATIONSHIPS QUERYABILITY AUDIT ===\n');

  const queries = [
    // Claims
    { type: 'CLAIM', pred: 'HAS_ROLE', q: 'What is Carlos Gomez role?', tenant: tenantA },
    { type: 'CLAIM', pred: 'OPEN_POSITIONS_COUNT', q: 'How many open positions does Rossi Capital have?', tenant: tenantA },
    { type: 'CLAIM', pred: 'HIRING_FOR_ROLE', q: 'What job openings does Rossi Capital have?', tenant: tenantA },

    // Relationships
    { type: 'RELATIONSHIP', pred: 'WORKS_AT', q: 'Where does Carlos Gomez work?', tenant: tenantA },
    { type: 'RELATIONSHIP', pred: 'OFFERS', q: 'What products does Rossi Capital offer?', tenant: tenantA },
    { type: 'RELATIONSHIP', pred: 'LOCATED_IN', q: 'Where is Valeria Rossi located?', tenant: tenantA },
  ];

  for (const item of queries) {
    console.log(`Query: "${item.q}" (Expected: ${item.type} [${item.pred}])`);
    const ans = await queryFabric.answerQuery(item.q, item.tenant);
    console.log(`- Answer State: ${ans.answer_state}`);
    console.log(`- Grounded Claims: ${ans.grounded_claims.length}`);
    for (const c of ans.grounded_claims) {
      console.log(`  * [${c.epistemic_status} (conf: ${c.confidence})] ${c.statement} | Sources: ${c.evidence_sources.length}`);
    }
    console.log('');
  }
}

main().catch(console.error);
