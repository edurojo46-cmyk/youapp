import { spawn } from 'child_process';

function runIngest() {
  return new Promise((resolve, reject) => {
    const p = spawn('npx.cmd', ['ts-node', 'src/scripts/ingest_gcba_v2.ts', 'REAL'], { shell: true });
    
    let output = '';
    p.stdout.on('data', (d) => output += d.toString());
    p.stderr.on('data', (d) => output += d.toString());
    
    p.on('close', (code) => {
      resolve({ code, output });
    });
  });
}

async function runConcurrencyTest() {
  console.log('Starting two workers simultaneously...');
  const [res1, res2] = await Promise.all([
    runIngest(),
    runIngest()
  ]);
  
  console.log('Worker 1 Output:\n', (res1 as any).output);
  console.log('Worker 2 Output:\n', (res2 as any).output);
}

runConcurrencyTest();
