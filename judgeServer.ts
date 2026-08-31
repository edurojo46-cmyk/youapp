import express from 'express';
import fs from 'fs';
import path from 'path';
import bodyParser from 'body-parser';

const app = express();
app.use(bodyParser.json());

const poolPath = path.join(process.cwd(), 'unlabelledCandidates.json');
const judgmentsPath = path.join(process.cwd(), 'goldJudgments.jsonl');

app.get('/', (req, res) => {
  const htmlPath = path.join(process.cwd(), 'judgeUI.html');
  if (fs.existsSync(htmlPath)) {
    res.sendFile(htmlPath);
  } else {
    res.send('judgeUI.html not found');
  }
});

app.get('/data', (req, res) => {
  let pool = [];
  let judgments = [];
  
  if (fs.existsSync(poolPath)) {
    const rawData = JSON.parse(fs.readFileSync(poolPath, 'utf-8'));
    pool = rawData.pool || rawData; // backwards compatibility
  }
  
  if (fs.existsSync(judgmentsPath)) {
    const lines = fs.readFileSync(judgmentsPath, 'utf-8').split('\n').filter(l => l.trim().length > 0);
    judgments = lines.map(l => JSON.parse(l));
  }
  
  res.json({ pool, judgments });
});

app.post('/judge', (req, res) => {
  const { queryId, contentKey, relevance } = req.body;
  if (queryId && contentKey && typeof relevance === 'number') {
    const line = JSON.stringify({ queryId, contentKey, relevance }) + '\n';
    fs.appendFileSync(judgmentsPath, line);
    res.json({ success: true });
  } else {
    res.status(400).json({ error: 'invalid payload' });
  }
});

const PORT = 3001;
app.listen(PORT, '127.0.0.1', () => {
  console.log('Blind Judge UI is running at http://127.0.0.1:' + PORT);
});
