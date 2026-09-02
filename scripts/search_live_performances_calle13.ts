async function searchLiveCalle13() {
  console.log('Buscando interpretaciones en vivo auténticas de Calle 13 La Perla:');

  // Buscar en Wikipedia / Wikidata o archivos públicos
  const liveEvents = [
    'Calle 13 La Perla Viña del Mar',
    'Calle 13 La Perla Latin Grammy',
    'Calle 13 La Perla Luna Park',
    'Calle 13 La Perla en vivo'
  ];

  for (const event of liveEvents) {
    console.log(`\nConsultando Dailymotion para "${event}"...`);
    const params = new URLSearchParams({
      search: event,
      fields: 'id,title,description,duration,created_time,thumbnail_url,owner',
      limit: '20'
    });
    try {
      const res = await fetch(`https://api.dailymotion.com/videos?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        for (const item of (json.list || [])) {
          const t = item.title.toLowerCase();
          if (t.includes('perla') && (t.includes('calle 13') || t.includes('residente') || t.includes('blades'))) {
            console.log(`  -> [DM] ${item.title} (ID: ${item.id})`);
          }
        }
      }
    } catch {}
  }
}

searchLiveCalle13();
