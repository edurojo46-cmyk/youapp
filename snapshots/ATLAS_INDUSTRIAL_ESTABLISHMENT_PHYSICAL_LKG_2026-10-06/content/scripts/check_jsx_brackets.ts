import * as fs from 'fs';

const content = fs.readFileSync('src/pages/admin/atlas/AdminPersons.tsx', 'utf8');
const lines = content.split('\n');

let openTags: { tag: string; line: number }[] = [];
let braceCount = 0;
let parenCount = 0;
let bracketCount = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  for (let j = 0; j < line.length; j++) {
    const ch = line[j];
    if (ch === '{') braceCount++;
    if (ch === '}') braceCount--;
    if (ch === '(') parenCount++;
    if (ch === ')') parenCount--;
    if (ch === '[') bracketCount++;
    if (ch === ']') bracketCount--;
  }
}

console.log('Brace count balance:', braceCount);
console.log('Paren count balance:', parenCount);
console.log('Bracket count balance:', bracketCount);
