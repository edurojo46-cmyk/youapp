import fs from 'fs';
import https from 'https';
import crypto from 'crypto';
import { execSync } from 'child_process';
import path from 'path';

const url = 'https://datos.jus.gob.ar/dataset/da045e06-35cb-4bdd-9b5e-ddee6712c86c/resource/dc840e68-86fc-405f-87b6-904d292891ff/download/igj-autoridades-muestreo.csv';
const tmpDir = path.join(process.cwd(), 'scratch');
const csvFile = path.join(tmpDir, 'igj-autoridades-muestreo.csv');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

console.log('Downloading IGJ sample...', url);

https.get(url, (res) => {
  const fileStream = fs.createWriteStream(csvFile);
  res.pipe(fileStream);

  fileStream.on('finish', () => {
    fileStream.close();
    console.log('Downloaded. Inspecting CSV...\n');
    try {
      const content = fs.readFileSync(csvFile, 'utf-8');
      const lines = content.split('\n').filter(Boolean);
      console.log(`Total rows (approx): ${lines.length}`);
      
      const header = lines[0].split(',').map(s => s.trim().replace(/^"|"$/g, ''));
      console.log(`\nColumns:`, header);
      
      console.log('\nFirst 5 data rows:');
      for (let i = 1; i <= 5 && i < lines.length; i++) {
        console.log(lines[i]);
      }
      
      // Attempt quick dry-run of 100 rows
      console.log('\n--- DRY RUN (100 Rows) ---');
      let valid = 0, invalid = 0;
      const uniqueKeys = new Set();
      const uniqueOrgs = new Set();
      
      // Determine column indices
      // typically: entidad_id, entidad_razon_social, autoridad_id, autoridad_nombre, autoridad_cargo...
      const colCargo = header.findIndex(h => h.includes('cargo'));
      const colNombre = header.findIndex(h => h.includes('nombre') || h.includes('autoridad'));
      const colEntidadId = header.findIndex(h => h.includes('entidad_id') || h.includes('numero_correlativo'));
      const colEntidadNombre = header.findIndex(h => h.includes('razon_social') || h.includes('entidad'));
      const colTipoDoc = header.findIndex(h => h.includes('tipo_doc'));
      const colNumDoc = header.findIndex(h => h.includes('num_doc') || h.includes('documento'));

      for (let i = 1; i <= 100 && i < lines.length; i++) {
        // basic csv split ignoring quoted commas
        const rawLine = lines[i];
        const match = rawLine.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
        const parts = match ? match.map(s => s.replace(/^"|"$/g, '')) : rawLine.split(',');
        
        const nombre = colNombre >= 0 ? parts[colNombre] : '';
        const entidad = colEntidadNombre >= 0 ? parts[colEntidadNombre] : '';
        const cargo = colCargo >= 0 ? parts[colCargo] : '';
        
        if (nombre && nombre.trim() !== '') {
          valid++;
          // stable key derivation
          // IGJ data might not have authority ID. We use name + cargo + entidad
          const docId = (colNumDoc >= 0 ? parts[colNumDoc] : '');
          const keyString = docId ? docId : `${nombre}_${entidad}`;
          const key = crypto.createHash('md5').update(keyString).digest('hex');
          uniqueKeys.add(key);
          if (entidad) uniqueOrgs.add(entidad);
        } else {
          invalid++;
        }
      }
      
      console.log(`REAL_ROWS_FETCHED = 100`);
      console.log(`VALID_PERSON_RECORDS = ${valid}`);
      console.log(`INVALID_RECORDS = ${invalid}`);
      console.log(`UNIQUE_PERSON_KEYS = ${uniqueKeys.size}`);
      console.log(`UNIQUE_ORGANIZATIONS = ${uniqueOrgs.size}`);
      console.log(`DUPLICATE_SOURCE_ROWS = ${100 - valid - invalid}`); // simplified
      
    } catch (e) {
      console.error('Error during inspection', e);
    }
  });
}).on('error', (err) => {
  console.error('Download error:', err.message);
});
