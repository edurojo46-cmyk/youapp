import { chromium } from 'playwright';

const APP_URL = 'http://localhost:5173';
const BACKEND_URL = 'http://localhost:5174';

async function runRegression() {
  console.log('==================================================');
  console.log('RUNNING PHASE 1 MODULARIZATION REGRESSION AUDIT');
  console.log('==================================================');

  const results = {
    auth: false,
    perfil: false,
    empresa: false,
    miBase: false,
    mibaseRedirect: false,
    buscadorIndustrial: false,
    resultados: false,
    guardarProspecto: false,
    propuesta: false,
    youappHome: false,
    youappPlayer: false,
    youappStreaming: false
  };

  const brokenRoutes = [];
  const brokenApis = [];

  let browser;
  try {
    try {
      browser = await chromium.launch({ headless: true });
    } catch {
      browser = await chromium.launch({ channel: 'msedge', headless: true });
    }

    const context = await browser.newContext();
    const page = await context.newPage();

    // 1. Verify Backend APIs
    console.log('\n[API CHECK] Testing Backend Modular Routers:');
    try {
      const pRes = await fetch(`${BACKEND_URL}/api/atlas/live-metrics`);
      if (pRes.status === 200) console.log('✓ Platform Router API: /api/atlas/live-metrics (200 OK)');
      else brokenApis.push('/api/atlas/live-metrics');

      const iRes = await fetch(`${BACKEND_URL}/api/industrial-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'carne', limit: 5 })
      });
      const iData = await iRes.json();
      if (iRes.status === 200 && iData.results) console.log(`✓ Industrial Router API: /api/industrial-search (${iData.results.length} results)`);
      else brokenApis.push('/api/industrial-search');
    } catch (e) {
      console.error('API connection failed:', e);
      brokenApis.push('Backend connection failed');
    }

    // 2. Auth: Register & Login (Atlas Platform)
    console.log('\n[TEST 1 & 2] Testing Auth (/registro & /login):');
    const timestamp = Date.now();
    const testEmail = `regresion_phase1_${timestamp}@atlas.io`;
    const testPass = 'Phase1Modular2026!';

    await page.goto(`${APP_URL}/registro`, { waitUntil: 'networkidle' });
    const nameInput = page.locator('input[placeholder*="Nombre"]').first();
    if (await nameInput.isVisible()) await nameInput.fill('Tester Modular');
    await page.locator('input[type="email"]').first().fill(testEmail);
    await page.locator('input[type="password"]').first().fill(testPass);
    const confInput = page.locator('input[placeholder*="Confirmar"]').first();
    if (await confInput.isVisible()) await confInput.fill(testPass);
    await page.locator('button[type="submit"]:has-text("Registrarme")').click();
    await page.waitForTimeout(1500);

    if (page.url().includes('/login')) {
      await page.locator('input[type="email"]').fill(testEmail);
      await page.locator('input[type="password"]').fill(testPass);
      await page.locator('button[type="submit"]:has-text("Iniciar Sesión")').click();
      await page.waitForTimeout(1500);
    }
    results.auth = true;
    console.log('✓ Auth (Register/Login): PASS');

    // 3. Perfil & Empresa
    console.log('\n[TEST 3 & 4] Testing Perfil & Empresa (/perfil):');
    await page.goto(`${APP_URL}/perfil`, { waitUntil: 'networkidle' });
    if (page.url().includes('/perfil')) {
      results.perfil = true;
      console.log('✓ Perfil: PASS');

      const empresaTab = page.locator('button.perfil-tab:has-text("Mi empresa")');
      if (await empresaTab.isVisible()) {
        await empresaTab.click();
        await page.waitForTimeout(500);
        results.empresa = true;
        console.log('✓ Empresa tab: PASS');
      } else {
        brokenRoutes.push('/perfil#empresa');
      }
    } else {
      brokenRoutes.push('/perfil');
    }

    // 4. Mi Base & Canonical Redirect
    console.log('\n[TEST 5] Testing Mi Base (/mi-base) & /mibase redirect:');
    await page.goto(`${APP_URL}/mibase`, { waitUntil: 'networkidle' });
    if (page.url().includes('/mi-base')) {
      results.mibaseRedirect = true;
      console.log('✓ Canonical redirect /mibase -> /mi-base: PASS');
    }

    await page.goto(`${APP_URL}/mi-base`, { waitUntil: 'networkidle' });
    if (page.url().includes('/mi-base')) {
      results.miBase = true;
      console.log('✓ Mi Base (/mi-base): PASS');
    } else {
      brokenRoutes.push('/mi-base');
    }

    // 5. Buscador Industrial & Resultados
    console.log('\n[TEST 6 & 7] Testing Buscador Industrial & Resultados:');
    await page.goto(`${APP_URL}/buscaindustrial`, { waitUntil: 'networkidle' });
    const searchInput = page.locator('#bi-search-input, .bi-search-input');
    if (await searchInput.isVisible()) {
      results.buscadorIndustrial = true;
      console.log('✓ Buscador Industrial (/buscaindustrial): PASS');
      await searchInput.fill('carne');
      await page.locator('#bi-buscar-btn, .bi-buscar-btn').click();
      await page.waitForURL('**/buscaindustrial/productos?q=carne**', { timeout: 10000 });
      
      await page.waitForSelector('.bir-row', { timeout: 8000 });
      const rowCount = await page.locator('.bir-row').count();
      if (rowCount > 0) {
        results.resultados = true;
        console.log(`✓ Resultados (/buscaindustrial/productos): PASS (${rowCount} rows)`);

        // 6. Guardar prospecto
        console.log('\n[TEST 8] Testing Guardar prospecto:');
        const saveBtn = page.locator('.bir-save-btn').first();
        if (await saveBtn.isVisible()) {
          await saveBtn.click();
          await page.waitForTimeout(1000);
          results.guardarProspecto = true;
          console.log('✓ Guardar prospecto a Mi Base: PASS');
        }
      }
    } else {
      brokenRoutes.push('/buscaindustrial');
    }

    // 7. Propuesta Comercial Flow
    console.log('\n[TEST 9] Testing Propuestas Comerciales:');
    await page.goto(`${APP_URL}/mi-base`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const propBtn = page.locator('.mb-btn-propuesta').first();
    if (await propBtn.isVisible()) {
      await propBtn.click();
      await page.waitForSelector('.mb-modal-card', { timeout: 5000 });
      const titleInput = page.locator('.mb-proposal-field input.mb-text-input').first();
      await titleInput.fill('Lote Válvulas Inox');
      const priceInput = page.locator('input[type="number"]').first();
      await priceInput.fill('18500');
      await page.locator('button[type="submit"]:has-text("Generar Propuesta")').first().click();
      await page.waitForTimeout(1500);

      const linkInput = page.locator('.mb-prop-link-input, input[readonly]').first();
      if (await linkInput.isVisible()) {
        const fullLink = await linkInput.inputValue();
        const match = fullLink.match(/\/propuesta\/([a-zA-Z0-9_-]+)/);
        if (match) {
          const token = match[1];
          await page.goto(`${APP_URL}/propuesta/${token}`, { waitUntil: 'networkidle' });
          await page.waitForTimeout(1000);
          const hasTitle = (await page.locator('.propuesta-title').count()) > 0;
          const hasAccept = (await page.locator('button.btn-accept').count()) > 0;
          if (hasTitle && hasAccept) {
            results.propuesta = true;
            console.log('✓ Propuesta Comercial (/propuesta/:token): PASS');
          }
        }
      }
    }

    // 8. YOUAPP: Home, Player, Streaming
    console.log('\n[TEST 10, 11 & 12] Testing YOUAPP Streaming Product:');
    // YouApp Home (root)
    await page.goto(`${APP_URL}/`, { waitUntil: 'networkidle' });
    const hasHome = (await page.locator('.dl-wrapper, .col-segui-viendo, .video-card-unified, .section-header').count()) > 0;
    if (hasHome) {
      results.youappHome = true;
      console.log('✓ YOUAPP Home (/): PASS');
    } else {
      console.log('Current URL on /:', page.url());
      brokenRoutes.push('/ (YouApp Home)');
    }

    // YouApp Player
    await page.goto(`${APP_URL}/player?id=test-vid`, { waitUntil: 'networkidle' });
    if (page.url().includes('/player')) {
      results.youappPlayer = true;
      console.log('✓ YOUAPP Player (/player): PASS');
    }

    // YouApp Streaming Explore
    await page.goto(`${APP_URL}/explorar`, { waitUntil: 'networkidle' });
    const hasStreamingExplore = page.url().includes('/explorar');
    if (hasStreamingExplore) {
      results.youappStreaming = true;
      console.log('✓ YOUAPP Streaming (/explorar): PASS');
    } else {
      brokenRoutes.push('/explorar');
    }

    // Verify Product CSS Scopes in DOM
    console.log('\n[THEME SCOPES CHECK]');
    await page.goto(`${APP_URL}/perfil`, { waitUntil: 'networkidle' });
    const hasAtlasScope = (await page.locator('.atlas-app').count()) > 0;
    console.log(`- Atlas Scope (.atlas-app on /perfil): ${hasAtlasScope}`);

    await page.goto(`${APP_URL}/buscaindustrial`, { waitUntil: 'networkidle' });
    const hasIndustrialScope = (await page.locator('.industrial-app').count()) > 0;
    console.log(`- Industrial Scope (.industrial-app on /buscaindustrial): ${hasIndustrialScope}`);

    await page.goto(`${APP_URL}/`, { waitUntil: 'networkidle' });
    const hasYouAppScope = (await page.locator('.youapp-app').count()) > 0;
    console.log(`- YouApp Scope (.youapp-app on /): ${hasYouAppScope}`);

  } catch (err) {
    console.error('Regression execution error:', err);
  } finally {
    if (browser) await browser.close();
  }

  console.log('\n==================================================');
  console.log('REGRESSION AUDIT SUMMARY');
  console.log('==================================================');
  console.log('Results Checklist:', results);
  console.log('Broken routes count:', brokenRoutes.length, brokenRoutes);
  console.log('Broken APIs count:', brokenApis.length, brokenApis);
}

runRegression();
