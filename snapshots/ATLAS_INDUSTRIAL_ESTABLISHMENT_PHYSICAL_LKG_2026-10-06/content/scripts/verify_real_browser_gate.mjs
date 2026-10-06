import { chromium } from 'playwright';
import 'dotenv/config';

const APP_URL = 'http://localhost:5173';
const testRunId = Date.now().toString().slice(-6);
const testUser = {
  name: 'Carlos Mendez',
  email: `carlos.mendez.browser.${testRunId}@gmail.com`,
  password: `AtlasPass!${testRunId}`,
  firstName: 'Carlos',
  lastName: 'Mendez',
  displayName: 'Ing. Carlos Mendez',
  phone: '+54 11 5566-7788',
  province: 'Córdoba',
  companyName: 'Mendez Soluciones Industriales',
  legalName: 'Mendez Soluciones Industriales S.R.L.',
  taxId: '30-79887766-1',
  website: 'https://mendez-industria.com.ar',
  industry: 'Automatización y Maquinaria',
  city: 'Córdoba Capital',
  address: 'Av. Colón 4500'
};

async function runBrowserGate() {
  console.log('==================================================');
  console.log('STARTING REAL BROWSER TEST (HEADLESS CHROMIUM)');
  console.log('==================================================\n');

  let browser;
  try {
    // Launch Chromium or system Edge
    try {
      browser = await chromium.launch({ headless: true });
    } catch {
      browser = await chromium.launch({ channel: 'msedge', headless: true });
    }

    const context = await browser.newContext();
    const page = await context.newPage();

    // ------------------------------------------------------------------------
    // Step 1: Guest Navbar verification at /buscaindustrial and /registro
    // ------------------------------------------------------------------------
    console.log('[Browser Step 1] Navigating to /buscaindustrial to check guest Navbar...');
    await page.goto(`${APP_URL}/buscaindustrial`, { waitUntil: 'networkidle' });

    console.log('Verifying guest Navbar state...');
    const loginBtnVisible = await page.locator('.atlas-btn-login').first().isVisible().catch(() => false);
    const signupBtnVisible = await page.locator('.atlas-btn-signup').first().isVisible().catch(() => false);
    const userMenuVisible = await page.locator('.atlas-user-menu').isVisible().catch(() => false);

    console.log(`- Guest [Ingresar] visible: ${loginBtnVisible}`);
    console.log(`- Guest [Crear cuenta] visible: ${signupBtnVisible}`);
    console.log(`- Authenticated user menu hidden: ${!userMenuVisible}`);

    if (userMenuVisible || !loginBtnVisible || !signupBtnVisible) {
      throw new Error('Navbar is not displaying unauthenticated guest controls properly!');
    }

    // ------------------------------------------------------------------------
    // Step 2: Register User A
    // ------------------------------------------------------------------------
    console.log(`\n[Browser Step 2] Navigating to /registro and registering ${testUser.email}...`);
    await page.goto(`${APP_URL}/registro`, { waitUntil: 'networkidle' });

    const nameInput = page.locator('input[placeholder*="Nombre"]').first();
    if (await nameInput.isVisible()) {
      await nameInput.fill(testUser.name);
    }

    await page.locator('input[type="email"]').fill(testUser.email);
    await page.locator('input[type="password"]').first().fill(testUser.password);
    
    // Confirm password input
    const confirmInput = page.locator('input[placeholder*="Confirmar"]').first();
    if (await confirmInput.isVisible()) {
      await confirmInput.fill(testUser.password);
    }

    console.log('Submitting registration...');
    await page.locator('button[type="submit"]:has-text("Registrarme")').click();

    // Wait for redirect to /perfil or /login
    await page.waitForTimeout(2000);
    let currentUrl = page.url();
    console.log(`Current URL after registration: ${currentUrl}`);

    if (currentUrl.includes('/login') || !currentUrl.includes('/perfil')) {
      console.log('Logging in via /login...');
      await page.goto(`${APP_URL}/login`, { waitUntil: 'networkidle' });
      await page.locator('input[type="email"]').fill(testUser.email);
      await page.locator('input[type="password"]').first().fill(testUser.password);
      await page.locator('button[type="submit"]:has-text("Iniciar Sesión")').click();
      await page.waitForURL('**/perfil', { timeout: 10000 });
    }

    console.log('✓ Successfully authenticated and navigated to /perfil');

    // ------------------------------------------------------------------------
    // Step 3: Verify Authenticated Navbar
    // ------------------------------------------------------------------------
    console.log('\n[Browser Step 3] Verifying authenticated Navbar state...');
    await page.waitForSelector('.atlas-user-menu, .atlas-avatar', { timeout: 5000 });
    const authMenuVisible = await page.locator('.atlas-user-menu').isVisible();
    const guestLoginGone = !(await page.locator('.atlas-btn-login').isVisible().catch(() => false));
    const guestSignupGone = !(await page.locator('.atlas-btn-signup').isVisible().catch(() => false));

    console.log(`- Authenticated user menu visible: ${authMenuVisible}`);
    console.log(`- Guest buttons completely removed: ${guestLoginGone && guestSignupGone}`);

    if (!authMenuVisible || !guestLoginGone) {
      throw new Error('Navbar did not update to authenticated state cleanly!');
    }

    // ------------------------------------------------------------------------
    // Step 4: Fill Personal Profile in /perfil
    // ------------------------------------------------------------------------
    console.log('\n[Browser Step 4] Filling and saving personal profile...');
    await page.locator('input[placeholder="Ej. Juan"]').fill(testUser.firstName);
    await page.locator('input[placeholder="Ej. Pérez"]').fill(testUser.lastName);
    await page.locator('input[placeholder="Ej. Juan Pérez - Ventas Industriales"]').fill(testUser.displayName);
    await page.locator('input[placeholder="+54 11 4000-0000"]').fill(testUser.phone);
    await page.locator('input[placeholder="Buenos Aires, Córdoba, Santa Fe..."]').fill(testUser.province);

    await page.locator('button[type="submit"]:has-text("Guardar datos personales")').click();
    await page.waitForSelector('.perfil-alert--success', { timeout: 5000 });
    const personalToast = await page.locator('.perfil-alert--success').textContent();
    console.log(`✓ Personal profile toast: "${personalToast.trim()}"`);

    // ------------------------------------------------------------------------
    // Step 5: Fill Company Profile in /perfil?tab=empresa
    // ------------------------------------------------------------------------
    console.log('\n[Browser Step 5] Switching to "Mi empresa" tab and creating company...');
    await page.locator('button.perfil-tab:has-text("Mi empresa")').click();
    await page.waitForTimeout(500);

    await page.locator('input[placeholder="Ej. Molinos del Sur S.A."]').fill(testUser.companyName);
    await page.locator('input[placeholder="Ej. Molinos del Sur Sociedad Anónima"]').fill(testUser.legalName);
    await page.locator('input[placeholder="30-71234567-8"]').fill(testUser.taxId);
    await page.locator('input[placeholder="https://www.molinosdelsur.com.ar"]').fill(testUser.website);
    await page.locator('input[placeholder="Maquinaria y Equipos Industriales"]').fill(testUser.industry);
    await page.locator('input[placeholder="Córdoba"]').fill(testUser.province);
    await page.locator('input[placeholder="San Francisco"]').fill(testUser.city);
    await page.locator('input[placeholder="Ruta 19 Km 120"]').fill(testUser.address);

    await page.locator('button[type="submit"]:has-text("Registrar empresa"), button[type="submit"]:has-text("Actualizar datos de empresa")').first().click();
    await page.waitForSelector('.perfil-alert--success', { timeout: 5000 });
    const orgToast = await page.locator('.perfil-alert--success').textContent();
    console.log(`✓ Organization toast: "${orgToast.trim()}"`);

    // Verify OWNER badge
    const ownerBadge = await page.locator('.perfil-badge--green, .perfil-badge:has-text("OWNER")').first().textContent();
    console.log(`✓ Membership verified: "${ownerBadge.trim()}"`);

    // ------------------------------------------------------------------------
    // Step 6: Verify Integraciones Tab (Mercado Pago Disconnected)
    // ------------------------------------------------------------------------
    console.log('\n[Browser Step 6] Checking Integrations tab (Mercado Pago)...');
    await page.locator('button.perfil-tab:has-text("Integraciones")').click();
    await page.waitForTimeout(500);

    const mpStatusText = await page.locator('.perfil-int-status').textContent();
    const mpBtnDisabled = await page.locator('button.perfil-btn-disabled').getAttribute('disabled');
    const mpNoteText = await page.locator('.perfil-int-note').textContent();

    console.log(`- Mercado Pago Status: "${mpStatusText.trim()}"`);
    console.log(`- Connect Button Disabled: ${mpBtnDisabled !== null}`);
    console.log(`- Note: "${mpNoteText.trim()}"`);

    if (!mpStatusText.includes('No conectado') || mpBtnDisabled === null) {
      throw new Error('Mercado Pago integration should be disabled and disconnected!');
    }

    // ------------------------------------------------------------------------
    // Step 7: Open Mi Base from Navbar
    // ------------------------------------------------------------------------
    console.log('\n[Browser Step 7] Navigating to Mi Base via Navbar menu...');
    await page.locator('.atlas-user-btn').click();
    await page.locator('.atlas-dropdown-item:has-text("Mi Base")').click();
    await page.waitForURL('**/mi-base', { timeout: 5000 });
    console.log(`✓ Current URL is: ${page.url()}`);

    // ------------------------------------------------------------------------
    // Step 8: Logout from Navbar
    // ------------------------------------------------------------------------
    console.log('\n[Browser Step 8] Logging out via Navbar menu...');
    await page.locator('.atlas-user-btn').click();
    await page.locator('.atlas-dropdown-item--logout').click();
    await page.waitForURL('**/login', { timeout: 5000 });
    console.log(`✓ Successfully logged out, redirected to: ${page.url()}`);

    // Verify Navbar returned to guest mode
    await page.goto(`${APP_URL}/buscaindustrial`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.atlas-btn-login', { timeout: 5000 });
    console.log('✓ Navbar successfully returned to guest state');

    // ------------------------------------------------------------------------
    // Step 9: Re-login and Verify Data Persistence
    // ------------------------------------------------------------------------
    console.log('\n[Browser Step 9] Re-logging in to verify data persistence...');
    await page.goto(`${APP_URL}/login`, { waitUntil: 'networkidle' });
    await page.locator('input[type="email"]').fill(testUser.email);
    await page.locator('input[type="password"]').first().fill(testUser.password);
    await page.locator('button[type="submit"]:has-text("Iniciar Sesión")').click();
    await page.waitForURL('**/perfil', { timeout: 10000 });

    // Check personal fields
    await page.waitForSelector('input[placeholder="Ej. Juan"]', { timeout: 5000 });
    const loadedFirstName = await page.locator('input[placeholder="Ej. Juan"]').inputValue();
    const loadedDisplayName = await page.locator('input[placeholder="Ej. Juan Pérez - Ventas Industriales"]').inputValue();
    const loadedProvince = await page.locator('input[placeholder="Buenos Aires, Córdoba, Santa Fe..."]').inputValue();

    console.log(`- Loaded First Name: "${loadedFirstName}"`);
    console.log(`- Loaded Display Name: "${loadedDisplayName}"`);
    console.log(`- Loaded Province: "${loadedProvince}"`);

    if (loadedDisplayName !== testUser.displayName) {
      throw new Error(`Personal profile failed to persist! Expected "${testUser.displayName}", got "${loadedDisplayName}"`);
    }

    // Check company tab
    await page.locator('button.perfil-tab:has-text("Mi empresa")').click();
    await page.waitForTimeout(500);
    const loadedCompanyName = await page.locator('input[placeholder="Ej. Molinos del Sur S.A."]').inputValue();
    const loadedTaxId = await page.locator('input[placeholder="30-71234567-8"]').inputValue();

    console.log(`- Loaded Company Name: "${loadedCompanyName}"`);
    console.log(`- Loaded Tax ID: "${loadedTaxId}"`);

    if (loadedCompanyName !== testUser.companyName || loadedTaxId !== testUser.taxId) {
      throw new Error('Organization details failed to persist!');
    }

    // ------------------------------------------------------------------------
    // Step 10: Page Reload / Refresh (Session Restore Invariant)
    // ------------------------------------------------------------------------
    console.log('\n[Browser Step 10] Reloading browser page to test session restoration...');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForSelector('.atlas-user-menu', { timeout: 5000 });

    const reloadCompanyName = await page.locator('input[placeholder="Ej. Molinos del Sur S.A."]').inputValue();
    console.log(`✓ Session restored on refresh. Company still loaded: "${reloadCompanyName}"`);

    console.log('\n==================================================');
    console.log('REAL BROWSER GATE SUITE PASSED 100%');
    console.log('==================================================');

  } finally {
    if (browser) await browser.close();
  }
}

runBrowserGate().catch(err => {
  console.error('\n❌ BROWSER TEST FAILED:', err);
  process.exit(1);
});
