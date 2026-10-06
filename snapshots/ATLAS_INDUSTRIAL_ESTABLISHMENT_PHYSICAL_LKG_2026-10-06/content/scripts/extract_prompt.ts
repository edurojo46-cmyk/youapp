import * as fs from 'fs';
const content = fs.readFileSync('C:/Users/Eduardo/.gemini/antigravity-ide/brain/27bac4f9-8bf1-45fb-a6df-23e57f58c207/.system_generated/logs/transcript_full.jsonl', 'utf8');
const lines = content.split('\n');
for (const line of lines) {
  if (line.includes('ATLAS - SOURCE KNOWLEDGE FIRST PLANNER V1')) {
    const obj = JSON.parse(line);
    fs.writeFileSync('C:/Users/Eduardo/.gemini/antigravity-ide/brain/0e0919f1-97bb-4fdb-9dc9-74ffa9ec048e/last_instruction.txt', obj.content);
    console.log('Saved last_instruction.txt');
    break;
  }
}
