import 'dotenv/config';
import { AtlasAlwaysOnSupervisor } from '../src/lib/orchestrator/induction/AtlasAlwaysOnRuntime';

async function main() {
  console.log('🚀 Booting ATLAS ALWAYS-ON 24/7 RUNTIME SERVICE...');
  const supervisor = new AtlasAlwaysOnSupervisor();
  await supervisor.start(); // Runs indefinitely
}

main().catch(err => {
  console.error('Fatal crash in Atlas Always-On Runtime:', err);
  process.exit(1);
});
