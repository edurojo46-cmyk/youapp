import 'dotenv/config';
import { AtlasVerifiedExpansionEngine } from '../src/lib/search/discovery/AtlasVerifiedExpansionEngine';

async function main() {
  const engine = new AtlasVerifiedExpansionEngine();
  await engine.runExpansionTo1M();
}

main().catch(err => {
  console.error('Fatal error running 1M expansion engine:', err);
  process.exit(1);
});
