import pg from 'pg';
import dotenv from 'dotenv';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import { AtlasThroughputSprint } from './run_atlas_throughput_sprint.mjs';

dotenv.config();

async function diagnose() {
  console.log('Testing sprint components...');
  const sprint = new AtlasThroughputSprint(100, 10);
  sprint.buildSourceFleet();
  console.log(`Sources activated: ${sprint.sourcesActivated.length}`);

  const motor = sprint.sourcesActivated[0];
  const url = `${motor.endpoint}?filter=${motor.filterParam}&per_page=200&cursor=*&mailto=contact@youapp.com`;
  console.log(`Fetching direct URL: ${url}`);
  const res = await fetch(url, {
    headers: { 'User-Agent': 'AtlasAutonomousDiscovery/2.0 (+https://youapp.com; public research verification)' }
  });
  console.log(`Status: ${res.status} ${res.statusText}`);
  const text = await res.text();
  console.log(`Body length: ${text.length}, preview: ${text.slice(0, 300)}`);
  process.exit(0);
}

diagnose().catch(err => {
  console.error('DIAGNOSE ERROR:', err);
  process.exit(1);
});
