import fs from 'fs';
import path from 'path';
import readline from 'readline';
import crypto from 'crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import { EmailNormalizerAndClassifier } from '../src/lib/atlasIndustrialEmail/EmailNormalizerAndClassifier.ts';

dotenv.config();

async function setupGlobalAuthority() {
  console.log('=== SETTING UP PERMANENT GLOBAL EMAIL AUTHORITY (SSOT) ===');
  const pool = new pg.Pool(parseDbUrl());
  const client = await pool.connect();

  try {
    // 1. Create table
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.atlas_global_email_authority (
        email_normalized TEXT PRIMARY KEY,
        email_hash TEXT NOT NULL,
        first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        source_origin TEXT NOT NULL,
        authority_generation TEXT NOT NULL,
        is_preexisting BOOLEAN NOT NULL DEFAULT TRUE
      );

      CREATE INDEX IF NOT EXISTS idx_agea_hash ON public.atlas_global_email_authority(email_hash);
      CREATE INDEX IF NOT EXISTS idx_agea_generation ON public.atlas_global_email_authority(authority_generation);
    `);
    console.log('Table public.atlas_global_email_authority ensured.');

    // 2. Load Historical Authority (57,472 emails)
    const historicalSet = new Map(); // email -> metadata

    // From ledgers
    const ledgers = [
      'reports/atlas/acquisition/atlas_public_emails_1m_ledger.jsonl',
      'reports/atlas/acquisition/atlas_public_emails_v3_ledger.jsonl',
      'reports/atlas/acquisition/atlas_public_emails_v2_ledger.jsonl'
    ];

    for (const lp of ledgers) {
      const fullPath = path.resolve(lp);
      if (fs.existsSync(fullPath)) {
        const rl = readline.createInterface({ input: fs.createReadStream(fullPath), crlfDelay: Infinity });
        for await (const line of rl) {
          if (!line.trim()) continue;
          try {
            const doc = JSON.parse(line);
            const em = doc.NORMALIZED_EMAIL || doc.email_normalized || doc.email;
            if (em) {
              const norm = EmailNormalizerAndClassifier.normalizeEmail(em);
              if (norm && !historicalSet.has(norm)) {
                historicalSet.set(norm, {
                  source: doc.SOURCE_ID || doc.source_id || 'HISTORICAL_LEDGER',
                  discovered_at: doc.DISCOVERED_AT || doc.discovered_at || '2026-09-27T00:00:00.000Z'
                });
              }
            }
          } catch {}
        }
      }
    }

    // Also from scratch/global_preexisting_public_email_authority.json sample / binary
    // Also include the preexisting rows in atlas_public_email_contacts_1m from prior runs (legacy proveedores, GCBA, etc.)
    const preexistingDbRows = await client.query(`
      SELECT email_normalized, source_id, discovered_at 
      FROM public.atlas_public_email_contacts_1m
      WHERE source_id NOT LIKE 'ECO_%' AND source_id NOT LIKE 'SRC_DISC_%';
    `);

    for (const row of preexistingDbRows.rows) {
      if (!historicalSet.has(row.email_normalized)) {
        historicalSet.set(row.email_normalized, {
          source: row.source_id,
          discovered_at: row.discovered_at || '2026-09-27T00:00:00.000Z'
        });
      }
    }

    console.log(`Prepared ${historicalSet.size.toLocaleString()} historical baseline emails for ingestion.`);

    // Batch insert historical baseline into atlas_global_email_authority
    const batchSize = 2000;
    const historicalEntries = Array.from(historicalSet.entries());
    let insertedHistorical = 0;

    for (let i = 0; i < historicalEntries.length; i += batchSize) {
      const chunk = historicalEntries.slice(i, i + batchSize);
      const emails = chunk.map(([e]) => e);
      const hashes = chunk.map(([e]) => crypto.createHash('sha256').update(e).digest('hex'));
      const dates = chunk.map(([, m]) => m.discovered_at);
      const origins = chunk.map(([, m]) => m.source);
      const gens = chunk.map(() => 'GEN_0_HISTORICAL_BASELINE');
      const isPres = chunk.map(() => true);

      const res = await client.query(`
        INSERT INTO public.atlas_global_email_authority (
          email_normalized, email_hash, first_seen_at, source_origin, authority_generation, is_preexisting
        )
        SELECT * FROM UNNEST (
          $1::text[], $2::text[], $3::timestamptz[], $4::text[], $5::text[], $6::boolean[]
        )
        ON CONFLICT (email_normalized) DO NOTHING
        RETURNING email_normalized;
      `, [emails, hashes, dates, origins, gens, isPres]);

      insertedHistorical += res.rows.length;
    }
    console.log(`Inserted ${insertedHistorical.toLocaleString()} historical baseline emails into atlas_global_email_authority.`);

    // 3. Ingest the 543 net-new legitimate emails from live web ecosystems & discovery
    const webEcosystemRows = await client.query(`
      SELECT email_normalized, email_hash, discovered_at, source_id
      FROM public.atlas_public_email_contacts_1m
      WHERE source_id LIKE 'ECO_%' OR source_id LIKE 'SRC_DISC_%';
    `);

    let insertedWeb = 0;
    const webEntries = webEcosystemRows.rows;
    for (let i = 0; i < webEntries.length; i += batchSize) {
      const chunk = webEntries.slice(i, i + batchSize);
      const emails = chunk.map(r => r.email_normalized);
      const hashes = chunk.map(r => r.email_hash || crypto.createHash('sha256').update(r.email_normalized).digest('hex'));
      const dates = chunk.map(r => r.discovered_at || new Date().toISOString());
      const origins = chunk.map(r => r.source_id);
      const gens = chunk.map(() => 'GEN_1_ECOSYSTEM_NET_NEW');
      const isPres = chunk.map(() => false);

      const res = await client.query(`
        INSERT INTO public.atlas_global_email_authority (
          email_normalized, email_hash, first_seen_at, source_origin, authority_generation, is_preexisting
        )
        SELECT * FROM UNNEST (
          $1::text[], $2::text[], $3::timestamptz[], $4::text[], $5::text[], $6::boolean[]
        )
        ON CONFLICT (email_normalized) DO NOTHING
        RETURNING email_normalized;
      `, [emails, hashes, dates, origins, gens, isPres]);

      insertedWeb += res.rows.length;
    }
    console.log(`Inserted/Protected ${insertedWeb.toLocaleString()} net-new ecosystem contacts into atlas_global_email_authority.`);

    // 4. Final verification and counts
    const totalAuthRes = await client.query('SELECT COUNT(*) as total FROM public.atlas_global_email_authority;');
    const genRes = await client.query('SELECT authority_generation, COUNT(*) as count FROM public.atlas_global_email_authority GROUP BY authority_generation;');
    
    console.log(`\n==================================================`);
    console.log(`TOTAL GLOBAL AUTHORITY IN POSTGRESQL: ${totalAuthRes.rows[0].total}`);
    console.log(`Generations Breakdown:`);
    console.table(genRes.rows);
    console.log(`==================================================\n`);

  } finally {
    client.release();
    await pool.end();
  }
}

setupGlobalAuthority().catch(console.error);
