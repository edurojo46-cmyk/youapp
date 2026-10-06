/**
 * ATLAS AUTONOMOUS EXPANSION TO 1M READINESS V1 — RUNNER
 */

import { AutonomousExpansionEngine } from './lib/autonomousExpansionEngine.mjs';

async function main() {
  console.log('Initiating Atlas Autonomous Expansion to 1M Readiness V1...');

  const engine = new AutonomousExpansionEngine();
  const report = await engine.runAutonomousExpansion();

  console.log('\n════════════════════════════════════════════════════════════');
  console.log(' EXPANSION SUMMARY & 1M READINESS EVALUATION');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`EXPANSION_CAMPAIGN_ID = ${report.EXPANSION_CAMPAIGN_ID}`);
  console.log(`CALIBRATION_NUMERIC_AUDIT_PASS = ${report.CALIBRATION_NUMERIC_AUDIT_PASS}`);
  console.log(`PROBE_OVERPREDICTION_FACTOR = ${report.PROBE_OVERPREDICTION_FACTOR}`);
  console.log(`BULK_OVERPREDICTION_FACTOR = ${report.BULK_OVERPREDICTION_FACTOR}`);
  console.log(`SOURCE_MAP_NODES_BEFORE = ${report.SOURCE_MAP_NODES_BEFORE}`);
  console.log(`SOURCE_MAP_NODES_AFTER = ${report.SOURCE_MAP_NODES_AFTER}`);
  console.log(`VERIFIED_ENTITIES = ${report.VERIFIED_ENTITIES.toLocaleString()}`);
  console.log(`RESOLVED_OFFICIAL_DOMAINS = ${report.RESOLVED_OFFICIAL_DOMAINS.toLocaleString()}`);
  console.log(`REACHABLE_PUBLIC_ENDPOINTS = ${report.REACHABLE_PUBLIC_ENDPOINTS.toLocaleString()}`);
  console.log(`TARGET_BEARING_SOURCES = ${report.TARGET_BEARING_SOURCES.toLocaleString()}`);
  console.log(`SOURCE_FAMILIES_BEFORE = ${report.SOURCE_FAMILIES_BEFORE}`);
  console.log(`SOURCE_FAMILIES_AFTER = ${report.SOURCE_FAMILIES_AFTER}`);
  console.log(`EXPANSION_WAVES_COMPLETED = ${report.EXPANSION_WAVES_COMPLETED}`);
  console.log(`NEW_SOURCE_FAMILIES_DISCOVERED = ${report.NEW_SOURCE_FAMILIES_DISCOVERED}`);
  console.log(`NEW_PATH_PATTERNS_VALIDATED = ${report.NEW_PATH_PATTERNS_VALIDATED}`);
  console.log(`NEW_SOURCE_MULTIPLIERS_VALIDATED = ${report.NEW_SOURCE_MULTIPLIERS_VALIDATED}`);
  console.log(`CAPACITY_FROM_EXISTING_ATLAS_MAP = ${report.CAPACITY_FROM_EXISTING_ATLAS_MAP.toLocaleString()}`);
  console.log(`CAPACITY_FROM_AI_DISCOVERIES = ${report.CAPACITY_FROM_AI_DISCOVERIES.toLocaleString()}`);
  console.log(`CAPACITY_FROM_GRAPH_EXPANSION = ${report.CAPACITY_FROM_GRAPH_EXPANSION.toLocaleString()}`);
  console.log(`CAPACITY_FROM_ANALOGIES = ${report.CAPACITY_FROM_ANALOGIES.toLocaleString()}`);
  console.log(`CAPACITY_FROM_RADAR = ${report.CAPACITY_FROM_RADAR.toLocaleString()}`);
  console.log(`CAPACITY_FROM_MULTIPLIERS = ${report.CAPACITY_FROM_MULTIPLIERS.toLocaleString()}`);
  console.log(`MEASURED_CAPACITY = ${report.MEASURED_CAPACITY.toLocaleString()}`);
  console.log(`CALIBRATED_INFERRED_CAPACITY = ${report.CALIBRATED_INFERRED_CAPACITY.toLocaleString()}`);
  console.log(`SPECULATIVE_CAPACITY = ${report.SPECULATIVE_CAPACITY}`);
  console.log(`EXPECTED_NET_NEW_P10 = ${report.EXPECTED_NET_NEW_P10.toLocaleString()}`);
  console.log(`EXPECTED_NET_NEW_P50 = ${report.EXPECTED_NET_NEW_P50.toLocaleString()}`);
  console.log(`EXPECTED_NET_NEW_P90 = ${report.EXPECTED_NET_NEW_P90.toLocaleString()}`);
  console.log(`PROBABILITY_REACH_1M = ${(report.PROBABILITY_REACH_1M * 100).toFixed(2)}%`);
  console.log(`EXPECTED_DUPLICATE_RATE = ${(report.EXPECTED_DUPLICATE_RATE * 100).toFixed(1)}%`);
  console.log(`EXPECTED_OVERLAP_RATE = ${(report.EXPECTED_OVERLAP_RATE * 100).toFixed(1)}%`);
  console.log(`LARGEST_ECOSYSTEM_SHARE = ${report.LARGEST_ECOSYSTEM_SHARE}`);
  console.log(`CAMPAIGN_CONCENTRATION_RISK = ${report.CAMPAIGN_CONCENTRATION_RISK}`);
  console.log(`TARGET_CAPACITY_DEFICIT_P10 = ${report.TARGET_CAPACITY_DEFICIT_P10.toLocaleString()}`);
  console.log(`TARGET_CAPACITY_DEFICIT_P50 = ${report.TARGET_CAPACITY_DEFICIT_P50.toLocaleString()}`);
  console.log(`NEW_CALIBRATED_CAPACITY_PER_1000_ENDPOINTS = ${report.NEW_CALIBRATED_CAPACITY_PER_1000_ENDPOINTS.toLocaleString()}`);
  console.log(`SKEPTIC_FINDINGS = ${report.SKEPTIC_FINDINGS}`);
  console.log(`CRITICAL_SKEPTIC_FINDINGS = ${report.CRITICAL_SKEPTIC_FINDINGS}`);
  console.log(`GENERATED_EMAIL_CREDITS = ${report.GENERATED_EMAIL_CREDITS}`);
  console.log(`INFERRED_EMAIL_CREDITS = ${report.INFERRED_EMAIL_CREDITS}`);
  console.log(`PRIVATE_DATA_CREDITS = ${report.PRIVATE_DATA_CREDITS}`);
  console.log(`CAMPAIGN_READY_FOR_1M = ${report.CAMPAIGN_READY_FOR_1M}`);
  console.log(`FINAL_EXPANSION_STATUS = ${report.FINAL_EXPANSION_STATUS}`);
  console.log('════════════════════════════════════════════════════════════\n');

  if (report.CAMPAIGN_READY_FOR_1M) {
    console.log('STOP INVARIANT TRIGGERED: CAMPAIGN IS READY FOR 1M. DO NOT START 1M HARVEST.');
    console.log('RETURN THE READY CAMPAIGN FOR FINAL USER AUDIT.');
  }
}

main().catch(err => {
  console.error('Fatal expansion error:', err);
  process.exit(1);
});
