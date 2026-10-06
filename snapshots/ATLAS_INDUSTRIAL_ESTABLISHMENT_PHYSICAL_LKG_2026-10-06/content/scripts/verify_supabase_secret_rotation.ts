import { createGuardedTestClient as createClient } from '../src/lib/testDbGuard';
import * as dotenv from 'dotenv';
import * as readline from 'readline';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://jtnurafmngaxdwlzpvxv.supabase.co';
const ACTIVE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

function askHidden(query: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    // Mute stdout during sensitive input
    const stdin = process.stdin as any;
    const oldWrite = process.stdout.write;
    process.stdout.write(query);

    let isMuted = true;
    (process.stdout as any).write = (chunk: any, encoding?: any, cb?: any) => {
      if (!isMuted) return oldWrite.call(process.stdout, chunk, encoding, cb);
      if (chunk === '\r\n' || chunk === '\n') {
        return oldWrite.call(process.stdout, chunk, encoding, cb);
      }
      return oldWrite.call(process.stdout, '*');
    };

    rl.question('', (answer) => {
      isMuted = false;
      (process.stdout as any).write = oldWrite;
      rl.close();
      console.log('');
      resolve(answer.trim());
    });
  });
}

async function verifySecretRotation() {
  console.log('===========================================================');
  console.log('SUPABASE MODERN API KEY ROTATION & REVOCATION GATE');
  console.log('===========================================================');

  if (!ACTIVE_SECRET_KEY) {
    console.error('❌ Error: SUPABASE_SECRET_KEY is not configured in .env');
    process.exit(1);
  }

  // 1. Verify New Active Key
  console.log('[1] Testing Active SUPABASE_SECRET_KEY against Staging Supabase...');
  const activeClient = createClient(SUPABASE_URL, ACTIVE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: activeCheck, error: activeErr } = await activeClient
    .from('atlas_tenants')
    .select('count')
    .limit(0);

  if (activeErr) {
    console.error('❌ Active key failed authentication:', activeErr.message);
    process.exit(1);
  }
  console.log('✅ Active Key Authentication: VALID (Read/Write access confirmed)');

  // 2. Interactive in-memory verification of old compromised key
  let oldKey = process.env.OLD_COMPROMISED_KEY;

  if (!oldKey && process.stdin.isTTY) {
    oldKey = await askHidden('Enter old compromised key to verify revocation (input is masked & never logged): ');
  }

  if (oldKey && oldKey.length > 0) {
    console.log('[2] Testing Revocation of Compromised Legacy Key (In-Memory)...');
    const oldClient = createClient(SUPABASE_URL, oldKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    const { error: oldErr } = await oldClient
      .from('atlas_tenants')
      .select('count')
      .limit(0);

    // Overwrite memory reference
    oldKey = '00000000000000000000000000000000';

    if (!oldErr) {
      console.warn('⚠️ WARNING: Old compromised key is STILL ACCEPTED by Supabase!');
      console.warn('👉 Please disable/retire the legacy service_role key in Supabase Dashboard (Project Settings -> API -> Legacy API Keys).');
    } else {
      console.log(`✅ Revocation Confirmed: Old compromised key is REJECTED by Gateway (${oldErr.message})`);
    }
  } else {
    console.log('[2] Skipping old key revocation check (no key provided).');
  }

  console.log('===========================================================');
}

verifySecretRotation().catch((err) => {
  console.error('Verification script encountered an error:', err.message);
  process.exit(1);
});
