import fs from 'fs';
import readline from 'readline';
import { GlobalIdentityAuthorityV4, hash64, normalizeName } from './build_global_identity_authority_v4.mjs';

async function main() {
  console.log('Loading GlobalIdentityAuthorityV4 from scratch/global_identity_authority_v4_plus_delta.bin...');
  const auth = GlobalIdentityAuthorityV4.loadFromFile('scratch/global_identity_authority_v4_plus_delta.bin');
  console.log('Authority loaded. Active keys:', auth.count.toLocaleString());

  console.log('Loading active 613,912 fuel ledger hashes...');
  const binBuf = fs.readFileSync('scratch/atlas_fuel_identity_ledger.bin');
  const binArr = new BigUint64Array(binBuf.buffer, binBuf.byteOffset, binBuf.byteLength / 8);
  const activeHashSet = new Set();
  for (let i = 0; i < binArr.length; i++) activeHashSet.add(binArr[i]);
  console.log('Active hashes loaded:', activeHashSet.size.toLocaleString());

  // Also load alias map to test cross-identifier blocking
  const aliasMap = JSON.parse(fs.readFileSync('scratch/canonical_human_alias_map.json', 'utf8'));
  const aliasSet = new Set(Object.keys(aliasMap));
  console.log('Alias map loaded. Alias keys:', aliasSet.size.toLocaleString());

  async function testFile(file, yr) {
    const rl = readline.createInterface({ input: fs.createReadStream(file) });
    let totalRows = 0;
    let candidates = 0;
    let authRejects = 0;
    let fuelRejects = 0;
    let aliasRejects = 0;
    let netNew = 0;
    const runSeen = new Set();

    for await (const line of rl) {
      totalRows++;
      if (totalRows === 1) continue;
      const parts = line.split(',');
      let rawName = parts[6] ? parts[6].replace(/["']/g, '').trim() : '';
      if (!rawName) continue;
      rawName = rawName.replace(/\bx_ape\b/gi, '').trim();
      const norm = normalizeName(rawName);
      if (!norm || norm.length < 4) continue;
      const words = norm.split(' ').filter(w => w.length > 1);
      if (words.length < 2 || words.length > 5) continue;
      
      candidates++;
      if (auth.has(norm)) {
        authRejects++;
        continue;
      }
      const canKey = 'AR:FUEL:NAME_JUR:' + norm + ':ARG';
      if (aliasSet.has(canKey)) {
        aliasRejects++;
        continue;
      }
      const keyH64 = hash64(canKey);
      if (activeHashSet.has(keyH64)) {
        fuelRejects++;
        continue;
      }
      if (runSeen.has(keyH64)) {
        continue;
      }
      runSeen.add(keyH64);
      netNew++;
    }
    console.log(`${yr}: rows=${totalRows}, candidates=${candidates}, authRejects=${authRejects}, fuelRejects=${fuelRejects}, aliasRejects=${aliasRejects}, netNew=${netNew}`);
    return netNew;
  }

  let totalAvailable = 0;
  totalAvailable += await testFile('scratch/physical_sources/dnda_by_year/derecho-autor-2012.csv', 'DNDA 2012');
  totalAvailable += await testFile('scratch/physical_sources/dnda_by_year/derecho-autor-2011.csv', 'DNDA 2011');
  totalAvailable += await testFile('scratch/physical_sources/dnda_by_year/derecho-autor-2010.csv', 'DNDA 2010');
  totalAvailable += await testFile('scratch/physical_sources/dnda_by_year/derecho-autor-2009.csv', 'DNDA 2009');
  totalAvailable += await testFile('scratch/physical_sources/dnda_by_year/derecho-autor-2008.csv', 'DNDA 2008');
  totalAvailable += await testFile('scratch/physical_sources/dnda_by_year/derecho-autor-2007.csv', 'DNDA 2007');
  totalAvailable += await testFile('scratch/physical_sources/dnda_by_year/derecho-autor-2006.csv', 'DNDA 2006');
  console.log('Total Net New across tested cohorts:', totalAvailable);
}

main().catch(console.error);
