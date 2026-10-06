/**
 * Atlas Semantic Fallback (Gemini Live Reasoning)
 * @server/services/industrial/AtlasSemanticFallback.ts
 *
 * Strict Architectural Invariants:
 * - Invoked only when AtlasSemanticCompiler encounters an ontology gap, low confidence (<0.85), or unknown terms.
 * - Uses gemini-3.5-flash-lite as primary (with gemini-3.8-flash as standby).
 * - NEVER prints or logs API keys.
 * - Understands colloquial Argentine commercial language (e.g. "boliche" -> night club / bar establishment).
 * - Distinguishes ambiguous intent (polysemy) from unknown concepts:
 *   If a concept is understood but has multiple plausible meanings, returns is_ambiguous = true, NEVER UNRESOLVED_CONCEPT.
 */

import type { UniversalRole, UniversalEntityType, UniversalAction, UniversalRelation, AtlasMissionIR } from './AtlasMissionIR.ts';

export interface GeminiCandidateUnderstanding {
  target_entity_type: UniversalEntityType;
  row_unit: string;
  role: UniversalRole;
  action: UniversalAction;
  relation: UniversalRelation;
  raw_object_phrase: string;
  concept_id?: string;
  is_ambiguous: boolean;
  clarification_prompt?: string;
  candidate_meanings?: string[];
  semantic_domain?: string;
  confidence: number;
}

export class AtlasSemanticFallback {
  private static instance: AtlasSemanticFallback;

  public static getInstance(): AtlasSemanticFallback {
    if (!this.instance) {
      this.instance = new AtlasSemanticFallback();
    }
    return this.instance;
  }

  public async resolveFallback(query: string, currentIR?: AtlasMissionIR): Promise<GeminiCandidateUnderstanding | null> {
    const cleanQuery = (query || '').trim();
    const apiKey = process.env.GEMINI_API_KEY;
    console.log('[AtlasSemanticFallback] Invoked for query:', cleanQuery, '| Key present:', Boolean(apiKey));
    if (!apiKey) {
      return null;
    }

    if (!cleanQuery) return null;

    const promptText = `Eres el compilador semántico fallback de Atlas B2B (Argentina).
Analiza la siguiente consulta de búsqueda B2B o comercial: "${cleanQuery}".

Instrucciones:
1. Identifica qué tipo de entidad busca el usuario (Empresa, Establecimiento a la calle/local, Profesional independiente, Institución).
2. Para términos coloquiales argentinos como "boliche":
   - "boliche" habitualmente significa discoteca / club nocturno / local bailable, o un bar/café pequeño tradicional.
   - En este caso, el lenguaje está COMPRENDIDO, pero es POLISÉMICO/AMBIGUO:
     "is_ambiguous": true,
     "target_entity_type": "ESTABLISHMENT",
     "row_unit": "ESTABLISHMENT",
     "role": "SERVICE_PROVIDER",
     "action": "PROVIDE_SERVICE",
     "relation": "ESTABLISHMENT_SERVICE",
     "raw_object_phrase": "boliche",
     "concept_id": null,
     "clarification_prompt": "¿Te referís a discotecas y locales bailables, o a bares y locales gastronómicos?",
     "candidate_meanings": ["Discoteca / Club nocturno", "Bar / Local gastronómico"]
3. Para consultas comerciales resueltas sin ambigüedad (ej. fabricantes, comercios, talleres, o acepciones desambiguadas):
   - "is_ambiguous": false,
   - determina target_entity_type, row_unit, role, action, relation correspondientes.
   - Si es "Discoteca / Club nocturno": "concept_id": "CONCEPT_NIGHTCLUB_DISCO", "semantic_domain": "Entretenimiento y Vida Nocturna", "role": "SERVICE_PROVIDER", "relation": "ESTABLISHMENT_SERVICE"
   - Si es "Bar / Local gastronómico": "concept_id": "CONCEPT_BAR_GASTRONOMICO", "semantic_domain": "Gastronomía y Hospitalidad", "role": "SERVICE_PROVIDER", "relation": "ESTABLISHMENT_SERVICE"

Devuelve estrictamente un JSON con este esquema:
{
  "target_entity_type": "COMPANY" | "ESTABLISHMENT" | "PERSON" | "INSTITUTION",
  "row_unit": "COMPANY" | "ESTABLISHMENT" | "PERSON" | "INSTITUTION" | "PUBLIC_EMAIL_CONTACT",
  "role": "MANUFACTURER" | "SELLER" | "RETAILER" | "BUYER" | "SUPPLIER" | "DISTRIBUTOR" | "IMPORTER" | "EXPORTER" | "PROFESSIONAL" | "JOURNALIST" | "SERVICE_PROVIDER" | "GENERAL_ENTITY",
  "action": "MANUFACTURE" | "SELL" | "RETAIL" | "BUY" | "SUPPLY" | "DISTRIBUTE" | "IMPORT" | "EXPORT" | "PROVIDE_SERVICE" | "WRITE_ABOUT" | "GENERAL_ACTION",
  "relation": "MANUFACTURES" | "SELLS" | "BUYS" | "SUPPLIES_TO" | "DISTRIBUTES" | "IMPORTS" | "EXPORTS" | "PROVIDES_SERVICE" | "WORKS_FOR" | "WRITES_ABOUT" | "ESTABLISHMENT_SERVICE" | "GENERAL_RELATION",
  "raw_object_phrase": string,
  "concept_id": string | null,
  "is_ambiguous": boolean,
  "clarification_prompt": string | null,
  "candidate_meanings": string[],
  "semantic_domain": string,
  "confidence": number
}`;

    const models = ['gemini-3.5-flash-lite', 'gemini-3.8-flash'];
    for (const model of models) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 6000);

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
          const textPart = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (textPart) {
            const parsed = JSON.parse(textPart);
            return {
              target_entity_type: parsed.target_entity_type || 'COMPANY',
              row_unit: parsed.row_unit || 'COMPANY',
              role: parsed.role || 'GENERAL_ENTITY',
              action: parsed.action || 'GENERAL_ACTION',
              relation: parsed.relation || 'GENERAL_RELATION',
              raw_object_phrase: parsed.raw_object_phrase || cleanQuery,
              is_ambiguous: Boolean(parsed.is_ambiguous),
              clarification_prompt: parsed.clarification_prompt || undefined,
              candidate_meanings: Array.isArray(parsed.candidate_meanings) ? parsed.candidate_meanings : [],
              semantic_domain: parsed.semantic_domain || 'RESOLVED_COMMERCIAL',
              confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.90
            };
          }
        }
      } catch (err: any) {
        // Continue to standby model
      }
    }

    return null;
  }
}
