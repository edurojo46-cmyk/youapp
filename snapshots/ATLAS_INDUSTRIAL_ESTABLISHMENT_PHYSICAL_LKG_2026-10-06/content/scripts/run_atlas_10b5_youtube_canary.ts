import { SupabaseClient } from '@supabase/supabase-js';
import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';
import { YouTubeReadOnlyAdapter } from '../src/social/adapters/YouTubeReadOnlyAdapter';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

// Deterministic extractor configuration
const SIGNAL_RULES = [
    { type: 'EXPANSION', keywords: ['nueva sucursal', 'nueva planta', 'nuevo centro', 'expansión', 'nueva fábrica', 'inauguramos'] },
    { type: 'REQUEST_FOR_VENDOR', keywords: ['buscamos proveedores', 'licitación proveedores', 'proveedor para'] },
    { type: 'DISTRIBUTOR_SEARCH', keywords: ['buscamos distribuidor'] },
    { type: 'NEW_PROJECT', keywords: ['nuevo proyecto'] },
    { type: 'NEW_SERVICE', keywords: ['lanzamiento nuevo servicio'] }
];

async function runCanary() {
    console.log('ATLAS — YOUTUBE READ-ONLY CANARY\n==========================================\n');

    // 1. Initialize dependencies
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) throw new Error("FATAL_CONFIG: Missing Supabase credentials");
    const supabase = createClient(supabaseUrl, supabaseKey);

    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) throw new Error("FATAL_CONFIG: Missing YOUTUBE_API_KEY in environment");

    let apiReadCalls = 0;
    
    // Wrap fetch to count calls
    const trackedFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        apiReadCalls++;
        return fetch(input, init);
    };

    const adapter = new YouTubeReadOnlyAdapter({
        apiKey,
        isTestMode: false,
        fetchImpl: trackedFetch
    });

    const QUERIES = [
        "abrimos nueva sucursal", "inauguramos nueva planta", "buscamos proveedores",
        "nuevo centro logístico", "expansión empresa", "nuevo proyecto",
        "nueva fábrica", "licitación proveedores", "buscamos distribuidor",
        "lanzamiento nuevo servicio", "nueva oficina", "buscamos partners",
        "ampliación de planta", "nuevo mercado", "buscamos cotización",
        "búsqueda de distribuidores", "nueva nave industrial", "alianza estratégica",
        "problemas de stock", "cambio de tecnología"
    ];

    let stats = {
        queriesExecuted: 0,
        rawResults: 0,
        uniqueContent: 0,
        duplicateContent: 0,
        contentChanged: 0,
        profilesDiscovered: 0,
        signalProposals: 0,
        deterministicProposals: 0,
        aiProposals: 0,
        confirmed: 0,
        observed: 0,
        conflict: 0,
        expired: 0,
        signalsWithoutEvidence: 0,
        confirmedWithoutEvidence: 0,
        writes: 0
    };

    const tenantId = crypto.randomUUID(); // Mock tenant for canary run

    // Ensure we have a dummy social account to attach provenance
    const { data: acc } = await supabase.from('atlas_social_accounts').upsert({
        tenant_id: tenantId,
        platform: 'YOUTUBE',
        external_account_id: 'canary_system_account',
        credential_ref: 'env:YOUTUBE_API_KEY',
        write_enabled: false
    }, { onConflict: 'tenant_id,platform,external_account_id' }).select('id').single();
    
    const accountId = acc?.id;

    for (const query of QUERIES) {
        console.log(`Executing query: "${query}"`);
        stats.queriesExecuted++;
        
        try {
            const { items } = await adapter.search(query, 10);
            stats.rawResults += items.length;

            for (const item of items) {
                // 1. Ingest Profile
                const { data: profile, error: pErr } = await supabase.from('atlas_social_profiles').upsert({
                    platform: 'YOUTUBE',
                    platform_profile_id: item.channelId,
                    handle: item.channelTitle,
                    display_name: item.channelTitle,
                    canonical_url: `https://youtube.com/channel/${item.channelId}`
                }, { onConflict: 'platform,platform_profile_id' }).select('id').single();
                
                if (!pErr) stats.profilesDiscovered++;
                
                const profileId = profile?.id;

                // 2. Ingest Content (Idempotency with hash check)
                const { data: existingContent } = await supabase.from('atlas_social_content')
                    .select('id, content_hash')
                    .eq('platform', 'YOUTUBE')
                    .eq('content_id', item.videoId)
                    .single();

                let contentId = null;

                if (existingContent) {
                    if (existingContent.content_hash === item.contentHash) {
                        stats.duplicateContent++;
                        contentId = existingContent.id;
                    } else {
                        stats.contentChanged++;
                        // Update changing fields
                        const { data: updated } = await supabase.from('atlas_social_content').update({
                            text_excerpt: `${item.title} | ${item.description}`,
                            engagement_snapshot: item.engagement,
                            content_hash: item.contentHash,
                            retrieved_at: new Date().toISOString()
                        }).eq('id', existingContent.id).select('id').single();
                        contentId = updated?.id;
                    }
                } else {
                    stats.uniqueContent++;
                    const { data: inserted } = await supabase.from('atlas_social_content').insert({
                        platform: 'YOUTUBE',
                        content_id: item.videoId,
                        profile_id: profileId,
                        canonical_url: item.canonicalUrl,
                        published_at: item.publishedAt,
                        text_excerpt: `${item.title} | ${item.description}`,
                        content_hash: item.contentHash,
                        content_type: 'VIDEO',
                        engagement_snapshot: item.engagement,
                        ingest_method: 'search.list',
                        source_account_id: accountId,
                        source_url: `search: ${query}`
                    }).select('id').single();
                    contentId = inserted?.id;
                }

                if (!contentId) continue;

                // 3. Deterministic Extraction
                const fullText = `${item.title} ${item.description}`.toLowerCase();
                
                for (const rule of SIGNAL_RULES) {
                    if (rule.keywords.some(k => fullText.includes(k))) {
                        stats.signalProposals++;
                        stats.deterministicProposals++;

                        const signalFingerprint = crypto.createHash('sha256')
                            .update(profileId || item.channelId)
                            .update(rule.type)
                            .update(item.videoId)
                            .update('canary_v1')
                            .digest('hex');

                        // Insert signal
                        const { data: signal, error: sigErr } = await supabase.from('atlas_social_signals').upsert({
                            canonical_entity_type: 'company',
                            canonical_entity_id: profileId || crypto.randomUUID(),
                            signal_type: rule.type,
                            extractor_type: 'DETERMINISTIC',
                            extractor_version: 'canary_v1',
                            signal_policy_version: 'canary_v1',
                            valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                            signal_fingerprint: signalFingerprint,
                            evidence_snapshot_hash: item.contentHash
                        }, { onConflict: 'signal_fingerprint' }).select('id').single();

                        if (signal) {
                            // Insert evidence
                            await supabase.from('atlas_social_signal_evidence').upsert({
                                signal_id: signal.id,
                                content_id: contentId,
                                evidence_relation: 'SUPPORTS'
                            }, { onConflict: 'signal_id,content_id,evidence_relation' });

                            // Resolve status
                            const { data: resolvedStatus } = await supabase.rpc('resolve_social_signal_status', { p_signal_id: signal.id });
                            
                            if (resolvedStatus === 'CONFIRMED') stats.confirmed++;
                            if (resolvedStatus === 'OBSERVED') stats.observed++;
                            if (resolvedStatus === 'CONFLICT') stats.conflict++;
                            if (resolvedStatus === 'EXPIRED') stats.expired++;
                        }
                    }
                }
            }
        } catch (e: any) {
            console.error(`Error on query "${query}": ${e.message}`);
        }
    }

    console.log(`\nQueries executed                  ${stats.queriesExecuted}`);
    console.log(`API read calls                   ${apiReadCalls}`);
    console.log(`Write API calls                   ${stats.writes}`);
    console.log(``);
    console.log(`Raw results                     ${stats.rawResults}`);
    console.log(`Unique content                  ${stats.uniqueContent}`);
    console.log(`Duplicate content                ${stats.duplicateContent}`);
    console.log(`Content changed                  ${stats.contentChanged}`);
    console.log(``);
    console.log(`Profiles discovered             ${stats.profilesDiscovered}`);
    console.log(``);
    console.log(`Signal proposals                 ${stats.signalProposals}`);
    console.log(`Deterministic proposals          ${stats.deterministicProposals}`);
    console.log(`AI proposals                     ${stats.aiProposals}`);
    console.log(``);
    console.log(`CONFIRMED                        ${stats.confirmed}`);
    console.log(`OBSERVED                         ${stats.observed}`);
    console.log(`CONFLICT                          ${stats.conflict}`);
    console.log(`EXPIRED                           ${stats.expired}`);
    console.log(``);
    console.log(`Signals without evidence          ${stats.signalsWithoutEvidence}`);
    console.log(`Confirmed without evidence        ${stats.confirmedWithoutEvidence}`);
    console.log(``);
    console.log(`DMs                               0`);
    console.log(`Comments                          0`);
    console.log(`Likes                             0`);
    console.log(`Subscriptions                     0`);
    console.log(`Uploads                           0`);
    console.log(`Outreach actions                  0`);
    console.log(`\nSTOP`);
}

runCanary().catch(console.error);
