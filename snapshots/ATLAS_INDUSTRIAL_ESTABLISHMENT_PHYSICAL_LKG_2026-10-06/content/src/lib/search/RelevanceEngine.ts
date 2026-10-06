import type { QueryIntent } from './UniversalQueryModel';
import type { FederatedPersonSearchResult } from './FederatedPersonSearch';
import { WorkConceptResolver } from './WorkConceptResolver';

export class RelevanceEngine {
  static evaluate(result: FederatedPersonSearchResult, intent: QueryIntent): boolean {
    // 0. Entity Type Constraint: Only PERSON entities are accepted in People Search
    if (result.entity_type && result.entity_type !== 'PERSON') {
      return false;
    }

    // 1. Person Name Constraint (if specified)
    if (intent.person_name) {
      const queryTokens = intent.person_name.toLowerCase().split(/\s+/).filter(Boolean);
      const resultTokens = (result.display_name || '').toLowerCase().split(/\s+/).filter(Boolean);
      
      let matchedTokens = 0;
      for (const qt of queryTokens) {
        if (resultTokens.some(rt => rt.includes(qt) || qt.includes(rt))) {
          matchedTokens++;
        }
      }
      
      if (matchedTokens / queryTokens.length < 0.75) {
        return false;
      }
    }
    
    // 2. Positive Work Concept & Activity Evidence Constraint
    const workConcept = intent.work_concept || WorkConceptResolver.resolve(
      intent.profession || intent.occupation || intent.trade || intent.role_class || ''
    );

    if (workConcept) {
      // Gather all text evidence from the candidate
      const textPieces: string[] = [
        result.display_name || '',
        result.profession || '',
        result.role || '',
        result.work_evidence || '',
        result.why_matched_work || '',
        result.attributes?.profession || '',
        result.attributes?.role || '',
        result.attributes?.occupation || ''
      ];

      if (result.external_data) {
        for (const ed of result.external_data) {
          if (ed.profession) textPieces.push(ed.profession);
          if (ed.work_evidence) textPieces.push(ed.work_evidence);
          if (ed.why_matched_work) textPieces.push(ed.why_matched_work);
          if (ed.company) textPieces.push(ed.company);
        }
      }

      const fullCandidateText = textPieces.join(' ').toLowerCase();

      // Check positive semantic evidence using WorkConceptResolver
      const evidence = WorkConceptResolver.evaluatePositiveEvidence(workConcept, fullCandidateText);
      
      if (!evidence.matches) {
        // Special case: GitHub profiles for software engineering intent
        if (result.external_sources?.includes('GITHUB')) {
          const isSoftware = ['PROGRAMADOR', 'DESARROLLADOR', 'SOFTWARE', 'INGENIERO'].includes(workConcept.canonical_id);
          if (isSoftware) {
            return true;
          }
        }
        
        // POSITIVE EVIDENCE RULE: If no positive evidence of the requested work concept, REJECT.
        // A politician in CABA with no commercial evidence is REJECTED here.
        return false;
      }
    }
    
    return true;
  }
}
