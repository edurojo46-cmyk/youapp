import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';

dotenv.config();

async function check() {
  const client = new pg.Client(parseDbUrl());
  await client.connect();

  console.log('--- 1. PHOTO_URL IN SEARCH PROJECTION ---');
  try {
    const photoStats = await client.query(`
      SELECT 
        count(*) as total_rows,
        count(photo_url) as with_photo,
        count(DISTINCT photo_url) as distinct_photo,
        sum(length(photo_url)) as total_chars,
        sum(pg_column_size(photo_url)) as total_bytes
      FROM public.atlas_argentina_people_search_projection_v1;
    `);
    console.log('Search projection photo_url:', photoStats.rows[0]);
  } catch (e) {
    console.log('Error search projection photo stats:', e.message);
  }

  console.log('\n--- 2. PHOTO_URL IN DISCOVERY CANDIDATES ---');
  try {
    const discPhoto = await client.query(`
      SELECT 
        count(*) as with_photo,
        count(DISTINCT photo_url) as distinct_photo,
        sum(length(photo_url)) as total_chars,
        sum(pg_column_size(photo_url)) as total_bytes
      FROM public.atlas_people_discovery_candidates
      WHERE photo_url IS NOT NULL;
    `);
    console.log('Discovery candidates photo_url:', discPhoto.rows[0]);
  } catch (e) {
    console.log('Error discovery candidates photo:', e.message);
  }

  console.log('\n--- 3. OTHER PHOTO/IMAGE COLUMNS IN PUBLIC ---');
  const otherCols = [
    { table: 'atlas_person_social_profiles', col: 'profile_photo_url' },
    { table: 'catalog_import_items', col: 'thumbnail_url' },
    { table: 'signal_schedule_items', col: 'thumbnail_url' },
    { table: 'videos', col: 'thumbnail' },
    { table: 'youapp_index', col: 'thumbnail' },
    { table: 'youapp_index', col: 'thumbnail_url' }
  ];

  for (const item of otherCols) {
    try {
      const q = await client.query(`
        SELECT 
          count(*) as total_rows,
          count("${item.col}") as with_photo,
          count(DISTINCT "${item.col}") as distinct_urls,
          coalesce(sum(pg_column_size("${item.col}")), 0) as total_bytes
        FROM public."${item.table}";
      `);
      console.log(`Table ${item.table} (${item.col}):`, q.rows[0]);
    } catch (e) {
      console.log(`Could not check ${item.table}:`, e.message);
    }
  }

  console.log('\n--- 4. SUPABASE STORAGE (storage.buckets & storage.objects) ---');
  try {
    const storageRes = await client.query(`
      SELECT 
        b.name as bucket_name,
        count(o.id) as object_count,
        count(o.id) FILTER (WHERE o.metadata->>'mimetype' LIKE 'image%') as image_count,
        coalesce(sum((o.metadata->>'size')::bigint), 0) as total_bytes,
        coalesce(sum((o.metadata->>'size')::bigint) FILTER (WHERE o.metadata->>'mimetype' LIKE 'image%'), 0) as image_bytes
      FROM storage.buckets b
      LEFT JOIN storage.objects o ON o.bucket_id = b.id
      GROUP BY b.name;
    `);
    console.log('Supabase Storage:');
    console.table(storageRes.rows);
  } catch (e) {
    console.log('Error storage query:', e.message);
  }

  console.log('\n--- 5. CHECKING BYTEA / BINARY / BASE64 ANYWHERE IN PUBLIC SCHEMA ---');
  const byteaRes = await client.query(`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND data_type IN ('bytea', 'blob');
  `);
  console.log('Bytea columns in public schema:', byteaRes.rows);

  await client.end();
}

check().catch(console.error);
