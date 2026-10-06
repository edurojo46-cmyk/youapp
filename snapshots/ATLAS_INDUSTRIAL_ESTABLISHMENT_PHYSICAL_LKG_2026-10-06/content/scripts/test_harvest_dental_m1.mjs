async function harvestDental() {
  const getUrl = 'https://helena.anmat.gob.ar/Boletin/Default.aspx';
  const getRes = await fetch(getUrl);
  const initialHtml = await getRes.text();

  const vs = initialHtml.match(/id="__VIEWSTATE"\s+value="([^"]+)"/)?.[1];
  const ev = initialHtml.match(/id="__EVENTVALIDATION"\s+value="([^"]+)"/)?.[1];
  const vsg = initialHtml.match(/id="__VIEWSTATEGENERATOR"\s+value="([^"]+)"/)?.[1];

  const options = [...initialHtml.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)];
  const dentalCompanies = options.filter(o => /dental|dent|odont|ortodon|implante|oral|dentsply|kerr|straumann|nobel|zimmer|bego|kulzer|ivoclar|3m|proclinic|dentex|gnatus|w&h|kavo|dabi|rosterdent/i.test(o[2]))
    .map(o => ({ id: o[1], name: o[2].trim() }));

  console.log(`Found ${dentalCompanies.length} dental companies in dropdown.`);

  const seenKeys = new Set();
  const products = [];

  for (const comp of dentalCompanies) {
    if (products.length >= 220) break;

    const form = new URLSearchParams();
    form.append('__EVENTTARGET', 'ctl00$ContentPlaceHolder1$ddEmpresasFiltro');
    form.append('__EVENTARGUMENT', '');
    form.append('__VIEWSTATE', vs);
    if (vsg) form.append('__VIEWSTATEGENERATOR', vsg);
    form.append('__VIEWSTATEENCRYPTED', '');
    if (ev) form.append('__EVENTVALIDATION', ev);
    form.append('ctl00$ctrlNavegacion$txtSearch', '');
    form.append('ctl00$ContentPlaceHolder1$ddEmpresasFiltro', comp.id);
    form.append('ctl00$ContentPlaceHolder1$txtPM', '');
    form.append('ctl00$ContentPlaceHolder1$txtNombreDescriptivo', '');
    form.append('ctl00$ContentPlaceHolder1$txtExpediente', '');
    form.append('ctl00$ContentPlaceHolder1$txtMarca', '');
    form.append('ctl00$ContentPlaceHolder1$txtModelo', '');
    form.append('ctl00$ContentPlaceHolder1$hfActiveTab', 'tabRegistros');

    try {
      const res = await fetch(getUrl, {
        method: 'POST',
        body: form,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': getUrl,
          'Origin': 'https://helena.anmat.gob.ar'
        },
        signal: AbortSignal.timeout(10000)
      });
      const html = await res.text();
      const rows = [...html.matchAll(/<tr[^>]*>[\s\S]*?<\/tr>/gi)];
      
      for (let i = 1; i < rows.length; i++) {
        const cells = [...rows[i][0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1].replace(/<[^>]+>/g, '').trim());
        if (cells.length >= 7 && cells[6]) {
          const pm = cells[6];
          const titular = cells[2];
          const denom = cells[3];
          const marca = cells[4];
          const modelo = cells[5];
          const exp = cells[7] || '';
          const fecha = cells[1];
          const tipo = cells[0];

          if (pm.length >= 2 && titular.length >= 2 && denom.length >= 2) {
            const key = `PM_${pm.replace(/[^A-Za-z0-9]/g, '_')}_${denom.replace(/[^A-Za-z0-9]/g, '_').slice(0, 30)}`.toUpperCase();
            if (!seenKeys.has(key)) {
              seenKeys.add(key);
              products.push({ pm, titular, denom, marca, modelo, exp, fecha, tipo, company: comp.name });
            }
          }
        }
      }
      console.log(`Company ${comp.name}: total products accumulated = ${products.length}`);
    } catch (err) {
      console.error(`Error on company ${comp.name}:`, err.message);
    }
  }

  console.log(`\nHarvest finished. Total unique dental products: ${products.length}`);
  if (products.length >= 200) {
    console.log('SUCCESS: Target 200 reached!');
  }
}

harvestDental().catch(console.error);
