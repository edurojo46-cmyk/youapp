/**
 * scripts/test_source_brain.mjs
 * 
 * Verifies ATLAS_SOURCE_BRAIN execution, supply intervals, universe size consistency,
 * frontier states, and explainability.
 */

import { AtlasSourceBrain } from '../src/lib/atlas/discovery/SourceBrain.mjs';

async function testBrain() {
  const brain = new AtlasSourceBrain();
  try {
    console.log('=== Running Atlas Source Brain Intelligence Evaluation ===');
    const state = await brain.evaluateBrainState();

    console.log(`Timestamp: ${state.timestamp}`);
    console.log(`Known Sources: ${state.known_sources} | Known Universes: ${state.known_universes}`);
    
    console.log('\n--- Universe Size Consistency (Section 2) ---');
    console.log('Exclusive Buckets:', JSON.stringify(state.size_metrics.size_buckets_exclusive));
    console.log('Cumulative Thresholds:', JSON.stringify(state.size_metrics.size_thresholds_cumulative));
    console.log(`Consistency Verdict: ${state.size_metrics.universe_size_metrics_consistent}`);

    console.log('\n--- Supply Funnel & Intervals (Section 1 & 30) ---');
    console.log(`Estimated Raw Entities: ${state.supply_funnel.estimated_raw_entities.toLocaleString()}`);
    console.log(`Estimated People: ${state.supply_funnel.estimated_people.toLocaleString()}`);
    console.log(`Estimated CABA+PBA People: ${state.supply_funnel.estimated_caba_pba_people.toLocaleString()}`);
    console.log(`True Net New (LOW): ${state.supply_funnel.estimated_true_net_new_low.toLocaleString()}`);
    console.log(`True Net New (BASE): ${state.supply_funnel.estimated_true_net_new_base.toLocaleString()}`);
    console.log(`True Net New (HIGH): ${state.supply_funnel.estimated_true_net_new_high.toLocaleString()}`);
    console.log(`Supply Gate 100K: ${state.supply_funnel.supply_gate_100k}`);
    console.log(`Supply Gate 250K: ${state.supply_funnel.supply_gate_250k}`);
    console.log(`Supply Gate 500K: ${state.supply_funnel.supply_gate_500k}`);
    console.log(`Supply Gate 1M: ${state.supply_funnel.supply_gate_1m}`);

    console.log('\n--- Frontier Counts & Congestion (Section 15 & 16) ---');
    console.log('Frontier States:', JSON.stringify(state.frontier_counts));
    console.log(`Field Congestion: ${state.field_congestion}`);
    console.log(`Available Torque: ${state.available_torque_estimate.toLocaleString()}`);

    console.log('\n--- Top 5 Next Best Universes (Section 25 & 36) ---');
    for (const [idx, s] of state.next_best_sources.slice(0, 5).entries()) {
      console.log(`[#${idx + 1}] ${s.source_name} (Bandit Score: ${s.bandit_score})`);
      console.log(`     Predicted Net-New: ${s.predictions.predicted_total_net_new.toLocaleString()} | Yield: ${(s.predictions.predicted_net_new_yield * 100).toFixed(1)}% | Overlap: ${(s.predictions.predicted_ssot_overlap * 100).toFixed(1)}%`);
      console.log(`     Why Selected: ${s.why_selected}`);
    }

    console.log('\n--- Active Learning & Hit Rate (Section 11 & 12) ---');
    console.log(`High Novelty Hit Rate: ${state.high_novelty_hit_rate}`);
    console.log(`Mean Prediction Error: ${state.prediction_error}`);

    console.log('\n✓ Source Brain test executed successfully.');
  } finally {
    await brain.close();
  }
}

testBrain().catch(console.error);
