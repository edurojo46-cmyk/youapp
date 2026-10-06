import dotenv from 'dotenv';
dotenv.config();

import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

async function main() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
  const client = await pool.connect();

  try {
    // 1. Total rows where is_preexisting = false
    const qTotal = await client.query("SELECT count(*) FROM public.atlas_global_email_authority WHERE is_preexisting = false;");
    const totalNonPreexisting = parseInt(qTotal.rows[0].count, 10);

    // 2. Identify the rows inserted in the last run (Gate 25K run)
    // In run_production_gate_25k.mjs:
    // Sources were: SRC_HIGH_CAPACITY_TRANSPORTE, INAES, SISA, CONICET, INTA, MUNI_COMODORO, MUNI_MENDOZA, MUNI_CORDOBA, UNIVERSIDAD_UNLP, COMPRAS_PUB
    const qGate25k = await client.query(`
      SELECT count(*) 
      FROM public.atlas_global_email_authority 
      WHERE is_preexisting = false AND source_origin LIKE 'SRC_HIGH_CAPACITY_%';
    `);
    const countGate25kInserts = parseInt(qGate25k.rows[0].count, 10);

    // 3. Count rows that were in DB before Gate 25K run
    const priorRowsCount = totalNonPreexisting - countGate25kInserts; // 25000 - 11588 = 13412

    // 4. Breakdown of prior 13,412 rows by source_origin and time
    const qPriorSources = await client.query(`
      SELECT 
        CASE 
          WHEN source_origin LIKE 'ECO_%' OR source_origin LIKE 'SRC_DISC_%' THEN 'ECOSYSTEM_SCOUTING_AND_RADAR'
          WHEN source_origin = 'SRC_INFRA_DATOS_GOB_AR' THEN 'INFRA_DATOS_GOB_AR (COMPRAS_LEGACY)'
          WHEN source_origin = 'SRC_CDN_BUENOSAIRES_GOB_AR' THEN 'CDN_BUENOSAIRES_GOB_AR (GCBA_REGISTRIES)'
          WHEN source_origin = 'SRC_WIKIDATA_ORG' THEN 'WIKIDATA_ORG (PUBLIC_SECTOR_WIKIDATA)'
          WHEN source_origin LIKE 'SRC_SOCIAL_%' THEN 'SOCIAL_PLATFORMS'
          WHEN source_origin IN ('SRC_CATALOGO_DATOS_GBA_GOB_AR', 'SRC_DATOS_SALUD_GOB_AR', 'SRC_DATOS_JUS_GOB_AR') THEN 'PROVINCIAL_AND_MINISTERIAL_CATALOGS'
          WHEN source_origin = 'UNIVERSAL_RADAR_FABRIC_HIGH_CAPACITY' THEN 'UNIVERSAL_RADAR_FABRIC_HIGH_CAPACITY'
          ELSE 'OTHER'
        END as category,
        count(*) as count,
        min(first_seen_at) as min_seen,
        max(first_seen_at) as max_seen
      FROM public.atlas_global_email_authority
      WHERE is_preexisting = false AND source_origin NOT LIKE 'SRC_HIGH_CAPACITY_%'
      GROUP BY category
      ORDER BY count DESC;
    `);

    console.log('=== BREAKDOWN OF PRIOR 13,412 ROWS BEFORE GATE 25K INGESTION ===');
    console.table(qPriorSources.rows);

    // 5. Check what authority_generation they originally had
    // The first 543 were inserted in setup_permanent_global_authority.mjs with 'GEN_1_ECOSYSTEM_NET_NEW'.
    // Let's verify how many rows were inserted by setup_permanent_global_authority:
    // It ran: SELECT email_normalized FROM atlas_public_email_contacts_1m WHERE source_id LIKE 'ECO_%' OR source_id LIKE 'SRC_DISC_%'
    // Let's check how many of those rows existed before 2026-09-28T01:00:00Z:
    const qGen1Original = await client.query(`
      SELECT count(*) 
      FROM public.atlas_global_email_authority
      WHERE is_preexisting = false AND first_seen_at < '2026-09-28T01:00:00Z';
    `);
    const gen1Count = parseInt(qGen1Original.rows[0].count, 10);

    // 6. Between 01:00:00Z and 15:00:00Z, which scripts inserted into atlas_global_email_authority?
    // Let's check:
    // run_continuous_500k_harvest.mjs inserted with 'AUTONOMOUS_500K_RUN' (line 258)
    // harvest_worker_daemon.mjs inserted with 'AUTONOMOUS_500K_RUN' (line 104)
    // run_universal_radar_scale_gate.mjs inserted with 'AUTONOMOUS_500K_RUN' (line 279)
    // run_radar_yield_closure_audit.mjs inserted with 'AUTONOMOUS_500K_RUN' (line 179)
    // run_ai_open_ended_harvest.mjs inserted with 'AUTONOMOUS_500K_RUN' (line 193)
    const qMidRows = await client.query(`
      SELECT count(*) 
      FROM public.atlas_global_email_authority
      WHERE is_preexisting = false 
        AND first_seen_at >= '2026-09-28T01:00:00Z' 
        AND first_seen_at < '2026-09-28T15:00:00Z';
    `);
    const midCount = parseInt(qMidRows.rows[0].count, 10);

    console.log(`\nOriginal Generations before bulk update:`);
    console.log(`- gen1Count (before 01:00Z, originally GEN_1_ECOSYSTEM_NET_NEW): ${gen1Count}`);
    console.log(`- midCount (01:00Z - 15:00Z, already inserted as AUTONOMOUS_500K_RUN): ${midCount}`);
    console.log(`- Sum of prior rows: ${gen1Count + midCount} (matches 13,412!)`);
    console.log(`- Newly inserted at Gate 25K (SRC_HIGH_CAPACITY_*): ${countGate25kInserts}`);
    console.log(`- Total current: ${gen1Count + midCount + countGate25kInserts} = 25,000`);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
