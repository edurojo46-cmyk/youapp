import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { parseDbUrl } from './export_search_projection_v2.mjs';

const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });

async function sync6PhysicalLeases() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("UPDATE public.atlas_winner_leases SET status = 'INACTIVE' WHERE status = 'ACTIVE'");

    const leases = [
      {
        lease_id: 'lease_r1_pub_boletin_oficial',
        source_id: 'SRC_PUB_BOLETIN_OFICIAL',
        motor_id: 'PUB_MOTOR_BOLETIN_OFICIAL_SOC',
        source_name: 'Boletín Oficial de la República Argentina — Segunda Sección (Sociedades)',
        source_universe: 'CORPORATE_REGISTRIES',
        target_region: 'CABA_PBA',
        rotor_count: 1,
        reason: 'R1 Physical Assignment (PRODUCTION - EPOCH_BORA_A_01)'
      },
      {
        lease_id: 'lease_r2_oai_sedici_unlp',
        source_id: 'SRC_OAI_SEDICI_UNLP',
        motor_id: 'OAI_MOTOR_SEDICI_UNLP',
        source_name: 'SEDICI UNLP — Academic & Research Repository',
        source_universe: 'DOCTORAL_DISSERTATIONS',
        target_region: 'PBA',
        rotor_count: 1,
        reason: 'R2 Physical Assignment (PRODUCTION - EPOCH_SEDICI_UNLP_02b)'
      },
      {
        lease_id: 'lease_r3_ckan_datos_pba',
        source_id: 'SRC_CKAN_DATOS_PBA',
        motor_id: 'CKAN_MOTOR_DATOS_PBA_PROVINCIA',
        source_name: 'Portal de Datos Abiertos de la Provincia de Buenos Aires',
        source_universe: 'PROVINCIAL_PUBLIC_ADMINISTRATION',
        target_region: 'PBA',
        rotor_count: 1,
        reason: 'R3 Physical Assignment (PRODUCTION - EPOCH_DATOS_PBA_03)'
      },
      {
        lease_id: 'lease_r4_arca_datos_abiertos',
        source_id: 'SRC_ARCA_DATOS_ABIERTOS',
        motor_id: 'ARCA_MOTOR_DATOS_ABIERTOS',
        source_name: 'ARCA — Portal Público de Datos Abiertos (AFIP)',
        source_universe: 'TAX_AND_CUSTOMS_REGISTRY',
        target_region: 'CABA_PBA',
        rotor_count: 1,
        reason: 'R4 Physical Assignment (PRODUCTION - EPOCH_R4_ITERATION3_ARCA_04f)'
      },
      {
        lease_id: 'lease_r5_colproba_challenger',
        source_id: 'SRC_COLPROBA_PBA',
        motor_id: 'COLPROBA_MOTOR_DIRECTORIO_PBA',
        source_name: 'Colegio de Abogados de la Provincia de Buenos Aires (ColProBA)',
        source_universe: 'PROFESSIONAL_COUNCILS',
        target_region: 'PBA',
        rotor_count: 1,
        reason: 'R5 Physical Assignment (CHALLENGER - EPOCH_R5_CHALLENGER_COLPROBA_01)'
      },
      {
        lease_id: 'lease_r6_inta_exploration',
        source_id: 'SRC_OAI_INTA_DIGITAL',
        motor_id: 'OAI_MOTOR_INTA_DIGITAL',
        source_name: 'INTA Digital — Repositorio Agropecuario Nacional',
        source_universe: 'AGRICULTURAL_RESEARCH',
        target_region: 'PBA',
        rotor_count: 1,
        reason: 'R6 Physical Assignment (EXPLORATION - EPOCH_R6_EXPLORATION_INTA_01)'
      }
    ];

    for (const l of leases) {
      await client.query(`
        INSERT INTO public.atlas_winner_leases (
          lease_id, source_id, motor_id, source_name, source_universe,
          target_region, rotor_count, allocated_at, lease_until,
          status, reason, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, NOW(), NOW() + INTERVAL '2 hours',
          'ACTIVE', $8, NOW()
        )
        ON CONFLICT (lease_id) DO UPDATE SET
          source_id = $2, motor_id = $3, source_name = $4, source_universe = $5,
          target_region = $6, rotor_count = $7, status = 'ACTIVE', reason = $8,
          lease_until = NOW() + INTERVAL '2 hours', updated_at = NOW()
      `, [l.lease_id, l.source_id, l.motor_id, l.source_name, l.source_universe, l.target_region, l.rotor_count, l.reason]);
    }

    await client.query('COMMIT');
    console.log('PostgreSQL active leases updated to 6 physical slots.');

    // Sync to winner_leases.json
    const res = await client.query("SELECT * FROM public.atlas_winner_leases WHERE status = 'ACTIVE' ORDER BY lease_id");
    const summary = {
      timestamp: new Date().toISOString(),
      active_leases_count: res.rows.length,
      total_active_rotors: res.rows.length,
      pba_active_rotors: res.rows.filter(r => r.target_region === 'PBA' || r.target_region === 'CABA_PBA').length,
      pba_torque_floor_met: true,
      leases: res.rows
    };
    fs.writeFileSync('./reports/atlas/realtime/winner_leases.json', JSON.stringify(summary, null, 2));
    console.log('Synced 6 leases to ./reports/atlas/realtime/winner_leases.json');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error executing leases:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

sync6PhysicalLeases();
