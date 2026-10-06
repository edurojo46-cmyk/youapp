import { supabase } from '../src/lib/supabase';
import fs from 'fs';
import crypto from 'crypto';

const TARGET_COUNT = 500;
const MANIFEST_PATH = 'phase2c_cohort_manifest.json';
const VERSION = 'P2C_GOLD_500_V1';

async function buildManifest() {
    console.log(`Fetching random assets from youapp_index...`);
    const { data: assets, error } = await supabase
        .from('youapp_index')
        .select('id, title, description, url, provider, provider_content_id, source, content_format')
        .limit(20000); // fetch more to filter down
        
    if (error || !assets || assets.length < TARGET_COUNT) {
        console.error('Failed to fetch assets', error);
        return;
    }

    console.log(`Analyzing assets for sampling buckets...`);
    
    // We want a controlled distribution
    const targets = {
        candidate_primary: 150,
        candidate_contextual: 60,
        candidate_live: 50,
        candidate_interview: 40,
        candidate_cover: 35,
        candidate_making_of: 30,
        candidate_multiple_entity: 30,
        candidate_venue: 25,
        candidate_version: 25,
        candidate_ambiguous: 25,
        candidate_unknown: 30
    };
    
    const manifest = [];
    
    // We shuffle the array to ensure randomness
    const shuffledAssets = assets.sort(() => 0.5 - Math.random());
    
    let bucketCounts: Record<string, number> = {
        candidate_primary: 0,
        candidate_contextual: 0,
        candidate_live: 0,
        candidate_interview: 0,
        candidate_cover: 0,
        candidate_making_of: 0,
        candidate_multiple_entity: 0,
        candidate_venue: 0,
        candidate_version: 0,
        candidate_ambiguous: 0,
        candidate_unknown: 0
    };

    let i = 0;
    while (manifest.length < TARGET_COUNT && i < shuffledAssets.length) {
        const asset = shuffledAssets[i];
        i++;
        
        const titleLower = asset.title.toLowerCase();
        let bucket = 'candidate_unknown';
        let secondary = [];
        let reason = 'Fallback bucket';
        
        // Sampling heuristics (NOT ground truth!)
        if (titleLower.includes('cover') || titleLower.includes('tributo')) {
            if (bucketCounts.candidate_cover < targets.candidate_cover) {
                bucket = 'candidate_cover';
                reason = 'title contains cover/tributo';
            }
        } else if (titleLower.includes('live') || titleLower.includes('en vivo')) {
            if (bucketCounts.candidate_live < targets.candidate_live) {
                bucket = 'candidate_live';
                reason = 'title contains live/en vivo';
            }
        } else if (titleLower.includes('making of') || titleLower.includes('detrás')) {
            if (bucketCounts.candidate_making_of < targets.candidate_making_of) {
                bucket = 'candidate_making_of';
                reason = 'title contains making of';
            }
        } else if (titleLower.includes('entrevista') || titleLower.includes('interview')) {
            if (bucketCounts.candidate_interview < targets.candidate_interview) {
                bucket = 'candidate_interview';
                reason = 'title contains entrevista';
            }
        } else if (titleLower.includes('vélez') || titleLower.includes('estadio') || titleLower.includes('luna park')) {
            if (bucketCounts.candidate_venue < targets.candidate_venue) {
                bucket = 'candidate_venue';
                reason = 'title contains venue names';
            }
        } else if (titleLower.includes('remix') || titleLower.includes('version')) {
            if (bucketCounts.candidate_version < targets.candidate_version) {
                bucket = 'candidate_version';
                reason = 'title contains remix/version';
            }
        } else if (titleLower.includes('feat') || titleLower.includes('ft.') || titleLower.includes(' y ')) {
            if (bucketCounts.candidate_multiple_entity < targets.candidate_multiple_entity) {
                bucket = 'candidate_multiple_entity';
                reason = 'title contains multiple artists hints';
            }
        } else if (titleLower.split(' ').length > 10) {
            if (bucketCounts.candidate_ambiguous < targets.candidate_ambiguous) {
                bucket = 'candidate_ambiguous';
                reason = 'very long title, could be ambiguous';
            }
        } else if (titleLower.includes('menciona') || titleLower.includes('habla de')) {
            if (bucketCounts.candidate_contextual < targets.candidate_contextual) {
                bucket = 'candidate_contextual';
                reason = 'title implies mention';
            }
        } else if (titleLower.includes('homenaje')) {
            if (bucketCounts.candidate_contextual < targets.candidate_contextual) {
                bucket = 'candidate_contextual';
                reason = 'homenaje implies contextual';
            }
        } else {
            // Assume primary if nothing else matched and we still need primaries
            if (bucketCounts.candidate_primary < targets.candidate_primary) {
                bucket = 'candidate_primary';
                reason = 'Default to primary candidate';
            }
        }

        // If bucket is full, we try to put it in unknown, or skip
        if (bucket === 'candidate_unknown' || bucketCounts[bucket] >= (targets as any)[bucket]) {
            if (bucketCounts.candidate_unknown < targets.candidate_unknown) {
                bucket = 'candidate_unknown';
                reason = 'Bucket full or no matching heuristic';
            } else {
                continue; // We already have enough of this bucket and unknown is full
            }
        }
        
        // Add some secondary tags
        if (titleLower.includes('live')) secondary.push('has_live_keyword');
        if (titleLower.includes('cover')) secondary.push('has_cover_keyword');

        bucketCounts[bucket]++;
        
        const cohort_id = `P2C-${String(manifest.length + 1).padStart(4, '0')}`;
        
        manifest.push({
            cohort_id,
            asset_id: asset.id,
            provider: asset.provider,
            provider_asset_id: asset.provider_content_id,
            canonical_asset_id: asset.id, // using id since external_id isn't there
            title: asset.title,
            description: asset.description,
            url: asset.url,
            raw_metadata: { type: asset.content_format, source: asset.source },
            primary_sampling_bucket: bucket,
            secondary_sampling_tags: secondary,
            selection_reason: reason
        });
    }

    if (manifest.length < TARGET_COUNT) {
        console.warn(`\nWARNING: Could not fill all buckets exactly. Total reached: ${manifest.length}. Fetching more or relaxing constraints...`);
        
        // Find unpicked assets
        const pickedIds = new Set(manifest.map(m => m.asset_id));
        let unpicked = shuffledAssets.filter(a => !pickedIds.has(a.id));
        
        let j = 0;
        while (manifest.length < TARGET_COUNT && j < unpicked.length) {
            const asset = unpicked[j];
            j++;
            
            manifest.push({
                cohort_id: `P2C-${String(manifest.length + 1).padStart(4, '0')}`,
                asset_id: asset.id,
                provider: asset.provider,
                provider_asset_id: asset.provider_content_id,
                canonical_asset_id: asset.id,
                title: asset.title,
                description: asset.description,
                url: asset.url,
                raw_metadata: { type: asset.content_format, source: asset.source },
                primary_sampling_bucket: 'candidate_unknown',
                secondary_sampling_tags: [],
                selection_reason: 'Forced to reach 500'
            });
            bucketCounts.candidate_unknown++;
        }
    }

    console.log(`\nFinal bucket counts:`);
    console.table(bucketCounts);
    
    // Total sum verification
    const total = Object.values(bucketCounts).reduce((a, b) => a + b, 0);
    console.log(`\nTotal assets in manifest: ${total}`);

    // Create stable hash
    const manifestData = {
        cohort_version: VERSION,
        asset_count: manifest.length,
        timestamp: new Date().toISOString(),
        manifest: manifest,
        manifest_sha256: ''
    };
    
    const hash = crypto.createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
    manifestData.manifest_sha256 = hash;
    
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifestData, null, 2));
    console.log(`Saved manifest to ${MANIFEST_PATH}`);
    console.log(`Manifest SHA256: ${hash}`);
}

buildManifest().catch(console.error);
