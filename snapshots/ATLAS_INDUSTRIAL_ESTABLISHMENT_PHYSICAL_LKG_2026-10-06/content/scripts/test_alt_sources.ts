async function testSources() {
  console.log('Testing ORCID and Crossref public APIs...');

  // 1. Crossref
  const authorName = 'Gisela Eva Cassiodoro';
  const crossrefUrl = `https://api.crossref.org/works?query.author=${encodeURIComponent(authorName)}&rows=3&mailto=contact@youapp.com`;
  console.log('Fetching Crossref:', crossrefUrl);
  try {
    const res = await fetch(crossrefUrl, {
      headers: { 'User-Agent': 'YouAppAtlas/1.0 (mailto:contact@youapp.com)' }
    });
    console.log('Crossref Status:', res.status, res.statusText);
    if (res.ok) {
      const data = await res.json();
      const items = data.message?.items || [];
      console.log(`Crossref items found: ${items.length}`);
      if (items.length > 0) {
        console.log('Sample item title:', items[0].title?.[0]);
        console.log('Sample item authors:', JSON.stringify(items[0].author?.slice(0, 2), null, 2));
      }
    }
  } catch (err: any) {
    console.log('Crossref error:', err.message);
  }

  // 2. ORCID Public API
  const orcidUrl = `https://pub.orcid.org/v3.0/expanded-search/?q=given-names:${encodeURIComponent('Gisela Eva')}+AND+family-name:${encodeURIComponent('Cassiodoro')}`;
  console.log('\nFetching ORCID:', orcidUrl);
  try {
    const res2 = await fetch(orcidUrl, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'YouAppAtlas/1.0' }
    });
    console.log('ORCID Status:', res2.status, res2.statusText);
    if (res2.ok) {
      const data2 = await res2.json();
      console.log('ORCID results:', data2['expanded-result']?.slice(0, 2));
    }
  } catch (err: any) {
    console.log('ORCID error:', err.message);
  }

  // 3. CONICET OAI-PMH / Handle
  const handleUrl = `https://ri.conicet.gov.ar/handle/11336/179477`;
  console.log('\nFetching CONICET Handle:', handleUrl);
  try {
    const res3 = await fetch(handleUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    console.log('CONICET Status:', res3.status);
  } catch (err: any) {
    console.log('CONICET error:', err.message);
  }
}

testSources().catch(console.error);
