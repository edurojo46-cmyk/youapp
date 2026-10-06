import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabaseUrl = 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const supabaseKey = process.env.SUPABASE_SECRET_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
    const { data, error } = await supabase.from('atlas_subject_registry').select('count', { count: 'exact' });
    console.log({ data, error });
}
test();
