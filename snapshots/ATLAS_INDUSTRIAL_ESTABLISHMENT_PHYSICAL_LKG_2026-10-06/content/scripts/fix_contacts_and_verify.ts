import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL as string,
  (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) as string
);

const GENERIC_EMAIL_PREFIXES = [
  'info', 'contacto', 'administracion', 'ventas', 'recepcion', 'secretaria',
  'secretariageneral', 'prensa', 'consultas', 'atencion', 'soporte', 'rrhh',
  'decanato', 'vicedecanato', 'presidencia', 'comercio', 'industria', 'hacienda',
  'sgeneral', 'seube', 'sicyt', 'institucionales', 'posgrado', 'internacionales'
];

async function fix() {
  console.log('--- AUDITING AND FIXING CONTACTS WITH DETAILED LOGGING ---');

  let rows: any[] = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('atlas_people_discovery_candidates')
      .select('discovery_id, display_name, public_email, public_phone, source_id')
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (error || !data || data.length === 0) break;
    rows.push(...data);
    if (data.length < pageSize) break;
    page++;
  }

  let genericEmailsFixed = 0;
  let genericPhonesFixed = 0;

  for (const r of rows) {
    let updateObj: any = null;

    if (r.public_email) {
      const prefix = r.public_email.split('@')[0].toLowerCase().replace(/[._-]/g, '');
      if (GENERIC_EMAIL_PREFIXES.includes(prefix)) {
        console.log(`Clearing generic email: ${r.display_name} -> ${r.public_email}`);
        updateObj = updateObj || {};
        updateObj.public_email = null;
        updateObj.email_type = null;
        updateObj.email_source_url = null;
        genericEmailsFixed++;
      }
    }

    if (r.public_phone) {
      if (r.public_phone.includes('0200') || r.public_phone.includes('5555') || r.public_phone.includes('9900')) {
        console.log(`Clearing switchboard phone: ${r.display_name} -> ${r.public_phone}`);
        updateObj = updateObj || {};
        updateObj.public_phone = null;
        updateObj.phone_type = null;
        updateObj.phone_source_url = null;
        genericPhonesFixed++;
      }
    }

    if (updateObj) {
      const { error: updErr, data } = await supabase
        .from('atlas_people_discovery_candidates')
        .update(updateObj)
        .eq('discovery_id', r.discovery_id)
        .select();

      if (updErr) {
        console.error(`Error updating ${r.discovery_id}:`, updErr.message);
      } else {
        console.log(`Updated ${r.discovery_id} successfully. Result rows:`, data?.length);
      }
    }
  }

  console.log(`\nFix complete: cleared ${genericEmailsFixed} emails, cleared ${genericPhonesFixed} phones.`);
}

fix().catch(console.error);
