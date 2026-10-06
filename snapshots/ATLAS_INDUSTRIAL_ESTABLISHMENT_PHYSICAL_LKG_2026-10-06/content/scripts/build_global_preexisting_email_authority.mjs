import fs from 'fs';
import readline from 'readline';
import zlib from 'zlib';
import crypto from 'crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

async function buildOpeningEmailAuthority() {
  console.log('=== BUILDING GLOBAL PREEXISTING PUBLIC EMAIL AUTHORITY ===');

  const knownEmails = new Set();
  const authorityHashes = new Set();

  function addEmail(email) {
    if (!email || typeof email !== 'string') return;
    const clean = email.trim().toLowerCase();
    // Validate email format
    if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(clean)) return;
    if (knownEmails.has(clean)) return;
    knownEmails.add(clean);
    const h64 = crypto.createHash('sha256').update(clean).digest().subarray(0, 8).toString('hex');
    authorityHashes.add(h64);
  }

  // 1. Check Search Projection V2
  const projPath = 'reports/atlas/search/atlas_canonical_people_projection_v2.jsonl.gz';
  if (fs.existsSync(projPath)) {
    console.log('Scanning Search Projection V2 for preexisting emails...');
    const gunzip = zlib.createGunzip();
    const stream = fs.createReadStream(projPath).pipe(gunzip);
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line) continue;
      const doc = JSON.parse(line);
      if (doc.email) addEmail(doc.email);
      if (doc.contact_email) addEmail(doc.contact_email);
      if (doc.emails && Array.isArray(doc.emails)) {
        doc.emails.forEach(addEmail);
      }
    }
  }

  // 2. Check Database for contact points or email columns
  try {
    const dbConfig = parseDbUrl();
    const client = new pg.Client({
      user: dbConfig.user,
      password: dbConfig.password,
      host: dbConfig.host,
      port: 5432,
      database: 'atlas_shadow_cold_gate',
      ssl: { rejectUnauthorized: false }
    });
    await client.connect();
    await client.query('SET statement_timeout = 0;');

    const tablesRes = await client.query(`
      SELECT table_schema, table_name 
      FROM information_schema.tables 
      WHERE table_name IN ('atlas_public_contact_points', 'atlas_contact_points', 'public_contacts');
    `);
    console.log('Pre-existing contact tables in DB:', tablesRes.rows.length);
    for (const t of tablesRes.rows) {
      const q = await client.query(`SELECT email FROM "${t.table_schema}"."${t.table_name}" LIMIT 100000;`);
      q.rows.forEach(r => addEmail(r.email));
    }
    await client.end();
  } catch (err) {
    console.warn('DB check note:', err.message);
  }

  console.log(`Global Preexisting Public Email Authority built: ${knownEmails.size} unique emails (${authorityHashes.size} 64-bit keys).`);

  // Write binary authority file
  const outBinPath = 'scratch/global_preexisting_public_email_authority.bin';
  const outJsonPath = 'scratch/global_preexisting_public_email_authority.json';

  const buf = Buffer.alloc(authorityHashes.size * 8);
  let offset = 0;
  for (const h of authorityHashes) {
    buf.write(h, offset, 8, 'hex');
    offset += 8;
  }
  fs.writeFileSync(outBinPath, buf);
  fs.writeFileSync(outJsonPath, JSON.stringify({
    total_known_emails: knownEmails.size,
    sample: Array.from(knownEmails).slice(0, 50)
  }, null, 2));

  console.log(`Saved authority to ${outBinPath} and ${outJsonPath}`);
  return knownEmails.size;
}

buildOpeningEmailAuthority().catch(console.error);
