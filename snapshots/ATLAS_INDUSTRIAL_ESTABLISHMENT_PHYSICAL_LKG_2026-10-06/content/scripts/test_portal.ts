async function countGCBARecords() {
  try {
    const res = await fetch('https://cdn.buenosaires.gob.ar/datosabiertos/datasets/ministerio-de-economia-y-finanzas/autoridades-superiores-funcionarios/autoridades_superiores_y_funcionarios_2024.csv');
    const text = await res.text();
    const lines = text.trim().split('\n');
    console.log('Total lines in 2024 autoridades:', lines.length);
  } catch (e: any) {
    console.log('Err:', e.message);
  }
}

countGCBARecords();
