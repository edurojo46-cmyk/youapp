import 'dotenv/config';
import { Atlas15MExpansionEngine } from '../src/lib/search/discovery/Atlas15MExpansionEngine';

async function main() {
  const engine = new Atlas15MExpansionEngine();
  await engine.runExpansionTo15M();
}

main().catch(err => {
  console.error('Fatal error running 1.5M expansion engine:', err);
  process.exit(1);
});
