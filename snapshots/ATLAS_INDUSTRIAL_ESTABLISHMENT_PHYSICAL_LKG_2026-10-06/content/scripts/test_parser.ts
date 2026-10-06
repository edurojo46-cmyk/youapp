import { QueryIntentParser } from '../src/lib/search/UniversalQueryModel.js';

const queries = [
  'comerciante en CABA',
  'empleado en CABA',
  'plomero en CABA',
  'médico en CABA',
  'programador en Buenos Aires',
  'abogado en Córdoba',
  'arquitecto en Mendoza',
  'Juan Pérez abogado en Córdoba'
];

for (const q of queries) {
  const intent = QueryIntentParser.parse(q);
  console.log(`QUERY: "${q}"`);
  console.log(`  person_name: ${intent.person_name}`);
  console.log(`  work_concept: ${intent.work_concept?.canonical_id} (${intent.work_concept?.dimension})`);
  console.log(`  occupation: ${intent.occupation}, trade: ${intent.trade}, role_class: ${intent.role_class}`);
  console.log(`  geography: ${intent.geography}`);
  console.log(`  specificity: ${intent.query_specificity}\n`);
}
