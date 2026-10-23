import fs from 'fs';
import path from 'path';

const distDir = path.resolve('dist');

if (fs.existsSync(distDir)) {
  const indexHtml = path.join(distDir, 'index.html');
  if (fs.existsSync(indexHtml)) {
    // 1. 404.html for SPA static host fallback
    fs.copyFileSync(indexHtml, path.join(distDir, '404.html'));

    // 2. /recomendados/index.html for direct HTTP 200 on GitHub Pages
    const recDir = path.join(distDir, 'recomendados');
    if (!fs.existsSync(recDir)) fs.mkdirSync(recDir, { recursive: true });
    fs.copyFileSync(indexHtml, path.join(recDir, 'index.html'));

    // 3. /productos-recomendados/index.html
    const prodRecDir = path.join(distDir, 'productos-recomendados');
    if (!fs.existsSync(prodRecDir)) fs.mkdirSync(prodRecDir, { recursive: true });
    fs.copyFileSync(indexHtml, path.join(prodRecDir, 'index.html'));

    // 4. CNAME
    const cnameSource = path.resolve('public/CNAME');
    if (fs.existsSync(cnameSource)) {
      fs.copyFileSync(cnameSource, path.join(distDir, 'CNAME'));
    }

    console.log('[postbuild] Created dist/404.html, dist/recomendados/index.html, dist/CNAME successfully.');
  }
}
