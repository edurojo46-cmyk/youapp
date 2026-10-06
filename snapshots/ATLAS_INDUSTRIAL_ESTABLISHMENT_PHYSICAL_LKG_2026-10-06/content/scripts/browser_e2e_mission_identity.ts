import { chromium } from 'playwright';

async function testBrowserE2E() {
  console.log('Launching browser to test http://localhost:5175/buscaindustrial...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // 1. Navigate to /buscaindustrial
  await page.goto('http://localhost:5175/buscaindustrial', { waitUntil: 'networkidle' });
  console.log('Navigated to /buscaindustrial. URL:', page.url());

  // 2. Open Discovery Modal
  console.log('Opening modal with #bi-ampliar-base-tab...');
  const openBtn = await page.waitForSelector('#bi-ampliar-base-tab', { timeout: 5000 });
  await openBtn.click();
  await page.waitForSelector('.idm-modal', { timeout: 5000 });
  console.log('Modal opened successfully.');

  // 3. Fill Objective
  console.log('Setting objective to GARAGE...');
  const textarea = await page.waitForSelector('#idm-objective-input', { timeout: 5000 });
  await textarea.fill('GARAGE');

  // Wait 600ms for debounced preview
  await page.waitForTimeout(600);

  // 4. Select Geography ARG_NACIONAL
  console.log('Setting geography to ARG_NACIONAL...');
  const geoSelect = await page.waitForSelector('.idm-select:nth-of-type(1), select:has(option[value="ARG_NACIONAL"])');
  await geoSelect.selectOption('ARG_NACIONAL');

  // 5. Proceed to Confirmation
  console.log('Clicking Proceed to Confirmation (#idm-btn-100k-buscar)...');
  const proceedBtn = await page.waitForSelector('#idm-btn-100k-buscar', { timeout: 10000 });
  await proceedBtn.click();

  // 6. Verify Confirmation Screen and capture initial mission ID
  console.log('Waiting for confirmation screen...');
  await page.waitForSelector('#idm-btn-confirm-start', { timeout: 10000 });
  
  // Extract visible mission tag or ID
  const confTagEl = await page.$('.idm-mission-tag, [data-mission-id]');
  const confTagText = confTagEl ? (await confTagEl.innerText()).trim() : '';
  console.log(`Confirmation screen visible tag/ID: "${confTagText}"`);

  // 7. Click Iniciar Misión
  console.log('Clicking Iniciar misión...');
  const startBtn = await page.waitForSelector('#idm-btn-confirm-start');
  await startBtn.click();

  // 8. Progress Screen: monitor mission ID continuously
  console.log('Waiting for PROGRESS screen...');
  await page.waitForSelector('.idm-progress-body', { timeout: 10000 });

  let firstProgressTag = '';
  let idChanged = false;
  let observedTags: string[] = [];

  for (let i = 0; i < 25; i++) {
    await page.waitForTimeout(1000);
    const tagEl = await page.$('.idm-mission-tag');
    if (tagEl) {
      const tagText = (await tagEl.innerText()).trim();
      if (!firstProgressTag) {
        firstProgressTag = tagText;
        console.log(`Initial PROGRESS Mission Tag: "${firstProgressTag}"`);
      }
      if (!observedTags.includes(tagText)) {
        observedTags.push(tagText);
        console.log(`  [T+${i}s] Observed visible tag: "${tagText}"`);
      }
      if (tagText !== firstProgressTag) {
        idChanged = true;
        console.error(`CRITICAL FAILURE: Mission ID changed from "${firstProgressTag}" to "${tagText}"!`);
      }
    }

    // Check if terminal reached
    const terminalEl = await page.$('.idm-actions button:has-text("Nueva misión")');
    if (terminalEl) {
      console.log(`Terminal reached at second ${i}. "Nueva misión" button is visible.`);
      break;
    }
  }

  // 9. Inspect terminal state
  const finalTagEl = await page.$('.idm-mission-tag');
  const finalTagText = finalTagEl ? (await finalTagEl.innerText()).trim() : '';
  console.log(`FINAL PROGRESS Mission Tag: "${finalTagText}"`);
  console.log(`Observed tags across lifecycle:`, observedTags);

  const isImmutable = !idChanged && observedTags.length === 1 && finalTagText === firstProgressTag;
  console.log(`MISSION_ID_IMMUTABLE_IN_BROWSER: ${isImmutable}`);

  await browser.close();

  if (!isImmutable) {
    process.exit(1);
  }
  console.log('TRUE BROWSER TEST PASSED SUCCESSFULLY.');
}

testBrowserE2E().catch(err => {
  console.error('Browser E2E error:', err);
  process.exit(1);
});
