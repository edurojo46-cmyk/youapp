/**
 * peopleSourceIntelligence.mjs — Atlas People Source Intelligence & Discovery Planning Engine
 * 
 * STRICT ARCHITECTURAL INVARIANT:
 * ATLAS PEOPLE ≠ ATLAS VIDEO
 * Dedicated purely to People Discovery. Zero coupling with Video Discovery or Video Search.
 */

export const POPULATION_DOMAINS = Object.freeze({
  ACADEMIA: 'ACADEMIA',
  GOVERNMENT: 'GOVERNMENT',
  HEALTH: 'HEALTH',
  LEGAL: 'LEGAL',
  BUSINESS: 'BUSINESS',
  ORGANIZATIONS: 'ORGANIZATIONS',
  CULTURE_CIVIC: 'CULTURE_CIVIC'
});

export const ACCESS_CLASSIFICATIONS = Object.freeze({
  BULK_OPEN: 'BULK_OPEN',
  API_OPEN: 'API_OPEN',
  OAI_OPEN: 'OAI_OPEN',
  STRUCTURED_PUBLIC_DIRECTORY: 'STRUCTURED_PUBLIC_DIRECTORY',
  QUERY_ONLY_PUBLIC_DIRECTORY: 'QUERY_ONLY_PUBLIC_DIRECTORY',
  DOCUMENT_ARCHIVE: 'DOCUMENT_ARCHIVE',
  MANUAL_ONLY: 'MANUAL_ONLY',
  UNSUITABLE: 'UNSUITABLE'
});

export const MOTOR_TEMPLATES = Object.freeze({
  REST_API_MOTOR: 'REST_API_MOTOR',
  SPARQL_MOTOR: 'SPARQL_MOTOR',
  OAI_PMH_MOTOR: 'OAI_PMH_MOTOR',
  PARQUET_BULK_MOTOR: 'PARQUET_BULK_MOTOR',
  CSV_BULK_MOTOR: 'CSV_BULK_MOTOR',
  JSON_BULK_MOTOR: 'JSON_BULK_MOTOR',
  HTML_DIRECTORY_MOTOR: 'HTML_DIRECTORY_MOTOR',
  PDF_DOCUMENT_MOTOR: 'PDF_DOCUMENT_MOTOR'
});

/**
 * AtlasPeopleDomainIntentParser
 * Parses natural queries or discovery objectives into people-domain intents.
 */
export class AtlasPeopleDomainIntentParser {
  static parseIntent(objective) {
    const text = (objective?.query || objective?.intent || '').toLowerCase();
    const domains = [];
    const missingFields = [];

    // Domain keywords
    if (/investigad|cientific|paper|profesor|universidad|conicet|catedra|tesis|doctor/i.test(text)) {
      domains.push(POPULATION_DOMAINS.ACADEMIA);
    }
    if (/funcionario|ministr|secretari|subsecretar|apn|administracion publica|estatal|director nacional/i.test(text)) {
      domains.push(POPULATION_DOMAINS.GOVERNMENT);
    }
    if (/medic|doctora|enfermer|odontolog|farmaceutic|cirujan|salud|refeps|sisa/i.test(text)) {
      domains.push(POPULATION_DOMAINS.HEALTH);
    }
    if (/juez|jueza|fiscal|defensor|abogad|magistrad|poder judicial|pjn|matricula|letrado/i.test(text)) {
      domains.push(POPULATION_DOMAINS.LEGAL);
    }
    if (/director|directorio|gerente|presidente|socio|sociedad|sa|srl|apoderado|empresa|corporat/i.test(text)) {
      domains.push(POPULATION_DOMAINS.BUSINESS);
    }
    if (/cooperativa|mutual|ong|asociacion|inaes|gremio/i.test(text)) {
      domains.push(POPULATION_DOMAINS.ORGANIZATIONS);
    }
    if (/artista|escritor|musico|deportista|periodista/i.test(text)) {
      domains.push(POPULATION_DOMAINS.CULTURE_CIVIC);
    }

    // Default to ACADEMIA + GOVERNMENT if no specific domain matched
    if (domains.length === 0) {
      domains.push(POPULATION_DOMAINS.ACADEMIA, POPULATION_DOMAINS.GOVERNMENT);
    }

    // Missing evidence check
    if (objective?.known_identity) {
      if (!objective.known_identity.profession) missingFields.push('profession');
      if (!objective.known_identity.organization) missingFields.push('organization');
      if (!objective.known_identity.contact_signal) missingFields.push('contact_signal');
    }

    return {
      entity_type: 'PERSON',
      geographic_scope: 'AR',
      matched_domains: domains,
      is_new_person_discovery: !objective?.known_identity,
      is_missing_evidence_routing: !!objective?.known_identity && missingFields.length > 0,
      missing_fields: missingFields
    };
  }
}

/**
 * AtlasPeopleSourceStrategyGenerator
 * Determines appropriate search strategy based on intent.
 */
export class AtlasPeopleSourceStrategyGenerator {
  static generateStrategy(parsedIntent, capabilityRegistry) {
    const recommendedSources = [];

    for (const profile of capabilityRegistry.getAllProfiles()) {
      // Check domain match
      const domainMatch = profile.population_domains.some(d => parsedIntent.matched_domains.includes(d));
      if (!domainMatch) continue;

      // Check access readiness
      if (profile.access_classification === ACCESS_CLASSIFICATIONS.UNSUITABLE ||
          profile.access_classification === ACCESS_CLASSIFICATIONS.MANUAL_ONLY) {
        continue;
      }

      // Check evidence support if routing for missing fields
      if (parsedIntent.is_missing_evidence_routing) {
        const supportsMissing = parsedIntent.missing_fields.some(f => profile.evidence_capabilities[f]);
        if (!supportsMissing) continue;
      }

      recommendedSources.push({
        reservoir_id: profile.reservoir_id,
        source_family: profile.source_family,
        preferred_motor: profile.preferred_motor_template,
        authority: profile.source_authority,
        priority_score: profile.priority_score,
        access_classification: profile.access_classification,
        machine_accessible: profile.machine_accessible ?? false,
        automation_policy_status: profile.automation_policy_status ?? 'PENDING',
        machine_supply_rate: profile.machine_supply_rate ?? 0,
        machine_accessible_depth: profile.machine_accessible_depth ?? 0
      });
    }

    recommendedSources.sort((a, b) => b.priority_score - a.priority_score);

    return {
      strategy_type: parsedIntent.is_new_person_discovery ? 'NEW_PERSON_HARVEST' : 'EVIDENCE_COMPLETION',
      primary_domain: parsedIntent.matched_domains[0],
      candidate_sources: recommendedSources
    };
  }
}

/**
 * AtlasPeopleSourceCapabilityRegistry
 * Holds Source Capability Profiles for People Discovery.
 */
export class AtlasPeopleSourceCapabilityRegistry {
  constructor() {
    this.profiles = new Map();
  }

  registerProfile(profile) {
    this.profiles.set(profile.reservoir_id, Object.freeze(profile));
  }

  getProfile(reservoirId) {
    return this.profiles.get(reservoirId);
  }

  getAllProfiles() {
    return Array.from(this.profiles.values());
  }

  getByDomain(domain) {
    return this.getAllProfiles().filter(p => p.population_domains.includes(domain));
  }
}

/**
 * AtlasPeopleDiscoveryPlanGenerator
 * Generates an actionable execution plan for People Discovery.
 */
export class AtlasPeopleDiscoveryPlanGenerator {
  static createPlan(strategy) {
    const topSources = strategy.candidate_sources.slice(0, 5);
    return {
      plan_id: `PLAN_${Date.now()}`,
      created_at: new Date().toISOString(),
      strategy_type: strategy.strategy_type,
      primary_domain: strategy.primary_domain,
      dispatch_targets: topSources.map(s => ({
        reservoir_id: s.reservoir_id,
        motor_template: s.preferred_motor,
        access_mode: s.access_classification,
        machine_accessible: s.machine_accessible,
        automation_policy_status: s.automation_policy_status
      }))
    };
  }
}

/**
 * AtlasPeopleSourceIntelligence
 * Facade combining parser, registry, strategy, and planner for People Discovery.
 */
export class AtlasPeopleSourceIntelligence {
  constructor(registry = new AtlasPeopleSourceCapabilityRegistry()) {
    this.registry = registry;
  }

  resolveDiscoveryPlan(objective) {
    const intent = AtlasPeopleDomainIntentParser.parseIntent(objective);
    const strategy = AtlasPeopleSourceStrategyGenerator.generateStrategy(intent, this.registry);
    const plan = AtlasPeopleDiscoveryPlanGenerator.createPlan(strategy);
    return { intent, strategy, plan };
  }
}

/**
 * AtlasPeopleDiscoveryPlanner
 * High-level orchestration for People Discovery campaigns.
 */
export class AtlasPeopleDiscoveryPlanner {
  constructor(intelligence = new AtlasPeopleSourceIntelligence()) {
    this.intelligence = intelligence;
  }

  planCampaign(campaignObjective) {
    return this.intelligence.resolveDiscoveryPlan(campaignObjective);
  }
}
