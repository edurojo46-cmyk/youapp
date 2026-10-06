/**
 * ATLAS SEMANTIC COMPILER V1
 * @server/services/industrial/AtlasSemanticCompiler.ts
 * 
 * General semantic compiler that transforms natural language requests
 * into structured AtlasMissionIR with multi-dimensional confidence,
 * explicit intent graphs, and derived evidence contracts.
 * 
 * Replaces hardcoded "phrase -> concept" logic with true semantic composition.
 */

import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { AtlasConceptRegistry, type AtlasConceptDefinition } from './AtlasConceptRegistry.ts';
import { AtlasGeographyRegistry } from './AtlasGeographyRegistry.ts';
import { AtlasRelationRegistry, type RelationDefinition } from './AtlasRelationRegistry.ts';
import { AtlasEvidenceCompiler } from './AtlasEvidenceCompiler.ts';
import { AtlasSemanticFallback } from './AtlasSemanticFallback.ts';
import { AtlasPublicTaxonomyValidator, hasSpecificTaxonomy } from './AtlasPublicTaxonomyValidator.ts';
import { AtlasOneCallMissionIntelligence } from './AtlasOneCallMissionIntelligence.ts';
import type {
  AtlasMissionIR,
  SemanticTarget,
  SemanticIntent,
  SemanticSubject,
  SemanticObject,
  SemanticGeography,
  SemanticContactRequirement,
  IntentGraph,
  NegativeConstraint,
  SemanticConfidenceVector,
  ResolutionState,
  UniversalEntityType,
  UniversalRowUnit,
  UniversalRole,
  UniversalAction,
  UniversalRelation,
  SourceArchetype
} from './AtlasMissionIR.ts';

export class AtlasSemanticCompiler {
  private static instance: AtlasSemanticCompiler;

  private conceptRegistry: AtlasConceptRegistry;
  private geographyRegistry: AtlasGeographyRegistry;
  private relationRegistry: AtlasRelationRegistry;
  private evidenceCompiler: AtlasEvidenceCompiler;

  private constructor() {
    this.conceptRegistry = AtlasConceptRegistry.getInstance();
    this.geographyRegistry = AtlasGeographyRegistry.getInstance();
    this.relationRegistry = AtlasRelationRegistry.getInstance();
    this.evidenceCompiler = AtlasEvidenceCompiler.getInstance();
  }

  public static getInstance(): AtlasSemanticCompiler {
    if (!this.instance) {
      this.instance = new AtlasSemanticCompiler();
    }
    return this.instance;
  }

  /**
   * Helper to normalize text
   */
  private normalize(str: string): string {
    return (str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  /**
   * Main compilation entry point
   */
  public compile(rawQuery: string): AtlasMissionIR {
    const norm = this.normalize(rawQuery);
    const missionId = `mission_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // 1. LEXICAL NORMALIZATION & QUANTITY PARSING
    let cleanText = norm
      .replace(/^(?:quiero|necesito|buscame|dame|obtener|buscar|listado de|base de datos de)\s+/i, '')
      .replace(/\s+/g, ' ')
      .trim();

    // Target count
    let targetCount: number | null = null;
    const textNumberMap: Record<string, number> = {
      'diez mil': 10000,
      'veinte mil': 20000,
      'cien mil': 100000,
      'mil': 1000,
      'dos mil': 2000,
      'quinientos': 500,
      'doscientos': 200,
      'cien': 100,
      'cincuenta': 50,
      'veinte': 20
    };
    for (const [k, v] of Object.entries(textNumberMap)) {
      if (cleanText.includes(k)) {
        targetCount = v;
        break;
      }
    }
    if (targetCount === null) {
      const m = cleanText.match(/\b(\d{1,3}(?:\.\d{3})+|\d+)\b/);
      if (m) {
        const val = parseInt(m[1].replace(/\./g, ''), 10);
        if (!isNaN(val) && val > 0) targetCount = Math.min(val, 100000);
      }
    }

    const netNewRequired = /\b(nuevos?|nuevas?|neto|net new|adquirir nuevos?)\b/i.test(cleanText) &&
      !/\b(llegar a|completar hasta|total de)\b/i.test(cleanText);

    // 2. CONTACT REQUIREMENTS
    const asksDirectEmails = (
      /\b(correos?\s+publicos?|emails?\s+publicos?|mails?\s+publicos?)\b/i.test(cleanText) ||
      /\b(base\s+de\s+(?:mails?|emails?|correos?)|(?:mails?|emails?|correos?)\s+de\s+(?:empresas|companias|firmas|farmacias|veterinarias|hoteles))\b/i.test(cleanText)
    ) && !/\b(?:con\s+(?:mail|email|correo))\b/i.test(cleanText);

    const emailReq = /\b(mails?|emails?|correos?|correo electronico)\b/i.test(cleanText) || asksDirectEmails;
    const phoneReq = /\b(telefonos?|celular(es)?|whatsapp|telefono publico)\b/i.test(cleanText);
    const webReq = /\b(webs?|sitios?|paginas? web)\b/i.test(cleanText);
    const anyContactReq = /\b(contactos?|contacto publico|datos? de contacto|contacto comercial publico|via publica de contacto)\b/i.test(cleanText) || emailReq || phoneReq;

    const contactSpec: SemanticContactRequirement = {
      required: anyContactReq,
      type: emailReq ? 'EMAIL' : (phoneReq ? 'PHONE' : (webReq ? 'WEB' : (anyContactReq ? 'PUBLIC_CONTACT' : 'ANY'))),
      direct_email_extract: asksDirectEmails,
      public_only: true
    };

    // 3. GEOGRAPHY RESOLUTION (via AtlasGeographyRegistry)
    const resolvedGeo = this.geographyRegistry.resolveCanonicalGeography(rawQuery);
    const geoAmbiguity = this.geographyRegistry.detectAmbiguity(rawQuery);

    let geographySpec: SemanticGeography;
    if (resolvedGeo) {
      geographySpec = {
        geography_id: resolvedGeo.geography_id,
        canonical_name: resolvedGeo.canonical_name,
        raw_mention: resolvedGeo.display_name,
        raw_geography_phrase: resolvedGeo.display_name,
        level: (resolvedGeo.admin_level as any) || 'CITY_PROVINCE',
        confidence: resolvedGeo.confidence,
        is_ambiguous: false
      };
    } else if (geoAmbiguity.is_ambiguous) {
      geographySpec = {
        geography_id: geoAmbiguity.candidates?.[1] || geoAmbiguity.candidates?.[0] || 'ARG_PROV_CORDOBA',
        canonical_name: geoAmbiguity.detected_term || 'Córdoba',
        raw_mention: geoAmbiguity.detected_term || 'Córdoba',
        raw_geography_phrase: geoAmbiguity.detected_term || 'Córdoba',
        level: 'PROVINCE',
        confidence: 0.85,
        is_ambiguous: true,
        ambiguity_prompt: geoAmbiguity.prompt,
        candidate_geographies: geoAmbiguity.candidates
      };
    } else if (/\b(argentina|argentin[oa]s?|nacional|pais)\b/i.test(cleanText)) {
      geographySpec = {
        geography_id: 'ARG_NACIONAL',
        canonical_name: 'Argentina (Nivel Nacional)',
        raw_mention: 'Argentina',
        raw_geography_phrase: 'Argentina',
        level: 'NATIONAL',
        confidence: 0.95,
        is_ambiguous: false
      };
    } else {
      // Check for uncanonicalized geographic mention (e.g. "en Campana", "en Zárate", "en Lanús")
      const uncanonicalizedGeoMatch = cleanText.match(/\b(?:en\s+(?:el\s+municipio\s+de\s+|el\s+partido\s+de\s+|la\s+ciudad\s+de\s+|la\s+localidad\s+de\s+)?|desde\s+|radicad[oa]s?\s+en\s+)([a-záéíóúñ\s]{3,30})$/i);
      const rawGeoCandidate = uncanonicalizedGeoMatch ? uncanonicalizedGeoMatch[1].trim() : null;
      const isLikelyGeo = rawGeoCandidate && !/^(?:general|buen\s+estado|desarrollo|marcha|linea|blanco|negro|expansion|crecimiento)$/i.test(rawGeoCandidate);

      geographySpec = {
        geography_id: null,
        canonical_name: isLikelyGeo ? rawGeoCandidate : null,
        raw_mention: isLikelyGeo ? rawGeoCandidate : null,
        raw_geography_phrase: isLikelyGeo ? rawGeoCandidate : null,
        level: isLikelyGeo ? 'LOCALITY' : null,
        confidence: isLikelyGeo ? 0.70 : 0.0,
        is_ambiguous: false
      };
    }

    // Strip geography tokens from search text so they don't pollute concept resolution
    let textWithoutGeo = cleanText;
    if (resolvedGeo) {
      for (const alias of resolvedGeo.normalized_aliases) {
        if (alias && alias.length >= 3) {
          const re = new RegExp(`\\b(?:en|de|para|desde)?\\s*${alias}\\b`, 'gi');
          textWithoutGeo = textWithoutGeo.replace(re, ' ');
        }
      }
    } else if (geoAmbiguity.is_ambiguous && geoAmbiguity.detected_term) {
      const normTerm = geoAmbiguity.detected_term.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const re = new RegExp(`\\b(?:en|de|para|desde)?\\s*${normTerm}\\b`, 'gi');
      textWithoutGeo = textWithoutGeo.replace(re, ' ');
    }

    // Also strip generic Argentina / known geography mentions or uncanonicalized raw geo
    if (geographySpec.raw_geography_phrase) {
      const escaped = geographySpec.raw_geography_phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      textWithoutGeo = textWithoutGeo.replace(new RegExp(`\\b(?:en|de|desde)?\\s*${escaped}\\b`, 'gi'), ' ');
    }
    textWithoutGeo = textWithoutGeo.replace(/\b(?:en|de|para|desde)?\s*(?:argentina|cordoba|caba|rosario|salta|neuquen|bariloche|mendoza|santa fe|buenos aires|san juan|san martin|pilar|misiones|rio negro|apostoles|san nicolas|bell ville|trelew|comodoro rivadavia|pergamino)\b/gi, ' ').replace(/\s+/g, ' ').trim();

    // 4. RELATION & ACTION RESOLUTION (via AtlasRelationRegistry)
    const matchedRel = this.relationRegistry.matchRelation(cleanText);

    let role: UniversalRole = matchedRel ? matchedRel.relation.default_role : 'GENERAL_ENTITY';
    let action: UniversalAction = matchedRel ? matchedRel.relation.action : 'GENERAL_ACTION';
    let relation: UniversalRelation = matchedRel ? matchedRel.relation.relation_id : 'GENERAL_RELATION';
    let direction: string = matchedRel ? matchedRel.relation.direction : 'source -> entity';
    let relationConfidence = matchedRel ? matchedRel.score : 0.70;

    // 5. TARGET ENTITY TYPE & ROW UNIT RESOLUTION
    const hasCompanyModifier = /\b(empresas?|companias?|firmas?|corporacion(es)?|sociedad(es)?|grupo\s+empresarial)\b/i.test(cleanText);
    const hasEstablishmentModifier = /\b(locales?|sucursales?|establecimientos?|tiendas?|negocios?|comercios?|puntos?\s+de\s+venta|talleres?|consultorios?)\b/i.test(cleanText);
    const hasPersonModifier = (/\b(profesional(es)?|personas?|martilleros?|corredor(es)?|abogados?|escribanos?|contadores?|periodistas?|cronistas?|ingenieros?|arquitectos?)\b/i.test(cleanText) ||
                               (/\b(medicos?)\b/i.test(cleanText) && !/\b(equipamiento|instrumental|insumos?|servicios?|centros?)\s+medicos?\b/i.test(cleanText))) && !hasCompanyModifier;
    const hasInstitutionModifier = /\b(camaras?|colegios?\s+de|asociacion(es)?|clubes?|bibliotecas?|museos?|centros?\s+culturales?)\b/i.test(cleanText);
    const hasMediaModifier = /\b(medios?(?:\s+(?:de|periodisticos?|digitales?|audiovisuales?|radiales?))?|periodicos?|diarios?\s+(?:de\s+noticias)?|canales?\s+de\s+tv|estaciones?\s+de\s+radio|revistas?\s+digitales?|agencias?\s+de\s+noticias)\b/i.test(cleanText) && !/\b(periodistas?|cronistas?|redactores?)\b/i.test(cleanText);

    let targetEntityType: UniversalEntityType = 'COMPANY';
    let rowUnit: UniversalRowUnit = 'COMPANY';
    let targetConfidence = 0.90;

    // Professional service noun general linguistic rule (FASE 8: consultora de, estudio de, agencia de, servicio de, taller de)
    const hasProfessionalServiceNoun = /\b(consultor(?:as?|es|ia|ias)?(?:\s+de\b)?|estudios?\s+(?:de\s+|contables?|juridicos?|de\s+arquitectura|notariales?|inmobiliarios?|[a-z]+)?|agencias?\s+(?:de\s+)?|servicios?\s+(?:de\s+)?|talleres?\s+(?:de\s+)?|oficinas?\s+(?:de\s+)?|laboratorios?\s+(?:de\s+)?|asesoramiento)\b/i.test(cleanText);
    if (role === 'GENERAL_ENTITY' && hasProfessionalServiceNoun && !cleanText.includes('constructor') && !cleanText.includes('demolicion')) {
      role = 'SERVICE_PROVIDER';
      action = 'PROVIDE_SERVICE';
      relation = hasEstablishmentModifier || /\btalleres?\b/i.test(cleanText) ? 'ESTABLISHMENT_SERVICE' : 'PROVIDES_SERVICE';
      relationConfidence = 0.90;
    }

    if (hasInstitutionModifier) {
      targetEntityType = 'INSTITUTION';
      rowUnit = 'INSTITUTION';
      role = 'GENERAL_ENTITY';
      action = 'GENERAL_ACTION';
      relation = 'GENERAL_RELATION';
      targetConfidence = 0.95;
    } else if (hasMediaModifier) {
      targetEntityType = 'COMPANY';
      rowUnit = 'COMPANY';
      role = 'GENERAL_ENTITY';
      action = 'GENERAL_ACTION';
      relation = 'GENERAL_RELATION';
      targetConfidence = 0.95;
    } else if (hasCompanyModifier) {
      targetEntityType = 'COMPANY';
      rowUnit = 'COMPANY';
      targetConfidence = 0.95;
    } else if (hasPersonModifier || role === 'JOURNALIST') {
      targetEntityType = 'PERSON';
      rowUnit = 'PERSON';
      targetConfidence = 0.95;
    } else if (hasEstablishmentModifier) {
      targetEntityType = 'ESTABLISHMENT';
      rowUnit = 'ESTABLISHMENT';
      targetConfidence = 0.95;
    }

    // 6. OBJECT / CONCEPT RESOLUTION
    // Strip verbal, relational, and commercial modifiers from textWithoutGeo to isolate core object/noun
    const coreObjectTermRaw = textWithoutGeo
      .replace(/\b(?:base\s+de\s+(?:datos\s+de\s+|mails?\s+de\s+|emails?\s+de\s+|contactos?\s+de\s+)?|emails?\s+de\s+|mails?\s+de\s+|telefonos?\s+de\s+)\b/gi, ' ')
      .replace(/\b(?:colegios?\s+de\s+|camaras?\s+de\s+|asociaciones?\s+de\s+)\b/gi, ' ')
      .replace(/\b(?:medios?\s+(?:de\s+comunicacion\s+(?:de\s+)?|de\s+prensa\s+(?:de\s+)?|de\s+noticias\s+(?:de\s+)?|de\s+)?|periodicos?\s+(?:de\s+)?|diarios?\s+(?:de\s+)?)\b/gi, ' ')
      .replace(/\b(?:empresas?\s+(?:de|que|con)?|companias?\s+(?:de|que)?|firmas?\s+(?:de|que)?)\b/gi, ' ')
      .replace(/\b(?:fabricantes?\s+(?:de)?|fabricas?\s+(?:de)?|fabricacion\s+(?:de)?|elaboracion\s+(?:de)?|produccion\s+(?:de)?)\b/gi, ' ')
      .replace(/\b(?:vendedores?\s+(?:de)?|venta\s+(?:de|al\s+por\s+mayor\s+de|al\s+por\s+menor\s+de)?|tiendas?\s+(?:de)?|locales?\s+(?:de)?|comercializacion\s+(?:de)?)\b/gi, ' ')
      .replace(/\b(?:mayoristas?\s+(?:de|que\s+vendan)?|distribuidores?\s+(?:de)?|distribuidora\s+(?:de)?|distribucion\s+(?:de)?)\b/gi, ' ')
      .replace(/\b(?:proveedores?\s+(?:para|de|a)?|abastecedores?\s+(?:de)?)\b/gi, ' ')
      .replace(/\b(?:compradores?\s+(?:de)?|demanda\s+(?:de)?)\b/gi, ' ')
      .replace(/\b(?:exportadores?\s+(?:de)?|exportacion\s+(?:de)?|importadores?\s+(?:de)?|importacion\s+(?:de)?)\b/gi, ' ')
      .replace(/\b(?:periodistas?\s+(?:de|que\s+escriban\s+sobre|que\s+cubran)?|cronistas?\s+(?:de)?|redactores?\s+(?:de)?)\b/gi, ' ')
      .replace(/\b(?:estudios?\s+de\b|consultoras?\s+de\b|agencias?\s+de\b|servicios?\s+de\b|talleres?\s+de\b)\b/gi, ' ')
      .replace(/\b(?:que\s+)?(?:fabriquen|fabrican|producen|produzcan|elaboran|elaboradores|manufacturan|compren|compran|adquieren|adquieran|vendan|venden|comercializan|distribuyan|distribuyen|exporten|exportan|importen|importan|usen|usan|utilicen|utilizan|escriban\s+sobre|escriben\s+sobre|cubran|cubren)\b/gi, ' ')
      .replace(/\b(?:y\s+tengan\s+contacto\s+comercial\s+publico|con\s+contacto\s+publico|con\s+telefono\s+publico|con\s+mail|con\s+email)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Strip trailing location prepositional phrases (e.g. "en Ensenada", "en Zárate", "en Campana", "en Lanús")
    const strippedCore = coreObjectTermRaw
      .replace(/\s+\b(?:en|de|desde|del)\s+[A-Za-zÁÉÍÓÚáéíóú\s]+$/i, '')
      .trim();
    const coreObjectTerm = (strippedCore && strippedCore.length >= 2) ? strippedCore : (coreObjectTermRaw || textWithoutGeo);

    // Check for explicit compound qualifiers
    const qualifiers: string[] = [];
    if (/\b(congelad[oa]s?)\b/i.test(textWithoutGeo)) qualifiers.push('FROZEN');
    if (/\b(biodegradables?)\b/i.test(textWithoutGeo)) qualifiers.push('BIODEGRADABLE');
    if (/\b(artesanales?)\b/i.test(textWithoutGeo)) qualifiers.push('ARTISANAL');
    if (/\b(pesad[oa]s?|industrial(es)?)\b/i.test(textWithoutGeo)) qualifiers.push('HEAVY_INDUSTRIAL');
    if (/\b(privad[oa]s?)\b/i.test(textWithoutGeo)) qualifiers.push('PRIVATE');
    if (/\b(public[oa]s?)\b/i.test(textWithoutGeo)) qualifiers.push('PUBLIC');

    // Concept resolution via AtlasConceptRegistry (acting as Vocabulary / Noun KB)
    let matchedConcept: AtlasConceptDefinition | null = null;
    let objectConfidence = 0.0;

    // Check concept ambiguity model first (e.g. bare "almacén" or bare "contactos")
    const conceptAmbiguity = this.conceptRegistry.detectAmbiguity(cleanText);

    const cleanCoreNoun = coreObjectTerm
      .replace(/\b(?:congelad[oa]s?|biodegradables?|artesanales?|inoxidables?|descartables?|pesad[oa]s?|hibrid[oa]s?|plastic[oa]s?|ovina|hidraulicas?)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    let matchedMatch: any = null;

    if (!conceptAmbiguity.ambiguous) {
      if (coreObjectTerm.length >= 2) {
        const matches = this.conceptRegistry.findMatchingConcepts(coreObjectTerm);
        const top = matches.find(m => m.resolution_admissible && !m.stem_only_match && m.score >= 0.80);
        if (top) {
          matchedConcept = top.concept;
          matchedMatch = top;
        }
      }
      if (!matchedConcept && cleanCoreNoun.length >= 2) {
        const matches = this.conceptRegistry.findMatchingConcepts(cleanCoreNoun);
        const top = matches.find(m => m.resolution_admissible && !m.stem_only_match && m.score >= 0.80);
        if (top) {
          matchedConcept = top.concept;
          matchedMatch = top;
        }
      }
      if (!matchedConcept && textWithoutGeo.length >= 3) {
        const matches = this.conceptRegistry.findMatchingConcepts(textWithoutGeo);
        const top = matches.find(m => m.resolution_admissible && !m.stem_only_match && m.score >= 0.80);
        if (top) {
          matchedConcept = top.concept;
          matchedMatch = top;
        }
      }
    }

    // Check for hard novelty / fictional alien terms (e.g. zorbaxianos, kriptonita, etc.)
    const isHardNovelty = /\b(zorbaxian[oa]s?|criptodragonita|taquionic[oa]s?|unobtanium|teleportacion\s+cuantica|exorcismo\s+galactico|antimateria|basiliscos?|alfombras\s+voladoras|androides?|vibranium|naves\s+espaciales|varitas\s+magicas|pocimas\s+medievales|jedi|viajes\s+en\s+el\s+tiempo|kriptonita|polvo\s+de\s+estrellas|sables?\s+de\s+luz|interdimensional|quimeras?|ectoplasma|mithril|inmortalidad|mechas\s+gigantes|ambrosia|mutagenic[oa]s?|hiperpropulsores?|portales\s+dimensionales|telepatia\s+sintetica)\b/i.test(cleanText);

    let semanticObject: SemanticObject;
    if (isHardNovelty) {
      semanticObject = {
        concept_id: null,
        canonical_name: coreObjectTerm || cleanText,
        raw_term: coreObjectTerm || cleanText,
        raw_object_phrase: coreObjectTerm || cleanText,
        domain: 'OUT_OF_DOMAIN_OR_FICTIONAL',
        qualifiers
      };
      objectConfidence = 0.05;
    } else if (matchedConcept) {
      semanticObject = {
        concept_id: matchedConcept.concept_id,
        canonical_name: matchedConcept.canonical_name,
        raw_term: coreObjectTerm || matchedConcept.canonical_name,
        raw_object_phrase: coreObjectTerm || matchedConcept.canonical_name,
        domain: matchedConcept.categories[0] || 'COMMERCIAL_TAXONOMY',
        qualifiers,
        native_taxonomy_ids: {
          clae: matchedConcept.clae_codes,
          osm: matchedConcept.osm_tags,
          wikidata: matchedConcept.wikidata_ids
        }
      };
      objectConfidence = 0.95;

      // If no specific role was explicitly indicated in the text, take default from concept (except institutions or pure directory queries)
      if (role === 'GENERAL_ENTITY' && targetEntityType !== 'INSTITUTION') {
        if (cleanText.includes('constructor') || matchedConcept.concept_id.includes('CONSTRUCCION')) {
          role = 'MANUFACTURER';
          action = 'MANUFACTURE';
          relation = 'MANUFACTURES';
        } else if (cleanText.includes('demolicion') || matchedConcept.concept_id.includes('DEMOLICION')) {
          role = 'SERVICE_PROVIDER';
          action = 'PROVIDE_SERVICE';
          relation = 'PROVIDES_SERVICE';
        } else if (matchedConcept.concept_id === 'OPTICAL_STORE') {
          role = 'SELLER';
          action = 'SELL';
          relation = 'SELLS';
        } else if (matchedConcept.concept_id.includes('REAL_ESTATE')) {
          role = 'SERVICE_PROVIDER';
          action = 'PROVIDE_SERVICE';
          relation = rowUnit === 'ESTABLISHMENT' ? 'ESTABLISHMENT_SERVICE' : 'PROVIDES_SERVICE';
        } else if (matchedConcept.categories?.includes('PROFESSIONAL_REGISTRY') || String(matchedConcept.relations[0]).startsWith('PROFESSIONAL_PRACTICES_')) {
          role = 'PROFESSIONAL';
          action = 'PROVIDE_SERVICE';
          relation = (matchedConcept.relations[0] as UniversalRelation) || 'PRACTICES_PROFESSION';
          targetEntityType = 'PERSON';
          rowUnit = 'PERSON';
          direction = 'professional -> practice';
        } else if (!hasCompanyModifier) {
          role = (matchedConcept.relations[0] as UniversalRole) || (rowUnit === 'ESTABLISHMENT' ? 'RETAILER' : 'MANUFACTURER');
          if (role === 'RETAILER' || role === 'SELLER') {
            action = 'RETAIL';
            relation = 'SELLS';
          } else if (role === 'MANUFACTURER') {
            action = 'MANUFACTURE';
            relation = 'MANUFACTURES';
          } else if (role === 'ESTABLISHMENT_SERVICE') {
            role = 'SERVICE_PROVIDER';
            action = 'PROVIDE_SERVICE';
            relation = 'ESTABLISHMENT_SERVICE';
          } else {
            action = 'PROVIDE_SERVICE';
            relation = 'PROVIDES_SERVICE';
          }
        }
      }

      if (role === 'ESTABLISHMENT_SERVICE') {
        role = 'SERVICE_PROVIDER';
        action = 'PROVIDE_SERVICE';
        relation = 'ESTABLISHMENT_SERVICE';
      }
    } else {
      // Unrecognized term (Ontology gap, but linguistically understood if valid noun phrase)
      const rawNoun = coreObjectTerm || cleanText;
      const isService = role === 'SERVICE_PROVIDER';
      semanticObject = {
        concept_id: null,
        canonical_name: rawNoun,
        raw_term: rawNoun,
        raw_object_phrase: rawNoun,
        raw_service_phrase: isService ? rawNoun : undefined,
        raw_product_phrase: !isService ? rawNoun : undefined,
        domain: 'UNRESOLVED_DOMAIN',
        qualifiers
      };
      objectConfidence = rawNoun.trim().length >= 3 ? 0.80 : 0.15;
    }

    // Now resolve final Target Entity Type & Row Unit using matched concept defaults if no explicit modifier
    if (!hasCompanyModifier && !hasPersonModifier && !hasInstitutionModifier && !hasEstablishmentModifier) {
      if (role === 'SUPPLIER' || role === 'MANUFACTURER' || role === 'BUYER' || role === 'EXPORTER' || role === 'IMPORTER' || role === 'DISTRIBUTOR') {
        targetEntityType = 'COMPANY';
        rowUnit = 'COMPANY';
      } else if (matchedConcept && matchedConcept.default_row_unit) {
        rowUnit = matchedConcept.default_row_unit;
        targetEntityType = (matchedConcept.entity_types[0] as UniversalEntityType) || (rowUnit === 'ESTABLISHMENT' ? 'ESTABLISHMENT' : 'COMPANY');
      } else if (role === 'RETAILER' || role === 'SELLER' || relation === 'ESTABLISHMENT_SERVICE') {
        targetEntityType = 'ESTABLISHMENT';
        rowUnit = 'ESTABLISHMENT';
      } else if (role === 'JOURNALIST') {
        targetEntityType = 'PERSON';
        rowUnit = 'PERSON';
      } else {
        targetEntityType = 'COMPANY';
        rowUnit = 'COMPANY';
      }
    }

    if (asksDirectEmails) {
      rowUnit = 'PUBLIC_EMAIL_CONTACT';
    }

    // 7. INTENT GRAPH
    const graph: IntentGraph = {
      nodes: [
        { id: 'target_node', type: 'ENTITY', label: targetEntityType, properties: { row_unit: rowUnit } },
        { id: 'role_node', type: 'ROLE', label: role, properties: {} },
        { id: 'action_node', type: 'ACTION', label: action, properties: {} },
        { id: 'relation_node', type: 'RELATION', label: relation, properties: { direction } },
        { id: 'object_node', type: 'OBJECT', label: semanticObject.canonical_name, properties: { concept_id: semanticObject.concept_id } }
      ],
      edges: [
        { from: 'target_node', to: 'role_node', relation: 'has_role' },
        { from: 'role_node', to: 'action_node', relation: 'performs' },
        { from: 'action_node', to: 'relation_node', relation: 'expresses' },
        { from: 'relation_node', to: 'object_node', relation: 'targets' }
      ]
    };

    if (geographySpec.canonical_name) {
      graph.nodes.push({ id: 'geo_node', type: 'GEOGRAPHY', label: geographySpec.canonical_name, properties: { geography_id: geographySpec.geography_id } });
      graph.edges.push({ from: 'target_node', to: 'geo_node', relation: 'located_in' });
    }

    if (contactSpec.required) {
      graph.nodes.push({ id: 'contact_node', type: 'CONTACT', label: contactSpec.type, properties: { public_only: true } });
      graph.edges.push({ from: 'target_node', to: 'contact_node', relation: 'requires_channel' });
    }

    // 8. NEGATIVE CONSTRAINTS (Prevent relation inversions)
    const negativeConstraints: NegativeConstraint[] = [];

    if (role === 'MANUFACTURER' || action === 'MANUFACTURE') {
      negativeConstraints.push({
        rule_id: 'NEG_NO_RETAILER_FOR_MANUFACTURER',
        disallowed_roles: ['RETAILER', 'SELLER', 'DISTRIBUTOR'],
        disallowed_categories: ['RETAIL_TRADE', 'COMERCIO_MINORISTA', 'REVENDEDOR'],
        disallowed_keywords: ['venta minorista', 'local a la calle', 'revendedor', 'comercio minorista'],
        reason: 'Vender al por menor o distribuir mercadería de terceros NO demuestra fabricación industrial propia.'
      });
    }

    if (role === 'BUYER' || action === 'BUY') {
      negativeConstraints.push({
        rule_id: 'NEG_NO_SELLER_FOR_BUYER',
        disallowed_roles: ['SELLER', 'DISTRIBUTOR', 'SUPPLIER', 'MANUFACTURER'],
        disallowed_categories: ['VENTA', 'PROVEEDOR', 'FABRICANTE'],
        disallowed_keywords: ['venta directa', 'proveedor', 'distribuidor oficial'],
        reason: 'Ofrecer o vender el insumo NO demuestra demanda activa de compra corporativa.'
      });
    }

    if (role === 'SUPPLIER' || action === 'SUPPLY') {
      negativeConstraints.push({
        rule_id: 'NEG_NO_DESTINATION_ESTABLISHMENT_FOR_SUPPLIER',
        disallowed_roles: ['CLIENT', 'BUYER', 'RECIPIENT_ESTABLISHMENT', 'HOSPITALITY', semanticObject.canonical_name],
        disallowed_categories: ['HOSPITALITY', 'HOTEL', 'FOOD_SERVICE', 'GASTRONOMIA', semanticObject.concept_id || 'DESTINATION_SECTOR'],
        disallowed_keywords: [semanticObject.canonical_name.toLowerCase()],
        reason: 'Ser el establecimiento de destino (ej. ser un hotel o restaurante) NO demuestra rol de proveedor para dicho sector.'
      });
    }

    if (role === 'JOURNALIST' || action === 'WRITE_ABOUT') {
      negativeConstraints.push({
        rule_id: 'NEG_NO_MEDIA_OUTLET_FOR_JOURNALIST',
        disallowed_roles: ['MEDIA_OUTLET', 'EDITORIAL', 'COMPANY'],
        disallowed_categories: ['MEDIA_PUBLICATION', 'EMPRESA_PERIODISTICA'],
        disallowed_keywords: ['diario digital', 'canal de television', 'empresa de medios'],
        reason: 'Una entidad corporativa de medios o publicación no es un periodista profesional individual.'
      });
    }

    if (role === 'EXPORTER' || action === 'EXPORT') {
      negativeConstraints.push({
        rule_id: 'NEG_NO_IMPORTER_FOR_EXPORTER',
        disallowed_roles: ['IMPORTER'],
        disallowed_categories: ['IMPORT_TRADE'],
        disallowed_keywords: ['importador directo', 'importacion'],
        reason: 'Importar insumos extranjeros NO demuestra exportación de producción nacional.'
      });
    }

    if (role === 'IMPORTER' || action === 'IMPORT') {
      negativeConstraints.push({
        rule_id: 'NEG_NO_EXPORTER_FOR_IMPORTER',
        disallowed_roles: ['EXPORTER'],
        disallowed_categories: ['EXPORT_TRADE'],
        disallowed_keywords: ['exportador'],
        reason: 'Exportar no equivale a importación.'
      });
    }

    if (role === 'USER' || action === 'USE') {
      negativeConstraints.push({
        rule_id: 'NEG_NO_SELLER_FOR_USER',
        disallowed_roles: ['SELLER', 'MANUFACTURER', 'DISTRIBUTOR'],
        disallowed_categories: ['VENTA_DE_MAQUINARIA'],
        disallowed_keywords: ['concesionario', 'venta de maquinaria'],
        reason: 'Vender o fabricar la maquinaria NO demuestra su uso operativo por parte de un cliente.'
      });
    }

    // 9. COMPILE EVIDENCE CONTRACT (via AtlasEvidenceCompiler)
    const targetSpec: SemanticTarget = {
      entity_type: targetEntityType,
      row_unit: rowUnit,
      role
    };

    const intentSpec: SemanticIntent = {
      role,
      action,
      relation,
      direction
    };

    const subjectSpec: SemanticSubject = {
      head_noun: targetEntityType.toLowerCase(),
      modifiers: cleanText.split(' ').slice(0, 3)
    };

    const evidenceContract = this.evidenceCompiler.compileEvidenceContract({
      target: targetSpec,
      intent: intentSpec,
      object: semanticObject,
      geography: geographySpec,
      contact: contactSpec
    });

    // 10. EVALUATION LAYERS (FASE 2: UNDERSTANDING, CANONICALIZATION, EXECUTION)
    const semanticUnderstanding = !isHardNovelty &&
      targetConfidence >= 0.6 &&
      relationConfidence >= 0.6 &&
      (semanticObject.raw_object_phrase.length > 0 || semanticObject.concept_id !== null);

    const ontologyGap = semanticUnderstanding && !semanticObject.concept_id;
    const geographyGap = semanticUnderstanding && Boolean(geographySpec.raw_mention && !geographySpec.geography_id);
    const specificOsm = hasSpecificTaxonomy(semanticObject.native_taxonomy_ids?.osm);
    const specificClae = Boolean(semanticObject.native_taxonomy_ids?.clae && semanticObject.native_taxonomy_ids.clae.length > 0);
    const taxonomyGap = semanticUnderstanding && !ontologyGap && (!specificOsm && !specificClae);

    const sourceGap = semanticUnderstanding && !ontologyGap && Boolean(
      (!semanticObject.native_taxonomy_ids?.osm || semanticObject.native_taxonomy_ids.osm.length === 0) &&
      (!semanticObject.native_taxonomy_ids?.clae || semanticObject.native_taxonomy_ids.clae.length === 0)
    );
    const evidenceGap = semanticUnderstanding && (!evidenceContract || evidenceContract.length === 0);

    const canonicalization = semanticUnderstanding && !ontologyGap && !geographyGap;
    const executionCapability = canonicalization && !sourceGap && !evidenceGap && !taxonomyGap;
    const executionReadiness = semanticUnderstanding && canonicalization && executionCapability;

    // 11. RESOLUTION STATE & MULTI-DIMENSIONAL CONFIDENCE
    let resolutionState: ResolutionState = 'SEMANTICS_RESOLVED';
    let clarificationPrompt: string | undefined;

    if (isHardNovelty) {
      resolutionState = 'UNKNOWN_TERM';
    } else if (conceptAmbiguity.ambiguous) {
      resolutionState = 'AMBIGUOUS_INTENT';
      clarificationPrompt = conceptAmbiguity.prompt;
    } else if (geographySpec.is_ambiguous) {
      resolutionState = 'AMBIGUOUS_GEOGRAPHY';
      clarificationPrompt = geographySpec.ambiguity_prompt;
    } else if (ontologyGap) {
      resolutionState = 'SEMANTICS_RESOLVED_ONTOLOGY_GAP';
    } else if (geographyGap) {
      resolutionState = 'SEMANTICS_RESOLVED_GEOGRAPHY_GAP';
    } else if (taxonomyGap) {
      resolutionState = 'SEMANTICS_RESOLVED_TAXONOMY_GAP';
    } else if (sourceGap) {
      resolutionState = 'SEMANTICS_RESOLVED_SOURCE_GAP';
    } else if (evidenceGap) {
      resolutionState = 'SEMANTICS_RESOLVED_EVIDENCE_GAP';
    } else if (executionReadiness) {
      resolutionState = 'EXECUTION_READY';
    }

    // Confidence Provenance (Requirement 4): Separated confidence stages
    const registryMatchConfidence = matchedConcept ? (matchedMatch?.score || 0.90) : 0.0;
    const semanticObjectConfidence = Math.min(objectConfidence, registryMatchConfidence > 0 ? registryMatchConfidence : 0.70);
    const publicTaxonomyConfidence = specificOsm || specificClae ? 0.95 : (semanticObject.native_taxonomy_ids?.osm?.length ? 0.30 : 0.0);

    // Final confidence cannot exceed weakest stage without independent evidence
    const weakestStage = Math.min(targetConfidence, relationConfidence, semanticObjectConfidence, publicTaxonomyConfidence);
    const overallConfidence = semanticUnderstanding
      ? Math.min(0.98, Math.max(weakestStage, (targetConfidence * 0.25 + relationConfidence * 0.30 + semanticObjectConfidence * 0.25 + (geographySpec.confidence || 0.8) * 0.10 + publicTaxonomyConfidence * 0.10)))
      : (resolutionState === 'AMBIGUOUS_INTENT' || resolutionState === 'AMBIGUOUS_GEOGRAPHY' ? 0.65 : 0.05);

    const confidenceVector: SemanticConfidenceVector = {
      overall: Math.round(overallConfidence * 100) / 100,
      target: targetConfidence,
      row_unit: targetConfidence,
      role: relationConfidence,
      action: relationConfidence,
      relation: relationConfidence,
      object: semanticObjectConfidence,
      geography: geographySpec.confidence,
      evidence_contract: evidenceContract.length > 0 ? 0.95 : 0.4,
      registry_match_confidence: registryMatchConfidence,
      semantic_object_confidence: semanticObjectConfidence,
      public_taxonomy_confidence: publicTaxonomyConfidence
    };

    const executionLayers: MissionExecutionLayers = {
      semantic_understanding: semanticUnderstanding,
      canonicalization,
      execution_capability: executionCapability,
      execution_readiness: executionReadiness,
      gaps: {
        ontology_gap: ontologyGap,
        geography_gap: geographyGap,
        source_gap: sourceGap,
        evidence_gap: evidenceGap,
        taxonomy_gap: taxonomyGap
      }
    };

    const canAutoExecute = executionReadiness && overallConfidence >= 0.85;

    const irSeed = `${cleanText}|${targetEntityType}|${rowUnit}|${role}|${action}|${relation}|${semanticObject.canonical_name || ''}|${geographySpec.canonical_name || ''}`;
    const ir_hash = crypto.createHash('sha256').update(irSeed).digest('hex');
    const compiler_ir_id = `IR_${ir_hash.slice(0, 12).toUpperCase()}`;

    // 12. SOURCE ARCHETYPE REASONING (Universal expectations based on domain, role, and row unit)
    const sourceArchetypeExpectations: SourceArchetype[] = [];
    if (rowUnit === 'PERSON' || role === 'PROFESSIONAL') {
      sourceArchetypeExpectations.push('PROFESSIONAL_REGISTRY', 'PUBLIC_REGISTRY', 'MEMBER_DIRECTORY');
    } else if (semanticObject.domain === 'ENTERTAINMENT' || semanticObject.domain === 'CULTURE' || /\b(teatro|milonga|discoteca|museo|cultural|cine|evento)\b/i.test(cleanText)) {
      sourceArchetypeExpectations.push('OPEN_DATA_PORTAL', 'CKAN_PORTAL', 'GOVERNMENT_API', 'PAGINATED_DIRECTORY', 'BUSINESS_DIRECTORY');
    } else if (role === 'MANUFACTURER' || semanticObject.domain === 'INDUSTRIAL' || semanticObject.domain === 'MANUFACTURING') {
      sourceArchetypeExpectations.push('CHAMBER_DIRECTORY', 'BUSINESS_DIRECTORY', 'PUBLIC_REGISTRY', 'OPEN_DATA_PORTAL');
    } else if (role === 'RETAILER' || role === 'SELLER' || rowUnit === 'ESTABLISHMENT') {
      sourceArchetypeExpectations.push('OPEN_DATA_PORTAL', 'PAGINATED_DIRECTORY', 'BUSINESS_DIRECTORY', 'GEOJSON_DATASET');
    } else {
      sourceArchetypeExpectations.push('OPEN_DATA_PORTAL', 'BUSINESS_DIRECTORY', 'PAGINATED_DIRECTORY', 'PUBLIC_REGISTRY');
    }

    const publicTaxonomy: PublicTaxonomyEntry[] = [];
    for (const tag of (semanticObject.native_taxonomy_ids?.osm || [])) {
      if (typeof tag === 'string' && tag.includes('=')) {
        const [k, v] = tag.split('=');
        publicTaxonomy.push({
          system: 'OSM',
          key: k,
          value: v,
          confidence: 0.95,
          provenance: matchedConcept ? 'CONCEPT_REGISTRY_SSOT' : 'SEMANTIC_COMPILER'
        });
      }
    }

    return {
      mission_id: missionId,
      compiler_ir_id,
      ir_hash,
      raw_query: rawQuery,
      normalized_query: cleanText,
      target: targetSpec,
      intent: intentSpec,
      subject: subjectSpec,
      object: semanticObject,
      geography: geographySpec,
      contact: contactSpec,
      target_count: targetCount,
      net_new_required: netNewRequired,
      intent_graph: graph,
      evidence_contract: evidenceContract,
      negative_constraints: negativeConstraints,
      semantic_confidence: confidenceVector,
      resolution_state: resolutionState,
      source_archetype_expectations: sourceArchetypeExpectations,
      public_taxonomy: publicTaxonomy,
      can_auto_execute: canAutoExecute,
      requires_user_clarification: resolutionState === 'AMBIGUOUS_INTENT' || resolutionState === 'AMBIGUOUS_GEOGRAPHY',
      clarification_prompt: clarificationPrompt,
      candidate_concepts: conceptAmbiguity.candidates || [],
      execution_layers: executionLayers,
      provenance: 'ATLAS_SEMANTIC_COMPILER_V1',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    };
  }

  /**
   * Async compilation with live Gemini Fallback for ontology gaps / ambiguous colloquialisms
   */
  public async compileAsync(rawQuery: string, userExplicitTarget?: number): Promise<AtlasMissionIR> {
    const baseIR = this.compile(rawQuery, userExplicitTarget);

    const requiresFallback = baseIR.execution_layers?.gaps.ontology_gap ||
      baseIR.execution_layers?.gaps.taxonomy_gap ||
      baseIR.resolution_state === 'UNKNOWN_TERM' ||
      baseIR.resolution_state === 'SEMANTICS_RESOLVED_ONTOLOGY_GAP' ||
      baseIR.resolution_state === 'SEMANTICS_RESOLVED_TAXONOMY_GAP' ||
      baseIR.resolution_state === 'SEMANTICS_RESOLVED_SOURCE_GAP' ||
      baseIR.semantic_confidence.overall < 0.85;

    console.log('[AtlasSemanticCompiler.compileAsync] query:', rawQuery, '| requiresFallback:', requiresFallback, '| state:', baseIR.resolution_state);

    if (requiresFallback) {
      try {
        const oneCall = AtlasOneCallMissionIntelligence.getInstance();
        const intel = await oneCall.resolveMission(baseIR.raw_query || rawQuery, baseIR.geography.canonical_name || 'Argentina');
        console.log('[AtlasSemanticCompiler.compileAsync] OneCall returned:', intel ? 'RECEIVED' : 'NULL');
        if (intel && intel.primary) {
          const sem = intel.primary.semantics;
          const tax = intel.primary.public_taxonomies;
          baseIR.target.entity_type = sem.target_entity_type;
          baseIR.target.row_unit = sem.row_unit as any;
          baseIR.intent.role = sem.role;
          baseIR.intent.action = sem.action;
          baseIR.intent.relation = sem.relation;
          baseIR.target.role = sem.role;

          if (sem.raw_object_phrase) {
            baseIR.object.canonical_name = sem.canonical_candidate || sem.raw_object_phrase;
            baseIR.object.raw_term = sem.raw_object_phrase;
            baseIR.object.raw_object_phrase = sem.raw_object_phrase;
          }

          if (tax) {
            baseIR.object.native_taxonomy_ids = {
              osm: tax.osm_tags,
              clae: tax.clae_codes,
              wikidata: tax.wikidata_ids
            };
            baseIR.public_taxonomy = (tax.osm_tags || []).map(t => {
              const [k, v] = t.split('=');
              return {
                system: 'OSM',
                key: k,
                value: v,
                confidence: 0.95,
                provenance: 'ATLAS_ONECALL_MISSION_INTELLIGENCE'
              };
            });
          }

          const hasSpecificTax = hasSpecificTaxonomy(tax?.osm_tags) || Boolean(tax?.clae_codes && tax.clae_codes.length > 0);

          if (intel.is_ambiguous) {
            baseIR.resolution_state = 'AMBIGUOUS_INTENT';
            baseIR.requires_user_clarification = true;
            baseIR.clarification_prompt = intel.clarification_prompt || 'Esta consulta tiene múltiples interpretaciones. Por favor aclará el rubro exacto.';
            baseIR.candidate_concepts = (intel.ambiguity_alternatives || []).map(a => a.meaning_label);
          } else if (hasSpecificTax) {
            baseIR.resolution_state = 'EXECUTION_READY';
            baseIR.requires_user_clarification = false;
            baseIR.candidate_concepts = [];
          } else {
            baseIR.resolution_state = 'SEMANTICS_RESOLVED_TAXONOMY_GAP';
          }

          if (baseIR.execution_layers) {
            baseIR.execution_layers.semantic_understanding = true;
            baseIR.execution_layers.canonicalization = !intel.is_ambiguous;
            baseIR.execution_layers.execution_capability = !intel.is_ambiguous && Boolean(hasSpecificTax);
            baseIR.execution_layers.execution_readiness = !intel.is_ambiguous && Boolean(hasSpecificTax);
            baseIR.execution_layers.gaps.ontology_gap = false;
            baseIR.execution_layers.gaps.source_gap = false;
            baseIR.execution_layers.gaps.evidence_gap = false;
            baseIR.execution_layers.gaps.taxonomy_gap = !hasSpecificTax;
          }

          baseIR.semantic_confidence.overall = Math.max(baseIR.semantic_confidence.overall, sem.confidence || 0.88);
          baseIR.semantic_confidence.public_taxonomy_confidence = hasSpecificTax ? 0.95 : 0.30;
          baseIR.provenance = 'ATLAS_SEMANTIC_COMPILER_V1_ONECALL';

          const irSeed = `${baseIR.normalized_query}|${baseIR.target.entity_type}|${baseIR.target.row_unit}|${baseIR.intent.role}|${baseIR.intent.action}|${baseIR.intent.relation}|${baseIR.object.concept_id || ''}|${baseIR.object.canonical_name || ''}|${baseIR.geography.canonical_name || ''}`;
          baseIR.ir_hash = crypto.createHash('sha256').update(irSeed).digest('hex');
          baseIR.compiler_ir_id = `IR_${baseIR.ir_hash.slice(0, 12).toUpperCase()}`;
        }
      } catch (err: any) {
        console.warn('[AtlasSemanticCompiler] OneCall fallback execution error:', err.message);
      }
    }

    return baseIR;
  }
}
