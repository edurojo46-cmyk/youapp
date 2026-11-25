/**
 * ATLAS GENERAL: metadata-only engine capability catalog, shadow V1.
 * No imports, engine instances, network, filesystem, timers or execution entrypoint.
 * Existing registries retain their authority; references are inert metadata.
 * Initial inventory, not an exhaustive operational registry or production gate.
 */
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
const engines = freeze([
  {
    "id": "general_objective",
    "name": "Objetivos generales",
    "domain": "planning",
    "capabilities": [
      "objective.reasoning",
      "mission.strategy"
    ],
    "implementationReferences": [
      "src/lib/atlasGeneralEngine/GeneralObjectiveIntelligenceEngine.ts"
    ],
    "risks": [
      "CURRENT_EXECUTE_MISSION_ALSO_EXECUTES_ADAPTERS"
    ],
    "authority": "SPECIALIZED_ENGINE_RETAINS_DATA_INDEX_AND_RANKING",
    "operationalStatus": "UNKNOWN",
    "certification": {
      "status": "NOT_IMPORTED",
      "evidenceRef": null
    },
    "effects": "UNKNOWN",
    "externalCost": "UNKNOWN",
    "executionEnabled": false
  },
  {
    "id": "cross_engine",
    "name": "Coordinación entre motores",
    "domain": "coordination",
    "capabilities": [
      "results.federation",
      "relations.candidates"
    ],
    "implementationReferences": [
      "src/lib/atlasCrossEngine/AtlasCrossEngineCoordinator.ts",
      "src/lib/atlasCrossEngine/contracts.ts"
    ],
    "risks": [
      "SHADOW_LABEL_DOES_NOT_ENFORCE_SIDE_EFFECT_ISOLATION"
    ],
    "authority": "SPECIALIZED_ENGINE_RETAINS_DATA_INDEX_AND_RANKING",
    "operationalStatus": "UNKNOWN",
    "certification": {
      "status": "NOT_IMPORTED",
      "evidenceRef": null
    },
    "effects": "UNKNOWN",
    "externalCost": "UNKNOWN",
    "executionEnabled": false
  },
  {
    "id": "pathfinder",
    "name": "Pathfinder",
    "domain": "planning",
    "capabilities": [
      "ontology.planning",
      "retrieval.routes"
    ],
    "implementationReferences": [
      "src/lib/atlasPathfinder/AIPathfinder.ts",
      "src/lib/atlasPathfinder/MultiEngineMissionPlanner.ts"
    ],
    "risks": [],
    "authority": "SPECIALIZED_ENGINE_RETAINS_DATA_INDEX_AND_RANKING",
    "operationalStatus": "UNKNOWN",
    "certification": {
      "status": "NOT_IMPORTED",
      "evidenceRef": null
    },
    "effects": "UNKNOWN",
    "externalCost": "UNKNOWN",
    "executionEnabled": false
  },
  {
    "id": "discovery_ai",
    "name": "Discovery AI",
    "domain": "discovery",
    "capabilities": [
      "sources.discovery",
      "knowledge.gaps"
    ],
    "implementationReferences": [
      "src/lib/atlasDiscoveryAI/discoveryBrain.ts",
      "src/lib/atlasDiscoveryAI/discoveryPlanner.ts"
    ],
    "risks": [],
    "authority": "SPECIALIZED_ENGINE_RETAINS_DATA_INDEX_AND_RANKING",
    "operationalStatus": "UNKNOWN",
    "certification": {
      "status": "NOT_IMPORTED",
      "evidenceRef": null
    },
    "effects": "UNKNOWN",
    "externalCost": "UNKNOWN",
    "executionEnabled": false
  },
  {
    "id": "people",
    "name": "Búsqueda de personas",
    "domain": "people",
    "capabilities": [
      "people.search"
    ],
    "implementationReferences": [
      "src/lib/search/AtlasPeopleSearchV2.ts"
    ],
    "risks": [],
    "authority": "SPECIALIZED_ENGINE_RETAINS_DATA_INDEX_AND_RANKING",
    "operationalStatus": "UNKNOWN",
    "certification": {
      "status": "NOT_IMPORTED",
      "evidenceRef": null
    },
    "effects": "UNKNOWN",
    "externalCost": "UNKNOWN",
    "executionEnabled": false
  },
  {
    "id": "industrial",
    "name": "Búsqueda industrial",
    "domain": "industrial",
    "capabilities": [
      "industrial.search"
    ],
    "implementationReferences": [
      "src/lib/fabric/AtlasIndustrialSearchFabric.ts"
    ],
    "risks": [],
    "authority": "SPECIALIZED_ENGINE_RETAINS_DATA_INDEX_AND_RANKING",
    "operationalStatus": "UNKNOWN",
    "certification": {
      "status": "NOT_IMPORTED",
      "evidenceRef": null
    },
    "effects": "UNKNOWN",
    "externalCost": "UNKNOWN",
    "executionEnabled": false
  },
  {
    "id": "social_discovery",
    "name": "Descubrimiento social",
    "domain": "social",
    "capabilities": [
      "social.public.discovery"
    ],
    "implementationReferences": [
      "src/lib/atlasSocialDiscovery/SocialPublicDiscoveryEngine.ts"
    ],
    "risks": [],
    "authority": "SPECIALIZED_ENGINE_RETAINS_DATA_INDEX_AND_RANKING",
    "operationalStatus": "UNKNOWN",
    "certification": {
      "status": "NOT_IMPORTED",
      "evidenceRef": null
    },
    "effects": "UNKNOWN",
    "externalCost": "UNKNOWN",
    "executionEnabled": false
  },
  {
    "id": "video_search",
    "name": "Búsqueda audiovisual",
    "domain": "video",
    "capabilities": [
      "video.search"
    ],
    "implementationReferences": [
      "src/lib/search/searchEngine.ts"
    ],
    "risks": [],
    "authority": "SPECIALIZED_ENGINE_RETAINS_DATA_INDEX_AND_RANKING",
    "operationalStatus": "UNKNOWN",
    "certification": {
      "status": "NOT_IMPORTED",
      "evidenceRef": null
    },
    "effects": "UNKNOWN",
    "externalCost": "UNKNOWN",
    "executionEnabled": false
  },
  {
    "id": "query_fabric",
    "name": "Consulta de conocimiento",
    "domain": "knowledge",
    "capabilities": [
      "knowledge.query.plan",
      "knowledge.query.retrieve"
    ],
    "implementationReferences": [
      "src/lib/atlasQueryFabric/AtlasReasoningQueryFabric.ts"
    ],
    "risks": [
      "PLAN_AND_RETRIEVAL_REQUIRE_SEPARATE_PERMISSIONS"
    ],
    "authority": "SPECIALIZED_ENGINE_RETAINS_DATA_INDEX_AND_RANKING",
    "operationalStatus": "UNKNOWN",
    "certification": {
      "status": "NOT_IMPORTED",
      "evidenceRef": null
    },
    "effects": "UNKNOWN",
    "externalCost": "UNKNOWN",
    "executionEnabled": false
  },
  {
    "id": "intelligence",
    "name": "Inteligencia operativa",
    "domain": "learning",
    "capabilities": [
      "experience.reasoning",
      "hypothesis.experimentation"
    ],
    "implementationReferences": [
      "src/lib/atlasIntelligence/AtlasIntelligenceLayer.ts"
    ],
    "risks": [
      "EXPERIMENTATION_IS_NOT_PLAN_ONLY"
    ],
    "authority": "SPECIALIZED_ENGINE_RETAINS_DATA_INDEX_AND_RANKING",
    "operationalStatus": "UNKNOWN",
    "certification": {
      "status": "NOT_IMPORTED",
      "evidenceRef": null
    },
    "effects": "UNKNOWN",
    "externalCost": "UNKNOWN",
    "executionEnabled": false
  },
  {
    "id": "public_contacts",
    "name": "Contactos públicos",
    "domain": "contacts",
    "capabilities": [
      "contacts.public.resolve"
    ],
    "implementationReferences": [
      "src/lib/search/AtlasContactEngineInterface.ts"
    ],
    "risks": [],
    "authority": "SPECIALIZED_ENGINE_RETAINS_DATA_INDEX_AND_RANKING",
    "operationalStatus": "UNKNOWN",
    "certification": {
      "status": "NOT_IMPORTED",
      "evidenceRef": null
    },
    "effects": "UNKNOWN",
    "externalCost": "UNKNOWN",
    "executionEnabled": false
  },
  {
    "id": "source_discovery",
    "name": "Fuentes públicas",
    "domain": "sources",
    "capabilities": [
      "sources.search"
    ],
    "implementationReferences": [
      "src/lib/atlasGeneralEngine/adapters/SourceDiscoveryAdapter.ts"
    ],
    "risks": [],
    "authority": "SPECIALIZED_ENGINE_RETAINS_DATA_INDEX_AND_RANKING",
    "operationalStatus": "UNKNOWN",
    "certification": {
      "status": "NOT_IMPORTED",
      "evidenceRef": null
    },
    "effects": "UNKNOWN",
    "externalCost": "UNKNOWN",
    "executionEnabled": false
  },
  {
    "id": "semantic_knowledge",
    "name": "Conocimiento semántico",
    "domain": "knowledge",
    "capabilities": [
      "entities.resolve",
      "facts.admission"
    ],
    "implementationReferences": [
      "src/lib/atlasSemantic/AtlasSemanticKnowledgeService.ts",
      "src/lib/atlas/truth/AtlasTruthGraph.ts"
    ],
    "risks": [
      "CANDIDATE_RELATION_IS_NOT_VERIFIED_FACT"
    ],
    "authority": "SPECIALIZED_ENGINE_RETAINS_DATA_INDEX_AND_RANKING",
    "operationalStatus": "UNKNOWN",
    "certification": {
      "status": "NOT_IMPORTED",
      "evidenceRef": null
    },
    "effects": "UNKNOWN",
    "externalCost": "UNKNOWN",
    "executionEnabled": false
  },
  {
    "id": "video_production",
    "name": "Producción audiovisual",
    "domain": "video",
    "capabilities": [
      "video.production"
    ],
    "implementationReferences": [
      "scripts/director/atlasAutonomousHybridDirector.ts"
    ],
    "risks": [
      "PRESERVE_APPROVED_SCENES_AND_CHECKPOINTS"
    ],
    "authority": "SPECIALIZED_ENGINE_RETAINS_DATA_INDEX_AND_RANKING",
    "operationalStatus": "UNKNOWN",
    "certification": {
      "status": "NOT_IMPORTED",
      "evidenceRef": null
    },
    "effects": "UNKNOWN",
    "externalCost": "UNKNOWN",
    "executionEnabled": false
  },
  {
    "id": "social_publisher",
    "name": "Publicador por propietario",
    "domain": "publishing",
    "capabilities": [
      "social.publish",
      "social.metrics"
    ],
    "implementationReferences": [
      "server/routes/youapp/socialPublisherRoutes.mjs"
    ],
    "risks": [
      "NO_PERMISSION_INHERITED_FROM_CATALOG",
      "PERSONAL_TIKTOK_EDU_ROJO_PROTECTED"
    ],
    "authority": "SPECIALIZED_ENGINE_RETAINS_DATA_INDEX_AND_RANKING",
    "operationalStatus": "UNKNOWN",
    "certification": {
      "status": "NOT_IMPORTED",
      "evidenceRef": null
    },
    "effects": "UNKNOWN",
    "externalCost": "UNKNOWN",
    "executionEnabled": false
  }
]);
const registryReferences = freeze([
  {
    "id": "source_capabilities",
    "path": "src/lib/search/SourceCapabilityRegistry.ts",
    "scope": "SOURCE_CAPABILITIES",
    "authority": "EXISTING_REGISTRY"
  },
  {
    "id": "source_motor_templates",
    "path": "src/lib/atlas/discovery/motorRegistry.mjs",
    "scope": "SOURCE_MOTOR_TEMPLATES_AND_STATES",
    "authority": "EXISTING_REGISTRY"
  },
  {
    "id": "people_logical_motors",
    "path": "src/lib/atlas/discovery/AtlasPeopleSourceMotorRegistry.mjs",
    "scope": "SOURCE_TO_LOGICAL_MOTOR_MAPPINGS",
    "authority": "EXISTING_REGISTRY"
  },
  {
    "id": "platform_action_adapters",
    "path": "src/lib/atlas10f/AdapterRegistry.ts",
    "scope": "PLATFORM_ACTION_ADAPTERS",
    "authority": "EXISTING_REGISTRY"
  }
]);
export const REGISTRY_CONTRACT = freeze({
  schemaVersion: '1.0.0', mode: 'SHADOW_CATALOG_ONLY', coverage: 'INITIAL_INVENTORY',
  authority: 'METADATA_ONLY', executionEnabled: false,
  productionIntegration: false, certificationImported: false,
  policyRequirements: ['VERIFIED_IDENTITY','OWNER_SCOPE','EXPLICIT_AUTHORIZATION','COST_BUDGET',
    'PROVIDER_QUOTA','DEADLINE_AND_CANCELLATION','SIDE_EFFECT_CLASSIFICATION','EVIDENCE_ADMISSION'],
  existingRegistryReferences: registryReferences
});
export function listEngines() { return engines; }
export function getEngine(id) { if (typeof id !== 'string') throw Error('INVALID_ENGINE_ID'); return engines.find(engine => engine.id === id) ?? null; }
export function findCapabilities({domain, capability} = {}) {
  if (domain !== undefined && typeof domain !== 'string') throw Error('INVALID_DOMAIN');
  if (capability !== undefined && typeof capability !== 'string') throw Error('INVALID_CAPABILITY');
  return freeze(engines.filter(engine => (domain === undefined || engine.domain === domain)
    && (capability === undefined || engine.capabilities.includes(capability))));
}
export function inspectExecutionEligibility(engineId, capability) {
  if (typeof capability !== 'string') throw Error('INVALID_CAPABILITY');
  const engine = getEngine(engineId);
  const knownCapability = !!engine && engine.capabilities.includes(capability);
  return freeze({
    engineId, capability, knownEngine: !!engine, knownCapability,
    authorized: false, executionEnabled: false, mode: REGISTRY_CONTRACT.mode,
    blockers: ['SHADOW_CATALOG_ONLY', ...(!engine ? ['UNKNOWN_ENGINE'] :
      !knownCapability ? ['UNKNOWN_CAPABILITY'] : []),
      'NO_RUNTIME_AUTHORIZATION','NO_OPERATIONAL_CERTIFICATION_IMPORTED']
  });
}
