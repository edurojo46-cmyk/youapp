import pg from 'pg';
import dotenv from 'dotenv';
import crypto from 'crypto';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();
const dbConfig = parseDbUrl();

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

async function testIsolated() {
  const client = new pg.Client({
    user: dbConfig.user,
    password: dbConfig.password,
    host: dbConfig.host,
    port: 5432,
    database: 'atlas_shadow_cold_gate',
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  const count = 500;
  const ids = [];
  const hashes = [];
  const names = [];
  const orgs = [];
  const roles = [];
  const profs = [];
  const geos = [];
  const evs = [];
  const vecs = [];

  for (let i = 0; i < count; i++) {
    const rawId = `iso_${Date.now()}_${i}`;
    const hash = crypto.createHash('sha256').update(rawId).digest('hex');
    ids.push(`per_iso_${hash.slice(0, 16)}`);
    hashes.push(Buffer.from(hash, 'hex'));
    names.push(`Persona ${i}`);
    orgs.push('Org Test');
    roles.push('Role Test');
    profs.push('Prof Test');
    geos.push('CABA');
    evs.push('{}');
    vecs.push(toPrebuiltTsvector(`Persona ${i} Org Test Role Test CABA`));
  }

  console.log('Testing Canonical table insert (500 rows)...');
  let t0 = performance.now();
  await client.query(`
    INSERT INTO atlas_shadow.atlas_canonical_persons_v2 (
      atlas_person_id, primary_identity_hash, display_name, primary_organization, primary_role, primary_profession, geography_id, qualification_state, activity_state, evidence_summary, first_committed_at, last_seen_at
    )
    SELECT
      u.id, u.hash, u.name, u.org, u.role, u.prof, u.geo, 'QUALIFIED', 'ACTIVE', u.ev, clock_timestamp(), clock_timestamp()
    FROM UNNEST($1::text[], $2::bytea[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[]) 
    AS u(id, hash, name, org, role, prof, geo, ev)
    ON CONFLICT (atlas_person_id) DO NOTHING;
  `, [ids, hashes, names, orgs, roles, profs, geos, evs]);
  console.log(`Canonical insert (500 rows): ${(performance.now() - t0).toFixed(1)} ms`);

  console.log('Testing Search table insert (500 rows)...');
  const docIds = ids.map(id => `doc_${id}`);
  t0 = performance.now();
  await client.query(`
    INSERT INTO atlas_shadow.atlas_argentina_people_search_v1 (
      document_id, canonical_id, full_name, normalized_name, organization, role, profession, geography_id, qualification_state, search_vector, created_at
    )
    SELECT
      u.doc_id, u.can_id, u.name, UPPER(u.name), u.org, u.role, u.prof, u.geo, 'QUALIFIED', u.vec::tsvector, clock_timestamp()
    FROM UNNEST($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[])
    AS u(doc_id, can_id, name, org, role, prof, geo, vec)
    ON CONFLICT (document_id) DO NOTHING;
  `, [docIds, ids, names, orgs, roles, profs, geos, vecs]);
  console.log(`Search insert (500 rows): ${(performance.now() - t0).toFixed(1)} ms`);

  await client.end();
}

testIsolated().catch(console.error);
