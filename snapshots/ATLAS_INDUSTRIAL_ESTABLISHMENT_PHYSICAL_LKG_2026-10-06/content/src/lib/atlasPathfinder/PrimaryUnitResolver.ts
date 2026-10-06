/**
 * ATLAS — AI PATHFINDER V3
 * Module: PrimaryUnitResolver (Sections 4, 6, 7, 8, 20)
 * 
 * Semantic Primary Unit Composition & Head/Complement Role Parsing:
 * - Separates TARGET HEAD from AGENT / SOURCE / LOCATION complements
 *   (e.g., "problemas publicados por municipios" -> TARGET = problemas, AGENT = municipios).
 * - Eliminates meta-noun fallbacks ("casos", "situaciones", "oportunidades") by decomposing
 *   the underlying phenomenon from subordinate clauses (e.g. "casos donde A utiliza X generado por B").
 * - Disentangles entities mentioned in context from what the atomic row represents.
 */

import type { PrimaryUnitOfAnalysis } from './types.ts';

export interface PrimaryUnitResolutionResult {
  primaryUnitOfAnalysis: PrimaryUnitOfAnalysis;
  unitCategory:
    | 'SPATIAL_JURISDICTION'
    | 'RELATIONSHIP_LINK'
    | 'DEVELOPED_ARTIFACT'
    | 'ENDEAVOR_PROJECT'
    | 'LOGISTICAL_INFRASTRUCTURE'
    | 'ORGANIZATION_ENTITY'
    | 'INDIVIDUAL_PERSON'
    | 'MEDIA_PUBLICATION'
    | 'DATA_RESOURCE'
    | 'COMPOSITE_MISSION_CASE'
    | 'MISSION_DEFINED_ENTITY';
  canonicalKeyName: string;
  isMissionDefined: boolean;
  confidence: number;
  rationale: string;
  roleDecomposition?: {
    targetHead: string;
    agentRole?: string;
    locationRole?: string;
    contextRole?: string;
    subordinatePhenomenon?: {
      subjectActor?: string;
      predicateAction?: string;
      objectArtifact?: string;
      originSource?: string;
    };
  };
}

export class PrimaryUnitResolver {
  private static META_NOUN_PATTERN =
    /^(casos|caso|situaciones|situacion|oportunidades|oportunidad|ejemplos|ejemplo|experiencias|experiencia|instancias|instancia|escenarios|escenario|iniciativas genericas|modelos|patrones|antecedentes)\b/i;

  private static AGENT_COMPLEMENT_PATTERN =
    /\b(publicad[oa]s?|emitid[oa]s?|liderad[oa]s?|gestionad[oa]s?|desarrollad[oa]s?|identificad[oa]s?|relevad[oa]s?|impulsad[oa]s?|cread[oa]s?|originad[oa]s?|presentad[oa]s?|promovid[oa]s?|reportad[oa]s?|informad[oa]s?|a cargo de|de parte de|de autor[ií]a de|emanad[oa]s? de)\s+(por|en|desde|de)?\s*([^,;]+)/i;

  /**
   * Resolves the primary unit of analysis from the natural language objective.
   */
  public static resolve(rawObjective: string): PrimaryUnitResolutionResult {
    const raw = rawObjective.trim();
    const lower = raw.toLowerCase();
    const normalized = lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    // Strip procedural framing: verbs + determiners + meta containers + prepositions
    let cleaned = normalized.trim();
    cleaned = cleaned.replace(/^(construir?|construime|crear?|creame|armar?|armame|generar?|generame|buscar?|identificar?|hacer?|elaborar?|desarrollar?|mapear?|relevar?|listar?)\b\s*/i, '');
    cleaned = cleaned.replace(/^(un|una|el|la|los|las)\b\s*/i, '');
    cleaned = cleaned.replace(/^(base de datos|base|dataset|directorio|registro|cat[aá]logo|mapeo|relevamiento|estudio|n[oó]mina|listado|mapa)\b\s*/i, '');
    cleaned = cleaned.replace(/^(de|sobre|con|que permita comparar)\b\s*/i, '');
    cleaned = cleaned.trim();

    // ─────────────────────────────────────────────────────────────
    // 1. HEAD / COMPLEMENT ROLE PARSING (Section 8)
    // Distinguish TARGET HEAD vs AGENT / SOURCE / LOCATION complements
    // ─────────────────────────────────────────────────────────────
    let agentComplement: string | undefined;
    let headCandidate = cleaned;

    const agentMatch = cleaned.match(this.AGENT_COMPLEMENT_PATTERN);
    if (agentMatch && agentMatch.index !== undefined) {
      // The head is before the participle/preposition introducing the agent
      headCandidate = cleaned.substring(0, agentMatch.index).trim();
      agentComplement = (agentMatch[3] || '').trim();
    }

    // Split on subordinate clause markers (donde, que, para, etc.)
    const subordinateParts = cleaned.split(/\b(donde|en los que|en las que|en el cual|en la cual|en que)\b/i);
    const hasSubordinateClause = subordinateParts.length > 1;
    const subordinateClause = hasSubordinateClause ? subordinateParts.slice(1).join(' ').trim() : '';

    // Leading target head tokens (before commas or subordinate clauses)
    const rawTargetHead = (headCandidate || cleaned).split(/,|\bdonde\b|\bque\b|\bpara\b|\ben\b/)[0].trim();

    // ─────────────────────────────────────────────────────────────
    // 2. SEMANTIC PRIMARY UNIT COMPOSITION (Section 7)
    // Meta-noun unwrapping: NO "ENTITY_CASOS" or "ENTITY_SITUACIONES"
    // ─────────────────────────────────────────────────────────────
    if (this.META_NOUN_PATTERN.test(rawTargetHead)) {
      // Decompose target phenomenon from subordinate clause or remainder
      const phenomenonResult = this.composeSubordinatePhenomenon(
        rawTargetHead,
        subordinateClause || cleaned,
        normalized
      );
      if (phenomenonResult) {
        return phenomenonResult;
      }
    }

    // Target head after removing meta-noun / leading determiners
    const targetHead = rawTargetHead;

    // ─────────────────────────────────────────────────────────────
    // 3. RELATIONSHIP / COLLABORATION FIRST-CLASS CHECK
    // ─────────────────────────────────────────────────────────────
    if (
      /\b(relaciones|relacion|vinculos?|colaboraciones?|convenios?|alianzas?|articulacion(es)?|acuerdos?|asociaciones? bilaterales?|intercambios?)\b/i.test(targetHead) ||
      (/\b(entre)\b/i.test(targetHead) && /\b(y)\b/i.test(targetHead))
    ) {
      return {
        primaryUnitOfAnalysis: 'RELATIONSHIP',
        unitCategory: 'RELATIONSHIP_LINK',
        canonicalKeyName: 'canonical_relationship_id',
        isMissionDefined: false,
        confidence: 0.96,
        rationale: 'The target row represents a verified bilateral/multilateral relationship between distinct entities.',
        roleDecomposition: { targetHead, agentRole: agentComplement }
      };
    }

    // ─────────────────────────────────────────────────────────────
    // 4. SPATIAL, JURISDICTIONAL, OR GEOGRAPHIC LOCALITIES
    // Only if the TARGET HEAD itself is a spatial entity (NOT when in complement)
    // ─────────────────────────────────────────────────────────────
    if (
      /\b(ciudades|ciudad|localidades|localidad|municipios|municipio|jurisdicciones|jurisdiccion|provincias|distritos|comunas|regiones|zonas urbanas)\b/i.test(targetHead)
    ) {
      const isCity = /\b(ciudades|ciudad)\b/i.test(targetHead);
      const unit = isCity ? 'CITY' : 'LOCALITY';
      return {
        primaryUnitOfAnalysis: unit,
        unitCategory: 'SPATIAL_JURISDICTION',
        canonicalKeyName: isCity ? 'canonical_city_id' : 'canonical_locality_id',
        isMissionDefined: false,
        confidence: 0.95,
        rationale: `The target row represents a discrete geographic jurisdiction or settlement (${unit}), regardless of institutions mentioned within it.`,
        roleDecomposition: { targetHead, agentRole: agentComplement }
      };
    }

    // ─────────────────────────────────────────────────────────────
    // 5. LOGISTICAL INFRASTRUCTURE, CORRIDORS & TRANSPORT NODES
    // ─────────────────────────────────────────────────────────────
    if (
      /\b(corredores|corredor|nodos? logisticos?|nodos?|puertos?|terminales?|centros? logisticos?|rutas? logisticas?|ejes? logisticos?|parques? logisticos?)\b/i.test(targetHead)
    ) {
      const isCorridor = /\b(corredores|corredor)\b/i.test(targetHead);
      const unit = isCorridor ? 'LOGISTICS_CORRIDOR' : 'LOGISTICS_NODE';
      return {
        primaryUnitOfAnalysis: unit,
        unitCategory: 'LOGISTICAL_INFRASTRUCTURE',
        canonicalKeyName: 'canonical_node_id',
        isMissionDefined: true,
        confidence: 0.94,
        rationale: `The target row represents a physical transport/logistics hub or node (${unit}).`,
        roleDecomposition: { targetHead, agentRole: agentComplement }
      };
    }

    // ─────────────────────────────────────────────────────────────
    // 6. SCIENTIFIC ARTIFACTS, PRODUCTS & TECHNOLOGICAL DEVELOPMENTS
    // ─────────────────────────────────────────────────────────────
    if (
      /\b(tecnologias?|desarrollos?|productos?|patentes?|innovaciones?|dispositivos?|sistemas? tecnologicos?|soluciones? tecnicas?|software)\b/i.test(targetHead)
    ) {
      const hasTransfer = /\b(aplicacion|comercial|productiv|clinica|industrial|fuera del laboratorio|transferencia)\b/i.test(normalized);
      const unit = hasTransfer ? 'TECHNOLOGY_TRANSFER_CASE' : 'TECHNOLOGY';
      return {
        primaryUnitOfAnalysis: unit,
        unitCategory: 'DEVELOPED_ARTIFACT',
        canonicalKeyName: 'canonical_technology_id',
        isMissionDefined: hasTransfer,
        confidence: 0.95,
        rationale: `The target row represents a technological development or concrete artifact (${unit}), distinguishing origin institution from application.`,
        roleDecomposition: { targetHead, agentRole: agentComplement }
      };
    }

    // ─────────────────────────────────────────────────────────────
    // 7. INITIATIVES, ENDEAVORS, MULTI-ACTOR PROJECTS & PROGRAMS
    // ─────────────────────────────────────────────────────────────
    if (
      /\b(proyectos?|iniciativas?|programas?|emprendimientos?|consorcios?|planes?)\b/i.test(targetHead)
    ) {
      const isTripartiteOrMultiActor = /\b(simultaneamente|organismo publico|academica|privada|social|multiples actores)\b/i.test(normalized);
      const unit = isTripartiteOrMultiActor ? 'INTERSECTORAL_PROJECT' : 'PROJECT';
      return {
        primaryUnitOfAnalysis: unit,
        unitCategory: 'ENDEAVOR_PROJECT',
        canonicalKeyName: 'canonical_project_id',
        isMissionDefined: isTripartiteOrMultiActor,
        confidence: 0.95,
        rationale: `The target row represents an active endeavor or project (${unit}), preserving participating actor roles.`,
        roleDecomposition: { targetHead, agentRole: agentComplement }
      };
    }

    // ─────────────────────────────────────────────────────────────
    // 8. MEDIA OUTLETS, JOURNALISTIC PROJECTS & PUBLICATIONS
    // ─────────────────────────────────────────────────────────────
    if (
      /\b(medios?|proyectos? periodisticos?|periodismo|publicaciones?|revistas?|portales?|agencias? de noticias)\b/i.test(targetHead)
    ) {
      return {
        primaryUnitOfAnalysis: 'MEDIA_OUTLET',
        unitCategory: 'MEDIA_PUBLICATION',
        canonicalKeyName: 'canonical_media_id',
        isMissionDefined: false,
        confidence: 0.93,
        rationale: 'The target row represents an editorial entity or media outlet (MEDIA_OUTLET), associating authors without becoming a person database.',
        roleDecomposition: { targetHead, agentRole: agentComplement }
      };
    }

    // ─────────────────────────────────────────────────────────────
    // 9. CORPORATIONS, INSTITUTIONS, COLLECTIVES & ORGANIZATIONS
    // ─────────────────────────────────────────────────────────────
    if (
      /\b(organizaciones?|empresas?|companias?|cooperativas?|fundaciones?|asociaciones?|instituciones?|camaras?|laboratorios?|fabricas?)\b/i.test(targetHead)
    ) {
      return {
        primaryUnitOfAnalysis: 'ORGANIZATION',
        unitCategory: 'ORGANIZATION_ENTITY',
        canonicalKeyName: 'cuit',
        isMissionDefined: false,
        confidence: 0.95,
        rationale: 'The target row represents an established legal or corporate organization (ORGANIZATION).',
        roleDecomposition: { targetHead, agentRole: agentComplement }
      };
    }

    // ─────────────────────────────────────────────────────────────
    // 10. HUMAN INDIVIDUALS, EXPERTS & SPECIALISTS
    // ─────────────────────────────────────────────────────────────
    if (
      /\b(personas?|referentes?|expertos?|especialistas?|profesionales?|cientificos?|investigadores?|periodistas?|autores?|lideres?|directores?)\b/i.test(targetHead)
    ) {
      return {
        primaryUnitOfAnalysis: 'PERSON',
        unitCategory: 'INDIVIDUAL_PERSON',
        canonicalKeyName: 'canonical_person_id',
        isMissionDefined: false,
        confidence: 0.96,
        rationale: 'The target row represents an individual person (PERSON) canonically resolved.',
        roleDecomposition: { targetHead, agentRole: agentComplement }
      };
    }

    // ─────────────────────────────────────────────────────────────
    // 11. PUBLIC SOURCES, DATASETS & REPOSITORIES
    // ─────────────────────────────────────────────────────────────
    if (
      /\b(fuentes?|datasets?|repositorios?|open data|datos abiertos|catalogos? de datos)\b/i.test(targetHead)
    ) {
      return {
        primaryUnitOfAnalysis: 'DATASET',
        unitCategory: 'DATA_RESOURCE',
        canonicalKeyName: 'source_id',
        isMissionDefined: false,
        confidence: 0.92,
        rationale: 'The target row represents an open data source or catalog.',
        roleDecomposition: { targetHead, agentRole: agentComplement }
      };
    }

    // ─────────────────────────────────────────────────────────────
    // 12. NOVEL NOUN PHRASE → MISSION DEFINED ENTITY (Open Extensible)
    // ─────────────────────────────────────────────────────────────
    const stopWords = ['cada', 'todo', 'todos', 'base', 'datos', 'argentina', 'nacional', 'publicos', 'publicas', 'locales'];
    const tokenCandidates = targetHead
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3 && !stopWords.includes(w) && !this.META_NOUN_PATTERN.test(w));

    const derivedToken = tokenCandidates.length > 0 ? tokenCandidates[0].toUpperCase() : 'MISSION_RECORD';
    const missionDefinedName = `ENTITY_${derivedToken}`;

    return {
      primaryUnitOfAnalysis: missionDefinedName,
      unitCategory: 'MISSION_DEFINED_ENTITY',
      canonicalKeyName: `canonical_${derivedToken.toLowerCase()}_id`,
      isMissionDefined: true,
      confidence: 0.80,
      rationale: `Dynamic mission-defined entity derived from target head: "${missionDefinedName}". Agent complement: "${agentComplement || 'NONE'}".`,
      roleDecomposition: {
        targetHead,
        agentRole: agentComplement
      }
    };
  }

  /**
   * Unwraps meta-nouns by discovering the phenomenon in the subordinate clause.
   */
  private static composeSubordinatePhenomenon(
    metaNoun: string,
    subordinateText: string,
    fullNormalized: string
  ): PrimaryUnitResolutionResult | null {
    const cleanSub = subordinateText
      .replace(/^(donde|en los que|en las que|en el cual|en la cual|en que|que)\s*/i, '')
      .trim();

    // Look for active verb
    const verbMatch = cleanSub.match(
      /\b(utiliza[n]?|aplica[n]?|adopta[n]?|implementa[n]?|demanda[n]?|integra[n]?|requiere[n]?|transfiere[n]?|desarrolla[n]?|produce[n]?|conecta[n]?|invierten?)\b/i
    );

    if (verbMatch && verbMatch.index !== undefined) {
      const subjectPart = cleanSub.substring(0, verbMatch.index).trim();
      const verb = verbMatch[1].trim().toUpperCase();
      const remainder = cleanSub.substring(verbMatch.index + verbMatch[0].length).trim();

      // Check for source / origin complement in remainder: "generado por X" / "desarrollado por Y"
      const originMatch = remainder.match(/\b(?:generad[oa]s?|desarrollad[oa]s?|producid[oa]s?|originad[oa]s?)\s+por\s+([^,;]+)/i);
      const objectPart = originMatch && originMatch.index !== undefined
        ? remainder.substring(0, originMatch.index).trim()
        : remainder;
      const originPart = originMatch ? originMatch[1].trim() : undefined;

      // Extract substantive tokens for subject, object, origin
      const subjectTokens = subjectPart
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 3 && !['cada', 'todo', 'todos', 'para', 'como', 'sector', 'del', 'los', 'las'].includes(w));
      const subject = (subjectTokens[0] || 'ACTOR').toUpperCase();

      const objectTokens = objectPart
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 3 && !['cada', 'todo', 'todos', 'para', 'como'].includes(w));
      const object = (objectTokens[0] || 'ARTIFACT').toUpperCase();

      const origin = originPart
        ? originPart.replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 3)[0]?.toUpperCase()
        : undefined;

      const unitName = origin
        ? `ENTITY_${subject}_${verb}_${object}_FROM_${origin}`
        : `ENTITY_${subject}_${verb}_${object}`;

      return {
        primaryUnitOfAnalysis: unitName,
        unitCategory: 'COMPOSITE_MISSION_CASE',
        canonicalKeyName: 'canonical_case_id',
        isMissionDefined: true,
        confidence: 0.92,
        rationale: `Decomposed phenomenon from subordinate clause following meta-noun "${metaNoun}": subject=${subject}, action=${verb}, object=${object}.`,
        roleDecomposition: {
          targetHead: metaNoun,
          subordinatePhenomenon: {
            subjectActor: subject,
            predicateAction: verb,
            objectArtifact: object,
            originSource: origin
          }
        }
      };
    }

    // Fallback: extract substantive tokens from subordinate clause
    const tokens = cleanSub
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3 && !['cada', 'todo', 'todos', 'para', 'como', 'hacia', 'desde', 'sobre'].includes(w) && !this.META_NOUN_PATTERN.test(w));

    if (tokens.length >= 2) {
      const compositeToken = `${tokens[0].toUpperCase()}_${tokens[1].toUpperCase()}`;
      const unitName = `ENTITY_${compositeToken}`;
      return {
        primaryUnitOfAnalysis: unitName,
        unitCategory: 'COMPOSITE_MISSION_CASE',
        canonicalKeyName: 'canonical_case_id',
        isMissionDefined: true,
        confidence: 0.85,
        rationale: `Synthesized composite unit "${unitName}" from subordinate action clause to avoid meta-noun "${metaNoun}".`,
        roleDecomposition: {
          targetHead: metaNoun,
          subordinatePhenomenon: {
            subjectActor: tokens[0],
            objectArtifact: tokens[1]
          }
        }
      };
    }

    return null;
  }
}
