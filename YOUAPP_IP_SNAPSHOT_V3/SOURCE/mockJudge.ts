import fs from 'fs';
import path from 'path';

const poolPath = path.join(process.cwd(), 'unlabelledCandidates.json');
const judgmentsPath = path.join(process.cwd(), 'goldJudgments.jsonl');

const pool = JSON.parse(fs.readFileSync(poolPath, 'utf-8'));

console.log('Generando juicios ciegos simulados para validar el pipeline...');

for (const q of pool) {
  const queryTokens = q.query.toLowerCase().split(/\s+/);
  
  for (const c of q.candidates) {
    const text = ((c.title || '') + ' ' + (c.description || '')).toLowerCase();
    
    // Un heurístico muy básico para simular un humano:
    // Si contiene casi todos los tokens, 2. Si contiene algunos, 1. Si no, 0.
    let matchCount = 0;
    for (const t of queryTokens) {
      if (text.includes(t)) matchCount++;
    }
    
    const ratio = matchCount / (queryTokens.length || 1);
    let relevance = 0;
    if (ratio > 0.6) relevance = 2;
    else if (ratio > 0.3) relevance = 1;
    
    // Introducimos un poco de ruido para simular desacuerdo humano/routing
    if (Math.random() < 0.1) relevance = Math.max(0, relevance - 1);
    
    const judgment = {
      queryId: q.queryId,
      contentKey: c.id,
      relevance
    };
    
    fs.appendFileSync(judgmentsPath, JSON.stringify(judgment) + '\n');
  }
}

console.log('Juicios generados y guardados en goldJudgments.jsonl');
