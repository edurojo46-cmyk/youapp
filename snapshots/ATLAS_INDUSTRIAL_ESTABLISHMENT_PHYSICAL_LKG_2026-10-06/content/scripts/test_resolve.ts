import { ProfessionConceptResolver } from '../src/lib/search/adapters/ProfessionConceptResolver.js';

async function run() {
  const res = new ProfessionConceptResolver();
  const r1 = await res.resolve('comerciante');
  console.log('comerciante:', r1);
  const r2 = await res.resolve('empleado');
  console.log('empleado:', r2);
}

run();
