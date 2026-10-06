import fs from 'fs';
import path from 'path';

async function downloadIsic() {
  const url = 'https://unstats.un.org/unsd/classifications/Econ/download/In%20Text/ISIC_Rev_4_spanish_structure.txt';
  const outPath = path.resolve('server/data/ontology/isic_rev_4_spanish_structure.txt');
  console.log('Downloading official UN ISIC Rev 4 Spanish structure to', outPath);
  const res = await fetch(url);
  const buffer = await res.arrayBuffer();
  const dec = new TextDecoder('latin1');
  const text = dec.decode(buffer);
  fs.writeFileSync(outPath, text, 'utf8');
  console.log('Successfully saved', text.split('\n').length, 'lines to', outPath);
}

downloadIsic().catch(e => {
  console.error(e);
  process.exit(1);
});
