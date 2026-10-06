import { exactWorkSearchGate } from '../src/lib/search/exactWorkSearchGate';

function testDetection() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('🧪 TEST: DETECCIÓN Y CLASIFICACIÓN DE INTENT "ENTITY_TOPIC"');
  console.log('════════════════════════════════════════════════════════════════\n');

  const testCases = [
    { query: 'papa francisco', expectedType: 'EXACT_ENTITY', expectedEntity: 'Papa Francisco' },
    { query: 'papa francisco entrevista', expectedType: 'ENTITY_TOPIC', expectedEntity: 'Papa Francisco', expectedTopic: 'ENTREVISTA' },
    { query: 'papa francisco discurso', expectedType: 'ENTITY_TOPIC', expectedEntity: 'Papa Francisco', expectedTopic: 'DISCURSO' },
    { query: 'messi conferencia de prensa', expectedType: 'ENTITY_TOPIC', expectedEntity: 'Lionel Messi', expectedTopic: 'CONFERENCIA' },
    { query: 'milei discurso', expectedType: 'ENTITY_TOPIC', expectedEntity: 'Javier Milei', expectedTopic: 'DISCURSO' },
    { query: 'shakira entrevista', expectedType: 'ENTITY_TOPIC', expectedEntity: 'Shakira', expectedTopic: 'ENTREVISTA' },
    { query: 'ricky martin a medio vivir', expectedType: 'EXACT_ENTITY_TITLE', expectedEntity: 'Ricky Martin' },
    { query: 'calle 13 la perla', expectedType: 'EXACT_ENTITY_WORK', expectedEntity: 'Calle 13' }
  ];

  let passed = 0;

  for (const tc of testCases) {
    const d = exactWorkSearchGate.detectExactWork(tc.query);
    const typeOk = d.detectionType === tc.expectedType;
    const entityOk = d.canonicalEntity === tc.expectedEntity;
    const topicOk = tc.expectedTopic ? d.topicCategory === tc.expectedTopic : true;
    const success = typeOk && entityOk && topicOk;

    if (success) passed++;

    console.log(`Query: "${tc.query}"`);
    console.log(`  detectionType:   ${d.detectionType} (esperado: ${tc.expectedType}) ${typeOk ? '✅' : '❌'}`);
    console.log(`  canonicalEntity: ${d.canonicalEntity || 'none'} (esperado: ${tc.expectedEntity}) ${entityOk ? '✅' : '❌'}`);
    if (tc.expectedTopic) {
      console.log(`  topicCategory:   ${d.topicCategory} (esperado: ${tc.expectedTopic}) ${topicOk ? '✅' : '❌'}`);
    }
    console.log(`  Estado:          ${success ? 'PASS ✅' : 'FAIL ❌'}\n`);
  }

  console.log(`Resultado: ${passed}/${testCases.length} pasaron.`);
  if (passed === testCases.length) {
    console.log('🎉 TODOS LOS CASOS DE ENTITY_TOPIC Y WORKS PASARON EXITOSAMENTE.');
  } else {
    process.exit(1);
  }
}

testDetection();
