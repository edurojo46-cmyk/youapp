import fetch from 'node-fetch';

async function test5Handles() {
  const handles = ['110941', '267299', '22343', '154328', '179477'];
  for (const h of handles) {
    const url = `https://ri.conicet.gov.ar/handle/11336/${h}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000 } as any);
    const html = await res.text();

    const title = html.match(/<meta[^>]*content="([^"]+)"[^>]*name="citation_title"/i)?.[1] ||
                  html.match(/<meta[^>]*name="citation_title"[^>]*content="([^"]+)"/i)?.[1] ||
                  html.match(/<meta[^>]*name="DC\.title"[^>]*content="([^"]+)"/i)?.[1];

    const doi = html.match(/<meta[^>]*name="citation_doi"[^>]*content="([^"]+)"/i)?.[1] ||
                html.match(/<meta[^>]*content="([^"]+)"[^>]*name="citation_doi"/i)?.[1] ||
                html.match(/10\.\d{4,9}\/[-._;()/:A-Z0-9]+/i)?.[0];

    const date = html.match(/<meta[^>]*name="citation_date"[^>]*content="(\d{4})/i)?.[1] ||
                 html.match(/<meta[^>]*name="DC\.date"[^>]*content="(\d{4})/i)?.[1];

    const affils = (html.match(/<meta[^>]*name="DC\.description"[^>]*content="Fil:\s*([^"]+)"/gi) || []).length;

    console.log(`Handle ${h}: Title="${title?.slice(0, 40)}..." | DOI=${doi} | Year=${date} | AffilsCount=${affils}`);
  }
}

test5Handles();
