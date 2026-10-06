import crypto from 'crypto';

export interface RawCriterion {
    attribute: string;
    operator: string;
    value: any;
    required: boolean;
}

export interface RegistryAttribute {
    attribute: string;
    data_type: string;
    entity_type: string;
    allowed_operators: string[];
    evidence_required: boolean;
    targeting_allowed: boolean;
    sensitivity_class: string;
}

export class AudienceCriteriaNormalizer {
    private registry: Record<string, RegistryAttribute>;
    private aliases: Record<string, Record<string, string>>;

    constructor(registry: RegistryAttribute[]) {
        this.registry = {};
        for (const r of registry) {
            this.registry[r.attribute] = r;
        }

        // Hardcoded aliases for V1. This can be moved to DB later.
        this.aliases = {
            'person.role_family': {
                'sales director': 'COMMERCIAL_DECISION_MAKER',
                'director comercial': 'COMMERCIAL_DECISION_MAKER',
                'head of sales': 'COMMERCIAL_DECISION_MAKER',
                'vp sales': 'COMMERCIAL_DECISION_MAKER'
            }
        };
    }

    public normalize(rawCriteria: RawCriterion[]): { spec: any, hash: string, errors: string[] } {
        const errors: string[] = [];
        const normalized = [];

        for (let i = 0; i < rawCriteria.length; i++) {
            const raw = rawCriteria[i];
            
            // 1. Check if attribute exists
            const reg = this.registry[raw.attribute];
            if (!reg) {
                errors.push(`Unsupported attribute: ${raw.attribute}`);
                continue;
            }

            // 2. Check if targeting is allowed
            if (!reg.targeting_allowed) {
                errors.push(`Attribute not allowed for targeting: ${raw.attribute}`);
                continue;
            }

            // 3. Check operator
            if (!reg.allowed_operators.includes(raw.operator)) {
                errors.push(`Operator ${raw.operator} not allowed for attribute ${raw.attribute}`);
                continue;
            }

            // 4. Resolve Aliases for string equalities
            let expectedValue = raw.value;
            if (this.aliases[raw.attribute] && (raw.operator === 'EQ' || raw.operator === 'IN')) {
                if (typeof raw.value === 'string') {
                    const normalizedStr = raw.value.toLowerCase();
                    if (this.aliases[raw.attribute][normalizedStr]) {
                        expectedValue = this.aliases[raw.attribute][normalizedStr];
                    }
                } else if (Array.isArray(raw.value)) {
                    expectedValue = raw.value.map((v: any) => {
                        if (typeof v === 'string') {
                            const normalizedStr = v.toLowerCase();
                            return this.aliases[raw.attribute][normalizedStr] || v;
                        }
                        return v;
                    });
                }
            }

            normalized.push({
                attribute: raw.attribute,
                operator: raw.operator,
                expected_value: expectedValue,
                required: raw.required,
                position: i
            });
        }

        const spec = { criteria: normalized };
        const hash = crypto.createHash('sha256').update(JSON.stringify(spec)).digest('hex');

        return { spec, hash, errors };
    }
}
