import fs from 'fs';
import path from 'path';
import readline from 'readline';
import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function inspectBiep() {
  const filePath = path.resolve('scratch/biep_preflight/datos.csv');
  const fileStream = fs.createReadStream(filePath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let count = 0;
  const sampleRows: any[] = [];
  const periods = new Set<string>();
  const escalafones = new Set<string>();
  const contractTypes = new Set<string>();
  const sampleNames: string[] = [];

  for await (const line of rl) {
    if (!line.trim()) continue;
    count++;
    if (count === 1) continue;

    const parts = line.split(';').map(p => p.trim().replace(/^["']|["']$/g, ''));
    const [doc, apellido_y_nombre, escalafon, tipo_contratacion, organismo, tipo_administracion, telefono, periodo] = parts;

    if (periodo) periods.add(periodo);
    if (escalafon) escalafones.add(escalafon);
    if (tipo_contratacion) contractTypes.add(tipo_contratacion);

    if (sampleRows.length < 5) {
      sampleRows.push({
        doc: doc ? `${doc.slice(0, 2)}***${doc.slice(-2)}` : 'N/A', // MASKED FOR PRIVACY
        apellido_y_nombre,
        escalafon,
        tipo_contratacion,
        organismo,
        tipo_administracion,
        periodo
      });
    }

    if (sampleNames.length < 500 && apellido_y_nombre) {
      sampleNames.push(apellido_y_nombre);
    }
  }

  console.log('--- SAMPLE ROWS (MASKED DNI) ---');
  console.table(sampleRows);
  console.log('\nPeriods found:', Array.from(periods));
  console.log('Sample contract types:', Array.from(contractTypes).slice(0, 5));
  console.log('Sample escalafones:', Array.from(escalafones).slice(0, 5));

  // Check overlap against Atlas Discovery
  const { data: atlasSample } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('display_name')
    .limit(1000);

  const atlasNames = new Set((atlasSample || []).map(a => a.display_name.toLowerCase()));
  let overlapCount = 0;
  for (const name of sampleNames) {
    if (atlasNames.has(name.toLowerCase())) {
      overlapCount++;
    }
  }

  console.log(`\nSample Overlap test: ${overlapCount} / ${sampleNames.length} names found in Atlas sample.`);
}

inspectBiep().catch(console.error);
