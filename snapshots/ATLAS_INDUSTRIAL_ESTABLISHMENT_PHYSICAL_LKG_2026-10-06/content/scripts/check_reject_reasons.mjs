import fs from 'fs';
import readline from 'readline';
import { AtlasFuelIdentityLedger } from './atlas_fuel_identity_ledger.mjs';

async function main() {
  const ledger = new AtlasFuelIdentityLedger();
  await ledger.initialize();

  const file = 'scratch/physical_sources/dnda_by_year/derecho-autor-2012.csv';
  const rl = readline.createInterface({ input: fs.createReadStream(file) });
  let row = 0;
  const reasons = {};
  let credited = 0;
  for await (const l of rl) {
    row++;
    if (row === 1) continue;
    const parts = l.split(',');
    const raw = parts[6]?.replace(/["']/g, '').trim();
    if (!raw) continue;
    const res = ledger.evaluateAndCredit({
      name: raw,
      jurisdiction: 'ARG',
      sourceId: 'TEST',
      populationClass: 'TEST',
      cuit: null,
      dni: null
    });
    if (!res.credited) {
      reasons[res.reason] = (reasons[res.reason] || 0) + 1;
    } else {
      credited++;
    }
  }
  console.log('Credited:', credited);
  console.log('Reject reasons for DNDA 2012:', reasons);
}

main().catch(console.error);
