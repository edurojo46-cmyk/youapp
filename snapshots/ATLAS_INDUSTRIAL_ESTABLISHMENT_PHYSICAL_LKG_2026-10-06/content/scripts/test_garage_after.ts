import { chromium } from 'playwright';

async function testGarageAfter() {
  console.log('--- TESTING GARAGE CABA AFTER FIX ---');
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

  console.log('Polling progress screen for terminal state...');
  let terminalReached = false;
  let domSnapshot: any = {};

  for (let i = 0; i < 35; i++) {
    await page.waitForTimeout(1000);

    domSnapshot = await page.evaluate(() => {
      const pill = document.querySelector('.idm-status-pill')?.textContent?.trim() || '';
      const bannerTitle = document.querySelector('#idm-terminal-banner strong')?.textContent?.trim() || '';
      const bannerMsg = document.querySelector('#idm-terminal-banner p')?.textContent?.trim() || '';
      const tag = document.querySelector('.idm-mission-tag')?.textContent?.trim() || '';
      const diag = document.querySelector('#idm-terminal-banner code')?.textContent?.trim() || '';
      const bodyText = document.querySelector('.idm-progress-body')?.textContent?.trim() || '';
      const newMissionBtn = Boolean(document.querySelector('.idm-actions button'));

      return {
        pill,
        bannerTitle,
        bannerMsg,
        tag,
        diag,
        bodyText,
        newMissionBtn,
        isOpen: Boolean(document.querySelector('.idm-progress-body'))
      };
    });

    console.log(`[Tick ${i}] Pill: "${domSnapshot.pill}" | BannerTitle: "${domSnapshot.bannerTitle}"`);

    if (
      domSnapshot.pill &&
      !domSnapshot.pill.includes('INICIANDO') &&
      !domSnapshot.pill.includes('EJECUCIÓN') &&
      !domSnapshot.pill.includes('VALIDANDO') &&
      !domSnapshot.pill.includes('BUSCANDO') &&
      !domSnapshot.pill.includes('AMPLIANDO')
    ) {
      terminalReached = true;
      break;
    }
  }

  // Also query recent mission from backend
  const missionRes = await fetch('http://localhost:5174/api/industrial/missions/latest').then(r => r.json()).catch(() => null);
  const m = missionRes?.mission;

  const hasCancelText = domSnapshot.bodyText.includes('cancelad') || domSnapshot.bodyText.includes('Cancelad');

  console.log('\n====================================================');
  console.log('GARAGE CABA PHYSICAL TEST RESULTS');
  console.log('====================================================');
  console.log('MISSION_ID_TAG:', domSnapshot.tag);
  console.log('BACKEND_MISSION_ID:', m?.mission_id);
  console.log('MODAL_STAYS_OPEN:', domSnapshot.isOpen);
  console.log('TERMINAL_STATUS_PILL:', domSnapshot.pill);
  console.log('TERMINAL_BANNER_TITLE:', domSnapshot.bannerTitle);
  console.log('TERMINAL_BANNER_MESSAGE:', domSnapshot.bannerMsg);
  console.log('DIAGNOSTIC_CODE:', domSnapshot.diag);
  console.log('HAS_CANCELLED_TEXT:', hasCancelText);
  console.log('TERMINAL_REACHED:', terminalReached);

  const pass =
    terminalReached &&
    domSnapshot.isOpen &&
    !hasCancelText &&
    domSnapshot.pill.includes('SIN FUENTE VÁLIDA') &&
    domSnapshot.bannerTitle.includes('Todavía no encontramos una fuente válida');

  console.log('PHYSICAL_PASS:', pass);

  await browser.close();
  if (!pass) process.exit(1);
}

testGarageAfter().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
