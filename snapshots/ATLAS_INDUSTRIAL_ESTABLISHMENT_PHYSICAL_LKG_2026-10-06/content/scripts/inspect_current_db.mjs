import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

async function inspectAndSetup() {
  const pool = new pg.Pool(parseDbUrl());
  
  // 1. Group by source_id in atlas_public_email_contacts_1m
  const res = await pool.query(`
    SELECT 
      CASE 
        WHEN source_id LIKE 'ECO_%' THEN 'ECOSYSTEM_WEB'
        WHEN source_id LIKE 'SRC_DISC_%' THEN 'DISCOVERY_WEB'
        WHEN source_id = 'SRC_PROVEEDORES_SISTEMA_LEGACY' THEN 'PROVEEDORES_LEGACY'
        WHEN source_id LIKE 'SRC_BA_%' THEN 'GCBA_SOURCES'
        WHEN source_id LIKE 'SRC_PBA_%' THEN 'PBA_SOURCES'
        WHEN source_id LIKE 'SRC_DNDA_%' THEN 'DNDA_SOURCES'
        ELSE 'OTHER'
      END as source_category,
      COUNT(*) as count
    FROM public.atlas_public_email_contacts_1m
    GROUP BY source_category
    ORDER BY count DESC;
  `);

  console.log('Current composition of atlas_public_email_contacts_1m:');
  console.table(res.rows);

  // 2. Identify the 543 legitimate net-new emails from live web ecosystems & discovery
  const webRes = await pool.query(`
    SELECT source_id, COUNT(*) as count 
    FROM public.atlas_public_email_contacts_1m 
    WHERE source_id LIKE 'ECO_%' OR source_id LIKE 'SRC_DISC_%'
    GROUP BY source_id 
    ORDER BY count DESC;
  `);
  console.log('\nWeb Ecosystem & Discovery contacts in PostgreSQL:');
  console.table(webRes.rows.slice(0, 15));
  
  const totalWeb = webRes.rows.reduce((acc, r) => acc + parseInt(r.count, 10), 0);
  console.log(`Total Web & Discovery Contacts: ${totalWeb.toLocaleString()}`);

  await pool.end();
}

inspectAndSetup().catch(console.error);
