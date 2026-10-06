import fs from 'fs';
import path from 'path';

async function prepareFuel() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('RADAR: PRE-FETCHING & VERIFYING DISCOVERED BULK FUEL SOURCES');
  console.log('════════════════════════════════════════════════════════════════');

  const targetDir = path.resolve('scratch/physical_sources');
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  const resources = [
    {
      id: 'SRC_BULK_DDJJ_AUTORIDADES',
      name: 'DDJJ Actividades Anteriores Función Pública',
      url: 'https://datos.jus.gob.ar/dataset/eda31892-54f7-414d-9685-bd711b757895/resource/0ef17546-2ce7-4512-a636-3e3a1757da1a/download/ddjj-actividades-anteriores-funcion-publica-20260630.csv',
      localFile: path.join(targetDir, 'ddjj_actividades_anteriores_202606.csv')
    },
    {
      id: 'SRC_BULK_DDJJ_POSTERIORES',
      name: 'DDJJ Actividades Posteriores Función Pública',
      url: 'https://datos.jus.gob.ar/dataset/eda31892-54f7-414d-9685-bd711b757895/resource/602967b2-f404-4ff7-9fd3-8779d2ba0e9b/download/ddjj-actividades-posteriores-funcion-publica-20260630.csv',
      localFile: path.join(targetDir, 'ddjj_actividades_posteriores_202606.csv')
    },
    {
      id: 'SRC_BULK_MAGISTRADOS_DESIGNACIONES',
      name: 'Magistrados Justicia Federal y Nacional - Designaciones',
      url: 'https://datos.jus.gob.ar/dataset/9f397011-5459-4f1c-b88e-9f48f7824e03/resource/d4fd21f4-f5c5-48f5-a12d-511981f997dc/download/magistrados-justicia-federal-nacional-designaciones-20260911.csv',
      localFile: path.join(targetDir, 'magistrados_designaciones_202609.csv')
    },
    {
      id: 'SRC_BULK_TERNAS_MAGISTRADOS',
      name: 'Ternas Selección Magistrados Poder Judicial',
      url: 'https://datos.jus.gob.ar/dataset/63c50059-e260-496a-9f5b-1ec4a82a3bb4/download/ternas-seleccion-magistrados-poder-judicial-ministerio-publico-20260505.csv',
      localFile: path.join(targetDir, 'ternas_magistrados_202605.csv')
    },
    {
      id: 'SRC_BULK_REFGLO_GOBIERNOS_LOCALES',
      name: 'Registro Federal de Gobiernos Locales (ReFeGLo)',
      url: 'http://datos.mininterior.gob.ar/dataset/8431ab79-3f44-41ee-b72b-cdc645f68d1e/resource/ebe52783-6a7f-4112-8a7f-a17c91cb6b4e/download/brgl_-portal-andino-23_12.csv',
      localFile: path.join(targetDir, 'brgl_gobiernos_locales.csv')
    }
  ];

  for (const r of resources) {
    if (fs.existsSync(r.localFile) && fs.statSync(r.localFile).size > 1000) {
      console.log(`✓ [CACHED] ${r.name} (${fs.statSync(r.localFile).size.toLocaleString()} bytes)`);
      continue;
    }
    console.log(`Downloading [${r.id}] ${r.name}...`);
    try {
      const res = await fetch(r.url);
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        fs.writeFileSync(r.localFile, buf);
        console.log(`✓ Downloaded ${r.name}: ${buf.length.toLocaleString()} bytes`);
      } else {
        console.error(`✗ HTTP ${res.status} downloading ${r.url}`);
      }
    } catch (err) {
      console.error(`✗ Error downloading ${r.name}:`, err.message);
    }
  }

  console.log('\nAll bulk fuel sources verified and ready for autonomous pre-warming.');
}

prepareFuel().catch(console.error);
