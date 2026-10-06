import { GoogleGenAI } from '@google/genai';
import type { QueryIntent } from '../UniversalQueryModel';
import { SourceCapabilityRegistry, type RegisteredSource } from '../SourceCapabilityRegistry';
import { VerifiedSourceInspector } from './VerifiedSourceInspector';

export interface DiscoveredSourceReport {
  gemini_source_discovery_called: boolean;
  new_factual_sources_discovered: number;
  new_paginated_sources_discovered: number;
  candidate_sources: {
    source_domain: string;
    source_name: string;
    source_type: string;
    publicly_accessible: boolean;
    pagination_available: boolean;
    estimated_records: number;
    legal_access_mode: string;
    query_capabilities: string[];
    verification_status: string;
  }[];
}

export class GeminiSourceDiscoveryProvider {
  private ai: GoogleGenAI | null = null;

  constructor() {
    const apiKey = typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY : undefined;
    if (apiKey) {
      this.ai = new GoogleGenAI({ apiKey });
    }
  }

  /**
   * Discovers scalable factual public sources for a given intent.
   * Gemini identifies candidate sources, and VerifiedSourceInspector validates them.
   */
  public async discoverSources(intent: QueryIntent): Promise<DiscoveredSourceReport> {
    const report: DiscoveredSourceReport = {
      gemini_source_discovery_called: true,
      new_factual_sources_discovered: 0,
      new_paginated_sources_discovered: 0,
      candidate_sources: []
    };

    if (!this.ai) {
      return report;
    }

    const queryDesc = `${intent.profession || intent.occupation || intent.trade || intent.role_class || 'profesionales'} en ${intent.geography || 'Argentina'}`;

    const prompt = `Actúa como especialista en datos públicos abiertos y directorios institucionales de la República Argentina para YouApp Atlas.
El usuario busca a escala: "${queryDesc}".

Identifica entre 2 y 5 fuentes públicas REALES, verificables e institucionales (portales oficiales, registros profesionales, nóminas de personal del Estado, colegios profesionales, cámaras de comercio, directorios hospitalarios o universitarios) donde se pueda consultar o listar personas de este rubro.

Responde ÚNICAMENTE con un JSON array válido con esta estructura exacta:
[
  {
    "sourceId": string (ej: "SISA_REFEPS_SALUD", "CPACF_ABOGADOS", "FECOBA_COMERCIO", "CONICET_INVESTIGADORES"),
    "sourceName": string,
    "sourceDomain": string (ej: "sisa.msal.gov.ar", "cpacf.org.ar", "fecoba.org.ar", "conicet.gov.ar"),
    "url": string (URL HTTP/HTTPS real y válida que resuelva en el navegador),
    "sourceType": "GOVERNMENT_ROSTER" | "CHAMBER_OF_COMMERCE" | "PROFESSIONAL_COLLEGE" | "OPEN_DATASET" | "ACADEMIC_REGISTRY",
    "suggestedPagination": boolean,
    "estimatedRecords": number,
    "queryCapabilities": string[] (ej: ["SEARCH", "LIST", "PAGINATION"])
  }
]`;

    try {
      const geminiRes = await this.ai.models.generateContent({
        model: 'gemini-3.5-flash-lite',
        contents: prompt,
        config: {
          responseMimeType: 'application/json'
        }
      });

      const text = geminiRes.text || '[]';
      const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      const candidates: any[] = JSON.parse(cleaned);

      if (Array.isArray(candidates)) {
        for (const cand of candidates) {
          if (!cand.url || !cand.sourceDomain) continue;

          // Technical inspection by VerifiedSourceInspector
          const inspection = await VerifiedSourceInspector.inspect({
            source_id: cand.sourceId || cand.sourceDomain,
            source_name: cand.sourceName || cand.sourceDomain,
            url: cand.url,
            suggested_type: cand.sourceType,
            estimated_records: cand.estimatedRecords
          });

          const isPaginated = inspection.pagination_available || cand.suggestedPagination;
          
          report.candidate_sources.push({
            source_domain: cand.sourceDomain,
            source_name: cand.sourceName,
            source_type: cand.sourceType,
            publicly_accessible: inspection.public_access,
            pagination_available: isPaginated,
            estimated_records: cand.estimatedRecords || 1000,
            legal_access_mode: inspection.terms_or_access_restrictions ? 'RESTRICTED' : 'PUBLIC_PORTAL',
            query_capabilities: cand.queryCapabilities || ['SEARCH'],
            verification_status: inspection.status
          });

          if (inspection.status === 'LIVE') {
            report.new_factual_sources_discovered++;
            if (isPaginated) report.new_paginated_sources_discovered++;

            // Register in SourceCapabilityRegistry if not already present
            if (!SourceCapabilityRegistry.getSource(cand.sourceId)) {
              SourceCapabilityRegistry.register({
                source_id: cand.sourceId,
                source_name: cand.sourceName,
                source_type: cand.sourceType || 'OPEN_DATASET',
                domain: cand.sourceDomain,
                country: 'ARGENTINA',
                geography_scope: [intent.geography?.toUpperCase() || 'ARGENTINA'],
                work_scope: [intent.profession?.toUpperCase() || 'ALL'],
                supports_people: true,
                supports_search: true,
                supports_listing: true,
                supports_pagination: isPaginated,
                supports_known_total: false,
                reported_total: cand.estimatedRecords || null,
                retrievable_limit: 10000,
                rate_limit_rpm: 60,
                authentication_required: inspection.requires_authentication,
                verification_status: 'LIVE',
                endpoint_url: cand.url,
                verification_notes: inspection.inspection_notes
              });
            }
          }
        }
      }
    } catch (err: any) {
      console.warn('[GeminiSourceDiscovery] Error discovering sources:', err?.message || err);
    }

    return report;
  }
}
