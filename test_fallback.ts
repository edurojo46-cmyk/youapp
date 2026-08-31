import { executeSearch } from './src/lib/search/searchEngine';
import { telemetryUtilitySource } from './src/lib/search/cache/telemetryCache';
async function run() {
  await telemetryUtilitySource.initialize();
  await executeSearch('student film project', { routingMode: 'dynamic', utilitySource: telemetryUtilitySource });
}
run();
