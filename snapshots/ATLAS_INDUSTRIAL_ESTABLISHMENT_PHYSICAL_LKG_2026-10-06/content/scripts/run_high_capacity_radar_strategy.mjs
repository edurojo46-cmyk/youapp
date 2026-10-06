/**
 * ATLAS — HIGH-CAPACITY UNIVERSE STRATEGY RUNNER
 * 
 * Executes UniversalRadarFabric with High-Capacity Entity Universe Strategy,
 * Dynamic Radar Scoring, Surface Collision Control, and Meta-Discovery.
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import { UniversalRadarFabric } from '../src/lib/atlasRadar/UniversalRadarFabric.ts';

dotenv.config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function main() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 15 });
  const fabric = new UniversalRadarFabric(pool, 32);

  // Execute full universal radar fabric cycle with high-capacity strategy
  const metrics = await fabric.executeFabricRun();

  await pool.end();

  // Print strict required devolution format
  console.log(`HIGH_CAPACITY_UNIVERSES_DISCOVERED = ${metrics.HIGH_CAPACITY_UNIVERSES_DISCOVERED}`);
  console.log(`TOTAL_ENTITIES_VISIBLE = ${metrics.TOTAL_ENTITIES_VISIBLE.toLocaleString('es-AR')}`);
  console.log(`ENTITY_UNIVERSES_PHYSICALLY_SAMPLED = ${metrics.ENTITY_UNIVERSES_PHYSICALLY_SAMPLED}`);
  console.log(``);
  console.log(`AVG_CONTACT_DENSITY = ${metrics.AVG_CONTACT_DENSITY}`);
  console.log(`AVG_GLOBAL_OVERLAP = ${metrics.AVG_GLOBAL_OVERLAP}`);
  console.log(`REALIZED_NET_NEW_PER_1K_ENTITIES = ${metrics.REALIZED_NET_NEW_PER_1K_ENTITIES}`);
  console.log(``);
  console.log(`META_SOURCES_DISCOVERED = ${metrics.META_SOURCES_DISCOVERED}`);
  console.log(`NEW_SOURCE_FAMILIES_FROM_META_DISCOVERY = ${metrics.NEW_SOURCE_FAMILIES_FROM_META_DISCOVERY}`);
  console.log(``);
  console.log(`SURFACE_ECOSYSTEMS_DOWNRANKED = ${metrics.SURFACE_ECOSYSTEMS_DOWNRANKED.toLocaleString('es-AR')}`);
  console.log(`HIGH_CAPACITY_UNIVERSES_PROMOTED = ${metrics.HIGH_CAPACITY_UNIVERSES_PROMOTED.toLocaleString('es-AR')}`);
  console.log(``);
  console.log(`TRUE_NET_NEW_THIS_MISSION = ${metrics.TRUE_NET_NEW_THIS_MISSION.toLocaleString('es-AR')}`);
  console.log(`PHYSICALLY_SUPPORTED_REMAINING_SUPPLY = ${metrics.PHYSICALLY_SUPPORTED_REMAINING_SUPPLY.toLocaleString('es-AR')}`);
  console.log(`SUPPLY_GAP = ${metrics.SUPPLY_GAP}`);
  console.log(``);
  console.log(`HIGH_CAPACITY_RADAR_ACTIVE = ${metrics.HIGH_CAPACITY_RADAR_ACTIVE ? 'TRUE' : 'FALSE'}`);
  console.log(`FINAL_STATUS = ${metrics.FINAL_STATUS}`);
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
