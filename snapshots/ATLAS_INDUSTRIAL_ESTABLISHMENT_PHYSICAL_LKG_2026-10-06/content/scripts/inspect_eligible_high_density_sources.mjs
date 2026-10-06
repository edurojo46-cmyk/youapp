import fs from 'fs';
import path from 'path';

const sourceMapPath = path.resolve('scratch/atlas_canonical_certified_source_map.json');
const data = JSON.parse(fs.readFileSync(sourceMapPath, 'utf8'));

console.log('Total sources in file:', data.sources.length);

// Filter sources that target PERSON and are public/open/free and not blocked
const eligibleSources = data.sources.filter(s => {
  const isPerson = (s.ENTITY_TYPES || []).includes('PERSON') || (s.CONCEPT_SCORES?.PERSON || 0) >= 0.5;
  const isPublic = s.PUBLIC_OPEN_FREE !== false && s.AUTH_REQUIRED !== true;
  const notBlocked = s.CERTIFICATION_STATUS !== 'BLOCKED' && s.ACTIVATION_STATUS !== 'BLOCKED';
  return isPerson && isPublic && notBlocked;
});

console.log('Eligible PERSON sources:', eligibleSources.length);

// Group by source type / protocol
const byProtocol = {};
for (const s of eligibleSources) {
  const p = s.PROTOCOL || 'UNKNOWN';
  byProtocol[p] = (byProtocol[p] || 0) + 1;
}
console.log('Eligible by protocol:', byProtocol);

// Find high density sources
const highDensity = eligibleSources.filter(s => {
  const density = s.CONCEPT_SCORES?.PERSON || 0;
  return density >= 0.85;
});

console.log('\nTop High Density Sources (Top 25):');
for (const s of highDensity.slice(0, 25)) {
  console.log(`- ${s.SOURCE_ID.padEnd(35)} | Type: ${(s.SOURCE_TYPE || '').padEnd(15)} | Protocol: ${(s.PROTOCOL || '').padEnd(10)} | Region: ${s.REGION || ''} | Name: ${s.SOURCE_NAME}`);
}
