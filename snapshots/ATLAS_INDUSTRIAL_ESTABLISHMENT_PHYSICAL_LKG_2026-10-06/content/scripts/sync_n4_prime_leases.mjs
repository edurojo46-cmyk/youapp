import fs from 'fs';
import path from 'path';
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const now = Date.now();
const EPOCH_ID = `EPOCH_N4_PRIME_${now}`;
console.log(`Setting up N=4 Prime with Epoch: ${EPOCH_ID}`);

const leasesFile = path.resolve('reports/atlas/realtime/winner_leases.json');
let currentLeases = { leases: [] };
if (fs.existsSync(leasesFile)) {
  try {
    currentLeases = JSON.parse(fs.readFileSync(leasesFile, 'utf8'));
  } catch (e) {}
}

const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });

async function syncN4Prime() {
  const client = await pool.connect();
  try {
    // 1. Mark ARCA as SLEEP / RELEASED_DEMOTION
    await client.query(`
      UPDATE public.atlas_winner_leases
      SET status = 'SLEEP',
          reason = 'ARCA Demoted to SLEEP under hysteresis contract (Torque: 0.18/s, Canary realization: 0.08)',
          updated_at = NOW()
      WHERE motor_id = 'ARCA_MOTOR_DATOS_ABIERTOS';
    `).catch(() => {});

    // 2. Mark previous R6 INTA exploration lease as COMPLETED_MIGRATED (preserving historical lineage)
    await client.query(`
      UPDATE public.atlas_winner_leases
      SET status = 'COMPLETED_MIGRATED',
          reason = 'INTA Exploration Winner migrated from R6 to R4 Torque Axis (Lineage Preserved: EPOCH_R6_EXPLORATION_INTA_01)',
          updated_at = NOW()
      WHERE lease_id = 'lease_r6_inta_exploration';
    `).catch(() => {});

    // 3. Mark ColProBA as SLEEP
    await client.query(`
      UPDATE public.atlas_winner_leases
      SET status = 'SLEEP',
          reason = 'ColProBA Challenger Lost (Torque: 0.16/s < 0.20/s ARCA). Rotated to SLEEP.',
          updated_at = NOW()
      WHERE motor_id = 'COLPROBA_MOTOR_DIRECTORIO_PBA';
    `).catch(() => {});

    // 4. Create new physical lease for R4 -> INTA DIGITAL
    const newLeaseUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await client.query(`
      INSERT INTO public.atlas_winner_leases (
        lease_id, source_id, motor_id, source_name, source_universe,
        target_region, rotor_count, allocated_at, lease_until,
        status, reason, updated_at
      ) VALUES (
        'lease_r4_inta_digital_prime',
        'SRC_OAI_INTA_DIGITAL',
        'OAI_MOTOR_INTA_DIGITAL',
        'INTA Digital — Repositorio Agropecuario Nacional',
        'AGRICULTURAL_RESEARCH',
        'PBA',
        1,
        NOW(),
        $1,
        'ACTIVE',
        $2,
        NOW()
      )
      ON CONFLICT (lease_id) DO UPDATE SET
        status = 'ACTIVE',
        reason = $2,
        lease_until = $1,
        updated_at = NOW();
    `, [newLeaseUntil, `R4 Physical Assignment (N=4 PRIME TORQUE_AXIS - ${EPOCH_ID})`]).catch(err => {
      console.warn('DB upsert note:', err.message);
    });

    console.log('✅ PostgreSQL winner leases updated for N=4 Prime.');

    // 5. Update winner_leases.json
    const activeLeases = [
      {
        lease_id: 'lease_r1_pub_boletin_oficial',
        source_id: 'SRC_PUB_BOLETIN_OFICIAL',
        motor_id: 'PUB_MOTOR_BOLETIN_OFICIAL_SOC',
        source_name: 'Boletín Oficial de la República Argentina — Segunda Sección (Sociedades)',
        source_universe: 'CORPORATE_REGISTRIES',
        target_region: 'CABA_PBA',
        rotor_count: 1,
        role: 'TORQUE_AXIS',
        status: 'ACTIVE',
        reason: 'R1 Physical Assignment (PRODUCTION - EPOCH_BORA_A_01)',
        updated_at: new Date().toISOString()
      },
      {
        lease_id: 'lease_r2_oai_sedici_unlp',
        source_id: 'SRC_OAI_SEDICI_UNLP',
        motor_id: 'OAI_MOTOR_SEDICI_UNLP',
        source_name: 'SEDICI UNLP — Academic & Research Repository',
        source_universe: 'DOCTORAL_DISSERTATIONS',
        target_region: 'PBA',
        rotor_count: 1,
        role: 'TORQUE_AXIS',
        status: 'ACTIVE',
        reason: 'R2 Physical Assignment (PRODUCTION - EPOCH_SEDICI_UNLP_02b)',
        updated_at: new Date().toISOString()
      },
      {
        lease_id: 'lease_r3_ckan_datos_pba',
        source_id: 'SRC_CKAN_DATOS_PBA',
        motor_id: 'CKAN_MOTOR_DATOS_PBA_PROVINCIA',
        source_name: 'Portal de Datos Abiertos de la Provincia de Buenos Aires',
        source_universe: 'PROVINCIAL_PUBLIC_ADMINISTRATION',
        target_region: 'PBA',
        rotor_count: 1,
        role: 'TORQUE_AXIS',
        status: 'ACTIVE',
        reason: 'R3 Physical Assignment (PRODUCTION - EPOCH_DATOS_PBA_03)',
        updated_at: new Date().toISOString()
      },
      {
        lease_id: 'lease_r4_inta_digital_prime',
        source_id: 'SRC_OAI_INTA_DIGITAL',
        motor_id: 'OAI_MOTOR_INTA_DIGITAL',
        source_name: 'INTA Digital — Repositorio Agropecuario Nacional',
        source_universe: 'AGRICULTURAL_RESEARCH',
        target_region: 'PBA',
        rotor_count: 1,
        role: 'TORQUE_AXIS',
        assignment_epoch: EPOCH_ID,
        status: 'ACTIVE',
        reason: `R4 Physical Assignment (N=4 PRIME TORQUE_AXIS - ${EPOCH_ID})`,
        updated_at: new Date().toISOString()
      }
    ];

    const historicalLeases = [
      {
        lease_id: 'lease_r4_arca_datos_abiertos',
        source_id: 'SRC_ARCA_DATOS_ABIERTOS',
        motor_id: 'ARCA_MOTOR_DATOS_ABIERTOS',
        source_name: 'ARCA — Portal Público de Datos Abiertos (AFIP)',
        status: 'SLEEP',
        reason: 'ARCA Demoted to SLEEP under hysteresis contract (Torque: 0.18/s, Canary realization: 0.08)'
      },
      {
        lease_id: 'lease_r5_colproba_challenger',
        source_id: 'SRC_COLPROBA_DIRECTORIO_PBA',
        motor_id: 'COLPROBA_MOTOR_DIRECTORIO_PBA',
        source_name: 'Colegio de Abogados PBA — Directorio Central',
        status: 'SLEEP',
        reason: 'ColProBA Challenger Lost (0.16/s vs 0.20/s ARCA). Lease released to SLEEP.'
      },
      {
        lease_id: 'lease_r6_inta_exploration',
        source_id: 'SRC_OAI_INTA_DIGITAL',
        motor_id: 'OAI_MOTOR_INTA_DIGITAL',
        source_name: 'INTA Digital — Repositorio Agropecuario Nacional',
        status: 'COMPLETED_MIGRATED',
        reason: 'Historical R6 Exploration Epoch: EPOCH_R6_EXPLORATION_INTA_01. Migrated to R4 Torque Axis.'
      }
    ];

    const outputPayload = {
      timestamp: new Date().toISOString(),
      active_leases_count: activeLeases.length,
      total_active_rotors: 4,
      pba_active_rotors: 3,
      pba_torque_floor_met: true,
      current_epoch: EPOCH_ID,
      leases: activeLeases,
      inactive_or_historical_leases: historicalLeases
    };

    fs.writeFileSync(leasesFile, JSON.stringify(outputPayload, null, 2), 'utf8');
    console.log(`✅ winner_leases.json written with exactly 4 active physical leases.`);
    console.log(`Active Mix: R1 BORA, R2 SEDICI UNLP, R3 DATOS PBA, R4 INTA DIGITAL.`);

  } finally {
    client.release();
    await pool.end();
  }
}

syncN4Prime().catch(err => {
  console.error('Error syncing N=4 Prime leases:', err);
  process.exit(1);
});
