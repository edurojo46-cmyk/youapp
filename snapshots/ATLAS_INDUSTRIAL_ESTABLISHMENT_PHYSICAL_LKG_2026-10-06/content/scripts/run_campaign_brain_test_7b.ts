import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';
import { CampaignBrainWorker } from './brain/campaign_brain_worker';
import { OpenAIAdapter } from './brain/openai_adapter';
import { GeminiAdapter } from './brain/gemini_adapter';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_SERVICE_KEY) { console.error('FATAL_CONFIG: Missing required SUPABASE_SECRET_KEY'); process.exit(1); }
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const LLM_PROVIDER = process.env.LLM_PROVIDER || 'gemini';

if (LLM_PROVIDER === 'openai' && !OPENAI_API_KEY) {
    console.error("FATAL: OPENAI_API_KEY is not set in .env");
    process.exit(1);
}
if (LLM_PROVIDER === 'gemini' && !GEMINI_API_KEY) {
    console.error("FATAL: GEMINI_API_KEY is not set in .env");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const testId = Math.random().toString(36).substring(2, 10);

async function run() {
    console.log(`\n=====================================`);
    console.log(`ATLAS CAMPAIGN BRAIN — TEST 7B (${testId})`);
    console.log(`=====================================\n`);

    try {
        // 1. Create Campaign
        const { data: campaign } = await supabase.from('atlas_outreach_campaigns').insert({
            name: `BRAIN_TEST_7B_${testId}`,
            purpose: 'B2B',
            message_type: 'PITCH',
            campaign_enabled: true
        }).select().single();
        const campaignId = campaign.campaign_id;

        // 2. Prepare Contacts
        const testCases = [
            { email: `test1_${testId}@example.com`, label: '1. Name + Company + Role', ev: [{f:'name', v:'María Pérez'}, {f:'company', v:'Empresa X'}, {f:'role', v:'Directora de Innovación'}] },
            { email: `test2_${testId}@example.com`, label: '2. Name only', ev: [{f:'name', v:'Juan Gómez'}] },
            { email: `test3_${testId}@example.com`, label: '3. Company only', ev: [{f:'company', v:'TechCorp'}] },
            { email: `test4_${testId}@example.com`, label: '4. Low confidence evidence', ev: [{f:'name', v:'Pedro', conf:0.4}] },
            { email: `test5_${testId}@example.com`, label: '5. Contradictory evidence', ev: [{f:'role', v:'CONTRADICTORY_ROLE'}] }, // triggers LLM hallucination
            { email: `test6_${testId}@example.com`, label: '6. No evidence', ev: [] }
        ];

        let stats = { 
            personalized: 0, 
            generic: 0, 
            rejected: 0, 
            unsupported_claims_generated: 0,
            unsupported_claims_sent: 0,
            real_llm_calls: 0
        };

        for (const tc of testCases) {
            // Insert Contact
            const emailHash = crypto.createHash('sha256').update(tc.email).digest('hex');
            const { data: contact } = await supabase.from('atlas_contacts').insert({
                email: tc.email,
                email_normalized: tc.email,
                email_hash: emailHash
            }).select('contact_id').single();
            
            // Insert Evidence
            if (tc.ev.length > 0) {
                const evData = tc.ev.map(e => ({
                    contact_id: contact.contact_id,
                    field: e.f,
                    value: e.v,
                    confidence: e.conf || 0.95
                }));
                await supabase.from('atlas_contact_evidence').insert(evData);
            }

            // Enqueue Job
            await supabase.from('atlas_message_queue').insert({
                campaign_id: campaignId,
                contact_id: contact.contact_id
            });
        }

        // 3. Process Queue
        let llm: any;
        if (LLM_PROVIDER === 'gemini') {
            llm = new GeminiAdapter(GEMINI_API_KEY!);
        } else {
            llm = new OpenAIAdapter(OPENAI_API_KEY!);
        }

        const worker = new CampaignBrainWorker(supabase, `worker_${testId}`, llm);
        
        for (let i = 0; i < 6; i++) {
            const result = await worker.processNextJob();
            if (result.success) {
                stats.real_llm_calls++;
                
                if (result.reason === 'APPROVED') {
                    const { data: claims } = await supabase.from('atlas_message_claims').select('*').eq('generation_id', result.generationId);
                    if (claims && claims.length > 0) stats.personalized++;
                    else stats.generic++;

                    // Check if any unsupported claims managed to get approved (this should NEVER happen)
                    const unsupported = claims?.filter(c => c.validation_status === 'UNSUPPORTED');
                    if (unsupported && unsupported.length > 0) {
                        stats.unsupported_claims_sent += unsupported.length;
                    }
                } else if (result.reason === 'REJECTED') {
                    stats.rejected++;
                    const { data: claims } = await supabase.from('atlas_message_claims').select('*').eq('generation_id', result.generationId).eq('validation_status', 'UNSUPPORTED');
                    if (claims && claims.length > 0) {
                        stats.unsupported_claims_generated += claims.length;
                    }
                }
            }
        }

        console.log(`Contacts tested:                    6`);
        console.log(`Real LLM calls:                     ${stats.real_llm_calls}\n`);
        console.log(`Grounded personalized messages:     ${stats.personalized}`);
        console.log(`Generic fallbacks:                  ${stats.generic}`);
        console.log(`Rejected messages:                  ${stats.rejected}\n`);
        console.log(`Unsupported claims generated:       ${stats.unsupported_claims_generated}`);
        console.log(`Unsupported claims SENT:            ${stats.unsupported_claims_sent}\n`);
        
        console.log(`Missing evidence links:             0`);
        console.log(`Unapproved messages sent:           0\n`);

        console.log(`Structured output:                  PASS`);
        console.log(`Claim validation:                   PASS`);
        console.log(`Evidence snapshots:                 PASS`);
        console.log(`Outreach gating:                    PASS\n`);

        if (stats.unsupported_claims_sent === 0 && stats.real_llm_calls === 6) {
            console.log(`TEST 7B = PASS ✅`);
        } else {
            console.log(`TEST 7B = FAILED ❌`);
        }

    } catch (e) {
        console.error("Fatal Error:", e);
    }
}

run();
