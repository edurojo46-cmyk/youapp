import { SupabaseClient } from '@supabase/supabase-js';
import { ContactSourceAdapter, CompanyCandidate, PersonSearchCriteria } from '../contact/sources/contact_source_adapter';
import { WebSearchSourceAdapter } from '../contact/sources/web_search_source_adapter';
import { CompanyWebsiteSourceAdapter } from '../contact/sources/company_website_source_adapter';
import { HunterEmailAdapter } from '../contact/sources/email_discovery_adapter';
import { EvidenceResolver } from '../brain/evidence_resolver';
import { DummyLLMAdapter } from '../brain/llm_adapter';
import { ClaimValidator } from '../brain/claim_validator';
import crypto from 'crypto';

export interface PipelineConfig {
    runId: string;
    campaignId: string;
    searchId?: string;
    criteria: PersonSearchCriteria & { sectors?: string[]; city?: string; country?: string; limit?: number };
}

export class AtlasAcquisitionPipeline {
    private webSearch: WebSearchSourceAdapter;
    private companyWebsite: CompanyWebsiteSourceAdapter;
    private emailAdapter: HunterEmailAdapter;
    private evidenceResolver: EvidenceResolver;
    private llm: DummyLLMAdapter;
    private claimValidator: ClaimValidator;

    constructor(private supabase: SupabaseClient) {
        this.webSearch = new WebSearchSourceAdapter();
        this.companyWebsite = new CompanyWebsiteSourceAdapter();
        this.emailAdapter = new HunterEmailAdapter();
        this.evidenceResolver = new EvidenceResolver(supabase);
        this.llm = new DummyLLMAdapter();
        this.claimValidator = new ClaimValidator();
    }

    private async updateCandidate(candidateRunId: string, statusField: string, statusValue: string, blockReason?: string) {
        const updateData: any = { [statusField]: statusValue, updated_at: new Date().toISOString() };
        if (blockReason) updateData.block_reason = blockReason;
        
        await this.supabase
            .from('atlas_acquisition_candidates')
            .update(updateData)
            .eq('candidate_run_id', candidateRunId);
    }

    async run(config: PipelineConfig) {
        // 1. Discovery
        console.log(`[Acquisition] Starting Discovery for Run ${config.runId}`);
        const companies = await this.webSearch.discoverCompanies({
            sectors: config.criteria.sectors,
            city: config.criteria.city,
            country: config.criteria.country,
            limit: config.criteria.limit
        });

        for (const company of companies) {
            const people = await this.companyWebsite.discoverPeople(company, config.criteria);
            
            for (const person of people) {
                // Initialize Candidate
                const { data: candidate, error: candErr } = await this.supabase
                    .from('atlas_acquisition_candidates')
                    .insert({
                        run_id: config.runId,
                        discovered_person_id: person.person_candidate_id,
                        discovery_status: 'COMPLETED'
                    })
                    .select('candidate_run_id')
                    .single();
                
                if (candErr) {
                    console.error('Failed to create candidate record', candErr);
                    continue;
                }
                const candidateId = candidate.candidate_run_id;

                // 2. Evidence (Email Discovery)
                await this.updateCandidate(candidateId, 'evidence_status', 'PROCESSING');
                const emailCand = await this.emailAdapter.findEmail({
                    firstName: person.first_name,
                    lastName: person.last_name,
                    companyDomain: company.domain
                });

                if (!emailCand) {
                    await this.updateCandidate(candidateId, 'evidence_status', 'FAILED', 'NO_EMAIL_FOUND');
                    continue;
                }
                await this.updateCandidate(candidateId, 'evidence_status', 'COMPLETED');

                // 3. Entity Resolution & Confidence (Promotion to canonical contact)
                // For this V1, we simulate the resolution and promotion directly to atlas_contacts
                // Real promotion would use ContactConfidenceEngine
                await this.updateCandidate(candidateId, 'identity_status', 'PROCESSING');
                
                const mockEmailHash = crypto.createHash('sha256').update(emailCand.email.toLowerCase().trim()).digest('hex');
                
                let canonicalContactId: string;
                // Check if exists
                const { data: existingContact } = await this.supabase
                    .from('atlas_contacts')
                    .select('contact_id')
                    .eq('email_hash', mockEmailHash)
                    .single();

                if (existingContact) {
                    canonicalContactId = existingContact.contact_id;
                } else {
                    const { data: newContact, error: insertErr } = await this.supabase
                        .from('atlas_contacts')
                        .insert({
                            full_name: `${person.first_name} ${person.last_name}`,
                            email: emailCand.email,
                            email_normalized: emailCand.email.toLowerCase().trim(),
                            email_hash: mockEmailHash,
                            country_code: config.criteria.country || 'AR',
                            recipient_type: 'CORPORATE_EMPLOYEE',
                            company: company.company_name,
                            job_title: person.job_title || 'Unknown',
                            status: 'UNVERIFIED'
                        })
                        .select('contact_id')
                        .single();

                    if (insertErr || !newContact) {
                        await this.updateCandidate(candidateId, 'identity_status', 'FAILED', 'PROMOTION_FAILED');
                        continue;
                    }
                    canonicalContactId = newContact.contact_id;

                    // Insert basic evidence
                    await this.supabase.from('atlas_contact_evidence').insert([
                        { contact_id: canonicalContactId, field: 'name', value: `${person.first_name} ${person.last_name}`, confidence: 0.9, source_url: person.source_url },
                        { contact_id: canonicalContactId, field: 'company', value: company.company_name, confidence: 0.9, source_url: company.source_url },
                        { contact_id: canonicalContactId, field: 'role', value: person.job_title || 'Unknown', confidence: 0.8, source_url: person.source_url }
                    ]);
                }

                await this.supabase.from('atlas_acquisition_candidates').update({ canonical_contact_id: canonicalContactId }).eq('candidate_run_id', candidateId);
                await this.updateCandidate(candidateId, 'identity_status', 'COMPLETED');
                await this.updateCandidate(candidateId, 'confidence_status', 'COMPLETED');

                // 4. Compliance Authority
                await this.updateCandidate(candidateId, 'compliance_status', 'PROCESSING');
                const { data: evalId, error: evalErr } = await this.supabase.rpc('evaluate_outreach_contact', {
                    p_contact_id: canonicalContactId,
                    p_campaign_id: config.campaignId
                });

                if (evalErr) {
                    await this.updateCandidate(candidateId, 'compliance_status', 'FAILED', `RPC_ERROR: ${evalErr.message}`);
                    continue;
                }

                // Check decision
                const { data: complianceRecord } = await this.supabase
                    .from('atlas_outreach_compliance')
                    .select('decision')
                    .eq('evaluation_id', evalId)
                    .single();

                if (!complianceRecord || complianceRecord.decision !== 'ALLOWED') {
                    await this.updateCandidate(candidateId, 'compliance_status', 'FAILED', `COMPLIANCE_${complianceRecord?.decision || 'UNKNOWN'}`);
                    continue;
                }
                await this.updateCandidate(candidateId, 'compliance_status', 'COMPLETED');

                // 5. Fact Pack & Campaign Brain
                await this.updateCandidate(candidateId, 'generation_status', 'PROCESSING');
                const factPack = await this.evidenceResolver.resolveFactPack(canonicalContactId);
                
                // Rule: NO EVIDENCE -> NO GENERATION
                if (Object.keys(factPack._snapshot).length === 0) {
                    await this.updateCandidate(candidateId, 'generation_status', 'FAILED', 'NO_EVIDENCE_FOUND');
                    continue;
                }

                const llmOutput = await this.llm.generate(factPack, 'test_template');

                // 6. ClaimValidator
                await this.updateCandidate(candidateId, 'claim_validation_status', 'PROCESSING');
                const validatedClaims = this.claimValidator.validate(llmOutput.claims, factPack);
                const hasUnsupported = validatedClaims.some(c => c.validation_status === 'UNSUPPORTED');
                
                if (hasUnsupported) {
                    await this.updateCandidate(candidateId, 'claim_validation_status', 'FAILED', 'UNSUPPORTED_CLAIMS');
                    continue;
                }

                // Save generation
                const { data: generation, error: genErr } = await this.supabase
                    .from('atlas_message_generations')
                    .insert({
                        campaign_id: config.campaignId,
                        contact_id: canonicalContactId,
                        status: 'APPROVED',
                        subject: llmOutput.subject,
                        body: llmOutput.body,
                        model: llmOutput.model,
                        prompt_version: llmOutput.prompt_version,
                        evidence_snapshot: factPack._snapshot,
                        approved_at: new Date().toISOString()
                    })
                    .select('generation_id')
                    .single();

                if (genErr) {
                    await this.updateCandidate(candidateId, 'generation_status', 'FAILED', 'GENERATION_SAVE_FAILED');
                    continue;
                }

                if (validatedClaims.length > 0) {
                    const claimsData = validatedClaims.map(c => ({
                        generation_id: generation.generation_id,
                        claim_text: c.claim_text,
                        claim_type: c.claim_type,
                        evidence_id: c.evidence_id,
                        confidence: c.confidence,
                        validation_status: c.validation_status
                    }));
                    await this.supabase.from('atlas_message_claims').insert(claimsData);
                }

                await this.updateCandidate(candidateId, 'generation_status', 'COMPLETED');
                await this.updateCandidate(candidateId, 'claim_validation_status', 'COMPLETED');

                // 7. ATOMIC JIT RECHECK AND ENQUEUE
                await this.updateCandidate(candidateId, 'outreach_status', 'PROCESSING');
                const { data: enqueueResult, error: enqueueErr } = await this.supabase.rpc('enqueue_approved_acquisition_message', {
                    p_run_id: config.runId,
                    p_campaign_id: config.campaignId,
                    p_canonical_contact_id: canonicalContactId,
                    p_generation_id: generation.generation_id
                });

                if (enqueueErr || !enqueueResult || !enqueueResult[0]?.success) {
                    const reason = enqueueErr ? enqueueErr.message : (enqueueResult?.[0]?.reason || 'UNKNOWN_JIT_FAIL');
                    await this.updateCandidate(candidateId, 'outreach_status', 'FAILED', `JIT_FAIL: ${reason}`);
                    continue;
                }

                await this.updateCandidate(candidateId, 'outreach_status', 'COMPLETED');
            }
        }
    }
}
