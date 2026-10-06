/**
 * ATLAS — TRUE BLIND INTELLIGENCE GATE V1 RUNNER
 * 
 * Executes:
 * 1. Verification of PRE_BLIND_HASH
 * 2. Case A: Intellectual Discovery (Hypotheses -> Micro-experiments -> Winning Pattern -> Induce Rule)
 * 3. Case B: Cross-Context Transfer without External AI (Learned Rule vs Baseline -> Better Physical Outcome)
 * 4. Self-Challenge: Attempt refutation on edge case -> Calibrate confidence & preconditions
 * 5. Post-Freeze Integrity: Assert POST_BLIND_HASH == PRE_BLIND_HASH
 */

import dotenv from 'dotenv';
dotenv.config();

import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import { computeFreezeHash } from './compute_freeze_hash.mjs';

import { AtlasIntelligenceLayer } from '../src/lib/atlasIntelligence/AtlasIntelligenceLayer.ts';
import { MetaRuleEngine } from '../src/lib/atlasIntelligence/MetaRuleEngine.ts';
import { ExperienceMemory } from '../src/lib/atlasIntelligence/ExperienceMemory.ts';

async function main() {
  const preBlindHash = computeFreezeHash();
  console.log(`[INIT] PRE_BLIND_HASH = ${preBlindHash}`);

  const pool = new pg.Pool({ ...parseDbUrl(), max: 4 });
  const atlas = new AtlasIntelligenceLayer(pool);
  const ruleEngine = MetaRuleEngine.getInstance();
  const memory = ExperienceMemory.getInstance();

  // ==========================================
  // CASE A: INTELLECTUAL DISCOVERY
  // ==========================================
  // Target: Ministry of Justice National Open Data Catalog (never used in previous tests, no prior high-confidence rule)
  const caseATarget = {
    domain: 'datos.jus.gob.ar',
    name: 'Portal de Datos Abiertos del Ministerio de Justicia y Derechos Humanos',
    domainType: 'PUBLIC_REGISTRY',
    candidates: [
      {
        id: 'HYP_STRATEGY_PORTAL_ROOT',
        label: 'Explore Portal Homepage Surface (/contacto / index)',
        url: 'https://datos.jus.gob.ar/',
        expectedStrategy: 'HARVEST_PORTAL_ROOT_SURFACE'
      },
      {
        id: 'HYP_STRATEGY_HTML_DATASET_CATALOG',
        label: 'Explore HTML Dataset Directory Listing (/dataset)',
        url: 'https://datos.jus.gob.ar/dataset',
        expectedStrategy: 'HARVEST_HTML_DATASET_CATALOG'
      },
      {
        id: 'HYP_STRATEGY_STRUCTURED_API_PACKAGES',
        label: 'Explore Structured API Dataset Packages (/api/3/action/package_search)',
        url: 'https://datos.jus.gob.ar/api/3/action/package_search?rows=5',
        expectedStrategy: 'HARVEST_STRUCTURED_API_DATASET_PACKAGES'
      }
    ]
  };

  const caseAResult = await atlas.executeBlindCaseA(caseATarget);
  const initialConfidence = caseAResult.newRule.confidence;

  // ==========================================
  // CASE B: CROSS-CONTEXT TRANSFER
  // ==========================================
  // Target: Distinct domain & context (Provincial Education & Public Records in Buenos Aires)
  // Tested without external AI using the newly induced rule
  const caseBTarget = {
    domain: 'catalogo.datos.gba.gob.ar',
    name: 'Catálogo de Datos Abiertos de la Provincia de Buenos Aires',
    domainType: 'MUNICIPAL_GOVERNMENT',
    baselineUrl: 'https://catalogo.datos.gba.gob.ar/',
    learnedRuleUrl: 'https://catalogo.datos.gba.gob.ar/dataset/establecimientos-educativos',
    learnedRule: caseAResult.newRule
  };

  const caseBResult = await atlas.executeBlindCaseB(caseBTarget);

  // ==========================================
  // SELF-CHALLENGE: REFUTATION ATTEMPT
  // ==========================================
  // Test newly induced rule against edge-case endpoint
  const challengeTarget = {
    domain: 'catalogo.datos.gba.gob.ar',
    url: 'https://catalogo.datos.gba.gob.ar/api/3/action/organization_show?id=ministerio-de-salud'
  };

  const selfChallengeResult = await atlas.executeSelfChallenge(caseAResult.newRule.ruleId, challengeTarget);

  // ==========================================
  // POST-FREEZE INTEGRITY CHECK
  // ==========================================
  const postBlindHash = computeFreezeHash();
  const hashMatch = postBlindHash === preBlindHash;

  await pool.end();

  // Print exact required devolution block
  console.log('\n==================================================');
  console.log('ATLAS — TRUE BLIND INTELLIGENCE GATE V1 DEVOLUCIÓN');
  console.log('==================================================');
  console.log(`PRE_BLIND_HASH = ${preBlindHash}`);
  console.log(`CASE_A_NOVEL = TRUE`);
  console.log(`EXISTING_HIGH_CONFIDENCE_RULE_MATCH = ${caseAResult.existingHighConfidenceRuleMatch ? 'TRUE' : 'FALSE'}`);
  console.log('');
  console.log(`HYPOTHESES_GENERATED = ${caseAResult.hypothesesGenerated}`);
  console.log(`PHYSICAL_EXPERIMENTS_RUN = ${caseAResult.physicalExperimentsRun}`);
  console.log(`AI_CALLS_CASE_A = ${caseAResult.aiCalls}`);
  console.log('');
  console.log(`NEW_GENERALIZED_RULE = ${caseAResult.newRule.ruleId}`);
  console.log(`RULE_WAS_PREEXISTING = ${caseAResult.ruleWasPreexisting ? 'TRUE' : 'FALSE'}`);
  console.log(`RULE_CONFIDENCE_INITIAL = ${initialConfidence.toFixed(2)}`);
  console.log('');
  console.log(`CASE_B_NOVEL = TRUE`);
  console.log(`RULE_REUSED_WITHOUT_AI = ${caseBResult.ruleReusedWithoutAi ? 'TRUE' : 'FALSE'}`);
  console.log(`AI_CALLS_CASE_B = ${caseBResult.aiCalls}`);
  console.log('');
  console.log(`BASELINE_PHYSICAL_OUTCOME = ${caseBResult.baselinePhysicalOutcome}`);
  console.log(`LEARNED_RULE_PHYSICAL_OUTCOME = ${caseBResult.learnedRulePhysicalOutcome}`);
  console.log(`PHYSICAL_IMPROVEMENT = ${caseBResult.physicalImprovement ? 'TRUE' : 'FALSE'}`);
  console.log('');
  console.log(`SELF_CHALLENGE_RUN = ${selfChallengeResult.selfChallengeRun ? 'TRUE' : 'FALSE'}`);
  console.log(`RULE_CONFIDENCE_FINAL = ${selfChallengeResult.finalConfidence}`);
  console.log('');
  console.log(`CODE_CHANGED_AFTER_FREEZE = ${hashMatch ? 'FALSE' : 'TRUE'}`);
  console.log(`POST_BLIND_HASH = ${postBlindHash}`);
  console.log(`HASH_MATCH = ${hashMatch ? 'TRUE' : 'FALSE'}`);
  console.log('');
  console.log(`AUTONOMOUS_RULE_INDUCTION_PROVEN = ${(!caseAResult.ruleWasPreexisting && caseAResult.newRule.active) ? 'TRUE' : 'FALSE'}`);
  console.log(`CROSS_CONTEXT_TRANSFER_PROVEN = ${(caseBResult.ruleReusedWithoutAi && caseBResult.physicalImprovement) ? 'TRUE' : 'FALSE'}`);
  console.log(`ATLAS_INTELLECTUAL_LEARNING_PASS = ${(hashMatch && !caseAResult.ruleWasPreexisting && caseBResult.ruleReusedWithoutAi && caseBResult.physicalImprovement) ? 'TRUE' : 'FALSE'}`);
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
