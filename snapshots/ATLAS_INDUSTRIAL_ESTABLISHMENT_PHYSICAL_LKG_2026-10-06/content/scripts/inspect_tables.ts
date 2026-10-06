import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabaseUrl = 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const supabaseKey = process.env.SUPABASE_SECRET_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function inspect() {
    // Attempting to query information_schema is restricted via standard API, but we might be able to query the postgres views or simply list tables using pg module.
    // Instead of doing that, let's just attempt a query on `atlas_companies` and see if it fails.
    const { data, error } = await supabase.from('atlas_companies').select('*').limit(1);
    console.log("atlas_companies:", error ? error.message : "Exists! Rows: " + (data ? data.length : 0));
    
    const { data: d2, error: e2 } = await supabase.from('atlas_discovered_companies').select('*').limit(1);
    console.log("atlas_discovered_companies:", e2 ? e2.message : "Exists! Rows: " + (d2 ? d2.length : 0));
}

inspect();
