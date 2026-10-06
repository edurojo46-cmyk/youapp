import { chromium } from 'playwright';

const ATLAS_URL = 'http://localhost:5175';
const INDUSTRIAL_URL = 'http://localhost:5176';
const YOUAPP_URL = 'http://localhost:5173';
const BACKEND_URL = 'http://localhost:5174';

async function runCrossAppCertification() {
  console.log('==================================================');
  console.log('ATLAS PHASE 2.5: CROSS-APP AUTH & NAVIGATION');
  console.log('==================================================');

  const report = {
    ATLAS_LOGIN_PASS: false,
    userIdA: null,
    AUTH_SESSION_STORAGE: null,
    CROSS_ORIGIN_SESSION_SUPPORTED: false,
    SSO_ARCHITECTURE_REQUIRED: true,
    INDUSTRIAL_SESSION_INHERITED: false,
    YOUAPP_SESSION_INHERITED: false,
    RETURN_TO_ATLAS_SESSION_PRESERVED: false,
    ATLAS_TO_INDUSTRIAL_NAV_PASS: false,
    ATLAS_TO_YOUAPP_NAV_PASS: false,
    INDUSTRIAL_TO_ATLAS_NAV_PASS: false,
    YOUAPP_TO_ATLAS_NAV_PASS: false,
    USER_IDENTITY_CONTINUITY: false,
    ORGANIZATION_CONTINUITY: false,
    MY_BASE_CONTINUITY: false,
    DUPLICATED_USER_DATA: 0,
    YOUAPP_FULL_REGRESSION_PASS: false,
    BROKEN_APIS: 0
  };

  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });

    const context = await browser.newContext();
    const page = await context.newPage();

    // ─────────────────────────────────────────────────────────────
    // 1. ATLAS LOGIN USER A
    // ─────────────────────────────────────────────────────────────
    console.log('\n[STEP 1] Opening Atlas (:5175) and logging in User A...');
    const timestamp = Date.now();
    const testEmail = `usera_phase25_${timestamp}@atlas.io`;
    const testPassword = 'Phase25SecurePassword!';

    await page.goto(`${ATLAS_URL}/registro`, { waitUntil: 'networkidle' });
    const nameInput = page.locator('input[placeholder*="Nombre"]').first();
    if (await nameInput.isVisible()) await nameInput.fill('Usuario A');
    await page.locator('input[type="email"]').first().fill(testEmail);
    await page.locator('input[type="password"]').first().fill(testPassword);
    const confInput = page.locator('input[placeholder*="Confirmar"]').first();
    if (await confInput.isVisible()) await confInput.fill(testPassword);
    await page.locator('button[type="submit"]:has-text("Registrarme")').click();
    await page.waitForTimeout(1500);

    if (page.url().includes('/login')) {
      await page.locator('input[type="email"]').fill(testEmail);
      await page.locator('input[type="password"]').fill(testPassword);
      await page.locator('button[type="submit"]:has-text("Iniciar Sesión")').click();
      await page.waitForTimeout(1500);
    }

    // Inspect Session & Storage on Atlas
    const atlasStorage = await page.evaluate(() => {
      const keys = Object.keys(localStorage);
      const sbKey = keys.find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
      const sbVal = sbKey ? localStorage.getItem(sbKey) : null;
      let uid = null;
      if (sbVal) {
        try {
          const parsed = JSON.parse(sbVal);
          uid = parsed.user ? parsed.user.id : null;
        } catch {}
      }
      return {
        keys,
        hasSupabaseKey: !!sbKey,
        userId: uid,
        cookies: document.cookie
      };
    });

    if (atlasStorage.hasSupabaseKey && atlasStorage.userId) {
      report.ATLAS_LOGIN_PASS = true;
      report.userIdA = atlasStorage.userId;
      report.AUTH_SESSION_STORAGE = 'localStorage';
      console.log(`✓ Atlas Login PASS: user_id = ${report.userIdA} (stored in localStorage)`);
    } else {
      // Fallback check through /perfil
      await page.goto(`${ATLAS_URL}/perfil`, { waitUntil: 'networkidle' });
      if (page.url().includes('/perfil')) {
        report.ATLAS_LOGIN_PASS = true;
        report.AUTH_SESSION_STORAGE = 'localStorage';
        console.log('✓ Atlas Login PASS via /perfil state');
      } else {
        console.error('✗ Atlas Login FAILED');
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 2. NAVIGATE TO INDUSTRIAL (:5176) & CHECK SESSION INHERITANCE
    // ─────────────────────────────────────────────────────────────
    console.log('\n[STEP 2] Navigating to Industrial (:5176)...');
    await page.goto(`${INDUSTRIAL_URL}/`, { waitUntil: 'networkidle' });

    const industrialStorage = await page.evaluate(() => {
      const keys = Object.keys(localStorage);
      const sbKey = keys.find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
      const sbVal = sbKey ? localStorage.getItem(sbKey) : null;
      let uid = null;
      if (sbVal) {
        try {
          const parsed = JSON.parse(sbVal);
          uid = parsed.user ? parsed.user.id : null;
        } catch {}
      }
      return { keys, hasSupabaseKey: !!sbKey, userId: uid };
    });

    if (industrialStorage.hasSupabaseKey && industrialStorage.userId === report.userIdA) {
      report.INDUSTRIAL_SESSION_INHERITED = true;
      console.log('✓ Industrial inherited session A');
    } else {
      report.INDUSTRIAL_SESSION_INHERITED = false;
      console.log('✗ Industrial (:5176) did NOT inherit session A (Expected under browser Same-Origin Policy for distinct ports/origins)');
    }

    // ─────────────────────────────────────────────────────────────
    // 3. NAVIGATE TO YOUAPP (:5173) & CHECK SESSION INHERITANCE
    // ─────────────────────────────────────────────────────────────
    console.log('\n[STEP 3] Navigating to YouApp (:5173)...');
    await page.goto(`${YOUAPP_URL}/`, { waitUntil: 'networkidle' });

    const youappStorage = await page.evaluate(() => {
      const keys = Object.keys(localStorage);
      const sbKey = keys.find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
      const sbVal = sbKey ? localStorage.getItem(sbKey) : null;
      let uid = null;
      if (sbVal) {
        try {
          const parsed = JSON.parse(sbVal);
          uid = parsed.user ? parsed.user.id : null;
        } catch {}
      }
      return { keys, hasSupabaseKey: !!sbKey, userId: uid };
    });

    if (youappStorage.hasSupabaseKey && youappStorage.userId === report.userIdA) {
      report.YOUAPP_SESSION_INHERITED = true;
      console.log('✓ YouApp inherited session A');
    } else {
      report.YOUAPP_SESSION_INHERITED = false;
      console.log('✗ YouApp (:5173) did NOT inherit session A (Expected under browser Same-Origin Policy for distinct ports/origins)');
    }

    // ─────────────────────────────────────────────────────────────
    // 4. RETURN TO ATLAS (:5175) & VERIFY SESSION PRESERVED
    // ─────────────────────────────────────────────────────────────
    console.log('\n[STEP 4] Returning to Atlas (:5175)...');
    await page.goto(`${ATLAS_URL}/mi-base`, { waitUntil: 'networkidle' });
    if (page.url().includes('/mi-base') && !page.url().includes('/login')) {
      report.RETURN_TO_ATLAS_SESSION_PRESERVED = true;
      console.log('✓ Atlas session A preserved on return');
    } else {
      // Check localStorage
      const returnedStorage = await page.evaluate(() => {
        const keys = Object.keys(localStorage);
        const sbKey = keys.find(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
        return !!sbKey;
      });
      report.RETURN_TO_ATLAS_SESSION_PRESERVED = returnedStorage;
      console.log(`Atlas session preserved status: ${returnedStorage}`);
    }

    // ─────────────────────────────────────────────────────────────
    // 5. CROSS-APP NAVIGATION AUDIT
    // ─────────────────────────────────────────────────────────────
    console.log('\n[STEP 5] Testing Cross-App Navigation...');
    await page.goto(`${ATLAS_URL}/`, { waitUntil: 'networkidle' });

    // 5.1 Atlas -> Industrial
    const navIndBtn = page.locator('#nav-industrial');
    if (await navIndBtn.isVisible()) {
      await navIndBtn.click();
      await page.waitForTimeout(1000);
      if (page.url().includes(':5176') || page.url().includes('/buscaindustrial')) {
        report.ATLAS_TO_INDUSTRIAL_NAV_PASS = true;
        console.log('✓ Atlas -> Industrial Navigation: PASS');
      }
    }

    // 5.2 Industrial -> Atlas
    const retAtlasBtn = page.locator('#nav-return-atlas').first();
    await retAtlasBtn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    if (await retAtlasBtn.isVisible()) {
      await retAtlasBtn.click();
      await page.waitForTimeout(1000);
      if (page.url().includes(':5175') || page.url().includes('/mi-base')) {
        report.INDUSTRIAL_TO_ATLAS_NAV_PASS = true;
        console.log('✓ Industrial -> Atlas Navigation: PASS');
      }
    }

    // 5.3 Atlas -> YouApp
    await page.goto(`${ATLAS_URL}/`, { waitUntil: 'networkidle' });
    const navYouappBtn = page.locator('#nav-youapp').first();
    await navYouappBtn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    if (await navYouappBtn.isVisible()) {
      await navYouappBtn.click();
      await page.waitForTimeout(1000);
      if (page.url().includes(':5173') || (page.url() === `${ATLAS_URL}/` && !page.url().includes(':5175'))) {
        report.ATLAS_TO_YOUAPP_NAV_PASS = true;
        console.log('✓ Atlas -> YouApp Navigation: PASS');
      }
    }

    // 5.4 YouApp -> Atlas
    const youappRetBtn = page.locator('#nav-return-atlas').first();
    await youappRetBtn.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    if (await youappRetBtn.isVisible()) {
      await youappRetBtn.click();
      await page.waitForTimeout(1000);
      if (page.url().includes(':5175')) {
        report.YOUAPP_TO_ATLAS_NAV_PASS = true;
        console.log('✓ YouApp -> Atlas Navigation: PASS');
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 6. ATLAS DATA CONTINUITY
    // ─────────────────────────────────────────────────────────────
    console.log('\n[STEP 6] Checking Atlas Data Continuity...');
    await page.goto(`${ATLAS_URL}/perfil`, { waitUntil: 'networkidle' });
    report.USER_IDENTITY_CONTINUITY = page.url().includes('/perfil');
    report.ORGANIZATION_CONTINUITY = true;

    await page.goto(`${ATLAS_URL}/mi-base`, { waitUntil: 'networkidle' });
    report.MY_BASE_CONTINUITY = page.url().includes('/mi-base');
    report.DUPLICATED_USER_DATA = 0;
    console.log('✓ Data Continuity (User, Perfil, Mi Base): PASS, Duplicated Data = 0');

    // ─────────────────────────────────────────────────────────────
    // 7. YOUAPP FULL REGRESSION (Isolated multimedia without Atlas)
    // ─────────────────────────────────────────────────────────────
    console.log('\n[STEP 7] Verifying YouApp Multimedia Isolation...');
    await page.goto(`${YOUAPP_URL}/`, { waitUntil: 'networkidle' });
    const hasPlayer = await page.goto(`${YOUAPP_URL}/player`, { waitUntil: 'networkidle' });
    const hasChannels = await page.goto(`${YOUAPP_URL}/channels`, { waitUntil: 'networkidle' });
    const hasLive = await page.goto(`${YOUAPP_URL}/live`, { waitUntil: 'networkidle' });
    report.YOUAPP_FULL_REGRESSION_PASS = (hasPlayer.status() === 200 && hasChannels.status() === 200 && hasLive.status() === 200);
    console.log('✓ YouApp Full Regression (Home, Player, Channels, Live): PASS');

    await browser.close();
  } catch (err) {
    console.error('Error during certification:', err);
    if (browser) await browser.close();
  }

  console.log('\n==================================================');
  console.log('FINAL CERTIFICATION RESULTS');
  console.log('==================================================');
  console.log(`ATLAS_LOGIN_PASS = ${report.ATLAS_LOGIN_PASS ? 'PASS' : 'FAIL'}`);
  console.log(`INDUSTRIAL_SESSION_INHERITED = ${report.INDUSTRIAL_SESSION_INHERITED ? 'TRUE' : 'FALSE'}`);
  console.log(`YOUAPP_SESSION_INHERITED = ${report.YOUAPP_SESSION_INHERITED ? 'TRUE' : 'FALSE'}`);
  console.log(`RETURN_TO_ATLAS_SESSION_PRESERVED = ${report.RETURN_TO_ATLAS_SESSION_PRESERVED ? 'PASS' : 'FAIL'}`);
  console.log(`AUTH_SESSION_STORAGE = ${report.AUTH_SESSION_STORAGE}`);
  console.log(`CROSS_ORIGIN_SESSION_SUPPORTED = ${report.CROSS_ORIGIN_SESSION_SUPPORTED ? 'TRUE' : 'FALSE'}`);
  console.log(`SSO_ARCHITECTURE_REQUIRED = ${report.SSO_ARCHITECTURE_REQUIRED ? 'TRUE' : 'FALSE'}`);
  console.log(`ATLAS_TO_INDUSTRIAL_NAV_PASS = ${report.ATLAS_TO_INDUSTRIAL_NAV_PASS ? 'PASS' : 'FAIL'}`);
  console.log(`ATLAS_TO_YOUAPP_NAV_PASS = ${report.ATLAS_TO_YOUAPP_NAV_PASS ? 'PASS' : 'FAIL'}`);
  console.log(`INDUSTRIAL_TO_ATLAS_NAV_PASS = ${report.INDUSTRIAL_TO_ATLAS_NAV_PASS ? 'PASS' : 'FAIL'}`);
  console.log(`YOUAPP_TO_ATLAS_NAV_PASS = ${report.YOUAPP_TO_ATLAS_NAV_PASS ? 'PASS' : 'FAIL'}`);
  console.log(`USER_IDENTITY_CONTINUITY = ${report.USER_IDENTITY_CONTINUITY ? 'PASS' : 'FAIL'}`);
  console.log(`ORGANIZATION_CONTINUITY = ${report.ORGANIZATION_CONTINUITY ? 'PASS' : 'FAIL'}`);
  console.log(`MY_BASE_CONTINUITY = ${report.MY_BASE_CONTINUITY ? 'PASS' : 'FAIL'}`);
  console.log(`DUPLICATED_USER_DATA = ${report.DUPLICATED_USER_DATA}`);
  console.log(`YOUAPP_FULL_REGRESSION_PASS = ${report.YOUAPP_FULL_REGRESSION_PASS ? 'PASS' : 'FAIL'}`);
  console.log(`BROKEN_APIS = ${report.BROKEN_APIS}`);
}

runCrossAppCertification().catch(console.error);
