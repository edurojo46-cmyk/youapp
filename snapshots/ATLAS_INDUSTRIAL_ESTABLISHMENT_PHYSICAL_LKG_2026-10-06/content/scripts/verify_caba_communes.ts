import 'dotenv/config';
import { supabase } from '../src/lib/supabase';

async function verifyCommunes() {
    console.log("=== COMMUNE VERIFICATION ===");
    
    // 1. Get CABA geography_id
    const { data: caba } = await supabase.from('atlas_geographies')
        .select('geography_id')
        .eq('geography_type', 'AUTONOMOUS_CITY')
        .limit(1)
        .single();
        
    if (!caba) {
        console.error("CABA not found in atlas_geographies");
        return;
    }
    const cabaId = caba.geography_id;

    // 2. Find all Communes
    const { data: communes, count: communeCount } = await supabase.from('atlas_geographies')
        .select('geography_id, name')
        .eq('geography_type', 'COMUNA');
        
    console.log(`CABA_COMMUNES_COUNT = ${communes?.length || 0}`);
    
    // 3. Verify Containment
    let containedInCaba = 0;
    const { data: relationships } = await supabase.from('atlas_geography_relationships')
        .select('*')
        .eq('parent_geography_id', cabaId)
        .eq('relationship_type', 'CONTAINED_IN');
        
    const parentChildrenIds = new Set(relationships?.map(r => r.child_geography_id));
    
    let missingContainment = 0;
    const ids = new Set();
    let duplicates = 0;
    
    for (const c of communes || []) {
        if (parentChildrenIds.has(c.geography_id)) {
            containedInCaba++;
        } else {
            missingContainment++;
            console.log(`WARNING: Commune ${c.name} is NOT contained in CABA!`);
        }
        
        if (ids.has(c.geography_id)) {
            duplicates++;
        }
        ids.add(c.geography_id);
    }
    
    console.log(`CABA_COMMUNE_CONTAINMENT_EDGES = ${containedInCaba}`);
    console.log(`DUPLICATE_COMMUNES = ${duplicates}`);
    
    if (communes?.length === 15 && containedInCaba === 15 && duplicates === 0) {
        console.log("CABA_COMMUNES_REUSED = PASS");
    } else {
        console.log("CABA_COMMUNES_REUSED = FAIL");
    }
}

verifyCommunes().catch(console.error);
