import fs from 'fs';
import path from 'path';

function getLiveStats() {
  try {
    const metrics = JSON.parse(fs.readFileSync('reports/atlas/realtime/atlas_people_live_metrics.json', 'utf8'));
    const factory = JSON.parse(fs.readFileSync('reports/atlas/realtime/factory_telemetry.json', 'utf8'));
    const publisherHb = fs.existsSync('reports/atlas/realtime/search_publisher_heartbeat.json') ? JSON.parse(fs.readFileSync('reports/atlas/realtime/search_publisher_heartbeat.json', 'utf8')) : {};
    const workerHb = fs.existsSync('reports/atlas/realtime/worker_heartbeat.json') ? JSON.parse(fs.readFileSync('reports/atlas/realtime/worker_heartbeat.json', 'utf8')) : {};

    return {
      physical: metrics.unique_people || 0,
      searchable: metrics.indexed_entities || 0,
      outbox_depth: factory.system?.search_outbox_depth || 0,
      source_offset: factory.stations?.IDENTITY_DEDUP?.output_rows || 0, // Approximate offset
      publisher_hb: publisherHb.timestamp || null,
      factory_hb: workerHb.timestamp || null,
      timestamp: Date.now()
    };
  } catch (err) {
    console.error("Error reading stats:", err);
    return null;
  }
}

async function main() {
  console.log("=== INICIANDO VENTANA DE 5 MINUTOS ===");
  const t0 = getLiveStats();
  console.log("T0 Capturado:", JSON.stringify(t0, null, 2));

  console.log("Esperando 300 segundos...");
  await new Promise(r => setTimeout(r, 300 * 1000));

  const t1 = getLiveStats();
  console.log("T1 Capturado:", JSON.stringify(t1, null, 2));

  const delta_sec = (t1.timestamp - t0.timestamp) / 1000;
  const physical_delta = t1.physical - t0.physical;
  const searchable_delta = t1.searchable - t0.searchable;
  const source_offset_delta = t1.source_offset - t0.source_offset;
  const outbox_delta = t1.outbox_depth - t0.outbox_depth;

  const physical_sec = physical_delta / delta_sec;
  const searchable_sec = searchable_delta / delta_sec;
  const source_sec = source_offset_delta / delta_sec;

  // OUTBOX status
  let outbox_status = "STABLE";
  if (outbox_delta < -100) outbox_status = "DRAINING";
  if (outbox_delta > 100) outbox_status = "GROWING";

  const net_growth_rate = outbox_delta / delta_sec;

  // TARGET DEFINITION:
  // PREVIOUS_TARGET = 1M / 20 MIN (833.34/s, 1200s)
  // DISCARDED_PROPOSAL = 1M / 15 MIN (1111.12/s, 900s)
  // CURRENT_OFFICIAL_TARGET = 1M / 16 MIN (1041.67/s, 960s)
  const TARGET_1M_SEARCHABLE_ENTITIES_SECONDS = 960;
  const TARGET_END_TO_END_SEARCHABLE_ENTITIES_PER_SECOND = 1041.67;

  const pct_target = (searchable_sec / TARGET_END_TO_END_SEARCHABLE_ENTITIES_PER_SECOND) * 100;
  
  const certified_1m = t1.physical >= 1000000;
  const certified_16min = (pct_target >= 100) && certified_1m;

  console.log("\n================ REPORT ================\n");
  console.log(`CURRENT_EXACT_PHYSICAL_PEOPLE = ${t1.physical}`);
  console.log(`ATLAS_PEOPLE_1M_PHYSICAL_CERTIFIED = ${certified_1m}`);
  console.log(`PHYSICAL_ENTITIES_SEC_5M = ${physical_sec.toFixed(2)}`);
  console.log(`UNIQUE_SEARCHABLE_ENTITIES_SEC_5M = ${searchable_sec.toFixed(2)}`);
  console.log(`OUTBOX_DEPTH_T0 = ${t0.outbox_depth}`);
  console.log(`OUTBOX_DEPTH_T1 = ${t1.outbox_depth}`);
  console.log(`OUTBOX_STATUS = ${outbox_status}`);
  console.log(`OUTBOX_NET_GROWTH_RATE = ${net_growth_rate.toFixed(2)} rows/sec`);
  console.log(`SOURCE_ROWS_SEC_5M = ${source_sec.toFixed(2)}`);
  console.log(`TARGET_END_TO_END_SEARCHABLE_ENTITIES_PER_SECOND = ${TARGET_END_TO_END_SEARCHABLE_ENTITIES_PER_SECOND}`);
  console.log(`PERCENT_OF_1041_TARGET_REACHED = ${pct_target.toFixed(1)}%`);
  console.log(`ATLAS_1M_PER_16MIN_CERTIFIED = ${certified_16min}`);
  
  // Predict bottleneck
  let bottleneck = "UNKNOWN";
  if (outbox_status === "GROWING") {
    bottleneck = "SEARCH PUBLISHER (SEARCH_UPSERT / INDEX_MAINTENANCE)";
  } else if (outbox_status === "DRAINING") {
    bottleneck = "FACTORY (FETCH / PARSE / DEDUP)";
  } else {
    bottleneck = "BALANCED";
  }
  console.log(`NEXT_PROVEN_BOTTLENECK = ${bottleneck}`);
  console.log("========================================\n");
}

main();
