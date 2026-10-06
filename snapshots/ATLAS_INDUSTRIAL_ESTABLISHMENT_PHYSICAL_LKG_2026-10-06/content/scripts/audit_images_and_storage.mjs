import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

async function runAudit() {
  const client = new pg.Client(parseDbUrl());
  await client.connect();

  console.log('=== 1. DATABASE TOTAL, INDEX & TOAST BREAKDOWN ===');
  const dbTotRes = await client.query(`
    SELECT 
      pg_size_pretty(pg_database_size(current_database())) as total_db_size,
      pg_database_size(current_database()) as total_db_bytes;
  `);
  console.log('Total DB Size:', dbTotRes.rows[0]);

  const toastIndexRes = await client.query(`
    SELECT
      pg_size_pretty(sum(pg_relation_size(c.oid))) as total_table_size,
      sum(pg_relation_size(c.oid)) as total_table_bytes,
      pg_size_pretty(sum(pg_relation_size(c.reltoastrelid))) as total_toast_size,
      sum(pg_relation_size(c.reltoastrelid)) as total_toast_bytes,
      pg_size_pretty(sum(pg_indexes_size(c.oid))) as total_index_size,
      sum(pg_indexes_size(c.oid)) as total_index_bytes
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r' AND n.nspname = 'public';
  `);
  console.log('Public Schema Breakdown:', toastIndexRes.rows[0]);

  console.log('\n=== 2. TOAST & RELATION SIZES FOR TOP 5 TABLES ===');
  const topToastRes = await client.query(`
    SELECT
      c.relname as table_name,
      pg_size_pretty(pg_total_relation_size(c.oid)) as total_size,
      pg_size_pretty(pg_relation_size(c.oid)) as heap_size,
      pg_size_pretty(coalesce(pg_relation_size(c.reltoastrelid), 0)) as toast_size,
      coalesce(pg_relation_size(c.reltoastrelid), 0) as toast_bytes,
      pg_size_pretty(pg_indexes_size(c.oid)) as index_size
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r' AND n.nspname = 'public'
    ORDER BY pg_total_relation_size(c.oid) DESC
    LIMIT 10;
  `);
  console.table(topToastRes.rows);

  console.log('\n=== 3. PUBLIC SCHEMA IMAGE / PHOTO COLUMNS AUDIT ===');
  const publicColRes = await client.query(`
    SELECT 
      table_name,
      column_name,
      data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (
        column_name ~* '(photo|image|avatar|picture|thumbnail|logo|portrait)'
        OR data_type IN ('bytea', 'blob')
      )
    ORDER BY table_name, column_name;
  `);
  console.log('Columns matching photo/image in public schema:', publicColRes.rows);

  const columnDetails = [];
  for (const c of publicColRes.rows) {
    try {
      const q = await client.query(`
        SELECT 
          count(*) as total_rows,
          count("${c.column_name}") as non_null_count,
          count(DISTINCT "${c.column_name}") as distinct_count,
          count(*) FILTER (WHERE "${c.column_name}"::text ~* '^https?://') as http_url_count,
          count(*) FILTER (WHERE "${c.column_name}"::text ~* '^data:image') as data_uri_count,
          coalesce(sum(pg_column_size("${c.column_name}")), 0) as column_bytes
        FROM public."${c.table_name}";
      `);
      const row = q.rows[0];
      const colBytes = Number(row.column_bytes);
      let classification = 'TEXT_OTHER';
      if (c.data_type === 'bytea') classification = 'BYTEA_BINARY';
      else if (Number(row.data_uri_count) > 0) classification = 'INLINE_BASE64';
      else if (Number(row.http_url_count) === Number(row.non_null_count) && Number(row.non_null_count) > 0) classification = 'EXTERNAL_URL';

      columnDetails.push({
        table: c.table_name,
        column: c.column_name,
        type: c.data_type,
        total_rows: Number(row.total_rows),
        non_null: Number(row.non_null_count),
        distinct: Number(row.distinct_count),
        classification,
        size_pretty: colBytes > 1048576 ? `${(colBytes / 1048576).toFixed(2)} MB` : `${(colBytes / 1024).toFixed(1)} KB`,
        bytes: colBytes
      });
    } catch (e) {
      columnDetails.push({ table: c.table_name, column: c.column_name, error: e.message });
    }
  }
  console.table(columnDetails);

  console.log('\n=== 4. CHECKING BASE64 IN ATLAS PERSON PAYLOADS ===');
  // Sample 2000 random discovery candidate payloads and outbox payloads
  const outboxPayloadRes = await client.query(`
    SELECT 
      count(*) as sample_count,
      count(*) FILTER (WHERE payload::text ~* 'data:image') as data_image_count,
      count(*) FILTER (WHERE payload::text ~* 'base64') as base64_count,
      count(*) FILTER (WHERE payload::text ~* 'photo_url') as photo_url_key_count
    FROM (
      SELECT payload FROM public.atlas_search_outbox LIMIT 2000
    ) sub;
  `);
  console.log('Outbox payload sample (2000 rows):', outboxPayloadRes.rows[0]);

  const discPayloadRes = await client.query(`
    SELECT 
      count(*) as sample_count,
      count(*) FILTER (WHERE source_metadata::text ~* 'data:image') as data_image_count,
      count(*) FILTER (WHERE source_metadata::text ~* 'base64') as base64_count,
      count(*) FILTER (WHERE photo_url IS NOT NULL) as photo_url_count
    FROM (
      SELECT source_metadata, photo_url FROM public.atlas_people_discovery_candidates LIMIT 2000
    ) sub;
  `);
  console.log('Discovery candidates sample (2000 rows):', discPayloadRes.rows[0]);

  console.log('\n=== 5. SUPABASE STORAGE (storage.buckets & storage.objects) ===');
  try {
    const bucketsRes = await client.query(`
      SELECT id, name, public, created_at FROM storage.buckets;
    `);
    console.log('Storage Buckets:', bucketsRes.rows);

    const objectsRes = await client.query(`
      SELECT 
        bucket_id,
        count(*) as object_count,
        count(*) FILTER (WHERE metadata->>'mimetype' ~* '^image/') as image_count,
        coalesce(sum((metadata->>'size')::bigint), 0) as total_bytes,
        coalesce(sum((metadata->>'size')::bigint) FILTER (WHERE metadata->>'mimetype' ~* '^image/'), 0) as image_bytes
      FROM storage.objects
      GROUP BY bucket_id;
    `);
    console.log('Storage Objects by Bucket:', objectsRes.rows);
  } catch (e) {
    console.log('Storage query error:', e.message);
  }

  console.log('\n=== 6. ATLAS PEOPLE SPECIFIC PHOTO METRICS ===');
  try {
    const pStats = await client.query(`
      SELECT 
        count(*) as total_people,
        count(photo_url) as people_with_photo,
        count(DISTINCT photo_url) as unique_photo_urls,
        coalesce(sum(length(photo_url)), 0) as total_url_chars,
        coalesce(sum(pg_column_size(photo_url)), 0) as total_url_bytes
      FROM public.atlas_argentina_people_search_projection_v1;
    `);
    console.log('atlas_argentina_people_search_projection_v1 photo stats:', pStats.rows[0]);
  } catch (e) {
    console.log('Error querying search projection photo stats:', e.message);
  }

  await client.end();
}

runAudit().catch(console.error);
