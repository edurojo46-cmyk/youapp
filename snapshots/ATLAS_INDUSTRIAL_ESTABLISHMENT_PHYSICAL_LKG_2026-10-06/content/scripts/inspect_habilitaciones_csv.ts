async function inspectHabilitacionesCsv() {
  const url = 'https://cdn.buenosaires.gob.ar/datosabiertos/datasets/agencia-gubernamental-de-control/habilitaciones-aprobadas/habilitaciones-aprobadas2026.csv';
  console.log('Fetching head of 2026 CSV:', url);
  try {
    const res = await fetch(url, { headers: { 'Range': 'bytes=0-4096' } });
    console.log('Status:', res.status);
    const text = await res.text();
    const lines = text.split('\n');
    console.log('Total lines in chunk:', lines.length);
    console.log('Header line:\n', lines[0]);
    console.log('\nSample line 1:\n', lines[1]);
    console.log('\nSample line 2:\n', lines[2]);
  } catch (err: any) {
    console.error('Error fetching 2026:', err.message);
  }
}
inspectHabilitacionesCsv();
