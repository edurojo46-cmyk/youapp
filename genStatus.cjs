const fs = require('fs');

const j = fs.existsSync('goldJudgments.jsonl') ? 
  fs.readFileSync('goldJudgments.jsonl', 'utf-8').split('\n').filter(Boolean).map(JSON.parse) : [];

const judged = new Set(j.map(x => x.queryId));
const queries = require('./unlabelledCandidates.json').pool.map(x => x.queryId);

let md = '# Estado de Clasificación (Gold Set)\n\nAquí tienes la lista completa de las 152 consultas y su estado actual:\n\n';
let done = 0;

queries.forEach(q => {
  const isDone = judged.has(q);
  if (isDone) done++;
  md += `- [${isDone ? 'x' : ' '}] ${q}\n`;
});

md = `**Progreso: ${done} / 152 consultas clasificadas.**\n\n` + md;

fs.writeFileSync('query_status.md', md);
