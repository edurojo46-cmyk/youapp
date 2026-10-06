import { exactWorkSearchGate } from '../src/lib/search/exactWorkSearchGate';

const queries = [
  'osvaldo pugliese la yumba en el colon',
  'osvaldo pugliese en el colon',
  'osvaldo pugliese la yumba',
  'osvaldo pugliese',
  'cerati en obras',
  'charly en ferro',
  'queen wembley',
  'pavarotti la scala',
  'ricky martin a medio vivir',
  'calle 13 la perla',
  'papa francisco entrevista'
];

console.log('=== COMPOSABLE INTENT RESOLUTION SUITE ===\n');

for (const q of queries) {
  const d = exactWorkSearchGate.detectExactWork(q);
  console.log(`Query: "${q}"`);
  console.log(`  baseIntent:           ${d.baseIntent}`);
  console.log(`  detectionType:        ${d.detectionType}`);
  console.log(`  canonicalEntity:      ${d.canonicalEntity || 'none'}`);
  console.log(`  canonicalWork:        ${d.canonicalWork || 'none'}`);
  console.log(`  residualTitle:        ${d.residualTitle || 'none'}`);
  console.log(`  topicCategory:        ${d.topicCategory || 'none'}`);
  console.log(`  venue:                ${d.venue || 'none'}`);
  console.log(`  constraints:          ${d.constraints ? JSON.stringify(d.constraints.map(c => `${c.type}=${c.canonicalValue}`)) : 'none'}`);
  console.log('--------------------------------------------------');
}
