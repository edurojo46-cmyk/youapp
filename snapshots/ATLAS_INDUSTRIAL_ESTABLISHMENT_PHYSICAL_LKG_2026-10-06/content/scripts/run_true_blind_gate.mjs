import { AtlasAutonomousObjectiveResolver } from '../src/lib/atlasGeneralEngine/AtlasAutonomousObjectiveResolver.ts';

const missions = [
  'Construí una base de cooperativas agropecuarias argentinas que comercialicen productos orgánicos.',
  'Encontrá hospitales argentinos que tengan programas activos de telemedicina.',
  'Construí una base de museos argentinos que hayan digitalizado parte de sus colecciones.',
  'Encontrá centros logísticos argentinos que cuenten con infraestructura de cadena de frío.',
  'Construí una base de empresas argentinas que hayan recibido financiamiento público para desarrollar biotecnología.',
  'Encontrá alertas meteorológicas oficiales que hayan provocado cierres preventivos, evacuaciones o suspensión de actividades.',
  'Construí una base de escuelas técnicas argentinas que tengan laboratorios o programas de robótica.',
  'Encontrá servicios públicos argentinos que permitan realizar un trámite completamente en línea.',
  'Construí una base de productos argentinos que posean certificaciones públicas de calidad o seguridad.',
  'Encontrá casos en los que una empresa haya sido incorporada como proveedor de una organización después de atravesar un proceso público de homologación o calificación.'
];

const resolver = new AtlasAutonomousObjectiveResolver();

for (let i = 0; i < missions.length; i++) {
  const m = missions[i];
  const res = resolver.interpretGeneralObjective(m);
  console.log(`\n==================================================`);
  console.log(`MISIÓN ${i + 1}`);
  console.log(`==================================================`);
  console.log('Raw result:', JSON.stringify(res, null, 2));
}

await resolver.close();
