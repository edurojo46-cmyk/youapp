import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { EMAIL_EXTRACTION_REGEX, EmailNormalizerAndClassifier } from '../src/lib/atlasIndustrialEmail/EmailNormalizerAndClassifier.ts';

async function scanDatasets() {
  const dir = path.resolve('scratch/physical_sources');
  const targetFiles = [
    'productores_asesores_ssn.csv',
    'registro_profesionales_sss.csv',
    'registro_profesionales_historico_sss.csv',
    'compras_adjudicaciones.csv',
    'igj_autoridades_genero_202603.csv',
    'proveedores_modernizacion.csv',
    'ddjj_patrimoniales_2024.csv',
    'listado_mediadores_202608.csv',
    'listado_registros_seccionales_202608.csv'
  ];

  console.log('Scanning target datasets for valid professional email contacts...\n');

  for (const f of targetFiles) {
    const fullPath = path.join(dir, f);
    if (!fs.existsSync(fullPath)) {
      console.log(`[Missing] ${f}`);
      continue;
    }

    const stat = fs.statSync(fullPath);
    const rl = readline.createInterface({
      input: fs.createReadStream(fullPath, { encoding: 'latin1' }),
      crlfDelay: Infinity
    });

    let lines = 0;
    const uniqueEmails = new Set();

    for await (const line of rl) {
      lines++;
      const matches = line.match(EMAIL_EXTRACTION_REGEX);
      if (matches) {
        for (const raw of matches) {
          const norm = EmailNormalizerAndClassifier.normalizeEmail(raw);
          if (norm && norm.length > 5) {
            uniqueEmails.add(norm);
          }
        }
      }
    }

    console.log(`[${f}] (${(stat.size / 1024 / 1024).toFixed(1)} MB, ${lines.toLocaleString()} lines) -> ${uniqueEmails.size.toLocaleString()} unique valid emails.`);
  }
}

scanDatasets().catch(console.error);
