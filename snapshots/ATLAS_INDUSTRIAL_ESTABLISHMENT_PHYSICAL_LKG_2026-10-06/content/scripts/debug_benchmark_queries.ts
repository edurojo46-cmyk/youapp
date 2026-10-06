import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';
import * as dotenv from 'dotenv';
import { AtlasReasoningQueryFabric } from '../src/lib/atlasQueryFabric/AtlasReasoningQueryFabric';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const supabaseKey = process.env.SUPABASE_SECRET_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function debug() {
  const qf = new AtlasReasoningQueryFabric(supabase);
  const tenantA = 'e518772b-e9cf-4048-a4a0-40d37c1588de';
  const tenantB = '4f0248cd-ebcb-4b0e-8c3f-be6208d38f4f';
  const tenantGlobal = '00000000-0000-0000-0000-000000000000';

  console.log('--- Debug ENT-05 (LA NACION) ---');
  const ans5 = await qf.answerWhatDoWeKnow('LA NACION', tenantGlobal);
  console.log('LA NACION Answer State:', ans5.answer_state);
  console.log('LA NACION Entities:', ans5.entities_involved);
  console.log('LA NACION Claims:', ans5.grounded_claims?.length);

  console.log('\n--- Debug ENT-06 (rossi capital) ---');
  const ans6 = await qf.answerWhatDoWeKnow('rossi capital', tenantA);
  console.log('rossi capital Answer State:', ans6.answer_state);
  console.log('rossi capital Entities:', ans6.entities_involved);
  console.log('rossi capital Claims:', ans6.grounded_claims?.length);

  console.log('\n--- Debug ENT-08 (Valeria Rossi Tenant B) ---');
  const ans8 = await qf.answerWhatDoWeKnow('Valeria Rossi', tenantB);
  console.log('Valeria Rossi Tenant B Answer State:', ans8.answer_state);
  console.log('Valeria Rossi Tenant B Entities:', ans8.entities_involved);

  console.log('\n--- Debug CLM-01 (Carlos Gomez role) ---');
  const ansRole = await qf.answerQuery('What is Carlos Gomez role?', tenantA);
  console.log('Carlos Gomez Role Answer State:', ansRole.answer_state);
  console.log('Carlos Gomez Role Grounded Claims:', ansRole.grounded_claims);
  console.log('Carlos Gomez Role Citations:', ansRole.citations);
}

debug().catch(console.error);
