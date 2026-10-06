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
  'decanato', 'vicedecanato', 'presidencia', 'comercio', 'industria', 'hacienda'
];

async function sanitizeContacts() {
  console.log('--- AUDITING CONTACTS IN DISCOVERY INDEX ---');
  const { data: rows, error } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('discovery_id, display_name, public_email, public_phone, source_id');

  if (error || !rows) {
    console.error('Error fetching candidates:', error);
    return;
  }

  let genericEmailCount = 0;
  let genericPhoneCount = 0;

  for (const r of rows) {
    let updateNeeded = false;
    let newEmail = r.public_email;
    let newPhone = r.public_phone;

    if (r.public_email) {
      const prefix = r.public_email.split('@')[0].toLowerCase().replace(/[._-]/g, '');
      if (GENERIC_EMAIL_PREFIXES.includes(prefix)) {
        console.log(`Clearing generic email "${r.public_email}" from ${r.display_name} (${r.source_id})`);
        newEmail = null;
        updateNeeded = true;
        genericEmailCount++;
      }
    }

    if (r.public_phone) {
      // Check if it's an institutional switchboard number (e.g., Durand switchboard 4982-5555 / 4982-0200 or Pasteur 4958-9900)
      if (r.public_phone.includes('0200') || r.public_phone.includes('5555') || r.public_phone.includes('9900')) {
        console.log(`Clearing generic phone "${r.public_phone}" from ${r.display_name} (${r.source_id})`);
        newPhone = null;
        updateNeeded = true;
        genericPhoneCount++;
      }
    }

    if (updateNeeded) {
      await supabase
        .from('atlas_people_discovery_candidates')
        .update({
          public_email: newEmail,
          public_phone: newPhone
        })
        .eq('discovery_id', r.discovery_id);
    }
  }

  console.log(`Sanitization complete: cleared ${genericEmailCount} generic emails, cleared ${genericPhoneCount} generic switchboard phones.`);
}

sanitizeContacts().catch(console.error);
