import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
    process.env.VITE_SUPABASE_URL as string, 
    (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) as string
);

async function run() {
    console.log("=== FINAL CERTIFICATION COUNTS ===");

    // IGJ Metrics
    const { count: igjObs } = await supabase.from('atlas_person_observations').select('id', {count: 'exact', head: true}).eq('source_id', 'DATOS_ARGENTINA_IGJ_AUTHORITIES');
    const { count: igjSubjects } = await supabase.from('atlas_observation_subjects').select('subject_id', {count: 'exact', head: true}).eq('source_id', 'DATOS_ARGENTINA_IGJ_AUTHORITIES');
    const { count: igjStrong } = await supabase.from('atlas_observation_subjects').select('subject_id', {count: 'exact', head: true}).eq('source_id', 'DATOS_ARGENTINA_IGJ_AUTHORITIES').eq('identity_status', 'VERIFIED');
    const { count: igjUnresolved } = await supabase.from('atlas_observation_subjects').select('subject_id', {count: 'exact', head: true}).eq('source_id', 'DATOS_ARGENTINA_IGJ_AUTHORITIES').eq('identity_status', 'UNRESOLVED');
    const { count: igjAliases } = await supabase.from('atlas_person_identity_aliases').select('id', {count: 'exact', head: true}).eq('source_id', 'DATOS_ARGENTINA_IGJ_AUTHORITIES');
    
    console.log(`IGJ_OBSERVATIONS = ${igjObs || 0}`);
    console.log(`IGJ_DISTINCT_STABLE_SUBJECTS = ${igjSubjects || 0}`);
    console.log(`IGJ_STRONG_IDENTITY_SUBJECTS = ${igjStrong || 0}`);
    console.log(`IGJ_UNRESOLVED_SUBJECTS = ${igjUnresolved || 0}`);
    console.log(`IGJ_IDENTITY_ALIASES = ${igjAliases || 0}`);

    // GLOBAL Metrics
    const { count: gcba } = await supabase.from('atlas_argentina_people_search_projection_v1').select('subject_id', {count: 'exact', head: true}).eq('source_id', 'gcba_open_data_funcionarios');
    const { count: igjProj } = await supabase.from('atlas_argentina_people_search_projection_v1').select('subject_id', {count: 'exact', head: true}).eq('source_id', 'DATOS_ARGENTINA_IGJ_AUTHORITIES');
    const { count: org } = await supabase.from('atlas_argentina_people_search_projection_v1').select('subject_id', {count: 'exact', head: true}).eq('source_id', 'ORGANIZATION_WEBSITE');
    const { count: totalProj } = await supabase.from('atlas_argentina_people_search_projection_v1').select('subject_id', {count: 'exact', head: true});

    console.log(`\\nGLOBAL:`);
    console.log(`GCBA = ${gcba || 0}`);
    console.log(`IGJ = ${igjProj || 0}`);
    console.log(`ORGANIZATION_WEBSITE = ${org || 0}`);
    console.log(`TOTAL_DISTINCT_INDEXED = ${totalProj || 0}`);
}
run();
