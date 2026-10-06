/**
 * scripts/sync_all_existing_motors_to_knowledge_map.mjs
 * 
 * Synchronizes all 32 existing motors from atlas_discovery_source_motors
 * into atlas_source_knowledge_map, ensuring no historic motor or source is omitted.
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

async function syncAllMotors() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
  const client = await pool.connect();
  try {
    const motorsRes = await client.query('SELECT * FROM public.atlas_discovery_source_motors');
    console.log(`Found ${motorsRes.rows.length} motors in atlas_discovery_source_motors.`);

    for (const m of motorsRes.rows) {
      const sourceId = `SRC_MOTOR_${m.motor_id}`;
      const canonicalUrl = m.endpoint_reference || `https://atlas.internal/sources/${m.source_id}`;
      const sourceName = `${m.source_family} (${m.source_id})`;
      const sourceUniverse = `UNIV_${m.source_family.toUpperCase()}_${m.source_id.toUpperCase()}`;
      
      // Determine geography
      let geo = 'ARGENTINA';
      if (['uba', 'caba', 'gcba', 'cpacf', 'cpcecaba'].some(k => m.source_id.toLowerCase().includes(k) || m.motor_id.toLowerCase().includes(k))) {
        geo = 'CABA';
      } else if (['unlp', 'unmdp', 'unicen', 'unq', 'unlam', 'uns', 'pba', 'laplata'].some(k => m.source_id.toLowerCase().includes(k) || m.motor_id.toLowerCase().includes(k))) {
        geo = 'PBA';
      }

      // Determine template
      let template = 'REST_API_MOTOR';
      if (m.protocol === 'OAI_PMH') template = 'OAI_PMH_MOTOR';
      else if (m.protocol === 'SPARQL') template = 'SPARQL_MOTOR';
      else if (m.protocol === 'CKAN') template = 'CKAN_MOTOR';
      else if (m.protocol === 'CSV_STREAM') template = 'CSV_BULK_MOTOR';
      else if (m.protocol === 'JSON_FEED') template = 'JSON_BULK_MOTOR';

      // Status
      let status = 'ACTIVE';
      if (m.state === 'EXHAUSTED') status = 'EXHAUSTED';
      else if (m.overlap_observed && parseFloat(m.overlap_observed) >= 0.90) status = 'SEMANTIC_MOTOR';

      const overlapVal = m.overlap_observed ? parseFloat(m.overlap_observed) : 0.50;
      const recordsDepth = parseInt(m.raw_source_record_depth || m.estimated_person_depth || 10000, 10);

      await client.query(`
        INSERT INTO public.atlas_source_knowledge_map (
          source_id,
          canonical_url,
          source_name,
          source_family,
          source_universe,
          owner_organization,
          geography_scope,
          protocol,
          access_method,
          public_status,
          permitted_status,
          schema_signature,
          supported_motor_template,
          estimated_records,
          estimated_unique_entities,
          reliability_score,
          quality_score,
          storage_amplification,
          current_status,
          entity_capabilities,
          source_graph_relations,
          overlap_memory,
          field_telemetry,
          tesla_motor_capabilities,
          last_profiled_at,
          updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, 'DIRECT_PULL', 'PUBLIC', 'PERMITTED',
          $9, $10, $11, $12, 0.95, 0.90, 1.10, $13,
          $14, $15, $16, $17, $18, now(), now()
        )
        ON CONFLICT (source_id) DO UPDATE SET
          source_name = EXCLUDED.source_name,
          current_status = EXCLUDED.current_status,
          overlap_memory = EXCLUDED.overlap_memory,
          field_telemetry = EXCLUDED.field_telemetry,
          updated_at = now();
      `, [
        sourceId,
        canonicalUrl,
        sourceName,
        m.source_family,
        sourceUniverse,
        m.source_family,
        geo,
        m.protocol,
        JSON.stringify({ endpoint: m.endpoint_reference, partition_id: m.partition_id }),
        template,
        recordsDepth,
        Math.floor(recordsDepth * 0.7),
        status,
        JSON.stringify({ PERSON: 'HIGH', ORGANIZATION: 'MEDIUM', UNIVERSITY: 'HIGH' }),
        JSON.stringify([
          { relation_type: 'SAME_FAMILY', target_family: m.source_family },
          { relation_type: 'SAME_GEOGRAPHY', target_geography: geo }
        ]),
        JSON.stringify({
          overlap_with_ssot_history: [overlapVal],
          overlap_with_other_universes: {},
          true_net_new_history: [Math.floor((1 - overlapVal) * 1000)],
          saturation_curve: [overlapVal],
          records_scanned: parseInt(m.already_processed || 0, 10),
          true_net_new_found: Math.floor(parseInt(m.already_processed || 0, 10) * (1 - overlapVal)),
          estimated_unseen_population: parseInt(m.remaining_estimated_depth || 0, 10),
          net_new_yield_curve: [1 - overlapVal]
        }),
        JSON.stringify({
          useful_torque_sec: (1 - overlapVal) * 2.0,
          field_slip_percent: overlapVal,
          field_strength_score: (1 - overlapVal) * 1.0,
          active_rotors: 1,
          max_rotors: 3,
          shardable: true,
          shards: []
        }),
        ['CAPABILITY_BULK_FETCH', 'CAPABILITY_SHARDABLE', 'CAPABILITY_SET_BASED_IDENTITY']
      ]);
    }

    const finalCount = await client.query('SELECT count(*) FROM public.atlas_source_knowledge_map');
    console.log(`[Sync Complete] Total rows in atlas_source_knowledge_map: ${finalCount.rows[0].count}`);
  } finally {
    client.release();
    await pool.end();
  }
}

syncAllMotors().catch(console.error);
