import fs from 'fs';
import dotenv from 'dotenv';

let configured = false;

if (fs.existsSync('.env.local')) {
  const envLocal = dotenv.parse(fs.readFileSync('.env.local'));
  if (envLocal.SHADOW_DATABASE_URL && envLocal.SHADOW_DATABASE_URL.trim().length > 0) {
    configured = true;
  }
}

if (!configured && fs.existsSync('.env')) {
  const envBase = dotenv.parse(fs.readFileSync('.env'));
  if (envBase.SHADOW_DATABASE_URL && envBase.SHADOW_DATABASE_URL.trim().length > 0) {
    configured = true;
  }
}

console.log(JSON.stringify({ SHADOW_DATABASE_URL_CONFIGURED: configured }));
