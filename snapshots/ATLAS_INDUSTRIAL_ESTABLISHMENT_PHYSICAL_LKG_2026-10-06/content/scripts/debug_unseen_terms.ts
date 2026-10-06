import { AtlasConceptRegistry } from '../server/services/industrial/AtlasConceptRegistry.ts';
import { dbPool } from '../server/db.ts';

async function main() {
  const reg = AtlasConceptRegistry.getInstance();
  reg.setDbPool(dbPool);
  await reg.ensureSchema();
  await reg.loadFromDb();

  const queries = [
    'envases plasticos',
    'envases',
    'plasticos',
    'muebles',
    'calzado',
    'frutas congeladas',
    'frutas',
    'energia',
    'lavanderia',
    'acero inoxidable',
    'acero'
  ];

  for (const q of queries) {
    const res = reg.matchConcept(q);
    console.log(`"${q}" => ${res ? res.concept_id + ' (' + res.canonical_name + ')' : 'NULL'}`);
  }
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
