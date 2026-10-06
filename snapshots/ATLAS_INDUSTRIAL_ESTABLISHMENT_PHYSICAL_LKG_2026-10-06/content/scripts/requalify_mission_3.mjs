import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';

const pool = new pg.Pool({ ...parseDbUrl() });

async function requalifyMission3() {
  const client = await pool.connect();
  try {
    const res = await client.query(`
      SELECT primary_record_key, canonical_title, normalized_identity, evidence, source_id, source_url, source_family
      FROM public.atlas_autonomous_mission_records
      WHERE mission_id = 'MISSION_3_PRODUCTOS_MEDICOS_ANMAT';
    `);

    console.log(`Found ${res.rows.length} existing records for Mission 3.`);

    let validCount = 0;
    let invalidCount = 0;
    const updates = [];

    for (const row of res.rows) {
      const ev = row.evidence;

      // 1. ENTITY_EXISTENCE_PROOF_PRODUCT
      const hasProductProof = !!(
        ev.productoMedicoPM &&
        (ev.denominacion || ev.marca) &&
        row.primary_record_key.startsWith('PM_')
      );

      // 2. GEOGRAPHIC_SCOPE_PROOF_ARGENTINA
      const hasGeoProof = !!(
        (ev.jurisdiction && ev.jurisdiction.includes('Argentina')) ||
        (ev.titularFabricante && ev.titularFabricante.length > 0)
      );

      // 3. RELATION_PROOF_SUBJECT_ASSOCIATED_WITH_QUE_TENGAN_AUTORIZACION
      const hasAuthProof = !!(
        ev.sanitaryStatus &&
        ev.sanitaryStatus.includes('vigente') &&
        ev.expedienteAnmat &&
        ev.fechaAutorizacion
      );

      if (hasProductProof && hasGeoProof && hasAuthProof) {
        const mandatoryStatus = {
          ENTITY_EXISTENCE_PROOF_PRODUCT: 'PASS',
          GEOGRAPHIC_SCOPE_PROOF_ARGENTINA: 'PASS',
          RELATION_PROOF_SUBJECT_ASSOCIATED_WITH_QUE_TENGAN_AUTORIZACION: 'PASS'
        };

        updates.push({
          key: row.primary_record_key,
          unit: 'PRODUCT',
          mandatoryStatus
        });
        validCount++;
      } else {
        invalidCount++;
      }
    }

    console.log(`M3 Requalification Audit:`);
    console.log(`M3_REQUALIFIED = ${res.rows.length}`);
    console.log(`M3_VALID_QUALIFIED = ${validCount}`);
    console.log(`M3_INVALID_AFTER_REQUALIFICATION = ${invalidCount}`);

    // Execute atomic update in database
    await client.query('BEGIN;');
    for (const u of updates) {
      await client.query(`
        UPDATE public.atlas_autonomous_mission_records
        SET primary_unit = $1,
            mandatory_criteria_status = $2
        WHERE mission_id = 'MISSION_3_PRODUCTOS_MEDICOS_ANMAT'
          AND primary_record_key = $3;
      `, [u.unit, JSON.stringify(u.mandatoryStatus), u.key]);
    }
    await client.query('COMMIT;');

    console.log('Database update committed successfully.');
  } catch (err) {
    await client.query('ROLLBACK;');
    console.error('Error during requalification:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

requalifyMission3();
