/**
 * PROCUREMENT_ARGENTINA DOMAIN PACK V1
 * 
 * Domain Pack implementation for public procurement and tenders in Argentina.
 * Proves that the Atlas Industrial Search Fabric generalizes to non-human entities
 * without code duplication or semantic leakage.
 * 
 * Target Entity: TENDER (Licitación / Contratación Pública)
 */

import type { AtlasDomainPack, DomainUIConfig } from '../../contracts/AtlasDomainPack';

export interface TenderRecord {
  tender_id: string;
  title: string;
  agency: string;
  jurisdiction: string;
  sector: string;
  description: string;
  amount: number;
  currency: 'ARS' | 'USD' | 'EUR';
  publication_date: string;
  closing_date: string;
  status: 'OPEN' | 'IN_EVALUATION' | 'AWARDED' | 'DESERTED' | 'CANCELLED';
  source_url: string;
  process_number: string;
  observed_at: string;
  evidence_id?: string;
  source_id?: string;
}

const PROCUREMENT_UI_CONFIG: DomainUIConfig = {
  search_placeholder: 'Buscar licitaciones, pliegos, organismos (ej. Ministerio de Salud, reactivos, pavimentación)...',
  primary_column: 'title',
  columns: [
    { key: 'title', label: 'Objeto de la Contratación', width: '38%' },
    { key: 'agency', label: 'Organismo Convocante', width: '22%' },
    { key: 'jurisdiction', label: 'Jurisdicción', width: '12%' },
    { key: 'amount', label: 'Monto Estimado', width: '14%', type: 'currency' },
    { key: 'closing_date', label: 'Apertura de Ofertas', width: '14%', type: 'date' }
  ],
  filters: [
    { key: 'jurisdiction', label: 'Jurisdicción', type: 'select', options: ['Nacional / APN', 'CABA', 'Provincia de Buenos Aires', 'Córdoba', 'Santa Fe', 'Mendoza'] },
    { key: 'status', label: 'Estado', type: 'select', options: ['OPEN', 'IN_EVALUATION', 'AWARDED', 'DESERTED', 'CANCELLED'] },
    { key: 'sector', label: 'Sector / Rubro', type: 'select', options: ['Salud y Farmacéutica', 'Infraestructura y Obra Pública', 'Tecnología e Informática', 'Seguridad y Defensa', 'Alimentos y Suministros', 'Servicios Profesionales'] },
    { key: 'currency', label: 'Moneda', type: 'select', options: ['ARS', 'USD'] }
  ],
  detail_sections: [
    { id: 'overview', label: 'Datos de la Convocatoria', fields: ['title', 'agency', 'jurisdiction', 'sector', 'description'] },
    { id: 'financial', label: 'Presupuesto y Moneda', fields: ['amount', 'currency'] },
    { id: 'dates', label: 'Plazos y Cronograma', fields: ['publication_date', 'closing_date'] },
    { id: 'provenance', label: 'Evidencia Oficial', fields: ['process_number', 'source_url', 'observed_at'] }
  ],
  badges: [
    {
      field: 'status',
      values_color_map: {
        'OPEN': 'emerald',
        'IN_EVALUATION': 'amber',
        'AWARDED': 'blue',
        'DESERTED': 'zinc',
        'CANCELLED': 'rose'
      }
    }
  ],
  default_sort: { field: 'closing_date', direction: 'asc' }
};

export const ProcurementArgentinaDomainPack: AtlasDomainPack<TenderRecord> = {
  domain_id: 'PROCUREMENT_ARGENTINA',
  entity_type: 'TENDER',
  display_name: 'Compras Públicas y Licitaciones de la República Argentina',
  version: '1.0.0',

  entity_schema: {
    tender_id: { type: 'string', required: true, description: 'ID canónico único del proceso' },
    title: { type: 'string', required: true, description: 'Título u objeto oficial del pliego' },
    agency: { type: 'string', required: true, description: 'Organismo público o repartición contratante' },
    jurisdiction: { type: 'string', required: true, description: 'Nivel jurisdiccional (Nacional, CABA, Provincial)' },
    sector: { type: 'string', required: true, description: 'Categoría económica o ramo de la contratación' },
    description: { type: 'string', required: false, description: 'Alcance detallado de la prestación' },
    amount: { type: 'number', required: false, description: 'Presupuesto oficial estimado' },
    currency: { type: 'string', required: true, description: 'Moneda oficial (ARS/USD)' },
    publication_date: { type: 'string', required: true, description: 'Fecha de publicación de la convocatoria' },
    closing_date: { type: 'string', required: true, description: 'Fecha y hora límite de recepción de ofertas' },
    status: { type: 'string', required: true, description: 'Estado del proceso administrativo' },
    source_url: { type: 'string', required: true, description: 'URL directa en el portal oficial de compras' },
    process_number: { type: 'string', required: true, description: 'Número de expediente / contratación oficial' },
    observed_at: { type: 'string', required: true, description: 'Timestamp de captura por Atlas' }
  },

  searchable_fields: ['title', 'description', 'agency', 'jurisdiction', 'sector', 'process_number'],
  facets: ['agency', 'jurisdiction', 'sector', 'status', 'currency'],

  identity_policy: {
    primary_id_field: 'tender_id',
    strong_identifier_fields: ['process_number', 'source_url'],
    soft_corroboration_fields: ['title', 'agency'],
    allow_soft_canonical_merge: false, // Strict: Zero title-only merges
    dedup_strategy: 'REGISTRY_ID_MATCH',
    collision_action: 'REJECT'
  },

  evidence_policy: {
    require_source_url: true,
    require_confidence: true,
    min_confidence_to_persist: 0.85,
    require_observed_at: true
  },

  source_policy: {
    allowed_source_types: ['OPEN_GOVERNMENT', 'OFFICIAL_REGISTRY', 'BULLETIN_GAZETTE'],
    commercial_reuse_gate_required: true,
    privacy_gate_required: false // Procurement records are public legal records
  },

  privacy_policy: {
    allow_private_contact_harvesting: false,
    allow_home_address_harvesting: false,
    sensitive_field_masking: []
  },

  ranking_policy: {
    factors: [
      { field: 'title', weight: 0.35, match_type: 'fuzzy' },
      { field: 'agency', weight: 0.25, match_type: 'fuzzy' },
      { field: 'sector', weight: 0.15, match_type: 'exact' },
      { field: 'closing_date', weight: 0.15, match_type: 'recency' },
      { field: 'amount', weight: 0.10, match_type: 'numeric_range' }
    ],
    default_sort: { field: 'closing_date', direction: 'asc' }
  },

  freshness_policy: {
    stale_threshold_days: 15,
    auto_refresh_queue_priority: 90
  },

  discovery_policy: {
    discovery_patterns: [
      'https://comprar.gob.ar/ComprasElectronicas.aspx?qs=*',
      'https://buenosairescompras.gob.ar/licitaciones/vigentes',
      'https://licitaciones.gba.gob.ar/procesos/*'
    ],
    source_families: ['COMPRAR_APN', 'BAC_CABA', 'PB_LICITACIONES', 'BOLETIN_OFICIAL_LICITACIONES'],
    target_entity_types: ['TENDER'],
    replication_dimensions: ['jurisdiction', 'sector']
  },

  coverage_dimensions: [
    'Agency',
    'Jurisdiction',
    'Sector',
    'Amount',
    'Dates',
    'Status',
    'Evidence'
  ],

  ui_config: PROCUREMENT_UI_CONFIG,

  validateEntity(tender: TenderRecord): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!tender.tender_id) errors.push('Missing tender_id');
    if (!tender.title || tender.title.trim().length < 5) errors.push('Title too short or empty');
    if (!tender.agency) errors.push('Missing agency');
    if (!tender.process_number) errors.push('Missing official process_number');
    if (!tender.source_url || !tender.source_url.startsWith('http')) errors.push('Invalid source_url');

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  },

  calculateCompletenessScore(tender: TenderRecord): number {
    let score = 0;
    if (tender.title) score += 20;
    if (tender.agency && tender.jurisdiction) score += 20;
    if (tender.amount && tender.amount > 0) score += 20;
    if (tender.publication_date && tender.closing_date) score += 20;
    if (tender.source_url && tender.process_number) score += 20;
    return score;
  }
};
