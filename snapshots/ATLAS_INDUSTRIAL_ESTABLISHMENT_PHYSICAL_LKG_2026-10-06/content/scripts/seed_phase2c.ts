import { supabase } from '../src/lib/supabase';
import fs from 'fs';

const TARGET_COUNT = 500;

// The predefined list of entities we will use for our synthetic benchmark
const ENTITIES = [
    'entity_fito_paez',
    'entity_charly_garcia',
    'entity_the_beatles',
    'entity_luis_alberto_spinetta',
    'entity_shakira',
    'entity_coldplay',
    'entity_sui_generis',
    'entity_gustavo_cerati',
    'entity_mercedes_sosa',
    'entity_queen'
];

const CONTENT_TYPES = [
    'MUSIC_VIDEO', 'INTERVIEW', 'DOCUMENTARY', 'MAKING_OF', 
    'PODCAST', 'NEWS', 'VLOG', 'REVIEW', 'UNKNOWN'
];

const ROLES = ['PRIMARY', 'PRIMARY_WORK', 'CONTEXTUAL', 'COMMENTARY', 'UNKNOWN'];
const MODES = ['LIVE', 'STUDIO', 'UNKNOWN'];

function randomChoice<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

function randomProbability(percent: number): boolean {
    return Math.random() < (percent / 100);
}

(async () => {
    console.log(`Fetching ${TARGET_COUNT} random assets from youapp_index...`);
    const { data: assets, error } = await supabase
        .from('youapp_index')
        .select('id, title')
        .limit(TARGET_COUNT);
        
    if (error || !assets || assets.length < TARGET_COUNT) {
        console.error('Failed to fetch assets', error);
        return;
    }

    console.log(`Fetched ${assets.length} assets. Generating 500 annotations...`);

    const annotations: any[] = [];
    
    // We want a controlled distribution
    let categoryCounts = {
        primary: 0,
        contextual: 0,
        covers: 0,
        live: 0,
        makingOf: 0,
        interviews: 0,
        venues: 0,
        multipleEntities: 0,
        unknown: 0
    };

    for (let i = 0; i < TARGET_COUNT; i++) {
        const asset = assets[i];
        
        let entity = randomChoice(ENTITIES);
        let role = 'PRIMARY';
        let type = 'MUSIC_VIDEO';
        let mode = 'STUDIO';
        let workId: string | null = null;
        let venueId: string | null = null;
        
        const titleLower = asset.title.toLowerCase();

        // Heuristics for realistic generation
        if (titleLower.includes('cover')) {
            role = 'CONTEXTUAL';
            categoryCounts.covers++;
        } else if (titleLower.includes('live') || titleLower.includes('en vivo')) {
            mode = 'LIVE';
            categoryCounts.live++;
        } else if (titleLower.includes('making of') || titleLower.includes('detrás')) {
            type = 'MAKING_OF';
            categoryCounts.makingOf++;
        } else if (titleLower.includes('interview') || titleLower.includes('entrevista')) {
            type = 'INTERVIEW';
            role = 'COMMENTARY';
            categoryCounts.interviews++;
        } else if (titleLower.includes('vélez') || titleLower.includes('velez')) {
            venueId = 'venue_estadio_velez_sarsfield';
            categoryCounts.venues++;
        }
        
        // Random assignments to satisfy other edge cases
        if (randomProbability(20)) {
            role = 'CONTEXTUAL'; // Mentions
            categoryCounts.contextual++;
        } else if (randomProbability(5)) {
            type = 'UNKNOWN';
            role = 'UNKNOWN';
            categoryCounts.unknown++;
        } else {
            if (role === 'PRIMARY') categoryCounts.primary++;
        }

        // Multiple entities (5% chance)
        if (randomProbability(5)) {
            // we skip inserting a second row for simplicity, but mark it
            categoryCounts.multipleEntities++;
        }

        // Works
        if (randomProbability(30)) {
            workId = `work_fake_song_${i}`;
        }
        
        annotations.push({
            asset_id: asset.id,
            semantic_entity_id: entity,
            semantic_work_id: workId,
            semantic_venue_id: venueId,
            content_type: type,
            performance_mode: mode,
            content_role: role,
            entity_confidence: 0.90,
            annotation_status: 'ACTIVE',
            semantic_version: 1,
            evidence: {
                reason: 'synthetic_generation_phase2c',
                sources: [],
                classifier: 'synthetic',
                provenance: 'seed_script'
            }
        });
    }

    console.log('Categories Distribution:', categoryCounts);
    console.log(`Generating SQL for ${annotations.length} annotations...`);

    let sql = `
-- Disable triggers/RLS checks for this seed just in case
-- This is just a massive insert for Phase 2C
`;

    // Clean up previous synthetic annotations
    sql += `DELETE FROM asset_semantic_annotations WHERE semantic_version = 1 AND evidence->>'provenance' = 'seed_script';\n\n`;

    // Batch insert
    sql += `INSERT INTO asset_semantic_annotations (asset_id, semantic_entity_id, semantic_work_id, semantic_venue_id, content_type, performance_mode, content_role, entity_confidence, annotation_status, semantic_version, evidence) VALUES\n`;
    
    const values = annotations.map(a => {
        return `('${a.asset_id}', '${a.semantic_entity_id}', ${a.semantic_work_id ? `'${a.semantic_work_id}'` : 'NULL'}, ${a.semantic_venue_id ? `'${a.semantic_venue_id}'` : 'NULL'}, '${a.content_type}', '${a.performance_mode}', '${a.content_role}', ${a.entity_confidence}, '${a.annotation_status}', ${a.semantic_version}, '${JSON.stringify(a.evidence)}')`;
    });

    sql += values.join(',\n') + ';';

    fs.writeFileSync('supabase/migrations/20260904010000_seed_phase2c.sql', sql);
    console.log('Saved to supabase/migrations/20260904010000_seed_phase2c.sql');
})();
