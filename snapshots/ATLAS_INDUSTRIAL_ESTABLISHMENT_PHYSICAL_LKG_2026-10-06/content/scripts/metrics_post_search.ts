import 'dotenv/config';
import { supabase } from '../src/lib/supabase';

async function countMetrics() {
    console.log("=== POST-PROJECTION ATLAS METRICS ===");

    const { count: totalObs } = await supabase.from('atlas_person_observations').select('*', { count: 'exact', head: true });
    const { count: uniqueSubj } = await supabase.from('atlas_observation_subjects').select('*', { count: 'exact', head: true });
    
    const { count: gcbaSubj } = await supabase.from('atlas_observation_subjects').select('*', { count: 'exact', head: true }).eq('source_id', 'gcba_open_data_funcionarios');
    const { count: orgSubj } = await supabase.from('atlas_observation_subjects').select('*', { count: 'exact', head: true }).eq('source_id', 'ORGANIZATION_WEBSITE');
    
    const { count: canonical } = await supabase.from('atlas_people').select('*', { count: 'exact', head: true });
    const { count: obsOnly } = await supabase.from('atlas_observation_subjects').select('*', { count: 'exact', head: true }).is('canonical_person_id', null);
    
    const { count: cabaDirect } = await supabase.from('atlas_subject_geographies').select('*', { count: 'exact', head: true }); // We only inserted CABA
    
    const { count: subjectsWithSocial } = await supabase.from('atlas_subject_social_profiles').select('subject_id', { count: 'exact', head: true });
    const { count: fb } = await supabase.from('atlas_all_social_profiles').select('*', { count: 'exact', head: true }).eq('platform_id', 'FACEBOOK');
    const { count: ig } = await supabase.from('atlas_all_social_profiles').select('*', { count: 'exact', head: true }).eq('platform_id', 'INSTAGRAM');
    const { count: ln } = await supabase.from('atlas_all_social_profiles').select('*', { count: 'exact', head: true }).eq('platform_id', 'LINKEDIN');
    const { count: x } = await supabase.from('atlas_all_social_profiles').select('*', { count: 'exact', head: true }).eq('platform_id', 'X');
    const { count: gh } = await supabase.from('atlas_all_social_profiles').select('*', { count: 'exact', head: true }).eq('platform_id', 'GITHUB');
    const { count: orcid } = await supabase.from('atlas_all_social_profiles').select('*', { count: 'exact', head: true }).eq('platform_id', 'ORCID');

    console.log(`TOTAL_PERSON_OBSERVATIONS = ${totalObs}`);
    console.log(`UNIQUE_OBSERVED_SUBJECTS = ${uniqueSubj}`);
    console.log(`GCBA_OBSERVED_SUBJECTS = ${gcbaSubj}`);
    console.log(`ORGANIZATION_OBSERVED_SUBJECTS = ${orgSubj}`);
    console.log(`CANONICAL_PEOPLE = ${canonical}`);
    console.log(`OBSERVATION_ONLY_SUBJECTS = ${obsOnly}`);
    console.log(`CABA_DIRECT_RELATION_SUBJECTS = ${cabaDirect}`);
    console.log(`CABA_BROAD_RELATION_SUBJECTS = 0`); // We didn't do broad yet
    console.log(`SUBJECTS_WITH_ANY_SOCIAL = ${subjectsWithSocial}`);
    
    console.log(`FACEBOOK = ${fb}`);
    console.log(`INSTAGRAM = ${ig}`);
    console.log(`LINKEDIN = ${ln}`);
    console.log(`X = ${x}`);
    console.log(`GITHUB = ${gh}`);
    console.log(`ORCID = ${orcid}`);
    
    console.log("\n=== SEARCH TESTS ===");
    
    // personas en CABA
    const { count: pCaba } = await supabase.from('atlas_argentina_people_search_v1')
        .select('*', { count: 'exact', head: true })
        .not('geography_id', 'is', null);
    
    // funcionarios en CABA
    const { count: fCaba } = await supabase.from('atlas_argentina_people_search_v1')
        .select('*', { count: 'exact', head: true })
        .not('geography_id', 'is', null)
        .eq('relation_type', 'PUBLIC_ROLE_IN');
        
    // personas con LinkedIn en CABA
    const { data: cData } = await supabase.from('atlas_argentina_people_search_v1')
        .select('social_profiles')
        .not('geography_id', 'is', null);
        
    let linkedInCount = 0;
    let igCount = 0;
    let fbCount = 0;
    
    for (const row of cData || []) {
        if (row.social_profiles && Array.isArray(row.social_profiles)) {
            if (row.social_profiles.some((s: any) => s.platform === 'LINKEDIN')) linkedInCount++;
            if (row.social_profiles.some((s: any) => s.platform === 'INSTAGRAM')) igCount++;
            if (row.social_profiles.some((s: any) => s.platform === 'FACEBOOK')) fbCount++;
        }
    }
    
    console.log(`PERSONAS_CABA_RESULTS = ${pCaba}`);
    console.log(`FUNCIONARIOS_CABA_RESULTS = ${fCaba}`);
    console.log(`FACEBOOK_CABA_RESULTS = ${fbCount}`);
    console.log(`INSTAGRAM_CABA_RESULTS = ${igCount}`);
    console.log(`LINKEDIN_CABA_RESULTS = ${linkedInCount}`);
}

countMetrics().catch(console.error);
