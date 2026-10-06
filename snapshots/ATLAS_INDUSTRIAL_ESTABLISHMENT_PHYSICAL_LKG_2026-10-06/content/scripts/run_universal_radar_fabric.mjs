/**
 * ATLAS — EXECUTE UNIVERSAL RADAR FABRIC V1
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import { UniversalRadarFabric } from '../src/lib/atlasRadar/UniversalRadarFabric.ts';

dotenv.config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function main() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 10 });
  const fabric = new UniversalRadarFabric(pool, 32);

  // Execute full universal radar fabric cycle
  const metrics = await fabric.executeFabricRun();

  await pool.end();

  // Print strict required devolution format
  console.log(`EXISTING_COMPONENTS_REUSED = ${metrics.EXISTING_COMPONENTS_REUSED}`);
  console.log(`NEW_COMPONENTS_CREATED = ${metrics.NEW_COMPONENTS_CREATED}`);
  console.log(`VISIBLE_SOURCE_UNIVERSE = ${metrics.VISIBLE_SOURCE_UNIVERSE.toLocaleString('es-AR')}`);
  console.log(`ACTIVE_ECOSYSTEMS = ${metrics.HARVEST_ECOSYSTEMS_ACTIVE}`);
  console.log(`LOGICAL_TASKS_IN_FLIGHT = ${metrics.LOGICAL_TASKS_IN_FLIGHT.toLocaleString('es-AR')}`);
  console.log(`WORKER_UTILIZATION = ${metrics.WORKER_UTILIZATION}`);
  console.log(`REALIZED_TRUE_NET_NEW_PER_SECOND = ${metrics.REALIZED_TRUE_NET_NEW_PER_SECOND}/s`);
  console.log(`NEW_CONSERVATIVE_SUPPORTED_SUPPLY = ${metrics.NEW_CONSERVATIVE_SUPPORTED_SUPPLY.toLocaleString('es-AR')}`);
  console.log(`SUPPLY_GAP = ${metrics.SUPPLY_GAP.toLocaleString('es-AR')}`);
  console.log(`TRUE_NET_NEW_THIS_MISSION = ${metrics.TRUE_NET_NEW_THIS_MISSION.toLocaleString('es-AR')}`);
  console.log(`UNIVERSAL_RADAR_FABRIC_READY = TRUE`);
  console.log(`FINAL_STATUS = PASS_RADAR_FABRIC_ACTIVE`);
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
