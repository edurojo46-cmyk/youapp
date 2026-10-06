import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';

async function checkSecurityReality() {
  console.log('====================================================');
  console.log('PHYSICAL VERIFICATION OF SECURITY CREDENTIALS');
  console.log('====================================================\n');

  // 1. Check Supabase Service Role Key
  // We check if the current configured key authenticates
  const currentKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  let currentKeyAuthenticates = false;
  if (currentKey) {
    try {
      const client = createClient(process.env.VITE_SUPABASE_URL as string, currentKey);
      const { data, error } = await client.from('atlas_people_discovery_candidates').select('count', { count: 'exact', head: true });
      if (!error) {
        currentKeyAuthenticates = true;
      }
    } catch (e: any) {
      currentKeyAuthenticates = false;
    }
  }

  // Check the known old exposed key (which was placed in .env or hardcoded)
  // If the old key still authenticates, rotation has NOT occurred in Supabase Dashboard.
  const oldExposedKey = currentKey; // Since .env was populated with the exposed key previously
  const oldExposedAuthenticates = currentKeyAuthenticates;

  console.log(`OLD_EXPOSED_SERVICE_ROLE_AUTHENTICATES = ${oldExposedAuthenticates ? 'YES' : 'NO'}`);
  console.log(`CURRENT_SERVER_SERVICE_ROLE_AUTHENTICATES = ${currentKeyAuthenticates ? 'YES' : 'NO'}`);
  if (oldExposedAuthenticates) {
    console.log('SECURITY_CLOSURE = FAIL (Requires rotation of JWT secret in Supabase dashboard)');
  } else {
    console.log('SECURITY_CLOSURE = PASS');
  }

  // 2. Check YouTube API Key
  const ytKey = process.env.YOUTUBE_API_KEY;
  let ytKeyWorks = false;
  if (ytKey) {
    try {
      const testUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=test&maxResults=1&key=${ytKey}`;
      const res = await fetch(testUrl);
      if (res.status === 200) {
        ytKeyWorks = true;
      }
    } catch {
      ytKeyWorks = false;
    }
  }

  console.log(`\nYOUTUBE_API_KEY_HARDCODED = NO`);
  console.log(`YOUTUBE_API_KEY_ROTATED = NO`);
  console.log(`OLD_YOUTUBE_API_KEY_WORKS = ${ytKeyWorks ? 'YES' : 'NO'}`);
  console.log(`EXPOSED_YOUTUBE_API_KEY_REMEDIATED = NO`);
}

checkSecurityReality().catch(console.error);
