import pg from 'pg';
import { parseDbUrl } from '../export_search_projection_v2.mjs';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const c = new pg.Client(parseDbUrl());
  await c.connect();

  console.log('=== AUDITING EXISTING GEOGRAPHY IN SSOT & CANDIDATES ===\n');

  // 1. Check distinct geography_id in candidates that might be PBA
  const pbaGeoPatterns = [
    '%buenos_aires%', '%la_plata%', '%mar_del_plata%', '%bahia_blanca%', '%quilmes%',
    '%lanus%', '%moron%', '%san_martin%', '%san_isidro%', '%vicente_lopez%', '%tigre%',
    '%pilar%', '%avellaneda%', '%lomas_de_zamora%', '%tandil%', '%olavarria%', '%pergamino%',
    '%junin%', '%san_nicolas_pba%', '%zarate%', '%campana%', '%berazategui%'
  ];

  console.log('1. Checking geography_id in atlas_people_discovery_candidates...');
  const geoCand = await c.query(`
    SELECT geography_id, count(*) as count
    FROM atlas_people_discovery_candidates
    WHERE geography_id ILIKE ANY($1) OR geography_id ILIKE '%pba%' OR geography_id ILIKE '%provincia%'
    GROUP BY geography_id
    ORDER BY count DESC
    LIMIT 30;
  `, [pbaGeoPatterns]);
  console.table(geoCand.rows);

  // 2. Check neighborhood in candidates
  console.log('2. Checking neighborhood in atlas_people_discovery_candidates...');
  const neighCand = await c.query(`
    SELECT neighborhood, count(*) as count
    FROM atlas_people_discovery_candidates
    WHERE neighborhood ILIKE ANY($1) OR neighborhood ILIKE '%buenos aires%'
    GROUP BY neighborhood
    ORDER BY count DESC
    LIMIT 30;
  `, [pbaGeoPatterns]);
  console.table(neighCand.rows);

  // 3. Check organization names in candidates that indicate CABA / PBA
  console.log('3. Checking organizations with UNLP, CIC, UNQ, UNSAM, etc. in candidates...');
  const orgCand = await c.query(`
    SELECT 
      CASE 
        WHEN organization ILIKE '%UNLP%' OR organization ILIKE '%La Plata%' THEN 'UNLP / La Plata'
        WHEN organization ILIKE '%UNSAM%' OR organization ILIKE '%General San Martín%' THEN 'UNSAM'
        WHEN organization ILIKE '%UNQ%' OR organization ILIKE '%Quilmes%' THEN 'UNQ'
        WHEN organization ILIKE '%CIC%' AND organization ILIKE '%Buenos Aires%' THEN 'CIC PBA'
        WHEN organization ILIKE '%UBA%' OR organization ILIKE '%Buenos Aires%' THEN 'UBA / CABA'
        WHEN organization ILIKE '%Provincia de Buenos Aires%' THEN 'Gobierno PBA'
        ELSE 'OTHER'
      END as org_group,
      count(*) as count
    FROM atlas_people_discovery_candidates
    WHERE organization IS NOT NULL
    GROUP BY 1
    ORDER BY count DESC;
  `);
  console.table(orgCand.rows);

  // 4. Check atlas_person_identity_map sources
  console.log('4. Checking source_id in atlas_person_identity_map...');
  const sourcesMap = await c.query(`
    SELECT source_id, count(*) as row_count, count(DISTINCT atlas_person_id) as unique_people
    FROM atlas_person_identity_map
    GROUP BY source_id
    ORDER BY row_count DESC
    LIMIT 20;
  `);
  console.table(sourcesMap.rows);

  await c.end();
}

main().catch(console.error);
