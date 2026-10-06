/**
 * ATLAS — SOURCE KNOWLEDGE MAP SSOT REPAIR & INTEGRATION TESTS
 * File: src/tests/atlas_source_knowledge_map_ssot.test.ts
 * 
 * Verifies that:
 * 1. public.atlas_source_knowledge_map is the sole authoritative SSOT.
 * 2. SourceKnowledgeMap is a repository / adapter / rebuildable cache over the SSOT.
 * 3. In-memory 6-source seed is removed from production authority.
 * 4. All 43+ real historical sources and 13+ families are visible and active.
 * 5. Learning is written through to PostgreSQL SSOT and visible across processes/instances.
 * 6. CROSS_PROCESS_SOURCE_LEARNING = TRUE.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import dotenv from 'dotenv';
import {
  SourceKnowledgeMap,
  type SourceKnowledgeEntry,
  type SourceMissionFeedback
} from '../lib/atlasPathfinder/sourceIntelligence/SourceKnowledgeMap.ts';
import { SourceBrain } from '../lib/atlasPathfinder/sourceIntelligence/SourceBrain.ts';
import { SourceFamilyGapEngine } from '../lib/atlasPathfinder/sourceIntelligence/SourceFamilyGapEngine.ts';
import { AIPathfinder } from '../lib/atlasPathfinder/AIPathfinder.ts';
import type { EvidenceGoal } from '../lib/atlasPathfinder/types.ts';

dotenv.config();

function parseDbUrl() {
  const raw = (process.env.DATABASE_URL || '').trim().replace(/^['"]|['"]$/g, '');
  if (!raw) return null;
  const m = raw.match(/^postgresql:\/\/([^:]+):(.*)@([^:@/]+)(?::(\d+))?\/(.+)$/);
  if (!m) return null;
  let pass = m[2];
  if (pass.startsWith('[') && pass.endsWith(']')) {
    pass = pass.slice(1, -1);
  }
  return {
    user: m[1],
    password: pass,
    host: m[3],
    port: m[4] ? parseInt(m[4], 10) : 6543,
    database: m[5],
    ssl: { rejectUnauthorized: false }
  };
}

describe('ATLAS — SOURCE KNOWLEDGE MAP SSOT TESTS (PRE-FREEZE V3B)', () => {
  let dbPool: any = null;

  beforeAll(async () => {
    const config = parseDbUrl();
    if (config) {
      dbPool = new pg.Pool({ ...config, max: 2 });
    }
  });

  afterAll(async () => {
    if (dbPool) {
      await dbPool.end().catch(() => {});
    }
    await SourceKnowledgeMap.closeSharedPool();
  });

  /**
   * TEST 1: SourceKnowledgeMap production carga desde PostgreSQL SSOT, no desde seeds.
   */
  it('TEST 1: SourceKnowledgeMap production carga desde PostgreSQL SSOT, no desde seeds', async () => {
    SourceKnowledgeMap.resetForTest();
    const map = SourceKnowledgeMap.getInstance();

    await map.loadFromSSOT(true);

    expect(map.isSSOTConnected()).toBe(true);
    const sources = map.getAllSources();

    // Production count must reflect real PostgreSQL inventory (>= 43), NOT the 6 seeds
    expect(sources.length).toBeGreaterThanOrEqual(43);

    // Must not be identical to private seed inventory of 6
    expect(sources.length).not.toBe(6);
  });

  /**
   * TEST 2: Las 43 fuentes existentes son visibles.
   */
  it('TEST 2: Las 43 fuentes existentes son visibles', async () => {
    const map = SourceKnowledgeMap.getInstance();
    await map.loadFromSSOT();

    const sources = map.getAllSources();
    expect(sources.length).toBeGreaterThanOrEqual(43);

    const sourceIds = new Set(sources.map(s => s.source_id));

    // Verify key historical sources from different categories exist
    expect(sourceIds.has('SRC_OAI_CONICET_DIGITAL')).toBe(true);
    expect(sourceIds.has('SRC_PUB_BOLETIN_OFICIAL')).toBe(true);
    expect(sourceIds.has('SRC_PUB_DATOS_GOB_AR_OSC')).toBe(true);
    expect(sourceIds.has('SRC_OAI_SEDICI_UNLP')).toBe(true);
    expect(sourceIds.has('SRC_OAI_UNLAM_DIGITAL')).toBe(true);
    expect(sourceIds.has('SRC_OAI_UNQ_DIGITAL')).toBe(true);
    expect(sourceIds.has('SRC_CKAN_DATOS_PBA')).toBe(true);
    expect(sourceIds.has('SRC_CKAN_BA_DATA_GCBA')).toBe(true);
    expect(sourceIds.has('SRC_MOTOR_WD_MOTOR_PUBLIC_OFFICIALS')).toBe(true);
    expect(sourceIds.has('SRC_MOTOR_OA_MOTOR_UBA')).toBe(true);
  });

  /**
   * TEST 3: Las 13 familias existentes son visibles.
   */
  it('TEST 3: Las 13 familias existentes son visibles', async () => {
    const map = SourceKnowledgeMap.getInstance();
    await map.loadFromSSOT();

    const families = new Set(map.getAllSources().map(s => s.source_family));

    const historical13Families = [
      'OPENALEX',
      'WIKIDATA',
      'OAI_PMH',
      'PUBLIC_OPEN_DATA',
      'BA_DATA',
      'BOLETIN_OFICIAL',
      'CONICET',
      'DATOS_GBA',
      'DATOS_GOB_AR',
      'MINCYT',
      'UNLAM',
      'UNLP',
      'UNQ'
    ];

    for (const fam of historical13Families) {
      expect(families.has(fam)).toBe(true);
    }

    expect(families.size).toBeGreaterThanOrEqual(13);
  });

  /**
   * TEST 4: SourceBrain reutiliza una fuente histórica que no pertenece a las seis seeds.
   */
  it('TEST 4: SourceBrain reutiliza una fuente histórica que no pertenece a las seis seeds', async () => {
    SourceBrain.resetForTest();
    const brain = SourceBrain.getInstance();
    await brain.getKnowledgeMap().loadFromSSOT();

    // Goal for public judiciary figures in Wikidata knowledge graph (historical family not in 6 seeds)
    const goal: EvidenceGoal = {
      id: 'EVID_GOAL_JUDICIAL_LEADERS',
      statement_to_prove: 'Magistrados, jueces y juristas en base enciclopedica sparql wikidata',
      subject_role: 'PERSON',
      predicate: 'HOLDS_JUDICIAL_OFFICE',
      acceptable_evidence_types: ['OFFICIAL_RECORD', 'KNOWLEDGE_GRAPH_ENTRY'],
      preferred_source_classes: ['KNOWLEDGE_GRAPH'],
      verification_test: 'Verificacion en grafo de conocimiento de juristas'
    };

    const decision = brain.evaluateGoal(goal, 'Argentina');

    expect(decision.gapDetected).toBe(false);
    expect(decision.selectedSourceId).toBeDefined();

    // Selected source must belong to historical SSOT family WIKIDATA (not one of the 6 seeds)
    const selected = brain.getKnowledgeMap().getSource(decision.selectedSourceId!);
    expect(selected).toBeDefined();
    expect(selected?.source_family).toBe('WIKIDATA');
    expect(['SRC_MOTOR_WD_MOTOR_JURISTS_JUDGES', 'SRC_SPARQL_WD_PUBLIC_OFFICIALS', 'SRC_MOTOR_WD_MOTOR_PUBLIC_OFFICIALS']).toContain(selected?.source_id);
  });

  /**
   * TEST 5: Fuente nueva descubierta queda persistida en PostgreSQL.
   */
  it('TEST 5: Fuente nueva descubierta queda persistida en PostgreSQL', async () => {
    const map = SourceKnowledgeMap.getInstance();
    await map.loadFromSSOT();

    const testSourceId = `SRC_DISC_TEST_PERSIST_${Date.now()}`;
    const newEntry: SourceKnowledgeEntry = {
      source_id: testSourceId,
      source_name: 'Test Discovered Source for SSOT Verification',
      source_family: 'TEST_DISCOVERY_FAMILY',
      source_universe: 'UNIVERSE_TEST_DISCOVERY',
      canonical_url: 'https://test-discovery.gob.ar/api',
      parent_domain: 'test-discovery.gob.ar',
      access_method: 'REST_API',
      protocol: 'REST_API',
      geography_scope: 'ARGENTINA',
      topics: ['test', 'discovery', 'persistencia'],
      entity_types_observed: ['TEST_ENTITY'],
      relation_types_observed: ['TEST_RELATION'],
      evidence_types_observed: ['TEST_EVIDENCE'],
      evidence_goals_solved: ['test_goal_persisted'],
      source_class: 'OPEN_DATA',
      volume_estimate: 15000,
      realized_yield: 0.88,
      qualified_yield: 0.82,
      qualified_per_second: 11.0,
      novelty: 0.90,
      overlap: 0.10,
      latency_ms: 90,
      reliability_score: 0.95,
      saturation: 0.05,
      current_status: 'CANARY',
      last_tested: new Date().toISOString(),
      last_success: new Date().toISOString(),
      failure_modes: []
    };

    // Register into map
    map.registerSource(newEntry);
    await map.syncToSSOT();

    // Verify row physically in PostgreSQL
    if (dbPool) {
      const dbCheck = await dbPool.query(
        'SELECT source_id, source_family, current_status FROM public.atlas_source_knowledge_map WHERE source_id = $1;',
        [testSourceId]
      );
      expect(dbCheck.rowCount).toBe(1);
      expect(dbCheck.rows[0].source_id).toBe(testSourceId);
      expect(dbCheck.rows[0].source_family).toBe('TEST_DISCOVERY_FAMILY');

      // Cleanup
      await dbPool.query('DELETE FROM public.atlas_source_knowledge_map WHERE source_id = $1;', [testSourceId]);
    }
  });

  /**
   * TEST 6: Una segunda instancia/proceso puede ver el aprendizaje de la primera.
   */
  it('TEST 6: Una segunda instancia/proceso puede ver el aprendizaje de la primera', async () => {
    const instanceA = SourceKnowledgeMap.getInstance();
    await instanceA.loadFromSSOT();

    const targetSourceId = 'SRC_OAI_UNQ_DIGITAL';

    // Instance A records observation
    instanceA.recordMissionObservation({
      source_id: targetSourceId,
      goal_id: 'GOAL_LEARNING_CROSS_INSTANCE',
      candidates_found: 10,
      verified: 9,
      qualified: 8,
      latency_ms: 85,
      evidence_coverage: 1.0,
      novelty: 0.90,
      overlap: 0.10
    });

    await instanceA.syncToSSOT();

    // Destroy local memory instance
    SourceKnowledgeMap.resetForTest();

    // Instance B creates fresh in-memory projection from SSOT
    const instanceB = SourceKnowledgeMap.getInstance();
    await instanceB.loadFromSSOT(true);

    const reloaded = instanceB.getSource(targetSourceId);
    expect(reloaded).toBeDefined();
    expect(reloaded?.current_status).toBe('PROMOTED');
    expect(reloaded?.qualified_yield).toBeGreaterThanOrEqual(0.60);
    expect(reloaded?.evidence_goals_solved).toContain('GOAL_LEARNING_CROSS_INSTANCE');
  });

  /**
   * TEST 7: Reinicio del proceso no pierde aprendizaje.
   */
  it('TEST 7: Reinicio del proceso no pierde aprendizaje', async () => {
    const map1 = SourceKnowledgeMap.getInstance();
    await map1.loadFromSSOT();

    const targetSourceId = 'SRC_OAI_UNLAM_DIGITAL';
    map1.updateSourceMetrics(targetSourceId, {
      evidence_goals_solved: ['GOAL_UNLAM_PERSISTENT_MEMORY']
    });
    await map1.syncToSSOT();

    // Complete reset (simulates process crash / restart)
    SourceKnowledgeMap.resetForTest();
    SourceBrain.resetForTest();

    const map2 = SourceKnowledgeMap.getInstance();
    await map2.loadFromSSOT(true);

    const restored = map2.getSource(targetSourceId);
    expect(restored?.evidence_goals_solved).toContain('GOAL_UNLAM_PERSISTENT_MEMORY');
  });

  /**
   * TEST 8: Cache local puede reconstruirse totalmente desde SSOT.
   */
  it('TEST 8: Cache local puede reconstruirse totalmente desde SSOT', async () => {
    const map = SourceKnowledgeMap.getInstance();
    await map.rebuildCacheFromSSOT();

    expect(map.isSSOTConnected()).toBe(true);
    expect(map.getAllSources().length).toBeGreaterThanOrEqual(43);
  });

  /**
   * TEST 9: Seed duplicado no crea segunda source identity.
   */
  it('TEST 9: Seed duplicado no crea segunda source identity', async () => {
    const map = SourceKnowledgeMap.getInstance();
    await map.loadFromSSOT();

    // Alias lookup must return canonical source
    const boletin = map.getSource('SRC_BOLETIN_OFICIAL_NACION');
    expect(boletin).toBeDefined();
    expect(boletin?.source_id).toBe('SRC_PUB_BOLETIN_OFICIAL');

    const sedici = map.getSource('SRC_SEDICI_UNLP_ACADEMIA');
    expect(sedici).toBeDefined();
    expect(sedici?.source_id).toBe('SRC_OAI_SEDICI_UNLP');

    // Registering alias must not produce parallel duplicate
    const countBefore = map.getAllSources().length;
    map.registerSource({
      ...boletin!,
      source_id: 'SRC_BOLETIN_OFICIAL_NACION'
    });
    const countAfter = map.getAllSources().length;
    expect(countAfter).toBe(countBefore);
  });

  /**
   * TEST 10: Source Family Gap evalúa cobertura contra el inventario central completo.
   */
  it('TEST 10: Source Family Gap evalúa cobertura contra el inventario central completo', async () => {
    const brain = SourceBrain.getInstance();
    await brain.getKnowledgeMap().loadFromSSOT();

    // Goal matching university research covered by OAI_PMH / UNLP / CONICET
    const coveredGoal: EvidenceGoal = {
      id: 'EVID_GOAL_ACADEMIC_RESEARCH_NATIONAL',
      statement_to_prove: 'Produccion cientifica y patentes de universidades nacionales argentinas',
      subject_role: 'INSTITUTION',
      predicate: 'PUBLISHES_RESEARCH',
      acceptable_evidence_types: ['SCIENTIFIC_REPORT'],
      preferred_source_classes: ['RESEARCH_REPOSITORY', 'UNIVERSITY_REPOSITORY'],
      verification_test: 'Verificable en repositorios cientificos universitarios'
    };

    const decision = brain.evaluateGoal(coveredGoal, 'Argentina');
    // Must NOT declare gap because SSOT has CONICET, UNLP, UNLAM, UNQ
    expect(decision.gapDetected).toBe(false);
    expect(['KNOWN_WINNER', 'KNOWN_ALTERNATIVE']).toContain(decision.category);
  });

  /**
   * TEST 11: Zero-yield update persiste y afecta la siguiente selección.
   */
  it('TEST 11: Zero-yield update persiste y afecta la siguiente selección', async () => {
    const map = SourceKnowledgeMap.getInstance();
    await map.loadFromSSOT();

    const testDormantSourceId = 'SRC_PUB_DATOS_GOB_AR_OSC';

    // Record zero yield (failure to produce records)
    map.recordMissionObservation({
      source_id: testDormantSourceId,
      candidates_found: 20,
      verified: 0,
      qualified: 0,
      latency_ms: 500,
      evidence_coverage: 0,
      novelty: 0,
      overlap: 1.0,
      failure_reason: 'ZERO_YIELD_PROBE'
    });

    await map.syncToSSOT();

    const updated = map.getSource(testDormantSourceId);
    expect(updated?.current_status).toBe('DORMANT');

    // Reconstruct memory from SSOT
    SourceKnowledgeMap.resetForTest();
    const freshMap = SourceKnowledgeMap.getInstance();
    await freshMap.loadFromSSOT(true);

    expect(freshMap.getSource(testDormantSourceId)?.current_status).toBe('DORMANT');

    // Restore to PROMOTED for continuous operation
    freshMap.updateSourceMetrics(testDormantSourceId, { current_status: 'PROMOTED', qualified_yield: 0.85 });
    await freshMap.syncToSSOT();
  });

  /**
   * TEST 12: High-qualified-yield update persiste y afecta la siguiente selección.
   */
  it('TEST 12: High-qualified-yield update persiste y afecta la siguiente selección', async () => {
    const map = SourceKnowledgeMap.getInstance();
    await map.loadFromSSOT();

    const winnerId = 'SRC_OAI_CONICET_DIGITAL';

    map.recordMissionObservation({
      source_id: winnerId,
      goal_id: 'GOAL_HIGH_YIELD_PRIORITIZATION',
      candidates_found: 10,
      verified: 10,
      qualified: 10,
      latency_ms: 80,
      evidence_coverage: 1.0,
      novelty: 0.95,
      overlap: 0.05
    });

    await map.syncToSSOT();

    const winner = map.getSource(winnerId);
    expect(winner?.current_status).toBe('PROMOTED');
    expect(winner?.qualified_yield).toBe(1.0);

    // SourceBrain selects it as KNOWN_WINNER
    const brain = SourceBrain.getInstance();
    const goal: EvidenceGoal = {
      id: 'GOAL_HIGH_YIELD_PRIORITIZATION',
      statement_to_prove: 'scientific_development_evidence',
      subject_role: 'PERSON',
      predicate: 'AUTHORED_BY',
      acceptable_evidence_types: ['SCIENTIFIC_REPORT'],
      preferred_source_classes: ['RESEARCH_REPOSITORY'],
      verification_test: 'Verificacion'
    };

    const decision = brain.evaluateGoal(goal, 'Argentina');
    expect(decision.category).toBe('KNOWN_WINNER');
    expect(decision.selectedSourceId).toBe(winnerId);
  });

  /**
   * SECTION 12: TEST CRÍTICO DE CROSS-MISSION LEARNING
   * 
   * MISSION A:
   *   → utiliza fuente
   *   → actualiza SSOT
   * 
   * Destruir / recrear instancia local
   * 
   * MISSION B:
   *   → consulta SSOT
   *   → reutiliza aprendizaje de Mission A
   * 
   * Exigir:
   *   CROSS_PROCESS_SOURCE_LEARNING = TRUE
   */
  it('TEST CRÍTICO DE CROSS-MISSION LEARNING (CROSS_PROCESS_SOURCE_LEARNING = TRUE)', async () => {
    // 1. MISSION A INITIALIZATION
    const targetSource = 'SRC_OAI_CONICET_DIGITAL';
    const missionAGoalId = `GOAL_MISSION_A_DISCOVERY_${Date.now()}`;

    const mapA = SourceKnowledgeMap.getInstance();
    await mapA.loadFromSSOT();

    // Mission A records verified qualification and marks goal solved
    mapA.recordMissionObservation({
      source_id: targetSource,
      goal_id: missionAGoalId,
      candidates_found: 8,
      verified: 8,
      qualified: 7,
      latency_ms: 110,
      evidence_coverage: 1.0,
      novelty: 0.92,
      overlap: 0.08
    });

    await mapA.syncToSSOT();

    // 2. COMPLETE DESTRUCTION OF LOCAL PROCESS MEMORY
    SourceKnowledgeMap.resetForTest();
    SourceBrain.resetForTest();

    // 3. MISSION B RUNTIME (Fresh Process Instance)
    const mapB = SourceKnowledgeMap.getInstance();
    await mapB.loadFromSSOT(true);

    const reloadedFromSSOT = mapB.getSource(targetSource);
    expect(reloadedFromSSOT).toBeDefined();

    // Verify Mission B can read the evidence goal solved by Mission A from PostgreSQL SSOT
    const learnedByMissionA = reloadedFromSSOT?.evidence_goals_solved.includes(missionAGoalId);
    expect(learnedByMissionA).toBe(true);

    // Verify SourceBrain in Mission B ranks this source as KNOWN_WINNER for that specific goal
    const brainB = SourceBrain.getInstance();
    const missionBGoal: EvidenceGoal = {
      id: missionAGoalId,
      statement_to_prove: 'Investigacion y patentes con transferencia comprobada',
      subject_role: 'TECHNOLOGY',
      predicate: 'DEVELOPED_AT',
      acceptable_evidence_types: ['SCIENTIFIC_REPORT'],
      preferred_source_classes: ['RESEARCH_REPOSITORY'],
      verification_test: 'Repositorio cientifico'
    };

    const decisionB = brainB.evaluateGoal(missionBGoal, 'Argentina');
    expect(decisionB.category).toBe('KNOWN_WINNER');
    expect(decisionB.selectedSourceId).toBe(targetSource);

    const CROSS_PROCESS_SOURCE_LEARNING = learnedByMissionA && decisionB.category === 'KNOWN_WINNER';
    expect(CROSS_PROCESS_SOURCE_LEARNING).toBe(true);
    console.log('\n>>> CROSS_PROCESS_SOURCE_LEARNING = TRUE (Verified against PostgreSQL SSOT) <<<\n');
  });
});
