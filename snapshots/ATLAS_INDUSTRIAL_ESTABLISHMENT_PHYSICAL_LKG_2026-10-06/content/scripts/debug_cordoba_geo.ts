import { AtlasGeographyRegistry } from '../server/services/industrial/AtlasGeographyRegistry.ts';
import { dbPool } from '../server/db.ts';

async function main() {
  const geoRegistry = AtlasGeographyRegistry.getInstance();
  geoRegistry.setDbPool(dbPool);
  await geoRegistry.loadFromDb();

  const all = geoRegistry.getAllGeographies();
  console.log('ALL 63 ENTRIES:');
  for (const g of all) {
    console.log(`- ${g.geography_id} | ${g.canonical_name} | ${g.display_name} | aliases: [${g.normalized_aliases.join(', ')}]`);
  }
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
