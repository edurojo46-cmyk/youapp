import { UniversalMissionEngine } from '../server/services/industrial/UniversalMissionEngine.ts';
import { AtlasSemanticCompiler } from '../server/services/industrial/AtlasSemanticCompiler.ts';

const queries = [
  'carpinteria',
  'torneria',
  'tapiceria',
  'herrería',
  'lavandería industrial',
  'fabricantes de muebles',
  'mueblerías',
  'empresas que compran packaging',
  'proveedores para hoteles'
];

async function runFrontTest() {
  console.log('=== FASE 15 — FRONT REAL QUERIES TEST (PLAN ONLY) ===\n');
  const engine = new UniversalMissionEngine();
  const compiler = AtlasSemanticCompiler.getInstance();

  for (const q of queries) {
    const ir = compiler.compile(q);
    const interp = engine.interpretObjective(q);

    console.log(`QUERY: "${q}"`);
    console.log(`  QUIÉN (Entity / RowUnit): ${ir.target.entity_type} / ${ir.target.row_unit}`);
    console.log(`  ACCIÓN: ${ir.intent.action}`);
    console.log(`  RELACIÓN: ${ir.intent.role} (${ir.intent.relation})`);
    console.log(`  OBJETO/SERVICIO: ${ir.object.canonical_name || ir.object.raw_object_phrase}`);
    console.log(`  GEOGRAFÍA: ${ir.geography.canonical_name || 'NACIONAL (DEFAULT)'}`);
    console.log(`  ESTADO: ${ir.resolution_state} | READY: ${ir.execution_layers?.execution_readiness}`);
    console.log(`  SEARCH STRATEGY: ${interp.search_strategy.slice(0, 100)}...`);
    console.log('------------------------------------------------------------');
  }
}

runFrontTest().catch(console.error);
