import type { ExternalPersonObservation, ExternalSearchFilters } from './IExternalPersonSourceAdapter';
import { supabase } from '../supabase';

export class GlobalFilterPredicates {
  
  // Memoized ancestry to prevent constant DB hits during loops
  private static geographyAncestryCache: Map<string, Set<string>> = new Map();
  private static knownGeographyIds: Map<string, string> = new Map(); // Name/Alias to ID

  static async initializeCache() {
    // Basic caching for CABA and Argentina to speed up common checks
    if (this.knownGeographyIds.has('caba')) return;
    
    const { data: geogs } = await supabase.from('atlas_geographies').select('geography_id, normalized_name');
    if (geogs) {
      for (const g of geogs) {
        this.knownGeographyIds.set(g.normalized_name.toLowerCase(), g.geography_id);
      }
    }

    // Load relationships (child -> parent)
    const { data: rels } = await supabase.from('atlas_geography_relationships')
       .select('child_geography_id, parent_geography_id')
       .eq('relationship_type', 'CONTAINED_IN');
       
    if (rels) {
      for (const r of rels) {
        const child = r.parent_geography_id; // Remember, child is parent_geography_id in DB (Subject)
        const parent = r.child_geography_id; // parent is child_geography_id in DB (Object)
        if (!this.geographyAncestryCache.has(child)) {
          this.geographyAncestryCache.set(child, new Set());
        }
        this.geographyAncestryCache.get(child)!.add(parent);
      }
    }
  }

  private static getAncestors(geogId: string): Set<string> {
    const ancestors = new Set<string>();
    const toProcess = [geogId];
    
    while (toProcess.length > 0) {
      const current = toProcess.pop()!;
      ancestors.add(current);
      const parents = this.geographyAncestryCache.get(current);
      if (parents) {
        for (const p of parents) {
          if (!ancestors.has(p)) {
            toProcess.push(p);
          }
        }
      }
    }
    return ancestors;
  }

  static async isGeographyEligible(candidate: ExternalPersonObservation, filters: ExternalSearchFilters): Promise<boolean> {
    await this.initializeCache();

    // If no geography filter is requested, it's eligible
    const requestedLocStr = filters.structured_location?.jurisdiction || filters.structured_location?.city || filters.structured_location?.neighborhood || filters.location_filter;
    
    if (!requestedLocStr) {
      return true;
    }

    const requestedLocNorm = requestedLocStr.toLowerCase().trim();
    let requestedGeoId = this.knownGeographyIds.get(requestedLocNorm);
    
    // Hardcode fallback for CABA if not strictly matched by normalized name
    if (requestedLocNorm === 'caba' || requestedLocNorm === 'ciudad autónoma de buenos aires') {
       requestedGeoId = this.knownGeographyIds.get('ciudad autonoma de buenos aires') || this.knownGeographyIds.get('ciudad autónoma de buenos aires') || requestedGeoId;
    }

    const isBsAsMatch = (req: string, cand: string) => {
      const bsAsTerms = ['caba', 'buenos aires', 'ciudad autónoma de buenos aires', 'ciudad autonoma de buenos aires', 'capital federal'];
      const reqIsBsAs = bsAsTerms.some(t => req.includes(t));
      const candIsBsAs = bsAsTerms.some(t => cand.includes(t)) || 
        ['palermo', 'recoleta', 'belgrano', 'monserrat', 'san telmo', 'retiro', 'almagro', 'caballito', 'villa crespo', 'barrio 31'].some(t => cand.includes(t));
      return reqIsBsAs && candIsBsAs;
    };

    const candLocFull = `${candidate.location || ''} ${candidate.geography_evidence || ''} ${candidate.why_matched_geography || ''}`.toLowerCase();

    if (isBsAsMatch(requestedLocNorm, candLocFull)) {
      return true;
    }

    if (!requestedGeoId) {
      // If we don't know the geography requested in the DB, fallback to text matching for the candidate
      if (candLocFull.includes(requestedLocNorm)) {
         return true;
      }
      if (candidate.workLocationEvidence?.locationId?.toLowerCase().includes(requestedLocNorm)) {
         return true;
      }
      return false;
    }

    // Check candidate's geography.
    let candidateGeoId = null;
    
    if (candidate.workLocationEvidence?.locationId) {
       if (candidate.workLocationEvidence.locationId === 'Q1486' || candidate.workLocationEvidence.locationId.toLowerCase() === 'caba') {
          candidateGeoId = this.knownGeographyIds.get('ciudad autonoma de buenos aires') || this.knownGeographyIds.get('ciudad autónoma de buenos aires');
       } else {
          candidateGeoId = this.knownGeographyIds.get(candidate.workLocationEvidence.locationId.toLowerCase());
       }
    }
    
    if (!candidateGeoId && candidate.location) {
       candidateGeoId = this.knownGeographyIds.get(candidate.location.toLowerCase());
       if (candidate.location.toLowerCase() === 'caba' || candidate.location.toLowerCase() === 'buenos aires') {
         candidateGeoId = this.knownGeographyIds.get('ciudad autonoma de buenos aires') || this.knownGeographyIds.get('ciudad autónoma de buenos aires');
       }
       if (candidate.location.toLowerCase() === 'san miguel de tucumán') {
         candidateGeoId = this.knownGeographyIds.get('san miguel de tucumán') || 'tucuman_id';
       }
    }

    if (!candidateGeoId) {
       if (candLocFull.includes(requestedLocNorm)) {
          return true;
       }
       return false;
    }

    // Check inheritance. If candidateGeoId === requestedGeoId, or if candidateGeoId is CONTAINED_IN requestedGeoId.
    const candidateAncestors = this.getAncestors(candidateGeoId);
    
    // Candidate qualifies if requested geography is one of its ancestors
    if (candidateAncestors.has(requestedGeoId) || candidateGeoId === requestedGeoId) {
        return true;
    }

    return false;
  }

  static isProfessionEligible(candidate: ExternalPersonObservation, filters: ExternalSearchFilters): boolean {
    if (!filters.profession) return true;
    
    // If the filter asks for a profession, candidate must have it.
    // For now, simple normalized check. Phase 1.2 will use proper Taxonomy.
    if (!candidate.profession || candidate.profession === 'UNKNOWN') return false;
    
    const req = filters.profession.toLowerCase().trim();
    const cand = candidate.profession.toLowerCase().trim();
    
    // In Phase 0, if they ask for "empresario", and candidate is "empresario", it's fine.
    // But later we map to normalized IDs.
    return cand.includes(req) || req.includes(cand);
  }

  static isAgeEligible(candidate: ExternalPersonObservation, filters: ExternalSearchFilters): boolean {
    if (!filters.age_from && !filters.age_to) return true;
    
    // If candidate has UNKNOWN age, reject.
    if (!candidate.age || candidate.age === 'UNKNOWN') return false;
    
    // For now, external sources don't have age ranges (usually just a number or UNKNOWN).
    // In Phase 1.1 we will add age_min_current and age_max_current to projection.
    const candAge = parseInt(candidate.age as string, 10);
    if (isNaN(candAge)) return false;

    if (filters.age_from && candAge < filters.age_from) return false;
    if (filters.age_to && candAge > filters.age_to) return false;

    return true;
  }

  static isSocialEligible(candidate: ExternalPersonObservation, filters: ExternalSearchFilters): boolean {
    // If we require socials, candidate must have them
    // (This will be expanded in Phase 1.3)
    return true;
  }
}
