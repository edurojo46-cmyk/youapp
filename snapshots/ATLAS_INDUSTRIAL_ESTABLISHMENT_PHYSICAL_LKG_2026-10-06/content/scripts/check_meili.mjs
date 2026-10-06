async function check() {
  try {
    const res = await fetch('http://127.0.0.1:7700/health');
    console.log('Meilisearch Health:', await res.json());
    const statsRes = await fetch('http://127.0.0.1:7700/indexes/atlas_people_discovery_gate32_delta/stats');
    if (statsRes.ok) {
      console.log('Index Stats:', await statsRes.json());
    } else {
      console.log('Index Status:', statsRes.status);
    }
  } catch (err) {
    console.error('Meili check failed:', err.message);
  }
}
check();
