/**
 * ATLAS GENERAL OBJECTIVE INTELLIGENCE ENGINE V1
 * Module: ObjectiveInterpreter (Section 4)
 * 
 * Translates arbitrary open-ended user objectives into deterministic,
 * structured, auditable MissionSpecifications.
 */

import type { UserObjectiveInput, MissionSpecification, ObjectiveType, TargetEntityType } from './types.ts';

export class ObjectiveInterpreter {
  public static interpret(input: UserObjectiveInput): MissionSpecification {
    const raw = input.text.trim();
    const missionId = `MISS_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    // 1. Detect Objective Type and Target Entity Type
    let objectiveType: ObjectiveType = 'EXPERT_DISCOVERY';
    let targetEntityType: TargetEntityType = 'PERSON';

    const lower = raw.toLowerCase();

    if (/\b(fuentes?|sources?|datasets?|bases? de datos|repositorios?|open data)\b/i.test(lower)) {
      objectiveType = 'SOURCE_DISCOVERY';
      targetEntityType = 'PUBLIC_SOURCE';
    } else if (/\b(contactos?|emails?|correos?|telefonos?|canales? de contacto|contactability)\b/i.test(lower)) {
      objectiveType = 'PUBLIC_CONTACT_DISCOVERY';
      targetEntityType = 'CONTACT_CHANNEL';
    } else if (/\b(empresas?|companias?|companies|organizaciones|organizations|laboratorios|labs|camaras|asociaciones|fabricas)\b/i.test(lower)) {
      objectiveType = 'ORGANIZATION_DISCOVERY';
      targetEntityType = 'ORGANIZATION';
    } else if (/\b(videos?|documentales?|conferencias?|audiovisual|film|grabaciones|charlas|media)\b/i.test(lower)) {
      objectiveType = 'CONTENT_DISCOVERY';
      targetEntityType = 'VIDEO_CONTENT';
    } else {
      // Default to people / expert discovery
      objectiveType = 'EXPERT_DISCOVERY';
      targetEntityType = 'PERSON';
    }

    // 2. Geography Detection
    let geography = input.geographyHint || 'ARG / NACIONAL';
    if (/caba|buenos aires|ciudad de buenos aires/i.test(lower)) {
      geography = 'ARG / CABA';
    } else if (/cordoba|santa fe|mendoza|tucuman|neuquen|rio negro|salta/i.test(lower)) {
      const match = lower.match(/(cordoba|santa fe|mendoza|tucuman|neuquen|rio negro|salta)/i);
      geography = `ARG / ${match ? match[0].toUpperCase() : 'PROVINCIAL'}`;
    } else if (/argentin/i.test(lower)) {
      geography = 'ARG / NACIONAL';
    }

    // 3. Domain Topic Extraction
    const domainTopics: string[] = [];
    const normalizedLower = lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const topicKeywords = [
      'nuclear', 'energia nuclear', 'solar', 'renovable', 'litio', 'mineria',
      'biotecnologia', 'genomica', 'medica', 'salud', 'economia', 'periodismo',
      'inteligencia artificial', 'software', 'agtech', 'quimica', 'derecho'
    ];
    for (const kw of topicKeywords) {
      if (normalizedLower.includes(kw) || lower.includes(kw)) domainTopics.push(kw);
    }
    if (domainTopics.length === 0) {
      // Fallback: extract prominent descriptive tokens
      const words = normalizedLower.replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 4 && !['find', 'buscar', 'encontrar', 'identificar', 'obtener', 'argentina', 'argentinos', 'publicos', 'empresas', 'fuentes', 'contactos', 'videos', 'proveedoras', 'proveedores'].includes(w));
      if (words.length > 0) domainTopics.push(words[0]);
    }

    // 4. Quantity Parsing
    let targetQuantity = input.targetQuantity || 10;
    const qtyMatch = lower.match(/\b(\d+)\b/);
    if (qtyMatch && !input.targetQuantity) {
      const parsed = parseInt(qtyMatch[1], 10);
      if (parsed > 0 && parsed <= 500) targetQuantity = parsed;
    }

    // 5. Attributes & Evidence Criteria Formulation
    const requiredAttributes = [`geography:${geography}`];
    for (const t of domainTopics) requiredAttributes.push(`topic:${t}`);

    const optionalAttributes = ['has_affiliation', 'has_recent_citation', 'has_public_channel'];

    const successCriteria = [
      `TARGET_QUANTITY_REACHED >= ${targetQuantity}`,
      `ENTITY_TYPE == ${targetEntityType}`,
      'PROVENANCE_RETAINED == TRUE',
      'ARGENTINA_LINK_VERIFIED == TRUE'
    ];

    if (objectiveType === 'EXPERT_DISCOVERY') {
      successCriteria.push('EXPERTISE_EVIDENCE_SCORE >= 0.70');
    } else if (objectiveType === 'ORGANIZATION_DISCOVERY') {
      successCriteria.push('SECTOR_REGISTRATION_VERIFIED == TRUE');
    } else if (objectiveType === 'PUBLIC_CONTACT_DISCOVERY') {
      successCriteria.push('PUBLIC_ACCESS_VERIFIED == TRUE');
    } else if (objectiveType === 'CONTENT_DISCOVERY') {
      successCriteria.push('VIDEO_PLAYABLE == TRUE');
    }

    return {
      missionId,
      rawObjective: raw,
      objectiveType,
      targetEntityType,
      geography,
      targetQuantity,
      domainTopics,
      requiredAttributes,
      optionalAttributes,
      evidenceRequirements: {
        minConfidence: 0.70,
        citationRequired: objectiveType === 'EXPERT_DISCOVERY',
        observationProvenanceRequired: true
      },
      successCriteria,
      noveltyRequirements: {
        allowPreexisting: true, // General missions may surface known entities as long as evidence satisfies mission
        noveltyTargetRate: 0.50
      },
      qualityRequirements: {
        verifyPublicAccessibility: true,
        verifyEntityLink: true
      },
      constraints: {
        maxTimeMs: input.timeLimitMs || 30000,
        maxCostUsd: 0.0,
        publicDataOnly: input.publicDataOnly !== false,
        noPrivateApis: true
      },
      createdAt: new Date().toISOString()
    };
  }
}
