/**
 * ATLAS — AI PATHFINDER V2
 * Module: MissionOntologyBuilder (Sections 1, 3, 12, 20, 21, 22, 23)
 * 
 * Analyzes the human objective BEFORE schema creation.
 * Formulates the rich Mission Ontology, Entity Graph, Comparison Dimensions,
 * and Negative Constraints.
 */

import type {
  MissionOntology,
  ObjectiveSemanticDecomposition,
  OntologyNode,
  OntologyRelation
} from './types.ts';
import { PrimaryUnitResolver } from './PrimaryUnitResolver.ts';
import { AtlasOntologyMemory } from './AtlasOntologyMemory.ts';

export class MissionOntologyBuilder {
  /**
   * Main entry point: Performs semantic decomposition and builds the mission ontology.
   */
  public static buildOntology(
    rawObjective: string,
    options?: { targetQuantity?: number; geographyHint?: string }
  ): { ontology: MissionOntology; decomposition: ObjectiveSemanticDecomposition } {
    const raw = rawObjective.trim();
    const lower = raw.toLowerCase();
    const normalized = lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // 1. Primary Unit Resolution
    const unitResolution = PrimaryUnitResolver.resolve(rawObjective);
    const primaryUnit = unitResolution.primaryUnitOfAnalysis;

    // 2. Semantic Decomposition (Section 20)
    const decomposition = this.decomposeObjective(raw, normalized, unitResolution, options);

    // 3. Build Ontology Nodes (Section 3 & 12)
    const nodes: OntologyNode[] = [];
    const secondaryTypes: string[] = [];
    const attributeTypes: string[] = [];
    const evidenceTypes: string[] = [];

    // Add Primary Target Node
    nodes.push({
      id: `NODE_PRIMARY_${primaryUnit}`,
      type: primaryUnit,
      label: `Primary Target Unit: ${primaryUnit}`,
      role: 'PRIMARY_TARGET',
      attributes: ['name', 'canonical_id', 'jurisdiction', 'verification_status', 'qualification_status']
    });

    // Detect Secondary Entities in the objective context
    if (/\b(universidad(es)?|instituto(s)?|institucion(es)?|cientifica(s)?|cientifico(s)?|academica(s)?|academico(s)?|facultad(es)?|centros? cientificos?|conicet|inta|inti)\b/i.test(normalized)) {
      secondaryTypes.push('INSTITUTION');
      nodes.push({
        id: 'NODE_SEC_INSTITUTION',
        type: 'INSTITUTION',
        label: 'Academic or Scientific Institution',
        role: 'SECONDARY_ACTOR',
        attributes: ['institution_name', 'department', 'affiliation_validity']
      });
      attributeTypes.push('institution_of_origin');
      evidenceTypes.push('academic_registry_record');
    }

    if (/\b(empresas?|companias?|firmas?|sector privado|industrias?)\b/i.test(normalized)) {
      secondaryTypes.push('COMPANY');
      nodes.push({
        id: 'NODE_SEC_COMPANY',
        type: 'COMPANY',
        label: 'Commercial or Industrial Company',
        role: 'SECONDARY_ACTOR',
        attributes: ['company_name', 'cuit', 'industry_sector']
      });
      attributeTypes.push('corporate_partner');
      evidenceTypes.push('corporate_cuit_registry');
    }

    if (/\b(organismo publico|estado|ministerio|secretaria|municipio|defensa civil|bomberos|organismo hidrico)\b/i.test(normalized)) {
      secondaryTypes.push('PUBLIC_AGENCY');
      nodes.push({
        id: 'NODE_SEC_PUBLIC_AGENCY',
        type: 'PUBLIC_AGENCY',
        label: 'Governmental / Public Agency',
        role: 'SECONDARY_ACTOR',
        attributes: ['agency_name', 'jurisdiction_scope']
      });
      attributeTypes.push('public_authority');
      evidenceTypes.push('official_bulletin_entry');
    }

    if (/\b(personas?|investigadores?|periodistas?|autores?|referentes?|responsables?)\b/i.test(normalized)) {
      secondaryTypes.push('PERSON');
      nodes.push({
        id: 'NODE_SEC_PERSON',
        type: 'PERSON',
        label: 'Individual Researcher / Lead / Author',
        role: 'SECONDARY_ACTOR',
        attributes: ['full_name', 'role', 'specialization']
      });
      attributeTypes.push('lead_person');
      evidenceTypes.push('people_search_canonical');
    }

    if (/\b(parques? industriales?|clusters?|camaras?)\b/i.test(normalized)) {
      secondaryTypes.push('INDUSTRIAL_CLUSTER');
      nodes.push({
        id: 'NODE_SEC_CLUSTER',
        type: 'INDUSTRIAL_CLUSTER',
        label: 'Industrial Park or Cluster Directory',
        role: 'CONTEXT',
        attributes: ['cluster_name', 'province']
      });
      evidenceTypes.push('chamber_member_record');
    }

    // 4. Build Ontology Relations (Sections 3, 5, 12, 22)
    const relations: OntologyRelation[] = [];
    const relationTypes: string[] = [];

    if (unitResolution.unitCategory === 'RELATIONSHIP_LINK') {
      relations.push({
        sourceNodeId: 'NODE_SEC_INSTITUTION',
        predicate: 'COLLABORATES_WITH',
        targetNodeId: 'NODE_SEC_COMPANY',
        isMandatory: true,
        sameContextRequired: true,
        description: 'Bilateral partnership explicitly documented in renewable energy or related tech.'
      });
      relationTypes.push('COLLABORATES_WITH');
    } else if (unitResolution.primaryUnitOfAnalysis === 'INTERSECTORAL_PROJECT') {
      relations.push({
        sourceNodeId: `NODE_PRIMARY_${primaryUnit}`,
        predicate: 'HAS_PUBLIC_ACTOR',
        targetNodeId: 'NODE_SEC_PUBLIC_AGENCY',
        isMandatory: true,
        sameContextRequired: true,
        description: 'Joint initiative includes verified public body.'
      });
      relations.push({
        sourceNodeId: `NODE_PRIMARY_${primaryUnit}`,
        predicate: 'HAS_ACADEMIC_ACTOR',
        targetNodeId: 'NODE_SEC_INSTITUTION',
        isMandatory: true,
        sameContextRequired: true,
        description: 'Joint initiative includes scientific or university actor.'
      });
      relations.push({
        sourceNodeId: `NODE_PRIMARY_${primaryUnit}`,
        predicate: 'HAS_PRIVATE_ACTOR',
        targetNodeId: 'NODE_SEC_COMPANY',
        isMandatory: true,
        sameContextRequired: true,
        description: 'Joint initiative includes private enterprise or social organization.'
      });
      relationTypes.push('HAS_PUBLIC_ACTOR', 'HAS_ACADEMIC_ACTOR', 'HAS_PRIVATE_ACTOR');
    } else if (unitResolution.primaryUnitOfAnalysis === 'CITY' || unitResolution.primaryUnitOfAnalysis === 'LOCALITY') {
      relations.push({
        sourceNodeId: `NODE_PRIMARY_${primaryUnit}`,
        predicate: 'HOSTS_INDUSTRIAL_ACTIVITY',
        targetNodeId: 'NODE_SEC_COMPANY',
        isMandatory: true,
        sameContextRequired: false,
        description: 'Jurisdiction contains verified manufacturing or industrial presence.'
      });
      relations.push({
        sourceNodeId: `NODE_PRIMARY_${primaryUnit}`,
        predicate: 'PROVIDES_TECHNICAL_EDUCATION',
        targetNodeId: 'NODE_SEC_INSTITUTION',
        isMandatory: true,
        sameContextRequired: false,
        description: 'Jurisdiction contains technical or engineering educational institutions.'
      });
      relationTypes.push('HOSTS_INDUSTRIAL_ACTIVITY', 'PROVIDES_TECHNICAL_EDUCATION');
    } else if (unitResolution.primaryUnitOfAnalysis === 'TECHNOLOGY_TRANSFER_CASE') {
      relations.push({
        sourceNodeId: `NODE_PRIMARY_${primaryUnit}`,
        predicate: 'DEVELOPED_AT',
        targetNodeId: 'NODE_SEC_INSTITUTION',
        isMandatory: true,
        sameContextRequired: true,
        description: 'Scientific origin verified at Argentine research body or university.'
      });
      relations.push({
        sourceNodeId: `NODE_PRIMARY_${primaryUnit}`,
        predicate: 'APPLIED_BY',
        targetNodeId: 'NODE_SEC_COMPANY',
        isMandatory: true,
        sameContextRequired: true,
        description: 'Practical implementation or adoption verified outside laboratory.'
      });
      relationTypes.push('DEVELOPED_AT', 'APPLIED_BY');
    } else if (unitResolution.primaryUnitOfAnalysis === 'MEDIA_OUTLET') {
      relations.push({
        sourceNodeId: `NODE_PRIMARY_${primaryUnit}`,
        predicate: 'FEATURES_JOURNALIST',
        targetNodeId: 'NODE_SEC_PERSON',
        isMandatory: false,
        sameContextRequired: true,
        description: 'Authors or journalists linked to the publication through public evidence.'
      });
      relationTypes.push('FEATURES_JOURNALIST');
    }

    // 5. Composite Entity Candidates (Section 6)
    const compositeCandidates: string[] = [];
    if (unitResolution.isMissionDefined) {
      compositeCandidates.push(primaryUnit);
    }
    if (decomposition.comparisonDimensions.length > 0) {
      compositeCandidates.push(`${primaryUnit}_COMPARATIVE_PROFILE`);
    }

    // 6. Consult Ontology Memory (Section 19 & 36)
    const memoryConcept = AtlasOntologyMemory.getConcept(primaryUnit);
    if (memoryConcept) {
      for (const attr of memoryConcept.typicalAttributes) {
        if (!attributeTypes.includes(attr)) attributeTypes.push(attr);
      }
      for (const ev of memoryConcept.evidencePatterns) {
        if (!evidenceTypes.includes(ev)) evidenceTypes.push(ev);
      }
    }

    const ontology: MissionOntology = {
      ontologyNodes: nodes,
      ontologyRelations: relations,
      primaryUnitOfAnalysis: primaryUnit,
      secondaryEntityTypes: secondaryTypes,
      relationTypes,
      attributeTypes,
      evidenceTypes,
      compositeEntityCandidates: compositeCandidates,
      unknownConcepts: unitResolution.isMissionDefined ? [primaryUnit] : [],
      ontologyConfidence: unitResolution.confidence,
      missionDefinedEntityCreated: unitResolution.isMissionDefined,
      missionEntityGraph: {
        nodes,
        edges: relations
      }
    };

    return { ontology, decomposition };
  }

  /**
   * Decomposes the user objective into semantic facets (Section 20).
   */
  private static decomposeObjective(
    raw: string,
    normalized: string,
    unitResolution: any,
    options?: { targetQuantity?: number; geographyHint?: string }
  ): ObjectiveSemanticDecomposition {
    // Action requested
    let actionRequested = 'CONSTRUCT_MISSION_DATABASE';
    if (/\b(comparar|base comparativa|que permita comparar)\b/i.test(normalized)) {
      actionRequested = 'CONSTRUCT_COMPARATIVE_DATABASE';
    } else if (/\b(relaciones|vinculos|convenios)\b/i.test(normalized)) {
      actionRequested = 'MAP_RELATIONAL_NETWORK';
    }

    // Quantity
    let quantity = options?.targetQuantity || 10;
    const qtyMatch = normalized.match(/\b(\d+)\b/);
    if (qtyMatch && !options?.targetQuantity) {
      const q = parseInt(qtyMatch[1], 10);
      if (q > 0 && q <= 500) quantity = q;
    }

    // Geography
    const geographicConditions: string[] = [];
    if (options?.geographyHint) {
      geographicConditions.push(options.geographyHint);
    } else if (/\bargentina|argentinas|argentinos\b/i.test(normalized)) {
      geographicConditions.push('Argentina / Nacional');
    }
    if (/\bdiversidad entre provincias|mas de una region\b/i.test(normalized)) {
      geographicConditions.push('Multi-regional provincial diversity required');
    }

    // Comparison Dimensions (Section 21)
    const comparisonDimensions: Array<{ dimensionA: string; dimensionB: string; description: string }> = [];
    if (/\binundacion\b/i.test(normalized) && /\bcapacidad\b/i.test(normalized)) {
      comparisonDimensions.push({
        dimensionA: 'flood_risk_exposure',
        dimensionB: 'institutional_response_capacity',
        description: 'Compares historical flood risk against emergency response capability without conflating high risk with high capacity.'
      });
    } else if (/\btransporte|infraestructura\b/i.test(normalized) && /\b(frio|alimentos|frigorificos)\b/i.test(normalized)) {
      comparisonDimensions.push({
        dimensionA: 'transport_infrastructure',
        dimensionB: 'cold_chain_activity',
        description: 'Separately evaluates multimodal logistics infrastructure and perishable/cold chain economic volume.'
      });
    } else if (/\bactividad industrial\b/i.test(normalized) && /\beducacion tecnica\b/i.test(normalized)) {
      comparisonDimensions.push({
        dimensionA: 'industrial_manufacturing_presence',
        dimensionB: 'technical_engineering_education',
        description: 'Compares real industrial base against technical training availability.'
      });
    }

    // Negative constraints (Section 23)
    const negativeConstraints: string[] = [];
    if (/\bno se puede calificar.*por poblacion\b/i.test(normalized)) {
      negativeConstraints.push('EXCLUDE_POPULATION_ONLY_RATING: Population size alone cannot qualify a locality.');
    }
    if (/\bno alcanza con una publicacion\b/i.test(normalized) || /\bpatente sin evidencia\b/i.test(normalized)) {
      negativeConstraints.push('EXCLUDE_PURE_ACADEMIC_PAPER: Pure publication or patent without independent applied adoption fails qualification.');
    }
    if (/\bno incluir.*medio ambiente de forma generica\b/i.test(normalized)) {
      negativeConstraints.push('EXCLUDE_GENERIC_ENVIRONMENTAL_STATEMENT: Organizations merely mentioning general environmentalism without wetland-specific capacity fail.');
    }
    if (/\bno calificar.*solamente por tener una ruta\b/i.test(normalized)) {
      negativeConstraints.push('EXCLUDE_GENERIC_HIGHWAY_ONLY: General transit point without dedicated cold-chain/perishable activity fails.');
    }
    if (/\bno alcanza con un perfil.*experto en ciberseguridad\b/i.test(normalized)) {
      negativeConstraints.push('EXCLUDE_SELF_DESCRIBED_TITLE: Self-description without documented technical work in critical infrastructure fails.');
    }
    if (/\bno alcanza con declaraciones generales de inclusion\b/i.test(normalized) || /\bno alcanza con asistencia\b/i.test(normalized)) {
      negativeConstraints.push('EXCLUDE_GENERIC_INCLUSION_OR_TRAINING: Must have concrete employment of disabled people in food operations.');
    }
    if (/\bno inferir.*porque ambas aparecen en el mismo sector\b/i.test(normalized)) {
      negativeConstraints.push('EXCLUDE_SECTOR_CO_OCCURRENCE: Co-occurrence without concrete bilateral partnership proof fails.');
    }
    if (/\bno confundir riesgo alto con capacidad alta\b/i.test(normalized)) {
      negativeConstraints.push('EXCLUDE_CONFLATED_RISK_AND_CAPACITY: Risk exposure and response capacity must be tracked separately.');
    }
    if (/\bnota aislada no alcanza\b/i.test(normalized)) {
      negativeConstraints.push('EXCLUDE_ISOLATED_ARTICLE: Media outlet requires verified recurring coverage in science or technology.');
    }
    if (/\bno alcanza con.*evento protocolar\b/i.test(normalized)) {
      negativeConstraints.push('EXCLUDE_PROTOCOL_PHOTO_OP: Tripartite initiative requires concrete joint activity or measurable product.');
    }

    return {
      actionRequested,
      targetUnit: unitResolution.primaryUnitOfAnalysis,
      qualifyingConditions: [
        'Must possess verifiable public provenance',
        'Must fulfill all mission-specific positive criteria'
      ],
      relationConditions: unitResolution.unitCategory === 'RELATIONSHIP_LINK' || unitResolution.primaryUnitOfAnalysis === 'INTERSECTORAL_PROJECT'
        ? ['Joint simultaneous participation in the same project context required']
        : [],
      geographicConditions,
      temporalConditions: ['Current or verifiable historical activity'],
      quantity,
      evidenceRequirements: [
        'Public verifiable citation',
        'Authoritative provenance',
        'Independent multi-dimensional confirmation'
      ],
      comparisonDimensions,
      negativeConstraints,
      optionalEnrichment: [
        'Contact channels',
        'Specific actors',
        'Dates and quantitative metrics'
      ]
    };
  }
}
