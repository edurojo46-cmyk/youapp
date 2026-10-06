import { AtlasThroughputSprint } from './run_atlas_throughput_sprint.mjs';

async function testOaiPages() {
  const sprint = new AtlasThroughputSprint(100, 10);
  sprint.buildSourceFleet();
  const motor = sprint.sourcesActivated[0];
  console.log(`Testing motor: ${motor.name}`);

  for (let i = 1; i <= 3; i++) {
    const t0 = Date.now();
    const raw = await sprint.fetchRemoteOaiStream(motor);
    console.log(`Page ${i}: ${raw.length} candidates in ${Date.now() - t0}ms | Token: ${motor.resumptionToken ? motor.resumptionToken.slice(0, 30) : 'none'}`);
  }
}

testOaiPages().catch(console.error);
