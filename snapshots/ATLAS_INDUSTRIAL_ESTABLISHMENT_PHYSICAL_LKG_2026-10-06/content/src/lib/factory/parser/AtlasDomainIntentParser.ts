/**
 * ATLAS DOMAIN INTENT PARSER V1
 * 
 * Analyzes natural language search engine requirements and extracts
 * structured intent components: entity type, industry taxonomy, geographic scope,
 * key searchable attributes, relationships, facets, and governance expectations.
 * 
 * Invariants:
 * - AI_PROPOSAL != VERIFIED_FACT: Intent is a structured proposal requiring validation.
 * - Chooses domain-appropriate entity types: PERSON, COMPANY, TENDER, PRODUCT, etc.
 * - Never forces PERSON assumptions onto corporate or institutional domains.
 */

export interface ParsedDomainIntent {
  domain_id: string;
  entity_type: 'COMPANY' | 'SUPPLIER' | 'PERSON' | 'TENDER' | 'PRODUCT' | 'REGULATION' | 'ARTICLE';
  display_name: string;
  sector_scope: string;
  geographic_scope: string;
  target_audience: string;
  extracted_attributes: string[];
  extracted_facets: string[];
  extracted_relations: string[];
  extracted_signals: string[];
  freshness_requirement_days: number;
  contact_semantics: 'NONE' | 'PERSON_CONTACT' | 'COMPANY_PUBLIC_COMMERCIAL_CONTACT';
}

export class AtlasDomainIntentParser {
  public static parseUserIntent(prompt: string, overrides?: Partial<ParsedDomainIntent>): ParsedDomainIntent {
    const text = prompt.toLowerCase();

    // 1. Detect Primary Entity Type
    let entityType: ParsedDomainIntent['entity_type'] = 'COMPANY';
    let domainPrefix = 'SUPPLIERS';

    if (text.includes('proveedor') || text.includes('empresa') || text.includes('metalúrgic') || text.includes('fábrica') || text.includes('industria')) {
      entityType = 'COMPANY';
      domainPrefix = 'SUPPLIERS';
    } else if (text.includes('licitaci') || text.includes('pliego') || text.includes('compras públicas')) {
      entityType = 'TENDER';
      domainPrefix = 'PROCUREMENT';
    } else if (text.includes('persona') || text.includes('profesional') || text.includes('médic') || text.includes('científico')) {
      entityType = 'PERSON';
      domainPrefix = 'PEOPLE';
    } else if (text.includes('norma') || text.includes('ley') || text.includes('decreto')) {
      entityType = 'REGULATION';
      domainPrefix = 'REGULATIONS';
    }

    // 2. Detect Geography
    let geo = 'ARGENTINA';
    if (text.includes('argentin')) geo = 'ARGENTINA';
    else if (text.includes('caba') || text.includes('buenos aires')) geo = 'BUENOS_AIRES_AR';
    else if (text.includes('córdoba')) geo = 'CORDOBA_AR';
    else if (text.includes('mendoza')) geo = 'MENDOZA_AR';

    // 3. Domain ID
    const domainId = `${domainPrefix}_${geo}`;

    // 4. Extract Attributes & Facets from text keywords
    const attributes: string[] = ['cuit', 'company_name', 'trade_name'];
    const facets: string[] = [];
    const relations: string[] = ['WORKS_IN', 'PRODUCES', 'CERTIFIED_BY'];
    const signals: string[] = [];

    if (text.includes('industria') || text.includes('rubro') || text.includes('sector')) {
      attributes.push('industry_sector');
      facets.push('industry_sector');
    }
    if (text.includes('producto') || text.includes('pieza')) {
      attributes.push('products');
      attributes.push('main_activity_description');
    }
    if (text.includes('provincia') || text.includes('ubicación') || text.includes('geografía')) {
      attributes.push('province');
      attributes.push('city');
      facets.push('province');
    }
    if (text.includes('certificaci')) {
      attributes.push('certifications');
      facets.push('certifications');
      signals.push('QUALITY_CERTIFIED_ISO');
    }
    if (text.includes('sitio web') || text.includes('web')) {
      attributes.push('official_website');
    }
    if (text.includes('contacto') || text.includes('email') || text.includes('teléfono')) {
      attributes.push('verified_commercial_email');
      attributes.push('commercial_phone');
      signals.push('VERIFIED_COMMERCIAL_REACHABLE');
    }

    // Contact semantics rule: If entity is COMPANY, commercial emails belong to COMPANY, not a person
    const contactSemantics = entityType === 'COMPANY' 
      ? 'COMPANY_PUBLIC_COMMERCIAL_CONTACT' 
      : (entityType === 'PERSON' ? 'PERSON_CONTACT' : 'NONE');

    const result: ParsedDomainIntent = {
      domain_id: overrides?.domain_id || domainId,
      entity_type: overrides?.entity_type || entityType,
      display_name: overrides?.display_name || 'Buscador Nacional de Proveedores Industriales Argentinos',
      sector_scope: overrides?.sector_scope || 'Industria y Manufactura B2B',
      geographic_scope: overrides?.geographic_scope || 'República Argentina',
      target_audience: overrides?.target_audience || 'Empresas, Compradores Industriales, Gerentes de Abastecimiento',
      extracted_attributes: attributes,
      extracted_facets: facets,
      extracted_relations: relations,
      extracted_signals: signals,
      freshness_requirement_days: 30,
      contact_semantics: contactSemantics
    };

    return result;
  }
}
