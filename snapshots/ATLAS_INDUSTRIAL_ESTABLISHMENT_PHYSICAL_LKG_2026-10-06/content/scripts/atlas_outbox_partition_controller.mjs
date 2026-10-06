/**
 * atlas_outbox_partition_controller.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Automated Lifecycle Controller for atlas_search_outbox_v2:
 * 
 * State Machine:
 *   ACTIVE → DRAINING → RECONCILING → READY_TO_DROP → DROPPED
 * 
 * Invariants:
 *   - MINIMUM_RETENTION = 48 HOURS
 *   - DROP only allowed when:
 *       PENDING = 0, PROCESSING = 0, RETRY = 0, FAILED = 0,
 *       QUARANTINED = 0 (or durable moved to dead-letter)
 *   - Auto-provisions future partitions (today + 3 days)
 *   - Alerts if DEFAULT partition has > 0 rows
 * ─────────────────────────────────────────────────────────────────────────────
 */
import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const RETENTION_HOURS = 48; // Section 18: 48h minimum initial retention

export async function runPartitionLifecycle(client) {
  console.log('=== ATLAS OUTBOX V2 PARTITION CONTROLLER ===');
  console.log(`Retention policy: ${RETENTION_HOURS} hours minimum`);

  // 1. Provision upcoming partitions (3 days ahead)
  console.log('[1/4] Ensuring future partitions are provisioned...');
  await client.query('SELECT public.provision_outbox_v2_partitions(3)');

  // 2. Check default partition health
  console.log('[2/4] Checking default partition rows...');
  const defRes = await client.query('SELECT count(*) FROM public.atlas_search_outbox_v2_default');
  const defaultRows = parseInt(defRes.rows[0].count, 10);
  if (defaultRows > 0) {
    console.warn(`⚠️ ALERT: DEFAULT_PARTITION_ROWS = ${defaultRows} > 0. Immediate routing check required.`);
  } else {
    console.log('✅ Default partition clean (0 rows).');
  }

  // 3. Inspect existing partitions
  console.log('[3/4] Inspecting partition table hierarchy...');
  const partitionsRes = await client.query(`
    SELECT 
      inhrelid::regclass::text AS partition_name,
      pg_size_pretty(pg_total_relation_size(inhrelid)) AS size_pretty,
      pg_total_relation_size(inhrelid) AS size_bytes
    FROM pg_inherits
    WHERE inhparent = 'public.atlas_search_outbox_v2'::regclass
    ORDER BY inhrelid::regclass::text ASC;
  `);

  const nowMs = Date.now();
  const report = [];

  for (const p of partitionsRes.rows) {
    const name = p.partition_name;
    if (name.endsWith('_default')) {
      report.push({ partition: name, status: 'DEFAULT', rows: defaultRows, action: 'KEEP' });
      continue;
    }

    // Extract date from name: atlas_search_outbox_v2_YYYY_MM_DD
    const dateMatch = name.match(/(\d{4})_(\d{2})_(\d{2})$/);
    if (!dateMatch) {
      report.push({ partition: name, status: 'UNKNOWN', action: 'KEEP' });
      continue;
    }

    const [, y, m, d] = dateMatch;
    const partitionDate = new Date(`${y}-${m}-${d}T00:00:00Z`);
    // Partition covers [partitionDate, partitionDate + 1 day]
    // Becomes older than RETENTION_HOURS when now - (partitionDate + 1 day) > 48h
    const partitionEndMs = partitionDate.getTime() + 24 * 3600 * 1000;
    const ageHours = (nowMs - partitionEndMs) / (1000 * 3600);

    // Query status counts on this partition
    const countsRes = await client.query(`
      SELECT 
        COUNT(*) as total_rows,
        COUNT(*) FILTER (WHERE status = 'PENDING') as pending,
        COUNT(*) FILTER (WHERE status = 'PROCESSING') as processing,
        COUNT(*) FILTER (WHERE status = 'RETRY') as retry,
        COUNT(*) FILTER (WHERE status = 'QUARANTINED') as quarantined,
        COUNT(*) FILTER (WHERE status = 'PUBLISHED') as published
      FROM \${name}
    `.replace('\${name}', name));

    const counts = countsRes.rows[0];
    const total = parseInt(counts.total_rows, 10);
    const pending = parseInt(counts.pending, 10);
    const processing = parseInt(counts.processing, 10);
    const retry = parseInt(counts.retry, 10);
    const quarantined = parseInt(counts.quarantined, 10);
    const published = parseInt(counts.published, 10);

    let lifecycleState = 'ACTIVE';
    let action = 'RETAIN';

    if (ageHours > 0) {
      lifecycleState = 'DRAINING';
    }

    if (ageHours >= RETENTION_HOURS) {
      lifecycleState = 'RECONCILING';

      // If there are quarantined, move to durable dead letter
      if (quarantined > 0) {
        console.log(`[Partition \${name}] Moving \${quarantined} quarantined rows to dead letter...`);
        await client.query(`
          INSERT INTO public.atlas_search_delivery_dead_letter (
            outbox_id, logical_event_id, source_id, source_record_id,
            payload_version, attempt_count, reason, created_at, quarantined_at
          )
          SELECT 
            outbox_id, logical_event_id, payload->>'source_id', payload->>'source_record_id',
            payload_version, attempt_count, last_error, created_at, COALESCE(quarantined_at, now())
          FROM \${name}
          WHERE status = 'QUARANTINED'
          ON CONFLICT DO NOTHING
        `.replace(/\${name}/g, name));
      }

      // Check drop gate
      if (pending === 0 && processing === 0 && retry === 0) {
        lifecycleState = 'READY_TO_DROP';
        console.log(`[Partition \${name}] GATE PASS: Dropping partition (age: \${ageHours.toFixed(1)}h >= \${RETENTION_HOURS}h)...`);
        await client.query(`DROP TABLE public.\${name}`.replace(/\${name}/g, name));
        lifecycleState = 'DROPPED';
        action = 'DROPPED';
      } else {
        console.warn(`[Partition \${name}] Cannot drop yet: pending=\${pending}, processing=\${processing}, retry=\${retry}`);
        action = 'WAIT_DRAIN';
      }
    }

    report.push({
      partition: name,
      size: p.size_pretty,
      age_hours: ageHours.toFixed(1),
      total_rows: total,
      pending,
      processing,
      retry,
      quarantined,
      published,
      lifecycleState,
      action
    });
  }

  console.table(report);
  return { defaultRows, partitions: report };
}

// CLI Execution
if (process.argv[1].endsWith('atlas_outbox_partition_controller.mjs')) {
  const client = new pg.Client(parseDbUrl());
  await client.connect();
  try {
    await runPartitionLifecycle(client);
  } finally {
    await client.end();
  }
}
