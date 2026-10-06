import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';
import { CampaignBrainWorker } from './brain/campaign_brain_worker';
import dotenv from 'dotenv';
import crypto from 'crypto';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SECRET_KEY;
if (!SUPABASE_SERVICE_KEY) { console.error('FATAL_CONFIG: Missing required SUPABASE_SECRET_KEY'); process.exit(1); }

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const testId = Math.random().toString(36).substring(2, 10);

async function run() {
    console.log(`\n=====================================`);
    console.log(`ATLAS CAMPAIGN BRAIN — TEST ${testId}`);
    console.log(`=====================================\n`);

    try {
        // 1. Create Campaign
        const { data: campaign } = await supabase.from('atlas_outreach_campaigns').insert({
            name: `BRAIN_TEST_${testId}`,
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

        let stats = { personalized: 0, generic: 0, rejected: 0, unsupported: 0 };
        const contactsMap: any = {};

        for (const tc of testCases) {
            // Insert Contact
            const emailHash = crypto.createHash('sha256').update(tc.email).digest('hex');
            const { data: contact } = await supabase.from('atlas_contacts').insert({
                email: tc.email,
                email_normalized: tc.email,
                email_hash: emailHash
            }).select('contact_id').single();
            
            contactsMap[contact.contact_id] = tc;

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
        const worker = new CampaignBrainWorker(supabase, `worker_${testId}`);
        for (let i = 0; i < 6; i++) {
            const result = await worker.processNextJob();
            if (result.success) {
                if (result.reason === 'APPROVED') {
                    // Let's check if it has claims (Personalized) or not (Generic)
                    const { data: claims } = await supabase.from('atlas_message_claims').select('*').eq('generation_id', result.generationId);
                    if (claims && claims.length > 0) stats.personalized++;
                    else stats.generic++;
                } else if (result.reason === 'REJECTED') {
                    stats.rejected++;
                    // Check if it has unsupported claims
                    const { data: claims } = await supabase.from('atlas_message_claims').select('*').eq('generation_id', result.generationId).eq('validation_status', 'UNSUPPORTED');
                    if (claims && claims.length > 0) stats.unsupported += claims.length;
                }
            }
        }

        console.log(`Contacts tested:                    6\n`);
        console.log(`Grounded personalized messages:     ${stats.personalized}`);
        console.log(`Generic fallbacks:                  ${stats.generic}`);
        console.log(`Rejected ambiguous profiles:        ${stats.rejected}\n`);
        console.log(`Unsupported personalization claims: ${stats.unsupported}`);
        console.log(`REAL LLM CALLS:                     0\n`);
        
        if (stats.personalized === 3 && stats.generic === 2 && stats.rejected === 1 && stats.unsupported === 2) {
            console.log(`CAMPAIGN BRAIN TEST = PASS ✅`);
        } else {
            console.log(`CAMPAIGN BRAIN TEST = FAILED ❌ (Unexpected distribution)`);
        }

    } catch (e) {
        console.error("Fatal Error:", e);
    }
}

run();
