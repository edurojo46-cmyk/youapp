import fs from 'fs';

const MANIFEST_PATH = 'phase2c_cohort_manifest.json';
const PILOT_PATH = 'phase2c_gold_pilot.json';
const PILOT_SIZE = 50;

function buildPilot() {
    if (!fs.existsSync(MANIFEST_PATH)) {
        console.error('Manifest not found at', MANIFEST_PATH);
        return;
    }
    
    const manifestData = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
    const manifest = manifestData.manifest;
    
    // We can select the first 50, but let's try to ensure a diverse mix from the manifest
    const pilotItems: any[] = [];
    
    // Target distribution for pilot
    const targets: Record<string, number> = {
        candidate_primary: 10,
        candidate_contextual: 8, // we don't have enough in manifest actually (0), will fall back
        candidate_live: 5,
        candidate_cover: 5,
        candidate_interview: 5,
        candidate_making_of: 4,
        candidate_multiple_entity: 4,
        candidate_ambiguous: 4,
        candidate_unknown: 5
    };
    
    let counts: Record<string, number> = { ...targets };
    Object.keys(counts).forEach(k => counts[k] = 0);
    
    for (const asset of manifest) {
        if (pilotItems.length >= PILOT_SIZE) break;
        
        const bucket = asset.primary_sampling_bucket;
        
        if (targets[bucket] && counts[bucket] < targets[bucket]) {
            pilotItems.push(asset);
            counts[bucket]++;
        }
    }
    
    // Fill the rest up to 50
    for (const asset of manifest) {
        if (pilotItems.length >= PILOT_SIZE) break;
        if (!pilotItems.find(p => p.asset_id === asset.asset_id)) {
            pilotItems.push(asset);
            const bucket = asset.primary_sampling_bucket;
            counts[bucket] = (counts[bucket] || 0) + 1;
        }
    }
    
    console.log('Pilot distribution:', counts);
    
    // Build gold schema
    const goldPilot = {
        cohort_version: manifestData.cohort_version,
        pilot_size: PILOT_SIZE,
        labels: pilotItems.map(p => ({
            cohort_id: p.cohort_id,
            asset_id: p.asset_id,
            title: p.title, // For convenience during manual review
            expected_entity_id: null,
            expected_work_id: null,
            expected_venue_id: null,
            expected_content_type: null,
            expected_performance_mode: null,
            expected_content_role: null,
            expected_primary_identity: null,
            gold_status: 'PENDING_REVIEW',
            gold_confidence: null,
            gold_evidence: {
                title: true,
                description: false,
                provider_metadata: false,
                external_reference: false
            }
        }))
    };
    
    fs.writeFileSync(PILOT_PATH, JSON.stringify(goldPilot, null, 2));
    console.log(`Saved pilot to ${PILOT_PATH}`);
}

buildPilot();
