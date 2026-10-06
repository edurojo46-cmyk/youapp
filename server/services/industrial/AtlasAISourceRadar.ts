/**
 * ATLAS AI SOURCE RADAR V1
 * Module: AtlasAISourceRadar.ts
 * 
 * Master Intelligence Module for Autonomous Source Discovery:
 * - Decides where to throw the next net when:
 *   OBJECTIVE_GAP > 0 AND CURRENT_SOURCE_PLAN_EXHAUSTED = TRUE AND NO_SUITABLE_EXECUTABLE_KNOWN_SOURCE = TRUE.
 * - STRICT ONE-CALL BUDGET:
 *   MAX_GEMINI_CALLS_PER_DIFFICULT_MISSION = 1.
 *   Reuses source hypotheses from AtlasOneCallMissionIntelligence if available.
 *   Never calls AI per row, per candidate, or per source.
 * - RULE: AI UNDERSTANDS. PUBLIC SOURCES PROVE.
 *   AI proposes hypotheses. Atlas validates. SOURCE_VALIDATED = TRUE is NEVER returned by AI.
 */

import pg from 'pg';
import { dbPool } from '../../db.ts';
import { AtlasOneCallMissionIntelligence, type OneCallMissionIntelligenceResult } from './AtlasOneCallMissionIntelligence.ts';
import { SourceKnowledgeMap } from '../../../src/lib/atlasPathfinder/sourceIntelligence/SourceKnowledgeMap.ts';
import { AtlasConceptRegistry } from './AtlasConceptRegistry.ts';

export interface SourceHypothesis {
  hypothesis_id: string;
  source_name: string;
  source_family: string;
  source_type: 'OPEN_DATA_PORTAL' | 'PUBLIC_REGISTRY' | 'CHAMBER_DIRECTORY' | 'SECTORAL_ASSOCIATION' | 'PUBLIC_DIRECTORY' | 'ACADEMIC_REPOSITORY' | 'SPATIAL_DATASET';
  why_relevant: string;
  expected_entity_type: string;
  expected_row_unit: string;
  concept_fit: number; // 0.0 - 1.0
  geography_fit: string;
  expected_evidence: string[];
  possible_public_url?: string;
  possible_access_method: 'CKAN' | 'BULK_CSV' | 'JSON_FEED' | 'REST_API' | 'PAGINATED_HTTP' | 'HTML_TABLE' | 'WEB_SEARCH';
  suggested_search_queries: string[];
  connector_family: 'CKAN_API' | 'OPEN_DATA_CSV' | 'OPEN_DATA_JSON' | 'PUBLIC_REGISTRY_API' | 'PAGINATED_DIRECTORY' | 'HTML_TABLE' | 'WEB_SEARCH_DISCOVERY' | 'PUBLIC_WEB_EVIDENCE';
  confidence: number;
}

export interface AISourceRadarContext {
  raw_objective: string;
  concept: string;
  row_unit: string;
  geography: string;
  objective_gap: number;
  sources_tried: string[];
  yield_summary?: Record<string, number>;
  source_failures?: string[];
  cached_intelligence?: OneCallMissionIntelligenceResult;
}

export interface AISourceRadarResult {
  triggered: boolean;
  gemini_called: boolean;
  reused_previous_intelligence: boolean;
  hypotheses: SourceHypothesis[];
  skipped_failed_hypotheses_count: number;
  trigger_reason?: string;
}

export class AtlasAISourceRadar {
  private static instance: AtlasAISourceRadar;
  private db: pg.Pool;

  constructor(pool: pg.Pool = dbPool) {
    this.db = pool;
  }

  public static getInstance(pool?: pg.Pool): AtlasAISourceRadar {
    if (!this.instance) {
      this.instance = new AtlasAISourceRadar(pool || dbPool);
    }
    return this.instance;
  }

  /**
   * Evaluates if AI Source Radar should be triggered.
   * Invariant:
   * OBJECTIVE_GAP > 0 AND CURRENT_SOURCE_PLAN_EXHAUSTED = TRUE AND NO_SUITABLE_EXECUTABLE_KNOWN_SOURCE = TRUE
   */
  public async shouldTrigger(params: {
    objective_gap: number;
    current_source_plan_exhausted: boolean;
    executable_known_sources_count: number;
  }): Promise<boolean> {
    if (params.objective_gap <= 0) return false;
    if (!params.current_source_plan_exhausted) return false;
    if (params.executable_known_sources_count > 0) return false;
    return true;
  }

  /**
   * Generates strategic source hypotheses respecting the strict One-Call budget.
   */
  public async generateSourceHypotheses(context: AISourceRadarContext): Promise<AISourceRadarResult> {
    const conceptLower = (context.concept || '').toLowerCase();
    const geoLower = (context.geography || 'Argentina').toLowerCase();

    // 1. Check failed hypothesis memory to prevent repeating dead ends
    const failedMemRes = await this.db.query(`
      SELECT source_name, domain, failure_reason
      FROM public.atlas_failed_source_hypotheses
      WHERE LOWER(query_concept) = $1 AND LOWER(geography) = $2;
    `, [conceptLower, geoLower]).catch(() => ({ rows: [] }));

    const failedSourceNames = new Set(failedMemRes.rows.map((r: any) => (r.source_name || '').toLowerCase()));

    // 2. SECOND-USE ZERO AI CHECK: Check if atlas_source_knowledge_map already has learned sources for this concept!
    const conceptReg = AtlasConceptRegistry.getInstance();
    const matchedConcepts = conceptReg.findMatchingConcepts(context.raw_objective || context.concept);
    const conceptObj = conceptReg.getConcept(context.concept) || matchedConcepts[0]?.concept;

    const termSet = new Set<string>([
      conceptLower,
      conceptObj?.concept_id?.toLowerCase().replace(/_/g, ' '),
      conceptObj?.canonical_name?.toLowerCase(),
      ...(conceptObj?.synonyms || []).map(s => s.toLowerCase()),
      ...(conceptObj?.categories || []).map(s => s.toLowerCase().replace(/_/g, ' ')),
      ...(conceptObj?.services || []).map(s => s.toLowerCase().replace(/_/g, ' ')),
      context.raw_objective?.toLowerCase()
    ].filter(Boolean) as string[]);

    for (const m of matchedConcepts.slice(0, 3)) {
      termSet.add(m.concept.concept_id.toLowerCase().replace(/_/g, ' '));
      termSet.add(m.concept.canonical_name.toLowerCase());
      for (const syn of m.concept.synonyms || []) termSet.add(syn.toLowerCase());
    }

    const candidateTerms = Array.from(termSet)
      .map(t => t.trim())
      .filter(t => t.length >= 3 && !['argentina', 'buenos', 'aires', 'para', 'servicios'].includes(t));

    const termConditions = candidateTerms.map((_, idx) => `
      source_name ILIKE $${idx + 1}
      OR canonical_url ILIKE $${idx + 1}
      OR field_telemetry::text ILIKE $${idx + 1}
    `).join(' OR ');

    const learnedRes = await this.db.query(`
      SELECT source_id, source_name, source_family, canonical_url, supported_motor_template,
             quality_score, field_telemetry
      FROM public.atlas_source_knowledge_map
      WHERE can_produce_entity_rows = 'TRUE'
        AND current_status IN ('CANARY', 'PROMOTED', 'ACTIVE')
        AND (${termConditions.length > 0 ? termConditions : 'FALSE'});
    `, candidateTerms.map(t => `%${t}%`)).catch(() => ({ rows: [] }));

    if (learnedRes.rows.length > 0) {
      console.log(`[AtlasAISourceRadar] SECOND-USE ZERO-AI: Found ${learnedRes.rows.length} previously learned sources in SSOT for "${conceptLower}". GEMINI CALLS = 0.`);
      const hypotheses: SourceHypothesis[] = [];
      for (const r of learnedRes.rows) {
        hypotheses.push({
          hypothesis_id: `HYP_LEARNED_${r.source_id}`,
          source_name: r.source_name,
          source_family: r.source_family || 'PAGINATED_DIRECTORY',
          source_type: 'SECTORAL_ASSOCIATION',
          why_relevant: `Fuente previamente validada y aprendida en SSOT para ${context.concept}`,
          expected_entity_type: context.row_unit || 'ESTABLISHMENT',
          expected_row_unit: context.row_unit || 'ESTABLISHMENT',
          concept_fit: 0.95,
          geography_fit: context.geography,
          expected_evidence: ['COMMERCIAL_NAME', 'ADDRESS'],
          possible_public_url: r.canonical_url,
          possible_access_method: 'PAGINATED_HTTP',
          suggested_search_queries: [`"${context.concept}" ${context.geography}`],
          connector_family: this.mapFamilyToConnector(r.source_family),
          confidence: Number(r.quality_score || 0.95)
        });
      }

      return {
        triggered: true,
        gemini_called: false,
        reused_previous_intelligence: true,
        hypotheses,
        skipped_failed_hypotheses_count: 0,
        trigger_reason: 'SECOND_USE_SSOT_KNOWLEDGE_REUSED'
      };
    }

    // 3. Budget Check: If cached intelligence from AtlasOneCallMissionIntelligence is present, REUSE IT
    if (context.cached_intelligence && context.cached_intelligence.primary?.source_hypotheses?.length > 0) {
      console.log(`[AtlasAISourceRadar] Reusing source hypotheses from cached One-Call Intelligence. GEMINI CALLS = 0`);
      const mappedHypotheses: SourceHypothesis[] = [];
      let skippedCount = 0;

      for (const h of context.cached_intelligence.primary.source_hypotheses) {
        if (failedSourceNames.has((h.source_family || '').toLowerCase())) {
          skippedCount++;
          continue;
        }

        const connectorFam = this.mapFamilyToConnector(h.source_family);
        mappedHypotheses.push({
          hypothesis_id: `HYP_${Buffer.from(h.source_family + conceptLower).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)}`,
          source_name: h.source_family,
          source_family: h.source_family,
          source_type: this.inferSourceType(h.source_family),
          why_relevant: `Sugerido por inteligencia de misión para ${context.concept}`,
          expected_entity_type: context.row_unit || 'ESTABLISHMENT',
          expected_row_unit: context.row_unit || 'ESTABLISHMENT',
          concept_fit: h.confidence || 0.85,
          geography_fit: h.geographic_fit || context.geography,
          expected_evidence: h.expected_evidence || ['COMMERCIAL_NAME', 'ADDRESS'],
          possible_access_method: this.inferAccessMethod(h.source_family),
          suggested_search_queries: [
            `"${context.concept}" ${context.geography}`,
            `directorio ${context.concept} ${context.geography}`,
            `camara ${context.concept} ${context.geography}`
          ],
          connector_family: connectorFam,
          confidence: h.confidence || 0.85
        });
      }

      return {
        triggered: true,
        gemini_called: false,
        reused_previous_intelligence: true,
        hypotheses: mappedHypotheses,
        skipped_failed_hypotheses_count: skippedCount,
        trigger_reason: 'REUSED_ONECALL_CACHE'
      };
    }

    // 3. Fallback: If One-Call was NOT called earlier in this mission (e.g. concept was known but local sources ran out),
    // we use the ONE allowed Gemini call now.
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      // Deterministic rule-based hypotheses when offline or no API key
      return {
        triggered: true,
        gemini_called: false,
        reused_previous_intelligence: false,
        hypotheses: this.generateDeterministicHypotheses(context, failedSourceNames),
        skipped_failed_hypotheses_count: 0,
        trigger_reason: 'OFFLINE_STRATEGIC_RULE_RADAR'
      };
    }

    const promptText = `Actúas como Atlas AI Source Radar (Argentina).
El usuario busca: "${context.raw_objective}" (Concepto: ${context.concept}, Geografía: ${context.geography}, Grano: ${context.row_unit}).
Fuentes ya ejecutadas que se agotaron: ${context.sources_tried.join(', ') || 'Ninguna'}.
Gap pendiente: ${context.objective_gap} entidades.

Tu función es PROPONER HIPÓTESIS ESTRATÉGICAS sobre DÓNDE TIRAR LA PRÓXIMA RED.
NO evalúes filas. Propón entre 2 y 4 FUENTES PÚBLICAS O CATEGORÍAS DE FUENTES (cámaras sectoriales, portales municipales de datos abiertos CKAN, registros públicos o directorios especializados).

FORMATO JSON OBLIGATORIO:
{
  "hypotheses": [
    {
      "source_name": string,
      "source_family": string,
      "source_type": "OPEN_DATA_PORTAL" | "PUBLIC_REGISTRY" | "CHAMBER_DIRECTORY" | "SECTORAL_ASSOCIATION" | "PUBLIC_DIRECTORY",
      "why_relevant": string,
      "expected_entity_type": string,
      "expected_row_unit": string,
      "concept_fit": number,
      "geography_fit": string,
      "expected_evidence": string[],
      "possible_public_url": string,
      "possible_access_method": "CKAN" | "BULK_CSV" | "JSON_FEED" | "REST_API" | "PAGINATED_HTTP" | "HTML_TABLE" | "WEB_SEARCH",
      "suggested_search_queries": string[],
      "connector_family": "CKAN_API" | "OPEN_DATA_CSV" | "OPEN_DATA_JSON" | "PUBLIC_REGISTRY_API" | "PAGINATED_DIRECTORY" | "HTML_TABLE" | "WEB_SEARCH_DISCOVERY",
      "confidence": number
    }
  ]
}`;

    const models = ['gemini-3.5-flash-lite', 'gemini-3.8-flash'];
    for (const model of models) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12000);

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }],
            generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }
          }),
          signal: controller.signal
        });
        clearTimeout(timer);

        if (res.ok) {
          const data = await res.json() as any;
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            const parsed = JSON.parse(text);
            const rawHypotheses = Array.isArray(parsed.hypotheses) ? parsed.hypotheses : [];
            const filtered: SourceHypothesis[] = [];
            let skipped = 0;

            for (const h of rawHypotheses) {
              if (failedSourceNames.has((h.source_name || '').toLowerCase())) {
                skipped++;
                continue;
              }
              filtered.push({
                hypothesis_id: `HYP_${Buffer.from(h.source_name + context.concept).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12)}`,
                source_name: h.source_name,
                source_family: h.source_family || 'GENERIC_DIRECTORY',
                source_type: h.source_type || 'CHAMBER_DIRECTORY',
                why_relevant: h.why_relevant || 'Propuesta por Source Radar',
                expected_entity_type: context.row_unit,
                expected_row_unit: context.row_unit,
                concept_fit: Math.min(1.0, Math.max(0.1, Number(h.concept_fit) || 0.8)),
                geography_fit: h.geography_fit || context.geography,
                expected_evidence: h.expected_evidence || ['COMMERCIAL_NAME'],
                possible_public_url: h.possible_public_url,
                possible_access_method: h.possible_access_method || 'WEB_SEARCH',
                suggested_search_queries: Array.isArray(h.suggested_search_queries) ? h.suggested_search_queries : [
                  `"${context.concept}" ${context.geography}`,
                  `directorio ${context.concept} ${context.geography}`
                ],
                connector_family: h.connector_family || 'WEB_SEARCH_DISCOVERY',
                confidence: Math.min(1.0, Math.max(0.1, Number(h.confidence) || 0.8))
              });
            }

            return {
              triggered: true,
              gemini_called: true,
              reused_previous_intelligence: false,
              hypotheses: filtered,
              skipped_failed_hypotheses_count: skipped,
              trigger_reason: 'GEMINI_SOURCE_RADAR_RESOLVED'
            };
          }
        }
      } catch {
        // Fallback to next model or deterministic
      }
    }

    return {
      triggered: true,
      gemini_called: false,
      reused_previous_intelligence: false,
      hypotheses: this.generateDeterministicHypotheses(context, failedSourceNames),
      skipped_failed_hypotheses_count: 0,
      trigger_reason: 'FALLBACK_STRATEGIC_RULE_RADAR'
    };
  }

  private mapFamilyToConnector(family: string): SourceHypothesis['connector_family'] {
    const f = (family || '').toUpperCase();
    if (f.includes('CKAN') || f.includes('DATOS_GOB')) return 'CKAN_API';
    if (f.includes('CSV')) return 'OPEN_DATA_CSV';
    if (f.includes('JSON')) return 'OPEN_DATA_JSON';
    if (f.includes('REGISTR') || f.includes('OFICIAL')) return 'PUBLIC_REGISTRY_API';
    if (f.includes('TABLE')) return 'HTML_TABLE';
    if (f.includes('DIRECTORY') || f.includes('CAMARA')) return 'PAGINATED_DIRECTORY';
    return 'WEB_SEARCH_DISCOVERY';
  }

  private inferSourceType(family: string): SourceHypothesis['source_type'] {
    const f = (family || '').toUpperCase();
    if (f.includes('CKAN') || f.includes('DATA')) return 'OPEN_DATA_PORTAL';
    if (f.includes('REGISTR')) return 'PUBLIC_REGISTRY';
    if (f.includes('CAMARA') || f.includes('CHAMBER')) return 'CHAMBER_DIRECTORY';
    if (f.includes('ASOC')) return 'SECTORAL_ASSOCIATION';
    return 'PUBLIC_DIRECTORY';
  }

  private inferAccessMethod(family: string): SourceHypothesis['possible_access_method'] {
    const f = (family || '').toUpperCase();
    if (f.includes('CKAN')) return 'CKAN';
    if (f.includes('CSV')) return 'BULK_CSV';
    if (f.includes('JSON')) return 'JSON_FEED';
    if (f.includes('API') || f.includes('REGISTR')) return 'REST_API';
    if (f.includes('DIRECTORY')) return 'PAGINATED_HTTP';
    return 'WEB_SEARCH';
  }

  private generateDeterministicHypotheses(context: AISourceRadarContext, failedNames: Set<string>): SourceHypothesis[] {
    const hypotheses: SourceHypothesis[] = [];
    const cleanConcept = context.concept.toLowerCase();
    const cleanGeo = context.geography;
    const isProfessional = context.row_unit === 'PERSON' || 
      /\b(abogad|letrad|contador|arquitect|medico|ingenier|escriban|psicolog)\b/i.test(cleanConcept) ||
      /\b(abogad|letrad|contador|arquitect|medico|ingenier|escriban|psicolog)\b/i.test(context.raw_objective || '');

    // Professional Registry Family (Generic for CPACF, CPCECABA, CPAU, REFEPS, etc.)
    if (isProfessional && !failedNames.has('colegio_profesional_registro')) {
      let regName = `Colegio Profesional y Registro de Matrícula Oficial (${cleanConcept} - ${cleanGeo})`;
      let regUrl = '';
      let queries = [
        `"colegio" "${cleanConcept}" "${cleanGeo}" padron matriculados`,
        `guia publica de "${cleanConcept}" "${cleanGeo}"`,
        `registro oficial matricula "${cleanConcept}" "${cleanGeo}"`
      ];

      if (cleanConcept.includes('abogad') || cleanConcept.includes('lawyer')) {
        regName = 'Colegio Público de la Abogacía de la Capital Federal (CPACF)';
        regUrl = 'https://www.cpacf.org.ar/guia-de-abogados';
        queries = [
          'colegio publico de la abogacia capital federal guia abogados',
          'cpacf padron matriculados capital federal',
          'site:cpacf.org.ar guia de abogados'
        ];
      } else if (cleanConcept.includes('contador') || cleanConcept.includes('accountant')) {
        regName = 'Consejo Profesional de Ciencias Económicas (CPCECABA)';
        regUrl = 'https://www.consejocaba.org.ar/matriculados';
        queries = [
          'consejo profesional de ciencias economicas caba matriculados',
          'site:consejocaba.org.ar padron matriculados'
        ];
      } else if (cleanConcept.includes('arquitect') || cleanConcept.includes('architect')) {
        regName = 'Consejo Profesional de Arquitectura y Urbanismo (CPAU)';
        regUrl = 'https://www.cpau.org/guia-de-matriculados';
        queries = [
          'consejo profesional de arquitectura y urbanismo cpau matriculados',
          'site:cpau.org guia de matriculados'
        ];
      }

      hypotheses.push({
        hypothesis_id: `HYP_PROF_REG_${Buffer.from(cleanConcept).toString('base64').slice(0, 8)}`,
        source_name: regName,
        source_family: 'PROFESSIONAL_REGISTRY',
        source_type: 'PUBLIC_REGISTRY',
        why_relevant: `Registro público oficial de profesionales matriculados y habilitados para ${context.concept} en ${cleanGeo}`,
        expected_entity_type: 'PERSON',
        expected_row_unit: 'PERSON',
        concept_fit: 0.98,
        geography_fit: cleanGeo,
        expected_evidence: ['PERSON_IDENTITY', 'PROFESSIONAL_LICENSE', 'REGISTRY_RECORD'],
        possible_public_url: regUrl || undefined,
        possible_access_method: 'PAGINATED_HTTP',
        suggested_search_queries: queries,
        connector_family: 'PAGINATED_DIRECTORY',
        confidence: 0.96
      });
    }

    // Hypothesis 1: Open Data Municipal / Provincial Catalog
    if (!failedNames.has('datos_abiertos_municipales')) {
      hypotheses.push({
        hypothesis_id: `HYP_OPEN_DATA_${Buffer.from(cleanConcept).toString('base64').slice(0, 8)}`,
        source_name: `Catálogo de Datos Abiertos (${cleanGeo})`,
        source_family: 'DATOS_GOB_AR',
        source_type: 'OPEN_DATA_PORTAL',
        why_relevant: `Búsqueda de datasets públicos municipales o provinciales para ${context.concept}`,
        expected_entity_type: context.row_unit,
        expected_row_unit: context.row_unit,
        concept_fit: 0.85,
        geography_fit: cleanGeo,
        expected_evidence: ['COMMERCIAL_NAME', 'GEOLOCATION'],
        possible_access_method: 'CKAN',
        suggested_search_queries: [
          `site:datos.gob.ar ${cleanConcept}`,
          `site:catalogo.datos.gba.gob.ar ${cleanConcept}`,
          `datos abiertos "${cleanConcept}" "${cleanGeo}"`
        ],
        connector_family: 'CKAN_API',
        confidence: 0.82
      });
    }

    // Hypothesis 2: Cámara de Comercio / Directorio Sectorial
    if (!failedNames.has('camaras_comercio_sectoriales')) {
      hypotheses.push({
        hypothesis_id: `HYP_CHAMBER_${Buffer.from(cleanConcept).toString('base64').slice(0, 8)}`,
        source_name: `Cámaras de Comercio y Guías Comerciales (${cleanGeo})`,
        source_family: 'PAGINATED_DIRECTORY',
        source_type: 'CHAMBER_DIRECTORY',
        why_relevant: `Padrón de asociados y comercios registrados del rubro ${context.concept} en ${cleanGeo}`,
        expected_entity_type: context.row_unit,
        expected_row_unit: context.row_unit,
        concept_fit: 0.88,
        geography_fit: cleanGeo,
        expected_evidence: ['COMMERCIAL_NAME', 'ADDRESS', 'ACTIVITY_PROOF'],
        possible_access_method: 'PAGINATED_HTTP',
        suggested_search_queries: [
          `"camara" "${cleanConcept}" "${cleanGeo}"`,
          `"guia comercial" "${cleanConcept}" "${cleanGeo}"`,
          `asociacion productores "${cleanConcept}" "${cleanGeo}"`
        ],
        connector_family: 'PAGINATED_DIRECTORY',
        confidence: 0.80
      });
    }

    // Hypothesis 3: Radar de Búsqueda Web Dirigida
    hypotheses.push({
      hypothesis_id: `HYP_WEB_RADAR_${Buffer.from(cleanConcept).toString('base64').slice(0, 8)}`,
      source_name: `Radar Web Especializado: ${cleanConcept} en ${cleanGeo}`,
      source_family: 'WEB_SEARCH_DISCOVERY',
      source_type: 'PUBLIC_DIRECTORY',
      why_relevant: `Búsqueda focalizada para descubrir portales institucionales y comercios no indexados en OSM`,
      expected_entity_type: context.row_unit,
      expected_row_unit: context.row_unit,
      concept_fit: 0.80,
      geography_fit: cleanGeo,
      expected_evidence: ['PUBLIC_WEB_RECORD', 'CONTACT_PAGE'],
      possible_access_method: 'WEB_SEARCH',
      suggested_search_queries: [
        `"${cleanConcept}" "${cleanGeo}"`,
        `locales de "${cleanConcept}" "${cleanGeo}"`,
        `site:.com.ar "${cleanConcept}" "${cleanGeo}"`
      ],
      connector_family: 'WEB_SEARCH_DISCOVERY',
      confidence: 0.78
    });

    return hypotheses;
  }
}
