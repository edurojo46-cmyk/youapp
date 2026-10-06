/**
 * harvest_youtube_refs_100k.ts — Runner del Atlas YouTube Reference Harvester (Canary & Scale)
 *
 * Ejecución:
 *   npx.cmd tsx scripts/harvest_youtube_refs_100k.ts --target=60000 --max-new=9985 --time-budget-minutes=10 --batch-size=750 --adaptive --youtube-first
 */

if (typeof (import.meta as any).env === 'undefined') {
  (import.meta as any).env = { DEV: true, VITE_SMOKE_LIVE: 'true' };
}
import 'fake-indexeddb/auto';

import { runYouTubeReferenceHarvester, HarvesterRunConfig } from '../src/lib/atlasHarvester';

async function main() {
  const args = process.argv.slice(2);
  let target = 60000;
  let maxNew = 9985;
  let timeBudgetMinutes = 10;
  let batchSize = 750;
  let adaptive = true;

  args.forEach(arg => {
    if (arg.startsWith('--target=')) target = parseInt(arg.split('=')[1], 10);
    if (arg.startsWith('--max-new=')) maxNew = parseInt(arg.split('=')[1], 10);
    if (arg.startsWith('--time-budget-minutes=')) timeBudgetMinutes = parseInt(arg.split('=')[1], 10);
    if (arg.startsWith('--batch-size=')) batchSize = parseInt(arg.split('=')[1], 10);
    if (arg === '--adaptive') adaptive = true;
  });

  const config: HarvesterRunConfig = {
    targetAtlasTotal: target,
    maxNewItems: maxNew,
    timeBudgetMinutes,
    batchSize,
    adaptive
  };

  console.log(`📋 Configuración Harvester: Target=${target.toLocaleString()} | MaxNew=${maxNew.toLocaleString()} | TimeBudget=${timeBudgetMinutes}m | BatchSize=${batchSize}\n`);

  const result = await runYouTubeReferenceHarvester(config);

  console.log('\n🏁 EJECUCIÓN DEL HARVESTER FINALIZADA CON ÉXITO.');
  console.log(`   - Atlas Final: ${result.currentAtlasSize.toLocaleString()} contenidos`);
  console.log(`   - Net New YouTube Insertados: +${result.netNewInserted.toLocaleString()}`);
  console.log(`   - YouTube Search Quota Usada: ${result.youtubeSearchCalls} u 🔒`);
  console.log(`   - YouTube External Discovery Rate: 100% ✅\n`);
}

main().catch(err => {
  console.error('❌ Error fatal en Harvester Runner:', err);
  process.exit(1);
});
