import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:5175';
const viewports = [
  { width: 1440, height: 900, name: 'Desktop Large (1440px)' },
  { width: 1024, height: 768, name: 'Desktop Medium / Tablet Landscape (1024px)' },
  { width: 768, height: 1024, name: 'Tablet Portrait (768px)' },
  { width: 390, height: 844, name: 'Mobile (390px iPhone 14/15)' }
];

const paths = [
  '/',
  '/search/personas',
  '/search/contactos',
  '/search/organizaciones',
  '/mi-base'
];

async function runResponsiveCheck() {
  console.log('==================================================');
  console.log('ATLAS UI — RESPONSIVE VERIFICATION (1440, 1024, 768, 390)');
  console.log('==================================================\n');

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  let allPass = true;

  try {
    for (const vp of viewports) {
      console.log(`\nTesting Viewport: ${vp.name}...`);
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();

      for (const path of paths) {
        const url = `${BASE_URL}${path}`;
        await page.goto(url, { waitUntil: 'networkidle' });
        await page.waitForTimeout(500);

        // Check if page overflows horizontally (document.documentElement.scrollWidth > window.innerWidth)
        const overflow = await page.evaluate(() => {
          const bodyOverflow = document.body.scrollWidth > window.innerWidth + 5;
          const docOverflow = document.documentElement.scrollWidth > window.innerWidth + 5;
          return bodyOverflow || docOverflow;
        });

        // Check header title exists
        const heading = await page.textContent('h1, h2');

        if (!overflow && heading) {
          console.log(`  ✓ ${path.padEnd(24)} (${vp.width}x${vp.height}): PASS (No horizontal overflow, title: "${heading.trim().slice(0, 30)}")`);
        } else {
          console.warn(`  ✗ ${path.padEnd(24)} (${vp.width}x${vp.height}): FAIL (overflow: ${overflow}, heading: ${heading})`);
          allPass = false;
        }
      }

      await context.close();
    }

    if (allPass) {
      console.log('\n✓ ALL RESPONSIVE VIEWPORT CHECKS PASSED (1440, 1024, 768, 390)');
    } else {
      console.error('\n✗ SOME VIEWPORT CHECKS FAILED');
      process.exit(1);
    }
  } finally {
    await browser.close();
  }
}

runResponsiveCheck().catch(err => {
  console.error('Responsive check error:', err);
  process.exit(1);
});
