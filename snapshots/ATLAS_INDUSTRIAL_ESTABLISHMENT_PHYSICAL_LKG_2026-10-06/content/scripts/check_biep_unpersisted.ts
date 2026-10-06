import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import readline from 'readline';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const HMAC_SECRET = process.env.SUPABASE_SECRET_KEY || 'atlas_people_argentina_hmac_secret_2026';

async function main() {
  console.log('Fetching existing BIEP records from identity map...');
  // Only query BIEP_APN source_person_id to be fast
  const existingBiepHashes = new Set<string>();
  let offset = 0;
  const BATCH = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('atlas_person_identity_map')
      .select('source_person_id')
      .eq('source_id', 'BIEP_APN')
      .range(offset, offset + BATCH - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const r of data) existingBiepHashes.add(r.source_person_id);
    offset += data.length;
    if (data.length < BATCH) break;
  }
  console.log(`Loaded ${existingBiepHashes.size} existing BIEP record hashes from DB.`);

  const csvPath = path.resolve('scratch/biep_preflight/datos.csv');
  const fileStream = fs.createReadStream(csvPath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let totalLines = 0;
  const rawPersonsByDni = new Map<string, any[]>();

  for await (const line of rl) {
    if (!line.trim()) continue;
    totalLines++;
    if (totalLines === 1) continue; // header

    const parts = line.split(';');
    if (parts.length < 8) continue;
    const doc = parts[0].trim();
    const name = parts[1].trim();
    const escalafon = parts[2].trim();
    const contract_type = parts[3].trim();
    const organization = parts[4].trim();
    const administration_type = parts[5].trim();
    const phone = parts[6].trim();
    const period = parts[7].trim();

    if (!doc || !name) continue;

    const hmac = crypto.createHmac('sha256', HMAC_SECRET);
    hmac.update(`ARG:${doc}`);
    const hash = hmac.digest('hex');

    if (!rawPersonsByDni.has(hash)) {
      rawPersonsByDni.set(hash, []);
    }
    rawPersonsByDni.get(hash)!.push({ doc, name, escalafon, contract_type, organization, administration_type, phone, period, hash });
  }

  console.log(`Total CSV lines: ${totalLines}`);
  console.log(`Total unique persons in CSV: ${rawPersonsByDni.size}`);

  let alreadyPersistedPersons = 0;
  let unpersistedPersonsCount = 0;

  for (const [hash, rows] of rawPersonsByDni.entries()) {
    const sampleRecordHash = crypto.createHash('sha256')
      .update(`${hash}:${rows[0].organization}:${rows[0].escalafon}:${rows[0].period}`)
      .digest('hex');

    if (existingBiepHashes.has(sampleRecordHash)) {
      alreadyPersistedPersons++;
    } else {
      unpersistedPersonsCount++;
    }
  }

  console.log(`Already persisted unique persons: ${alreadyPersistedPersons}`);
  console.log(`Unpersisted unique persons available: ${unpersistedPersonsCount}`);
}

main().catch(console.error);
