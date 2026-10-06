import fs from 'fs';

const events = JSON.parse(fs.readFileSync('reports/atlas/realtime/target_commit_events.json', 'utf8'));
const canaryEvents = events.filter(e => e.batch_id && (e.batch_id.includes('CANARY') || e.batch_id.includes('RECOVERY') || e.engine === 'V2_PRIMARY'));
console.log('Total V2/Canary events:', canaryEvents.length);
for (const e of canaryEvents) {
  console.log(`ts: ${new Date(e.ts).toISOString()} | batch_id: ${e.batch_id} | engine: ${e.engine} | in: ${e.input_rows} | caba_new: ${e.caba_true_new} | pba_new: ${e.pba_true_new} | target_new: ${e.target_true_new}`);
}
