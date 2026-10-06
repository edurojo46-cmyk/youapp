import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { AtlasPentaRadarReplenisher } from '../src/lib/search/discovery/AtlasPentaRadarReplenisher';

async function main() {
  const ledgerPath = path.resolve('reports/atlas/people/atlas_fuel_ledger.json');
  let remainingFuel = 722000;
  if (fs.existsSync(ledgerPath)) {
    const data = JSON.parse(fs.readFileSync(ledgerPath, 'utf-8'));
    remainingFuel = data.CERTIFIED_SOURCE_ROWS_REMAINING || 722000;
  }

  const replenisher = new AtlasPentaRadarReplenisher();
  replenisher.replenishFuelBuffer(remainingFuel);
}

main().catch(err => {
  console.error('Fatal error running Penta Radar fuel replenishment:', err);
  process.exit(1);
});
