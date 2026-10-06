import { ConicetWorkFirstResolver } from '../src/lib/search/conicet/ConicetWorkFirstResolver';

async function testCassiodoro() {
  const r = new ConicetWorkFirstResolver();
  const meta = await r.extractConicetWorkMetadata('http://hdl.handle.net/11336/179477');
  console.log('Cassiodoro meta:', meta);
}

testCassiodoro();
