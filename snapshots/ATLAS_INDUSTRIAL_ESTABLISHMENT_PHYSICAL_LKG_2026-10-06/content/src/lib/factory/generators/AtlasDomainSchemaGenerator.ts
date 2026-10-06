/**
 * ATLAS DOMAIN SCHEMA GENERATOR V1
 * 
 * Generates comprehensive, classified schema fields for the domain specification:
 * - CORE_IDENTITY: Strong official identifier (e.g. CUIT, Registro Oficial)
 * - SEARCHABLE: Full text indexable fields (razón social, nombre fantasía, productos, actividad)
 * - FACET: Categorical filter fields (industria, provincia, certificaciones)
 * - DISPLAY: Primary overview card data
 * - RELATION: Edges connecting to other entities (autoridades, certificadoras)
 * - TEMPORAL: Observation and update timestamps
 * - EVIDENCE_ONLY: Provenance links (fuente oficial, URL de registro)
 * - RESTRICTED: Sensitive or contact fields (email comercial público verificado)
 */

import type { ParsedDomainIntent } from '../parser/AtlasDomainIntentParser';
import type { FieldSpecification } from '../contracts/AtlasDomainSpecification';

export class AtlasDomainSchemaGenerator {
  public static generateSchema(intent: ParsedDomainIntent): FieldSpecification[] {
    const fields: FieldSpecification[] = [];

    if (intent.entity_type === 'COMPANY' || intent.entity_type === 'SUPPLIER') {
      fields.push(
        {
          name: 'cuit',
          type: 'string',
          classification: 'CORE_IDENTITY',
          required: true,
          nullable: false,
          searchable: true,
          facetable: false,
          sensitivity: 'COMMERCIAL_PUBLIC',
          evidence_required: true,
          description: 'Clave Única de Identificación Tributaria oficial'
        },
        {
          name: 'company_name',
          type: 'string',
          classification: 'SEARCHABLE',
          required: true,
          nullable: false,
          searchable: true,
          facetable: false,
          sensitivity: 'PUBLIC',
          evidence_required: true,
          description: 'Razón Social oficial de la empresa proveedora'
        },
        {
          name: 'trade_name',
          type: 'string',
          classification: 'SEARCHABLE',
          required: false,
          nullable: true,
          searchable: true,
          facetable: false,
          sensitivity: 'PUBLIC',
          evidence_required: false,
          description: 'Nombre de fantasía o marca comercial de la empresa'
        },
        {
          name: 'industry_sector',
          type: 'string',
          classification: 'FACET',
          required: true,
          nullable: false,
          searchable: true,
          facetable: true,
          sensitivity: 'PUBLIC',
          evidence_required: true,
          description: 'Sector industrial o ramo de actividad manufacturera'
        },
        {
          name: 'products',
          type: 'array',
          classification: 'SEARCHABLE',
          required: false,
          nullable: true,
          searchable: true,
          facetable: false,
          sensitivity: 'PUBLIC',
          evidence_required: false,
          description: 'Líneas de productos, insumos, componentes o servicios industriales provistos'
        },
        {
          name: 'province',
          type: 'string',
          classification: 'FACET',
          required: true,
          nullable: false,
          searchable: true,
          facetable: true,
          sensitivity: 'PUBLIC',
          evidence_required: true,
          description: 'Provincia argentina donde radica la planta o sede'
        },
        {
          name: 'city',
          type: 'string',
          classification: 'DISPLAY',
          required: false,
          nullable: true,
          searchable: true,
          facetable: false,
          sensitivity: 'PUBLIC',
          evidence_required: false,
          description: 'Parque industrial, localidad o ciudad de radicación'
        },
        {
          name: 'certifications',
          type: 'array',
          classification: 'FACET',
          required: false,
          nullable: true,
          searchable: true,
          facetable: true,
          sensitivity: 'PUBLIC',
          evidence_required: true,
          description: 'Normas de calidad certificadas (ISO 9001, ISO 14001, IRAM, API)'
        },
        {
          name: 'official_website',
          type: 'string',
          classification: 'DISPLAY',
          required: false,
          nullable: true,
          searchable: false,
          facetable: false,
          sensitivity: 'PUBLIC',
          evidence_required: false,
          description: 'Sitio web oficial verificado de la empresa'
        },
        {
          name: 'verified_commercial_email',
          type: 'string',
          classification: 'RESTRICTED',
          required: false,
          nullable: true,
          searchable: false,
          facetable: false,
          sensitivity: 'RESTRICTED_CONTACT',
          evidence_required: true,
          description: 'Email de contacto comercial público de la empresa (ventas@, comercial@). Nunca persona privada no consentida.'
        },
        {
          name: 'commercial_phone',
          type: 'string',
          classification: 'RESTRICTED',
          required: false,
          nullable: true,
          searchable: false,
          facetable: false,
          sensitivity: 'RESTRICTED_CONTACT',
          evidence_required: true,
          description: 'Teléfono de contacto comercial o planta fabril verificado'
        },
        {
          name: 'sipro_status',
          type: 'string',
          classification: 'FACET',
          required: false,
          nullable: true,
          searchable: false,
          facetable: true,
          sensitivity: 'PUBLIC',
          evidence_required: true,
          description: 'Estado de inscripción oficial en el Registro Nacional de Proveedores (SIPRO)'
        },
        {
          name: 'source_url',
          type: 'string',
          classification: 'EVIDENCE_ONLY',
          required: true,
          nullable: false,
          searchable: false,
          facetable: false,
          sensitivity: 'PUBLIC',
          evidence_required: true,
          description: 'URL canónica de la fuente pública oficial de registro'
        },
        {
          name: 'observed_at',
          type: 'date',
          classification: 'TEMPORAL',
          required: true,
          nullable: false,
          searchable: false,
          facetable: false,
          sensitivity: 'PUBLIC',
          evidence_required: true,
          description: 'Timestamp de observación y certificación en Atlas'
        }
      );
    }

    return fields;
  }
}
