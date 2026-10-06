import { describe, it, expect, beforeEach } from 'vitest';
import { DynamicSchemaDesigner } from '../src/lib/atlasPathfinder/DynamicSchemaDesigner';
import { DatabaseCompletenessMap } from '../src/lib/atlasPathfinder/DatabaseCompletenessMap';
import { PathScorer } from '../src/lib/atlasPathfinder/PathScorer';
import { PathGenerator } from '../src/lib/atlasPathfinder/PathGenerator';
import { BoundedPathTester } from '../src/lib/atlasPathfinder/BoundedPathTester';
import { FailureMemory } from '../src/lib/atlasPathfinder/FailureMemory';
import { OntologyDiscovery } from '../src/lib/atlasPathfinder/OntologyDiscovery';
import { PersistentMissionDatabase } from '../src/lib/atlasPathfinder/PersistentMissionDatabase';
import { AIPathfinder } from '../src/lib/atlasPathfinder/AIPathfinder';
import type { DatabaseRecord, PathPlan } from '../src/lib/atlasPathfinder/types';

describe('Atlas AI Pathfinder V1 Core Test Suite', () => {

  beforeEach(() => {
    FailureMemory.initialize();
  });

  describe('1. DynamicSchemaDesigner (Section 2)', () => {
    it('dynamically derives PERSON schema for expert objective', () => {
      const analysis = DynamicSchemaDesigner.designSchema(
        'Crear una base de datos de emprendedores e investigadores argentinos en inteligencia artificial',
        10
      );
      expect(analysis.entityType).toBe('PERSON');
      expect(analysis.targetQuantity).toBe(10);
      expect(analysis.schema.canonicalRelationField).toBe('canonical_person_id');
      expect(analysis.schema.fields.some(f => f.name === 'name')).toBe(true);
      expect(analysis.schema.fields.some(f => f.name === 'organization')).toBe(true);
      expect(analysis.schema.fields.some(f => f.name === 'relevance_evidence')).toBe(true);
    });

    it('dynamically derives ORGANIZATION schema for company objective', () => {
      const analysis = DynamicSchemaDesigner.designSchema(
        'Base de datos de empresas argentinas de tecnología médica y laboratorios',
        8
      );
      expect(analysis.entityType).toBe('ORGANIZATION');
      expect(analysis.schema.canonicalRelationField).toBe('cuit');
      expect(analysis.schema.fields.some(f => f.name === 'organization_name')).toBe(true);
      expect(analysis.schema.fields.some(f => f.name === 'cuit')).toBe(true);
      expect(analysis.schema.fields.some(f => f.name === 'source_registry')).toBe(true);
    });

    it('dynamically derives PUBLIC_SOURCE schema for dataset repository objective', () => {
      const analysis = DynamicSchemaDesigner.designSchema(
        'Repositorios y fuentes públicas abiertas de energía y litio en Argentina',
        6
      );
      expect(analysis.entityType).toBe('PUBLIC_SOURCE');
      expect(analysis.schema.canonicalRelationField).toBe('source_id');
      expect(analysis.schema.fields.some(f => f.name === 'access_url')).toBe(true);
      expect(analysis.schema.fields.some(f => f.name === 'public_access_status')).toBe(true);
    });

    it('dynamically derives CONTACT_CHANNEL schema for public contact objective', () => {
      const analysis = DynamicSchemaDesigner.designSchema(
        'Canales de contacto y correos públicos de obras públicas y municipios',
        5
      );
      expect(analysis.entityType).toBe('CONTACT_CHANNEL');
      expect(analysis.schema.canonicalRelationField).toBe('contact_id');
      expect(analysis.schema.fields.some(f => f.name === 'contact_channel')).toBe(true);
      expect(analysis.schema.fields.some(f => f.name === 'published_domain')).toBe(true);
    });

    it('dynamically derives VIDEO_CONTENT schema for audiovisual objective', () => {
      const analysis = DynamicSchemaDesigner.designSchema(
        'Videos y documentales educativos sobre historia económica argentina',
        7
      );
      expect(analysis.entityType).toBe('VIDEO_CONTENT');
      expect(analysis.schema.canonicalRelationField).toBe('video_id');
      expect(analysis.schema.fields.some(f => f.name === 'playback_url')).toBe(true);
      expect(analysis.schema.fields.some(f => f.name === 'media_quality_score')).toBe(true);
    });
  });

  describe('2. DatabaseCompletenessMap (Section 4)', () => {
    it('detects DISCOVERY gap when database is empty', () => {
      const analysis = DynamicSchemaDesigner.designSchema('Expertos en energia nuclear', 10);
      const completeness = DatabaseCompletenessMap.evaluate(analysis.schema, [], 10);

      expect(completeness.overallCompleteness).toBe(0);
      expect(completeness.hasDiscoveryGap).toBe(true);
      expect(completeness.recommendedMode).toBe('DISCOVERY');
    });

    it('recommends ENRICHMENT when records are present but optional/contact fields are missing', () => {
      const analysis = DynamicSchemaDesigner.designSchema('Expertos en energia nuclear', 2);
      const records: DatabaseRecord[] = [
        {
          recordId: 'R1',
          canonicalRelationId: 'P1',
          data: {
            name: 'Dr. Test',
            organization: 'CNEA',
            role: 'Investigador',
            geography: 'ARG / CABA',
            sector_topic: 'nuclear',
            relevance_evidence: 'Publicación en física de reactores',
            evidence_sources: ['CNEA'],
            confidence: 0.95,
            verification_status: 'VERIFIED',
            public_contact: null // Missing!
          },
          evidenceBadges: ['Verified Identity'],
          evidenceSummary: 'Verified',
          verificationStatus: 'VERIFIED',
          provenance: { sourceId: 'CNEA', observedAt: new Date().toISOString(), specializedEngine: 'PEOPLE_SEARCH' },
          fieldCompletenessScore: 80
        },
        {
          recordId: 'R2',
          canonicalRelationId: 'P2',
          data: {
            name: 'Dra. Demo',
            organization: 'Balseiro',
            role: 'Profesora',
            geography: 'ARG / CABA',
            sector_topic: 'nuclear',
            relevance_evidence: 'Tesis doctoral en reactores',
            evidence_sources: ['IB'],
            confidence: 0.95,
            verification_status: 'VERIFIED',
            public_contact: null // Missing!
          },
          evidenceBadges: ['Verified Identity'],
          evidenceSummary: 'Verified',
          verificationStatus: 'VERIFIED',
          provenance: { sourceId: 'IB', observedAt: new Date().toISOString(), specializedEngine: 'PEOPLE_SEARCH' },
          fieldCompletenessScore: 80
        }
      ];

      const completeness = DatabaseCompletenessMap.evaluate(analysis.schema, records, 2);
      expect(completeness.fieldCompleteness['public_contact']).toBe(0);
      expect(completeness.hasEnrichmentGap).toBe(true);
      expect(completeness.recommendedMode).toBe('ENRICHMENT');
    });

    it('returns COMPLETED when target quantity and all fields are complete and verified', () => {
      const analysis = DynamicSchemaDesigner.designSchema('Expertos en energia nuclear', 1);
      const records: DatabaseRecord[] = [
        {
          recordId: 'R1',
          canonicalRelationId: 'P1',
          data: {
            name: 'Dr. Test',
            organization: 'CNEA',
            role: 'Investigador Principal',
            geography: 'ARG / CABA',
            sector_topic: 'nuclear',
            relevance_evidence: 'Publicación técnica validada',
            public_contact: 'test@cnea.gob.ar',
            evidence_sources: ['CNEA Registry'],
            confidence: 0.98,
            verification_status: 'VERIFIED'
          },
          evidenceBadges: ['Verified Identity'],
          evidenceSummary: 'Verified',
          verificationStatus: 'VERIFIED',
          provenance: { sourceId: 'CNEA', observedAt: new Date().toISOString(), specializedEngine: 'PEOPLE_SEARCH' },
          fieldCompletenessScore: 100
        }
      ];

      const completeness = DatabaseCompletenessMap.evaluate(analysis.schema, records, 1);
      expect(completeness.overallCompleteness).toBe(100);
      expect(completeness.recommendedMode).toBe('COMPLETED');
    });
  });

  describe('3. PathScorer (Section 7)', () => {
    it('scores path balancing progress, evidence strength, novelty, and cost', () => {
      const analysis = DynamicSchemaDesigner.designSchema('Expertos en inteligencia artificial', 10);
      const completeness = DatabaseCompletenessMap.evaluate(analysis.schema, [], 10);

      const pathA: PathPlan = {
        pathId: 'PATH_A',
        name: 'High yield low cost path',
        family: 'CANONICAL_PEOPLE_SEARCH',
        engineType: 'PEOPLE_SEARCH',
        expectedYield: 8,
        expectedQuality: 0.9,
        expectedNovelty: 0.8,
        expectedCost: 2,
        expectedTime: 500,
        evidenceStrength: 0.9,
        uncertainty: 0.2,
        expansionValue: 0.8,
        calculatedPathScore: 0,
        status: 'PROPOSED',
        actionSequence: ['CALL_PEOPLE_SEARCH']
      };

      const pathB: PathPlan = {
        pathId: 'PATH_B',
        name: 'High cost uncertain path',
        family: 'MEDIA',
        engineType: 'PEOPLE_SEARCH',
        expectedYield: 3,
        expectedQuality: 0.4,
        expectedNovelty: 0.3,
        expectedCost: 8,
        expectedTime: 2000,
        evidenceStrength: 0.4,
        uncertainty: 0.7,
        expansionValue: 0.3,
        calculatedPathScore: 0,
        status: 'PROPOSED',
        actionSequence: ['CALL_PEOPLE_SEARCH']
      };

      const scoreA = PathScorer.scorePath(pathA, completeness, 10);
      const scoreB = PathScorer.scorePath(pathB, completeness, 10);

      expect(scoreA).toBeGreaterThan(scoreB);
      expect(pathA.calculatedPathScore).toBe(scoreA);
    });
  });

  describe('4. BoundedPathTester (Section 11)', () => {
    it('runs empirical sample probe and promotes winning path to ACTIVE', async () => {
      const analysis = DynamicSchemaDesigner.designSchema('Expertos en litio', 5);
      const paths = PathGenerator.generateInitialPaths(analysis).slice(0, 2);

      const mockProbe = async (p: PathPlan, limit: number): Promise<DatabaseRecord[]> => {
        return [
          {
            recordId: `R_${p.pathId}_1`,
            canonicalRelationId: `C_${p.pathId}_1`,
            data: { name: 'Probe Entity' },
            evidenceBadges: ['Test'],
            evidenceSummary: 'Sample probe',
            verificationStatus: 'VERIFIED',
            provenance: { sourceId: 'test', observedAt: new Date().toISOString(), specializedEngine: 'TEST' },
            fieldCompletenessScore: 80
          }
        ];
      };

      const { winningPath, testedPaths } = await BoundedPathTester.testPaths(analysis, paths, mockProbe);
      expect(winningPath.status).toBe('ACTIVE');
      expect(testedPaths.length).toBe(2);
      expect(winningPath.experimentMetrics?.actualYield).toBeGreaterThan(0);
    });
  });

  describe('5. FailureMemory (Sections 13, 14, 15)', () => {
    it('records failed paths and provides failure reasons', () => {
      FailureMemory.recordFailedPath({
        pathId: 'TEST_FAIL_PATH',
        pathName: 'Test Unviable Registry',
        missionId: 'M_TEST',
        missionEntityType: 'ORGANIZATION',
        failureReason: 'Rate limit 429 and stale data',
        recommendedPivot: 'Use INAES open catalog',
        timestamp: new Date().toISOString()
      });

      expect(FailureMemory.isKnownFailedPath('TEST_FAIL_PATH')).toBe(true);
      expect(FailureMemory.getFailedPathReason('TEST_FAIL_PATH')).toContain('Rate limit');
    });

    it('manages general strategy heuristics and cross-mission transfer audits', () => {
      FailureMemory.recordTransferAudit({
        transferId: 'TR_01',
        sourceMissionId: 'M1',
        targetMissionId: 'M2',
        heuristicRule: 'Master registry multiplier',
        withoutLessonBaselineScore: 0.45,
        withLessonResultScore: 0.88,
        improvementDelta: 0.43,
        transferSuccess: true
      });

      const audits = FailureMemory.getTransferAudits();
      expect(audits.some(a => a.transferId === 'TR_01')).toBe(true);
    });
  });

  describe('6. OntologyDiscovery (Section 17)', () => {
    it('identifies and proposes ontology candidates from recurrent evidence patterns', () => {
      const records: DatabaseRecord[] = [
        {
          recordId: 'REC_1',
          canonicalRelationId: 'P1',
          data: { name: 'Lab Bio 1', sector: 'Biotechnology' },
          evidenceBadges: ['Lab'],
          evidenceSummary: 'Lab in Argentina',
          verificationStatus: 'VERIFIED',
          provenance: { sourceId: 'ANMAT', observedAt: new Date().toISOString(), specializedEngine: 'ORG' },
          fieldCompletenessScore: 90
        }
      ];

      const candidates = OntologyDiscovery.inspectRecordsForOntologyCandidates('M_TEST', 'ORGANIZATION', records);
      expect(candidates.length).toBeGreaterThan(0);
      expect(OntologyDiscovery.getAllCandidates().some(c => c.status === 'PROPOSED')).toBe(true);
    });
  });

  describe('7. PersistentMissionDatabase (Section 20)', () => {
    it('inserts, dedupes by canonical relation ID, enriches and persists records', () => {
      const analysis = DynamicSchemaDesigner.designSchema('Empresas de software', 5);
      const db = new PersistentMissionDatabase('M_TEST_MISSION', analysis.schema, 'M_TEST_DB');

      const r1: DatabaseRecord = {
        recordId: 'R1',
        canonicalRelationId: 'CUIT_30111111118',
        data: { organization_name: 'TechCorp SA', cuit: '30-11111111-8', sector: 'Software' },
        evidenceBadges: ['Official'],
        evidenceSummary: 'Valid',
        verificationStatus: 'VERIFIED',
        provenance: { sourceId: 'AFIP', observedAt: new Date().toISOString(), specializedEngine: 'ORG' },
        fieldCompletenessScore: 85
      };

      const r2Duplicate: DatabaseRecord = {
        recordId: 'R2',
        canonicalRelationId: 'CUIT_30111111118', // Same canonical relation!
        data: { organization_name: 'TechCorp SA Duplicate', cuit: '30-11111111-8', sector: 'Software' },
        evidenceBadges: ['Official'],
        evidenceSummary: 'Valid',
        verificationStatus: 'VERIFIED',
        provenance: { sourceId: 'AFIP', observedAt: new Date().toISOString(), specializedEngine: 'ORG' },
        fieldCompletenessScore: 85
      };

      db.upsertRecord(r1);
      db.upsertRecord(r2Duplicate); // Must deduplicate, not duplicate

      expect(db.size()).toBe(1);
      expect(db.getRecordByCanonicalId('CUIT_30111111118')).toBeDefined();

      // Test enrich
      db.enrichRecords('jurisdiction', () => 'ARG / CABA');
      const updated = db.getRecord('R1');
      expect(updated?.data.jurisdiction).toBe('ARG / CABA');

      // Test disk save
      const savedPath = db.saveToDisk();
      expect(savedPath).toContain('M_TEST_DB.json');
    });
  });

  describe('8. End-to-End AIPathfinder Mission Loop (Sections 8, 12, 23)', () => {
    it('executes a complete pathfinder mission producing a database and postmortem', async () => {
      const pathfinder = AIPathfinder.getInstance();
      const objective = 'Crear base de datos de 4 expertos argentinos en biotecnologia';

      const result = await pathfinder.executePathfinderMission(objective, { targetQuantity: 4, forceReplan: true });

      expect(result.database).toBeDefined();
      expect(result.database.size()).toBeGreaterThanOrEqual(4);
      expect(result.database.getVerifiedRecords().length).toBeGreaterThanOrEqual(4);

      expect(result.postmortem).toBeDefined();
      expect(result.postmortem.initialObjective).toBe(objective);
      expect(result.postmortem.databaseCreated.totalRecords).toBeGreaterThanOrEqual(4);
      expect(result.postmortem.databaseCreated.overallCompleteness).toBeGreaterThanOrEqual(80);
      expect(result.postmortem.replans).toBeGreaterThanOrEqual(1);
      expect(result.postmortem.winningPaths.length).toBeGreaterThan(0);
      expect(result.postmortem.metrics.nextBestActionDecisions).toBeGreaterThan(0);
      expect(result.postmortem.metrics.pathsPhysicallyTested).toBeGreaterThan(0);
    });
  });

});
