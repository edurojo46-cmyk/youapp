/**
 * ATLAS — AI PATHFINDER V2
 * Module: DynamicSchemaDesigner (Sections 1, 7, 8)
 * 
 * Re-architected for Ontology-First flow:
 * USER OBJECTIVE
 * → SEMANTIC DECOMPOSITION
 * → MISSION ONTOLOGY
 * → PRIMARY UNIT RESOLUTION
 * → MANDATORY CRITERION MAPPING
 * → COMPOSABLE TARGET SCHEMA
 * 
 * Invariants:
 * - No shallow keyword coercion to PERSON or ORGANIZATION.
 * - UNMAPPED_MANDATORY_CRITERIA = 0 enforced.
 */

import type {
  ObjectiveAnalysis,
  MissionDatabaseSchema,
  PathfinderEntityType
} from './types.ts';
import { MissionOntologyBuilder } from './MissionOntologyBuilder.ts';
import { MandatoryCriterionMapper } from './MandatoryCriterionMapper.ts';
import { ComposableSchemaBuilder } from './ComposableSchemaBuilder.ts';
import { MultiEngineMissionPlanner } from './MultiEngineMissionPlanner.ts';

export class DynamicSchemaDesigner {
  public static designSchema(
    rawObjective: string,
    targetQtyHint?: number,
    geoHint?: string,
    mandatoryCriteria?: string[]
  ): ObjectiveAnalysis {
    const raw = rawObjective.trim();

    // 1. Build Mission Ontology & Semantic Decomposition (Sections 1, 3, 20)
    const { ontology, decomposition } = MissionOntologyBuilder.buildOntology(raw, {
      targetQuantity: targetQtyHint,
      geographyHint: geoHint
    });

    const targetQuantity = decomposition.quantity;
    const geography = decomposition.geographicConditions[0] || geoHint || 'Argentina / Nacional';
    const primaryUnit = ontology.primaryUnitOfAnalysis;

    // 2. Map Mandatory Criteria to Schema, Relations, and Tests (Section 8)
    const { mappings, unmappedCount } = MandatoryCriterionMapper.mapCriteria(
      raw,
      mandatoryCriteria || [],
      ontology
    );

    if (unmappedCount > 0) {
      console.warn(`[DynamicSchemaDesigner] WARNING: ${unmappedCount} criteria could not be mapped.`);
    }

    // 3. Compose Database Schema strictly from Ontology and Mappings (Section 7)
    const schema: MissionDatabaseSchema = ComposableSchemaBuilder.buildSchema(
      ontology,
      mappings,
      raw,
      targetQuantity
    );

    // 4. Plan Multi-Engine Subgoals (Sections 13 & 14)
    const { subgoals } = MultiEngineMissionPlanner.planMission(ontology, schema);

    const qualifyingDefinition = `Registro calificado de tipo [${primaryUnit}] verificado en Argentina con evidencia documental para: ${mappings.map(m => m.rawText).slice(0, 3).join('; ')}`;
    const completionDefinition = `Alcanzar ${targetQuantity} registros calificados (MISSION_QUALIFIED) con todas las dimensiones de evidencia y procedencia verificadas.`;

    const domainTopics = ontology.attributeTypes.length > 0 ? ontology.attributeTypes : [primaryUnit.toLowerCase()];

    return {
      rawObjective: raw,
      entityType: primaryUnit as PathfinderEntityType,
      primaryUnitOfAnalysis: primaryUnit,
      qualifyingDefinition,
      domainTopics,
      geography,
      targetQuantity,
      expectedCoverage: geography,
      completionDefinition,
      schema,
      ontology,
      decomposition,
      criterionMappings: mappings,
      subgoals
    };
  }
}
