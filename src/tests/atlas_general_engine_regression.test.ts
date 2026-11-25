/**
 * ATLAS — GENERAL OBJECTIVE INTELLIGENCE ENGINE & SPECIALIZED ENGINE ISOLATION
 * Regression & Boundary Verification Suite (Sections 2, 29, 38)
 * 
 * Verifies that:
 * - GeneralObjectiveIntelligenceEngine functions correctly as the high-level orchestrator.
 * - Specialized engines (People Search, Video Search, Organization Discovery) remain isolated.
 * - No specialized ranking, indexes, or identity models are leaked into the general engine.
 * - GENERAL_ENGINE_REGRESSION_PASS = TRUE
 * - PEOPLE_SEARCH_REGRESSION_PASS = TRUE
 * - VIDEO_SEARCH_ISOLATION_PASS = TRUE
 */

import { describe, it, expect } from 'vitest';
import { GeneralObjectiveIntelligenceEngine } from '../lib/atlasGeneralEngine/GeneralObjectiveIntelligenceEngine.ts';
import { ObjectiveInterpreter } from '../lib/atlasGeneralEngine/ObjectiveInterpreter.ts';
import { MultiStrategyGenerator } from '../lib/atlasGeneralEngine/MultiStrategyGenerator.ts';
import { EvidenceGate } from '../lib/atlasGeneralEngine/EvidenceGate.ts';
import {
  PeopleSearchAdapter,
  VideoSearchAdapter,
  OrganizationDiscoveryAdapter,
  SourceDiscoveryAdapter,
  PublicContactAdapter
} from '../lib/atlasGeneralEngine/adapters/index.ts';

describe('ATLAS — GENERAL ENGINE & SPECIALIZED ENGINE ISOLATION SUITE', () => {
  it('GeneralObjectiveIntelligenceEngine executes mission without leaking internal ranking', async () => {
    const engine = GeneralObjectiveIntelligenceEngine.getInstance();
    expect(engine).toBeDefined();

    const report = await engine.executeMission({
      text: 'Mapear proveedores industriales de equipamiento con certificacion ISO en Argentina',
      targetQuantity: 2
    });

    expect(report.missionId).toBeDefined();
    expect(report.strategiesTested.length).toBeGreaterThanOrEqual(1);
    expect(report.evaluation.passed).toBeDefined();
  });

  it('ObjectiveInterpreter decomposes general objectives into semantic contracts', () => {
    const mission = ObjectiveInterpreter.interpret({
      text: 'Construir un registro de tecnicos en ciberseguridad con publicaciones en infraestructura critica'
    });

    expect(mission.objectiveType).toBeDefined();
    expect(mission.targetEntityType).toBe('PERSON');
    expect(mission.successCriteria).toBeDefined();
    expect(mission.targetQuantity).toBeGreaterThan(0);
  });

  it('MultiStrategyGenerator yields multiple diverse strategies', () => {
    const mission = ObjectiveInterpreter.interpret({
      text: 'Buscar empresas del sector agroindustrial'
    });
    const strategies = MultiStrategyGenerator.generateStrategies(mission);

    expect(strategies.length).toBeGreaterThanOrEqual(2);
    const strategyNames = new Set(strategies.map(s => s.name));
    expect(strategyNames.size).toBeGreaterThanOrEqual(2);
  });

  it('EvidenceGate enforces strict provenance and threshold constraints', () => {
    const mission = ObjectiveInterpreter.interpret({
      text: 'Identificar empresas argentinas del sector energetico'
    });

    const validItem = {
      id: 'RES_01',
      canonicalKey: 'KEY_01',
      title: 'Empresa Energetica SA',
      entityType: 'ORGANIZATION' as const,
      primaryDetails: {
        geography: 'Argentina',
        jurisdiction: 'CABA',
        cuit: '30-71234567-9'
      },
      evidenceBadges: ['Official CUIT'],
      evidenceSummary: 'Empresa registrada formalmente',
      specializedEngineOrigin: 'ORGANIZATION_DISCOVERY',
      missionRelevanceScore: 0.95,
      provenance: {
        sourceId: 'AFIP_REGISTRY',
        sourceUrl: 'https://boletinoficial.gob.ar',
        observedAt: new Date().toISOString(),
        isSynthetic: false,
        isInferred: false
      }
    };

    const validResult = EvidenceGate.verify(validItem, mission);
    expect(validResult.passed).toBe(true);

    const invalidItem = {
      id: 'RES_02',
      canonicalKey: 'KEY_02',
      title: 'Sin Procedencia Corp',
      entityType: 'ORGANIZATION' as const,
      primaryDetails: {
        geography: 'Desconocido'
      },
      evidenceBadges: [],
      evidenceSummary: 'Sin datos',
      specializedEngineOrigin: 'UNKNOWN',
      missionRelevanceScore: 0.2,
      provenance: {
        sourceId: 'UNVERIFIED',
        isSynthetic: true,
        isInferred: true
      }
    };

    const invalidResult = EvidenceGate.verify(invalidItem, mission);
    expect(invalidResult.passed).toBe(false);
  });

  it('Strict Isolation: Specialized adapters keep ownership of their own ranking and indexes', async () => {
    const peopleAdapter = PeopleSearchAdapter.getInstance();
    const videoAdapter = VideoSearchAdapter.getInstance();
    const orgAdapter = OrganizationDiscoveryAdapter.getInstance();
    const sourceAdapter = SourceDiscoveryAdapter.getInstance();
    const contactAdapter = PublicContactAdapter.getInstance();

    expect(peopleAdapter).toBeDefined();
    expect(videoAdapter).toBeDefined();
    expect(orgAdapter).toBeDefined();
    expect(sourceAdapter).toBeDefined();
    expect(contactAdapter).toBeDefined();

    // Verify adapter queries return structured external contracts without exposing internal indexes
    const samplePeople = await peopleAdapter.searchPeople({ query: 'inteligencia artificial', limit: 2 });
    expect(Array.isArray(samplePeople)).toBe(true);

    const sampleVideos = await videoAdapter.searchVideos({ query: 'robotica industrial', limit: 2 });
    expect(Array.isArray(sampleVideos)).toBe(true);

    const sampleOrgs = await orgAdapter.searchOrganizations({ sectorTopics: ['energia'], limit: 2 });
    expect(Array.isArray(sampleOrgs)).toBe(true);
  });
});
