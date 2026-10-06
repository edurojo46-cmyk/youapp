import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const supabaseKey = process.env.SUPABASE_SECRET_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('==============================================');
  console.log('CURRENT ATLAS KNOWLEDGE STATE (EXACT SCHEMA)');
  console.log('==============================================');
  
  const { count: entCount } = await supabase.from('atlas_canonical_entities').select('*', { count: 'exact', head: true });
  const { count: obsCount } = await supabase.from('atlas_entity_source_observations').select('*', { count: 'exact', head: true });
  const { data: allFacts } = await supabase.from('atlas_semantic_facts').select('*');
  const { data: allRels } = await supabase.from('atlas_semantic_relationships').select('*');
  const { data: allInfs } = await supabase.from('atlas_semantic_inferences').select('*');
  const { data: allContras } = await supabase.from('atlas_semantic_contradictions').select('*');
  
  const { count: factEvCount } = await supabase.from('atlas_semantic_fact_evidence').select('*', { count: 'exact', head: true });
  const { count: relEvCount } = await supabase.from('atlas_semantic_relationship_evidence').select('*', { count: 'exact', head: true });
  const { count: infEvCount } = await supabase.from('atlas_semantic_inference_evidence').select('*', { count: 'exact', head: true });

  const activeFacts = (allFacts || []).filter(f => f.status === 'ACTIVE');
  const activeRels = (allRels || []).filter(r => r.is_active === true);
  const activeInfs = (allInfs || []).filter(i => i.is_active === true);
  const openContras = (allContras || []).filter(c => c.status === 'OPEN');

  console.log(`ACTIVE_ENTITIES = ${entCount}`);
  console.log(`OBSERVATIONS = ${obsCount}`);
  console.log(`TOTAL_FACTS_ROWS = ${allFacts?.length || 0} (ACTIVE = ${activeFacts.length})`);
  console.log(`TOTAL_RELATIONSHIPS_ROWS = ${allRels?.length || 0} (ACTIVE = ${activeRels.length})`);
  console.log(`TOTAL_INFERENCES_ROWS = ${allInfs?.length || 0} (ACTIVE = ${activeInfs.length})`);
  console.log(`TOTAL_CONTRADICTIONS_ROWS = ${allContras?.length || 0} (OPEN = ${openContras.length})`);
  console.log(`EVIDENCE_LINKS: FactEv=${factEvCount}, RelEv=${relEvCount}, InfEv=${infEvCount}`);

  // Breakdown active facts/claims by predicate and knowledge_type
  const factPredCounts: Record<string, number> = {};
  for (const f of activeFacts) {
    const k = `${f.knowledge_type}:${f.predicate_code}`;
    factPredCounts[k] = (factPredCounts[k] || 0) + 1;
  }
  console.log(`FACT/CLAIM BREAKDOWN:`, factPredCounts);

  // Breakdown active relationships by predicate
  const relPredCounts: Record<string, number> = {};
  for (const r of activeRels) {
    const k = `${r.knowledge_type}:${r.predicate_code}`;
    relPredCounts[k] = (relPredCounts[k] || 0) + 1;
  }
  console.log(`RELATIONSHIP BREAKDOWN:`, relPredCounts);
}

main().catch(console.error);
