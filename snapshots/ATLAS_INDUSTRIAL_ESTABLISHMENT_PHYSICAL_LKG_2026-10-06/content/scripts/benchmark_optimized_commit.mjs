import pg from 'pg';
import crypto from 'crypto';
import { parseDbUrl } from './export_search_projection_v2.mjs';

const dbConfig = parseDbUrl();
const pool = new pg.Pool({
  user: 'postgres',
  password: dbConfig.password,
  host: 'db.jtnurafmngaxdwlzpvxv.supabase.co',
  port: 5432,
  database: 'atlas_shadow_cold_gate',
  ssl: { rejectUnauthorized: false }
});

function toPrebuiltTsvector(text) {
  const words = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1);
  const unique = [...new Set(words)];
  return unique.map((w, idx) => `'${w}':${idx + 1}`).join(' ');
}

async function run() {
  const client = await pool.connect();
  try {
    const candidates = [];
    for (let i = 0; i < 1000; i++) {
      const pid = `test_opt_${Date.now()}_${i}`;
      const hash = crypto.createHash('sha256').update(pid).digest('hex');
      candidates.push({
        person_id: pid,
        identity_hash_hex: hash,
        display_name: `Investigador Real ${i}`,
        normalized_name: `INVESTIGADOR REAL ${i}`,
        organization: 'Universidad Nacional de La Plata',
        role: 'Investigador Científico UNLP',
        profession: 'Docente Investigador',
        geography_id: 'PBA',
        source_id: 'SRC_OAI_SEDICI_ING',
        source_url: 'http://sedici.unlp.edu.ar/oai/request',
        fetched_at: new Date().toISOString(),
        remote_response_hash: 'b'.repeat(64),
        raw_record_id: `rec_${i}`,
        raw_provenance_reference: `oai_dc:rec_${i}`,
        parser_version: 'atlas_oai_dc_v2.0',
        extraction_timestamp: new Date().toISOString(),
        geo_evidence: 'Repository institutional origin in PBA: Universidad Nacional de La Plata',
        qualification_evidence: 'Peer-reviewed scientific/academic research publication'
      });
    }

    const t0 = Date.now();
    await client.query('BEGIN');
    await client.query('SET LOCAL synchronous_commit = off');

    // 1. Canonical UNNEST
    const canIds = [];
    const canHashes = [];
    const canNames = [];
    const canOrgs = [];
    const canRoles = [];
    const canProfs = [];
    const canGeos = [];
    const canEvidences = [];

    for (const c of candidates) {
      canIds.push(c.person_id);
      canHashes.push(Buffer.from(c.identity_hash_hex, 'hex'));
      canNames.push(c.display_name);
      canOrgs.push(c.organization);
      canRoles.push(c.role);
      canProfs.push(c.profession);
      canGeos.push(c.geography_id);
      canEvidences.push(JSON.stringify({
        source_id: c.source_id,
        source_url: c.source_url,
        fetched_at: c.fetched_at,
        remote_response_hash: c.remote_response_hash,
        raw_record_id: c.raw_record_id,
        raw_provenance_reference: c.raw_provenance_reference,
        parser_version: c.parser_version,
        extraction_timestamp: c.extraction_timestamp,
        geo_evidence: c.geo_evidence,
        qualification_evidence: c.qualification_evidence
      }));
    }

    await client.query(`
      INSERT INTO atlas_shadow.atlas_canonical_persons_v2 (
        atlas_person_id, primary_identity_hash, display_name, primary_organization, primary_role, primary_profession, geography_id, qualification_state, activity_state, evidence_summary, first_committed_at, last_seen_at
      )
      SELECT
        u.id, u.hash, u.name, u.org, u.role, u.prof, u.geo, 'QUALIFIED', 'ACTIVE', u.ev, clock_timestamp(), clock_timestamp()
      FROM UNNEST(
        $1::text[], $2::bytea[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[]
      ) AS u(id, hash, name, org, role, prof, geo, ev)
      ON CONFLICT (atlas_person_id) DO NOTHING;
    `, [canIds, canHashes, canNames, canOrgs, canRoles, canProfs, canGeos, canEvidences]);

    // 2. Search UNNEST with Pre-built tsvector
    const searchDocIds = [];
    const searchCanIds = [];
    const searchNames = [];
    const searchNorms = [];
    const searchOrgs = [];
    const searchRoles = [];
    const searchProfs = [];
    const searchGeos = [];
    const searchVectors = [];

    for (const c of candidates) {
      searchDocIds.push(`doc_${c.person_id}`);
      searchCanIds.push(c.person_id);
      searchNames.push(c.display_name);
      searchNorms.push(c.normalized_name);
      searchOrgs.push(c.organization);
      searchRoles.push(c.role);
      searchProfs.push(c.profession);
      searchGeos.push(c.geography_id);
      searchVectors.push(toPrebuiltTsvector(`${c.display_name} ${c.organization} ${c.role} ${c.geography_id}`));
    }

    await client.query(`
      INSERT INTO atlas_shadow.atlas_argentina_people_search_v1 (
        document_id, canonical_id, full_name, normalized_name, organization, role, profession, geography_id, qualification_state, search_vector, created_at
      )
      SELECT
        u.doc_id, u.can_id, u.name, u.norm, u.org, u.role, u.prof, u.geo, 'QUALIFIED', u.vec::tsvector, clock_timestamp()
      FROM UNNEST(
        $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[]
      ) AS u(doc_id, can_id, name, norm, org, role, prof, geo, vec)
      ON CONFLICT (document_id) DO NOTHING;
    `, [searchDocIds, searchCanIds, searchNames, searchNorms, searchOrgs, searchRoles, searchProfs, searchGeos, searchVectors]);

    await client.query('COMMIT');
    const totalMs = Date.now() - t0;
    console.log(`🚀 1,000 FULL SEARCHABLE ROWS COMMITTED in ${totalMs}ms (${(1000 / (totalMs / 1000)).toFixed(1)} rows/sec)!`);

    // Clean up
    await client.query("DELETE FROM atlas_shadow.atlas_canonical_persons_v2 WHERE atlas_person_id LIKE 'test_opt_%'");
    await client.query("DELETE FROM atlas_shadow.atlas_argentina_people_search_v1 WHERE document_id LIKE 'doc_test_opt_%'");
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(console.error);
