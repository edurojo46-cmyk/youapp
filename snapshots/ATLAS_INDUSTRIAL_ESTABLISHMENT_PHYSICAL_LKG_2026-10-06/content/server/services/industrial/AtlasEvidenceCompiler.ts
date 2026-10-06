/**
 * ATLAS EVIDENCE COMPILER V1
 * @server/services/industrial/AtlasEvidenceCompiler.ts
 * 
 * Derives the EvidenceContract systematically from the AtlasMissionIR.
 * No hardcoded category-specific rules.
 */

import type { AtlasMissionIR, EvidenceItemContract } from './AtlasMissionIR.ts';

import { AtlasEvidenceRegistry } from './AtlasEvidenceRegistry.ts';

export class AtlasEvidenceCompiler {
  private static instance: AtlasEvidenceCompiler;
  private evidenceRegistry: AtlasEvidenceRegistry = AtlasEvidenceRegistry.getInstance();

  public static getInstance(): AtlasEvidenceCompiler {
    if (!this.instance) {
      this.instance = new AtlasEvidenceCompiler();
    }
    return this.instance;
  }

  /**
   * Compiles the evidence contract for a mission IR
   */
  public compileEvidenceContract(ir: Partial<AtlasMissionIR>): EvidenceItemContract[] {
    const contracts: EvidenceItemContract[] = [];

    const targetType = ir.target?.entity_type || 'COMPANY';
    const role = ir.intent?.role || 'GENERAL_ENTITY';
    const action = ir.intent?.action || 'GENERAL_ACTION';
    const relation = ir.intent?.relation || 'GENERAL_RELATION';
    const objName = (ir.object?.canonical_name || ir.object?.raw_term || '').toUpperCase().replace(/[\s\W]+/g, '_');

    // 1. Identity Evidence
    let identityType = 'COMPANY_IDENTITY';
    if (targetType === 'PERSON') identityType = 'PERSON_IDENTITY';
    else if (targetType === 'ESTABLISHMENT') identityType = 'ESTABLISHMENT_IDENTITY';
    else if (targetType === 'INSTITUTION' || targetType === 'ORGANIZATION') identityType = 'INSTITUTION_IDENTITY';

    contracts.push({
      evidence_type: this.evidenceRegistry.getCanonicalEvidenceType(identityType),
      description: `Verificación formal de identidad para la entidad objetivo de tipo ${targetType}`,
      mandatory: true,
      min_strength: 'EXPLICIT',
      validation_keys: targetType === 'PERSON' ? ['person_name', 'cuit'] : (targetType === 'ESTABLISHMENT' ? ['company_name', 'address'] : ['company_name', 'cuit'])
    });

    // 2. Action / Role Activity Evidence
    if (role !== 'GENERAL_ENTITY' && action !== 'GENERAL_ACTION') {
      let activityEvidenceType = 'ACTIVITY_EVIDENCE';
      if (action === 'MANUFACTURE' || role === 'MANUFACTURER') {
        activityEvidenceType = 'MANUFACTURING_ACTIVITY';
      } else if (action === 'BUY' || role === 'BUYER') {
        activityEvidenceType = 'BUYER_ACTIVITY';
      } else if (action === 'SUPPLY' || role === 'SUPPLIER') {
        activityEvidenceType = 'SUPPLIER_ACTIVITY';
      } else if (action === 'DISTRIBUTE' || role === 'DISTRIBUTOR') {
        activityEvidenceType = 'DISTRIBUTION_ACTIVITY';
      } else if (action === 'EXPORT' || role === 'EXPORTER') {
        activityEvidenceType = 'EXPORT_ACTIVITY';
      } else if (action === 'IMPORT' || role === 'IMPORTER') {
        activityEvidenceType = 'IMPORT_ACTIVITY';
      } else if (action === 'WRITE_ABOUT' || role === 'JOURNALIST') {
        activityEvidenceType = 'JOURNALIST_ROLE';
      } else if (action === 'USE' || role === 'USER') {
        activityEvidenceType = 'USAGE_EVIDENCE';
      } else if (action === 'RETAIL' || role === 'RETAILER' || role === 'SELLER') {
        activityEvidenceType = 'RETAIL_ACTIVITY';
      } else if (relation === 'ESTABLISHMENT_SERVICE') {
        activityEvidenceType = 'ACTIVITY_EVIDENCE';
      } else if (role === 'PROFESSIONAL' || String(relation).startsWith('PROFESSIONAL_PRACTICES_')) {
        activityEvidenceType = 'PROFESSIONAL_LICENSE';
      } else if (action === 'PROVIDE_SERVICE') {
        activityEvidenceType = 'SERVICE_ACTIVITY';
      }

      contracts.push({
        evidence_type: activityEvidenceType,
        description: activityEvidenceType === 'PROFESSIONAL_LICENSE'
          ? `Acreditación de matrícula profesional habilitante y vigencia de ejercicio en registro oficial`
          : `Evidencia documental o pública de cumplimiento del rol ${role} / acción ${action}`,
        mandatory: true,
        min_strength: 'SUPPORTED',
        validation_keys: activityEvidenceType === 'PROFESSIONAL_LICENSE'
          ? ['person_name', 'registration_number', 'tomo', 'folio', 'registry_institution', 'source_provenance']
          : ['role', 'activity', 'source_provenance']
      });
    }

    // 3. Object / Domain Concept Evidence
    if (objName && objName.length > 2 && targetType !== 'INSTITUTION') {
      let objectEvidenceType = `${objName}_RELATION`;
      if (action === 'MANUFACTURE') {
        objectEvidenceType = `${objName}_PRODUCT_OR_ACTIVITY`;
      } else if (action === 'WRITE_ABOUT') {
        objectEvidenceType = `${objName}_TOPIC_EVIDENCE`;
      } else if (action === 'BUY') {
        objectEvidenceType = `${objName}_PURCHASE_EVIDENCE`;
      }

      contracts.push({
        evidence_type: objectEvidenceType,
        description: `Demostración de vinculación operativa con el objeto o temática ${ir.object?.canonical_name || objName}`,
        mandatory: true,
        min_strength: 'SUPPORTED',
        validation_keys: ['concept_id', 'product_name', 'taxonomy_match']
      });
    }

    // 4. Geography Evidence
    if (ir.geography?.canonical_name) {
      contracts.push({
        evidence_type: 'GEOGRAPHY_EVIDENCE',
        description: `Localización geográfica verificada en ${ir.geography.canonical_name}`,
        mandatory: true,
        min_strength: 'SUPPORTED',
        validation_keys: ['geography_id', 'city', 'province']
      });
    }

    // 5. Contact Evidence
    if (ir.contact?.required) {
      let contactEvType = 'PUBLIC_CONTACT_EVIDENCE';
      if (ir.contact.type === 'EMAIL') contactEvType = 'PUBLIC_EMAIL_EVIDENCE';
      else if (ir.contact.type === 'PHONE') contactEvType = 'PUBLIC_PHONE_EVIDENCE';

      contracts.push({
        evidence_type: contactEvType,
        description: `Canal de contacto público verificable (${ir.contact.type})`,
        mandatory: true,
        min_strength: 'EXPLICIT',
        validation_keys: ['contact_value', 'is_public', 'origin_url']
      });
    }

    return contracts;
  }
}
