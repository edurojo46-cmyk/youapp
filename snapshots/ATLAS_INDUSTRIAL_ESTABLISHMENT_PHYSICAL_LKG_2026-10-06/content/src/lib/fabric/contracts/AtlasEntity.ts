/**
 * ATLAS GENERIC ENTITY SSOT CONTRACT & ADAPTERS
 * 
 * Generic entity container for the Atlas Industrial Search Fabric.
 * Enables non-destructive interoperability with existing Atlas People tables
 * and any newly plugged domain (e.g. Procurement, Companies, Regulations).
 */

export interface AtlasEntity {
  entity_id: string;
  domain_id: string;
  entity_type: string;
  canonical_status: 'CANONICAL' | 'MERGED' | 'STALE' | 'PROBABLE_DUPLICATE' | 'ACTIVE';
  attributes: Record<string, any>;
  completeness_score: number;
  completeness_tier: 'RICH' | 'MEDIUM' | 'BASIC' | 'MINIMAL';
  created_at: string;
  updated_at: string;
}

/**
 * Non-destructive adapter for PEOPLE_ARGENTINA entities.
 */
export class PersonEntityAdapter {
  public static toGenericEntity(personRow: any): AtlasEntity {
    return {
      entity_id: personRow.atlas_person_id || personRow.person_id || personRow.candidate_id || personRow.subject_id,
      domain_id: 'PEOPLE_ARGENTINA',
      entity_type: 'PERSON',
      canonical_status: personRow.status === 'ACTIVE' ? 'CANONICAL' : (personRow.status || 'CANONICAL'),
      attributes: {
        full_name: personRow.display_name || personRow.full_name,
        organization: personRow.organization,
        job_title: personRow.role || personRow.job_title,
        normalized_profession: personRow.normalized_profession_id || personRow.profession,
        province: personRow.geography_name || personRow.province || 'Argentina',
        city: personRow.city || null,
        public_email: personRow.public_email || null,
        public_phone: personRow.public_phone || null,
        social_profiles: personRow.social_profiles || [],
        source_id: personRow.source_id,
        identity_anchor_hash: personRow.canonical_person_id || personRow.national_id_hash || null,
        channel_eligibility: personRow.channel_eligibility || []
      },
      completeness_score: personRow.completeness_score || (personRow.public_email ? 85 : 55),
      completeness_tier: personRow.completeness_tier || (personRow.public_email ? 'RICH' : 'MEDIUM'),
      created_at: personRow.observed_at || personRow.created_at || new Date().toISOString(),
      updated_at: personRow.last_seen_at || personRow.updated_at || new Date().toISOString()
    };
  }

  public static fromGenericEntity(entity: AtlasEntity): any {
    return {
      atlas_person_id: entity.entity_id,
      display_name: entity.attributes.full_name,
      organization: entity.attributes.organization,
      role: entity.attributes.job_title,
      profession: entity.attributes.normalized_profession,
      geography_name: entity.attributes.province,
      city: entity.attributes.city,
      public_email: entity.attributes.public_email,
      public_phone: entity.attributes.public_phone,
      source_id: entity.attributes.source_id,
      status: entity.canonical_status === 'CANONICAL' ? 'ACTIVE' : entity.canonical_status,
      observed_at: entity.created_at,
      last_seen_at: entity.updated_at
    };
  }
}

/**
 * Adapter for PROCUREMENT_ARGENTINA entities.
 */
export class TenderEntityAdapter {
  public static toGenericEntity(tenderRow: any): AtlasEntity {
    return {
      entity_id: tenderRow.tender_id || tenderRow.id || `TENDER_${tenderRow.process_number}`,
      domain_id: 'PROCUREMENT_ARGENTINA',
      entity_type: 'TENDER',
      canonical_status: tenderRow.status === 'CANCELLED' ? 'STALE' : 'CANONICAL',
      attributes: {
        title: tenderRow.title,
        agency: tenderRow.agency,
        jurisdiction: tenderRow.jurisdiction || 'Nacional / Federal',
        sector: tenderRow.sector || 'Administración Pública',
        description: tenderRow.description || '',
        amount: tenderRow.amount || 0,
        currency: tenderRow.currency || 'ARS',
        publication_date: tenderRow.publication_date,
        closing_date: tenderRow.closing_date,
        source_url: tenderRow.source_url,
        process_number: tenderRow.process_number,
        status: tenderRow.status || 'OPEN'
      },
      completeness_score: tenderRow.amount ? 90 : 70,
      completeness_tier: tenderRow.amount && tenderRow.closing_date ? 'RICH' : 'MEDIUM',
      created_at: tenderRow.publication_date || new Date().toISOString(),
      updated_at: tenderRow.observed_at || new Date().toISOString()
    };
  }

  public static fromGenericEntity(entity: AtlasEntity): any {
    return {
      tender_id: entity.entity_id,
      title: entity.attributes.title,
      agency: entity.attributes.agency,
      jurisdiction: entity.attributes.jurisdiction,
      sector: entity.attributes.sector,
      description: entity.attributes.description,
      amount: entity.attributes.amount,
      currency: entity.attributes.currency,
      publication_date: entity.attributes.publication_date,
      closing_date: entity.attributes.closing_date,
      source_url: entity.attributes.source_url,
      process_number: entity.attributes.process_number,
      status: entity.attributes.status
    };
  }
}

export const ATLAS_ENTITY_CONTRACT_VERSION = '1.0.0';
