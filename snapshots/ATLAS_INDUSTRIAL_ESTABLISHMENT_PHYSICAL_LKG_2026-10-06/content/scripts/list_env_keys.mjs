import fs from 'fs';
const env = fs.readFileSync('.env', 'utf8');
console.log(env.split('\n').map(l => l.split('=')[0].trim()).filter(Boolean));
