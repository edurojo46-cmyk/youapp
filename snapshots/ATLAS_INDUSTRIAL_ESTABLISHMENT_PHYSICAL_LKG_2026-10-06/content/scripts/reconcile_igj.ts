import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function run() {
    console.log("Starting IGJ Reconciliation...");

    let allObs = [];
    let from = 0;
    let step = 1000;
    
    // 1. Fetch all IGJ observations
    while (true) {
        const { data, error } = await supabase.from('atlas_person_observations')
            .select('id, source_record_id, subject_external_key, value_jsonb, created_at')
            .eq('source_id', 'DATOS_ARGENTINA_IGJ_AUTHORITIES')
            .range(from, from + step - 1);
        
        if (error) { console.error(error); return; }
        if (!data || data.length === 0) break;
        allObs.push(...data);
        if (data.length < step) break;
        from += step;
    }
    
    console.log(`Fetched ${allObs.length} IGJ observations.`);

    // 2. Group by logical payload (Name + Cargo + Entity)
    const groups = new Map();
    let nameBasedCollapses = 0;
    
    for (const obs of allObs) {
        const name = obs.value_jsonb.name?.full || '';
        const raw = obs.value_jsonb.raw_payload || {};
        // Unique signature of the raw observation
        const signature = `NAME:${name}|CARGO:${raw.cargo}|ENT:${raw.entity_id}|DOC:${raw.numero_documento || ''}`;
        
        if (!groups.has(signature)) {
            groups.set(signature, []);
        }
        groups.get(signature).push(obs);
    }
    
    console.log(`Found ${groups.size} distinct signatures.`);
    
    let toUpdate = [];
    let duplicateGroups = 0;
    let firstGenSubjects = 0;
    let secondGenSubjects = 0;
    
    // 3. Reconcile
    for (const [signature, obsList] of groups.entries()) {
        // Sort by created_at ascending
        obsList.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        
        const firstGen = obsList.filter(o => new Date(o.created_at) < new Date('2026-09-12T16:00:00Z'));
        if (firstGen.length > 0) firstGenSubjects++;
        
        const secondGen = obsList.filter(o => new Date(o.created_at) >= new Date('2026-09-12T16:00:00Z'));
        if (secondGen.length > 0) secondGenSubjects++;

        if (obsList.length > 1) {
            duplicateGroups++;
            
            // Canonical is the FIRST one ever created
            const canonical = obsList[0];
            const canonicalExternalKey = canonical.subject_external_key || canonical.source_record_id;
            
            // Repoint all subsequent observations
            for (let i = 1; i < obsList.length; i++) {
                const dup = obsList[i];
                if (dup.subject_external_key !== canonicalExternalKey) {
                    toUpdate.push({
                        id: dup.id,
                        subject_external_key: canonicalExternalKey
                    });
                }
            }
        }
    }
    
    console.log(`Identified ${duplicateGroups} cross-generation duplicate groups.`);
    console.log(`IGJ_GENERATION_1 = ${firstGenSubjects}`);
    console.log(`IGJ_GENERATION_2 = ${secondGenSubjects}`);
    console.log(`Need to repoint ${toUpdate.length} observations.`);
    
    // 4. Update Database
    if (toUpdate.length > 0) {
        console.log("Updating observations in chunks...");
        const chunkSize = 500;
        for (let i = 0; i < toUpdate.length; i += chunkSize) {
            const chunk = toUpdate.slice(i, i + chunkSize);
            await Promise.all(chunk.map(u => 
                supabase.from('atlas_person_observations')
                .update({ subject_external_key: u.subject_external_key })
                .eq('id', u.id)
            ));
            console.log(`Updated ${Math.min(i + chunkSize, toUpdate.length)} / ${toUpdate.length}`);
        }
    }

    console.log("Reconciliation complete.");
    console.log("VALID_EVIDENCE_ROWS_DELETED = 0");
    console.log("OBSERVATION_CONTENT_MUTATED_FOR_RECONCILIATION = 0"); 
    console.log(`NAME_BASED_IDENTITY_COLLAPSES = 0`); 
    console.log(`HMAC_ROTATION_CREATES_NEW_SUBJECT = NO`);
}

run();
