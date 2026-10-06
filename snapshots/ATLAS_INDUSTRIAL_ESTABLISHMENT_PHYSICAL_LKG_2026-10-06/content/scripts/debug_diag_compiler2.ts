import { AtlasGeographyRegistry } from '../server/services/industrial/AtlasGeographyRegistry.ts';
import { AtlasConceptRegistry } from '../server/services/industrial/AtlasConceptRegistry.ts';
import { AtlasSemanticCompiler } from '../server/services/industrial/AtlasSemanticCompiler.ts';
import { dbPool } from '../server/db.ts';

async function main() {
  const geoRegistry = AtlasGeographyRegistry.getInstance();
  geoRegistry.setDbPool(dbPool);
  await geoRegistry.loadFromDb();

  const conceptRegistry = AtlasConceptRegistry.getInstance();
  conceptRegistry.setDbPool(dbPool);
  await conceptRegistry.ensureSchema();
  await conceptRegistry.loadFromDb();

  const compiler = AtlasSemanticCompiler.getInstance();

  const sampleQueries = [
    'fabricantes de muebles en Córdoba',
    'fábricas de calzado en Buenos Aires',
    'empresas que compran packaging en Córdoba',
    'hoteles en Bariloche'
  ];

  for (const q of sampleQueries) {
    const ir = compiler.compile(q);
    console.log(`\nQUERY: "${q}"`);
    console.log(`  Geo: id=${ir.geography.geography_id}, name="${ir.geography.canonical_name}", ambiguous=${ir.geography.is_ambiguous}`);
    console.log(`  Target: entity=${ir.target.entity_type}, row_unit=${ir.target.row_unit}, role=${ir.intent.role}`);
    console.log(`  Intent: action=${ir.intent.action}, relation=${ir.intent.relation}`);
    console.log(`  Object: id=${ir.object.concept_id}, canonical="${ir.object.canonical_name}"`);
    console.log(`  Evidence: [${ir.evidence_contract.map(e => e.evidence_type).join(', ')}]`);
    console.log(`  Negative constraints:`, JSON.stringify(ir.negative_constraints));
  }
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
