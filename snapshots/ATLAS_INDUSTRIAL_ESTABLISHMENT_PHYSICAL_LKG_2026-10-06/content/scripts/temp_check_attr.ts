import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkAttrSchema() {
  const { data, error } = await supabase.from('atlas_person_attribute_evidence').select('*').limit(1);
  if (data && data[0]) {
    console.log('Columns of atlas_person_attribute_evidence:');
    console.log(Object.keys(data[0]));
    console.log('Sample row:', data[0]);
  } else {
    console.log('Error:', error);
  }
}

checkAttrSchema();
