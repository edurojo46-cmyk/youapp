import { TemplateVariant } from './DeterministicTemplateSelector';

export interface EvidenceAttribute {
    attribute_evidence_id: string; // from Phase 9A atlas_candidate_attribute_evidence
    raw_evidence_id?: string;
    attribute_name: string;
    value: string;
    source_ref?: string;
}

export interface VariableBinding {
    variable_name: string;
    rendered_value: string;
    attribute_name: string;
    attribute_evidence_id: string;
    raw_evidence_id?: string;
}

export interface RenderResult {
    subject: string;
    body: string;
    bindings: VariableBinding[];
}

export class DeterministicMessageRenderer {
    public render(variant: TemplateVariant, evidenceMap: Map<string, EvidenceAttribute>): RenderResult {
        // Validate Subject has no control characters/newlines
        if (/[\r\n\t]/.test(variant.subject_template)) {
            throw new Error("Subject template contains invalid control characters or newlines");
        }

        const bindings: VariableBinding[] = [];

        // Parse and replace function
        const replaceTokens = (templateStr: string): string => {
            // Match {{variable_name}}
            return templateStr.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (match, varName) => {
                const evidence = evidenceMap.get(varName);
                if (!evidence) {
                    throw new Error(`Missing evidence for required variable: ${varName}`);
                }
                
                bindings.push({
                    variable_name: varName,
                    rendered_value: evidence.value,
                    attribute_name: evidence.attribute_name,
                    attribute_evidence_id: evidence.attribute_evidence_id,
                    raw_evidence_id: evidence.raw_evidence_id
                });
                
                return evidence.value;
            });
        };

        const finalSubject = replaceTokens(variant.subject_template);
        const finalBody = replaceTokens(variant.body_template);

        // Scan for unresolved placeholders: any remaining {{...}} means failure
        if (/\{\{.*?\}\}/.test(finalSubject) || /\{\{.*?\}\}/.test(finalBody)) {
            throw new Error("Unresolved placeholders remain after rendering.");
        }

        return {
            subject: finalSubject,
            body: finalBody,
            bindings
        };
    }
}
