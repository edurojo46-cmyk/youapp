import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';
import https from 'https';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL as string,
  (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY) as string
);

const agent = new https.Agent({ rejectUnauthorized: false });
const MAILTO = 'contact@youapp.com';

async function testWikidataTemporalResolution() {
  console.log('=== FASE C: WIKIDATA TEMPORAL RESOLUTION PREFLIGHT ===\n');

  // Fetch 25 living Wikidata candidates with current_activity_state = 'STALE'
  const { data: sample, error } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('discovery_id, display_name, source_record_id, profession, occupation, organization')
    .eq('source_id', 'WIKIDATA_CABA_PERSONS')
    .eq('current_activity_state', 'STALE')
    .limit(25);

  if (error || !sample) {
    throw new Error('Error loading sample from DB');
  }

  console.log(`Loaded sample of ${sample.length} living Wikidata candidates (STALE_UNKNOWN)...\n`);

  let promotedToCurrent = 0;
  let promotedToRecent = 0;
  let remainedStale = 0;
  const auditEntries = [];

  for (const person of sample) {
    const name = person.display_name;
    const url = `https://api.openalex.org/authors?search=${encodeURIComponent(name)}&mailto=${MAILTO}`;

    try {
      const res = await fetch(url, { agent, headers: { 'User-Agent': 'AtlasHarvester/1.0' } } as any);
      if (!res.ok) {
        remainedStale++;
        continue;
      }
      const json = await res.json();
      const match = json.results?.[0];

      // Verification of identity: exact or highly confident match
      let isVerifiedMatch = false;
      if (match && match.display_name) {
        const normDb = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
        const normOa = match.display_name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
        if (normDb === normOa || normOa.includes(normDb) || normDb.includes(normOa)) {
          isVerifiedMatch = true;
        }
      }

      if (isVerifiedMatch) {
        const countsByYear = match.counts_by_year || [];
        const has2025_2026 = countsByYear.some((y: any) => (y.year === 2025 || y.year === 2026) && y.works_count > 0);
        const has2023_2024 = countsByYear.some((y: any) => (y.year === 2023 || y.year === 2024) && y.works_count > 0);

        const inst = match.last_known_institutions?.[0]?.display_name || '';
        const isCabaInst = /buenos aires|caba|argentina|uba|conicet|hospital|universidad/i.test(inst);

        if (has2025_2026 && isCabaInst) {
          promotedToCurrent++;
          auditEntries.push({
            name,
            qid: person.source_record_id,
            previous_state: 'STALE_UNKNOWN',
            new_state: 'CURRENT_EVIDENCE',
            evidence: `OpenAlex publications in 2025-2026 at ${inst}`,
            orcid: match.orcid || 'N/A'
          });
        } else if ((has2023_2024 || has2025_2026) && isCabaInst) {
          promotedToRecent++;
          auditEntries.push({
            name,
            qid: person.source_record_id,
            previous_state: 'STALE_UNKNOWN',
            new_state: 'RECENT_EVIDENCE',
            evidence: `OpenAlex publications in 2023-2024 at ${inst}`,
            orcid: match.orcid || 'N/A'
          });
        } else {
          remainedStale++;
        }
      } else {
        remainedStale++;
      }
    } catch (e: any) {
      remainedStale++;
    }
  }

  console.log('--- RESULTADOS DE RESOLUCIÓN TEMPORAL WIKIDATA ---');
  console.log(`MUESTRA AUDITADA:                   ${sample.length}`);
  console.log(`PROMOVIDOS A CURRENT_EVIDENCE:      ${promotedToCurrent} (${((promotedToCurrent / sample.length) * 100).toFixed(1)}%)`);
  console.log(`PROMOVIDOS A RECENT_EVIDENCE:       ${promotedToRecent} (${((promotedToRecent / sample.length) * 100).toFixed(1)}%)`);
  console.log(`PERMANECEN EN STALE_UNKNOWN:        ${remainedStale} (${((remainedStale / sample.length) * 100).toFixed(1)}%)`);

  if (auditEntries.length > 0) {
    console.log('\nCasos de Promoción Temporal Certificados:');
    console.table(auditEntries);
  }

  const totalStaleWiki = 1065;
  const projectedCurrent = Math.round(totalStaleWiki * (promotedToCurrent / sample.length));
  const projectedRecent = Math.round(totalStaleWiki * (promotedToRecent / sample.length));

  console.log(`\n--- PROYECCIÓN SOBRE LOS 1.065 CANDIDATOS VIVOS WIKIDATA ---`);
  console.log(`POTENCIAL DIRECT CABA ACTUAL:       ~${projectedCurrent} personas`);
  console.log(`POTENCIAL RECENT EVIDENCE:          ~${projectedRecent} personas`);
  console.log(`PERMANECEN CONSERVADORES EN STALE:  ~${totalStaleWiki - projectedCurrent - projectedRecent} personas`);

  return {
    sampleSize: sample.length,
    promotedToCurrent,
    promotedToRecent,
    remainedStale,
    projectedCurrent,
    projectedRecent
  };
}

testWikidataTemporalResolution().catch(console.error);
