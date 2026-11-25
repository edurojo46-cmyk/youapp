import { WorkConceptResolver } from '../WorkConceptResolver';

export interface ProfessionResolutionResult {
  input_term: string;
  normalized_term: string;
  canonical_label: string | null;
  external_id: string | null;
  source_system: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  validation_status: 'VERIFIED' | 'AMBIGUOUS' | 'UNRESOLVED';
  validation_reason: string;
  candidate_count: number;
  verified_at: string | null;
}

export class ProfessionConceptResolver {
  private static cache: Record<string, ProfessionResolutionResult> = {};

  private normalizeTerm(term: string): string {
    let t = term.toLowerCase().trim();
    t = t.replace(/as$/, 'o').replace(/os$/, 'o');
    if (t.endsWith('a') && !['periodista', 'dentista', 'docente', 'electricista', 'economista'].includes(t)) {
      t = t.slice(0, -1) + 'o';
    }
    return t;
  }

  async resolve(term: string): Promise<ProfessionResolutionResult> {
    const normalized = this.normalizeTerm(term);

    if (ProfessionConceptResolver.cache[normalized]) {
      return ProfessionConceptResolver.cache[normalized];
    }

    // 0. Check WorkConceptResolver first
    const workConcept = WorkConceptResolver.resolve(normalized);
    if (workConcept && workConcept.provider_mappings.wikidata_qid) {
      const res: ProfessionResolutionResult = {
        input_term: term,
        normalized_term: normalized,
        canonical_label: workConcept.label,
        external_id: workConcept.provider_mappings.wikidata_qid,
        source_system: 'WIKIDATA',
        confidence: 'HIGH',
        validation_status: 'VERIFIED',
        validation_reason: `Pre-verified via WorkConceptResolver (${workConcept.dimension})`,
        candidate_count: 1,
        verified_at: new Date().toISOString()
      };
      ProfessionConceptResolver.cache[normalized] = res;
      return res;
    }

    try {
      // 1. Search candidates via wbsearchentities
      const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(normalized)}&language=es&format=json&origin=*`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'AtlasPersonSearch/1.0 (Contact: admin@youapp.com)' }
      });
      const data = await response.json();
      
      const candidates = data.search || [];
      if (candidates.length === 0) {
        return {
          input_term: term, normalized_term: normalized, canonical_label: null,
          external_id: null, source_system: 'WIKIDATA', confidence: 'LOW',
          validation_status: 'UNRESOLVED', validation_reason: 'No entities found',
          candidate_count: 0, verified_at: null
        };
      }

      // 2. Semantic Validation via SPARQL for top candidates (up to 3)
      const topCandidates = candidates.slice(0, 3);
      for (const cand of topCandidates) {
        const qid = cand.id;
        // Verify if it's an occupation (Q12737077) or profession (Q28640) or used in P106
        const sparql = `
          ASK {
            { wd:${qid} wdt:P31/wdt:P279* wd:Q12737077 . }
            UNION
            { wd:${qid} wdt:P31/wdt:P279* wd:Q28640 . }
            UNION
            { ?person wdt:P106 wd:${qid} . }
          }
        `;
        
        const sparqlUrl = `https://query.wikidata.org/sparql`;
        const askResp = await fetch(sparqlUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/sparql-results+json',
            'User-Agent': 'AtlasPersonSearch/1.0 (Contact: admin@youapp.com)'
          },
          body: new URLSearchParams({ query: sparql })
        });
        
        if (askResp.ok) {
          const askData = await askResp.json();
          if (askData.boolean === true) {
            // VERIFIED
            const result: ProfessionResolutionResult = {
              input_term: term,
              normalized_term: normalized,
              canonical_label: cand.label || cand.match?.text,
              external_id: qid,
              source_system: 'WIKIDATA',
              confidence: 'HIGH',
              validation_status: 'VERIFIED',
              validation_reason: `Passed semantic occupation validation (is occupation or used in P106)`,
              candidate_count: candidates.length,
              verified_at: new Date().toISOString()
            };
            
            // Cache verified
            ProfessionConceptResolver.cache[normalized] = result;
            return result;
          }
        }
      }

      // If loop finishes without returning, no candidate passed validation
      return {
        input_term: term, normalized_term: normalized, canonical_label: candidates[0].label,
        external_id: candidates[0].id, source_system: 'WIKIDATA', confidence: 'LOW',
        validation_status: 'AMBIGUOUS', validation_reason: 'Top candidates failed semantic validation',
        candidate_count: candidates.length, verified_at: null
      };

    } catch (err: any) {
      return {
        input_term: term, normalized_term: normalized, canonical_label: null,
        external_id: null, source_system: 'WIKIDATA', confidence: 'LOW',
        validation_status: 'UNRESOLVED', validation_reason: err.message,
        candidate_count: 0, verified_at: null
      };
    }
  }
}
