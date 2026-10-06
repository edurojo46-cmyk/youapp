import https from 'https';
import fs from 'fs';
import readline from 'readline';

const url = 'https://datasets.datos.mincyt.gob.ar/dataset/06ae9728-c376-47bd-9c41-fbdca68707c6/resource/5743ab23-022b-482a-a50a-afd547518ad3/download/personas_2020.csv';

https.get(url, (res) => {
  const rl = readline.createInterface({ input: res });
  let count = 0;
  const out = fs.createWriteStream('sicytar_sample.csv');
  rl.on('line', (line) => {
    out.write(line + '\n');
    count++;
    if (count > 105) {
      res.destroy();
      out.end();
      console.log('Done downloading 100 lines');
    }
  });
}).on('error', (e) => {
  console.error(e);
});