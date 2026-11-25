import { supabase } from '../../supabase';

export interface ResolvedGeographyCandidate {
    geography_id: string;
    type: string;
    name: string;
    confidence: number;
    parent_ids: string[];
}

export interface ResolverOutput {
    status: 'VERIFIED' | 'AMBIGUOUS' | 'UNRESOLVED';
    geography_id?: string;
    geography_type?: string;
    candidates: ResolvedGeographyCandidate[];
    match_method: string;
    confidence: number;
}

export class AtlasGeographyResolver {
    
    /**
     * Resolves a free-text geography name (e.g. "Córdoba", "Caballito") to a canonical Atlas geography node.
     * Uses fuzzy matching or exact match on normalized names.
     */
    async resolve(query: string, hintParentId?: string): Promise<ResolverOutput> {
        const normalized = query.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
        
        const { data, error } = await supabase
            .from('atlas_geographies')
            .select('geography_id, name, geography_type')
            .eq('is_active', true)
            .or(`normalized_name.eq.${normalized},normalized_name.ilike.%${normalized}%`);

        if (error || !data || data.length === 0) {
            return {
                status: 'UNRESOLVED',
                candidates: [],
                match_method: 'NONE',
                confidence: 0
            };
        }

        // Score the results
        const scored: ResolvedGeographyCandidate[] = data.map(g => {
            let score = 0;
            const normGName = g.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
            
            if (normGName === normalized) score += 50; // Exact match
            else score += 10; // Partial match
            
            return {
                geography_id: g.geography_id,
                type: g.geography_type,
                name: g.name,
                confidence: score,
                parent_ids: [] // Would be populated via another query or join if needed
            };
        });

        scored.sort((a, b) => b.confidence - a.confidence);

        // Check for Ambiguity (same highest score for multiple valid top-level or mid-level entities)
        // e.g. "Córdoba" gives 50 to Province and 50 to Municipality.
        const topScore = scored[0].confidence;
        const topCandidates = scored.filter(c => c.confidence === topScore);

        if (topCandidates.length > 1) {
            // Ambiguous
            return {
                status: 'AMBIGUOUS',
                candidates: topCandidates,
                match_method: 'EXACT_NAME_COLLISION',
                confidence: topScore
            };
        }

        return {
            status: 'VERIFIED',
            geography_id: topCandidates[0].geography_id,
            geography_type: topCandidates[0].type,
            candidates: scored,
            match_method: 'EXACT_NAME',
            confidence: topScore
        };
    }
}
