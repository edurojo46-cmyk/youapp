import fs from 'fs';
import readline from 'readline';
import { GlobalIdentityAuthorityV4, normalizeName } from './build_global_identity_authority_v4.mjs';

async function check() {
  const auth = GlobalIdentityAuthorityV4.loadFromFile('scratch/global_identity_authority_v4.bin');
  console.log('Authority V4 loaded.');

  const stream = fs.createReadStream('scratch/physical_sources/igj_autoridades_genero_202603.csv', { start: 60000000 });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let lines = 0;
  let known = 0;
  let netNew = 0;
  const seen = new Set();

  for await (const line of rl) {
    lines++;
    const parts = line.split('","').map(s => s.replace(/^"|"$/g, '').trim());
    if (parts.length < 2) continue;
    const name = parts[1];
    const norm = normalizeName(name);
    if (!norm || norm.length < 5) continue;
    if (auth.has(norm)) {
      known++;
      continue;
    }
    if (seen.has(norm)) continue;
    seen.add(norm);
    netNew++;
    if (lines % 100000 === 0) {
      console.log(`Sampled ${lines.toLocaleString()} lines -> Net new unique: ${netNew.toLocaleString()}, Known V4: ${known.toLocaleString()}`);
    }
  }
  console.log(`Final IGJ segment lines: ${lines.toLocaleString()} | Net new unique: ${netNew.toLocaleString()} | Known V4: ${known.toLocaleString()}`);
}

check().catch(console.error);
