import { chromium } from 'playwright';

async function testAllTerminalStates() {
  console.log('====================================================');
  console.log('TESTING ALL TERMINAL STATES IN REAL BROWSER');
  console.log('====================================================\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  page.on('console', msg => console.log('BROWSER:', msg.text()));

  await page.goto('http://localhost:5175/buscaindustrial', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#bi-ampliar-base-tab', { timeout: 10000 });
  await page.click('#bi-ampliar-base-tab');
  await page.waitForSelector('#idm-objective-input', { timeout: 6000 });

  // Evaluate inside browser using the window exposed renderer
  const results = await page.evaluate(async () => {
    const renderer = (window as any).__ATLAS_TERMINAL_RENDERER__;
    if (!renderer) {
      throw new Error('__ATLAS_TERMINAL_RENDERER__ not found on window');
    }

    const { getMissionStatusPillLabel, getMissionStatusPillClass, renderMissionTerminalState, isTerminalStatus } = renderer;

    const testMissions = [
      {
        id: '1. NO_VALIDATED_SOURCE',
        metrics: {
          mission_id: 'MISS_TEST_001',
          objective: 'GARAGE en CABA',
          entity_type: 'ESTABLISHMENT',
          geography: 'ARG_CABA',
          target_new_records: 100,
          environment: 'PRODUCTION',
          status: 'NO_VALIDATED_SOURCE_EXISTS_AFTER_DISCOVERY',
          terminal_reason: 'NO_VALIDATED_SOURCE_EXISTS_AFTER_DISCOVERY',
          error_message: 'Atlas analizó las fuentes disponibles y autónomas, pero ninguna cumple los criterios de certificación para este concepto.',
          scanned_count: 0,
          discovered_count: 0,
          verified_count: 0,
          qualified_count: 0,
          true_net_new_count: 0,
          persisted_count: 0,
          searchable_count: 0,
          duplicate_existing_count: 0,
          rejected_count: 0,
          certified_new_searchable: 0,
          target_reached: false,
          speed_records_per_sec: 0,
          elapsed_seconds: 5,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString()
        },
        expectedPill: '⚠️ SIN FUENTE VÁLIDA',
        expectedTitle: 'Todavía no encontramos una fuente válida para ampliar esta búsqueda.',
        cannotContainCancelled: true
      },
      {
        id: '2. NO_NEW_ALL_REJECTED',
        metrics: {
          mission_id: 'MISS_TEST_002',
          objective: 'LIBRERIAS en CABA',
          entity_type: 'ESTABLISHMENT',
          geography: 'ARG_CABA',
          target_new_records: 100,
          environment: 'PRODUCTION',
          status: 'NO_NEW_ALL_REJECTED',
          terminal_reason: 'NO_NEW_ALL_REJECTED',
          error_message: 'Todos los candidatos fueron descartados por reglas de calidad.',
          scanned_count: 20,
          discovered_count: 20,
          verified_count: 0,
          qualified_count: 0,
          true_net_new_count: 0,
          persisted_count: 0,
          searchable_count: 0,
          duplicate_existing_count: 0,
          rejected_count: 20,
          certified_new_searchable: 0,
          target_reached: false,
          speed_records_per_sec: 2,
          elapsed_seconds: 10,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString()
        },
        expectedPill: '🛡️ CANDIDATOS NO CERTIFICADOS',
        expectedTitle: 'Candidatos no certificados',
        cannotContainCancelled: true
      },
      {
        id: '3. NO_NEW_ALL_DUPLICATES',
        metrics: {
          mission_id: 'MISS_TEST_003',
          objective: 'FARMACIAS en CABA',
          entity_type: 'ESTABLISHMENT',
          geography: 'ARG_CABA',
          target_new_records: 100,
          environment: 'PRODUCTION',
          status: 'NO_NEW_ALL_DUPLICATES',
          terminal_reason: 'NO_NEW_ALL_DUPLICATES',
          error_message: 'Todos los registros encontrados ya existían en Atlas.',
          scanned_count: 50,
          discovered_count: 50,
          verified_count: 50,
          qualified_count: 0,
          true_net_new_count: 0,
          persisted_count: 0,
          searchable_count: 0,
          duplicate_existing_count: 50,
          rejected_count: 0,
          certified_new_searchable: 0,
          target_reached: false,
          speed_records_per_sec: 5,
          elapsed_seconds: 8,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString()
        },
        expectedPill: 'ℹ️ TODOS DUPLICADOS',
        expectedTitle: 'Todos los registros encontrados ya existían en Atlas',
        cannotContainCancelled: true
      },
      {
        id: '4. NO_NEW_MIXED',
        metrics: {
          mission_id: 'MISS_TEST_004',
          objective: 'HERRERIAS en CABA',
          entity_type: 'ESTABLISHMENT',
          geography: 'ARG_CABA',
          target_new_records: 100,
          environment: 'PRODUCTION',
          status: 'NO_NEW_MIXED',
          terminal_reason: 'NO_NEW_MIXED',
          error_message: 'Candidatos divididos entre duplicados y descartes de calidad.',
          scanned_count: 30,
          discovered_count: 30,
          verified_count: 15,
          qualified_count: 0,
          true_net_new_count: 0,
          persisted_count: 0,
          searchable_count: 0,
          duplicate_existing_count: 15,
          rejected_count: 15,
          certified_new_searchable: 0,
          target_reached: false,
          speed_records_per_sec: 3,
          elapsed_seconds: 9,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString()
        },
        expectedPill: 'ℹ️ SIN NUEVOS REGISTROS',
        expectedTitle: 'Candidatos existentes o no certificados',
        cannotContainCancelled: true
      },
      {
        id: '5. COMPLETED_WITH_NEW_ROWS',
        metrics: {
          mission_id: 'MISS_TEST_005',
          objective: 'PANADERIAS en CABA',
          entity_type: 'ESTABLISHMENT',
          geography: 'ARG_CABA',
          target_new_records: 25,
          environment: 'PRODUCTION',
          status: 'COMPLETED_WITH_NEW_ROWS',
          terminal_reason: 'COMPLETED_WITH_NEW_ROWS',
          error_message: null,
          scanned_count: 30,
          discovered_count: 30,
          verified_count: 25,
          qualified_count: 25,
          true_net_new_count: 25,
          persisted_count: 25,
          searchable_count: 25,
          duplicate_existing_count: 2,
          rejected_count: 3,
          certified_new_searchable: 25,
          target_reached: true,
          speed_records_per_sec: 5,
          elapsed_seconds: 5,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString()
        },
        expectedPill: '✓ MISIÓN CUMPLIDA',
        expectedTitle: '¡Misión cumplida con éxito!',
        cannotContainCancelled: true
      },
      {
        id: '6. USER_CANCELLED',
        metrics: {
          mission_id: 'MISS_TEST_006',
          objective: 'CARNICERIAS en CABA',
          entity_type: 'ESTABLISHMENT',
          geography: 'ARG_CABA',
          target_new_records: 100,
          environment: 'PRODUCTION',
          status: 'USER_CANCELLED',
          terminal_reason: 'USER_CANCELLED_WITH_EXPLICIT_USER_ACTION',
          cancel_origin: 'USER_EXPLICIT',
          error_message: 'Cancelaste la búsqueda manualmente.',
          scanned_count: 10,
          discovered_count: 10,
          verified_count: 2,
          qualified_count: 2,
          true_net_new_count: 2,
          persisted_count: 2,
          searchable_count: 2,
          duplicate_existing_count: 1,
          rejected_count: 7,
          certified_new_searchable: 2,
          target_reached: false,
          speed_records_per_sec: 1,
          elapsed_seconds: 3,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString()
        },
        expectedPill: '✕ CANCELADA',
        expectedTitle: 'Cancelada por el usuario',
        cannotContainCancelled: false
      },
      {
        id: '7. UNKNOWN_TERMINAL_REASON',
        metrics: {
          mission_id: 'MISS_TEST_007',
          objective: 'PRUEBA ESTADO DESCONOCIDO',
          entity_type: 'ESTABLISHMENT',
          geography: 'ARG_CABA',
          target_new_records: 100,
          environment: 'PRODUCTION',
          status: 'FUTURE_EDGE_CONDITION_ALPHA',
          terminal_reason: 'FUTURE_EDGE_CONDITION_ALPHA',
          error_message: 'Detalle de condición futura no documentada.',
          scanned_count: 0,
          discovered_count: 0,
          verified_count: 0,
          qualified_count: 0,
          true_net_new_count: 0,
          persisted_count: 0,
          searchable_count: 0,
          duplicate_existing_count: 0,
          rejected_count: 0,
          certified_new_searchable: 0,
          target_reached: false,
          speed_records_per_sec: 0,
          elapsed_seconds: 2,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString()
        },
        expectedPill: '⚠️ ESTADO: FUTURE_EDGE_CONDITION_ALPHA',
        expectedTitle: 'Estado de misión no reconocido',
        cannotContainCancelled: true
      },
      {
        id: '8. SOURCE_FRONTIER_EXHAUSTED',
        metrics: {
          mission_id: 'MISS_TEST_008',
          objective: 'PLAZAS en CABA',
          entity_type: 'ESTABLISHMENT',
          geography: 'ARG_CABA',
          target_new_records: 100,
          environment: 'PRODUCTION',
          status: 'SOURCE_FRONTIER_EXHAUSTED',
          terminal_reason: 'SOURCE_FRONTIER_EXHAUSTED_WITH_PROOF',
          error_message: 'Se exploraron todas las fuentes disponibles.',
          scanned_count: 15,
          discovered_count: 15,
          verified_count: 0,
          qualified_count: 0,
          true_net_new_count: 0,
          persisted_count: 0,
          searchable_count: 0,
          duplicate_existing_count: 0,
          rejected_count: 0,
          certified_new_searchable: 0,
          target_reached: false,
          speed_records_per_sec: 1,
          elapsed_seconds: 4,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString()
        },
        expectedPill: '⚠️ FUENTES AGOTADAS',
        expectedTitle: 'Fuentes públicas analizadas sin resultados nuevos',
        cannotContainCancelled: true
      },
      {
        id: '9. ALL_EXECUTABLE_SOURCES_FAILED',
        metrics: {
          mission_id: 'MISS_TEST_009',
          objective: 'HOSPITALES en CABA',
          entity_type: 'ESTABLISHMENT',
          geography: 'ARG_CABA',
          target_new_records: 100,
          environment: 'PRODUCTION',
          status: 'ALL_EXECUTABLE_SOURCES_TECHNICALLY_FAILED',
          terminal_reason: 'ALL_EXECUTABLE_SOURCES_TECHNICALLY_FAILED',
          error_message: 'Conectores agotados por error HTTP 500.',
          scanned_count: 0,
          discovered_count: 0,
          verified_count: 0,
          qualified_count: 0,
          true_net_new_count: 0,
          persisted_count: 0,
          searchable_count: 0,
          duplicate_existing_count: 0,
          rejected_count: 0,
          certified_new_searchable: 0,
          target_reached: false,
          speed_records_per_sec: 0,
          elapsed_seconds: 3,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString()
        },
        expectedPill: '✕ FALLO TÉCNICO',
        expectedTitle: 'Fallo técnico en las fuentes ejecutables',
        cannotContainCancelled: true
      },
      {
        id: '10. EXECUTION_PIPELINE_FAILURE',
        metrics: {
          mission_id: 'MISS_TEST_010',
          objective: 'AEROPUERTOS en ARGENTINA',
          entity_type: 'ESTABLISHMENT',
          geography: 'ARG_NACIONAL',
          target_new_records: 100,
          environment: 'PRODUCTION',
          status: 'EXECUTION_PIPELINE_FAILURE',
          terminal_reason: 'EXECUTION_PIPELINE_FAILURE',
          error_message: 'Fallo en pipeline de parseo.',
          scanned_count: 0,
          discovered_count: 0,
          verified_count: 0,
          qualified_count: 0,
          true_net_new_count: 0,
          persisted_count: 0,
          searchable_count: 0,
          duplicate_existing_count: 0,
          rejected_count: 0,
          certified_new_searchable: 0,
          target_reached: false,
          speed_records_per_sec: 0,
          elapsed_seconds: 3,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString()
        },
        expectedPill: '✕ FALLO TÉCNICO',
        expectedTitle: 'Fallo en el pipeline de ejecución de la fuente',
        cannotContainCancelled: true
      },
      {
        id: '11. FAILED',
        metrics: {
          mission_id: 'MISS_TEST_011',
          objective: 'PRUEBA FALLIDA',
          entity_type: 'ESTABLISHMENT',
          geography: 'ARG_CABA',
          target_new_records: 100,
          environment: 'PRODUCTION',
          status: 'FAILED',
          terminal_reason: 'FAILED',
          error_message: 'Error inesperado de base de datos.',
          scanned_count: 0,
          discovered_count: 0,
          verified_count: 0,
          qualified_count: 0,
          true_net_new_count: 0,
          persisted_count: 0,
          searchable_count: 0,
          duplicate_existing_count: 0,
          rejected_count: 0,
          certified_new_searchable: 0,
          target_reached: false,
          speed_records_per_sec: 0,
          elapsed_seconds: 2,
          started_at: new Date().toISOString(),
          completed_at: new Date().toISOString()
        },
        expectedPill: '✕ ERROR',
        expectedTitle: 'No se pudo completar la búsqueda',
        cannotContainCancelled: true
      }
    ];

    const testResults = [];

    for (const tc of testMissions) {
      const isTerminal = isTerminalStatus(tc.metrics.status, tc.metrics.terminal_reason);
      const pillLabel = getMissionStatusPillLabel(tc.metrics);
      const pillClass = getMissionStatusPillClass(tc.metrics);

      // Inspect React element props directly
      const vnode = renderMissionTerminalState(tc.metrics);
      const title = vnode.props?.children?.[1]?.props?.children?.[0]?.props?.children || '';
      const message = vnode.props?.children?.[1]?.props?.children?.[1]?.props?.children || '';
      const diagBadge = vnode.props?.children?.[1]?.props?.children?.[2]?.props?.children?.[0]?.props?.children || '';
      const titleStr = typeof title === 'string' ? title : JSON.stringify(title);
      const messageStr = typeof message === 'string' ? message : JSON.stringify(message);

      const hasCancelled = titleStr.toLowerCase().includes('cancelad') || messageStr.toLowerCase().includes('cancelad');

      const pillMatch = pillLabel === tc.expectedPill;
      const titleMatch = titleStr.includes(tc.expectedTitle);
      const cancelledSafety = !tc.cannotContainCancelled || !hasCancelled;

      testResults.push({
        id: tc.id,
        isTerminal,
        pillLabel,
        pillMatch,
        title: titleStr,
        titleMatch,
        message: messageStr,
        diagBadge,
        hasCancelled,
        cancelledSafety,
        pass: isTerminal && pillMatch && titleMatch && cancelledSafety
      });
    }

    return testResults;
  });

  console.log('RESULTS OF ALL 11 TERMINAL STATE TESTS:');
  let allPass = true;
  for (const r of results) {
    console.log(`- [${r.pass ? 'PASS' : 'FAIL'}] ${r.id}:`);
    console.log(`    Pill: "${r.pillLabel}" (Match: ${r.pillMatch})`);
    console.log(`    Title: "${r.title}" (Match: ${r.titleMatch})`);
    console.log(`    Message: "${r.message.slice(0, 80)}"`);
    console.log(`    Cancelled Safety: ${r.cancelledSafety} (hasCancelled: ${r.hasCancelled})`);
    if (!r.pass) allPass = false;
  }

  console.log(`\nALL_TERMINAL_BROWSER_CASES = ${results.length}`);
  console.log(`ALL_TERMINAL_BROWSER_PASS = ${allPass}`);

  await browser.close();
  if (!allPass) process.exit(1);
}

testAllTerminalStates().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
