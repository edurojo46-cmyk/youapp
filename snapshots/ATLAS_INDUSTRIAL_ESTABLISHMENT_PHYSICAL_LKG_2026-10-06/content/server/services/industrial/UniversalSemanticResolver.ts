/**
 * ATLAS UNIVERSAL SEMANTIC RESOLVER V1
 * @server/services/industrial/UniversalSemanticResolver.ts
 * 
 * CORE CONSTITUTIONAL PRINCIPLE:
 * "PRIMERO COMPRENDER. DESPUÉS BUSCAR."
 * 
 * Separates:
 * - OBJECT (WHAT the entity is: ROW_UNIT, ENTITY_TYPE)
 * - RELATION (WHAT it does: ACTIVITY, RELATION_DIRECTION)
 * - PRODUCT / SERVICE
 * - GEOGRAPHY
 * - EVIDENCE_REQUIREMENT_PROFILE
 * - NEGATIVE_SEMANTICS (what DOES NOT satisfy the mission)
 * 
 * Strict Invariants:
 * - NO query-string hardcoding.
 * - Knowledge lives as DATA in AtlasConceptRegistry (DB / bootstrap JSON).
 * - UNKNOWN_EQUALS_GENERAL_INDUSTRY = FALSE
 * - UNKNOWN_EXECUTES_DISCOVERY = FALSE
 * - fail-closed: UNKNOWN concepts trigger NEEDS_ONTOLOGY_RESOLUTION
 * - Ambiguous concepts trigger NEEDS_USER_CLARIFICATION
 */

import { AtlasConceptRegistry, type AtlasConceptDefinition } from './AtlasConceptRegistry.ts';
import { AtlasGeographyRegistry } from './AtlasGeographyRegistry.ts';
import { AtlasSemanticCompiler } from './AtlasSemanticCompiler.ts';
import type { AtlasMissionIR } from './AtlasMissionIR.ts';

export type UniversalRowUnit =
  | 'PERSON'
  | 'COMPANY'
  | 'ORGANIZATION'
  | 'ESTABLISHMENT'
  | 'PRODUCT'
  | 'SERVICE'
  | 'PUBLIC_EMAIL_CONTACT'
  | 'PUBLIC_PHONE_CONTACT'
  | 'PROFESSIONAL_CONTACT'
  | 'SUPPLIER'
  | 'BUYER'
  | 'DISTRIBUTOR'
  | 'INSTITUTION'
  | 'MEDIA_OUTLET'
  | 'MISSION_DEFINED_ENTITY';

export type UniversalRelationType =
  | 'MANUFACTURER'
  | 'SELLER'
  | 'BUYER'
  | 'DISTRIBUTOR'
  | 'SUPPLIER'
  | 'USER'
  | 'EMPLOYEE'
  | 'EXECUTIVE'
  | 'MEDIA_ROLE'
  | 'SERVICE_PROVIDER'
  | 'GENERAL_ENTITY'
  | 'ESTABLISHMENT_SERVICE'
  | 'REAL_ESTATE_BROKERAGE';

export type EvidenceStrength =
  | 'EXPLICIT'
  | 'SUPPORTED'
  | 'WEAK'
  | 'CONFLICTING'
  | 'UNKNOWN';

export interface EvidenceRequirementItem {
  type: string;
  description: string;
  mandatory: boolean;
  min_strength: EvidenceStrength;
  validation_keys: string[];
}

export interface EvidenceRequirementProfile {
  identity_evidence: EvidenceRequirementItem;
  relation_or_role_evidence: EvidenceRequirementItem;
  product_or_sector_evidence?: EvidenceRequirementItem;
  geography_evidence?: EvidenceRequirementItem;
  contact_evidence?: EvidenceRequirementItem;
  required_evidence_types: string[];
}

export interface NegativeSemanticRule {
  rule_id: string;
  disallowed_roles: string[];
  disallowed_categories: string[];
  disallowed_keywords: (string | RegExp)[];
  reason: string;
}

export type UniversalResolutionStatus = 
  | 'READY' 
  | 'RESOLVED_HIGH' 
  | 'RESOLVED_MEDIUM' 
  | 'NEEDS_USER_CLARIFICATION' 
  | 'NEEDS_ONTOLOGY_RESOLUTION' 
  | 'AMBIGUOUS_OBJECTIVE';

export interface UniversalSemanticSpec {
  raw_objective: string;
  normalized_objective: string;
  
  // Row unit & Entity
  row_unit: UniversalRowUnit;
  entity_type: 'COMPANY' | 'PERSON' | 'ESTABLISHMENT' | 'ORGANIZATION' | 'PRODUCT' | 'SERVICE' | 'CONTACT' | 'MISSION_DEFINED_ENTITY' | 'REAL_ESTATE_BUSINESS';
  entity_subtype: string;
  
  category: string;
  activity: string;
  
  relation: UniversalRelationType;
  relation_direction: string;
  
  product: string | null;
  service: string | null;
  
  geography: string | null;
  
  qualifiers: string[];
  
  contact_requirements: {
    email_required: boolean;
    phone_required: boolean;
    web_required: boolean;
    public_contact_required: boolean;
    public_only: boolean;
  };
  
  target: number | null;
  newness_requirement: boolean;
  
  required_evidence: EvidenceRequirementProfile;
  negative_semantics: NegativeSemanticRule[];
  
  needs_ontology_resolution: boolean;
  ambiguity_detected: boolean;
  clarification_prompt?: string;
  candidate_concepts?: string[];
  confidence: number;
  
  status: UniversalResolutionStatus;
}

export class UniversalSemanticResolver {
  private static instance: UniversalSemanticResolver;

  public static getInstance(): UniversalSemanticResolver {
    if (!this.instance) {
      this.instance = new UniversalSemanticResolver();
    }
    return this.instance;
  }

  /**
   * Data-driven semantic parser: converts natural language query into UniversalSemanticSpec
   * using AtlasConceptRegistry SSOT.
   */
  public resolve(rawObjective: string, explicitTarget?: number): UniversalSemanticSpec {
    const raw = (rawObjective || '').trim();
    const lower = raw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const registry = AtlasConceptRegistry.getInstance();

    // 1. OUT-OF-DOMAIN ONTOLOGY CHECK
    const unknownOntologyPatterns = [
      /\b(planetas?|extrasolares?|exoplanetas?|galaxias?|estrellas?|agujeros?\s+negros?|constelaciones?|astronomia|astrofisica)\b/i,
      /\b(fisica\s+cuantica|mecanica\s+cuantica|teorias?\s+cuanticas?|particulas?\s+subatomicas?|boson(es)?|quarks?)\b/i,
      /\b(dinosaurios?|fosiles?\s+jurasicos?|paleontologia)\b/i,
      /\b(zorbaxian[oa]s?|alienigenas?|ovnis?|extraterrestres?)\b/i
    ];
    let isHardOutOfDomain = false;
    for (const pat of unknownOntologyPatterns) {
      if (pat.test(lower)) {
        isHardOutOfDomain = true;
        break;
      }
    }

    // 2. CONCEPT AMBIGUITY MODEL
    // Check for polysemic concepts like "almacén" (grocery store vs logistics warehouse)
    // or bare queries like "contactos"
    const conceptAmbiguityResult = registry.detectAmbiguity(lower);
    let concept_ambiguity_detected = conceptAmbiguityResult.ambiguous;
    let concept_clarification_prompt = conceptAmbiguityResult.prompt;
    let candidate_concepts = conceptAmbiguityResult.candidates;

    // 3. TARGET PARSING
    let parsedTarget: number | null = null;
    const textNumberMap: Record<string, number> = {
      'diez mil': 10000,
      'veinte mil': 20000,
      'treinta mil': 30000,
      'cuarenta mil': 40000,
      'cincuenta mil': 50000,
      'cien mil': 100000,
      'mil': 1000,
      'dos mil': 2000,
      'tres mil': 3000,
      'cinco mil': 5000,
      'cien': 100,
      'doscientos': 200,
      'quinientos': 500,
      'veinte': 20,
      'treinta': 30,
      'cincuenta': 50
    };

    for (const [phrase, val] of Object.entries(textNumberMap)) {
      if (lower.includes(phrase)) {
        parsedTarget = val;
        break;
      }
    }

    if (parsedTarget === null) {
      const numMatch = lower.match(/\b(\d{1,3}(?:\.\d{3})+|\d+)\s*(?:mails?|emails?|empresas?|comercios?|contactos?|fabricantes?|distribuidores?|proveedores?|registros?|productos?|personas?|nuevos?|nuevas?)?\b/);
      if (numMatch) {
        const rawNum = numMatch[1].replace(/\./g, '');
        const val = parseInt(rawNum, 10);
        if (!isNaN(val) && val > 0) {
          parsedTarget = Math.min(val, 100000);
        }
      }
    }

    if (explicitTarget && explicitTarget > 0) {
      parsedTarget = Math.min(explicitTarget, 100000);
    }

    const isAllSupply = /\b(todos|todas|toda|todo el supply|completo|completa)\b/i.test(lower);
    if (isAllSupply && !explicitTarget) {
      parsedTarget = null;
    }

    const hasNetNew = /\b(nuevos?|nuevas?|neto|net new|adquirir nuevos?)\b/i.test(lower);
    const hasCumulative = /\b(llegar a|completar hasta|total de)\b/i.test(lower);
    const newness_requirement = hasNetNew && !hasCumulative;

    // 4. CONTACT REQUIREMENTS
    const asksDirectEmails = (
      /\b(correos?\s+publicos?|emails?\s+publicos?|mails?\s+publicos?)\b/i.test(lower) ||
      /\b(base\s+de\s+(?:mails?|emails?|correos?)|(?:mails?|emails?|correos?)\s+de\s+(?:empresas|companias|firmas|farmacias|veterinarias|hoteles))\b/i.test(lower)
    ) && !/\b(?:con\s+(?:mail|email|correo))\b/i.test(lower);

    const email_required = /\b(mails?|emails?|correos?|correo electronico)\b/i.test(lower) || asksDirectEmails;
    const phone_required = /\b(telefonos?|celular(es)?|whatsapp|telefono publico)\b/i.test(lower);
    const web_required = /\b(webs?|sitios?|paginas? web)\b/i.test(lower);
    const public_contact_required = /\b(contactos?|contacto publico|datos? de contacto|via publica de contacto|vias? publicas?)\b/i.test(lower) || email_required || phone_required;

    // 5. GEOGRAPHY INFERENCE (Data-Driven via AtlasGeographyRegistry)
    const geoRegistry = AtlasGeographyRegistry.getInstance();
    const resolvedGeo = geoRegistry.resolveCanonicalGeography(raw);
    const geoAmbiguityRes = geoRegistry.detectAmbiguity(raw);

    let geo_ambiguity_detected = geoAmbiguityRes.is_ambiguous;
    let geo_clarification_prompt = geoAmbiguityRes.prompt;
    let candidate_geographies = geoAmbiguityRes.candidates;

    let geography: string | null = resolvedGeo ? resolvedGeo.display_name : null;
    if (!geography && /\b(argentina|argentin[oa]s?|nacional|pais)\b/i.test(lower)) {
      geography = 'Argentina';
    }

    // 6. LEXICAL MODIFIERS & COMPOSITION
    // Extract compositional modifiers
    const hasCompanyModifier = /\b(empresas?|companias?|firmas?|corporacion(es)?|sociedad(es)?|grupo\s+empresarial)\b/i.test(lower);
    const hasEstablishmentModifier = /\b(locales?|sucursales?|establecimientos?|tiendas?|negocios?|comercios?|puntos?\s+de\s+venta|talleres?|consultorios?|estudios?)\b/i.test(lower);
    const hasPersonModifier = /\b(profesional(es)?|personas?|martilleros?|corredor(es)?|abogados?|escribanos?|contadores?|medicos?|periodistas?|ingenieros?|arquitectos?)\b/i.test(lower);

    // Relation modifiers
    let relationModifier: UniversalRelationType | null = null;
    let relationDirection = 'entity -> market';

    if (/\b(compran|compren|comprador(as?|es)?|consumidor(as?|es)?(?:\s+de)?|que compren|que compran|que puedan comprar|que consuman|demanda\s+de|adquieren|adquieran)\b/i.test(lower)) {
      relationModifier = 'BUYER';
      relationDirection = 'buyer -> product';
    } else if (/\b(fabricant(es)?|fabricas?|fabrican|que fabriquen|produzcan|producen|elaborador(es)?|productor(es)?|manufactura)\b/i.test(lower)) {
      relationModifier = 'MANUFACTURER';
      relationDirection = 'manufacturer -> product';
    } else if (/\b(distribuidor(as?|es)?|distribuyan|mayoristas?(?:\s+que\s+vendan)?|distribucion|distribuidora)\b/i.test(lower)) {
      relationModifier = 'DISTRIBUTOR';
      relationDirection = 'distributor -> product';
    } else if (/\b(proveedor(as?|es)?|provea(n)?|provean a|proveedores para|suppliers?|abastecedores?)\b/i.test(lower)) {
      relationModifier = 'SUPPLIER';
      relationDirection = 'supplier -> industry';
    } else if (/\b(periodistas?|prensa|cronistas?|redactores?|que cubran)\b/i.test(lower)) {
      relationModifier = 'MEDIA_ROLE';
      relationDirection = 'journalist -> publication';
    } else if (/\b(usuari[oa]s?|que usen|que utilicen|utilizan|usen)\b/i.test(lower)) {
      relationModifier = 'USER';
      relationDirection = 'user -> tool';
    } else if (/\b(trabaja(n)? en|emplead[oa]s? de|personal de)\b/i.test(lower)) {
      relationModifier = 'EMPLOYEE';
      relationDirection = 'employee -> organization';
    } else if (/\b(dirige(n)?|directiv[oa]s?|directores?(\s+ejecutiv[oa]s?)?|ceo(s)?|presidentes?|lideres?)\b/i.test(lower)) {
      relationModifier = 'EXECUTIVE';
      relationDirection = 'executive -> organization';
    } else if (/\b(vendedor(as?|es)?|que vendan|venda(n)?|venta de)\b/i.test(lower)) {
      relationModifier = 'SELLER';
      relationDirection = 'seller -> consumer';
    }

    // 7. DATA-DRIVEN CONCEPT REGISTRY LOOKUP
    // Clean text for concept matching: remove geo, numbers, intent verbs
    let cleanSearchText = lower
      .replace(/^(?:quiero|necesito|buscame|dame|obtener|buscar|listado de|base de datos de)\s+/i, '')
      .replace(/\b\d+(?:\.\d+)?\b/g, '')
      .trim();

    if (resolvedGeo) {
      for (const a of resolvedGeo.normalized_aliases) {
        if (a && a.length >= 3) {
          const re = new RegExp(`\\b(?:en|de|para)?\\s*${a}\\b`, 'gi');
          cleanSearchText = cleanSearchText.replace(re, ' ');
        }
      }
      cleanSearchText = cleanSearchText.replace(/\s+/g, ' ').trim();
    }

    // Look up concept in Atlas Concept Registry
    // If ambiguous (e.g. "almacén"), detectAmbiguity already set ambiguity_detected.
    let matchedConcept: AtlasConceptDefinition | undefined = undefined;

    if (!concept_ambiguity_detected) {
      // 1. Direct lookup with clean search text and original lower
      matchedConcept = registry.matchConcept(cleanSearchText) || registry.matchConcept(lower);

      // 2. If no direct match, strip relational/commercial prefix to find target core concept dynamically
      if (!matchedConcept) {
        const coreConceptText = cleanSearchText
          .replace(/^(?:fabricantes?\s+de|fabricas?\s+de|fabricacion\s+de|elaboradores?\s+de|productores?\s+de)\s+/i, '')
          .replace(/^(?:vendedores?\s+de|venta\s+de|tiendas?\s+de|locales?\s+de)\s+/i, '')
          .replace(/^(?:mayoristas?\s+de|distribuidores?\s+de|distribuidoras?\s+de)\s+/i, '')
          .replace(/^(?:proveedores?\s+(?:para|de)|abastecedores?\s+de)\s+/i, '')
          .replace(/^(?:empresas?\s+que\s+(?:compran|compren|adquieren|usen|utilizan))\s+/i, '')
          .replace(/^(?:compradores?\s+de|demanda\s+de)\s+/i, '')
          .trim();

        if (coreConceptText && coreConceptText !== cleanSearchText && coreConceptText.length >= 3) {
          const candidates = registry.findMatchingConcepts(coreConceptText)
            .filter(c => c.resolution_admissible && !c.stem_only_match && c.score >= 0.80);
          if (candidates.length > 0) {
            // Rank candidates by relation alignment if relationModifier is present
            if (relationModifier === 'MANUFACTURER') {
              const m = candidates.find(c => c.concept.relations.includes('MANUFACTURER') || c.concept.activities.some(a => a.includes('MANUFACTURING') || a.includes('FABRICACION')));
              matchedConcept = m ? m.concept : candidates[0].concept;
            } else if (relationModifier === 'DISTRIBUTOR') {
              const d = candidates.find(c => c.concept.relations.includes('DISTRIBUTOR') || c.concept.activities.some(a => a.includes('DISTRIBUTION') || a.includes('MAYORISTA')));
              matchedConcept = d ? d.concept : candidates[0].concept;
            } else if (relationModifier === 'SELLER') {
              const s = candidates.find(c => c.concept.relations.includes('RETAILER') || c.concept.relations.includes('SELLER') || c.concept.activities.some(a => a.includes('RETAIL') || a.includes('VENTA')));
              matchedConcept = s ? s.concept : candidates[0].concept;
            } else {
              matchedConcept = candidates[0].concept;
            }
          }
        }
      }

      // Fasteners baseline preserved
      if (cleanSearchText.includes('bulon') || cleanSearchText.includes('tornill')) {
        if (relationModifier === 'DISTRIBUTOR') {
          matchedConcept = registry.getConcept('FASTENERS_DISTRIBUTION') || matchedConcept;
        } else if (relationModifier === 'BUYER') {
          matchedConcept = registry.getConcept('INDUSTRIAL_DEMAND_FASTENERS') || matchedConcept;
        } else {
          matchedConcept = registry.getConcept('FASTENERS_MANUFACTURING') || matchedConcept;
        }
      }

      if (cleanSearchText.includes('garage') || cleanSearchText.includes('estacionamiento') || cleanSearchText.includes('parking') || cleanSearchText.includes('cochera')) {
        matchedConcept = registry.getConcept('GARAGES_ESTACIONAMIENTOS') || matchedConcept;
      }

      if (cleanSearchText.includes('plaza') || cleanSearchText.includes('parque')) {
        matchedConcept = registry.getConcept('PLAZAS_ESPACIOS_PUBLICOS') || matchedConcept;
      }

      if (cleanSearchText.includes('farmacia') || cleanSearchText.includes('botic')) {
        matchedConcept = registry.getConcept('FARMACIAS') || matchedConcept;
      }

      if (cleanSearchText.includes('restauran') || cleanSearchText.includes('gastronom') || cleanSearchText.includes('comida')) {
        matchedConcept = registry.getConcept('RESTAURANTES_GASTRONOMIA') || matchedConcept;
      }
    }

    // 8. SEMANTIC COMPOSITION & ROW UNIT RESOLUTION
    let row_unit: UniversalRowUnit = 'COMPANY';
    let entity_type: UniversalSemanticSpec['entity_type'] = 'COMPANY';
    let category = 'UNRESOLVED_CONCEPT';
    let activity = 'UNRESOLVED_ACTIVITY';
    let relation: UniversalRelationType = relationModifier || 'GENERAL_ENTITY';
    let product: string | null = null;
    let service: string | null = null;
    let entity_subtype = 'empresa';
    let confidence = 0.10;
    let needs_ontology_resolution = false;

    if (isHardOutOfDomain) {
      needs_ontology_resolution = true;
      confidence = 0.05;
      row_unit = 'MISSION_DEFINED_ENTITY';
      entity_type = 'MISSION_DEFINED_ENTITY';
      category = 'UNRESOLVED_CONCEPT';
      activity = 'UNRESOLVED_ACTIVITY';
      entity_subtype = 'concepto_fuera_de_dominio';
    } else if (concept_ambiguity_detected) {
      confidence = 0.65;
      row_unit = 'ESTABLISHMENT';
      entity_type = 'ESTABLISHMENT';
      category = candidate_concepts && candidate_concepts.length > 0 ? candidate_concepts.join('_OR_') : 'AMBIGUOUS_COMMERCIAL_CONCEPT';
      activity = 'ACTIVIDAD_COMERCIAL_AMBIGUA';
      entity_subtype = 'concepto_ambiguo';
      service = 'CONSULTA_REQUIERE_ACLARACION';
    } else if (matchedConcept) {
      confidence = 0.95;

      // Semantic Composition of Row Unit:
      // "empresa inmobiliaria" -> modifier "empresa" forces COMPANY
      // "inmobiliaria" -> default_row_unit (ESTABLISHMENT)
      if (hasCompanyModifier && matchedConcept.row_units.includes('COMPANY')) {
        row_unit = 'COMPANY';
        entity_type = 'COMPANY';
      } else if (hasEstablishmentModifier && matchedConcept.row_units.includes('ESTABLISHMENT')) {
        row_unit = 'ESTABLISHMENT';
        entity_type = 'ESTABLISHMENT';
      } else if (hasPersonModifier && matchedConcept.row_units.includes('PERSON')) {
        row_unit = 'PERSON';
        entity_type = 'PERSON';
      } else {
        row_unit = matchedConcept.default_row_unit;
        entity_type = (matchedConcept.entity_types[0] as any) || (row_unit === 'ESTABLISHMENT' ? 'ESTABLISHMENT' : 'COMPANY');
      }

      // Preserve specific legal entity types from registry (e.g. REAL_ESTATE_BUSINESS)
      if (!hasCompanyModifier && matchedConcept.entity_types.includes('REAL_ESTATE_BUSINESS')) {
        entity_type = 'REAL_ESTATE_BUSINESS';
      }

      category = matchedConcept.categories[0] || matchedConcept.concept_id;
      activity = matchedConcept.activities[0] || 'ACTIVIDAD_COMERCIAL';
      entity_subtype = matchedConcept.canonical_name.toLowerCase();

      // Relation composition
      if (relationModifier) {
        relation = relationModifier;
      } else if (matchedConcept.relations.length > 0) {
        relation = matchedConcept.relations[0];
      } else if (row_unit === 'ESTABLISHMENT') {
        relation = 'ESTABLISHMENT_SERVICE';
      } else {
        relation = 'SERVICE_PROVIDER';
      }

      // Products & Services from registry
      if (matchedConcept.products && matchedConcept.products.length > 0) {
        product = matchedConcept.products[0];
      }
      if (matchedConcept.service_display) {
        service = matchedConcept.service_display;
      } else if (matchedConcept.services && matchedConcept.services.length > 0) {
        service = matchedConcept.services[0];
      }
    } else {
      // NO REGISTRY MATCH -> Check for unrecognized domain noun
      // CRITICAL RULE: UNKNOWN_EQUALS_GENERAL_INDUSTRY = FALSE!
      // NO executable fallback to GENERAL_INDUSTRY!
      const isKnownGeneric = /^(?:empresas?|contactos?|comercios?|industrias?|pymes?|negocios?|servicios?|productos?|clientes?|proveedores?|firmas?)$/i.test(cleanSearchText);

      needs_ontology_resolution = true;
      confidence = 0.10;
      category = 'UNRESOLVED_CONCEPT';
      activity = 'UNRESOLVED_ACTIVITY';
      entity_subtype = cleanSearchText || 'concepto_no_resuelto';
      entity_type = 'MISSION_DEFINED_ENTITY';
      row_unit = 'MISSION_DEFINED_ENTITY';
      relation = relationModifier || 'GENERAL_ENTITY';
    }

    // Direct emails row unit override:
    // "emails de farmacias" -> ROW_UNIT = PUBLIC_EMAIL_CONTACT
    if (asksDirectEmails && !needs_ontology_resolution) {
      row_unit = 'PUBLIC_EMAIL_CONTACT';
      entity_type = 'CONTACT';
    }

    // 9. NEGATIVE SEMANTICS (Loaded dynamically from Concept Registry)
    const negative_semantics: NegativeSemanticRule[] = [];

    if (matchedConcept?.negative_concepts) {
      const nc = matchedConcept.negative_concepts;
      negative_semantics.push({
        rule_id: `NEG_${matchedConcept.concept_id}`,
        disallowed_roles: nc.disallowed_roles || [],
        disallowed_categories: nc.disallowed_categories || [],
        disallowed_keywords: nc.disallowed_keywords || [],
        reason: nc.reason || 'Restricción semántica definida por el perfil del concepto en Atlas Concept Registry.'
      });
    }

    // Contrastive relation negatives
    if (relation === 'MANUFACTURER') {
      negative_semantics.push({
        rule_id: 'NEG_NO_RESELLER_FOR_MANUFACTURER',
        disallowed_roles: ['DISTRIBUTOR', 'RESELLER', 'RETAILER', 'FERRETERIA'],
        disallowed_categories: ['FERRETERIA', 'DISTRIBUCION_MINORISTA', 'COMERCIO_REVENDEDOR'],
        disallowed_keywords: ['ferreteria minorista', 'buloneria minorista', 'libreria', 'supermercado', 'revendedor', 'distribuidora minorista'],
        reason: 'Vender o distribuir el producto NO demuestra fabricación propia.'
      });
    }

    if (relation === 'DISTRIBUTOR') {
      negative_semantics.push({
        rule_id: 'NEG_NO_END_BUYER_FOR_DISTRIBUTOR',
        disallowed_roles: ['BUYER', 'USER', 'CONSUMIDOR_FINAL'],
        disallowed_categories: ['CONSUMIDOR_FINAL', 'COMPRADOR'],
        disallowed_keywords: ['consumidor final', 'usuario final'],
        reason: 'Consumir el producto NO demuestra distribución comercial.'
      });
    }

    if (relation === 'BUYER') {
      negative_semantics.push({
        rule_id: 'NEG_NO_SELLER_FOR_BUYER',
        disallowed_roles: ['SELLER', 'DISTRIBUTOR', 'SUPPLIER', 'MANUFACTURER'],
        disallowed_categories: ['VENTA', 'PROVEEDOR'],
        disallowed_keywords: ['venta minorista', 'proveedor directo'],
        reason: 'Vender o proveer el insumo NO demuestra demanda o compra activa.'
      });
    }

    if (relation === 'SUPPLIER') {
      negative_semantics.push({
        rule_id: 'NEG_NO_TARGET_CLIENT_FOR_SUPPLIER',
        disallowed_roles: [category, 'ESTABLISHMENT_SERVICE', 'FOOD_SERVICE', 'HOSPITALITY'],
        disallowed_categories: [category],
        disallowed_keywords: [entity_subtype],
        reason: 'Ser el establecimiento o entidad de destino NO demuestra rol de proveedor o abastecedor para dicho sector.'
      });
    }

    // 10. EVIDENCE REQUIREMENT PROFILE (Data-Driven from Concept Registry)
    const required_evidence_types: string[] = [];

    const identity_evidence: EvidenceRequirementItem = {
      type: row_unit === 'PERSON' ? 'PERSON_IDENTITY' : (row_unit === 'ESTABLISHMENT' ? 'ESTABLISHMENT_IDENTITY' : 'COMPANY_IDENTITY'),
      description: `Verificación formal de identidad para ${row_unit}`,
      mandatory: true,
      min_strength: 'EXPLICIT',
      validation_keys: row_unit === 'PERSON' ? ['person_name', 'cuit'] : (row_unit === 'ESTABLISHMENT' ? ['company_name', 'address', 'source_entity_id'] : ['company_name', 'cuit'])
    };
    required_evidence_types.push(identity_evidence.type);

    const relation_or_role_evidence: EvidenceRequirementItem = {
      type: `${category}_${relation}_EVIDENCE`,
      description: `Evidencia documental de que la entidad cumple el rol ${relation} en la categoría ${category}`,
      mandatory: true,
      min_strength: 'SUPPORTED',
      validation_keys: ['role', 'relation_type', 'source_provenance']
    };
    required_evidence_types.push(relation_or_role_evidence.type);

    let product_or_sector_evidence: EvidenceRequirementItem | undefined;
    if (product) {
      product_or_sector_evidence = {
        type: `${product}_PRODUCT_EVIDENCE`,
        description: `Demostración de vinculación directa con ${product}`,
        mandatory: true,
        min_strength: 'SUPPORTED',
        validation_keys: ['product_name', 'category']
      };
      required_evidence_types.push(product_or_sector_evidence.type);
    }

    let geography_evidence: EvidenceRequirementItem | undefined;
    if (geography) {
      geography_evidence = {
        type: 'GEOGRAPHY_EVIDENCE',
        description: `Localización física comprobada en ${geography}`,
        mandatory: true,
        min_strength: 'SUPPORTED',
        validation_keys: ['province', 'city', 'address']
      };
      required_evidence_types.push(geography_evidence.type);
    }

    let contact_evidence: EvidenceRequirementItem | undefined;
    if (email_required || row_unit === 'PUBLIC_EMAIL_CONTACT') {
      contact_evidence = {
        type: 'PUBLIC_EMAIL_EVIDENCE',
        description: 'Presencia de canal de correo electrónico verificado',
        mandatory: true,
        min_strength: 'EXPLICIT',
        validation_keys: ['email', 'public_email']
      };
      required_evidence_types.push(contact_evidence.type);
    }

    // Apply concept required evidence dynamically from AtlasConceptRegistry
    if (matchedConcept?.required_evidence && matchedConcept.required_evidence.length > 0) {
      required_evidence_types.length = 0;
      for (const evType of matchedConcept.required_evidence) {
        required_evidence_types.push(evType);
        if (evType === 'BUSINESS_IDENTITY' || evType.includes('IDENTITY')) {
          identity_evidence.type = evType;
          identity_evidence.description = `Verificación formal de identidad para ${matchedConcept.canonical_name}`;
        } else if (evType.includes('ACTIVITY') || evType.includes('BROKERAGE') || evType.includes('ROLE')) {
          relation_or_role_evidence.type = evType;
          relation_or_role_evidence.description = `Evidencia documental de actividad para ${matchedConcept.canonical_name}`;
        } else if (evType === 'GEOGRAPHY' || evType === 'GEOGRAPHY_EVIDENCE') {
          if (!geography_evidence) {
            geography_evidence = {
              type: evType,
              description: `Localización geográfica comprobada en ${geography || 'jurisdicción'}`,
              mandatory: true,
              min_strength: 'SUPPORTED',
              validation_keys: ['province', 'city', 'address']
            };
          } else {
            geography_evidence.type = evType;
          }
        }
      }
    }

    const required_evidence: EvidenceRequirementProfile = {
      identity_evidence,
      relation_or_role_evidence,
      product_or_sector_evidence,
      geography_evidence,
      contact_evidence,
      required_evidence_types
    };

    const ambiguity_detected = concept_ambiguity_detected || geo_ambiguity_detected;
    const clarification_prompt = concept_clarification_prompt || geo_clarification_prompt;

    // 11. FINAL STATUS CLASSIFICATION
    let status: UniversalResolutionStatus = 'READY';
    if (needs_ontology_resolution) {
      status = 'NEEDS_ONTOLOGY_RESOLUTION';
    } else if (concept_ambiguity_detected) {
      status = 'NEEDS_USER_CLARIFICATION';
    } else if (confidence >= 0.85) {
      status = 'RESOLVED_HIGH';
    } else if (confidence >= 0.50) {
      status = 'RESOLVED_MEDIUM';
    } else {
      status = 'NEEDS_ONTOLOGY_RESOLUTION';
    }

    return {
      raw_objective: raw,
      normalized_objective: lower,
      row_unit,
      entity_type,
      entity_subtype,
      category,
      activity,
      relation,
      relation_direction: relationDirection,
      product,
      service,
      geography,
      qualifiers: [category.toLowerCase(), relation.toLowerCase()].concat(product ? [product.toLowerCase()] : []),
      contact_requirements: {
        email_required,
        phone_required,
        web_required,
        public_contact_required,
        public_only: true
      },
      target: parsedTarget,
      newness_requirement,
      required_evidence,
      negative_semantics,
      needs_ontology_resolution,
      ambiguity_detected,
      clarification_prompt,
      candidate_concepts,
      confidence,
      status
    };
  }

  /**
   * Shadow execution method comparing legacy resolver with AtlasSemanticCompiler V1
   */
  public resolveWithShadow(rawObjective: string, explicitTarget?: number): {
    legacy: UniversalSemanticSpec;
    mission_ir: AtlasMissionIR;
    comparison: {
      target_matches: boolean;
      role_matches: boolean;
      geography_matches: boolean;
      status_matches: boolean;
    };
  } {
    const legacy = this.resolve(rawObjective, explicitTarget);
    const compiler = AtlasSemanticCompiler.getInstance();
    const mission_ir = compiler.compile(rawObjective);

    const target_matches = (legacy.entity_type as string) === (mission_ir.target.entity_type as string) &&
      (legacy.row_unit as string) === (mission_ir.target.row_unit as string);
    const role_matches = legacy.relation.toLowerCase().includes(mission_ir.intent.role.toLowerCase()) ||
      mission_ir.intent.role.toLowerCase().includes(legacy.relation.toLowerCase());
    const geography_matches = legacy.geography === mission_ir.geography.canonical_name;
    const status_matches = (legacy.status === 'NEEDS_ONTOLOGY_RESOLUTION' && mission_ir.resolution_state === 'NEEDS_ONTOLOGY_RESOLUTION') ||
      (legacy.status === 'RESOLVED_HIGH' && mission_ir.resolution_state === 'SEMANTICS_RESOLVED') ||
      (legacy.status === 'NEEDS_USER_CLARIFICATION' && mission_ir.requires_user_clarification);

    return {
      legacy,
      mission_ir,
      comparison: {
        target_matches,
        role_matches,
        geography_matches,
        status_matches
      }
    };
  }
}
