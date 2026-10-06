import { SupabaseClient } from '@supabase/supabase-js';

export interface FactPackFact {
    field: string;
    value: string;
    evidence_id: string;
    source: string;
    confidence: number;
    observed_at: string;
}

export interface FactPack {
    name?: FactPackFact;
    company?: FactPackFact;
    role?: FactPackFact;
    industry?: FactPackFact;
    // snapshot is used to freeze the facts used for generation
    _snapshot: Record<string, any>;
}

export class EvidenceResolver {
    constructor(private supabase: SupabaseClient) {}

    /**
     * Extracts verified evidence for a contact and builds a structured Fact Pack.
     */
    async resolveFactPack(contactId: string): Promise<FactPack> {
        const { data: evidence, error } = await this.supabase
            .from('atlas_contact_evidence')
            .select('*')
            .eq('contact_id', contactId)
            .gte('confidence', 0.8) // Only use high confidence evidence
            .order('confidence', { ascending: false });

        if (error) {
            throw new Error(`Failed to resolve evidence: ${error.message}`);
        }

        const factPack: FactPack = {
            _snapshot: {}
        };

        const mapFact = (ev: any): FactPackFact => ({
            field: ev.field,
            value: ev.value,
            evidence_id: ev.evidence_id,
            source: ev.source_url || ev.source_type || 'unknown',
            confidence: ev.confidence,
            observed_at: ev.verified_at || ev.created_at || new Date().toISOString()
        });

        // Pick the highest confidence evidence for each field
        for (const ev of evidence || []) {
            const fieldName = ev.field.toLowerCase();
            
            // Map common fields to our schema
            if (['name', 'first_name', 'full_name'].includes(fieldName) && !factPack.name) {
                factPack.name = mapFact(ev);
                factPack._snapshot[ev.evidence_id] = ev;
            } else if (['company', 'organization'].includes(fieldName) && !factPack.company) {
                factPack.company = mapFact(ev);
                factPack._snapshot[ev.evidence_id] = ev;
            } else if (['role', 'job_title', 'title'].includes(fieldName) && !factPack.role) {
                factPack.role = mapFact(ev);
                factPack._snapshot[ev.evidence_id] = ev;
            } else if (['industry', 'sector'].includes(fieldName) && !factPack.industry) {
                factPack.industry = mapFact(ev);
                factPack._snapshot[ev.evidence_id] = ev;
            }
        }

        return factPack;
    }
}

