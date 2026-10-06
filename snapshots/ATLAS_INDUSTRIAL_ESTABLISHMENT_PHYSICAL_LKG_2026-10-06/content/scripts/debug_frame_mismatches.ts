import { AtlasGeographyRegistry } from '../server/services/industrial/AtlasGeographyRegistry.ts';
import { AtlasConceptRegistry } from '../server/services/industrial/AtlasConceptRegistry.ts';
import { AtlasSemanticCompiler } from '../server/services/industrial/AtlasSemanticCompiler.ts';
import { dbPool } from '../server/db.ts';

// We import main100Tests from test_semantic_compiler_suite.ts
import fs from 'fs';

async function main() {
  const geoRegistry = AtlasGeographyRegistry.getInstance();
  geoRegistry.setDbPool(dbPool);
  await geoRegistry.loadFromDb();

  const conceptRegistry = AtlasConceptRegistry.getInstance();
  conceptRegistry.setDbPool(dbPool);
  await conceptRegistry.ensureSchema();
  await conceptRegistry.loadFromDb();

  const compiler = AtlasSemanticCompiler.getInstance();

  // Run the 100 tests through test suite runner and print mismatches
  const suiteModule = await import('../scripts/test_semantic_compiler_suite.ts');
  // Or read the file directly
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
