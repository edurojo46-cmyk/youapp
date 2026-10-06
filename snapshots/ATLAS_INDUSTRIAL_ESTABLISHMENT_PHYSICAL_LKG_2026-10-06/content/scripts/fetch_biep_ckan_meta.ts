process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import fetch from 'node-fetch';
import fs from 'fs';

async function checkPackage() {
  const url = 'https://datos.gob.ar/api/3/action/package_show?id=acc95b30-a16e-5950-aa41-7467490690aa';
  const res = await fetch(url);
  const json: any = await res.json();
  fs.writeFileSync('scratch/biep_package_metadata.json', JSON.stringify(json, null, 2), 'utf8');
  console.log('Package metadata written to scratch/biep_package_metadata.json');
}

checkPackage().catch(console.error);
