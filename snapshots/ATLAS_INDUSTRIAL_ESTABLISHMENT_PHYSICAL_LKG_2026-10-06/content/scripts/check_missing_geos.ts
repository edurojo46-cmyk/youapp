import { AtlasGeographyRegistry } from '../server/services/industrial/AtlasGeographyRegistry.ts';
import { dbPool } from '../server/db.ts';

// Read main100Tests from test_semantic_compiler_suite.ts
import fs from 'fs';

async function main() {
  const geoRegistry = AtlasGeographyRegistry.getInstance();
  geoRegistry.setDbPool(dbPool);
  await geoRegistry.loadFromDb();

  const file = fs.readFileSync('scripts/test_semantic_compiler_suite.ts', 'utf8');
  const geoMatches = [...file.matchAll(/geography:\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
  console.log('Unique expected geographies in main100Tests:', Array.from(new Set(geoMatches)));

  const missing: string[] = [];
  for (const g of Array.from(new Set(geoMatches))) {
    const res = geoRegistry.resolveCanonicalGeography(g);
    const amb = geoRegistry.detectAmbiguity(g);
    if (!res && !amb.is_ambiguous) {
      missing.push(g);
    }
  }
  console.log('Geographies that resolve to neither direct match nor ambiguity:', missing);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
