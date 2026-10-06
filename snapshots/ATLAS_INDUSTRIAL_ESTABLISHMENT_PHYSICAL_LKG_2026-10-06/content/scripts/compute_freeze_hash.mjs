import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export const FROZEN_FILES = [
  'src/lib/atlasIntelligence/AtlasIntelligenceLayer.ts',
  'src/lib/atlasIntelligence/MetaRuleEngine.ts',
  'src/lib/atlasIntelligence/HypothesisEngine.ts',
  'src/lib/atlasIntelligence/ExperimentationEngine.ts',
  'src/lib/atlasIntelligence/ExperienceMemory.ts',
  'src/lib/atlasIntelligence/types.ts',
  'src/lib/atlasRadar/UniversalRadarFabric.ts'
];

export function computeFreezeHash(baseDir = process.cwd()) {
  const hash = crypto.createHash('sha256');
  for (const relPath of FROZEN_FILES) {
    const fullPath = path.resolve(baseDir, relPath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Frozen file not found: ${fullPath}`);
    }
    const content = fs.readFileSync(fullPath, 'utf8').replace(/\r\n/g, '\n');
    hash.update(`FILE:${relPath}\n${content}\n`);
  }
  return hash.digest('hex');
}

if (process.argv[1] && process.argv[1].endsWith('compute_freeze_hash.mjs')) {
  console.log('FREEZE_HASH =', computeFreezeHash());
}
