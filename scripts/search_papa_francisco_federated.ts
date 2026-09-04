async function searchFederated() {
  const queries = [
    'entrevista papa francisco',
    'entrevista al papa francisco',
    'papa francisco entrevista exclusiva',
    'papa francisco reportaje'
  ];

  for (const q of queries) {
    console.log(`\n── Buscando: "${q}" ──`);
    const dmUrl = `https://api.dailymotion.com/videos?search=${encodeURIComponent(q)}&fields=id,title,description,duration,created_time,thumbnail_url,owner&limit=5`;
    const res = await fetch(dmUrl);
    if (res.ok) {
      const json = await res.json();
      (json.list || []).forEach((v: any) => {
        console.log(`  [${v.id}] (${v.duration}s) "${v.title}"`);
      });
    }
  }
}

searchFederated().catch(console.error);
