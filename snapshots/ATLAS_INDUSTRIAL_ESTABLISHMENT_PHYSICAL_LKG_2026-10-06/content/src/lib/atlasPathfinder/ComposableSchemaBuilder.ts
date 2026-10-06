/**
 * ATLAS — AI PATHFINDER V2
 * Module: ComposableSchemaBuilder (Sections 7, 8, 20)
 * 
 * Composes mission-qualified database schemas strictly from the Mission Ontology,
 * Primary Unit of Analysis, and Mandatory Criterion Mappings.
 * 
 * Invariants:
 * - No fixed PERSON or ORGANIZATION schema template collapse.
 * - Schema names reflect the true semantic unit and domain.
 * - Every mapped mandatory field is represented with precise category and requirement flags.
 */

import type {
  DatabaseFieldDefinition,
  MandatoryCriterionMapping,
  MissionDatabaseSchema,
  MissionOntology
} from './types.ts';

export class ComposableSchemaBuilder {
  /**
   * Composes a dynamic schema from the mission ontology and criterion mappings.
   */
  public static buildSchema(
    ontology: MissionOntology,
    criterionMappings: MandatoryCriterionMapping[],
    rawObjective: string,
    targetQuantity: number = 10
  ): MissionDatabaseSchema {
    const primaryUnit = ontology.primaryUnitOfAnalysis;
    const fields: DatabaseFieldDefinition[] = [];
    const addedFieldNames = new Set<string>();

    const addField = (field: DatabaseFieldDefinition) => {
      if (!addedFieldNames.has(field.name)) {
        fields.push(field);
        addedFieldNames.add(field.name);
      }
    };

    // 1. IDENTITY FIELDS (Primary key and entity identifiers)
    let primaryKeyField = 'record_id';
    let canonicalRelationField = 'canonical_id';

    if (primaryUnit === 'CITY' || primaryUnit === 'LOCALITY') {
      canonicalRelationField = 'canonical_locality_id';
      addField({
        name: 'city_name',
        type: 'string',
        required: true,
        description: 'Nombre oficial de la ciudad o localidad argentina',
        evidenceRequired: true,
        category: 'IDENTITY'
      });
      addField({
        name: 'province',
        type: 'string',
        required: true,
        description: 'Provincia a la que pertenece la localidad',
        evidenceRequired: true,
        category: 'LOCATION'
      });
      addField({
        name: 'jurisdiction',
        type: 'string',
        required: true,
        description: 'Departamento o partido administrativo',
        evidenceRequired: false,
        category: 'LOCATION'
      });
    } else if (primaryUnit === 'RELATIONSHIP' || primaryUnit === 'COLLABORATION') {
      canonicalRelationField = 'canonical_relationship_id';
      addField({
        name: 'university_name',
        type: 'string',
        required: true,
        description: 'Nombre de la universidad o institución académica argentina',
        evidenceRequired: true,
        category: 'IDENTITY'
      });
      addField({
        name: 'company_name',
        type: 'string',
        required: true,
        description: 'Nombre de la empresa privada identificable',
        evidenceRequired: true,
        category: 'IDENTITY'
      });
      addField({
        name: 'relationship_type',
        type: 'string',
        required: true,
        description: 'Modalidad de colaboración (convenio, consorcio, I+D, licencia)',
        evidenceRequired: true,
        category: 'RELATIONSHIP'
      });
      addField({
        name: 'collaboration_topic',
        type: 'string',
        required: true,
        description: 'Área temática del proyecto (ej: energía renovable)',
        evidenceRequired: true,
        category: 'CAPABILITY'
      });
    } else if (primaryUnit === 'TECHNOLOGY' || primaryUnit === 'TECHNOLOGY_TRANSFER_CASE') {
      canonicalRelationField = 'canonical_technology_id';
      addField({
        name: 'technology_name',
        type: 'string',
        required: true,
        description: 'Denominación de la tecnología, desarrollo o producto concreto',
        evidenceRequired: true,
        category: 'IDENTITY'
      });
      addField({
        name: 'origin_institution',
        type: 'string',
        required: true,
        description: 'Institución científica o académica argentina de origen',
        evidenceRequired: true,
        category: 'RELATIONSHIP'
      });
      addField({
        name: 'application_evidence',
        type: 'string',
        required: true,
        description: 'Evidencia independiente de aplicación comercial, clínica o industrial',
        evidenceRequired: true,
        category: 'CAPABILITY'
      });
      addField({
        name: 'applied_sector',
        type: 'string',
        required: false,
        description: 'Sector productivo o de mercado donde se adoptó la tecnología',
        evidenceRequired: false,
        category: 'CAPABILITY'
      });
    } else if (primaryUnit === 'INTERSECTORAL_PROJECT' || primaryUnit === 'PROJECT') {
      canonicalRelationField = 'canonical_project_id';
      addField({
        name: 'project_name',
        type: 'string',
        required: true,
        description: 'Nombre de la iniciativa, proyecto o consorcio',
        evidenceRequired: true,
        category: 'IDENTITY'
      });
      addField({
        name: 'public_actor',
        type: 'string',
        required: true,
        description: 'Organismo público interviniente',
        evidenceRequired: true,
        category: 'RELATIONSHIP'
      });
      addField({
        name: 'academic_actor',
        type: 'string',
        required: true,
        description: 'Institución académica o científica interviniente',
        evidenceRequired: true,
        category: 'RELATIONSHIP'
      });
      addField({
        name: 'private_actor',
        type: 'string',
        required: true,
        description: 'Empresa u organización social interviniente',
        evidenceRequired: true,
        category: 'RELATIONSHIP'
      });
      addField({
        name: 'concrete_result_evidence',
        type: 'string',
        required: true,
        description: 'Evidencia de actividad, producto o resultado concreto medible',
        evidenceRequired: true,
        category: 'CAPABILITY'
      });
    } else if (primaryUnit === 'LOGISTICS_NODE' || primaryUnit === 'LOGISTICS_CORRIDOR') {
      canonicalRelationField = 'canonical_node_id';
      addField({
        name: 'node_name',
        type: 'string',
        required: true,
        description: 'Identificador del corredor, nodo logístico o puerto',
        evidenceRequired: true,
        category: 'IDENTITY'
      });
      addField({
        name: 'transport_infrastructure',
        type: 'string',
        required: true,
        description: 'Infraestructura de transporte (rutas, puertos, ferrocarril, multimodal)',
        evidenceRequired: true,
        category: 'CAPABILITY'
      });
      addField({
        name: 'cold_chain_activity',
        type: 'string',
        required: true,
        description: 'Actividad frigorífica, perecederos o mercado concentrador',
        evidenceRequired: true,
        category: 'COMPARISON'
      });
    } else if (primaryUnit === 'MEDIA_OUTLET') {
      canonicalRelationField = 'canonical_media_id';
      addField({
        name: 'outlet_name',
        type: 'string',
        required: true,
        description: 'Nombre del medio o proyecto periodístico especializado',
        evidenceRequired: true,
        category: 'IDENTITY'
      });
      addField({
        name: 'editorial_specialization',
        type: 'string',
        required: true,
        description: 'Especialidad temática recurrente (ej: ciencia y tecnología)',
        evidenceRequired: true,
        category: 'CAPABILITY'
      });
      addField({
        name: 'recurrence_evidence',
        type: 'string',
        required: true,
        description: 'Evidencia de publicación recurrente (múltiples entregas)',
        evidenceRequired: true,
        category: 'EVIDENCE'
      });
      addField({
        name: 'featured_journalists',
        type: 'array',
        required: false,
        description: 'Periodistas o autores respaldados con vínculo público al medio',
        evidenceRequired: false,
        category: 'RELATIONSHIP'
      });
    } else if (primaryUnit === 'ORGANIZATION') {
      canonicalRelationField = 'cuit';
      addField({
        name: 'organization_name',
        type: 'string',
        required: true,
        description: 'Razón social o nombre formal de la entidad',
        evidenceRequired: true,
        category: 'IDENTITY'
      });
      addField({
        name: 'cuit',
        type: 'string',
        required: true,
        description: 'Identificador tributario o registro legal',
        evidenceRequired: true,
        category: 'IDENTITY'
      });
      addField({
        name: 'specific_capacity_contributed',
        type: 'string',
        required: true,
        description: 'Capacidad concreta demostrable aportada para el objetivo',
        evidenceRequired: true,
        category: 'CAPABILITY'
      });
    } else if (primaryUnit === 'PERSON') {
      canonicalRelationField = 'canonical_person_id';
      addField({
        name: 'name',
        type: 'string',
        required: true,
        description: 'Nombre completo de la persona referente',
        evidenceRequired: true,
        category: 'IDENTITY'
      });
      addField({
        name: 'technical_cybersecurity_evidence',
        type: 'string',
        required: true,
        description: 'Evidencia de trabajo técnico en ciberseguridad',
        evidenceRequired: true,
        category: 'CAPABILITY'
      });
      addField({
        name: 'critical_infrastructure_relation',
        type: 'string',
        required: true,
        description: 'Relación con infraestructura crítica (energía, telcos, finanzas)',
        evidenceRequired: true,
        category: 'CAPABILITY'
      });
    } else {
      // Mission-defined composite entity
      canonicalRelationField = `canonical_${primaryUnit.toLowerCase()}_id`;
      addField({
        name: 'entity_name',
        type: 'string',
        required: true,
        description: `Nombre o identificador principal del registro (${primaryUnit})`,
        evidenceRequired: true,
        category: 'IDENTITY'
      });
    }

    // 2. INCORPORATE MAPPED FIELDS FROM MANDATORY CRITERIA (Section 8)
    for (const mapping of criterionMappings) {
      if (!mapping.isNegativeConstraint) {
        for (const fName of mapping.mappedFields) {
          if (!addedFieldNames.has(fName) && !['record_id', 'canonical_id'].includes(fName)) {
            addField({
              name: fName,
              type: fName.includes('list') || fName.includes('sources') || fName.includes('actors') ? 'array' : 'string',
              required: true,
              description: `Dato requerido derivado del criterio [${mapping.criterionId}]: ${mapping.rawText}`,
              evidenceRequired: true,
              category: fName.includes('evidence') ? 'EVIDENCE' : 'CAPABILITY',
              derivedFromCriterion: mapping.criterionId
            });
          }
        }
      }
    }

    // 3. UNIVERSAL VERIFICATION, QUALIFICATION & PROVENANCE FIELDS (Sections 9, 10, 11)
    addField({
      name: 'provenance_sources',
      type: 'array',
      required: true,
      description: 'Fuentes públicas verificables que respaldan la evidencia',
      evidenceRequired: true,
      category: 'PROVENANCE'
    });
    addField({
      name: 'entity_verification_status',
      type: 'string',
      required: true,
      description: 'Estado de verificación física de la entidad (ENTITY_VERIFIED / UNVERIFIED)',
      evidenceRequired: false,
      category: 'STATUS'
    });
    addField({
      name: 'mission_qualification_status',
      type: 'string',
      required: true,
      description: 'Estado de calificación de la misión (MISSION_QUALIFIED / MISSION_REJECTED)',
      evidenceRequired: false,
      category: 'STATUS'
    });
    addField({
      name: 'mandatory_criteria_passed',
      type: 'array',
      required: true,
      description: 'Lista de identificadores de criterios obligatorios satisfechos',
      evidenceRequired: false,
      category: 'STATUS'
    });
    addField({
      name: 'confidence',
      type: 'number',
      required: true,
      description: 'Nivel de confianza en la evidencia (0.0 - 1.0)',
      evidenceRequired: false,
      category: 'STATUS'
    });

    // Generate expressive schema name derived from the primary unit and domain
    const cleanObjectiveToken = rawObjective
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 4 && !['construir', 'construime', 'armar', 'base', 'datos', 'argentina', 'argentinos'].includes(w.toLowerCase()))
      .slice(0, 2)
      .join('_')
      .toUpperCase();

    const schemaName = `DATABASE_${primaryUnit}_${cleanObjectiveToken || 'QUALIFIED'}`;

    return {
      schemaId: `SCH_${Date.now()}_${primaryUnit}`,
      schemaName,
      targetEntityType: primaryUnit,
      primaryUnitOfAnalysis: primaryUnit,
      fields,
      primaryKeyField,
      canonicalRelationField,
      minEvidenceConfidence: 0.70
    };
  }
}
