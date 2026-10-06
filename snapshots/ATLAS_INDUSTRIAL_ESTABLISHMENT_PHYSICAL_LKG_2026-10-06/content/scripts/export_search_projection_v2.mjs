import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pg;

function normalizeText(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseNameParts(displayName) {
  if (!displayName) return { first_name: '', last_name: '' };
  const clean = displayName.trim();
  if (clean.includes(',')) {
    const parts = clean.split(',').map(p => p.trim());
    return { last_name: parts[0] || '', first_name: parts.slice(1).join(' ') || '' };
  }
  const parts = clean.split(/\s+/);
  if (parts.length === 1) return { first_name: parts[0], last_name: '' };
  return { first_name: parts.slice(0, -1).join(' '), last_name: parts[parts.length - 1] };
}

export function parseDbUrl() {
  const raw = (process.env.DATABASE_URL || '').trim().replace(/^['"]|['"]$/g, '');
  if (!raw) throw new Error('DATABASE_URL_NOT_FOUND');

  const m = raw.match(/^postgresql:\/\/([^:]+):(.*)@([^:@/]+)(?::(\d+))?\/(.+)$/);
  if (!m) throw new Error('CANNOT_PARSE_DATABASE_URL');

  let pass = m[2];
  if (pass.startsWith('[') && pass.endsWith(']')) {
    pass = pass.slice(1, -1);
  }

  return {
    user: m[1],
    password: pass,
    host: m[3],
    port: m[4] ? parseInt(m[4], 10) : 6543,
    database: m[5],
    ssl: { rejectUnauthorized: false }
  };
}

export async function runProjectionExportV2() {
  const startedAt = new Date().toISOString();
  console.log('============================================================');
  console.log('ATLAS INDUSTRIAL SEARCH PROJECTION V2 (DIRECT POSTGRESQL)');
  console.log(`Started at: ${startedAt}`);
  console.log('============================================================\n');

  const clientConfig = parseDbUrl();
  const client = new Client(clientConfig);

  const outputDir = path.resolve('reports/atlas/search');
  fs.mkdirSync(outputDir, { recursive: true });
  const jsonlPath = path.join(outputDir, 'atlas_canonical_people_projection_v2.jsonl');
  const tempJsonlPath = path.join(outputDir, 'atlas_canonical_people_projection_v2.tmp.jsonl');
  const manifestPath = path.join(outputDir, 'atlas_canonical_people_projection_v2.manifest.json');

  let writeStream = null;
  let clientConnected = false;

  try {
    await client.connect();
    clientConnected = true;
    console.log('✅ Connected to PostgreSQL directly via client.');

    await client.query("SET statement_timeout = '600s';");
    await client.query("SET work_mem = '64MB';");

    // 1. Snapshot transaction
    console.log('>>> Establishing REPEATABLE READ READ ONLY transaction snapshot...');
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;');

    // 2. Count exact population in this snapshot
    console.log('>>> Counting exact physical population inside snapshot...');
    const countQuery = `
      SELECT 
        (SELECT count(DISTINCT atlas_person_id) FROM public.atlas_person_identity_map) AS canonical_unique_people,
        (SELECT count(DISTINCT atlas_person_id) FROM public.atlas_people_discovery_candidates WHERE atlas_person_id IS NOT NULL) AS searchable_distinct_people,
        (SELECT count(DISTINCT m.atlas_person_id) 
         FROM public.atlas_person_identity_map m 
         INNER JOIN public.atlas_people_discovery_candidates c ON m.atlas_person_id = c.atlas_person_id
         WHERE m.atlas_person_id IS NOT NULL) AS canonical_searchable_intersection;
    `;
    const countRes = await client.query(countQuery);
    const snapCanonicalUnique = parseInt(countRes.rows[0].canonical_unique_people, 10);
    const snapSearchableDistinct = parseInt(countRes.rows[0].searchable_distinct_people, 10);
    const snapIntersection = parseInt(countRes.rows[0].canonical_searchable_intersection, 10);

    console.log(`    CANONICAL_UNIQUE_PEOPLE:            ${snapCanonicalUnique.toLocaleString()}`);
    console.log(`    SEARCHABLE_DISTINCT_PEOPLE:         ${snapSearchableDistinct.toLocaleString()}`);
    console.log(`    CANONICAL_SEARCHABLE_INTERSECTION:  ${snapIntersection.toLocaleString()}`);

    // 3. Declare Server-side cursor for deterministic deduplicated projection
    console.log('\n>>> Declaring server-side deterministic deduplicated cursor...');
    const cursorName = 'cur_canonical_projection_v2';
    
    // Deterministic aggregation query grouped strictly by atlas_person_id
    const declareCursorSql = `
      DECLARE ${cursorName} NO SCROLL CURSOR FOR
      SELECT 
        c.atlas_person_id,
        (ARRAY_AGG(c.display_name ORDER BY length(c.display_name) DESC))[1] AS display_name,
        (ARRAY_AGG(c.profession ORDER BY length(COALESCE(c.profession, '')) DESC))[1] AS profession,
        (ARRAY_AGG(c.role ORDER BY length(COALESCE(c.role, '')) DESC))[1] AS role,
        (ARRAY_AGG(c.organization ORDER BY length(COALESCE(c.organization, '')) DESC))[1] AS organization,
        (ARRAY_AGG(COALESCE(c.neighborhood, c.geography_id, 'ARGENTINA')))[1] AS geography,
        (ARRAY_AGG(COALESCE(c.geography_id, 'BUENOS AIRES')))[1] AS province,
        (ARRAY_AGG(c.neighborhood))[1] AS neighborhood,
        array_remove(array_agg(DISTINCT c.source_id), NULL) AS source_ids,
        (ARRAY_AGG(c.search_text_normalized ORDER BY length(COALESCE(c.search_text_normalized, '')) DESC))[1] AS search_text_normalized,
        CASE WHEN bool_or(c.current_activity_state = 'ACTIVE') THEN 'ACTIVE' ELSE 'INACTIVE' END AS current_activity_state,
        bool_or(c.public_email IS NOT NULL OR c.public_phone IS NOT NULL OR c.social_profiles IS NOT NULL) AS has_contact_evidence,
        MAX(c.last_seen_at) AS last_seen_at,
        MIN(c.created_at) AS created_at
      FROM public.atlas_people_discovery_candidates c
      WHERE c.atlas_person_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.atlas_person_identity_map m 
          WHERE m.atlas_person_id = c.atlas_person_id
        )
      GROUP BY c.atlas_person_id
      ORDER BY c.atlas_person_id;
    `;

    await client.query(declareCursorSql);
    console.log('    Server-side cursor opened successfully.');

    // 4. Stream fetch in batches of 5000 rows
    writeStream = fs.createWriteStream(tempJsonlPath, { flags: 'w' });
    const seenIds = new Set();
    let exportedCount = 0;
    let duplicateIds = 0;
    let nullIds = 0;
    let emptyNames = 0;
    let emptySearchTexts = 0;

    const FETCH_CHUNK = 5000;
    let hasMore = true;
    const tFetchStart = performance.now();

    while (hasMore) {
      const fetchRes = await client.query(`FETCH ${FETCH_CHUNK} FROM ${cursorName};`);
      const rows = fetchRes.rows;

      if (!rows || rows.length === 0) {
        hasMore = false;
        break;
      }

      for (const r of rows) {
        const personId = r.atlas_person_id;
        if (!personId) {
          nullIds++;
          continue;
        }

        if (seenIds.has(personId)) {
          duplicateIds++;
          continue;
        }
        seenIds.add(personId);

        const displayName = (r.display_name || '').trim();
        if (!displayName) emptyNames++;

        const { first_name, last_name } = parseNameParts(displayName);
        const normName = normalizeText(displayName);
        const normRole = normalizeText(r.role);
        const normOrg = normalizeText(r.organization);
        const normProf = normalizeText(r.profession);

        const rawSearchText = r.search_text_normalized 
          ? r.search_text_normalized 
          : `${normName} ${normRole} ${normOrg} ${normProf}`.trim();
        
        const searchText = normalizeText(rawSearchText);
        if (!searchText) emptySearchTexts++;

        const lastSeenMs = r.last_seen_at ? new Date(r.last_seen_at).getTime() : Date.now();
        const createdMs = r.created_at ? new Date(r.created_at).getTime() : Date.now();
        const isActive = r.current_activity_state === 'ACTIVE';

        const doc = {
          atlas_person_id: personId,
          display_name: displayName,
          display_name_normalized: normName,
          first_name: first_name,
          last_name: last_name,
          role: (r.role || '').trim(),
          profession: (r.profession || '').trim(),
          organization: (r.organization || '').trim(),
          geography: (r.geography || 'ARGENTINA').trim(),
          province: (r.province || 'BUENOS AIRES').trim(),
          neighborhood: (r.neighborhood || '').trim(),
          source_ids: (r.source_ids && r.source_ids.length > 0) ? r.source_ids : ['MANUAL'],
          search_text_normalized: searchText,
          evidence_state: r.has_contact_evidence ? 'DIRECT_CONTACT_EVIDENCE' : 'IDENTITY_ONLY',
          ranking_weight: isActive ? 100 : 50,
          last_seen_at: lastSeenMs,
          created_at: createdMs
        };

        const canWrite = writeStream.write(JSON.stringify(doc) + '\n');
        if (!canWrite) {
          await new Promise(resolve => writeStream.once('drain', resolve));
        }

        exportedCount++;
      }

      if (exportedCount % 50000 === 0 || rows.length < FETCH_CHUNK) {
        const el = ((performance.now() - tFetchStart) / 1000).toFixed(1);
        const rate = (exportedCount / (performance.now() - tFetchStart) * 1000).toFixed(0);
        console.log(`  Streamed ${exportedCount.toLocaleString()} / ${snapIntersection.toLocaleString()} docs (${rate} docs/s, ${el}s elapsed)...`);
      }

      if (rows.length < FETCH_CHUNK) {
        hasMore = false;
      }
    }

    // Close cursor and commit/rollback read only transaction
    await client.query(`CLOSE ${cursorName};`);
    await client.query('COMMIT;');
    await client.end();
    clientConnected = false;

    writeStream.end();
    await new Promise(resolve => writeStream.on('finish', resolve));

    const finishedAt = new Date().toISOString();
    const durationSeconds = parseFloat(((performance.now() - tFetchStart) / 1000).toFixed(2));
    const docsPerSecond = parseFloat((exportedCount / durationSeconds).toFixed(2));

    // Rename temp file to permanent V2 file
    if (fs.existsSync(jsonlPath)) fs.unlinkSync(jsonlPath);
    fs.renameSync(tempJsonlPath, jsonlPath);

    // Compute checksum and exact physical metrics
    console.log('\n>>> Computing SHA-256 and validating physical file invariants...');
    const hash = crypto.createHash('sha256');
    const readStream = fs.createReadStream(jsonlPath);
    for await (const chunk of readStream) {
      hash.update(chunk);
    }
    const sha256 = hash.digest('hex');
    const fileSizeBytes = fs.statSync(jsonlPath).size;

    // Golden Set Coverage Validation
    const goldenSetPath = path.resolve('reports/atlas/search/atlas_gate_s_golden_set.json');
    let goldenTargetCoverage = '0/0';
    let goldenPass = false;

    if (fs.existsSync(goldenSetPath)) {
      const goldenCases = JSON.parse(fs.readFileSync(goldenSetPath, 'utf8'));
      const positiveTargets = goldenCases
        .filter(c => c.category !== 'NEGATIVE_VERIFICATION' && c.category !== 'NEGATIVE')
        .map(c => c.expected?.atlas_person_id || c.target_person_id)
        .filter(Boolean);

      let foundTargets = 0;
      for (const t of positiveTargets) {
        if (seenIds.has(t)) foundTargets++;
      }
      goldenTargetCoverage = `${foundTargets}/${positiveTargets.length}`;
      goldenPass = (foundTargets === positiveTargets.length);
      console.log(`    Golden Target Coverage: ${goldenTargetCoverage} (${goldenPass ? '100% PASS' : 'FAIL'})`);
    }

    const unaccounted = snapIntersection - exportedCount;
    const isComplete = (exportedCount === snapIntersection) && (duplicateIds === 0) && (nullIds === 0) && goldenPass;

    const manifest = {
      projection_version: 2,
      status: isComplete ? 'CERTIFIED_COMPLETE' : 'INCOMPLETE_OR_FAILED',
      physical_snapshot_at: startedAt,
      export_finished_at: finishedAt,
      source_canonical_unique_people: snapCanonicalUnique,
      source_searchable_distinct_people: snapSearchableDistinct,
      source_canonical_searchable_intersection: snapIntersection,
      exported_documents: exportedCount,
      distinct_atlas_person_id: seenIds.size,
      duplicates: duplicateIds,
      null_atlas_person_ids: nullIds,
      empty_display_names: emptyNames,
      empty_search_texts: emptySearchTexts,
      exclusions_by_reason: {
        missing_canonical_identity: 0,
        missing_searchable_candidate: snapCanonicalUnique - snapIntersection,
        null_or_empty_attributes: 0
      },
      unaccounted_people: unaccounted,
      golden_target_coverage: goldenTargetCoverage,
      file_size_bytes: fileSizeBytes,
      sha256: sha256,
      export_duration_seconds: durationSeconds,
      export_docs_per_second: docsPerSecond
    };

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    console.log('\n============================================================');
    console.log(`PROJECTION V2 EXPORT COMPLETE: ${manifest.status}`);
    console.log(`Total Exported: ${exportedCount.toLocaleString()} | Duration: ${durationSeconds}s | Speed: ${docsPerSecond} docs/s`);
    console.log(`SHA256: ${sha256} | Size: ${(fileSizeBytes / (1024*1024)).toFixed(2)} MB`);
    console.log(`Manifest saved to: ${manifestPath}`);
    console.log('============================================================');

    return manifest;
  } catch (err) {
    console.error('\n❌ FATAL EXPORT ERROR:', err.message);
    if (writeStream) {
      try { writeStream.end(); } catch (_) {}
    }
    if (fs.existsSync(tempJsonlPath)) {
      try { fs.unlinkSync(tempJsonlPath); } catch (_) {}
    }
    if (clientConnected) {
      try { await client.query('ROLLBACK;'); } catch (_) {}
      try { await client.end(); } catch (_) {}
    }
    // Do NOT write a success manifest on failure
    throw err;
  }
}

// Auto-run if executed directly
if (process.argv[1] && process.argv[1].endsWith('export_search_projection_v2.mjs')) {
  runProjectionExportV2().catch(() => process.exit(1));
}
