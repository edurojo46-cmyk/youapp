async function probeDental() {
  const query = 'odontol';
  const url = 'https://helena.anmat.gob.ar/Boletin/Default.aspx';
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const html = await res.text();
    const vsMatch = html.match(/id="__VIEWSTATE" value="([^"]+)"/);
    const vsgMatch = html.match(/id="__VIEWSTATEGENERATOR" value="([^"]+)"/);
    const evMatch = html.match(/id="__EVENTVALIDATION" value="([^"]+)"/);
    
    if (!vsMatch) {
      console.log('No ViewState found on initial page');
      return;
    }

    const params = new URLSearchParams();
    params.set('__VIEWSTATE', vsMatch[1]);
    params.set('__VIEWSTATEGENERATOR', vsgMatch ? vsgMatch[1] : '');
    params.set('__EVENTVALIDATION', evMatch ? evMatch[1] : '');
    params.set('ctl00$ContentPlaceHolder1$txtBuscar', query);
    params.set('ctl00$ContentPlaceHolder1$btnBuscar', 'Buscar');

    const searchRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: AbortSignal.timeout(10000)
    });
    const searchHtml = await searchRes.text();
    console.log('Search response length:', searchHtml.length);
    const matches = searchHtml.match(/PM\s+\d+-\d+/g);
    console.log('PM matches found:', matches ? matches.length : 0);
    if (matches) console.log('Sample PMs:', matches.slice(0, 5));
  } catch (err) {
    console.error('Error probing ANMAT:', err.message);
  }
}

probeDental();
