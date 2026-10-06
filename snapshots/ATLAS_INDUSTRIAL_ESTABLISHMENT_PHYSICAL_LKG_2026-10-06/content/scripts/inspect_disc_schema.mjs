import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
const env = fs.readFileSync('.env','utf8');
let url='',key='';
for(const l of env.split('\n')){
  if(l.startsWith('VITE_SUPABASE_URL=')) url=l.split('=').slice(1).join('=').trim().replace(/['"]/g,'');
  if(l.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) key=l.split('=').slice(1).join('=').trim().replace(/['"]/g,'');
}
const sb=createClient(url,key,{auth:{persistSession:false}});
// Test atlas_search_outbox
const {count,error}=await sb.from('atlas_search_outbox').select('*',{count:'exact',head:true});
console.log('atlas_search_outbox count:', count, 'error:', error?.message);
// Test atlas_person_identity_map
const {count:c2,error:e2}=await sb.from('atlas_person_identity_map').select('*',{count:'exact',head:true});
console.log('atlas_person_identity_map count:', c2, 'error:', e2?.message);
