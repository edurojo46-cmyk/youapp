import { UniversalSemanticResolver } from '../server/services/industrial/UniversalSemanticResolver.ts';
import { AtlasConceptRegistry } from '../server/services/industrial/AtlasConceptRegistry.ts';
import { dbPool } from '../server/db.ts';

async function main() {
  const registry = AtlasConceptRegistry.getInstance();
  registry.setDbPool(dbPool);
  await registry.ensureSchema();
  await registry.loadFromDb();

  const resolver = UniversalSemanticResolver.getInstance();

  const pairs = [
    {
      name: '1. Fabricante vs Vendedor',
      queryA: 'fabricantes de muebles en Córdoba',
      queryB: 'mueblerías en Córdoba',
      validate: (resA: any, resB: any) => {
        const passA = resA.relation === 'MANUFACTURER' || resA.activity.includes('MANUFACTURING') || resA.activity.includes('FABRICACION');
        const passB = resA.relation !== resB.relation && (resB.relation === 'RETAILER' || resB.relation === 'SELLER' || resB.relation === 'ESTABLISHMENT_SERVICE');
        return { pass: passA && passB, details: `A: rel=${resA.relation}, cat=${resA.category} | B: rel=${resB.relation}, cat=${resB.category}` };
      }
    },
    {
      name: '2. Proveedor vs Comprador',
      queryA: 'proveedor de packaging en Córdoba',
      queryB: 'empresas que compran packaging en Córdoba',
      validate: (resA: any, resB: any) => {
        const passA = resA.relation === 'SUPPLIER' || resA.relation === 'DISTRIBUTOR';
        const passB = resB.relation === 'BUYER';
        return { pass: passA && passB, details: `A: rel=${resA.relation} | B: rel=${resB.relation}` };
      }
    },
    {
      name: '3. Empresa vs Establecimiento',
      queryA: 'empresa inmobiliaria en CABA',
      queryB: 'inmobiliaria en CABA',
      validate: (resA: any, resB: any) => {
        const passA = resA.row_unit === 'COMPANY';
        const passB = resB.row_unit === 'ESTABLISHMENT';
        return { pass: passA && passB, details: `A: unit=${resA.row_unit} | B: unit=${resB.row_unit}` };
      }
    },
    {
      name: '4. Laboratorio vs Farmacia',
      queryA: 'laboratorio farmacéutico en CABA',
      queryB: 'farmacia en CABA',
      validate: (resA: any, resB: any) => {
        const passA = resA.row_unit === 'COMPANY' && (resA.relation === 'MANUFACTURER' || resA.category.includes('PHARMACEUTICAL') || resA.category.includes('2100'));
        const passB = resB.row_unit === 'ESTABLISHMENT' && (resB.category === 'PHARMACY' || resB.category.includes('4772'));
        return { pass: passA && passB, details: `A: cat=${resA.category}, unit=${resA.row_unit} | B: cat=${resB.category}, unit=${resB.row_unit}` };
      }
    },
    {
      name: '5. Periodista vs Medio',
      queryA: 'periodista en CABA',
      queryB: 'medio de comunicación en CABA',
      validate: (resA: any, resB: any) => {
        const passA = resA.row_unit === 'PERSON' || resA.relation === 'MEDIA_ROLE';
        const passB = resB.row_unit === 'COMPANY';
        return { pass: passA && passB, details: `A: unit=${resA.row_unit}, rel=${resA.relation} | B: unit=${resB.row_unit}, rel=${resB.relation}` };
      }
    },
    {
      name: '6. Hotel vs Proveedor de Hotel',
      queryA: 'hoteles en Bariloche',
      queryB: 'proveedores para hoteles en Bariloche',
      validate: (resA: any, resB: any) => {
        const passA = resA.row_unit === 'ESTABLISHMENT';
        const passB = resB.relation === 'SUPPLIER';
        const negB = resB.negative_semantics.some((n: any) => n.disallowed_categories.includes(resA.category) || n.disallowed_roles.includes('HOSPITALITY') || n.disallowed_roles.includes('ESTABLISHMENT_SERVICE'));
        return { pass: passA && passB && negB, details: `A: unit=${resA.row_unit}, cat=${resA.category} | B: rel=${resB.relation}, negDisallowsA=${negB}` };
      }
    },
    {
      name: '7. Restaurante vs Proveedor Gastronómico',
      queryA: 'restaurantes en Salta',
      queryB: 'proveedores gastronómicos en Salta',
      validate: (resA: any, resB: any) => {
        const passA = resA.row_unit === 'ESTABLISHMENT';
        const passB = resB.relation === 'SUPPLIER';
        return { pass: passA && passB, details: `A: unit=${resA.row_unit}, cat=${resA.category} | B: rel=${resB.relation}` };
      }
    },
    {
      name: '8. Constructora vs Corralón',
      queryA: 'empresas constructoras en Neuquén',
      queryB: 'corralón de materiales en Neuquén',
      validate: (resA: any, resB: any) => {
        const passA = resA.row_unit === 'COMPANY';
        const passB = resB.row_unit === 'ESTABLISHMENT' || resB.relation === 'RETAILER' || resB.relation === 'DISTRIBUTOR';
        return { pass: passA && passB && resA.category !== resB.category, details: `A: cat=${resA.category}, unit=${resA.row_unit} | B: cat=${resB.category}, unit=${resB.row_unit}` };
      }
    }
  ];

  console.log('--- EXECUTING CONTRASTIVE TESTS (8 DIFFICULT PAIRS) ---');
  let errors = 0;
  for (const p of pairs) {
    const resA = resolver.resolve(p.queryA);
    const resB = resolver.resolve(p.queryB);
    const v = p.validate(resA, resB);
    const ok = v.pass;
    if (!ok) errors++;
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${p.name}: ${v.details}`);
  }

  console.log(`\nCONTRASTIVE_TESTS_TOTAL = ${pairs.length}`);
  console.log(`CONTRASTIVE_ERRORS = ${errors}`);

  process.exit(errors > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
