import fs from 'fs';
import path from 'path';

async function main() {
  const logFiles = [
    // Previous session tasks
    'C:/Users/Eduardo/.gemini/antigravity-ide/brain/541d43b3-ad55-4641-9284-1b04bc24e1c6/.system_generated/tasks/task-5613.log',
    'C:/Users/Eduardo/.gemini/antigravity-ide/brain/541d43b3-ad55-4641-9284-1b04bc24e1c6/.system_generated/tasks/task-5930.log',
    'C:/Users/Eduardo/.gemini/antigravity-ide/brain/541d43b3-ad55-4641-9284-1b04bc24e1c6/.system_generated/tasks/task-5946.log',
    'C:/Users/Eduardo/.gemini/antigravity-ide/brain/541d43b3-ad55-4641-9284-1b04bc24e1c6/.system_generated/tasks/task-6171.log',
    'C:/Users/Eduardo/.gemini/antigravity-ide/brain/541d43b3-ad55-4641-9284-1b04bc24e1c6/.system_generated/tasks/task-6207.log',
    // Current session tasks
    'C:/Users/Eduardo/.gemini/antigravity-ide/brain/e3e09913-ec3e-4f02-bd71-536fda8d536b/.system_generated/tasks/task-15.log',
    'C:/Users/Eduardo/.gemini/antigravity-ide/brain/e3e09913-ec3e-4f02-bd71-536fda8d536b/.system_generated/tasks/task-28.log',
    'C:/Users/Eduardo/.gemini/antigravity-ide/brain/e3e09913-ec3e-4f02-bd71-536fda8d536b/.system_generated/tasks/task-57.log',
    'C:/Users/Eduardo/.gemini/antigravity-ide/brain/e3e09913-ec3e-4f02-bd71-536fda8d536b/.system_generated/tasks/task-142.log',
    'C:/Users/Eduardo/.gemini/antigravity-ide/brain/e3e09913-ec3e-4f02-bd71-536fda8d536b/.system_generated/tasks/task-430.log',
    'C:/Users/Eduardo/.gemini/antigravity-ide/brain/e3e09913-ec3e-4f02-bd71-536fda8d536b/.system_generated/tasks/task-470.log',
    'C:/Users/Eduardo/.gemini/antigravity-ide/brain/e3e09913-ec3e-4f02-bd71-536fda8d536b/.system_generated/tasks/task-510.log',
    'C:/Users/Eduardo/.gemini/antigravity-ide/brain/e3e09913-ec3e-4f02-bd71-536fda8d536b/.system_generated/tasks/task-544.log',
    'C:/Users/Eduardo/.gemini/antigravity-ide/brain/e3e09913-ec3e-4f02-bd71-536fda8d536b/.system_generated/tasks/task-569.log'
  ];

  console.log('--- RECONSTRUCTING TIMELINE FROM TASK LOGS ---');
  for (const f of logFiles) {
    if (!fs.existsSync(f)) continue;
    const stat = fs.statSync(f);
    const content = fs.readFileSync(f, 'utf8');
    const lines = content.split('\n').filter(l => l.trim().length > 0);
    const firstLine = lines[0] || '';
    const lastLine = lines[lines.length - 1] || '';
    
    // Look for timestamps or checkpoint lines
    const checkpoints = lines.filter(l => l.includes('CHECKPOINT') || l.includes('TARGET') || l.includes('FATAL') || l.includes('Throttling') || l.includes('PROGRESS'));
    console.log(`\nLOG: ${path.basename(f)} (size: ${stat.size}, modified: ${stat.mtime.toISOString()})`);
    console.log(`  Lines: ${lines.length}`);
    if (checkpoints.length > 0) {
      console.log(`  Highlights:`);
      checkpoints.slice(0, 5).forEach(c => console.log(`    ${c.trim()}`));
      if (checkpoints.length > 5) {
        console.log(`    ... (${checkpoints.length - 5} more)`);
        checkpoints.slice(-3).forEach(c => console.log(`    ${c.trim()}`));
      }
    } else {
      console.log(`  Last 2 lines:`);
      lines.slice(-2).forEach(l => console.log(`    ${l.trim()}`));
    }
  }
}

main().catch(console.error);
