import { chromium } from 'playwright';

const APP_URL = 'http://localhost:5173';
const BACKEND_URL = 'http://localhost:5174';

async function runAudit() {
  const issues = {
    P0: [],
    P1: [],
    P2: [],
    P3: []
  };

  const screensAudited = new Set();
  const brokenRoutes = [];
  const brokenActions = [];
  const visualInconsistencies = [];
  let mainFlowComplete = false;

  let browser;
  try {
    try {
      browser = await chromium.launch({ headless: true });
    } catch {
      browser = await chromium.launch({ channel: 'msedge', headless: true });
    }

    const context = await browser.newContext();
    const page = await context.newPage();

    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    console.log('--- STEP 1: HOME (/) ---');
    screensAudited.add('/');
    await page.goto(`${APP_URL}/`, { waitUntil: 'networkidle' });
    const hasStreamingLayout = (await page.locator('.desktop-layout, .channel-grid, .video-player').count()) > 0;
    if (hasStreamingLayout) {
      issues.P1.push('Ruta raíz (/) renderiza layout heredado de streaming (YOUAPP) en vez de Atlas Industrial Search o Landing (/buscaindustrial).');
      brokenRoutes.push('/ (Root misdirection to streaming TV)');
    }

    console.log('--- STEP 2: REGISTRO & LOGIN (/registro & /login) ---');
    screensAudited.add('/registro');
    screensAudited.add('/login');
    await page.goto(`${APP_URL}/login`, { waitUntil: 'networkidle' });

    // Check dark neon background inconsistency
    const authBg = await page.evaluate(() => {
      const el = document.querySelector('.auth-layout');
      return el ? window.getComputedStyle(el).backgroundColor : '';
    });
    if (authBg.includes('15, 17, 26') || authBg.includes('0f111a')) {
      visualInconsistencies.push('Pantallas de Login y Registro usan fondo negro (#0f111a) con esferas violeta/neón, en contraste con la identidad blanca/celeste/minimalista de Atlas.');
      issues.P2.push('Inconsistencia visual: Login/Registro tiene diseño oscuro futurista no alineado al estilo Atlas.');
    }

    // Register a real audit user session
    const timestamp = Date.now();
    const testEmail = `audit_atlas_${timestamp}@youapp-test.com`;
    const testPass = 'AuditPass2026!';

    await page.goto(`${APP_URL}/registro`, { waitUntil: 'networkidle' });
    const nameInput = page.locator('input[placeholder*="Nombre"]').first();
    if (await nameInput.isVisible()) await nameInput.fill('Auditor Atlas');
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

    console.log('--- STEP 3: PERFIL & EMPRESA (/perfil) ---');
    screensAudited.add('/perfil');
    await page.goto(`${APP_URL}/perfil`, { waitUntil: 'networkidle' });
    
    // Check if redirected to login (if session failed)
    if (page.url().includes('/login')) {
      issues.P0.push('Bloqueo: No se pudo autenticar o mantener sesión para acceder a /perfil.');
      brokenActions.push('Auth session persistence');
    } else {
      // Check tabs
      const empresaTab = page.locator('button.perfil-tab:has-text("Mi empresa")');
      if (await empresaTab.isVisible()) {
        await empresaTab.click();
        await page.waitForTimeout(500);
        screensAudited.add('/perfil#empresa');
        const orgInput = page.locator('input[name="name"], input[placeholder*="Nombre de la empresa"]');
        if (await orgInput.isVisible()) {
          await orgInput.fill('Industrias Audit Argentina S.A.');
          const saveOrgBtn = page.locator('button:has-text("Guardar empresa"), button:has-text("Guardar cambios")').first();
          if (await saveOrgBtn.isVisible()) {
            await saveOrgBtn.click();
            await page.waitForTimeout(800);
          }
        }
      } else {
        issues.P2.push('Pestaña "Mi empresa" no encontrada en /perfil.');
      }
    }

    console.log('--- STEP 4: BUSCADOR INDUSTRIAL (/buscaindustrial) ---');
    screensAudited.add('/buscaindustrial');
    await page.goto(`${APP_URL}/buscaindustrial`, { waitUntil: 'networkidle' });

    // Check quick search pills
    const pillCount = await page.locator('.bi-quick-tag').count();
    console.log(`Quick search pills count: ${pillCount}`);

    // Search for 'carne'
    await page.locator('#bi-search-input, .bi-search-input').fill('carne');
    await page.locator('#bi-buscar-btn, .bi-buscar-btn').click();

    await page.waitForURL('**/buscaindustrial/productos?q=carne**', { timeout: 10000 });
    screensAudited.add('/buscaindustrial/productos');

    console.log('--- STEP 5: RESULTADOS DE BÚSQUEDA ---');
    await page.waitForSelector('.bir-row', { timeout: 10000 });
    const rowCount = await page.locator('.bir-row').count();
    console.log(`Results rows rendered: ${rowCount}`);

    if (rowCount === 0) {
      issues.P1.push('Buscador Industrial: No se renderizaron filas de resultados en el catálogo.');
      brokenActions.push('Render industrial search results');
    }

    console.log('--- STEP 6: GUARDAR PROSPECTO A MI BASE ---');
    let savedSuccessfully = false;
    const saveBtn = page.locator('.bir-save-btn').first();
    if (await saveBtn.isVisible()) {
      await saveBtn.click();
      await page.waitForTimeout(1000);
      const btnText = await saveBtn.textContent();
      if (btnText?.includes('Guardado')) {
        savedSuccessfully = true;
        console.log('Prospect saved successfully to Mi Base.');
      } else {
        issues.P1.push('Botón "Guardar en Mi base" no cambió de estado visual a Guardado.');
        brokenActions.push('Save prospect from search results');
      }
    } else {
      issues.P1.push('Botón "Guardar en Mi base" no encontrado en las filas de resultados.');
      brokenActions.push('Find save button');
    }

    console.log('--- STEP 7: NAVEGACIÓN A MI BASE (/mi-base vs /mibase) ---');
    screensAudited.add('/mi-base');
    await page.goto(`${APP_URL}/mi-base`, { waitUntil: 'networkidle' });

    // Test duplicate route /mibase
    await page.goto(`${APP_URL}/mibase`, { waitUntil: 'networkidle' });
    screensAudited.add('/mibase');
    if (page.url().endsWith('/mibase')) {
      issues.P2.push('Rutas duplicadas sin redirección canónica: /mibase no redirige a /mi-base con replace/301.');
      brokenRoutes.push('/mibase (falta canonical redirect a /mi-base)');
    }

    // Back to /mi-base
    await page.goto(`${APP_URL}/mi-base`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const mbRowCount = await page.locator('.mb-row').count();
    console.log(`Mi Base prospect rows count: ${mbRowCount}`);

    if (mbRowCount === 0) {
      issues.P1.push('Mi Base: El prospecto guardado no aparece en la tabla de Mi Base del usuario activo.');
      brokenActions.push('Prospect appearance in Mi Base');
    } else {
      console.log('--- STEP 8: VER CONTACTO ---');
      const contactBadge = page.locator('.mb-td-contact').first();
      const hasContact = await contactBadge.isVisible();
      console.log(`Contact cell visible: ${hasContact}`);

      console.log('--- STEP 9: CAMBIAR ESTADO ---');
      const statusSelect = page.locator('.mb-status-select').first();
      if (await statusSelect.isVisible()) {
        await statusSelect.selectOption('PROSPECT');
        await page.waitForTimeout(500);
        console.log('Commercial status changed to PROSPECT.');
      } else {
        issues.P2.push('Selector de estado comercial en fila de Mi Base no disponible.');
      }

      console.log('--- STEP 10: AGREGAR NOTA Y PRÓXIMA ACCIÓN ---');
      const fichaBtn = page.locator('.mb-btn-ficha').first();
      if (await fichaBtn.isVisible()) {
        await fichaBtn.click();
        await page.waitForSelector('.mb-modal-card', { timeout: 5000 });
        screensAudited.add('Mi Base: Ficha Comercial');

        // Note textarea
        const noteArea = page.locator('textarea[placeholder*="nota"], .mb-form-textarea').first();
        if (await noteArea.isVisible()) {
          await noteArea.fill('Nota de auditoría: Cliente de prueba calificado para compra.');
        }

        // Next action input
        const actionInput = page.locator('input[placeholder*="próxima acción"], input[placeholder*="Enviar propuesta"]').first();
        if (await actionInput.isVisible()) {
          await actionInput.fill('Enviar propuesta formal');
        }

        // Save ficha
        const saveFichaBtn = page.locator('button:has-text("Guardar cambios"), button:has-text("Guardar ficha")').first();
        if (await saveFichaBtn.isVisible()) {
          await saveFichaBtn.click();
          await page.waitForTimeout(600);
        }

        // Close modal
        const closeBtn = page.locator('.mb-modal-close').first();
        if (await closeBtn.isVisible()) await closeBtn.click();
      }

      console.log('--- STEP 11: CREAR PROPUESTA COMERCIAL ---');
      const propBtn = page.locator('.mb-btn-propuesta').first();
      let proposalToken = null;

      if (await propBtn.isVisible()) {
        await propBtn.click();
        await page.waitForSelector('.mb-prop-modal-card, .mb-modal-card', { timeout: 5000 });
        screensAudited.add('Mi Base: Modal Crear Propuesta');

        // Fill proposal form
        const titleInput = page.locator('input[placeholder*="Ej: Lote"], input[name="title"]').first();
        if (await titleInput.isVisible()) {
          await titleInput.fill('Lote 500 Válvulas Esféricas Acero');
        }

        const priceInput = page.locator('input[type="number"], input[name="unitPrice"]').first();
        if (await priceInput.isVisible()) {
          await priceInput.fill('25000');
        }

        const submitPropBtn = page.locator('button:has-text("Crear y Generar Enlace"), button:has-text("Generar Propuesta")').first();
        if (await submitPropBtn.isVisible()) {
          await submitPropBtn.click();
          await page.waitForTimeout(1500);

          // Find generated link or token
          const linkInput = page.locator('.mb-prop-link-input, input[readonly]').first();
          if (await linkInput.isVisible()) {
            const fullLink = await linkInput.inputValue();
            console.log(`Generated proposal link: ${fullLink}`);
            const match = fullLink.match(/\/propuesta\/([a-zA-Z0-9_-]+)/);
            if (match) proposalToken = match[1];
          }
        }
      }

      console.log(`--- STEP 12: ABRIR PROPUESTA (/propuesta/:token) ---`);
      if (proposalToken) {
        screensAudited.add('/propuesta/:token');
        await page.goto(`${APP_URL}/propuesta/${proposalToken}`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1000);

        const propTitle = await page.locator('.propuesta-title').textContent().catch(() => null);
        console.log(`Proposal title rendered: "${propTitle?.trim()}"`);

        // Check sandbox badge & actions
        const acceptBtn = page.locator('button.btn-accept');
        const rejectBtn = page.locator('button.btn-reject');
        const hasAccept = await acceptBtn.isVisible();
        const hasReject = await rejectBtn.isVisible();
        console.log(`Buyer actions: accept=${hasAccept}, reject=${hasReject}`);

        if (hasAccept && hasReject) {
          console.log('--- STEP 13: ACEPTAR PROPUESTA ---');
          await acceptBtn.click();
          await page.waitForTimeout(1500);

          const statusBadge = await page.locator('.propuesta-status-badge').textContent().catch(() => null);
          console.log(`Updated status after acceptance: "${statusBadge?.trim()}"`);

          if (statusBadge?.toUpperCase().includes('ACEPTADA')) {
            mainFlowComplete = true;
          } else {
            issues.P1.push('Propuesta aceptada no actualizó su badge a ACEPTADA en pantalla.');
          }
        } else {
          issues.P1.push('Pantalla pública de propuesta no muestra botones Aceptar/Rechazar claramente separados.');
          brokenActions.push('Proposal accept/reject buttons missing');
        }
      } else {
        issues.P1.push('No se pudo generar o extraer el token de propuesta comercial desde Mi Base.');
        brokenActions.push('Generate commercial proposal');
      }
    }

    console.log('--- STEP 14: ESTADOS VACÍOS Y ERRORES ---');
    // Test invalid proposal token
    await page.goto(`${APP_URL}/propuesta/token-invalido-random-404`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.propuesta-error-card', { timeout: 8000 }).catch(() => null);
    const errorText = await page.locator('.propuesta-error-card, text=Propuesta no disponible, text=Propuesta no encontrada').first().textContent().catch(() => null);
    console.log(`Invalid proposal error card text: "${errorText?.trim()?.slice(0, 50)}..."`);
    if (!errorText) {
      issues.P2.push('Propuesta con token inválido no muestra tarjeta de error limpia.');
    }

    console.log('--- STEP 15: RESPONSIVE VIEWPORTS ---');
    const viewports = [
      { name: '1440px', width: 1440, height: 900 },
      { name: '1024px', width: 1024, height: 768 },
      { name: '768px', width: 768, height: 1024 },
      { name: '390px', width: 390, height: 844 }
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(`${APP_URL}/mi-base`, { waitUntil: 'networkidle' });
      const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientW = await page.evaluate(() => document.documentElement.clientWidth);
      if (scrollW > clientW + 5) {
        issues.P2.push(`Desborde horizontal (overflow-x) en ${vp.name} en /mi-base (${scrollW}px vs ${clientW}px).`);
      }
    }

    // Performance & console errors
    const uniqueErrors = Array.from(new Set(consoleErrors));
    if (uniqueErrors.length > 0) {
      issues.P3.push(`Errores menores en consola durante el recorrido (${uniqueErrors.length} advertencias/errores).`);
    }

  } catch (err) {
    console.error('Audit execution error:', err);
    issues.P0.push(`Error imprevisto durante ejecución de auditoría: ${err.message}`);
  } finally {
    if (browser) await browser.close();
  }

  console.log('\n==================================================');
  console.log('AUDIT RUN COMPLETED');
  console.log('==================================================');
  console.log(`TOTAL_SCREENS_AUDITED = ${screensAudited.size}`);
  console.log(`P0_BLOCKERS = ${issues.P0.length}`);
  console.log(`P1_COMMERCIAL_ISSUES = ${issues.P1.length}`);
  console.log(`P2_UX_ISSUES = ${issues.P2.length}`);
  console.log(`P3_LATER_IMPROVEMENTS = ${issues.P3.length}`);
  console.log(`MAIN_USER_FLOW_COMPLETE = ${mainFlowComplete ? 'YES' : 'NO'}`);
  console.log('P0:', issues.P0);
  console.log('P1:', issues.P1);
  console.log('P2:', issues.P2);
  console.log('P3:', issues.P3);
  console.log('Broken routes:', brokenRoutes);
  console.log('Broken actions:', brokenActions);
  console.log('Visual inconsistencies:', visualInconsistencies);
}

runAudit();
