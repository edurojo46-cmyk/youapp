import { AtlasConceptRegistry } from '../server/services/industrial/AtlasConceptRegistry.ts';
import { AtlasGeographyRegistry } from '../server/services/industrial/AtlasGeographyRegistry.ts';
import { AtlasSemanticCompiler } from '../server/services/industrial/AtlasSemanticCompiler.ts';
import { dbPool } from '../server/db.ts';

const contrastivePairs = [
  {
    name: '1. Fabricantes de muebles vs Mueblerías',
    queryA: 'fabricantes de muebles en Córdoba',
    queryB: 'mueblerías en Córdoba',
    validate: (irA: any, irB: any) => irA.intent.role === 'MANUFACTURER' && (irB.intent.role === 'SELLER' || irB.intent.role === 'RETAILER') && irA.intent.action === 'MANUFACTURE' && (irB.intent.action === 'SELL' || irB.intent.action === 'RETAIL')
  },
  {
    name: '2. Fabricantes de packaging vs Compradores de packaging',
    queryA: 'fabricantes de packaging en Córdoba',
    queryB: 'empresas que compran packaging en Córdoba',
    validate: (irA: any, irB: any) => irA.intent.role === 'MANUFACTURER' && irB.intent.role === 'BUYER' && irB.negative_constraints.some((c: any) => c.disallowed_roles.includes('SELLER'))
  },
  {
    name: '3. Hoteles vs Proveedores para hoteles',
    queryA: 'hoteles en Bariloche',
    queryB: 'proveedores para hoteles en Bariloche',
    validate: (irA: any, irB: any) => irA.target.row_unit === 'ESTABLISHMENT' && irB.intent.role === 'SUPPLIER' && irB.intent.relation === 'SUPPLIES_TO' && irB.negative_constraints.some((c: any) => c.disallowed_categories.includes('HOSPITALITY'))
  },
  {
    name: '4. Farmacias vs Laboratorios farmacéuticos',
    queryA: 'farmacias en CABA',
    queryB: 'laboratorios farmacéuticos en CABA',
    validate: (irA: any, irB: any) => (irA.intent.role === 'RETAILER' || irA.intent.role === 'SELLER') && irB.intent.role === 'MANUFACTURER' && irA.target.row_unit === 'ESTABLISHMENT' && irB.target.row_unit === 'COMPANY'
  },
  {
    name: '5. Periodistas de economía vs Medios de economía',
    queryA: 'periodistas de economía en CABA',
    queryB: 'medios de economía en CABA',
    validate: (irA: any, irB: any) => irA.target.entity_type === 'PERSON' && irA.intent.role === 'JOURNALIST' && irB.target.entity_type === 'COMPANY' && irA.negative_constraints.some((c: any) => c.disallowed_roles.includes('MEDIA_OUTLET'))
  },
  {
    name: '6. Importadores de autopartes vs Fabricantes de autopartes',
    queryA: 'importadores de autopartes en Córdoba',
    queryB: 'fabricantes de autopartes en Córdoba',
    validate: (irA: any, irB: any) => irA.intent.role === 'IMPORTER' && irB.intent.role === 'MANUFACTURER' && irA.intent.action === 'IMPORT' && irB.intent.action === 'MANUFACTURE'
  },
  {
    name: '7. Empresas que venden maquinaria vs Empresas que usan maquinaria',
    queryA: 'empresas que venden maquinaria en Rosario',
    queryB: 'empresas que usan maquinaria en Rosario',
    validate: (irA: any, irB: any) => irA.intent.role === 'SELLER' && irB.intent.role === 'USER' && irA.intent.action === 'SELL' && irB.intent.action === 'USE'
  },
  {
    name: '8. Distribuidores de alimentos vs Restaurantes',
    queryA: 'distribuidores de alimentos en Salta',
    queryB: 'restaurantes en Salta',
    validate: (irA: any, irB: any) => irA.intent.role === 'DISTRIBUTOR' && irB.intent.role === 'SERVICE_PROVIDER' && irA.intent.action === 'DISTRIBUTE' && irB.intent.action === 'PROVIDE_SERVICE'
  }
];

async function main() {
  const geoRegistry = AtlasGeographyRegistry.getInstance();
  geoRegistry.setDbPool(dbPool);
  await geoRegistry.loadFromDb();

  const conceptRegistry = AtlasConceptRegistry.getInstance();
  conceptRegistry.setDbPool(dbPool);
  await conceptRegistry.ensureSchema();
  await conceptRegistry.loadFromDb();

  const compiler = AtlasSemanticCompiler.getInstance();

  for (const p of contrastivePairs) {
    const irA = compiler.compile(p.queryA);
    const irB = compiler.compile(p.queryB);
    const ok = p.validate(irA, irB);
    console.log(`[${p.name}] => ${ok ? 'PASS' : 'FAIL'}`);
    if (!ok) {
      console.log('  irA:', { role: irA.intent.role, action: irA.intent.action, row_unit: irA.target.row_unit, entity: irA.target.entity_type, neg: irA.negative_constraints });
      console.log('  irB:', { role: irB.intent.role, action: irB.intent.action, row_unit: irB.target.row_unit, entity: irB.target.entity_type, neg: irB.negative_constraints });
    }
  }
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
