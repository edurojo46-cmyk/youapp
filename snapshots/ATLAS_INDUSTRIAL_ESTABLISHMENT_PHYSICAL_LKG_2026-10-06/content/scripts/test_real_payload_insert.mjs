import pg from 'pg';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

async function main() {
  const shadowCfg = { ...parseDbUrl(), database: 'atlas_shadow_cold_gate' };
  const p = new pg.Pool(shadowCfg);
  const c = await p.connect();

  console.log('Testing inserting real batch from OAI-PMH...');
  // Fetch real sample from CONICET
  const res = await fetch('https://ri.conicet.gov.ar/oai/request?verb=ListRecords&metadataPrefix=oai_dc');
  const xml = await res.text();
  const recordMatches = [...xml.matchAll(/<record>([\s\S]*?)<\/record>/gi)];

  console.log(`Fetched ${recordMatches.length} records.`);
  for (const m of recordMatches.slice(0, 5)) {
    const recContent = m[1];
    const idMatch = recContent.match(/<identifier>([^<]+)<\/identifier>/i);
    const recId = idMatch ? idMatch[1].trim() : 'REC';
    const creators = [...recContent.matchAll(/<dc:creator>([^<]+)<\/dc:creator>/gi)].map(c => c[1]);

    for (const cName of creators) {
      const personId = crypto.randomUUID();
      const docId = crypto.randomUUID();
      const norm = cName.toUpperCase().trim();
      const sourcePersonId = `${recId}:${crypto.createHash('md5').update(norm).digest('hex').slice(0, 10)}`;

      try {
        await c.query('BEGIN;');
        const resId = await c.query(`
          INSERT INTO atlas_shadow.atlas_person_identity_map 
          (atlas_person_id, source_id, source_person_id, identifier_type, identifier_value, resolution_method, confidence)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (source_id, source_person_id) DO NOTHING;
        `, [personId, 'SRC_OAI_CONICET_DIGITAL', sourcePersonId, 'NORMALIZED_NAME_HASH', norm, 'REAL_RADAR_REMOTE_OAI_CKAN', 0.95]);

        if (resId.rowCount > 0) {
          await c.query(`
            INSERT INTO atlas_shadow.atlas_argentina_people_search_v1 
            (document_id, canonical_id, full_name, normalized_name, organization, role, geography_id, qualification_state)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT DO NOTHING;
          `, [docId, personId, cName, norm, 'CONICET', 'Investigador', 'NATIONAL', 'QUALIFIED']);
          console.log(`✓ Inserted: ${cName} (${sourcePersonId})`);
        } else {
          console.log(`- Duplicate skipped: ${cName}`);
        }

        await c.query('COMMIT;');
      } catch (err) {
        await c.query('ROLLBACK;');
        console.error(`✗ FAILED FOR "${cName}":`, err.message);
      }
    }
  }

  c.release();
  await p.end();
}

main().catch(console.error);
