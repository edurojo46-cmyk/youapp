import * as fs from 'fs';

const content = fs.readFileSync('src/pages/admin/atlas/AdminPersons.tsx', 'utf8');
const lines = content.split('\n');

let braceCount = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  for (let j = 0; j < line.length; j++) {
    const ch = line[j];
    if (ch === '{') braceCount++;
    if (ch === '}') {
      braceCount--;
      if (braceCount < 0) {
        console.log(`First unbalanced closing brace at line ${i + 1}: ${line}`);
        process.exit(0);
      }
    }
  }
}
