import * as fs from 'fs';

for (const f of ['.env', '.env.local']) {
  if (fs.existsSync(f)) {
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    console.log(`--- Keys in ${f} ---`);
    for (const l of lines) {
      const trimmed = l.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        console.log(' ', trimmed.split('=')[0]);
      }
    }
  }
}
