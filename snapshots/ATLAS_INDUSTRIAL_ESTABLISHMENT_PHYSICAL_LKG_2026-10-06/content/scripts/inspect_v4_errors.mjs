import fs from 'fs';
const content = fs.readFileSync('C:\\Users\\Eduardo\\.gemini\\antigravity-ide\\brain\\549aedbe-6898-4a4a-8c04-b63a8949ad4e\\.system_generated\\tasks\\task-1348.log', 'utf8');
const lines = content.split('\n');
lines.forEach((l, idx) => {
  if (l.includes('V4_FALLBACK_ERROR') || l.includes('[V4 Fallback Error]')) {
    console.log(`Line ${idx}: ${l}`);
  }
});
