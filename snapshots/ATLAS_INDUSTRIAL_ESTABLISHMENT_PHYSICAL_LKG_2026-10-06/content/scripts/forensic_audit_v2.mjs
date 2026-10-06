import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pg from 'pg';
import readline from 'readline';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import { resolveCanonicalHuman } from './lib/canonicalIdentityResolver.mjs';

async function forensicAuditV2() {
  console.log('================================================================');
  console.log('   ATLAS — AUTONOMOUS ARGENTINA 1M V2 FORENSIC AUDIT            ');
  console.log('================================================================\n');

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

  // 1. Trace exact source breakdown in DB
  console.log('[SECTION 1] Querying Database for Source Distribution...');
  const sourceBreakdownRes = await client.query(`
    SELECT source_id, source_class, jurisdiction, count(*) as net_new_count
    FROM atlas_shadow.atlas_acquisition_benchmark_1m_v2
    GROUP BY source_id, source_class, jurisdiction
    ORDER BY net_new_count DESC;
  `);
  console.log('Sources in Database:');
  console.table(sourceBreakdownRes.rows);

  // Check locators distribution
  const locRes = await client.query(`
    SELECT source_id, 
           split_part(raw_record_locator, ':', 1) as locator_type,
           split_part(raw_record_locator, ':', 2) as locator_tag,
           count(*) as count,
           min(raw_record_locator) as min_locator,
           max(raw_record_locator) as max_locator
    FROM atlas_shadow.atlas_acquisition_benchmark_1m_v2
    GROUP BY source_id, split_part(raw_record_locator, ':', 1), split_part(raw_record_locator, ':', 2)
    ORDER BY count DESC;
  `);
  console.log('Locator Types in Database:');
  console.table(locRes.rows);

  // 2. Parse Task Log for Fetch History & Resource Metadata
  console.log('\n[SECTION 2] Parsing Task Log for Contributing Resource Manifests...');
  const logPath = 'C:\\Users\\Eduardo\\.gemini\\antigravity-ide\\brain\\be473795-d782-4828-930b-7b6335cf70fa\\.system_generated\\tasks\\task-6287.log';
  const logContent = fs.readFileSync(logPath, 'utf8');
  const logLines = logContent.split('\n');

  let currentResourceName = '';
  let currentResourceUrl = '';
  let lastNetNew = 0;
  const contributingResources = [];

  for (let i = 0; i < logLines.length; i++) {
    const line = logLines[i];
    if (line.includes('>>> Autonomous Fetch [')) {
      currentResourceName = line.trim();
    }
    if (line.includes('URL:')) {
      const parts = line.split('URL:');
      if (parts[1]) {
        currentResourceUrl = parts[1].split('|')[0].trim();
      }
    }
    const match = line.match(/Cumulative True Net-New:\s*(\d+)/);
    if (match) {
      const netNewVal = parseInt(match[1], 10);
      if (netNewVal > lastNetNew) {
        const delta = netNewVal - lastNetNew;
        contributingResources.push({
          resource: currentResourceName,
          url: currentResourceUrl,
          delta,
          cumulative: netNewVal,
          logLine: line.trim()
        });
        lastNetNew = netNewVal;
      }
    }
  }

  console.log('Contributing Events parsed from log:');
  console.table(contributingResources);

  await client.end();
}

forensicAuditV2().catch(console.error);
