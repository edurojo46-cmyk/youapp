import 'dotenv/config';
import { AtlasSourceYieldRanker } from '../src/lib/search/discovery/AtlasSourceYieldRanker';

async function main() {
  const ranker = new AtlasSourceYieldRanker();
  ranker.rankSources();
}

main().catch(err => {
  console.error('Fatal error ranking sources:', err);
  process.exit(1);
});
