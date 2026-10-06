import 'dotenv/config';
import { AtlasSourceCanaryRunner } from '../src/lib/search/discovery/AtlasSourceCanaryRunner';

async function main() {
  const runner = new AtlasSourceCanaryRunner();
  await runner.runFullCanary();
}

main().catch(err => {
  console.error('Fatal error running 31 Source Canary:', err);
  process.exit(1);
});
