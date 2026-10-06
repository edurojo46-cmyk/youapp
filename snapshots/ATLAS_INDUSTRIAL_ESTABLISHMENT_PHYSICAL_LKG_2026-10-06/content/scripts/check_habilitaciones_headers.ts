async function checkHeaders() {
  const years = ['2026', '2025', '2024', '2023', '2022', '2020', '2021', '2019', '2015-a-2018'];
  for (const y of years) {
    const url = `https://cdn.buenosaires.gob.ar/datosabiertos/datasets/agencia-gubernamental-de-control/habilitaciones-aprobadas/habilitaciones-aprobadas${y}.csv`;
    try {
      const res = await fetch(url, { headers: { 'Range': 'bytes=0-1024' } });
      const txt = await res.text();
      const firstLine = txt.split('\n')[0];
      console.log(`Year ${y}: (${res.status}) ${firstLine.slice(0, 100)}`);
    } catch (e: any) {
      console.log(`Year ${y}: Error ${e.message}`);
    }
  }
}
checkHeaders();
