/**
 * ATLAS EVIDENCE REGISTRY V1
 * @server/services/industrial/AtlasEvidenceRegistry.ts
 * 
 * Formal canonical evidence taxonomy and equivalence resolver.
 * Bridges disparate nomenclature (e.g. BUYER_RELATION vs BUYER_ACTIVITY)
 * systematically without query-specific heuristics.
 */

import type { EvidenceItemContract } from './AtlasMissionIR.ts';

export interface EvidenceTypeDefinition {
  canonical_type: string;
  category: 'IDENTITY' | 'ROLE_ACTIVITY' | 'RELATION' | 'GEOGRAPHY' | 'CONTACT' | 'PRODUCT_OR_SECTOR';
  description: string;
  aliases: string[];
  equivalent_types: string[];
  mandatory_by_default: boolean;
  min_strength: 'EXPLICIT' | 'SUPPORTED' | 'INFERRED';
  validation_keys: string[];
}

export class AtlasEvidenceRegistry {
  private static instance: AtlasEvidenceRegistry;

  private registry: Map<string, EvidenceTypeDefinition> = new Map();
  private aliasToCanonical: Map<string, string> = new Map();

  private constructor() {
    this.bootstrapDefinitions();
  }

  public static getInstance(): AtlasEvidenceRegistry {
    if (!this.instance) {
      this.instance = new AtlasEvidenceRegistry();
    }
    return this.instance;
  }

  private bootstrapDefinitions(): void {
    const definitions: EvidenceTypeDefinition[] = [
      // 1. Identity Evidence
      {
        canonical_type: 'COMPANY_IDENTITY',
        category: 'IDENTITY',
        description: 'Verificación formal de personería jurídica o CUIT/Razón Social para empresas',
        aliases: ['BUSINESS_IDENTITY', 'CORPORATE_IDENTITY'],
        equivalent_types: ['BUSINESS_IDENTITY'],
        mandatory_by_default: true,
        min_strength: 'EXPLICIT',
        validation_keys: ['company_name', 'cuit']
      },
      {
        canonical_type: 'PERSON_IDENTITY',
        category: 'IDENTITY',
        description: 'Verificación formal de identidad para personas físicas o profesionales',
        aliases: ['PROFESSIONAL_IDENTITY', 'INDIVIDUAL_IDENTITY'],
        equivalent_types: ['PROFESSIONAL_IDENTITY'],
        mandatory_by_default: true,
        min_strength: 'EXPLICIT',
        validation_keys: ['person_name', 'cuit']
      },
      {
        canonical_type: 'ESTABLISHMENT_IDENTITY',
        category: 'IDENTITY',
        description: 'Verificación de punto de venta, local físico o comercio habilitado',
        aliases: ['STORE_IDENTITY', 'LOCAL_IDENTITY'],
        equivalent_types: ['STORE_IDENTITY'],
        mandatory_by_default: true,
        min_strength: 'EXPLICIT',
        validation_keys: ['company_name', 'address']
      },
      {
        canonical_type: 'INSTITUTION_IDENTITY',
        category: 'IDENTITY',
        description: 'Verificación formal de entidad colegiada, pública o gubernamental',
        aliases: ['ORGANIZATION_IDENTITY', 'GOVERNMENT_IDENTITY'],
        equivalent_types: ['ORGANIZATION_IDENTITY'],
        mandatory_by_default: true,
        min_strength: 'EXPLICIT',
        validation_keys: ['institution_name', 'registration_number']
      },

      // 2. Role & Relation Activities
      {
        canonical_type: 'MANUFACTURING_ACTIVITY',
        category: 'ROLE_ACTIVITY',
        description: 'Evidencia documental o pública de fabricación o elaboración industrial propia',
        aliases: ['PRODUCTION_ACTIVITY', 'MANUFACTURER_ROLE', 'FABRICATION_ACTIVITY'],
        equivalent_types: ['PRODUCTION_ACTIVITY', 'MANUFACTURER_ROLE'],
        mandatory_by_default: true,
        min_strength: 'SUPPORTED',
        validation_keys: ['role', 'activity', 'source_provenance']
      },
      {
        canonical_type: 'BUYER_ACTIVITY',
        category: 'ROLE_ACTIVITY',
        description: 'Evidencia de compra, adquisición o demanda de materias primas o insumos',
        aliases: ['BUYER_RELATION', 'PURCHASER_ACTIVITY', 'DEMAND_EVIDENCE'],
        equivalent_types: ['BUYER_RELATION', 'PURCHASER_ACTIVITY'],
        mandatory_by_default: true,
        min_strength: 'SUPPORTED',
        validation_keys: ['buyer_relation', 'purchase_demand']
      },
      {
        canonical_type: 'SUPPLIER_ACTIVITY',
        category: 'ROLE_ACTIVITY',
        description: 'Evidencia de suministro o abastecimiento B2B a industrias o establecimientos',
        aliases: ['SUPPLIER_RELATION', 'VENDOR_ACTIVITY', 'SUPPLIES_TO_EVIDENCE'],
        equivalent_types: ['SUPPLIER_RELATION', 'VENDOR_ACTIVITY'],
        mandatory_by_default: true,
        min_strength: 'SUPPORTED',
        validation_keys: ['supplier_relation', 'target_industry']
      },
      {
        canonical_type: 'RETAIL_ACTIVITY',
        category: 'ROLE_ACTIVITY',
        description: 'Evidencia de comercialización o venta al público o comercios especializados',
        aliases: ['SELLER_ACTIVITY', 'RETAILER_ACTIVITY', 'COMMERCIAL_ACTIVITY'],
        equivalent_types: ['SELLER_ACTIVITY', 'RETAILER_ACTIVITY'],
        mandatory_by_default: true,
        min_strength: 'SUPPORTED',
        validation_keys: ['retail_activity', 'store_operation']
      },
      {
        canonical_type: 'DISTRIBUTION_ACTIVITY',
        category: 'ROLE_ACTIVITY',
        description: 'Evidencia de distribución mayorista o logística de mercadería',
        aliases: ['DISTRIBUTOR_ACTIVITY', 'WHOLESALE_ACTIVITY'],
        equivalent_types: ['DISTRIBUTOR_ACTIVITY', 'WHOLESALE_ACTIVITY'],
        mandatory_by_default: true,
        min_strength: 'SUPPORTED',
        validation_keys: ['wholesale_distribution', 'logistics_scope']
      },
      {
        canonical_type: 'EXPORT_ACTIVITY',
        category: 'ROLE_ACTIVITY',
        description: 'Evidencia de operaciones aduaneras de exportación o presencia comercial externa',
        aliases: ['EXPORTER_ACTIVITY', 'EXPORT_RELATION', 'CUSTOMS_EXPORT'],
        equivalent_types: ['EXPORTER_ACTIVITY', 'EXPORT_RELATION'],
        mandatory_by_default: true,
        min_strength: 'SUPPORTED',
        validation_keys: ['export_records', 'foreign_markets']
      },
      {
        canonical_type: 'IMPORT_ACTIVITY',
        category: 'ROLE_ACTIVITY',
        description: 'Evidencia de operaciones aduaneras de importación o distribución de bienes importados',
        aliases: ['IMPORTER_ACTIVITY', 'IMPORT_RELATION', 'CUSTOMS_IMPORT'],
        equivalent_types: ['IMPORTER_ACTIVITY', 'IMPORT_RELATION'],
        mandatory_by_default: true,
        min_strength: 'SUPPORTED',
        validation_keys: ['import_records', 'origin_markets']
      },
      {
        canonical_type: 'SERVICE_ACTIVITY',
        category: 'ROLE_ACTIVITY',
        description: 'Evidencia de prestación de servicios profesionales, técnicos o de consultoría',
        aliases: ['ACTIVITY_EVIDENCE', 'SERVICE_PROVIDER_ACTIVITY', 'PROFESSIONAL_SERVICE'],
        equivalent_types: ['ACTIVITY_EVIDENCE', 'SERVICE_PROVIDER_ACTIVITY'],
        mandatory_by_default: true,
        min_strength: 'SUPPORTED',
        validation_keys: ['service_nature', 'professional_activity']
      },
      {
        canonical_type: 'JOURNALIST_ROLE',
        category: 'ROLE_ACTIVITY',
        description: 'Evidencia de cobertura periodística, autoría o credencial en medio de prensa',
        aliases: ['PRESS_CREDENTIAL', 'JOURNALISTIC_ACTIVITY', 'BYLINE_EVIDENCE'],
        equivalent_types: ['PRESS_CREDENTIAL', 'JOURNALISTIC_ACTIVITY'],
        mandatory_by_default: true,
        min_strength: 'SUPPORTED',
        validation_keys: ['byline_articles', 'media_outlet']
      },

      // 3. Geography Evidence
      {
        canonical_type: 'GEOGRAPHY_EVIDENCE',
        category: 'GEOGRAPHY',
        description: 'Evidencia de localización física, fiscal u operativa en el territorio especificado',
        aliases: ['LOCATION_EVIDENCE', 'SPATIAL_EVIDENCE'],
        equivalent_types: ['LOCATION_EVIDENCE'],
        mandatory_by_default: true,
        min_strength: 'SUPPORTED',
        validation_keys: ['address', 'province', 'bbox']
      },

      // 4. Contact Evidence
      {
        canonical_type: 'PUBLIC_EMAIL_EVIDENCE',
        category: 'CONTACT',
        description: 'Evidencia de correo electrónico comercial o corporativo público verificado',
        aliases: ['EMAIL_EVIDENCE', 'DIRECT_EMAIL_EVIDENCE'],
        equivalent_types: ['EMAIL_EVIDENCE'],
        mandatory_by_default: false,
        min_strength: 'EXPLICIT',
        validation_keys: ['email_address', 'domain_match']
      },
      {
        canonical_type: 'PUBLIC_PHONE_EVIDENCE',
        category: 'CONTACT',
        description: 'Evidencia de línea telefónica comercial o WhatsApp público verificado',
        aliases: ['PHONE_EVIDENCE', 'TELEPHONE_EVIDENCE'],
        equivalent_types: ['PHONE_EVIDENCE'],
        mandatory_by_default: false,
        min_strength: 'EXPLICIT',
        validation_keys: ['phone_number', 'phone_type']
      },
      {
        canonical_type: 'PUBLIC_CONTACT_EVIDENCE',
        category: 'CONTACT',
        description: 'Evidencia de canal de contacto público verificable (mail, teléfono o web)',
        aliases: ['CONTACT_CHANNEL_EVIDENCE'],
        equivalent_types: ['CONTACT_CHANNEL_EVIDENCE'],
        mandatory_by_default: false,
        min_strength: 'SUPPORTED',
        validation_keys: ['contact_channel', 'access_url']
      }
    ];

    for (const def of definitions) {
      this.registry.set(def.canonical_type, def);
      this.aliasToCanonical.set(def.canonical_type, def.canonical_type);
      for (const alias of def.aliases) {
        this.aliasToCanonical.set(alias, def.canonical_type);
      }
      for (const eq of def.equivalent_types) {
        this.aliasToCanonical.set(eq, def.canonical_type);
      }
    }
  }

  public getCanonicalEvidenceType(type: string): string {
    const norm = type.trim().toUpperCase();
    return this.aliasToCanonical.get(norm) || norm;
  }

  public areEvidenceTypesEquivalent(typeA: string, typeB: string): boolean {
    const normA = this.getCanonicalEvidenceType(typeA);
    const normB = this.getCanonicalEvidenceType(typeB);
    if (normA === normB) return true;

    const defA = this.registry.get(normA);
    if (defA && defA.equivalent_types.map(t => this.getCanonicalEvidenceType(t)).includes(normB)) {
      return true;
    }

    const defB = this.registry.get(normB);
    if (defB && defB.equivalent_types.map(t => this.getCanonicalEvidenceType(t)).includes(normA)) {
      return true;
    }

    // Dynamic product or activity evidence equivalence
    if (normA.endsWith('_PRODUCT_OR_ACTIVITY') || normA.endsWith('_RELATION')) {
      const baseA = normA.replace(/_(?:PRODUCT_OR_ACTIVITY|RELATION|ACTIVITY)$/, '');
      const baseB = normB.replace(/_(?:PRODUCT_OR_ACTIVITY|RELATION|ACTIVITY)$/, '');
      if (baseA === baseB) return true;
    }

    return false;
  }

  public validateEvidenceContract(items: EvidenceItemContract[]): {
    isValid: boolean;
    normalizedItems: EvidenceItemContract[];
  } {
    const normalizedItems: EvidenceItemContract[] = items.map(item => ({
      ...item,
      evidence_type: this.getCanonicalEvidenceType(item.evidence_type)
    }));

    const hasIdentity = normalizedItems.some(i => i.evidence_type.endsWith('_IDENTITY'));
    return {
      isValid: hasIdentity && normalizedItems.length >= 2,
      normalizedItems
    };
  }
}
