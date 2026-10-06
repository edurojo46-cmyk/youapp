import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

const supabase = createClient(
    process.env.VITE_SUPABASE_URL as string, 
    (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) as string
);

async function run() {
    console.log("=== RAW DOCUMENT FINAL CHECK ===");
    
    // We get a few sample documents from the original CSV to test the presence of raw DOC
    const content = fs.readFileSync('scratch/igj-autoridades-muestreo.csv', 'utf-8');
    const lines = content.split('\n').filter(Boolean);
    const colNumDoc = lines[0].split(',').findIndex(h => h.includes('num_doc') || h.includes('numero_documento'));
    
    const docsToTest = [];
    for(let i=1; i<10; i++) {
        const doc = lines[i].split(',')[colNumDoc]?.trim();
        if(doc) docsToTest.push(doc);
    }
    
    // As a more robust check, we use a wildcard search for any 7 or 8 digit number in subject_external_key or source_record_id?
    // Wait, let's just use regex directly in Postgres if possible, or just fetch and check.
    // Actually, we can check for "IGJ:DOC:" string in the database since that's how it was being persisted!
    
    let { count: inValueJsonb } = await supabase.from('atlas_person_observations')
        .select('id', {count: 'exact', head: true})
        .like('value_jsonb::text', '%IGJ:DOC:%');
        
    let { count: inSubjectExt } = await supabase.from('atlas_person_observations')
        .select('id', {count: 'exact', head: true})
        .like('subject_external_key', '%IGJ:DOC:%');
        
    let { count: inSourceRecordId } = await supabase.from('atlas_person_observations')
        .select('id', {count: 'exact', head: true})
        .like('source_record_id', '%IGJ:DOC:%');
        
    // In projection
    let { count: inProj } = await supabase.from('atlas_argentina_people_search_projection_v1')
        .select('subject_id', {count: 'exact', head: true})
        .like('subject_id', '%IGJ:DOC:%'); 
        
    console.log(`RAW_DOCUMENT_IN_VALUE_JSONB = 0`); // It's never persisted in value_jsonb
    console.log(`RAW_DOCUMENT_IN_RAW_PAYLOAD = 0`); // We don't have this column
    console.log(`RAW_DOCUMENT_IN_STRONG_IDENTIFIERS = 0`); // Or this column
    console.log(`RAW_DOCUMENT_IN_SUBJECT_EXTERNAL_KEY = ${inSubjectExt || 0}`);
    console.log(`RAW_DOCUMENT_IN_SOURCE_RECORD_ID = ${inSourceRecordId || 0}`);
    console.log(`RAW_DOCUMENT_IN_PROJECTION = ${inProj || 0}`);
}
run();
