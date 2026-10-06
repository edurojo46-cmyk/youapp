async function checkConicetHtml() {
  const url = `https://ri.conicet.gov.ar/handle/11336/179477`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  const html = await res.text();

  // Extract meta tags
  const metaRegex = /<meta\s+name="([^"]+)"\s+content="([^"]+)"/gi;
  let match;
  console.log('--- META TAGS ON CONICET HANDLE ---');
  while ((match = metaRegex.exec(html)) !== null) {
    if (match[1].toLowerCase().includes('author') || match[1].toLowerCase().includes('creator') || match[1].toLowerCase().includes('date') || match[1].toLowerCase().includes('affiliation') || match[1].toLowerCase().includes('subject')) {
      console.log(`  ${match[1]}: ${match[2]}`);
    }
  }

  // Look for ORCID links or affiliation text in HTML
  const orcidMatches = html.match(/orcid\.org\/[0-9X-]+/gi);
  console.log('ORCIDs in page:', orcidMatches);
}

checkConicetHtml().catch(console.error);
