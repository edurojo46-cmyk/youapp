import 'dotenv/config';
import { AtlasFuelLedger } from '../src/lib/search/discovery/AtlasFuelLedger';

async function main() {
  const ledger = new AtlasFuelLedger();
  ledger.generateLedger();
}

main().catch(err => {
  console.error('Fatal error generating fuel ledger:', err);
  process.exit(1);
});
