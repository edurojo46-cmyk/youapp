import dotenv from 'dotenv';
dotenv.config();

import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

async function forensicAudit() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
  const client = await pool.connect();

  try {
    console.log('=== FORENSIC BREAKDOWN OF 25,000 NON-PREEXISTING ROWS ===');

    // 1. Separate the 11,588 inserted by run_production_gate_25k vs the 13,412 prior rows
    const bySource = await client.query(`
      SELECT 
        source_origin,
        count(*) as count,
        min(first_seen_at) as min_seen,
        max(first_seen_at) as max_seen
      FROM public.atlas_global_email_authority
      WHERE is_preexisting = false
      GROUP BY source_origin
      ORDER BY min(first_seen_at) ASC, count(*) DESC;
    `);

    console.table(bySource.rows);

    // 2. Check source_family in atlas_public_email_contacts_1m for these emails
    const crossCheck = await client.query(`
      SELECT 
        c.source_family,
        c.argentina_relation_type,
        c.mission_qualification_status,
        count(a.email_normalized) as auth_count,
        min(c.discovered_at) as min_discovered,
        max(c.discovered_at) as max_discovered
      FROM public.atlas_global_email_authority a
      LEFT JOIN public.atlas_public_email_contacts_1m c ON a.email_normalized = c.email_normalized
      WHERE a.is_preexisting = false
      GROUP BY c.source_family, c.argentina_relation_type, c.mission_qualification_status
      ORDER BY auth_count DESC;
    `);

    console.log('=== CROSS CHECK WITH atlas_public_email_contacts_1m ===');
    console.table(crossCheck.rows);

    // 3. Count exactly rows with first_seen_at >= when AUTONOMOUS_500K_RUN started vs prior
    // When did AUTONOMOUS_500K_RUN start? Let's check script commit/run logs or timestamps
    const timeClusters = await client.query(`
      SELECT 
        date_trunc('hour', first_seen_at) as hour_cluster,
        count(*) as count
      FROM public.atlas_global_email_authority
      WHERE is_preexisting = false
      GROUP BY hour_cluster
      ORDER BY hour_cluster ASC;
    `);
    console.log('=== TIME CLUSTERS OF NON-PREEXISTING ROWS ===');
    console.table(timeClusters.rows);

    // Check what was in the ledgers or previous scripts
    // Specifically check the 543 rows from GEN_1_ECOSYSTEM_NET_NEW
    const gen1Check = await client.query(`
      SELECT count(*) 
      FROM public.atlas_global_email_authority
      WHERE is_preexisting = false AND (source_origin LIKE 'ECO_%' OR source_origin LIKE 'SRC_DISC_%');
    `);
    console.log('Rows originating from ECO_% or SRC_DISC_% (likely GEN_1):', gen1Check.rows[0].count);

    // Check Compras / Sistema de Contrataciones (8766 rows)
    const comprasCheck = await client.query(`
      SELECT 
        source_origin,
        first_seen_at,
        count(*)
      FROM public.atlas_global_email_authority
      WHERE source_origin = 'SRC_INFRA_DATOS_GOB_AR'
      GROUP BY source_origin, first_seen_at;
    `);
    console.log('SRC_INFRA_DATOS_GOB_AR sample:', comprasCheck.rows.slice(0, 5));

    // Check CDN Buenos Aires (2454 rows)
    const cdnCheck = await client.query(`
      SELECT 
        source_origin,
        first_seen_at,
        count(*)
      FROM public.atlas_global_email_authority
      WHERE source_origin = 'SRC_CDN_BUENOSAIRES_GOB_AR'
      GROUP BY source_origin, first_seen_at;
    `);
    console.log('SRC_CDN_BUENOSAIRES_GOB_AR sample:', cdnCheck.rows.slice(0, 5));

  } finally {
    client.release();
    await pool.end();
  }
}

forensicAudit().catch(console.error);
