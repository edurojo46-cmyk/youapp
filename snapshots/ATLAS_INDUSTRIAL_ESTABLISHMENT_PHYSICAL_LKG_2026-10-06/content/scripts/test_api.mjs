async function testApi() {
  const res = await fetch('http://localhost:5173/api/atlas/live-metrics');
  const data = await res.json();
  console.log('RAW LIVE METRICS API RESPONSE:', data);
}
testApi().catch(console.error);
