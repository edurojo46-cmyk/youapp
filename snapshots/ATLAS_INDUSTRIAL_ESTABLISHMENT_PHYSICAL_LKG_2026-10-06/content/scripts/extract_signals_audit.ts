import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

async function extractSignals() {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) throw new Error("Missing Supabase credentials");
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: signals, error } = await supabase
        .from('atlas_social_signals')
        .select(`
            id,
            signal_type,
            status,
            extractor_type,
            evidence:atlas_social_signal_evidence(
                content:atlas_social_content(
                    content_id,
                    text_excerpt,
                    published_at,
                    profile:atlas_social_profiles(
                        display_name,
                        handle
                    )
                )
            )
        `)
        .eq('extractor_version', 'canary_v1');

    if (error) throw error;
    
    fs.writeFileSync('C:/Users/Eduardo/.gemini/antigravity-ide/brain/6aacf1b1-9f5b-4af0-bc20-4636248c0f21/scratch/extracted_signals.json', JSON.stringify(signals, null, 2));
    console.log(`Extracted ${signals.length} signals.`);
}

extractSignals().catch(console.error);
