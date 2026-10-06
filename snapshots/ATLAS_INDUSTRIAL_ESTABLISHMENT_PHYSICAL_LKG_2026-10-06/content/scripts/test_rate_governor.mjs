/**
 * scripts/test_rate_governor.mjs
 * 
 * Unit tests for atlas_rate_governor.mjs
 */

import path from 'path';
import { HostRateController, SourceRunwayController, SustainedRateGovernor } from './atlas_rate_governor.mjs';

async function testAll() {
  console.log('Testing Atlas Rate Governor & Runway Controller...');

  // 1. HostRateController Test
  const hostCtrl = new HostRateController();
  const testHost = 'ri.conicet.gov.ar';

  const slot1 = await hostCtrl.acquireSlot(testHost);
  if (!slot1) throw new Error('First slot should be acquired');

  // Trigger 429
  hostCtrl.recordResponse(testHost, 429);
  if (hostCtrl.isHostAvailable(testHost)) throw new Error('Host should be backed off after 429');

  const slot2 = await hostCtrl.acquireSlot(testHost);
  if (slot2 !== false) throw new Error('Slot should be denied while backed off');

  console.log('✓ HostRateController 429 backoff verified.');

  // 2. SourceRunwayController Test
  const partitionPath = path.resolve('reports/atlas/certification/atlas_fuel_partition_and_runway_v5.json');
  const runway = new SourceRunwayController(partitionPath);

  // Check holdout protection
  if (!runway.isHoldoutProtected('HOLDOUT_SRC_INAES_COOP_MUTUAL')) {
    throw new Error('Holdout source INAES should be protected');
  }

  let errorThrown = false;
  try {
    runway.assertNotHoldout('HOLDOUT_SRC_INAES_COOP_MUTUAL');
  } catch (e) {
    errorThrown = true;
  }
  if (!errorThrown) throw new Error('Should throw on holdout access attempt');

  // Check engineering sources initialized
  const engSources = runway.getAllSources();
  if (engSources.length !== 7) throw new Error(`Expected 7 engineering sources, got ${engSources.length}`);

  // Test promotion of EARLY phase
  const earlyPromoted = runway.promotePhase('EARLY');
  if (earlyPromoted.length === 0) throw new Error('Expected EARLY phase sources to be promoted');
  console.log(`✓ SourceRunwayController promoted ${earlyPromoted.length} EARLY sources.`);

  // Test metrics update and demotion
  const igj = earlyPromoted.find(s => s.source_id.includes('IGJ'));
  if (igj) {
    // Simulate consuming 99,800 records out of 100,000
    runway.updateMetrics(igj.source_id, 99800, 100, 300);
    runway.evaluateLifecycle(100, 300);
    if (igj.lifecycleStatus !== 'PARKED_EXHAUSTED') {
      throw new Error(`Expected IGJ to be PARKED_EXHAUSTED after near-full consumption, got ${igj.lifecycleStatus}`);
    }
    console.log('✓ SourceRunwayController demotion pipeline verified.');
  }

  // 3. SustainedRateGovernor Test
  const gov = new SustainedRateGovernor(900, 850, 1050);

  // Test over-speed throttling
  gov.lastWindowCommitted = 0;
  gov.lastWindowTime = Date.now() - 1000;
  const tickHigh = gov.recordTick(1200, 10);
  if (tickHigh.currentRate <= 1050 || tickHigh.globalThrottleDelayMs === 0) {
    throw new Error(`Expected high throttle for rate 1200, got rate ${tickHigh.currentRate}, delay ${tickHigh.globalThrottleDelayMs}`);
  }
  console.log(`✓ SustainedRateGovernor throttled high rate: ${tickHigh.currentRate}/s -> delay ${tickHigh.globalThrottleDelayMs}ms.`);

  // Test in-band rate
  gov.lastWindowCommitted = 1200;
  gov.lastWindowTime = Date.now() - 1000;
  const tickBand = gov.recordTick(1200 + 950, 11);
  if (!tickBand.inBand) {
    throw new Error(`Expected 950/s to be in band [850, 1050], got rate ${tickBand.currentRate}`);
  }
  console.log(`✓ SustainedRateGovernor maintained band for 950/s.`);

  console.log('\nALL RATE GOVERNOR TESTS PASSED!');
}

testAll().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
