import { chromium } from 'playwright';

async function runBeforeTest() {
  console.log('--- REPRODUCING GARAGE CABA BEFORE FIX ---');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  page.on('console', msg => console.log('BROWSER_LOG:', msg.text()));

  await page.goto('http://localhost:5175/buscaindustrial', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#bi-ampliar-base-tab', { timeout: 10000 });
  await page.click('#bi-ampliar-base-tab');
  await page.waitForSelector('#idm-objective-input', { timeout: 6000 });

  await page.fill('#idm-objective-input', 'GARAGE CABA');
  await page.waitForTimeout(2000);

  const chip = page.locator('.idm-ambiguity-card button').first();
  if (await chip.isVisible({ timeout: 2000 }).catch(() => false)) {
    await chip.click();
    await page.waitForTimeout(1000);
  }

  const buscarBtn = page.locator('#idm-btn-100k-buscar');
  await buscarBtn.waitFor({ state: 'visible', timeout: 10000 });
  await buscarBtn.click();

  await page.waitForSelector('#idm-btn-confirm-start', { timeout: 15000 });
  await page.click('#idm-btn-confirm-start');

  await page.waitForSelector('.idm-progress-body', { timeout: 12000 });

  // Poll until status stops being RUNNING / STARTING
  console.log('Polling progress DOM...');
  let terminalReached = false;
  let statusText = '';
  let terminalReason = '';
  let modalText = '';
  let bannerText = '';

  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(1000);
    const pill = await page.locator('.idm-status-pill').textContent().catch(() => '');
    const body = await page.locator('.idm-progress-body').textContent().catch(() => '');
    const banners = await page.locator('.idm-success-banner, .idm-warning-banner, .idm-info-banner').allTextContents().catch(() => []);

    statusText = pill?.trim() || '';
    modalText = body || '';
    bannerText = banners.join(' | ');

    console.log(`[Tick ${i}] StatusPill: "${statusText}" | Banners: "${bannerText}"`);

    if (statusText && !statusText.includes('INICIANDO') && !statusText.includes('EJECUCIÓN') && !statusText.includes('VALIDANDO') && !statusText.includes('BUSCANDO') && !statusText.includes('AMPLIANDO')) {
      terminalReached = true;
      break;
    }
  }

  // Also query latest mission from API to get backend truth
  const missionRes = await fetch('http://localhost:5174/api/industrial/missions/latest').then(r => r.json()).catch(() => null);
  const m = missionRes?.mission;

  console.log('--- BEFORE TEST RESULTS ---');
  console.log('MISSION_ID:', m?.mission_id);
  console.log('BEFORE_STATUS_PILL:', statusText);
  console.log('BEFORE_TERMINAL_REASON:', m?.terminal_reason);
  console.log('BEFORE_ERROR_MESSAGE:', m?.error_message);
  console.log('BEFORE_BANNER_TEXT:', bannerText);
  console.log('HAS_CANCELLED_TEXT:', modalText.includes('cancelad') || modalText.includes('Cancelad'));
  console.log('MODAL_BODY_SNIPPET:', modalText.replace(/\s+/g, ' ').slice(0, 300));

  await browser.close();
}

runBeforeTest().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
