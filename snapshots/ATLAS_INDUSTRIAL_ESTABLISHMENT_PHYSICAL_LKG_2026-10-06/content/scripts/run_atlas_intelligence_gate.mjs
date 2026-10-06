/**
 * ATLAS — INTELLIGENCE LAYER V1 GATE RUNNER
 * Physical Demonstration of Accumulative Self-Improving Reasoning
 * 
 * Verifies:
 * EXPERIENCE -> GENERALIZED RULE -> NUEVA SITUACIÓN -> DECISION WITHOUT AI -> PHYSICAL EXPERIMENT -> BETTER OUTCOME
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import { AtlasIntelligenceLayer } from '../src/lib/atlasIntelligence/AtlasIntelligenceLayer.ts';

dotenv.config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function main() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 10 });
  const intelligenceLayer = new AtlasIntelligenceLayer(pool);

  // Brand new target institution not used in seeding foundational experiences
  const newTarget = {
    domain: 'ungs.edu.ar',
    name: 'Universidad Nacional de General Sarmiento',
    domainType: 'ACADEMIC_INSTITUTION'
  };

  // Execute Primer Gate Real
  const gateResult = await intelligenceLayer.executePhysicalGate(newTarget);

  await pool.end();

  const m = gateResult.metrics;

  // Print strict required devolution format
  console.log(`EXPERIENCES_STORED = ${m.EXPERIENCES_STORED}`);
  console.log(`GENERALIZED_RULES_CREATED = ${m.GENERALIZED_RULES_CREATED}`);
  console.log(`RULES_PHYSICALLY_VALIDATED = ${m.RULES_PHYSICALLY_VALIDATED}`);
  console.log(``);
  console.log(`HYPOTHESES_GENERATED = ${m.HYPOTHESES_GENERATED}`);
  console.log(`PHYSICAL_EXPERIMENTS_RUN = ${m.PHYSICAL_EXPERIMENTS_RUN}`);
  console.log(``);
  console.log(`DECISIONS_WITHOUT_AI = ${m.DECISIONS_WITHOUT_AI}`);
  console.log(`DECISIONS_ESCALATED_TO_AI = ${m.DECISIONS_ESCALATED_TO_AI}`);
  console.log(`AI_CALL_AVOIDANCE_RATE = ${m.AI_CALL_AVOIDANCE_RATE}`);
  console.log(``);
  console.log(`LEARNED_STRATEGIES_PROMOTED = ${m.LEARNED_STRATEGIES_PROMOTED}`);
  console.log(`FAILED_STRATEGIES_REMEMBERED = ${m.FAILED_STRATEGIES_REMEMBERED}`);
  console.log(`SELF_CHALLENGES_TRIGGERED = ${m.SELF_CHALLENGES_TRIGGERED}`);
  console.log(``);
  console.log(`FIRST_GENERALIZED_RULE = ${m.FIRST_GENERALIZED_RULE}`);
  console.log(`FIRST_RULE_CONFIDENCE = ${m.FIRST_RULE_CONFIDENCE}`);
  console.log(`FIRST_REUSE_WITHOUT_AI = ${m.FIRST_REUSE_WITHOUT_AI}`);
  console.log(`PHYSICAL_IMPROVEMENT_OBSERVED = ${m.PHYSICAL_IMPROVEMENT_OBSERVED}`);
  console.log(``);
  console.log(`ATLAS_INTELLIGENCE_LAYER_READY = ${m.ATLAS_INTELLIGENCE_LAYER_READY ? 'TRUE' : 'FALSE'}`);
  console.log(`FINAL_STATUS = ${m.FINAL_STATUS}`);
}

main().catch(err => {
  console.error('Gate error:', err);
  process.exit(1);
});
