import { describe, it, expect, beforeEach } from 'vitest';
import { ObjectiveInterpreter } from '../src/lib/atlasGeneralEngine/ObjectiveInterpreter';
import { MissionGraph } from '../src/lib/atlasGeneralEngine/MissionGraph';
import { MissionSuccessFunction } from '../src/lib/atlasGeneralEngine/MissionSuccessFunction';
import { AtlasGeneralMemory } from '../src/lib/atlasGeneralEngine/AtlasGeneralMemory';
import { MultiStrategyGenerator } from '../src/lib/atlasGeneralEngine/MultiStrategyGenerator';
import { NextBestActionEngine } from '../src/lib/atlasGeneralEngine/NextBestActionEngine';
import { ExperimentationEngine } from '../src/lib/atlasGeneralEngine/ExperimentationEngine';
import { EvidenceGate } from '../src/lib/atlasGeneralEngine/EvidenceGate';
import { AdaptiveReplanner } from '../src/lib/atlasGeneralEngine/AdaptiveReplanner';
import { CrossMissionLearner } from '../src/lib/atlasGeneralEngine/CrossMissionLearner';
import { GeneralObjectiveIntelligenceEngine } from '../src/lib/atlasGeneralEngine/GeneralObjectiveIntelligenceEngine';

describe('Atlas General Objective Intelligence Engine V1 Suite', () => {

  beforeEach(() => {
    AtlasGeneralMemory.initialize();
  });

  // 1. Objective Interpreter
  describe('ObjectiveInterpreter (Section 4)', () => {
    it('correctly interprets an EXPERT_DISCOVERY mission', () => {
      const spec = ObjectiveInterpreter.interpret({
        text: 'Encontrar expertos en energía nuclear en Argentina',
        targetQuantity: 10
      });
      expect(spec.objectiveType).toBe('EXPERT_DISCOVERY');
      expect(spec.targetEntityType).toBe('PERSON');
      expect(spec.geography).toContain('ARG');
      expect(spec.domainTopics).toContain('nuclear');
      expect(spec.targetQuantity).toBe(10);
    });

    it('correctly interprets an ORGANIZATION_DISCOVERY mission', () => {
      const spec = ObjectiveInterpreter.interpret({
        text: 'Identificar empresas argentinas proveedoras de tecnología médica',
        targetQuantity: 5
      });
      expect(spec.objectiveType).toBe('ORGANIZATION_DISCOVERY');
      expect(spec.targetEntityType).toBe('ORGANIZATION');
      expect(spec.domainTopics).toContain('medica');
    });

    it('correctly interprets a SOURCE_DISCOVERY mission', () => {
      const spec = ObjectiveInterpreter.interpret({
        text: 'Descubrir fuentes públicas y repositorios sobre litio',
        targetQuantity: 4
      });
      expect(spec.objectiveType).toBe('SOURCE_DISCOVERY');
      expect(spec.targetEntityType).toBe('PUBLIC_SOURCE');
      expect(spec.domainTopics).toContain('litio');
    });

    it('correctly interprets a PUBLIC_CONTACT_DISCOVERY mission', () => {
      const spec = ObjectiveInterpreter.interpret({
        text: 'Obtener contactos y correos públicos de obras públicas',
        targetQuantity: 3
      });
      expect(spec.objectiveType).toBe('PUBLIC_CONTACT_DISCOVERY');
      expect(spec.targetEntityType).toBe('CONTACT_CHANNEL');
    });

    it('correctly interprets a CONTENT_DISCOVERY mission', () => {
      const spec = ObjectiveInterpreter.interpret({
        text: 'Buscar videos y conferencias sobre historia económica',
        targetQuantity: 6
      });
      expect(spec.objectiveType).toBe('CONTENT_DISCOVERY');
      expect(spec.targetEntityType).toBe('VIDEO_CONTENT');
    });
  });

  // 2. Mission Graph DAG
  describe('MissionGraph (Section 5)', () => {
    it('builds DAG with sequential dependencies', () => {
      const spec = ObjectiveInterpreter.interpret({ text: 'expertos en nuclear' });
      const graph = new MissionGraph(spec);
      expect(graph.subgoals.size).toBe(5);

      const next1 = graph.getNextExecutableSubgoal();
      expect(next1?.id).toBe('SUB_DOMAIN_EXPANSION');

      graph.completeSubgoal('SUB_DOMAIN_EXPANSION');
      const next2 = graph.getNextExecutableSubgoal();
      expect(next2?.id).toBe('SUB_SOURCE_IDENTIFICATION');

      expect(graph.isComplete()).toBe(false);
    });
  });

  // 3. Multi-Strategy Generation & Experimentation
  describe('MultiStrategyGenerator & ExperimentationEngine (Sections 9 & 11)', () => {
    it('generates multiple distinct strategies and runs bounded micro-experiments', async () => {
      const spec = ObjectiveInterpreter.interpret({ text: 'expertos en nuclear' });
      const strategies = MultiStrategyGenerator.generateStrategies(spec);
      expect(strategies.length).toBeGreaterThanOrEqual(3);

      const mockExecutor = async (strat: any, limit: number) => {
        return [
          {
            id: 'item_1',
            canonicalKey: 'CAN_1',
            title: 'Dr. Test Nuclear Expert',
            entityType: 'PERSON' as const,
            primaryDetails: { role: 'Investigador CNEA', geography: 'ARG / CABA' },
            evidenceBadges: ['CNEA'],
            evidenceSummary: 'Investigador verificado',
            specializedEngineOrigin: strat.strategyId,
            missionRelevanceScore: 0.85,
            provenance: { sourceId: 'PEOPLE_SEARCH_V2' }
          }
        ];
      };

      const { winner, outcomes } = await ExperimentationEngine.evaluateStrategies(spec, strategies, mockExecutor);
      expect(winner).toBeDefined();
      expect(winner.status).toBe('ACTIVE');
      expect(outcomes.length).toBe(strategies.length);
    });
  });

  // 4. Evidence Gate
  describe('EvidenceGate (Section 12)', () => {
    const spec = ObjectiveInterpreter.interpret({ text: 'expertos en nuclear' });

    it('rejects items missing observation provenance', () => {
      const item: any = {
        title: 'Persona Desconocida',
        canonicalKey: 'KEY_1',
        entityType: 'PERSON',
        primaryDetails: { geography: 'ARG' },
        provenance: {}
      };
      const verdict = EvidenceGate.verify(item, spec);
      expect(verdict.passed).toBe(false);
      expect(verdict.rejectionReason).toBe('MISSING_OBSERVATION_PROVENANCE');
    });

    it('rejects prohibited synthetic data', () => {
      const item: any = {
        title: 'AI Guessed Expert',
        canonicalKey: 'KEY_2',
        entityType: 'PERSON',
        primaryDetails: { geography: 'ARG' },
        provenance: { sourceId: 'TEST', isSynthetic: true }
      };
      const verdict = EvidenceGate.verify(item, spec);
      expect(verdict.passed).toBe(false);
      expect(verdict.rejectionReason).toBe('PROHIBITED_SYNTHETIC_DATA');
    });

    it('verifies items with valid physical observation and Argentina linkage', () => {
      const item: any = {
        title: 'Dra. Elena Banfi',
        canonicalKey: 'KEY_3',
        entityType: 'PERSON',
        primaryDetails: { role: 'Jefa de Reactores', geography: 'ARG / BUENOS AIRES' },
        evidenceBadges: ['CNEA_AUTORIDADES'],
        provenance: { sourceId: 'CNEA_BOLETIN_OFICIAL', sourceUrl: 'https://cnea.gob.ar' }
      };
      const verdict = EvidenceGate.verify(item, spec);
      expect(verdict.passed).toBe(true);
      expect(verdict.confidence).toBeGreaterThanOrEqual(0.70);
    });
  });

  // 5. Adaptive Replanner
  describe('AdaptiveReplanner (Section 13)', () => {
    it('triggers replan when strategy stalls after wave 2', () => {
      const spec = ObjectiveInterpreter.interpret({ text: 'empresas tecnologia medica', targetQuantity: 10 });
      const graph = new MissionGraph(spec);
      const replanner = new AdaptiveReplanner();

      const strategies: any[] = [
        { strategyId: 'STRAT_A', status: 'ACTIVE' },
        { strategyId: 'STRAT_B', status: 'PROPOSED' }
      ];

      // Wave 2 with 0 items accumulated
      const decision = replanner.evaluateReplan(spec, graph, strategies, [], 2);
      expect(decision.triggered).toBe(true);
      expect(strategies[0].status).toBe('DEPLETED');
      expect(strategies[1].status).toBe('ACTIVE');
      expect(decision.newStrategyId).toBe('STRAT_B');
    });
  });

  // 6. Cross-Mission Transfer Learner
  describe('CrossMissionLearner (Section 14 & 15)', () => {
    it('synthesizes general heuristics and logs transferable lessons', () => {
      const spec = ObjectiveInterpreter.interpret({ text: 'expertos en nuclear' });
      const mockResults: any[] = [{ id: '1', title: 'Experto' }];
      const lessons = CrossMissionLearner.synthesizeMissionLessons(spec, mockResults, 'STRAT_WINNER');

      expect(lessons.length).toBeGreaterThan(0);
      expect(lessons[0].rule).toContain('Domain expert resolution');

      CrossMissionLearner.recordTransfer({
        transferId: 'TEST_XFER_1',
        sourceMissionId: 'M1',
        sourceMissionType: 'EXPERT_DISCOVERY',
        targetMissionId: 'M2',
        targetMissionType: 'ORGANIZATION_DISCOVERY',
        heuristicRuleApplied: lessons[0].rule,
        success: true,
        notes: 'Transfer verified'
      });

      const transfers = CrossMissionLearner.getTransferRecords();
      expect(transfers.length).toBeGreaterThan(0);
    });
  });

  // 7. Full Autonomous Mission Execution
  describe('GeneralObjectiveIntelligenceEngine End-to-End', () => {
    it('executes open-ended mission and produces verified MissionExecutionReport', async () => {
      const engine = GeneralObjectiveIntelligenceEngine.getInstance();
      const report = await engine.executeMission({
        text: 'Encontrar fuentes públicas y datasets de litio en Argentina',
        targetQuantity: 3
      });

      expect(report.missionSuccess).toBe(true);
      expect(report.observedResultsCount).toBeGreaterThanOrEqual(3);
      expect(report.overallScore).toBeGreaterThanOrEqual(0.70);
      expect(report.initialStrategies.length).toBeGreaterThanOrEqual(2);
      expect(report.strategiesTested.length).toBeGreaterThanOrEqual(1);
      expect(report.evidenceProvenanceRetained).toBe(true);
      expect(report.argentinaLinkageVerified).toBe(true);
    });
  });
});
