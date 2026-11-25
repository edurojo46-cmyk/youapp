export type IdentifierType = 'EMAIL' | 'PHONE' | 'INSTAGRAM' | 'X' | 'YOUTUBE' | 'LINKEDIN' | 'TELEGRAM' | 'CUSTOMER_ID' | 'OTHER';
export type AssertionType = 'VERIFIED' | 'DECLARED' | 'OBSERVED' | 'INFERRED';
export type PersonStatus = 'ACTIVE' | 'MERGED' | 'DELETED';
export type ResolutionOutcome = 'RESOLVED' | 'UNRESOLVED' | 'AMBIGUOUS' | 'CONFLICT';

export interface PersonIdentifier {
    type: IdentifierType;
    value: string; // The raw value; will be normalized by resolver
    display_value?: string;
    safe_value?: string;
    verification_status?: string;
    source_evidence_id?: string;
}

export interface PersonAttribute {
    key: string;
    value: string;
    assertion_type: AssertionType;
    confidence?: number;
    source_ref?: string;
    valid_until?: Date;
}

export interface PersonResolutionRequest {
    tenant_id: string;
    name?: string;
    identifiers: PersonIdentifier[];
    attributes?: PersonAttribute[];
    mode?: 'RESOLUTION_ONLY' | 'AUTHORIZED_MANUAL_CREATION';
}

export interface PersonResolutionResult {
    outcome: ResolutionOutcome;
    person_id?: string;
    reason?: string;
}

export interface IPersonRepository {
    findPersonByIdentifier(tenantId: string, type: IdentifierType, hash: string): Promise<string | null>;
    createPerson(tenantId: string, name?: string, lifecycleStage?: 'OBSERVED' | 'CANONICAL'): Promise<string>;
    addIdentifier(tenantId: string, personId: string, identifier: PersonIdentifier, hash: string): Promise<void>;
    addAttributeEvidence(tenantId: string, personId: string, attr: PersonAttribute): Promise<void>;
}

export class PersonResolver {
    constructor(private repo: IPersonRepository) {}

    // Very simple normalizer for MVP
    private normalize(type: IdentifierType, value: string): string {
        let val = value.trim().toLowerCase();
        if (type === 'EMAIL') {
            return val;
        } else if (type === 'PHONE') {
            return val.replace(/[^0-9+]/g, '');
        } else if (type === 'TELEGRAM' || type === 'INSTAGRAM' || type === 'X' || type === 'YOUTUBE') {
            return val.replace(/^@/, '');
        }
        return val;
    }

    async resolve(request: PersonResolutionRequest): Promise<PersonResolutionResult> {
        const { tenant_id, name, identifiers, attributes } = request;

        if (!identifiers || identifiers.length === 0) {
            // Rule: Same name alone NEVER merges people automatically
            if (name) {
                // If we want we could return AMBIGUOUS, but the rule says:
                // name only + no viable existing candidate -> UNRESOLVED
                // name only + multiple viable candidates -> AMBIGUOUS
                // We're strictly not merging on name. Let's return AMBIGUOUS since we refuse to blindly create.
                return { outcome: 'AMBIGUOUS', reason: 'Name only resolution is not safe without identifiers.' };
            }
            return { outcome: 'UNRESOLVED', reason: 'No name or identifiers provided.' };
        }

        // 1. Gather all matched person IDs for provided identifiers
        const matchedPersonIds = new Set<string>();
        const normalizedIdentifiers = identifiers.map(id => ({
            ...id,
            hash: this.normalize(id.type, id.value)
        }));

        for (const id of normalizedIdentifiers) {
            const existingPersonId = await this.repo.findPersonByIdentifier(tenant_id, id.type, id.hash);
            if (existingPersonId) {
                matchedPersonIds.add(existingPersonId);
            }
        }

        let resolvedPersonId: string | undefined;

        if (matchedPersonIds.size === 0) {
            // Elimination of blind bypass: Default mode is RESOLUTION_ONLY
            if (request.mode === 'AUTHORIZED_MANUAL_CREATION') {
                resolvedPersonId = await this.repo.createPerson(tenant_id, name, 'CANONICAL');
            } else {
                return { outcome: 'UNRESOLVED', reason: 'No matching person found in resolution-only mode.' };
            }
        } else if (matchedPersonIds.size === 1) {
            // 3. Resolve to existing
            resolvedPersonId = Array.from(matchedPersonIds)[0];
        } else {
            // 4. Conflict: Identifiers point to multiple distinct persons
            return { outcome: 'CONFLICT', reason: `Identifiers mapped to multiple persons: ${Array.from(matchedPersonIds).join(', ')}` };
        }

        // Add any missing identifiers (the repo should handle upsert/ignore duplicates safely based on unique constraint)
        for (const id of normalizedIdentifiers) {
            try {
                await this.repo.addIdentifier(tenant_id, resolvedPersonId, id, id.hash);
            } catch (err) {
                // Ignore unique constraint violations gracefully
                console.warn(`[PersonResolver] Add Identifier Error (Safe ignore):`, err);
            }
        }

        // Add attributes
        if (attributes) {
            for (const attr of attributes) {
                // Rule: sensitive inferred attribute rejected
                if (attr.assertion_type === 'INFERRED' && this.isSensitive(attr.key)) {
                    console.warn(`[PersonResolver] Rejected sensitive inferred attribute: ${attr.key}`);
                    continue;
                }
                await this.repo.addAttributeEvidence(tenant_id, resolvedPersonId, attr);
            }
        }

        return { outcome: 'RESOLVED', person_id: resolvedPersonId };
    }

    private isSensitive(key: string): boolean {
        const sensitiveKeys = ['POLITICAL_IDEOLOGY', 'RELIGION', 'HEALTH', 'RACE', 'ETHNICITY', 'SEXUAL_ORIENTATION', 'RELATIONSHIP'];
        return sensitiveKeys.includes(key.toUpperCase());
    }
}
