import { DeterministicTemplateSelector, TemplateVariant } from './DeterministicTemplateSelector';
import { DeterministicMessageRenderer, EvidenceAttribute, VariableBinding, RenderResult } from './DeterministicMessageRenderer';

export interface GenerationRequest {
    jobId: string;
    campaignId: string;
    contactId: string;
    templateGroupVariants: TemplateVariant[];
    evidenceList: EvidenceAttribute[];
}

export interface GenerationResponse {
    status: 'GENERATED' | 'MESSAGE_NOT_GENERATED';
    reason?: string;
    
    generation_id?: string; // from DB
    subject?: string;
    body?: string;
    bindings?: VariableBinding[];
    variant_version?: string;
}

export class DeterministicMessageEngine {
    private selector = new DeterministicTemplateSelector();
    private renderer = new DeterministicMessageRenderer();

    // Supabase client must be injected to perform the transactional check and save
    constructor(private supabaseClient: any) {}

    public async generate(req: GenerationRequest): Promise<GenerationResponse> {
        // 1. Check current 9B decision from DB directly (never trust in-memory state!)
        const { data: decisionRow, error: decisionErr } = await this.supabaseClient
            .from('atlas_contact_decisions')
            .select('*')
            .eq('candidate_id', req.contactId)
            .eq('decision', 'CONTACT_NOW')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (decisionErr || !decisionRow) {
            return { status: 'MESSAGE_NOT_GENERATED', reason: 'No CURRENT CONTACT_NOW decision found.' };
        }

        // Check expiration
        if (decisionRow.expires_at) {
            const expiresAt = new Date(decisionRow.expires_at).getTime();
            if (Date.now() > expiresAt) {
                return { status: 'MESSAGE_NOT_GENERATED', reason: 'CONTACT_NOW decision is expired.' };
            }
        } else {
            const decidedAt = new Date(decisionRow.created_at).getTime();
            if (Date.now() - decidedAt > 24 * 60 * 60 * 1000) {
                return { status: 'MESSAGE_NOT_GENERATED', reason: 'CONTACT_NOW decision is expired (fallback 24h).' };
            }
        }

        // 2. Select Template Variant
        const evidenceMap = new Map<string, EvidenceAttribute>();
        req.evidenceList.forEach(e => evidenceMap.set(e.attribute_name, e));
        
        const availableKeys = new Set(evidenceMap.keys());
        const variant = this.selector.selectVariant(req.templateGroupVariants, availableKeys);
        
        if (!variant) {
            return { status: 'MESSAGE_NOT_GENERATED', reason: 'No safe template variant satisfiable with current evidence.' };
        }

        // 3. Render Message
        let renderResult: RenderResult;
        try {
            renderResult = this.renderer.render(variant, evidenceMap);
        } catch (e: any) {
            return { status: 'MESSAGE_NOT_GENERATED', reason: `Rendering failed: ${e.message}` };
        }

        // 4. Formulate Claims for ClaimValidator
        const claims = renderResult.bindings.map(b => ({
            claim_text: `${b.attribute_name} = ${b.rendered_value}`,
            claim_type: 'EVIDENCE_BACKED_VARIABLE',
            raw_evidence_id: b.raw_evidence_id || null,
            validation_status: 'SUPPORTED' // Deterministic variables are definitionally supported if from 9A
        }));

        // 5. Atomic Persistence via DB RPC
        const { data: genId, error: saveErr } = await this.supabaseClient.rpc('persist_deterministic_generation', {
            p_job_id: req.jobId,
            p_campaign_id: req.campaignId,
            p_contact_id: req.contactId,
            p_subject: renderResult.subject,
            p_body: renderResult.body,
            p_model: 'DETERMINISTIC_ENGINE_V1',
            p_variant_version: variant.version,
            p_claims: claims,
            p_bindings: renderResult.bindings
        });

        if (saveErr) {
            throw new Error(`Atomic persistence failed: ${JSON.stringify(saveErr)}`);
        }

        return {
            status: 'GENERATED',
            generation_id: genId,
            subject: renderResult.subject,
            body: renderResult.body,
            bindings: renderResult.bindings,
            variant_version: variant.version
        };
    }
}
