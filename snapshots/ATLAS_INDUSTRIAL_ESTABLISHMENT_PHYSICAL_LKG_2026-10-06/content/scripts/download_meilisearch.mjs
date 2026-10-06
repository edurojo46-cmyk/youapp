import fs from 'fs';
import path from 'path';
import https from 'https';

const binDir = path.resolve('bin');
fs.mkdirSync(binDir, { recursive: true });
const targetPath = path.join(binDir, 'meilisearch.exe');

if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 10000000) {
  console.log('Meilisearch binary already exists at:', targetPath);
  process.exit(0);
}

const url = 'https://github.com/meilisearch/meilisearch/releases/download/v1.12.8/meilisearch-windows-amd64.exe';

console.log(`Downloading Meilisearch from ${url}...`);

function download(downloadUrl, dest) {
  https.get(downloadUrl, (res) => {
    if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
      console.log('Following redirect to:', res.headers.location);
      return download(res.headers.location, dest);
    }
    if (res.statusCode !== 200) {
      console.error(`Failed to download: HTTP ${res.statusCode}`);
      process.exit(1);
    }

    const file = fs.createWriteStream(dest);
    const total = parseInt(res.headers['content-length'] || '0', 10);
    let downloaded = 0;

    res.on('data', (chunk) => {
      downloaded += chunk.length;
      if (total > 0 && downloaded % (5 * 1024 * 1024) < chunk.length) {
        console.log(`Downloaded ${(downloaded / 1024 / 1024).toFixed(1)} MB / ${(total / 1024 / 1024).toFixed(1)} MB (${((downloaded / total) * 100).toFixed(0)}%)...`);
      }
    });

    res.pipe(file);
    file.on('finish', () => {
      file.close(() => {
        console.log('Meilisearch download complete:', dest);
      });
    });
  }).on('error', (err) => {
    fs.unlinkSync(dest);
    console.error('Download error:', err.message);
    process.exit(1);
  });
}

download(url, targetPath);
