/**
 * ATLAS — EXECUTE SOCIAL PUBLIC DISCOVERY EXPANSION
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import { SocialPublicDiscoveryEngine } from '../src/lib/atlasSocialDiscovery/SocialPublicDiscoveryEngine.ts';

dotenv.config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function main() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 10 });
  const engine = new SocialPublicDiscoveryEngine(pool);

  // Execute full autonomous social public discovery run
  const metrics = await engine.executeDiscoveryRun();

  await pool.end();

  // Print strict required devolution format
  console.log(`SOCIAL_CANDIDATES_DISCOVERED = ${metrics.candidatesDiscovered.toLocaleString('es-AR')}`);
  console.log(`SOCIAL_ENTITIES_RESOLVED = ${metrics.entitiesResolved.toLocaleString('es-AR')}`);
  console.log(`EXTERNAL_WEBSITES_DISCOVERED = ${metrics.externalWebsitesDiscovered.toLocaleString('es-AR')}`);
  console.log(`TRUE_NET_NEW_FROM_SOCIAL_DISCOVERY_CHAIN = ${metrics.trueNetNewFromSocialChain.toLocaleString('es-AR')}`);
  console.log(`SOCIAL_DISCOVERY_YIELD = ${(metrics.socialDiscoveryYield * 100).toFixed(1)}%`);
  console.log(`NEW_SUPPORTED_SUPPLY = ${metrics.newSupportedSupply.toLocaleString('es-AR')}`);
  console.log(`AUTONOMOUS_REPLAN_COUNT = ${metrics.autonomousReplanCount}`);
  console.log(`REMAINING_TO_500K = ${metrics.remainingTo500k.toLocaleString('es-AR')}`);
  console.log(`SOCIAL_FAMILY_PROMOTED = ${metrics.socialFamilyPromoted ? 'TRUE' : 'FALSE'}`);
  console.log(`FINAL_STATUS = ${metrics.finalStatus}`);
}

main().catch(err => {
  console.error('Fatal Error:', err);
  process.exit(1);
});
