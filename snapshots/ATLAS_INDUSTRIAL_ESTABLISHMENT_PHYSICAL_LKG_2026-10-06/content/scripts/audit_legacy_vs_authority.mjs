import fs from 'fs';
import path from 'path';
import readline from 'readline';
import crypto from 'crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import { PreexistingEmailAuthority } from '../src/lib/atlasIndustrialEmail/PreexistingEmailAuthority.ts';
import { EMAIL_EXTRACTION_REGEX, EmailNormalizerAndClassifier } from '../src/lib/atlasIndustrialEmail/EmailNormalizerAndClassifier.ts';

dotenv.config();

async function auditLegacyVsAuthority() {
  console.log('=== AUDIT: PROVEEDORES_SISTEMA_LEGACY VS GLOBAL AUTHORITY ===');
  
  // 1. Load PreexistingEmailAuthority (57,998)
  const auth = new PreexistingEmailAuthority();
  await auth.loadOrInitializeT0();
  console.log(`Loaded Historical Authority: ${auth.openingCount} emails.`);

  // 2. Load Postgres current contacts (at T0 it was 9,705, now 57,015)
  const pool = new pg.Pool(parseDbUrl());
  const res = await pool.query("SELECT email_normalized, source_id FROM public.atlas_public_email_contacts_1m;");
  console.log(`Loaded Current Postgres Contacts: ${res.rows.length}`);
  
  // 3. Scan proveedores_sistema_legacy.csv
  const csvPath = path.resolve('scratch/physical_sources/proveedores_sistema_legacy.csv');
  const rl = readline.createInterface({
    input: fs.createReadStream(csvPath, { encoding: 'latin1' }),
    crlfDelay: Infinity
  });

  const uniqueLegacyEmails = new Set();
  let inHistoricalAuthCount = 0;
  let inPostgresCount = 0;

  for await (const line of rl) {
    const matches = line.match(EMAIL_EXTRACTION_REGEX);
    if (matches) {
      for (const raw of matches) {
        const norm = EmailNormalizerAndClassifier.normalizeEmail(raw);
        if (norm) {
          uniqueLegacyEmails.add(norm);
        }
      }
    }
  }

  const postgresMap = new Map();
  for (const r of res.rows) {
    postgresMap.set(r.email_normalized, r.source_id);
  }

  for (const email of uniqueLegacyEmails) {
    if (auth.isPreexisting(email)) inHistoricalAuthCount++;
    if (postgresMap.has(email)) inPostgresCount++;
  }

  console.log('\n--- AUDIT RESULTS FOR SRC_PROVEEDORES_SISTEMA_LEGACY ---');
  console.log(`TOTAL_VALID_EMAILS = ${uniqueLegacyEmails.size.toLocaleString()}`);
  console.log(`IN_HISTORICAL_AUTHORITY (57,998) = ${inHistoricalAuthCount.toLocaleString()} (${((inHistoricalAuthCount/uniqueLegacyEmails.size)*100).toFixed(2)}%)`);
  console.log(`IN_CURRENT_POSTGRES = ${inPostgresCount.toLocaleString()}`);
  console.log(`ACTUALLY_NET_NEW_AGAINST_HISTORICAL = ${(uniqueLegacyEmails.size - inHistoricalAuthCount).toLocaleString()}`);
  
  await pool.end();
}

auditLegacyVsAuthority().catch(console.error);
