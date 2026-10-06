import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';
import * as crypto from 'crypto';

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY || '';
const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

function sha256(str: string) {
    return crypto.createHash('sha256').update(str).digest('hex');
}

async function run() {
    // 1. Get or create testing tenant
    const { data: users } = await adminSupabase.auth.admin.listUsers();
    let user = users.users.find(u => u.email === 'tenant-real-canary@test.com');
    if (!user) {
        const res = await adminSupabase.auth.admin.createUser({ email: 'tenant-real-canary@test.com', password: 'TestPassword123!', email_confirm: true });
        user = res.data.user!;
        await adminSupabase.from('atlas_tenants').insert({ tenant_id: user.id });
    }
    const TENANT_ID = user.id;

    // 2. Create Envelope
    const ENV_ID = crypto.randomUUID();
    
    // Clear old envelopes for this user just in case
    await adminSupabase.from('atlas_canary_allowed_destinations').delete().eq('tenant_id', TENANT_ID);
    await adminSupabase.from('atlas_canary_envelopes').delete().eq('tenant_id', TENANT_ID);

    const startAt = new Date(); startAt.setDate(startAt.getDate() - 1);
    const endAt = new Date(); endAt.setDate(endAt.getDate() + 1);

    await adminSupabase.from('atlas_canary_envelopes').insert({
        envelope_id: ENV_ID,
        tenant_id: TENANT_ID,
        canary_enabled: true,
        allowed_provider: 'SES',
        allowed_action: 'EMAIL_SEND',
        max_external_effects: 3,
        claimed_effects: 0,
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString()
    });

    // 3. Add 3 Exact Destinations
    const dests = [
        'success@simulator.amazonses.com',
        'bounce@simulator.amazonses.com',
        'complaint@simulator.amazonses.com'
    ];

    for (const d of dests) {
        const h = sha256(d);
        await adminSupabase.from('atlas_canary_allowed_destinations').insert({
            tenant_id: TENANT_ID,
            envelope_id: ENV_ID,
            destination_hash: h,
            destination_class: 'SES_SIMULATOR',
            is_enabled: true
        });
        console.log(`Added ${d} with hash ${h}`);
    }

    console.log('Real Canary Envelopes and Destinations prepared.');
}

run().catch(console.error);
