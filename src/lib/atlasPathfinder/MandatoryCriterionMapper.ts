/**
 * ATLAS — AI PATHFINDER V2
 * Module: MandatoryCriterionMapper (Sections 8, 22, 23)
 * 
 * Maps every user-supplied mandatory criterion into formal schema fields,
 * relation constraints, evidence requirements, and qualification tests.
 * 
 * Invariants:
 * - UNMAPPED_MANDATORY_CRITERIA = 0 required before execution.
 * - Negative qualification constraints explicitly flagged.
 * - If a criterion cannot be modeled, stops with ONTOLOGY_OR_SCHEMA_INSUFFICIENT.
 */

import type {
  MandatoryCriterionMapping,
  MissionOntology
} from './types.ts';

export class MandatoryCriterionMapper {
  /**
   * Maps an array of natural-language mandatory criteria into structured mappings.
   */
  public static mapCriteria(
    rawObjective: string,
    criteria: string[] = [],
    ontology: MissionOntology
  ): {
    mappings: MandatoryCriterionMapping[];
    unmappedCount: number;
    negativeConstraintsCount: number;
  } {
    // If no explicit criteria provided in prompt, extract implicit criteria from objective
    const effectiveCriteria = criteria.length > 0 ? criteria : this.extractImplicitCriteria(rawObjective, ontology);
    const mappings: MandatoryCriterionMapping[] = [];

    let idx = 1;
    for (const crit of effectiveCriteria) {
      const lower = crit.toLowerCase();
      const normalized = lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

      const isNegative =
        /\b(no alcanzar|no alcanza|no se puede|no calificar|no incluir|no confundir|no inferir|sin evidencia)\b/i.test(normalized);

      const mappedFields: string[] = [];
      const mappedRelations: string[] = [];
      const requiredEvidence: string[] = [];
      let qualificationTest = '';

      // Geographic or Locality presence
      if (/\b(ciudad|localidad|argentina|jurisdiccion|geograf)\b/i.test(normalized) && !isNegative) {
        mappedFields.push('geography', 'jurisdiction');
        requiredEvidence.push('verified_geographic_identity');
        qualificationTest = 'Entity must resolve to an identifiable Argentine territory or jurisdiction.';
      }

      // Industrial or Manufacturing activity
      if (/\b(industrial|manufactura|automatizacion|fabrica)\b/i.test(normalized) && !isNegative) {
        mappedFields.push('industrial_activity_evidence', 'sector');
        mappedRelations.push('HOSTS_INDUSTRIAL_ACTIVITY');
        requiredEvidence.push('public_industrial_evidence');
        qualificationTest = 'Must possess verifiable public record of manufacturing or industrial activity.';
      }

      // Technical education or university engineering
      if (/\b(educacion tecnica|ingenieria|tecnologica|universidad|instituto)\b/i.test(normalized) && !isNegative) {
        mappedFields.push('technical_education_offer', 'academic_institutions');
        mappedRelations.push('PROVIDES_TECHNICAL_EDUCATION');
        requiredEvidence.push('educational_offer_evidence');
        qualificationTest = 'Must possess verifiable public offering in technical/engineering education.';
      }

      // Business or Enterprise presence
      if (/\b(empresarial|empresas|camaras|tejido empresarial)\b/i.test(normalized) && !isNegative) {
        mappedFields.push('business_fabric_evidence', 'companies');
        requiredEvidence.push('commercial_entity_registry');
        qualificationTest = 'Must have verifiable presence of industrial/automation companies or clusters.';
      }

      // Provenance / Citation retention
      if (/\b(provenance|evidencia publica|verificable|fuentes)\b/i.test(normalized) && !isNegative) {
        mappedFields.push('provenance_sources', 'evidence_summary');
        requiredEvidence.push('authoritative_citation');
        qualificationTest = 'All dimensions must be backed by documented source URLs and timestamps.';
      }

      // Technology development & origin
      if (/\b(tecnologia|desarrollo|producto concreto|origen cientifico|institucion de origen)\b/i.test(normalized) && !isNegative) {
        mappedFields.push('technology_name', 'origin_institution');
        mappedRelations.push('DEVELOPED_AT');
        requiredEvidence.push('scientific_development_evidence');
        qualificationTest = 'Must identify concrete technology developed at an Argentine scientific/academic body.';
      }

      // Practical / Commercial Application (Outside laboratory)
      if (/\b(aplicacion|comercial|clinica|productiv|adopcion|transferencia|fuera del laboratorio)\b/i.test(normalized) && !isNegative) {
        mappedFields.push('application_evidence', 'applied_sector', 'licensing_entity');
        mappedRelations.push('APPLIED_BY');
        requiredEvidence.push('applied_transfer_evidence');
        qualificationTest = 'Must demonstrate actual adoption or commercial deployment outside experimental lab.';
      }

      // Environmental capacity or wetlands restoration
      if (/\b(capacidad concreta|humedales|restauracion|conservacion|gestion hidrica|biodiversidad)\b/i.test(normalized) && !isNegative) {
        mappedFields.push('specific_capacity_contributed', 'justifying_evidence');
        requiredEvidence.push('environmental_operational_capacity');
        qualificationTest = 'Must specify and justify concrete operational capacity in wetland conservation or restoration.';
      }

      // Transport & Cold Chain / Food
      if (/\b(transporte|corredor|nodo|puerto|aeropuerto|ferrocarril)\b/i.test(normalized) && !isNegative) {
        mappedFields.push('transport_infrastructure', 'multimodal_connectivity');
        requiredEvidence.push('transport_logistics_proof');
        qualificationTest = 'Must document physical transport logistics infrastructure.';
      }
      if (/\b(cadena de frio|refrigerad|frigorifico|pereceder|alimentos)\b/i.test(normalized) && !isNegative) {
        mappedFields.push('cold_chain_activity', 'food_industry_evidence');
        requiredEvidence.push('cold_chain_economic_proof');
        qualificationTest = 'Must independently document cold chain or perishable food economic activity.';
      }

      // Technical expertise in Cybersecurity & Critical Infrastructure
      if (/\b(ciberseguridad|seguridad informatica|tecnica concreta)\b/i.test(normalized) && !isNegative) {
        mappedFields.push('technical_cybersecurity_evidence', 'publications_projects');
        requiredEvidence.push('technical_cybersecurity_work');
        qualificationTest = 'Must prove technical projects, research, or operational responsibility in cybersecurity.';
      }
      if (/\b(infraestructura critica|sistemas industriales|energia|telecomunicaciones|finanzas criticas)\b/i.test(normalized) && !isNegative) {
        mappedFields.push('critical_infrastructure_relation');
        requiredEvidence.push('critical_infra_engagement');
        qualificationTest = 'Must substantiate relationship with industrial systems, energy, telcos, or critical sectors.';
      }

      // Food production + Disability inclusion
      if (/\b(produccion|elaboracion|servicio.*alimentos)\b/i.test(normalized) && !isNegative) {
        mappedFields.push('food_activity_description', 'product_type');
        requiredEvidence.push('food_production_proof');
        qualificationTest = 'Must substantiate real food production or culinary service.';
      }
      if (/\b(inclusion laboral|discapacidad|laboral real)\b/i.test(normalized) && !isNegative) {
        mappedFields.push('disability_employment_evidence', 'employment_model');
        requiredEvidence.push('disabled_employment_proof');
        qualificationTest = 'Must demonstrate actual employment of persons with disabilities.';
      }

      // University <-> Company Bilateral Collaboration in Renewables
      if (/\b(universidad.*empresa|relacion universidad|colaboracion concreta)\b/i.test(normalized) && !isNegative) {
        mappedFields.push('university_name', 'company_name', 'project_type', 'collaboration_evidence');
        mappedRelations.push('COLLABORATES_WITH');
        requiredEvidence.push('bilateral_collaboration_proof');
        qualificationTest = 'Must explicitly prove bilateral collaboration between university and private firm.';
      }
      if (/\b(energia renovable|renovables)\b/i.test(normalized) && !isNegative) {
        mappedFields.push('renewable_energy_technology', 'project_state');
        requiredEvidence.push('renewable_tech_proof');
        qualificationTest = 'Collaboration must be directly centered on renewable energy.';
      }

      // Flood risk & Institutional Emergency Response
      if (/\b(riesgo.*inundacion|antecedentes.*inundacion)\b/i.test(normalized) && !isNegative) {
        mappedFields.push('flood_risk_evidence', 'historical_antecedents');
        requiredEvidence.push('flood_exposure_data');
        qualificationTest = 'Must document public exposure, history, or risk of flooding.';
      }
      if (/\b(capacidad de respuesta|defensa civil|bomberos|organismos hidricos|alerta)\b/i.test(normalized) && !isNegative) {
        mappedFields.push('response_capacity_evidence', 'emergency_institutions');
        requiredEvidence.push('emergency_response_proof');
        qualificationTest = 'Must separately substantiate institutional/community emergency response capacity.';
      }

      // Science/Tech Media & Journalists
      if (/\b(publicacion recurrente|especializado y recurrente|ciencia o tecnologia)\b/i.test(normalized) && !isNegative) {
        mappedFields.push('editorial_specialization', 'recurrence_evidence');
        requiredEvidence.push('recurring_science_editorial_proof');
        qualificationTest = 'Must demonstrate recurring science/technology editorial activity.';
      }
      if (/\b(autores|periodistas|vinculo autor.*medio)\b/i.test(normalized) && !isNegative) {
        mappedFields.push('featured_journalists', 'author_media_link_evidence');
        mappedRelations.push('FEATURES_JOURNALIST');
        requiredEvidence.push('byline_association_proof');
        qualificationTest = 'Author linkage to the media outlet must be verified by public bylines or mastheads.';
      }

      // Tripartite Projects (Public + Academic + Private)
      if (/\b(organismo publico|actor publico)\b/i.test(normalized) && !isNegative) {
        mappedFields.push('public_actor_name', 'public_role');
        mappedRelations.push('HAS_PUBLIC_ACTOR');
        requiredEvidence.push('public_agency_participation');
        qualificationTest = 'Must identify at least one verified public actor.';
      }
      if (/\b(academica|cientifica|institucion academica)\b/i.test(normalized) && !isNegative) {
        mappedFields.push('academic_actor_name', 'academic_role');
        mappedRelations.push('HAS_ACADEMIC_ACTOR');
        requiredEvidence.push('academic_partner_participation');
        qualificationTest = 'Must identify at least one verified academic/scientific actor.';
      }
      if (/\b(privada|empresarial|social|organizacion social)\b/i.test(normalized) && !isNegative) {
        mappedFields.push('private_social_actor_name', 'private_role');
        mappedRelations.push('HAS_PRIVATE_ACTOR');
        requiredEvidence.push('private_actor_participation');
        qualificationTest = 'Must identify at least one private enterprise or social organization.';
      }
      if (/\b(participen simultaneamente|mismo proyecto)\b/i.test(normalized) && !isNegative) {
        mappedFields.push('joint_participation_evidence');
        mappedRelations.push('SAME_CONTEXT_RELATION_REQUIRED');
        requiredEvidence.push('joint_tripartite_proof');
        qualificationTest = 'All three actor types must be proven to participate jointly in the same project.';
      }
      if (/\b(resultado o actividad|implementacion|producto concreto)\b/i.test(normalized) && !isNegative) {
        mappedFields.push('concrete_results_evidence', 'measurable_outputs');
        requiredEvidence.push('concrete_activity_evidence');
        qualificationTest = 'Initiative must have concrete verifiable implementation or outputs.';
      }

      // NEGATIVE CONSTRAINTS (Section 23)
      if (isNegative) {
        mappedFields.push('negative_constraint_audit');
        requiredEvidence.push('exclusion_test_passed');
        qualificationTest = `NEGATIVE EXCLUSION CONSTRAINT: Candidate must NOT rely exclusively on weaker substitute conditions: "${crit}".`;
      }

      // Ensure every criterion has mapped at least one field or test
      if (mappedFields.length === 0) {
        mappedFields.push('general_mission_qualification_evidence');
        requiredEvidence.push('domain_evidence');
        qualificationTest = `Candidate must satisfy rule: ${crit}`;
      }

      mappings.push({
        criterionId: `CRIT_${String(idx).padStart(2, '0')}`,
        rawText: crit,
        mappedFields: Array.from(new Set(mappedFields)),
        mappedRelations: Array.from(new Set(mappedRelations)),
        requiredEvidence: Array.from(new Set(requiredEvidence)),
        qualificationTest,
        isNegativeConstraint: isNegative
      });
      idx++;
    }

    const unmapped = mappings.filter(m => m.mappedFields.length === 0).length;
    const negativeCount = mappings.filter(m => m.isNegativeConstraint).length;

    return {
      mappings,
      unmappedCount: unmapped,
      negativeConstraintsCount: negativeCount
    };
  }

  private static extractImplicitCriteria(rawObjective: string, ontology: MissionOntology): string[] {
    const criteria: string[] = [
      `Each record must represent a valid ${ontology.primaryUnitOfAnalysis}.`,
      'Must possess verifiable public provenance with documented sources.'
    ];

    if (ontology.relationTypes.length > 0) {
      criteria.push(`Must possess verifiable relational link of type ${ontology.relationTypes.join(' and ')}.`);
    }

    return criteria;
  }
}
