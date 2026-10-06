import fs from 'fs';

const events = JSON.parse(fs.readFileSync('reports/atlas/realtime/target_commit_events.json', 'utf8'));
console.log('Total events in file:', events.length);
const recent = events.slice(-15);
console.log('Last 15 events:');
for (const e of recent) {
  console.log(`ts: ${new Date(e.ts).toISOString()} | batch_id: ${e.batch_id} | engine: ${e.engine || 'V4'} | in: ${e.input_rows} | caba_new: ${e.caba_true_new} | pba_new: ${e.pba_true_new} | target_new: ${e.target_true_new}`);
}
