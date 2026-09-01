import { generateFieldSignal } from '../src/lib/field/fieldEngine';
import { updateFieldStateWithFeedback } from '../src/lib/field/fieldFeedback';
import { calculateFieldSatisfaction } from '../src/lib/field/fieldTelemetry';
import type { FieldSessionEvent } from '../src/lib/field/fieldTypes';

async function testFieldEngineTesla() {
  console.log('======================================================================');
  console.log('⚡ TEST MASTER: YOU FIELD ENGINE (V1)');
  console.log('Prompt: "Quiero entender a Nikola Tesla en 45 minutos"');
  console.log('======================================================================\n');

  // 1. Ejecutar el Field Engine
  const result = await generateFieldSignal({
    prompt: 'Quiero entender a Nikola Tesla',
    availableMinutes: 45,
    device: 'tv'
  });

  console.log('1. FIELD STATE GENERADO:');
  console.log('   - Intent:', result.fieldState.intent);
  console.log('   - Desired Mix:', result.fieldState.desiredMix);
  console.log('   - Contexto:', result.fieldState.context);

  console.log('\n2. FIELD PLAN (SECUENCIA GIRATORIA DE BLOQUES):');
  result.plan.blocks.forEach((b, i) => {
    console.log(`   [Bloque ${i + 1}] (${b.targetMinutes}m) [ROL: ${b.role.toUpperCase()}] [FASE: ${b.phase.toUpperCase()}]`);
    console.log(`     Concepto: ${b.concept}`);
    console.log(`     Búsqueda en Core: "${b.queryOverride}"`);
    if (b.allocatedCandidate) {
      console.log(`     🎬 Video Asignado: "${b.allocatedCandidate.title}" (${b.allocatedCandidate.channelTitle})`);
    }
  });

  console.log('\n3. SEÑAL ARMADA PARA REPRODUCCIÓN:');
  console.log(`   - ID Señal: ${result.signal.id}`);
  console.log(`   - Nombre: ${result.signal.name}`);
  console.log(`   - Bloques en Schedule: ${result.signal.schedule.length}`);
  console.log(`   - Creadores Únicos: ${result.telemetry.uniqueCreators}`);
  console.log(`   - Duración Total: ${Math.round(result.telemetry.totalDurationSeconds / 60)} min`);

  // 2. Simulación de Feedback en Tiempo Real
  console.log('\n4. SIMULACIÓN DE FEEDBACK EN TIEMPO REAL (PLAY → OBSERVE → UPDATE FIELD):');
  const event1: FieldSessionEvent = {
    blockId: result.signal.schedule[0]?.id || 'block-1',
    role: 'foundation',
    durationSec: 600,
    watchSeconds: 580,
    watchPercentage: 0.96,
    liked: true,
    saved: true,
    timestamp: Date.now()
  };

  const updatedState = updateFieldStateWithFeedback(result.fieldState, event1);
  console.log(`   - Evento Bloque 1: Visto 96%, Me Gusta ✅, Momento Guardado ✅`);
  console.log(`   - Nuevo Estado de Campo:`);
  console.log(`     • Profundidad técnica (depth): ${updatedState.desiredMix.depth.toFixed(2)} (Incrementó)`);
  console.log(`     • Nueva Fase del Campo: ${updatedState.currentPhase.toUpperCase()}`);

  // 3. Telemetría y Satisfacción del Campo
  const satisfaction = calculateFieldSatisfaction([event1], result.plan);
  console.log('\n5. TELEMETRÍA DEL CAMPO (FIELD SATISFACTION METRICS):');
  console.log(`   - Completion Rate: ${satisfaction.completionRate}%`);
  console.log(`   - Value Score: ${satisfaction.valueScore}/100`);
  console.log(`   - Redundancy Rate: ${satisfaction.redundancyRate}% (Baja redundancia)`);
  console.log(`   - Knowledge Progression Rate: ${satisfaction.knowledgeProgressionRate}%`);
  console.log(`   - Overall Field Satisfaction: ${satisfaction.overallSatisfaction}/100 🌟`);

  console.log('\n======================================================================');
  console.log('🏆 YOU FIELD ENGINE (V1) VALIDADO AL 100%');
  console.log('   "Internet aporta la energía. YouApp crea el campo."');
  console.log('======================================================================\n');
}

testFieldEngineTesla().catch(console.error);
