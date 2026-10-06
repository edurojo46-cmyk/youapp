import { AtlasAutonomousObjectiveResolver } from '../src/lib/atlasGeneralEngine/AtlasAutonomousObjectiveResolver.ts';

const missions = [
  'Construí una base de plantas argentinas de tratamiento de residuos que procesen desechos electrónicos.',
  'Encontrá aeropuertos argentinos que dispongan de infraestructura para operaciones internacionales de carga.',
  'Construí una base de bibliotecas argentinas que ofrezcan acceso público a colecciones digitalizadas.',
  'Encontrá laboratorios argentinos que realicen ensayos acreditados para alimentos.',
  'Construí una base de consorcios argentinos que hayan ejecutado proyectos de generación de energía renovable.',
  'Encontrá permisos ambientales otorgados a establecimientos industriales después de una evaluación de impacto ambiental.',
  'Construí una base de rutas argentinas en las que existan estaciones de carga para vehículos eléctricos.',
  'Encontrá iniciativas argentinas en las que una tecnología desarrollada por una institución pública haya terminado incorporada a un proceso productivo privado.',
  'Construí una base de mercados concentradores argentinos que publiquen precios mayoristas de manera periódica.',
  'Encontrá casos en los que una organización haya recibido una sanción y posteriormente demostrado el cumplimiento de una medida correctiva.'
];

const resolver = new AtlasAutonomousObjectiveResolver();

for (let i = 0; i < missions.length; i++) {
  const m = missions[i];
  const res = resolver.interpretGeneralObjective(m);
  console.log(`\n==================================================`);
  console.log(`MISIÓN ${i + 1}`);
  console.log(`==================================================`);
  console.log('Raw output:', JSON.stringify(res, null, 2));
}

await resolver.close();
