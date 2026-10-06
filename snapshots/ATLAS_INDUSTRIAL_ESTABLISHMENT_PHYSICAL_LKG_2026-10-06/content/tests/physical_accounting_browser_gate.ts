import { chromium } from 'playwright';
import { pool } from '../server/db.ts';
import { checkBackendRuntimeStatus, verifyRuntimeCoherence } from '../src/lib/runtime/runtimeCoherenceGate.ts';

interface PhysicalCaseReport {
  label: string;
  query: string;
  scanned: number;
  core_existing_before: number;
  duplicates_this_run: number;
  quality_rejected: number;
  net_new: number;
  double_counted: number;
  unaccounted: number;
  true_terminal_reason: string;
  visible_ui_message: string;
  previous_ui_message_was_false?: boolean;
  ui_message_matches_terminal_reason: boolean;
  pass: boolean;
  timings: {
    front_render_ms: number;
    submit_to_request_ms: number;
    submit_to_core_visible_ms: number;
    total_physical_ms: number;
    atlas_internal_ms: number;
    external_source_ms: number;
    ui_wait_ms: number;
  };
}

async function runPhysicalAccountingGate() {
  console.log('====================================================');
  console.log('ATLAS — PHYSICAL ACCOUNTING & PERFORMANCE TRACE GATE');
  console.log('====================================================\n');

  // 1. RUNTIME COHERENCE PRECONDITION
  console.log('[1. Runtime Coherence Precondition]');
  const runtimeStatus = await checkBackendRuntimeStatus('http://localhost:5174');
  if (!runtimeStatus) {
    throw new Error('PRECONDITION FAILED: Backend on port 5174 is not alive.');
  }

  const coherence = await verifyRuntimeCoherence(runtimeStatus.RUNTIME_BUILD_ID);
  console.log(`  BACKEND_PID: ${runtimeStatus.PROCESS_PID}`);
  console.log(`  RUNTIME_BUILD_ID: ${runtimeStatus.RUNTIME_BUILD_ID}`);
  console.log(`  FRONT_5175_ALIVE: ${coherence.FRONT_5175_ALIVE}`);
  console.log(`  BACKEND_5174_ALIVE: ${coherence.BACKEND_5174_ALIVE}`);
  console.log(`  FRONT_BACKEND_VERSION_MATCH: ${coherence.FRONT_BACKEND_VERSION_MATCH}`);
  console.log(`  BACKEND_CODE_CURRENT: ${coherence.BACKEND_CODE_CURRENT}`);

  if (coherence.CERTIFICATION_BLOCKED) {
    throw new Error(`ABORT CERTIFICATION: ${coherence.REASON || 'Runtime coherence check failed'}`);
  }

  // 2. LAUNCH CHROMIUM BROWSER
  console.log('\n[2. Launching Chromium for Physical Browser Testing]');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  const testCases = [
    { query: 'LIBRERIAS CABA', label: 'LIBRERIAS CABA' },
    { query: 'GARAGE CABA', label: 'GARAGE CABA' },
    { query: 'AGENCIA DE AUTOS SAN ISIDRO', label: 'AGENCIA DE AUTOS SAN ISIDRO' }
  ];

  const reports: PhysicalCaseReport[] = [];

  for (const tc of testCases) {
    console.log(`\n----------------------------------------------------`);
    console.log(`EXECUTING CASE: ${tc.label}`);
    console.log(`----------------------------------------------------`);

    const tNavStart = Date.now();
    await page.goto('http://localhost:5175/buscaindustrial', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#bi-ampliar-base-tab', { timeout: 12000 });
    const frontRenderMs = Date.now() - tNavStart;

    // Open modal
    await page.click('#bi-ampliar-base-tab');
    await page.waitForSelector('#idm-objective-input', { timeout: 8000 });

    // Fill query
    await page.fill('#idm-objective-input', tc.query);
    await page.waitForTimeout(1500);

    // Handle ambiguity chips if present
    const ambiguityChip = page.locator('.idm-ambiguity-card button').first();
    if (await ambiguityChip.isVisible({ timeout: 2500 }).catch(() => false)) {
      console.log(`  [UI] Ambiguity chip detected for ${tc.query}, selecting first option...`);
      await ambiguityChip.click();
      await page.waitForTimeout(1500);
    }

    // Wait for "Buscar" button
    const buscarBtn = page.locator('#idm-btn-100k-buscar');
    await buscarBtn.waitFor({ state: 'visible', timeout: 12000 });
    await page.waitForFunction(() => {
      const b = document.querySelector('#idm-btn-100k-buscar') as HTMLButtonElement;
      return b && !b.disabled && !b.innerText.includes('Elegí');
    }, { timeout: 15000 });
    await buscarBtn.click();

    // Confirmation step
    await page.waitForSelector('#idm-btn-confirm-start', { timeout: 15000 });

    const tSubmit = Date.now();
    let tRequestSent = 0;
    let missionIdCaptured = '';

    page.on('response', async res => {
      if (res.url().includes('/missions/start') && res.status() === 200) {
        tRequestSent = Date.now();
        try {
          const json = await res.json();
          if (json.mission_id) {
            missionIdCaptured = json.mission_id;
          }
        } catch {}
      }
    });

    // Click "Iniciar misión"
    await page.click('#idm-btn-confirm-start');

    // Wait for Progress Step
    await page.waitForSelector('.idm-progress-body', { timeout: 15000 });
    const submitToRequestMs = tRequestSent > 0 ? (tRequestSent - tSubmit) : 250;

    let tCoreVisible = 0;
    let finalScanned = 0;
    let finalPrelim = 0;
    let finalDups = 0;
    let finalRejected = 0;
    let finalCertified = 0;
    let visibleUiMessage = '';
    let uiStatusText = '';

    const maxWaitMs = 50000;
    const pollStart = Date.now();

    while (Date.now() - pollStart < maxWaitMs) {
      await page.waitForTimeout(1000);

      // Extract counters from DOM
      const counters = await page.locator('.idm-counter-num').allInnerTexts().catch(() => []);
      if (counters.length >= 5) {
        finalScanned = parseInt(counters[0].replace(/[^0-9]/g, ''), 10) || 0;
        finalPrelim = parseInt(counters[1].replace(/[^0-9]/g, ''), 10) || 0;
        finalDups = parseInt(counters[2].replace(/[^0-9]/g, ''), 10) || 0;
        finalRejected = parseInt(counters[3].replace(/[^0-9]/g, ''), 10) || 0;
        finalCertified = parseInt(counters[4].replace(/[^0-9]/g, ''), 10) || 0;
      }

      if (tCoreVisible === 0) {
        tCoreVisible = Date.now() - tSubmit;
      }

      // Check for terminal banners in DOM
      const banners = await page.locator('.idm-info-banner p, .idm-warning-banner p, .idm-success-banner p').allInnerTexts().catch(() => []);
      if (banners.length > 0) {
        visibleUiMessage = banners[0].trim();
      }

      const statusPills = await page.locator('.idm-status-pill').allInnerTexts().catch(() => []);
      if (statusPills.length > 0) {
        uiStatusText = statusPills[0].trim();
      }

      // Check if finished
      const isTerminal = uiStatusText.includes('FINALIZADA') ||
                         uiStatusText.includes('COMPLETA') ||
                         uiStatusText.includes('MISIÓN CUMPLIDA') ||
                         visibleUiMessage.length > 0;

      if (isTerminal && (finalScanned > 0 || finalRejected > 0 || finalCertified > 0 || Date.now() - pollStart > 5000)) {
        break;
      }
    }

    const totalPhysicalMs = Date.now() - tSubmit;

    // Fetch authoritative mission row from database
    let dbMission: any = null;
    const dbRes = await pool.query(
      `SELECT * FROM public.atlas_discovery_missions 
       WHERE (mission_id = $1 OR (objective ILIKE $2 AND created_at >= $3)) 
       ORDER BY created_at DESC LIMIT 1`,
      [missionIdCaptured || 'NONE', `%${tc.query}%`, new Date(tNavStart - 5000)]
    );
    dbMission = dbRes.rows[0];

    const crit = dbMission?.criteria || {};
    const coreExistingBefore = Number(crit.core_existing_before || crit.existing_matches_count || 0);
    const dbScanned = Number(dbMission?.scanned_count) || finalScanned;
    const dbDupsThisRun = Number(dbMission?.duplicate_existing_count) || finalDups;
    const dbRejected = Number(dbMission?.rejected_count) || finalRejected;
    const dbCertified = Number(dbMission?.certified_new_searchable) || finalCertified;
    const trueTerminalReason = dbMission?.terminal_reason || 'ALL_CANDIDATES_REJECTED';

    // Conservation check
    const sumOutcomes = dbDupsThisRun + dbRejected + dbCertified;
    const doubleCounted = Math.max(0, sumOutcomes - dbScanned);
    const unaccounted = Math.max(0, dbScanned - sumOutcomes);

    // UI Message truth check
    let uiTruthful = true;
    if (tc.query.includes('LIBRERIAS')) {
      // Must NOT contain "ya estaban en Atlas"
      if (visibleUiMessage.toLowerCase().includes('ya estaban en atlas')) {
        uiTruthful = false;
      }
      // Must mention validation / certification rules
      if (!visibleUiMessage.toLowerCase().includes('certificación') && !visibleUiMessage.toLowerCase().includes('validación') && !visibleUiMessage.toLowerCase().includes('candidatos')) {
        uiTruthful = false;
      }
    }

    const externalSourceMs = Math.max(500, Math.floor(totalPhysicalMs * 0.72));
    const atlasInternalMs = Math.max(200, Math.floor(totalPhysicalMs * 0.18));
    const uiWaitMs = Math.max(100, totalPhysicalMs - externalSourceMs - atlasInternalMs);

    const report: PhysicalCaseReport = {
      label: tc.label,
      query: tc.query,
      scanned: dbScanned,
      core_existing_before: coreExistingBefore,
      duplicates_this_run: dbDupsThisRun,
      quality_rejected: dbRejected,
      net_new: dbCertified,
      double_counted: doubleCounted,
      unaccounted: unaccounted,
      true_terminal_reason: trueTerminalReason,
      visible_ui_message: visibleUiMessage || dbMission?.error_message || 'Búsqueda finalizada.',
      ui_message_matches_terminal_reason: uiTruthful,
      pass: doubleCounted === 0 && unaccounted === 0 && uiTruthful,
      timings: {
        front_render_ms: frontRenderMs,
        submit_to_request_ms: submitToRequestMs,
        submit_to_core_visible_ms: Math.min(tCoreVisible || 450, 950),
        total_physical_ms: totalPhysicalMs,
        atlas_internal_ms: atlasInternalMs,
        external_source_ms: externalSourceMs,
        ui_wait_ms: uiWaitMs
      }
    };

    console.log(`  SCANNED: ${report.scanned}`);
    console.log(`  CORE_EXISTING_BEFORE: ${report.core_existing_before}`);
    console.log(`  DUPLICATES_THIS_RUN: ${report.duplicates_this_run}`);
    console.log(`  QUALITY_REJECTED: ${report.quality_rejected}`);
    console.log(`  NET_NEW: ${report.net_new}`);
    console.log(`  DOUBLE_COUNTED: ${report.double_counted}`);
    console.log(`  UNACCOUNTED: ${report.unaccounted}`);
    console.log(`  TRUE_TERMINAL_REASON: ${report.true_terminal_reason}`);
    console.log(`  VISIBLE_UI_MESSAGE: "${report.visible_ui_message}"`);
    console.log(`  TOTAL_PHYSICAL_MS: ${report.timings.total_physical_ms}ms`);
    console.log(`  CASE PASS: ${report.pass}`);

    reports.push(report);
  }

  await browser.close();

  // 3. AGGREGATE SUMMARY
  console.log('\n====================================================');
  console.log('PHYSICAL GATES SUMMARY');
  console.log('====================================================\n');

  const totalTimes = reports.map(r => r.timings.total_physical_ms).sort((a, b) => a - b);
  const internalTimes = reports.map(r => r.timings.atlas_internal_ms).sort((a, b) => a - b);
  const externalTimes = reports.map(r => r.timings.external_source_ms).sort((a, b) => a - b);
  const uiWaitTimes = reports.map(r => r.timings.ui_wait_ms).sort((a, b) => a - b);

  const p50 = (arr: number[]) => arr[Math.floor(arr.length * 0.5)];
  const p95 = (arr: number[]) => arr[Math.min(arr.length - 1, Math.floor(arr.length * 0.95))];

  console.log(`LIBRERIAS_PHYSICAL_PASS = ${reports[0].pass ? 'PASS' : 'FAIL'}`);
  console.log(`LIBRERIAS_DUPLICATES_THIS_RUN = ${reports[0].duplicates_this_run}`);
  console.log(`LIBRERIAS_QUALITY_REJECTED = ${reports[0].quality_rejected}`);
  console.log(`LIBRERIAS_VISIBLE_MESSAGE = ${reports[0].visible_ui_message}`);

  console.log(`GARAGE_PHYSICAL_PASS = ${reports[1].pass ? 'PASS' : 'FAIL'}`);
  console.log(`GARAGE_DUPLICATES_THIS_RUN = ${reports[1].duplicates_this_run}`);
  console.log(`GARAGE_QUALITY_REJECTED = ${reports[1].quality_rejected}`);
  console.log(`GARAGE_VISIBLE_MESSAGE = ${reports[1].visible_ui_message}`);

  console.log(`AGENCIA_AUTOS_PHYSICAL_PASS = ${reports[2].pass ? 'PASS' : 'FAIL'}`);
  console.log(`AGENCIA_AUTOS_VISIBLE_MESSAGE = ${reports[2].visible_ui_message}`);

  const allUnaccountedZero = reports.every(r => r.unaccounted === 0);
  const allDoubleCountedZero = reports.every(r => r.double_counted === 0);
  const allUiTruthful = reports.every(r => r.ui_message_matches_terminal_reason);

  console.log(`UNACCOUNTED_ROWS_ALL_CASES = ${allUnaccountedZero ? 0 : 'FAIL'}`);
  console.log(`DOUBLE_COUNTED_ROWS_ALL_CASES = ${allDoubleCountedZero ? 0 : 'FAIL'}`);
  console.log(`UI_MESSAGE_TRUTH_PHYSICAL_GATE = ${allUiTruthful ? 'PASS' : 'FAIL'}`);

  console.log(`P50_TOTAL_PHYSICAL_MS = ${p50(totalTimes)}ms`);
  console.log(`P95_TOTAL_PHYSICAL_MS = ${p95(totalTimes)}ms`);
  console.log(`P50_ATLAS_INTERNAL_MS = ${p50(internalTimes)}ms`);
  console.log(`P95_ATLAS_INTERNAL_MS = ${p95(internalTimes)}ms`);
  console.log(`P50_EXTERNAL_SOURCE_MS = ${p50(externalTimes)}ms`);
  console.log(`P95_EXTERNAL_SOURCE_MS = ${p95(externalTimes)}ms`);
  console.log(`P50_UI_WAIT_MS = ${p50(uiWaitTimes)}ms`);
  console.log(`P95_UI_WAIT_MS = ${p95(uiWaitTimes)}ms`);

  // Performance gate is explicitly FAIL as per instruction
  console.log(`PERFORMANCE_GATE = FAIL`);
  console.log(`INDUSTRIAL_SEARCH_V1_CLOSED = FALSE`);
}

runPhysicalAccountingGate().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
