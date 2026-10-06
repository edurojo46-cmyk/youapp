process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import fs from 'fs';
import https from 'https';
import crypto from 'crypto';
import { execSync } from 'child_process';
import path from 'path';

const url = 'https://biep.modernizacion.gob.ar/apps/directorio/archivos/datos.zip';
const tmpDir = path.join(process.cwd(), 'scratch', 'apn_data');
const zipFile = path.join(tmpDir, 'datos.zip');

if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

console.log('Downloading...', url);

https.get(url, (res) => {
  const fileStream = fs.createWriteStream(zipFile);
  res.pipe(fileStream);

  fileStream.on('finish', () => {
    fileStream.close();
    console.log('Downloaded. Extracting...');
    try {
      execSync(`tar -xf "${zipFile}" -C "${tmpDir}"`);
      console.log('Extracted.');
      
      const files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.csv'));
      console.log('CSV files found:', files);
      
      for (const file of files) {
        console.log(`\n--- Inspecting ${file} ---`);
        const content = fs.readFileSync(path.join(tmpDir, file), 'utf-8');
        const lines = content.split('\n');
        console.log(`Total rows (approx): ${lines.length}`);
        console.log('First 5 lines:');
        console.log(lines.slice(0, 5).join('\n'));
      }
    } catch (e) {
      console.error('Error during extraction/inspection', e);
    }
  });
}).on('error', (err) => {
  console.error('Download error:', err.message);
});
