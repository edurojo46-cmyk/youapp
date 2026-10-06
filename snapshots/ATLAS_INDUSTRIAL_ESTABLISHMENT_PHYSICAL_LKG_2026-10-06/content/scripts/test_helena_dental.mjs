async function testCompanyProducts() {
  const getUrl = 'https://helena.anmat.gob.ar/Boletin/Default.aspx';
  const getRes = await fetch(getUrl);
  const initialHtml = await getRes.text();

  const vs = initialHtml.match(/id="__VIEWSTATE"\s+value="([^"]+)"/)?.[1];
  const ev = initialHtml.match(/id="__EVENTVALIDATION"\s+value="([^"]+)"/)?.[1];
  const vsg = initialHtml.match(/id="__VIEWSTATEGENERATOR"\s+value="([^"]+)"/)?.[1];

  const testCompanies = [
    { id: '2456', name: 'DENTAL MEDRANO S.A.' },
    { id: '2458', name: 'DENTSPLY ARGENTINA S.A.C.I.' },
    { id: '18637', name: 'DEO DISTRIBUIDORA DE EQUIPOS ODONTOLOGICOS S.A.' },
    { id: '3869', name: 'ARTICULOS ODONTOLOGICOS S.A.' }
  ];

  for (const c of testCompanies) {
    const form = new URLSearchParams();
    form.append('__EVENTTARGET', 'ctl00$ContentPlaceHolder1$ddEmpresasFiltro');
    form.append('__EVENTARGUMENT', '');
    form.append('__VIEWSTATE', vs);
    if (vsg) form.append('__VIEWSTATEGENERATOR', vsg);
    form.append('__VIEWSTATEENCRYPTED', '');
    if (ev) form.append('__EVENTVALIDATION', ev);
    form.append('ctl00$ctrlNavegacion$txtSearch', '');
    form.append('ctl00$ContentPlaceHolder1$ddEmpresasFiltro', c.id);
    form.append('ctl00$ContentPlaceHolder1$txtPM', '');
    form.append('ctl00$ContentPlaceHolder1$txtNombreDescriptivo', '');
    form.append('ctl00$ContentPlaceHolder1$txtExpediente', '');
    form.append('ctl00$ContentPlaceHolder1$txtMarca', '');
    form.append('ctl00$ContentPlaceHolder1$txtModelo', '');
    form.append('ctl00$ContentPlaceHolder1$hfActiveTab', 'tabRegistros');

    const res = await fetch(getUrl, {
      method: 'POST',
      body: form,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': getUrl,
        'Origin': 'https://helena.anmat.gob.ar'
      }
    });

    const html = await res.text();
    const rows = [...html.matchAll(/<tr[^>]*>[\s\S]*?<\/tr>/gi)];
    console.log(`Company ${c.name} (${c.id}): rows = ${rows.length}`);
    for (let i = 1; i < Math.min(rows.length, 4); i++) {
      const cells = [...rows[i][0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim());
      console.log(`  Row ${i}: PM ${cells[6]} | ${cells[3]} | ${cells[4]} | ${cells[5]}`);
    }
  }
}

testCompanyProducts().catch(console.error);
