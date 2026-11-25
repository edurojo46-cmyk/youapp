/**
 * PEOPLE_ARGENTINA DOMAIN PACK V1
 * 
 * Formal domain pack encapsulation for Atlas People.
 * Preserves 100% of existing behavior, identity invariants, and evidence gates
 * while plugging into the generic Atlas Industrial Search Fabric.
 */

import type { AtlasDomainPack } from '../../contracts/AtlasDomainPack';

export class PeopleArgentinaDomainPackClass implements AtlasDomainPack {
  public readonly domain_id = 'PEOPLE_ARGENTINA';
  public readonly entity_type = 'PERSON';
  public readonly display_name = 'Atlas Directorio Canónico de Personas Argentina';
  public readonly version = '1.0.0';

  public readonly entity_schema = {
    full_name: { type: 'string', required: true, description: 'Nombre completo oficial de la persona física' },
    organization: { type: 'string', required: true, description: 'Organización o empleador público/privado' },
    job_title: { type: 'string', required: false, description: 'Cargo o función pública declarada' },
    normalized_profession: { type: 'string', required: false, description: 'Profesión canónica normalizada' },
    province: { type: 'string', required: true, description: 'Provincia argentina de actuación' },
    city: { type: 'string', required: false, description: 'Ciudad o localidad específica verificada' },
    public_email: { type: 'string', required: false, description: 'Email público person-scoped verificado' },
    public_phone: { type: 'string', required: false, description: 'Teléfono público verificado' },
    social_profiles: { type: 'array', required: false, description: 'Enlaces a redes profesionales (ORCID, LinkedIn, etc.)' },
    identity_anchor_hash: { type: 'string', required: false, description: 'Hash SHA-256 de identificador nacional oficial' }
  };

  public readonly searchable_fields = [
    'full_name',
    'organization',
    'job_title',
    'normalized_profession',
    'province',
    'city',
    'public_email'
  ];

  public readonly facets = [
    'organization',
    'normalized_profession',
    'province',
    'completeness_tier',
    'source_id'
  ];

  public readonly identity_policy = {
    primary_id_field: 'atlas_person_id',
    strong_identifier_fields: ['national_id_hash', 'official_registry_id', 'orcid', 'institutional_id'],
    soft_corroboration_fields: ['full_name', 'organization', 'job_title', 'province'],
    allow_soft_canonical_merge: false, // STRICT INVARIANT: Zero canonical merge on soft attributes alone
    dedup_strategy: 'STRONG_HASH_MATCH' as const,
    collision_action: 'PROBABLE_SAME_ENTITY' as const
  };

  public readonly evidence_policy = {
    require_source_url: true,
    require_confidence: true,
    min_confidence_to_persist: 0.70,
    require_observed_at: true
  };

  public readonly source_policy = {
    allowed_source_types: [
      'OPEN_GOVERNMENT' as const,
      'OFFICIAL_REGISTRY' as const,
      'ACADEMIC_OAI' as const,
      'BULLETIN_GAZETTE' as const,
      'CORPORATE_FILING' as const
    ],
    commercial_reuse_gate_required: true,
    privacy_gate_required: true
  };

  public readonly privacy_policy = {
    allow_private_contact_harvesting: false,
    allow_home_address_harvesting: false,
    sensitive_field_masking: ['raw_dni', 'raw_cuil', 'personal_mobile', 'home_address']
  };

  public readonly ranking_policy = {
    factors: [
      { field: 'full_name', weight: 0.35, match_type: 'fuzzy' as const },
      { field: 'normalized_profession', weight: 0.25, match_type: 'exact' as const },
      { field: 'organization', weight: 0.20, match_type: 'fuzzy' as const },
      { field: 'identity_strength', weight: 0.10, match_type: 'exact' as const },
      { field: 'freshness', weight: 0.10, match_type: 'recency' as const }
    ],
    default_sort: { field: 'identity_strength', direction: 'desc' as const }
  };

  public readonly freshness_policy = {
    stale_threshold_days: 180,
    auto_refresh_queue_priority: 50
  };

  public readonly discovery_policy = {
    discovery_patterns: [
      'nomina personal abierta ckan csv',
      'padron autoridades boletin oficial',
      'cuerpo docente universitario coneau spu',
      'guia magistrados poder judicial',
      'registro colegiados matriculados'
    ],
    source_families: [
      'BOLETINES_OFICIALES',
      'PORTALES_DATOS_ABIERTOS',
      'PODER_JUDICIAL',
      'UNIVERSIDADES_CONEAU',
      'ORGANISMOS_CIENCIA'
    ],
    target_entity_types: ['PERSON'],
    replication_dimensions: ['PROVINCIA', 'SECTOR', 'PODER_DEL_ESTADO']
  };

  public readonly coverage_dimensions = [
    'Identity',
    'Work',
    'Geography',
    'Contact',
    'Social',
    'Evidence'
  ];

  public readonly ui_config = {
    search_placeholder: 'Buscar persona por nombre, cargo, profesión u organismo...',
    primary_column: 'full_name',
    columns: [
      { key: 'full_name', label: 'Persona / Nombre', width: '28%' },
      { key: 'organization', label: 'Organismo / Empleador', width: '24%' },
      { key: 'normalized_profession', label: 'Profesión', width: '18%' },
      { key: 'province', label: 'Jurisdicción', width: '15%' },
      { key: 'completeness_tier', label: 'Riqueza', width: '15%', type: 'badge' }
    ],
    filters: [
      { key: 'province', label: 'Provincia', type: 'select' as const },
      { key: 'normalized_profession', label: 'Profesión', type: 'select' as const },
      { key: 'organization', label: 'Organismo', type: 'text' as const },
      { key: 'completeness_tier', label: 'Nivel de Riqueza', type: 'select' as const, options: ['RICH', 'MEDIUM', 'BASIC', 'MINIMAL'] }
    ],
    detail_sections: [
      { id: 'identity', label: 'Identidad Canónica', fields: ['full_name', 'identity_anchor_hash'] },
      { id: 'work', label: 'Actividad Laboral', fields: ['organization', 'job_title', 'normalized_profession'] },
      { id: 'geography', label: 'Ubicación Geográfica', fields: ['province', 'city'] },
      { id: 'contact', label: 'Canales de Contacto', fields: ['public_email', 'public_phone'] },
      { id: 'social', label: 'Redes Profesionales', fields: ['social_profiles'] }
    ],
    badges: [
      { field: 'completeness_tier', values_color_map: { RICH: '#4ade80', MEDIUM: '#38bdf8', BASIC: '#fbbf24', MINIMAL: '#94a3b8' } }
    ],
    default_sort: { field: 'completeness_score', direction: 'desc' as const }
  };

  public validateEntity(entity: any): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!entity.full_name || typeof entity.full_name !== 'string') {
      errors.push('full_name is required');
    }
    if (!entity.organization || typeof entity.organization !== 'string') {
      errors.push('organization is required');
    }
    return { valid: errors.length === 0, errors };
  }

  public calculateCompletenessScore(entity: any): number {
    let score = 0;
    if (entity.full_name) score += 20;
    if (entity.identity_anchor_hash) score += 20;
    if (entity.organization) score += 15;
    if (entity.job_title) score += 15;
    if (entity.normalized_profession) score += 10;
    if (entity.city) score += 10;
    if (entity.public_email) score += 10;
    return Math.min(100, score);
  }
}

export const PeopleArgentinaDomainPack: AtlasDomainPack = new PeopleArgentinaDomainPackClass();
