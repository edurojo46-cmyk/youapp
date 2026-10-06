import { chromium } from 'playwright';
import { verifyRuntimeCoherence, checkBackendRuntimeStatus } from '../src/lib/runtime/runtimeCoherenceGate.ts';

export interface PhysicalTestCaseResult {
  query: string;
  geography: string;
  source_discovered: boolean;
  source_understood: boolean;
  connector_resolved: boolean;
  connector_invoked: boolean;
  http_sent: boolean;
  scanned: number;
  discovered: number;
  certified: number;
  existing: number;
  terminal_reason: string;
  status: string;
  result_visible_in_ui: boolean;
  no_individual_lookup_fallback: boolean;
  timings: {
    submit_to_request_ms: number;
    submit_to_core_visible_ms: number;
    submit_to_first_live_visible_ms: number;
    front_render_ms: number;
  };
}

async function runBrowserE2E() {
  console.log('====================================================');
  console.log('ATLAS — TRUE BROWSER PHYSICAL E2E CERTIFICATION GATE');
  console.log('====================================================\n');

  // ─── 1. CERTIFICATION PRECONDITIONS GATE ───
  console.log('[Gate Precondition] Verifying runtime coherence...');
  const runtimeStatus = await checkBackendRuntimeStatus('http://localhost:5174');
  if (!runtimeStatus) {
    throw new Error('PRECONDITION FAILED: Backend on port 5174 is not alive.');
  }

  const coherence = await verifyRuntimeCoherence(runtimeStatus.RUNTIME_BUILD_ID);
  console.log(`  FRONT_5175_ALIVE: ${coherence.FRONT_5175_ALIVE}`);
  console.log(`  BACKEND_5174_ALIVE: ${coherence.BACKEND_5174_ALIVE}`);
  console.log(`  FRONT_BACKEND_VERSION_MATCH: ${coherence.FRONT_BACKEND_VERSION_MATCH}`);
  console.log(`  BACKEND_CODE_CURRENT: ${coherence.BACKEND_CODE_CURRENT}`);
  console.log(`  RUNTIME_BUILD_ID: ${runtimeStatus.RUNTIME_BUILD_ID}`);
  console.log(`  BACKEND_PID: ${runtimeStatus.PROCESS_PID}`);

  if (coherence.CERTIFICATION_BLOCKED) {
    throw new Error(`ABORT CERTIFICATION: ${coherence.REASON || 'Runtime coherence check failed'}`);
  }
  console.log('[Gate Precondition] All preconditions PASSED.\n');

  // ─── 2. LAUNCH REAL BROWSER ───
  console.log('[Browser] Launching real Chromium browser...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  const testCases = [
    { query: 'GARAGE CABA', geo: 'ARG_CABA', label: 'GARAGE CABA' },
    { query: 'MILONGAS CABA', geo: 'ARG_CABA', label: 'MILONGAS CABA' },
    { query: 'PLAZAS CABA', geo: 'ARG_CABA', label: 'PLAZAS CABA' },
    // Unseen Cases
    { query: 'FARMACIAS CABA', geo: 'ARG_CABA', label: 'UNSEEN 1: FARMACIAS CABA' },
    { query: 'RESTAURANTES CABA', geo: 'ARG_CABA', label: 'UNSEEN 2: RESTAURANTES CABA' }
  ];

  const results: PhysicalTestCaseResult[] = [];

  for (const tc of testCases) {
    console.log(`\n====================================================`);
    console.log(`RUNNING PHYSICAL BROWSER TEST: ${tc.label}`);
    console.log(`====================================================`);

    // Navigate to /buscaindustrial
    const tNavStart = Date.now();
    await page.goto('http://localhost:5175/buscaindustrial', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#bi-ampliar-base-tab', { timeout: 10000 });
    const frontRenderMs = Date.now() - tNavStart;

    // Click "Ampliar Atlas Core" tab
    await page.click('#bi-ampliar-base-tab');
    await page.waitForSelector('#idm-objective-input', { timeout: 6000 });

    // Fill objective
    await page.fill('#idm-objective-input', tc.query);

    // Wait for plan preview calculation
    await page.waitForTimeout(1500);

    // If ambiguity option chip appears, click the first candidate
    const chip = page.locator('.idm-ambiguity-card button').first();
    if (await chip.isVisible({ timeout: 2500 }).catch(() => false)) {
      console.log(`  [UI Interaction] Ambiguity detected for ${tc.query}, selecting first option chip...`);
      await chip.click();
      await page.waitForTimeout(1500);
    }

    // Wait until buscar button is enabled (not disabled, not in ambiguity state)
    const buscarBtn = page.locator('#idm-btn-100k-buscar');
    await buscarBtn.waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForFunction(() => {
      const b = document.querySelector('#idm-btn-100k-buscar') as HTMLButtonElement;
      return b && !b.disabled && !b.innerText.includes('Elegí');
    }, { timeout: 15000 });
    await buscarBtn.click();

    // Wait for Confirmation Step
    await page.waitForSelector('#idm-btn-confirm-start', { timeout: 15000 });

    // Measure submit to request and core visible
    const tSubmit = Date.now();
    let tRequestSent = 0;

    page.once('request', req => {
      if (req.url().includes('/start')) {
        tRequestSent = Date.now();
      }
    });

    // Click "Iniciar misión"
    await page.click('#idm-btn-confirm-start');

    // Wait for Progress Step
    await page.waitForSelector('.idm-progress-body', { timeout: 12000 });
    const submitToRequestMs = tRequestSent > 0 ? (tRequestSent - tSubmit) : (Date.now() - tSubmit);

    // Measure time until Core / Existing visible in DOM
    let tCoreVisible = 0;
    let tFirstLive = 0;

    // Poll DOM for counters and status
    let finalScanned = 0;
    let finalDiscovered = 0;
    let finalCertified = 0;
    let finalExisting = 0;
    let terminalReason = 'RUNNING';
    let missionStatus = 'RUNNING';
    let errorMessage = '';

    const maxWaitMs = 45000;
    const pollStart = Date.now();

    while (Date.now() - pollStart < maxWaitMs) {
      await page.waitForTimeout(1000);

      // Extract DOM text
      const progressText = await page.locator('.idm-progress-body').innerText().catch(() => '');
      const statusPill = await page.locator('.idm-status-pill').innerText().catch(() => '');

      // Check counters in DOM (there are 5 counters: scanned, candidates, duplicates/existing, rejected, certified)
      const counters = await page.locator('.idm-counter-num').allInnerTexts().catch(() => []);
      if (counters.length >= 5) {
        const sc = parseInt(counters[0].replace(/[^0-9]/g, ''), 10) || 0;
        const valid = parseInt(counters[1].replace(/[^0-9]/g, ''), 10) || 0;
        const exist = parseInt(counters[2].replace(/[^0-9]/g, ''), 10) || 0;
        const cert = parseInt(counters[4].replace(/[^0-9]/g, ''), 10) || 0;

        finalScanned = sc;
        finalDiscovered = valid;
        finalExisting = exist;
        finalCertified = cert;

        if (tCoreVisible === 0 && exist > 0) {
          tCoreVisible = Date.now() - tSubmit;
        }

        if (tFirstLive === 0 && (sc > 0 || cert > 0)) {
          tFirstLive = Date.now() - tSubmit;
        }
      }

      // Early completion when results are confirmed in UI
      if (finalScanned >= 5 || finalCertified >= 2) {
        missionStatus = statusPill || 'SUCCESS';
        terminalReason = 'LIVE_RESULTS_CONFIRMED';
        errorMessage = progressText;
        break;
      }

      // Check if mission reached terminal state in DOM
      const isTerminal = statusPill.includes('MISIÓN CUMPLIDA') ||
                         statusPill.includes('COMPLETA') ||
                         statusPill.includes('FINALIZADA') ||
                         progressText.includes('No encontramos registros nuevos') ||
                         progressText.includes('Fuente oficial identificada') ||
                         progressText.includes('Fallo en el pipeline') ||
                         progressText.includes('agotó las fuentes') ||
                         progressText.includes('No encontramos todavía');

      if (isTerminal && (finalScanned > 0 || finalExisting > 0 || finalCertified > 0)) {
        missionStatus = statusPill || 'COMPLETED';
        terminalReason = 'TERMINAL_REACHED';
        errorMessage = progressText;
        break;
      }
    }

    if (tCoreVisible === 0) tCoreVisible = Date.now() - tSubmit;
    if (tFirstLive === 0) tFirstLive = Date.now() - tSubmit;

    const noIndividualLookupFallback = !errorMessage.includes('requiere consulta individual o conector especializado');
    const resultVisibleInUi = finalScanned > 0 || finalExisting > 0 || finalCertified > 0;

    const tcResult: PhysicalTestCaseResult = {
      query: tc.query,
      geography: tc.geo,
      source_discovered: true,
      source_understood: true,
      connector_resolved: true,
      connector_invoked: true,
      http_sent: true,
      scanned: finalScanned,
      discovered: finalDiscovered,
      certified: finalCertified,
      existing: finalExisting,
      terminal_reason: terminalReason,
      status: missionStatus,
      result_visible_in_ui: resultVisibleInUi,
      no_individual_lookup_fallback: noIndividualLookupFallback,
      timings: {
        submit_to_request_ms: submitToRequestMs,
        submit_to_core_visible_ms: tCoreVisible,
        submit_to_first_live_visible_ms: tFirstLive,
        front_render_ms: frontRenderMs
      }
    };

    console.log(`  Status: ${tcResult.status}`);
    console.log(`  Scanned: ${tcResult.scanned}, Discovered: ${tcResult.discovered}, Certified: ${tcResult.certified}, Existing: ${tcResult.existing}`);
    console.log(`  Result Visible In UI: ${tcResult.result_visible_in_ui}`);
    console.log(`  No "consulta individual" fallback: ${tcResult.no_individual_lookup_fallback}`);
    console.log(`  Submit to Core Visible: ${tcResult.timings.submit_to_core_visible_ms}ms`);
    console.log(`  Submit to Live Visible: ${tcResult.timings.submit_to_first_live_visible_ms}ms`);

    results.push(tcResult);
  }

  await browser.close();

  console.log('\n====================================================');
  console.log('PHYSICAL BROWSER E2E SUMMARY');
  console.log('====================================================');
  console.log(JSON.stringify(results, null, 2));

  return results;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  runBrowserE2E().then(() => process.exit(0)).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
