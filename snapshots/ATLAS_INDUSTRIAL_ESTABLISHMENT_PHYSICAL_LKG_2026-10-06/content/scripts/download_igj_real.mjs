import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

async function downloadIgj() {
  const url = 'https://datos.jus.gob.ar/dataset/30f36834-49f0-4d9e-91d9-33621fb52b6d/resource/30558188-9c77-41cb-8c83-06f3bb84b0bf/download/igj-autoridades-genero-202603.csv';
  const outDir = 'scratch/physical_sources';
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'igj_autoridades_genero_202603.csv');

  console.log(`Starting real download of IGJ Autoridades Genero from: ${url}`);
  const t0 = Date.now();
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, buffer);
  const dt = Date.now() - t0;

  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  console.log(`Downloaded ${buffer.length} bytes in ${dt}ms`);
  console.log(`SHA-256: ${hash}`);

  // Count lines and preview header
  const text = buffer.toString('utf8');
  const lines = text.split('\n');
  console.log(`Total Lines: ${lines.length}`);
  console.log('Header:', lines[0]);
  console.log('Line 1:', lines[1]);
  console.log('Line 2:', lines[2]);
}

downloadIgj().catch(console.error);
