import * as dotenvNamespace from 'dotenv';
const dotenvObj: any = (dotenvNamespace as any).default?.default || (dotenvNamespace as any).default || dotenvNamespace;
const configFn = typeof dotenvObj?.config === 'function' ? dotenvObj.config.bind(dotenvObj) : (typeof (dotenvNamespace as any)?.config === 'function' ? (dotenvNamespace as any).config : null);
if (configFn) {
  try { configFn({ path: '.env.local' }); } catch {}
  try { configFn({ path: '.env' }); } catch {}
}

// Environment checks for test runner: load from .env without hardcoded secrets
if (!process.env.VITE_SUPABASE_URL) {
  process.env.VITE_SUPABASE_URL = process.env.SUPABASE_URL || '';
}
if (!process.env.SUPABASE_SECRET_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
}
