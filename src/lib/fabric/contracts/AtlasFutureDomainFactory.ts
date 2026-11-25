/**
 * ATLAS FUTURE DOMAIN FACTORY CONTRACT V1
 * 
 * Future-facing architecture contract for "ATLAS SEARCH FACTORY".
 * Defines specifications for automated DomainPack generation from natural language
 * requirements without manual coding of vertical search engines.
 * 
 * Future Domain Packs declared:
 * - COMPANIES_ARGENTINA
 * - SUPPLIERS_ARGENTINA
 * - REGULATIONS_ARGENTINA
 * - NEWS_INTELLIGENCE
 * - PROFESSIONALS_ARGENTINA
 * - TALENT_ARGENTINA
 * - MARKET_INTELLIGENCE
 */

import type { AtlasDomainPack, DomainUIConfig } from './AtlasDomainPack';

export interface CreateDomainSpecificationInput {
  domain_id: string;
  natural_language_prompt: string; // e.g. "Quiero un buscador de bodegas argentinas con provincia, producción, exportaciones y responsables comerciales."
  jurisdiction_scope: string;     // e.g. "Argentina / Mendoza / San Juan"
  target_audience: 'INTERNAL_ANALYST' | 'PUBLIC_DIRECTORY' | 'ENTERPRISE_PROCUREMENT';
  compliance_tier: 'PUBLIC_OPEN_DATA' | 'STRICT_CONFIDENTIAL' | 'REGULATED';
}

export interface GeneratedDomainSpecification {
  domain_id: string;
  proposed_entity_type: string;
  display_name: string;
  schema: Record<string, { type: string; required: boolean; description: string }>;
  identity_policy: {
    primary_id_field: string;
    strong_identifier_fields: string[];
    soft_corroboration_fields: string[];
    dedup_strategy: 'STRONG_HASH_MATCH' | 'REGISTRY_ID_MATCH' | 'DOMAIN_SPECIFIC';
    allow_soft_canonical_merge: false;
  };
  source_strategy: {
    recommended_source_families: string[];
    initial_discovery_queries: string[];
    target_authorities: string[];
  };
  evidence_policy: {
    require_source_url: boolean;
    require_confidence: boolean;
    min_confidence: number;
  };
  facets: string[];
  ranking_factors: { field: string; weight: number; match_type: string }[];
  coverage_dimensions: string[];
  privacy_policy: {
    allow_private_contact_harvesting: false;
    allow_home_address_harvesting: false;
    sensitive_field_masking: string[];
  };
  ui_config_template: DomainUIConfig;
}

/**
 * Interface declarations for future planned domain packs (Phase 28)
 */
export interface CompaniesArgentinaEntity {
  cuit: string;
  legal_name: string;
  trade_name: string;
  industry_sector: string;
  afip_activity_code: string;
  province: string;
  city: string;
  legal_representative: string;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface SuppliersArgentinaEntity {
  supplier_id: string;
  cuit: string;
  legal_name: string;
  sipro_status: 'REGISTERED' | 'SUSPENDED' | 'APPLICANT';
  offered_rubros: string[];
  adjudicated_contracts_count: number;
  total_awarded_ars: number;
}

export interface RegulationsArgentinaEntity {
  norma_id: string;
  tipo_norma: 'LEY' | 'DECRETO' | 'RESOLUCION' | 'DISPOSICION';
  numero: string;
  anio: number;
  emisor: string;
  fecha_sancion: string;
  fecha_boletin: string;
  titulo_sumario: string;
  texto_url: string;
}

export interface NewsIntelligenceEntity {
  article_id: string;
  headline: string;
  source_outlet: string;
  published_at: string;
  mentioned_entities: string[];
  topic_taxonomy: string[];
  sentiment: 'POSITIVE' | 'NEUTRAL' | 'CRITICAL';
}

export interface ProfessionalsArgentinaEntity {
  matricula_id: string;
  full_name: string;
  colegio_profesional: string;
  profesion: string;
  especialidad: string;
  provincia: string;
  estado_matricula: 'ACTIVA' | 'SUSPENDIDA' | 'PASIVA';
}

export interface TalentArgentinaEntity {
  candidate_id: string;
  normalized_role: string;
  experience_tier: 'JUNIOR' | 'SEMI_SENIOR' | 'SENIOR' | 'EXECUTIVE';
  primary_skills: string[];
  academic_degree: string;
  verified_credentials_count: number;
}

export interface MarketIntelligenceEntity {
  market_id: string;
  industry_code: string;
  market_size_ars: number;
  market_size_usd: number;
  leading_companies: string[];
  annual_growth_rate: number;
  data_quarter: string;
}

/**
 * Architectural specification for the future Atlas Search Factory
 */
export class AtlasFutureDomainFactory {
  public static generateDomainSpecification(input: CreateDomainSpecificationInput): GeneratedDomainSpecification {
    // Contract definition for automated generator
    return {
      domain_id: input.domain_id,
      proposed_entity_type: input.domain_id.split('_')[0].toUpperCase(),
      display_name: `Buscador Industrial: ${input.domain_id}`,
      schema: {
        id: { type: 'string', required: true, description: 'Canonical unique identifier' },
        name: { type: 'string', required: true, description: 'Display name / title' },
        province: { type: 'string', required: true, description: 'Geographic location' },
        sector: { type: 'string', required: true, description: 'Activity sector' }
      },
      identity_policy: {
        primary_id_field: 'id',
        strong_identifier_fields: ['id'],
        soft_corroboration_fields: ['name', 'province'],
        dedup_strategy: 'REGISTRY_ID_MATCH',
        allow_soft_canonical_merge: false
      },
      source_strategy: {
        recommended_source_families: ['OPEN_GOVERNMENT', 'OFFICIAL_REGISTRY'],
        initial_discovery_queries: [`site:gov.ar ${input.natural_language_prompt}`],
        target_authorities: ['Registros Provinciales', 'Ministerios Nacionales']
      },
      evidence_policy: {
        require_source_url: true,
        require_confidence: true,
        min_confidence: 0.85
      },
      facets: ['province', 'sector'],
      ranking_factors: [
        { field: 'name', weight: 0.4, match_type: 'fuzzy' },
        { field: 'sector', weight: 0.3, match_type: 'exact' },
        { field: 'province', weight: 0.3, match_type: 'exact' }
      ],
      coverage_dimensions: ['Identity', 'Geography', 'Activity', 'Evidence'],
      privacy_policy: {
        allow_private_contact_harvesting: false,
        allow_home_address_harvesting: false,
        sensitive_field_masking: []
      },
      ui_config_template: {
        search_placeholder: `Buscar en ${input.domain_id}...`,
        primary_column: 'name',
        columns: [
          { key: 'name', label: 'Nombre / Título', width: '40%' },
          { key: 'province', label: 'Provincia', width: '30%' },
          { key: 'sector', label: 'Sector', width: '30%' }
        ],
        filters: [
          { key: 'province', label: 'Provincia', type: 'select' },
          { key: 'sector', label: 'Sector', type: 'select' }
        ],
        detail_sections: [
          { id: 'general', label: 'Información General', fields: ['name', 'province', 'sector'] }
        ],
        badges: [],
        default_sort: { field: 'name', direction: 'asc' }
      }
    };
  }
}
