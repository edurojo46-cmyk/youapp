import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = createClient(url, key, { auth: { persistSession: false } });

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

async function exportProjection() {
  const startedAt = new Date().toISOString();
  console.log('============================================================');
  console.log('EXPORTING COMPLETE ATLAS PEOPLE SEARCH PROJECTION V1');
  console.log(`Started at: ${startedAt}`);
  console.log('============================================================\n');

  const outputDir = path.resolve('reports/atlas/search');
  fs.mkdirSync(outputDir, { recursive: true });
  const jsonlPath = path.join(outputDir, 'atlas_canonical_people_projection_v1.jsonl');
  const writeStream = fs.createWriteStream(jsonlPath, { flags: 'w' });

  const seenPersonIds = new Set();
  let totalProcessedRows = 0;
  let exportedCount = 0;
  let duplicatesSkipped = 0;

  const PAGE_SIZE = 1000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await sb
      .from('atlas_people_discovery_candidates')
      .select('discovery_id, atlas_person_id, display_name, profession, role, organization, neighborhood, geography_id, location_relation_type, source_id, current_activity_state, location_evidence, search_text_normalized, public_email, public_phone, social_profiles, last_seen_at, created_at')
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      console.error('Error querying candidates:', error);
      break;
    }

    if (!data || data.length === 0) {
      hasMore = false;
      break;
    }

    for (const r of data) {
      totalProcessedRows++;
      const personId = r.atlas_person_id || r.discovery_id;

      if (seenPersonIds.has(personId)) {
        duplicatesSkipped++;
        continue;
      }
      seenPersonIds.add(personId);

      const { first_name, last_name } = parseNameParts(r.display_name);
      const hasContact = !!(r.public_email || r.public_phone || r.social_profiles);

      const doc = {
        id: personId,
        atlas_person_id: personId,
        discovery_id: r.discovery_id,
        display_name: r.display_name || '',
        display_name_normalized: normalizeText(r.display_name),
        first_name: first_name,
        last_name: last_name,
        role: r.role || '',
        profession: r.profession || '',
        organization: r.organization || '',
        geography: r.neighborhood || r.geography_id || 'ARGENTINA',
        province: r.geography_id || 'BUENOS AIRES',
        neighborhood: r.neighborhood || '',
        source_ids: r.source_id ? [r.source_id] : ['MANUAL'],
        search_text_normalized: r.search_text_normalized || normalizeText(`${r.display_name} ${r.role} ${r.organization} ${r.profession}`),
        current_activity_state: r.current_activity_state || 'ACTIVE',
        has_contact_evidence: hasContact,
        ranking_weight: r.current_activity_state === 'ACTIVE' ? 100 : 50,
        last_seen_at: r.last_seen_at ? new Date(r.last_seen_at).getTime() : Date.now(),
        created_at: r.created_at ? new Date(r.created_at).getTime() : Date.now()
      };

      writeStream.write(JSON.stringify(doc) + '\n');
      exportedCount++;
    }

    offset += data.length;

    if (exportedCount % 50000 === 0 || data.length < PAGE_SIZE) {
      console.log(`Exported ${exportedCount} distinct canonical people (processed ${totalProcessedRows} rows, skipped ${duplicatesSkipped} duplicates)...`);
    }

    if (data.length < PAGE_SIZE) {
      hasMore = false;
    }
  }

  writeStream.end();
  await new Promise(resolve => writeStream.on('finish', resolve));

  const finishedAt = new Date().toISOString();
  const fileBuffer = fs.readFileSync(jsonlPath);
  const sha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');

  const manifest = {
    schema_version: 'AtlasPeopleSearchDocumentV1',
    source_table: 'atlas_people_discovery_candidates',
    export_started_at: startedAt,
    export_finished_at: finishedAt,
    source_total_processed_rows: totalProcessedRows,
    exported_documents: exportedCount,
    distinct_atlas_person_id: seenPersonIds.size,
    duplicate_atlas_person_id: duplicatesSkipped,
    sha256: sha256,
    file_size_bytes: fileBuffer.length
  };

  const manifestPath = path.join(outputDir, 'atlas_canonical_people_projection_v1.manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log('\n============================================================');
  console.log('PROJECTION EXPORT COMPLETE');
  console.log(JSON.stringify(manifest, null, 2));
  console.log('============================================================');
}

exportProjection().catch(console.error);
