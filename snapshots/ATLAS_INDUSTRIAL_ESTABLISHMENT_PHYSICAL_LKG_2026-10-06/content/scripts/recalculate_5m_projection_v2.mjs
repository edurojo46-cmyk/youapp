import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

const client = new pg.Client(parseDbUrl());
await client.connect();

// 1. Current physical metrics
const dbRes = await client.query('SELECT pg_database_size(current_database()) AS db_bytes');
const currentDbBytes = parseInt(dbRes.rows[0].db_bytes, 10);
const currentDbGb = currentDbBytes / (1024 * 1024 * 1024);

// 2. SSOT People count from live metrics
const mRes = await client.query("SELECT unique_people FROM public.atlas_people_live_metrics WHERE id = 'current'");
const currentPeople = parseInt(mRes.rows[0].unique_people, 10);

// 3. Outbox V2 size (bounded 48h buffer)
const v2SizeRes = await client.query(`
  SELECT COALESCE(SUM(pg_total_relation_size(inhrelid)), 0) AS v2_bytes
  FROM pg_inherits
  WHERE inhparent = 'public.atlas_search_outbox_v2'::regclass
`);
const v2Bytes = parseInt(v2SizeRes.rows[0].v2_bytes, 10);
const v2Gb = v2Bytes / (1024 * 1024 * 1024);

// Base tables without outbox
const coreBytes = currentDbBytes - v2Bytes;
const bytesPerNetNew = Math.round(coreBytes / currentPeople);

const targetPeople = 5000000;
const additionalPeople = targetPeople - currentPeople;

// Outbox V2 stays bounded at ~0.6 GB under 48h retention
const outboxV2BoundedGb = 0.60;
const projectedCoreGb = (coreBytes + (additionalPeople * bytesPerNetNew)) / (1024 * 1024 * 1024);
const projectedTotalAt5mGb = projectedCoreGb + outboxV2BoundedGb;

const provisionedGb = 25.0;
const operationalMarginRequired = 0.15; // 15% minimum margin
const maxSafeStorageGb = provisionedGb * (1 - operationalMarginRequired); // 21.25 GB

const is25GbSufficient = projectedTotalAt5mGb <= provisionedGb;
const isHeadroomPass = projectedTotalAt5mGb <= maxSafeStorageGb;

const result = {
  CURRENT_DB_GB: currentDbGb.toFixed(2),
  CURRENT_PEOPLE_SSOT: currentPeople,
  PHYSICAL_BYTES_PER_NET_NEW: bytesPerNetNew,
  OUTBOX_V2_BOUNDED_GB: outboxV2BoundedGb.toFixed(2),
  PROJECTED_DISK_AT_5M_V2: projectedTotalAt5mGb.toFixed(2) + ' GB',
  PROVISIONED_DISK_GB: provisionedGb.toFixed(2) + ' GB',
  MAX_SAFE_WITH_15PCT_MARGIN: maxSafeStorageGb.toFixed(2) + ' GB',
  '25GB_SUFFICIENT_TO_5M': is25GbSufficient ? 'TRUE' : 'FALSE',
  STORAGE_HEADROOM_STATUS: isHeadroomPass ? 'PASS' : (is25GbSufficient ? 'WATCH' : 'FAIL')
};

console.table(result);

await client.end();
