/**
 * ATLAS — BACKGROUND HARVEST WORKER DAEMON
 * Continuously runs in background processing the remaining national open data frontier.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import { EMAIL_EXTRACTION_REGEX, EmailNormalizerAndClassifier } from '../src/lib/atlasIndustrialEmail/EmailNormalizerAndClassifier.ts';

dotenv.config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function runDaemon() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 5 });
  const client = await pool.connect();

  const authRes = await client.query('SELECT email_normalized FROM public.atlas_global_email_authority;');
  const globalAuthoritySet = new Set(authRes.rows.map(r => r.email_normalized));

  let candidates = [];
  try {
    if (fs.existsSync('scratch/master_discovered_resource_urls.json')) {
      const data = JSON.parse(fs.readFileSync('scratch/master_discovered_resource_urls.json', 'utf8'));
      candidates = data.filter(x => {
        const u = x.url.toLowerCase();
        return u.endsWith('.csv') || u.includes('/download/') || u.endsWith('.json');
      });
    }
  } catch (e) {}

  let idx = 0;
  let batch = [];

  async function flush() {
    if (batch.length === 0) return;
    const toInsert = batch;
    batch = [];

    const cleanStr = (s) => (s ? String(s).replace(/\0/g, '') : '');
    const emails = toInsert.map(r => cleanStr(r.email_normalized));
    const hashes = toInsert.map(r => cleanStr(r.email_hash));
    const contactTypes = toInsert.map(r => cleanStr(r.contact_type));
    const entities = toInsert.map(r => cleanStr(r.associated_entity));
    const entityTypes = toInsert.map(r => cleanStr(r.entity_type));
    const arBools = toInsert.map(r => r.argentina_relation);
    const arTypes = toInsert.map(r => cleanStr(r.argentina_relation_type));
    const sIds = toInsert.map(r => cleanStr(r.source_id));
    const sFams = toInsert.map(r => cleanStr(r.source_family));
    const sUrls = toInsert.map(r => cleanStr(r.source_url));
    const contexts = toInsert.map(r => cleanStr(r.public_context));
    const evidences = toInsert.map(r => cleanStr(r.evidence));
    const provenances = toInsert.map(r => cleanStr(JSON.stringify(r.provenance)));
    const discAts = toInsert.map(r => r.discovered_at);
    const verAts = toInsert.map(r => r.verified_at);
    const qualStatuses = toInsert.map(r => cleanStr(r.mission_qualification_status));

    try {
      const res = await client.query(`
        INSERT INTO public.atlas_public_email_contacts_1m (
          email_normalized, email_hash, contact_type, associated_entity, entity_type,
          argentina_relation, argentina_relation_type, source_id, source_family, source_url,
          public_context, evidence, provenance, discovered_at, verified_at, mission_qualification_status
        )
        SELECT * FROM UNNEST (
          $1::text[], $2::text[], $3::text[], $4::text[], $5::text[],
          $6::boolean[], $7::text[], $8::text[], $9::text[], $10::text[],
          $11::text[], $12::text[], $13::jsonb[], $14::timestamptz[], $15::timestamptz[], $16::text[]
        )
        ON CONFLICT (email_normalized) DO NOTHING
        RETURNING email_normalized;
      `, [
        emails, hashes, contactTypes, entities, entityTypes,
        arBools, arTypes, sIds, sFams, sUrls,
        contexts, evidences, provenances, discAts, verAts, qualStatuses
      ]);

      const inserted = res.rows.map(r => r.email_normalized);
      if (inserted.length > 0) {
        const authEmails = [];
        const authHashes = [];
        const authDates = [];
        const authOrigins = [];
        const authGens = [];
        const authIsPres = [];

        for (const item of toInsert) {
          if (inserted.includes(item.email_normalized)) {
            authEmails.push(item.email_normalized);
            authHashes.push(item.email_hash);
            authDates.push(item.discovered_at);
            authOrigins.push(item.source_id);
            authGens.push('AUTONOMOUS_500K_RUN');
            authIsPres.push(false);
            globalAuthoritySet.add(item.email_normalized);
          }
        }

        await client.query(`
          INSERT INTO public.atlas_global_email_authority (
            email_normalized, email_hash, first_seen_at, source_origin, authority_generation, is_preexisting
          )
          SELECT * FROM UNNEST (
            $1::text[], $2::text[], $3::timestamptz[], $4::text[], $5::text[], $6::boolean[]
          )
          ON CONFLICT (email_normalized) DO NOTHING;
        `, [authEmails, authHashes, authDates, authOrigins, authGens, authIsPres]);

        await client.query(`
          INSERT INTO public.atlas_500k_mission_ledger (
            email_normalized, email_hash, first_physical_inserted_at, source_origin, mission_run_id
          )
          SELECT email, hash, seen, orig, 'AUTONOMOUS_500K_RUN'
          FROM UNNEST (
            $1::text[], $2::text[], $3::timestamptz[], $4::text[]
          ) as t(email, hash, seen, orig)
          ON CONFLICT (email_normalized) DO NOTHING;
        `, [authEmails, authHashes, authDates, authOrigins]);
      }
    } catch (e) {}
  }

  // Periodic heartbeat
  setInterval(async () => {
    fs.writeFileSync('scratch/daemon_heartbeat.json', JSON.stringify({
      timestamp: new Date().toISOString(),
      authoritySize: globalAuthoritySet.size,
      processedDatasets: idx,
      status: 'ACTIVE'
    }));
    await flush();
  }, 5000);

  while (idx < candidates.length) {
    const item = candidates[idx++];
    try {
      const ctrl = new AbortController();
      const tmr = setTimeout(() => ctrl.abort(), 6000);
      const res = await fetch(item.url, { signal: ctrl.signal });
      clearTimeout(tmr);
      if (!res.ok) continue;

      const text = await res.text();
      const matches = text.match(EMAIL_EXTRACTION_REGEX) || [];
      const ecoHost = new URL(item.url).hostname;

      for (const m of matches) {
        const norm = EmailNormalizerAndClassifier.normalizeEmail(m);
        if (norm && !globalAuthoritySet.has(norm)) {
          const ar = EmailNormalizerAndClassifier.verifyArgentinaRelation(norm, 'NAC', text.slice(0, 500));
          if (ar.isVerified) {
            globalAuthoritySet.add(norm);
            const nowIso = new Date().toISOString();
            batch.push({
              email_normalized: norm,
              email_hash: crypto.createHash('sha256').update(norm).digest('hex'),
              contact_type: EmailNormalizerAndClassifier.classifyContactType(norm, item.name),
              associated_entity: item.name,
              entity_type: 'ORGANIZATION',
              argentina_relation: true,
              argentina_relation_type: ar.relationType,
              source_id: `SRC_${ecoHost.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`,
              source_family: 'FAM_CONTINUOUS_BACKGROUND',
              source_url: item.url,
              public_context: text.slice(0, 250),
              evidence: `Continuous daemon: ${ar.reason}`,
              provenance: { source_url: item.url, extracted_at: nowIso },
              discovered_at: nowIso,
              verified_at: nowIso,
              mission_qualification_status: 'MISSION_QUALIFIED'
            });

            if (batch.length >= 100) {
              await flush();
            }
          }
        }
      }
    } catch (e) {}

    await new Promise(r => setTimeout(r, 200));
  }
}

runDaemon().catch(console.error);
