import fs from 'fs';
import readline from 'readline';

async function countLines() {
  const p = 'scratch/physical_sources/igj_autoridades_genero_202603.csv';
  const rl = readline.createInterface({
    input: fs.createReadStream(p, { encoding: 'utf8' }),
    crlfDelay: Infinity
  });
  let lines = 0;
  for await (const line of rl) {
    lines++;
  }
  console.log(`TOTAL_SOURCE_ROWS: ${lines}`);
}

countLines().catch(console.error);
