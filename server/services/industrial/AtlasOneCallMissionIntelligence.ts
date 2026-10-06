/**
 * ATLAS ONE-CALL GEMINI MISSION INTELLIGENCE V1
 * @server/services/industrial/AtlasOneCallMissionIntelligence.ts
 * 
 * Strict Architectural Invariants:
 * - SOURCE KNOWLEDGE FIRST: Never calls Gemini if Concept Registry or Source Knowledge Map already has the answer.
 * - MAXIMUM ONE Gemini call per difficult mission:
 *   Produces simultaneously:
 *     A) MissionIRCandidate (Semantics, target, role, relation, geography)
 *     B) SourcePlanHypotheses (Taxonomies: OSM, Wikidata, CLAE, Source families)
 *     C) EvidenceContractCandidate (Identity, activity, relation, contact)
 * - AMBIGUITY SUPPORT: Returns complete hypotheses for all candidate meanings simultaneously
 *   (e.g., "boliche" -> branch A: Discoteca, branch B: Bar). Clarification does NOT trigger a second Gemini call.
 * - Tracks input/output tokens and cost metrics.
 * - NEVER prints or logs API keys.
 */

import { AtlasConceptRegistry, type AtlasConceptDefinition } from './AtlasConceptRegistry.ts';
import { AtlasPublicTaxonomyValidator, hasSpecificTaxonomy } from './AtlasPublicTaxonomyValidator.ts';
import { SourceKnowledgeMap } from '../../../src/lib/atlasPathfinder/sourceIntelligence/SourceKnowledgeMap.ts';
import type { AtlasMissionIR, UniversalEntityType, UniversalRole, UniversalAction, UniversalRelation } from './AtlasMissionIR.ts';

export interface OneCallMissionIntelligenceResult {
  source_knowledge_hit: boolean;
  gemini_called: boolean;
  model_used?: string;
  input_tokens: number;
  output_tokens: number;

  // Primary Meaning Hypotheses
  primary: {
    semantics: {
      target_entity_type: UniversalEntityType;
      row_unit: string;
      role: UniversalRole;
      action: UniversalAction;
      relation: UniversalRelation;
      raw_object_phrase: string;
      canonical_candidate: string;
      qualifiers: string[];
      geography: string;
      negative_constraints: string[];
      contact_requirements: { email_required: boolean; public_contact_required: boolean };
      confidence: number;
    };
    public_taxonomies: {
      osm_tags: string[];
      wikidata_ids: string[];
      clae_codes: string[];
      other_public_taxonomies?: string[];
    };
    source_hypotheses: Array<{
      source_family: string;
      known_atlas_source_id?: string;
      query_strategy: string;
      expected_evidence: string[];
      geographic_fit: string;
      confidence: number;
      reason_codes?: string[];
    }>;
    evidence_contract: {
      identity_evidence: string[];
      activity_evidence: string[];
      relation_evidence: string[];
      contact_evidence: string[];
    };
  };

  // Ambiguity Handling: Precomputed hypotheses for each branch
  is_ambiguous: boolean;
  clarification_prompt?: string;
  ambiguity_alternatives?: Array<{
    meaning_label: string;
    semantics: OneCallMissionIntelligenceResult['primary']['semantics'];
    public_taxonomies: OneCallMissionIntelligenceResult['primary']['public_taxonomies'];
    source_hypotheses: OneCallMissionIntelligenceResult['primary']['source_hypotheses'];
  }>;
}

export class AtlasOneCallMissionIntelligence {
  private static instance: AtlasOneCallMissionIntelligence;

  // Running telemetry metrics
  public total_missions: number = 0;
  public total_gemini_calls: number = 0;
  public total_input_tokens: number = 0;
  public total_output_tokens: number = 0;

  public static getInstance(): AtlasOneCallMissionIntelligence {
    if (!this.instance) {
      this.instance = new AtlasOneCallMissionIntelligence();
    }
    return this.instance;
  }

  /**
   * Main resolution method: Source Knowledge First -> One Gemini Call fallback.
   */
  public async resolveMission(query: string, geography = 'Argentina'): Promise<OneCallMissionIntelligenceResult> {
    this.total_missions++;
    const cleanQuery = (query || '').trim();
    const queryLower = cleanQuery.toLowerCase();

    // 1. SOURCE KNOWLEDGE FIRST: Check Concept Registry (Section 14 & 16)
    const conceptRegistry = AtlasConceptRegistry.getInstance();
    await conceptRegistry.ensureInitialized();
    const matches = conceptRegistry.findMatchingConcepts(queryLower);

    const topMatch = matches[0];
    const topConcept = topMatch?.concept;
    const hasUsableTaxonomy = topConcept ? hasSpecificTaxonomy(topConcept.osm_tags) : false;

    if (topMatch && topMatch.resolution_admissible && !topMatch.stem_only_match && topMatch.score >= 0.85 && hasUsableTaxonomy) {
      console.log(`[AtlasOneCallIntelligence] ZERO-CALL HIT in Concept Registry: ${topConcept.concept_id} for "${cleanQuery}" with verified specific taxonomy`);
      return {
        source_knowledge_hit: true,
        gemini_called: false,
        input_tokens: 0,
        output_tokens: 0,
        is_ambiguous: false,
        primary: {
          semantics: {
            target_entity_type: (topConcept.row_unit as any) || 'ESTABLISHMENT',
            row_unit: topConcept.row_unit || 'ESTABLISHMENT',
            role: (topConcept.relations[0] as any) || 'SERVICE_PROVIDER',
            action: 'PROVIDE_SERVICE',
            relation: (topConcept.relations[0] as any) || 'ESTABLISHMENT_SERVICE',
            raw_object_phrase: cleanQuery,
            canonical_candidate: topConcept.canonical_name,
            qualifiers: [],
            geography,
            negative_constraints: [],
            contact_requirements: { email_required: false, public_contact_required: false },
            confidence: 1.0
          },
          public_taxonomies: {
            osm_tags: topConcept.osm_tags,
            wikidata_ids: topConcept.wikidata_ids || [],
            clae_codes: topConcept.clae_codes || []
          },
          source_hypotheses: [
            {
              source_family: 'OSM_OVERPASS',
              known_atlas_source_id: 'SRC_OSM_PUBLIC_ESTABLISHMENTS',
              query_strategy: `OVERPASS_TAG_QUERY::${topConcept.osm_tags[0] || ''}`,
              expected_evidence: ['COORDINATES', 'ADDRESS', 'COMMERCIAL_NAME'],
              geographic_fit: 'NATIONAL_AND_PROVINCIAL',
              confidence: 0.99
            }
          ],
          evidence_contract: {
            identity_evidence: ['commercial_name', 'osm_id'],
            activity_evidence: topConcept.osm_tags,
            relation_evidence: ['ESTABLISHMENT_SERVICE'],
            contact_evidence: ['address', 'coordinates']
          }
        }
      };
    }

    // 2. ONE GEMINI CALL FOR DIFFICULT MISSION
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY not found in environment');
    }

    const promptText = `Eres el motor One-Call Mission Intelligence de Atlas B2B (Argentina).
Analiza la siguiente búsqueda comercial o misión B2B: "${cleanQuery}" en el contexto geográfico: "${geography}".

INSTRUCCIONES CLAVE:
1. Resuelve de forma COMPLETA y en UNA SOLA LLAMADA:
   A) SEMÁNTICA (tipo de entidad, unidad de fila, rol, acción, relación, nombre canónico).
   B) TAXONOMÍAS PÚBLICAS (etiquetas OpenStreetMap oficiales formato key=value ej amenity=nightclub, Wikidata IDs formato Q..., códigos de actividad económica CLAE INDEC formato dígitos).
   C) HIPÓTESIS DE FUENTES PÚBLICAS (familia de fuente ej OSM_OVERPASS, CKAN, PUBLIC_REGISTRY, BUSINESS_CHAMBER, query strategy, evidencia esperada).
   D) CONTRATO DE EVIDENCIA (qué datos certifican identidad, actividad, relación y contacto).

2. CASOS AMBIGUOS / POLISÉMICOS (ej. "boliche"):
   - Si el término tiene más de una interpretación comercial relevante en Argentina (ej: A) Discoteca/Club nocturno vs B) Bar/Local gastronómico):
     - is_ambiguous: true
     - clarification_prompt: "¿Buscás discotecas y locales bailables, o bares y locales gastronómicos?"
     - ambiguity_alternatives: incluye un array con la hipótesis COMPLETA (semántica, taxonomías y fuentes) para CADA interpretación.
     - En "primary", coloca la interpretación principal más frecuente.

3. CASOS NO AMBIGUOS (ej. "milongas en argentina", "laboratorio dental", "fabrica de pallets", "club de jazz"):
   - is_ambiguous: false
   - ambiguity_alternatives: []
   - Proveer etiquetas OSM exactas válidas (ej para laboratorio dental: craft=dental_technician o healthcare=laboratory, para fábrica de pallets: industrial=pallet o craft=carpenter / man_made=works, para club de jazz: amenity=nightclub / amenity=bar con music=jazz / leisure=music_venue, para milongas: amenity=dancing_school / leisure=dance_hall / dance:style=tango).
   - Códigos CLAE INDEC correspondientes (ej pallets: 1621 / 1629; laboratorio dental: 3250; milongas/danza: 9000 / 9329; club de jazz: 5630 / 9000).

DEVOLVER EXCLUSIVAMENTE UN JSON VÁLIDO CON ESTA ESTRUCTURA EXACTA:
{
  "is_ambiguous": boolean,
  "clarification_prompt": string | null,
  "primary": {
    "semantics": {
      "target_entity_type": "COMPANY" | "ESTABLISHMENT" | "PERSON" | "INSTITUTION",
      "row_unit": "COMPANY" | "ESTABLISHMENT" | "PERSON" | "PUBLIC_EMAIL_CONTACT",
      "role": "MANUFACTURER" | "SELLER" | "RETAILER" | "BUYER" | "SUPPLIER" | "SERVICE_PROVIDER" | "GENERAL_ENTITY",
      "action": "MANUFACTURE" | "SELL" | "BUY" | "PROVIDE_SERVICE" | "GENERAL_ACTION",
      "relation": "MANUFACTURES" | "SELLS" | "BUYS" | "ESTABLISHMENT_SERVICE" | "GENERAL_RELATION",
      "raw_object_phrase": string,
      "canonical_candidate": string,
      "qualifiers": string[],
      "geography": string,
      "negative_constraints": string[],
      "contact_requirements": { "email_required": boolean, "public_contact_required": boolean },
      "confidence": number
    },
    "public_taxonomies": {
      "osm_tags": string[],
      "wikidata_ids": string[],
      "clae_codes": string[],
      "other_public_taxonomies": string[]
    },
    "source_hypotheses": [
      {
        "source_family": string,
        "known_atlas_source_id": string | null,
        "query_strategy": string,
        "expected_evidence": string[],
        "geographic_fit": string,
        "confidence": number,
        "reason_codes": string[]
      }
    ],
    "evidence_contract": {
      "identity_evidence": string[],
      "activity_evidence": string[],
      "relation_evidence": string[],
      "contact_evidence": string[]
    }
  },
  "ambiguity_alternatives": [
    {
      "meaning_label": string,
      "semantics": { ... },
      "public_taxonomies": { ... },
      "source_hypotheses": [ ... ]
    }
  ]
}`;

    const models = ['gemini-3.5-flash-lite', 'gemini-3.8-flash'];
    for (const model of models) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 18000);

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }],
            generationConfig: { responseMimeType: 'application/json', temperature: 0.1 }
          }),
          signal: controller.signal
        });
        clearTimeout(timeout);

        if (res.ok) {
          const data: any = await res.json();
          this.total_gemini_calls++;

          const usage = data.usageMetadata || {};
          const inTokens = usage.promptTokenCount || 450;
          const outTokens = usage.candidatesTokenCount || 350;
          this.total_input_tokens += inTokens;
          this.total_output_tokens += outTokens;

          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            const parsed = JSON.parse(text);

            // Requirement 8: AI only proposes. Atlas validates.
            const validator = AtlasPublicTaxonomyValidator.getInstance();
            const valResult = validator.validateHypotheses({
              canonical_candidate: parsed.primary?.semantics?.canonical_candidate || cleanQuery,
              osm_tags: parsed.primary?.public_taxonomies?.osm_tags,
              wikidata_ids: parsed.primary?.public_taxonomies?.wikidata_ids,
              clae_codes: parsed.primary?.public_taxonomies?.clae_codes
            });

            if (parsed.primary?.public_taxonomies) {
              if (valResult.sanitized_osm_tags.length > 0) {
                parsed.primary.public_taxonomies.osm_tags = valResult.specific_osm_tags.length > 0 
                  ? valResult.specific_osm_tags 
                  : valResult.sanitized_osm_tags;
              }
              if (valResult.sanitized_wikidata_ids.length > 0) {
                parsed.primary.public_taxonomies.wikidata_ids = valResult.sanitized_wikidata_ids;
              }
              if (valResult.sanitized_clae_codes.length > 0) {
                parsed.primary.public_taxonomies.clae_codes = valResult.sanitized_clae_codes;
              }
            }

            // Requirement 9: Persist learned mapping once validated
            if (valResult.valid && valResult.public_taxonomy_validated) {
              try {
                const canonicalName = valResult.canonical_candidate || parsed.primary?.semantics?.canonical_candidate || cleanQuery;
                const conceptId = `CONCEPT_${canonicalName.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;
                const learnedDef: AtlasConceptDefinition = {
                  concept_id: conceptId,
                  canonical_name: canonicalName,
                  synonyms: Array.from(new Set([cleanQuery.toLowerCase(), canonicalName.toLowerCase(), queryLower])),
                  aliases: Array.from(new Set([cleanQuery.toLowerCase(), canonicalName.toLowerCase()])),
                  entity_types: [parsed.primary?.semantics?.target_entity_type || 'ESTABLISHMENT'],
                  row_units: [parsed.primary?.semantics?.row_unit || 'ESTABLISHMENT'],
                  default_row_unit: parsed.primary?.semantics?.row_unit || 'ESTABLISHMENT',
                  categories: [conceptId, ...(parsed.primary?.semantics?.qualifiers || [])],
                  activities: [conceptId],
                  relations: [parsed.primary?.semantics?.relation || 'ESTABLISHMENT_SERVICE'],
                  products: [],
                  services: [canonicalName],
                  osm_tags: parsed.primary?.public_taxonomies?.osm_tags || [],
                  wikidata_ids: parsed.primary?.public_taxonomies?.wikidata_ids || [],
                  clae_codes: parsed.primary?.public_taxonomies?.clae_codes || [],
                  confidence: parsed.primary?.semantics?.confidence || 0.95,
                  provenance: 'AUTONOMOUS_ONECALL_LEARNED_AND_VALIDATED',
                  validation_state: 'VALIDATED',
                  version: 1
                };
                await conceptRegistry.registerConceptInDb(learnedDef);
                console.log(`[AtlasOneCallIntelligence] Successfully persisted learned concept to Concept Registry SSOT: ${conceptId}`);
              } catch (persistErr: any) {
                console.warn(`[AtlasOneCallIntelligence] Warning persisting learned concept:`, persistErr.message);
              }
            }

            return {
              source_knowledge_hit: false,
              gemini_called: true,
              model_used: model,
              input_tokens: inTokens,
              output_tokens: outTokens,
              is_ambiguous: Boolean(parsed.is_ambiguous),
              clarification_prompt: parsed.clarification_prompt || undefined,
              primary: parsed.primary,
              ambiguity_alternatives: Array.isArray(parsed.ambiguity_alternatives) ? parsed.ambiguity_alternatives : []
            };
          }
        }
      } catch (err: any) {
        // Fallback to standby model
      }
    }

    throw new Error('All Gemini models failed to generate structured mission intelligence');
  }

  public getTelemetry() {
    // Pricing based on Gemini 1.5 Flash / Flash-Lite: ~$0.075 / 1M input, ~$0.30 / 1M output
    const costInput = (this.total_input_tokens / 1_000_000) * 0.075;
    const costOutput = (this.total_output_tokens / 1_000_000) * 0.30;
    const totalCostUsd = costInput + costOutput;
    const costPer1kMissions = this.total_missions > 0
      ? (totalCostUsd / this.total_missions) * 1000
      : 0;

    return {
      total_missions: this.total_missions,
      gemini_calls: this.total_gemini_calls,
      call_rate: this.total_missions > 0 ? (this.total_gemini_calls / this.total_missions) : 0,
      input_tokens: this.total_input_tokens,
      output_tokens: this.total_output_tokens,
      estimated_total_cost_usd: parseFloat(totalCostUsd.toFixed(6)),
      estimated_cost_per_1000_missions_usd: parseFloat(costPer1kMissions.toFixed(4))
    };
  }
}
