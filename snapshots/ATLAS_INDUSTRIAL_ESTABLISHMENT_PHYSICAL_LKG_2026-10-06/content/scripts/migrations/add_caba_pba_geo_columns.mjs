import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from '../export_search_projection_v2.mjs';
dotenv.config();

const client = new pg.Client(parseDbUrl());

async function main() {
  await client.connect();
  console.log('Connected to PostgreSQL SSOT.');

  await client.query(`
    ALTER TABLE atlas_people_discovery_candidates 
    ADD COLUMN IF NOT EXISTS geo_association_type text,
    ADD COLUMN IF NOT EXISTS geo_confidence numeric(4,2) DEFAULT 1.0,
    ADD COLUMN IF NOT EXISTS geo_source text,
    ADD COLUMN IF NOT EXISTS geo_evidence text,
    ADD COLUMN IF NOT EXISTS target_region text;
  `);
  console.log('Verified geo columns in atlas_people_discovery_candidates.');

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_discovery_target_region 
    ON atlas_people_discovery_candidates (target_region) 
    WHERE target_region IS NOT NULL;
  `);
  console.log('Verified index idx_discovery_target_region.');

  // Update existing 24,628 CABA candidates so they have target_region = 'CABA', geo_association_type = 'WORK'
  const updateRes = await client.query(`
    UPDATE atlas_people_discovery_candidates 
    SET target_region = 'CABA',
        geo_association_type = COALESCE(location_relation_type, 'WORK'),
        geo_confidence = 1.0,
        geo_source = 'CABA_DIRECTORY_BASELINE',
        geo_evidence = COALESCE(location_evidence, 'Registro verificado en Ciudad Autónoma de Buenos Aires')
    WHERE (
      geography_id LIKE 'geo_caba_%' 
      OR geography_id = 'caba'
      OR geography_id IN ('palermo', 'recoleta', 'belgrano', 'caballito', 'almagro', 'balvanera', 'san_nicolas', 'monserrat', 'puerto_madero', 'flores', 'villa_crespo', 'nunez', 'colegiales', 'barracas', 'boedo', 'chacarita', 'constitucion', 'floresta', 'liniers', 'mataderos', 'parque_chacabuco', 'parque_patricios', 'paternal', 'saavedra', 'san_cristobal', 'san_telmo', 'villa_devoto', 'villa_lugano', 'villa_urquiza')
    ) AND target_region IS NULL;
  `);
  console.log(`Updated ${updateRes.rowCount} baseline CABA candidates with contractual geo metadata.`);

  // Verify counts
  const countRes = await client.query(`
    SELECT target_region, count(*) as count
    FROM atlas_people_discovery_candidates
    WHERE target_region IS NOT NULL
    GROUP BY target_region;
  `);
  console.log('Target region counts in DB:', countRes.rows);

  await client.end();
}

main().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
