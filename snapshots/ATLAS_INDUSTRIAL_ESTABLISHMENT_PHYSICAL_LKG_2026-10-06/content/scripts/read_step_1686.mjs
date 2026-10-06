import fs from 'fs';

const file = 'C:/Users/Eduardo/.gemini/antigravity-ide/brain/549aedbe-6898-4a4a-8c04-b63a8949ad4e/.system_generated/logs/transcript.jsonl';
const content = fs.readFileSync(file, 'utf8');
for (const line of content.split('\n')) {
  if (line.includes('"step_index":1686')) {
    const obj = JSON.parse(line);
    console.log(obj.content);
    break;
  }
}
