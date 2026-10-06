import crypto from 'crypto';
import fs from 'fs';

const codeFiles = [
  'scripts/run_certified_25k_to_50k_gate.mjs',
  'scripts/run_certified_50k_to_100k_gate.mjs',
  'scripts/run_certified_100k_to_250k_gate.mjs',
  'scripts/run_final_500k_production_race.mjs',
  'scripts/setup_canonical_mission_ledger.mjs',
  'scripts/compute_freeze_hash.mjs',
  'src/lib/atlasIndustrialEmail/IndustrialEmailSearchIndex.ts',
  'src/lib/atlasIndustrialEmail/EmailNormalizerAndClassifier.ts'
];
const codeHasher = crypto.createHash('sha256');
for (const f of codeFiles) {
  if (fs.existsSync(f)) {
    const content = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
    codeHasher.update(`${f}:${content}\n`);
  }
}
console.log('CODE_HASH =', codeHasher.digest('hex'));
