import 'dotenv/config';
import { supabase } from '../src/lib/supabase';

async function generateReport() {
    console.log("=== PRE-UI DATA COVERAGE REPORT ===");
    
    // TOTAL_UNIQUE_SUBJECTS
    const { count: totalSubjects } = await supabase.from('atlas_observation_subjects')
        .select('subject_id', { count: 'exact', head: true });
    console.log(`TOTAL_UNIQUE_SUBJECTS = ${totalSubjects}`);

    // CABA_SUBJECTS (using the RPC with caba ID or just filtering projection)
    const cabaId = '75865af3-f102-4719-8c25-ebca47fc2d5b'; // CABA
    const { data: cabaRes } = await supabase.rpc('search_argentina_people_v1', { p_geography_id: cabaId });
    console.log(`CABA_SUBJECTS = ${cabaRes?.total_matching_subjects || 0}`);

    // WITH_EXACT_DOB
    const { data: dobRows } = await supabase.from('atlas_argentina_people_search_projection_v1')
        .select('subject_id')
        .eq('age_evidence_type', 'EXACT_DOB');
    const uniqueDobSubjects = new Set(dobRows?.map(r => r.subject_id)).size;
    console.log(`WITH_EXACT_DOB = ${uniqueDobSubjects}`);

    // WITH_BIRTH_YEAR
    const { data: yearRows } = await supabase.from('atlas_argentina_people_search_projection_v1')
        .select('subject_id')
        .eq('age_evidence_type', 'BIRTH_YEAR');
    const uniqueYearSubjects = new Set(yearRows?.map(r => r.subject_id)).size;
    console.log(`WITH_BIRTH_YEAR = ${uniqueYearSubjects}`);

    // WITH_REPORTED_AGE
    const { data: ageRows } = await supabase.from('atlas_argentina_people_search_projection_v1')
        .select('subject_id')
        .eq('age_evidence_type', 'REPORTED_AGE');
    const uniqueAgeSubjects = new Set(ageRows?.map(r => r.subject_id)).size;
    console.log(`WITH_REPORTED_AGE = ${uniqueAgeSubjects}`);

    // WITH_ANY_AGE_EVIDENCE
    const withAnyAge = uniqueDobSubjects + uniqueYearSubjects + uniqueAgeSubjects;
    console.log(`WITH_ANY_AGE_EVIDENCE = ${withAnyAge}`);

    // AGE_49_59_CABA
    const { data: ageCabaRes } = await supabase.rpc('search_argentina_people_v1', { p_geography_id: cabaId, p_age_min: 49, p_age_max: 59 });
    console.log(`AGE_49_59_CABA = ${ageCabaRes?.total_matching_subjects || 0}`);

    // WITH_NORMALIZED_PROFESSION
    const { data: profRows } = await supabase.from('atlas_argentina_people_search_projection_v1')
        .select('subject_id')
        .not('normalized_profession_id', 'is', null);
    const uniqueProfSubjects = new Set(profRows?.map(r => r.subject_id)).size;
    console.log(`WITH_NORMALIZED_PROFESSION = ${uniqueProfSubjects}`);

    // LAWYERS_CABA
    const { data: lawyersRes } = await supabase.rpc('search_argentina_people_v1', { p_geography_id: cabaId, p_profession_ids: ['LAWYER'] });
    console.log(`LAWYERS_CABA = ${lawyersRes?.total_matching_subjects || 0}`);

    // WITH_COMMUNE_RELATION
    // Any geography that is a commune (we can check geography_name if it starts with 'Comuna')
    const { data: communeRows } = await supabase.from('atlas_argentina_people_search_projection_v1')
        .select('subject_id')
        .ilike('geography_name', 'Comuna%');
    const uniqueCommuneSubjects = new Set(communeRows?.map(r => r.subject_id)).size;
    console.log(`WITH_COMMUNE_RELATION = ${uniqueCommuneSubjects}`);

    // SOCIALS
    const { data: allRows } = await supabase.from('atlas_argentina_people_search_projection_v1')
        .select('subject_id, social_profiles')
        .not('social_profiles', 'eq', '[]');

    let anySocial = new Set();
    let fb = new Set();
    let ig = new Set();
    let li = new Set();
    let x = new Set();
    let gh = new Set();
    let orcid = new Set();

    for (const r of allRows || []) {
        if (r.social_profiles && r.social_profiles.length > 0) {
            anySocial.add(r.subject_id);
            for (const sp of r.social_profiles) {
                const plat = sp.platform?.toUpperCase();
                if (plat === 'FACEBOOK') fb.add(r.subject_id);
                if (plat === 'INSTAGRAM') ig.add(r.subject_id);
                if (plat === 'LINKEDIN') li.add(r.subject_id);
                if (plat === 'X' || plat === 'TWITTER') x.add(r.subject_id);
                if (plat === 'GITHUB') gh.add(r.subject_id);
                if (plat === 'ORCID') orcid.add(r.subject_id);
            }
        }
    }

    console.log(`WITH_ANY_SOCIAL = ${anySocial.size}`);
    console.log(`FACEBOOK = ${fb.size}`);
    console.log(`INSTAGRAM = ${ig.size}`);
    console.log(`LINKEDIN = ${li.size}`);
    console.log(`X = ${x.size}`);
    console.log(`GITHUB = ${gh.size}`);
    console.log(`ORCID = ${orcid.size}`);
}

generateReport().catch(console.error);
