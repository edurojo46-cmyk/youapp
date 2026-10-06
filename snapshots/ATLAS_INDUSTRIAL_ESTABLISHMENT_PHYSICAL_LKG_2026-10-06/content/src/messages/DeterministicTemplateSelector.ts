export interface TemplateVariant {
    variant_id: string;
    template_id: string;
    variant_key: string;
    version: string;
    selection_rank: number;
    required_variables: string[];
    optional_variables: string[];
    subject_template: string;
    body_template: string;
    template_hash: string;
}

export class DeterministicTemplateSelector {
    public selectVariant(
        variants: TemplateVariant[], 
        availableEvidenceKeys: Set<string>
    ): TemplateVariant | null {
        // Sort variants by selection_rank (lower is safer/higher priority)
        // Note: The DB query should already sort this, but we enforce it here for deterministic safety.
        const sortedVariants = [...variants].sort((a, b) => a.selection_rank - b.selection_rank);

        for (const variant of sortedVariants) {
            // Check if ALL required variables are present in the available evidence
            const allRequiredPresent = variant.required_variables.every(reqVar => availableEvidenceKeys.has(reqVar));
            if (allRequiredPresent) {
                return variant;
            }
        }
        
        return null; // No safe variant found
    }
}
