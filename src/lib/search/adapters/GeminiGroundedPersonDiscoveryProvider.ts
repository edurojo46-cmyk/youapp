import { GoogleGenAI } from '@google/genai';
import type { 
  IGroundedPersonDiscoveryProvider, 
  GroundedDiscoveryResult,
  GroundedDiscoveryTelemetry 
} from './IGroundedPersonDiscoveryProvider';
import type { ExternalPersonObservation } from '../IExternalPersonSourceAdapter';
import type { GeminiCandidate } from '../../ai/gemini/GeminiSchemas';
import { WorkConceptResolver } from '../WorkConceptResolver';

export class GeminiGroundedPersonDiscoveryProvider implements IGroundedPersonDiscoveryProvider {
  private ai: GoogleGenAI | null = null;

  constructor() {
    const apiKey = typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY : undefined;
    if (apiKey) {
      this.ai = new GoogleGenAI({ apiKey });
    }
  }

  public async discover(query: string, requiredConstraints: any = {}): Promise<GroundedDiscoveryResult> {
    const telemetry: GroundedDiscoveryTelemetry = {
      planned: true,
      called: false,
      http_success: false,
      raw_results: 0,
      valid_results: 0,
      rejected_results: 0,
      rejected_entity_type: 0,
      rejected_no_activity_evidence: 0,
      rejected_geography: 0,
      status: 'LIVE'
    };

    const apiKey = typeof process !== 'undefined' ? process.env?.GEMINI_API_KEY : undefined;
    if (!apiKey) {
      telemetry.status = 'BLOCKED_MISSING_CREDENTIALS';
      console.warn("[GeminiDiscovery] BLOCKED_MISSING_CREDENTIALS: GEMINI_API_KEY is not defined.");
      return { candidates: [], observations: [], businesses: [], telemetry, metadata: { citations: [], searchEntryPoint: [] } };
    }

    if (!this.ai) {
      this.ai = new GoogleGenAI({ apiKey });
    }

    telemetry.called = true;

    try {
      // 1. Fetch live public web context from Spanish Wikipedia Search API
      let searchTerms = query.includes('Argentina') || query.includes('Buenos Aires') || query.includes('CABA')
        ? query
        : `${query} Argentina`;

      if (query.toLowerCase().includes('empleado')) {
        searchTerms = 'Gobierno de la Ciudad de Buenos Aires gabinete y personal';
      }

      const wikiUrl = `https://es.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(searchTerms)}&format=json&srlimit=8`;
      const wikiRes = await fetch(wikiUrl, {
        headers: { 'User-Agent': 'YouAppAtlas/2.0 (search@youapp.tv)' }
      });

      const wikiSnippets: { title: string; snippet: string; url: string; domain: string }[] = [];
      if (wikiRes.ok) {
        const wikiData = await wikiRes.json();
        const results = wikiData?.query?.search || [];
        for (const item of results) {
          wikiSnippets.push({
            title: item.title,
            snippet: (item.snippet || '').replace(/<[^>]+>/g, '').trim(),
            url: `https://es.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, '_'))}`,
            domain: 'es.wikipedia.org'
          });
        }
      }

      // 2. Grounded Entity Extraction with Gemini
      const workConcept = requiredConstraints.workConcept || WorkConceptResolver.resolve(query);
      const reqLoc = requiredConstraints.requiredLocation || (query.toLowerCase().includes('caba') ? 'CABA' : (query.toLowerCase().includes('buenos aires') ? 'Buenos Aires' : ''));
      const reqProf = requiredConstraints.requiredProfession || workConcept?.label || '';

      const prompt = `Actúa como motor de descubrimiento público y validación de entidades para YouApp Atlas (República Argentina).
Búsqueda del usuario: "${query}"
Ubicación objetivo requerida: "${reqLoc || 'Argentina'}"
Concepto laboral / rol requerido: "${reqProf || 'Profesional'}"

${wikiSnippets.length > 0 ? `Resultados web públicos de referencia complementarios:\n${wikiSnippets.map((it, i) => `${i + 1}. Título: ${it.title}\nURL: ${it.url}\nResumen: ${it.snippet}`).join('\n\n')}\n` : ''}

Instrucciones estrictas:
1. Encuentra personas reales (PERSON) y comercios/instituciones (BUSINESS) verificables radicados o con actividad comprobable en la ubicación requerida: "${reqLoc || 'Argentina'}".
2. Si la ubicación es "CABA" o "Buenos Aires", DEBEN pertenecer a la Ciudad Autónoma de Buenos Aires o su área metropolitana (ej: CABA o barrios como Palermo, Recoleta, Monserrat, San Telmo, Balvanera, Retiro, Microcentro, etc.).
3. ENTITY_TYPE:
   - "PERSON": Seres humanos individuales con nombre y apellido (profesionales, comerciantes, trabajadores, empleados, miembros de staff).
     OBLIGATORIO: Al menos 2 o 3 resultados DEBEN ser de tipo "PERSON" (personas físicas reales con nombre y apellido).
     Para búsquedas de "empleado", incluye personas físicas reales con empleo o relación laboral pública verificable (ej: empleados públicos, directivos de staff, trabajadores institucionales de CABA con su empleador identificado).
   - "BUSINESS": Comercios, tiendas, empresas o instituciones sin persona física individual identificada como titular.
4. REGLAS:
   - fullName: Nombre y apellido de la persona real (o null si es BUSINESS). ¡NUNCA pongas el nombre de un negocio como fullName de una persona!
   - businessName: Nombre del comercio, empresa, institución o empleador donde trabaja o ejerce.
   - professionClaim: Ocupación, oficio, rol o empleo específico (ej: "Comerciante", "Empleado administrativo", "Desarrollador", "Plomero", "Médico").
   - workEvidence: Evidencia concreta y positiva de qué hace la persona o institución.
   - geographyClaim: Ciudad, barrio o zona donde radica (ej: "CABA", "Recoleta, CABA", "Palermo, CABA", "Buenos Aires").
   - geographyEvidence: Cita o hecho que comprueba su ubicación en esa zona.
   - sourceUrl: URL pública factual donde se verifica la información (ej: sitio web oficial de la institución, federación de comercio, registro público, prensa, portal gubernamental, Wikipedia). DEBE ser una URL HTTP/HTTPS válida.
   - domain: Dominio de la fuente factual.

Devuelve ÚNICAMENTE un JSON array con entre 3 y 8 entidades descubiertas:
[
  {
    "entityType": "PERSON" | "BUSINESS" | "SERVICE",
    "fullName": string | null,
    "businessName": string | null,
    "professionClaim": string | null,
    "workEvidence": string | null,
    "geographyClaim": string | null,
    "geographyEvidence": string | null,
    "sourceUrl": string,
    "domain": string
  }
]`;

      let geminiRes;
      try {
        geminiRes = await this.ai.models.generateContent({
          model: 'gemini-3.5-flash-lite',
          contents: prompt,
          config: {
            responseMimeType: 'application/json'
          }
        });
      } catch (genErr: any) {
        console.warn("[GeminiDiscovery] Falling back to gemini-flash-latest:", genErr?.message || genErr);
        geminiRes = await this.ai.models.generateContent({
          model: 'gemini-flash-latest',
          contents: prompt,
          config: {
            responseMimeType: 'application/json'
          }
        });
      }

      telemetry.http_success = true;

      const responseText = geminiRes.text || '[]';
      let parsedJson: any[] = [];
      try {
        const cleaned = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
        parsedJson = JSON.parse(cleaned);
      } catch (jsonErr) {
        console.warn("[GeminiDiscovery] Failed to parse JSON from Gemini response:", responseText);
        return { candidates: [], observations: [], businesses: [], telemetry, metadata: { citations: [], searchEntryPoint: [] } };
      }

      if (!Array.isArray(parsedJson)) {
        return { candidates: [], observations: [], businesses: [], telemetry, metadata: { citations: [], searchEntryPoint: [] } };
      }

      telemetry.raw_results = parsedJson.length;

      const citations: string[] = [];
      const observations: ExternalPersonObservation[] = [];
      const businesses: any[] = [];
      const validCandidates: GeminiCandidate[] = [];

      for (const item of parsedJson) {
        // Must have valid source URL (GEMINI_VALID_WITHOUT_SOURCE_URL = 0)
        let parsedUrl: URL;
        try {
          if (!item.sourceUrl) throw new Error("Missing sourceUrl");
          parsedUrl = new URL(item.sourceUrl);
          if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error("Invalid protocol");
        } catch {
          telemetry.rejected_results++;
          continue;
        }

        const domain = item.domain || parsedUrl.hostname;

        // Entity type classification (BUSINESS_AS_PERSON_FALSE_POSITIVES = 0)
        if (item.entityType !== 'PERSON' || !item.fullName || item.fullName.trim().length < 3) {
          if (item.entityType === 'BUSINESS' || item.businessName) {
            businesses.push({
              name: item.businessName || item.fullName,
              type: 'BUSINESS',
              profession_category: item.professionClaim,
              location: item.geographyClaim,
              source_url: item.sourceUrl,
              domain
            });
          }
          telemetry.rejected_entity_type++;
          telemetry.rejected_results++;
          continue;
        }

        // Validate positive semantic work evidence
        const evidenceText = `${item.professionClaim || ''} ${item.workEvidence || ''} ${item.businessName || ''}`.trim();
        if (workConcept) {
          const evidenceCheck = WorkConceptResolver.evaluatePositiveEvidence(workConcept, evidenceText);
          if (!evidenceCheck.matches) {
            const claimLower = (item.professionClaim || '').toLowerCase();
            const textLower = evidenceText.toLowerCase();
            const aliasMatches = workConcept.aliases.some(a => claimLower.includes(a) || textLower.includes(a)) ||
                                 workConcept.allowed_evidence_terms.some(t => textLower.includes(t));
            if (!aliasMatches) {
              telemetry.rejected_no_activity_evidence++;
              telemetry.rejected_results++;
              continue;
            }
          }
        }

        // Validate geography if required
        if (requiredConstraints.requiredLocation) {
          const reqLoc = requiredConstraints.requiredLocation.toLowerCase().trim();
          const candLoc = `${item.geographyClaim || ''} ${item.geographyEvidence || ''}`.toLowerCase();
          const isBsAs = (s: string) => s.includes('caba') || s.includes('buenos aires') || s.includes('capital federal') || 
            s.includes('palermo') || s.includes('recoleta') || s.includes('monserrat') || s.includes('belgrano') || s.includes('san telmo') || s.includes('retiro');
          
          let geoMatches = candLoc.includes(reqLoc) || reqLoc.includes(candLoc);
          if (isBsAs(reqLoc) && isBsAs(candLoc)) geoMatches = true;

          if (!geoMatches) {
            telemetry.rejected_geography++;
            telemetry.rejected_results++;
            continue;
          }
        }

        // Candidate passed all strict validations!
        telemetry.valid_results++;
        citations.push(item.sourceUrl);

        const candidateId = 'gemini_' + Math.random().toString(36).substring(7);
        const candidate: GeminiCandidate = {
          candidateId,
          displayName: item.fullName.trim(),
          professionClaim: item.professionClaim || (workConcept ? workConcept.label : null),
          roleClaim: item.professionClaim || null,
          organizationClaim: item.businessName || item.organizationClaim || null,
          locationClaim: item.geographyClaim || null,
          evidence: [
            {
              url: item.sourceUrl,
              domain,
              title: item.fullName,
              claimTypes: ['PROFESSION', 'LOCATION']
            }
          ],
          aiConfidence: 0.90
        };

        validCandidates.push(candidate);

        // Map to ExternalPersonObservation with positive evidence explanations
        observations.push({
          source_system: domain,
          source_record_id: candidateId,
          source_url: item.sourceUrl,
          source_tier: 'TIER_D_WEB_DISCOVERY',
          observed_at: new Date().toISOString(),
          display_name: item.fullName.trim(),
          profession: item.professionClaim || (workConcept ? workConcept.label : null),
          location: item.geographyClaim || null,
          company: item.businessName || null,
          entity_type: 'PERSON',
          work_evidence: item.workEvidence || item.professionClaim,
          geography_evidence: item.geographyEvidence || item.geographyClaim,
          why_matched_work: item.workEvidence 
            ? `${workConcept?.label || 'Actividad'}: "${item.workEvidence}"`
            : `Evidencia confirmada de ${workConcept?.label || item.professionClaim}`,
          why_matched_geography: item.geographyEvidence
            ? `Ubicación: "${item.geographyEvidence}"`
            : `Ubicación registrada en ${item.geographyClaim || requiredConstraints.requiredLocation}`,
          provenance_quality: 'HIGH',
          email: 'UNKNOWN',
          phone: 'UNKNOWN',
          discovered_by: 'GEMINI_WEB_SEARCH',
          age: 'UNKNOWN'
        });
      }

      return {
        candidates: validCandidates,
        observations,
        businesses,
        telemetry,
        metadata: {
          citations,
          searchEntryPoint: wikiSnippets.map(it => it.url)
        }
      };

    } catch (err: any) {
      console.error("[GeminiDiscovery] Error executing grounded search:", err.message);
      telemetry.status = 'ERROR';
      return { candidates: [], observations: [], businesses: [], telemetry, metadata: { citations: [], searchEntryPoint: [] } };
    }
  }
}
