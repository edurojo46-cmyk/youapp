import fs from 'fs';

const data = JSON.parse(fs.readFileSync('scratch/atlas_canonical_certified_source_map.json', 'utf8'));
const sources = data.sources;

const oaiSources = sources.filter(s => s.PROTOCOL === 'OAI_PMH');
console.log('--- OAI-PMH SOURCES (Total:', oaiSources.length, ') ---');
for (const s of oaiSources.slice(0, 30)) {
  console.log(`- ${s.SOURCE_ID} | ${s.SOURCE_NAME} | ${s.REGION}`);
}

const ckanSources = sources.filter(s => s.PROTOCOL === 'CKAN');
console.log('\n--- CKAN SOURCES (Total:', ckanSources.length, ') ---');
for (const s of ckanSources.slice(0, 20)) {
  console.log(`- ${s.SOURCE_ID} | ${s.SOURCE_NAME} | ${s.REGION}`);
}

const apiSources = sources.filter(s => s.PROTOCOL === 'API');
console.log('\n--- API SOURCES (Total:', apiSources.length, ') ---');
for (const s of apiSources.slice(0, 20)) {
  console.log(`- ${s.SOURCE_ID} | ${s.SOURCE_NAME} | ${s.REGION}`);
}
