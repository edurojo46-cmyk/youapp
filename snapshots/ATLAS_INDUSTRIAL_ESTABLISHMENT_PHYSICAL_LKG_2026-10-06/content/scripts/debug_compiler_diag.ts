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

  const q = 'empresas de Neuquén que fabriquen envases plásticos';
  const ir = compiler.compile(q);
  console.log('UNSEEN SAMPLE:', JSON.stringify({
    raw: ir.raw_query,
    target: ir.target,
    intent: ir.intent,
    object: ir.object,
    geography: ir.geography,
    resolution: ir.resolution_state
  }, null, 2));

  // Check 8 contrastive pairs
  const contrastivePairs = [
    { name: '1. muebles', qA: 'fabricantes de muebles en Córdoba', qB: 'mueblerías en Córdoba' },
    { name: '2. packaging', qA: 'fabricantes de packaging en Córdoba', qB: 'empresas que compran packaging en Córdoba' },
    { name: '3. hoteles', qA: 'hoteles en Bariloche', qB: 'proveedores para hoteles en Bariloche' },
    { name: '4. farmacia', qA: 'farmacias en CABA', qB: 'laboratorios farmacéuticos en CABA' },
    { name: '5. periodistas', qA: 'periodistas de economía en CABA', qB: 'medios de economía en CABA' },
    { name: '6. autopartes', qA: 'importadores de autopartes en Córdoba', qB: 'fabricantes de autopartes en Córdoba' },
    { name: '7. maquinaria', qA: 'empresas que venden maquinaria en Rosario', qB: 'empresas que usan maquinaria en Rosario' },
    { name: '8. alimentos', qA: 'distribuidores de alimentos en Salta', qB: 'restaurantes en Salta' }
  ];

  for (const cp of contrastivePairs) {
    const irA = compiler.compile(cp.qA);
    const irB = compiler.compile(cp.qB);
    console.log(`[${cp.name}]`);
    console.log(`  A: role=${irA.intent.role}, action=${irA.intent.action}, row_unit=${irA.target.row_unit}, entity=${irA.target.entity_type}`);
    console.log(`  B: role=${irB.intent.role}, action=${irB.intent.action}, row_unit=${irB.target.row_unit}, entity=${irB.target.entity_type}`);
  }

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
