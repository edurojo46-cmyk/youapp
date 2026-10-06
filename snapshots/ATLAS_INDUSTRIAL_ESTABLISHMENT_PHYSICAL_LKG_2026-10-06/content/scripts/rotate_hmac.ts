import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

function rotateHmacKey() {
  const envPath = path.resolve(process.cwd(), '.env');
  let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

  const newSecret = crypto.randomBytes(32).toString('hex');
  
  // Extract current version if exists
  let version = 1;
  const versionMatch = envContent.match(/^ATLAS_IGJ_IDENTITY_HMAC_KEY_VERSION=(\d+)/m);
  if (versionMatch) {
    version = parseInt(versionMatch[1], 10) + 1;
  } else {
    version = 2; // If absent, assume 1 was compromised, so 2
  }

  // Replace or append HMAC key
  if (envContent.includes('ATLAS_IGJ_IDENTITY_HMAC_KEY=')) {
    envContent = envContent.replace(/^ATLAS_IGJ_IDENTITY_HMAC_KEY=.*$/m, `ATLAS_IGJ_IDENTITY_HMAC_KEY=${newSecret}`);
  } else {
    envContent += `\nATLAS_IGJ_IDENTITY_HMAC_KEY=${newSecret}`;
  }

  // Replace or append Version
  if (envContent.includes('ATLAS_IGJ_IDENTITY_HMAC_KEY_VERSION=')) {
    envContent = envContent.replace(/^ATLAS_IGJ_IDENTITY_HMAC_KEY_VERSION=.*$/m, `ATLAS_IGJ_IDENTITY_HMAC_KEY_VERSION=${version}`);
  } else {
    envContent += `\nATLAS_IGJ_IDENTITY_HMAC_KEY_VERSION=${version}`;
  }

  fs.writeFileSync(envPath, envContent);
  console.log(`IGJ_HMAC_KEY_ROTATED = PASS`);
  console.log(`NEW_HMAC_SECRET_PRINTED = NO`);
  console.log(`NEW VERSION = ${version}`);
}

rotateHmacKey();
