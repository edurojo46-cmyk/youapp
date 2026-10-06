import { SupabaseClient } from '@supabase/supabase-js';
import { IPersonRepository, IdentifierType, PersonIdentifier, PersonAttribute } from './PersonResolver';

export class SupabasePersonRepository implements IPersonRepository {
    constructor(private supabase: SupabaseClient) {}

    async findPersonByIdentifier(tenantId: string, type: IdentifierType, hash: string): Promise<string | null> {
        const { data, error } = await this.supabase
            .from('atlas_person_identifiers')
            .select('person_id')
            .eq('tenant_id', tenantId)
            .eq('identifier_type', type)
            .eq('normalized_value_hash', hash)
            .limit(1)
            .maybeSingle();

        if (error && error.code !== 'PGRST116') {
            console.error('[SupabasePersonRepository] Error finding person:', error);
            throw new Error(error.message);
        }

        return data ? data.person_id : null;
    }

    async createPerson(tenantId: string, name?: string, lifecycleStage: 'OBSERVED' | 'CANONICAL' = 'CANONICAL'): Promise<string> {
        const { data, error } = await this.supabase
            .from('atlas_people')
            .insert({
                tenant_id: tenantId,
                full_name: name,
                status: 'ACTIVE',
                lifecycle_stage: lifecycleStage
            })
            .select('person_id')
            .single();

        if (error) {
            console.error('[SupabasePersonRepository] Error creating person:', error);
            throw new Error(error.message);
        }

        return data.person_id;
    }

    async addIdentifier(tenantId: string, personId: string, identifier: PersonIdentifier, hash: string): Promise<void> {
        const { error } = await this.supabase
            .from('atlas_person_identifiers')
            .insert({
                tenant_id: tenantId,
                person_id: personId,
                identifier_type: identifier.type,
                normalized_value_hash: hash,
                display_value: identifier.display_value,
                safe_value: identifier.safe_value,
                verification_status: identifier.verification_status || 'UNVERIFIED',
                source_evidence_id: identifier.source_evidence_id
            });
            
        if (error) {
            // Check for unique constraint violation: tenant_id, identifier_type, normalized_value_hash
            if (error.code === '23505') {
                return; // gracefully ignore duplicates
            }
            console.error('[SupabasePersonRepository] Error adding identifier:', error);
            throw new Error(error.message);
        }
    }

    async addAttributeEvidence(tenantId: string, personId: string, attr: PersonAttribute): Promise<void> {
        const { error } = await this.supabase
            .from('atlas_person_attribute_evidence')
            .insert({
                tenant_id: tenantId,
                person_id: personId,
                attribute_key: attr.key,
                normalized_value: attr.value,
                assertion_type: attr.assertion_type,
                confidence: attr.confidence,
                source_ref: attr.source_ref,
                valid_until: attr.valid_until ? attr.valid_until.toISOString() : null
            });

        if (error) {
            console.error('[SupabasePersonRepository] Error adding attribute:', error);
            throw new Error(error.message);
        }
    }
}
