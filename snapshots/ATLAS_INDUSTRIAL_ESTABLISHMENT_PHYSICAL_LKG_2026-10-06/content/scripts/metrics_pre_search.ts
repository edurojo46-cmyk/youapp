import 'dotenv/config';
import { supabase } from '../src/lib/supabase';

async function countMetrics() {
    console.log("=== PRE-MIGRATION ATLAS METRICS ===");

    const { count: totalObs } = await supabase.from('atlas_person_observations')
        .select('*', { count: 'exact', head: true });
        
    const { data: gcbaObs } = await supabase.from('atlas_person_observations')
        .select('source_record_id').eq('source_id', 'gcba_open_data_funcionarios');
    const uniqueGcba = new Set(gcbaObs?.map(o => o.source_record_id)).size;
        
    const { data: orgObs } = await supabase.from('atlas_person_observations')
        .select('source_record_id').eq('source_id', 'ORGANIZATION_WEBSITE');
    const uniqueOrg = new Set(orgObs?.map(o => o.source_record_id)).size;
    
    const { count: totalPeople } = await supabase.from('atlas_people')
        .select('*', { count: 'exact', head: true });

    // Social counts from existing atlas_person_social_profiles
    const { count: totalSocials } = await supabase.from('atlas_person_social_profiles')
        .select('*', { count: 'exact', head: true });
    
    console.log(`TOTAL_PERSON_OBSERVATIONS = ${totalObs}`);
    console.log(`UNIQUE_OBSERVED_SUBJECTS = ${uniqueGcba + uniqueOrg}`);
    console.log(`GCBA_OBSERVED_SUBJECTS = ${uniqueGcba}`);
    console.log(`ORGANIZATION_OBSERVED_SUBJECTS = ${uniqueOrg}`);
    console.log(`CANONICAL_PEOPLE = ${totalPeople}`);
    console.log(`CURRENT_CANONICAL_SOCIAL_PROFILES = ${totalSocials}`);
}

countMetrics().catch(console.error);
