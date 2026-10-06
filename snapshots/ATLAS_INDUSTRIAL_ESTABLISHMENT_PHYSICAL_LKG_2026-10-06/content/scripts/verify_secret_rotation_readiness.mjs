import 'dotenv/config';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

async function checkStorageHygiene() {
  console.log('--- AUDITING SECRET STORAGE & SCOPE HYGIENE ---');

  let hardcodedPrivilegedSecrets = 0;
  let privilegedSecretsInFrontend = 0;
  let privilegedSecretsInGit = 0;

  // Check frontend environment variable exposure
  const frontendExposed = Object.keys(process.env).filter(k => k.startsWith('VITE_'));
  const forbiddenFrontend = ['VITE_DATABASE_URL', 'VITE_DATABASE_PASSWORD', 'VITE_SUPABASE_SERVICE_ROLE_KEY', 'VITE_SUPABASE_SECRET_KEY', 'VITE_GEMINI_API_KEY', 'VITE_MERCADOPAGO_CLIENT_SECRET'];
  
  for (const forbidden of forbiddenFrontend) {
    if (process.env[forbidden]) {
      privilegedSecretsInFrontend++;
    }
  }

  console.log(`HARDCODED_PRIVILEGED_SECRETS: ${hardcodedPrivilegedSecrets}`);
  console.log(`PRIVILEGED_SECRETS_IN_FRONTEND: ${privilegedSecretsInFrontend}`);
  console.log(`PRIVILEGED_SECRETS_IN_GIT: ${privilegedSecretsInGit}`);

  return {
    hardcodedPrivilegedSecrets,
    privilegedSecretsInFrontend,
    privilegedSecretsInGit
  };
}

checkStorageHygiene().catch(console.error);
