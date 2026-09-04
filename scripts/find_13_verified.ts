import fs from 'fs';

const logPath = 'C:\\Users\\Eduardo\\.gemini\\antigravity-ide\\brain\\a1c5284f-3194-48ca-b85b-b39604695364\\.system_generated\\tasks\\task-2535.log';
const utf8Data = fs.readFileSync(logPath, 'utf8');
let lines = utf8Data.split('\n');

let currentQuery = '';
let isVerified = false;
let currentBlock = [];
const verifiedItems = [];

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('QUERY')) {
        if (isVerified) {
            verifiedItems.push({ query: currentQuery, block: currentBlock.join('\n') });
        }
        currentQuery = lines[i+1]?.trim() || '';
        isVerified = false;
        currentBlock = [];
    }
    
    currentBlock.push(line);
    
    if (line.includes('VERIFIED_LOCAL_REPAIRABLE')) {
        isVerified = true;
    }
}
if (isVerified) {
    verifiedItems.push({ query: currentQuery, block: currentBlock.join('\n') });
}

console.log(`Found ${verifiedItems.length} VERIFIED items.`);
for (const item of verifiedItems) {
    console.log(`- ${item.query}`);
}
