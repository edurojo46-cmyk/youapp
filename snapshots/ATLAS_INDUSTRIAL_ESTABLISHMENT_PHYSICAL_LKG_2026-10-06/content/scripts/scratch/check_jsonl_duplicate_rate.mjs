import fs from 'node:fs';
import readline from 'node:readline';

async function main() {
  const jsonlPath = 'reports/atlas/search/atlas_canonical_people_projection_v2.jsonl';
  console.log(`Analyzing duplicate normalized fields in ${jsonlPath}...`);

  const fileStream = fs.createReadStream(jsonlPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let total = 0;
  let dupes = 0;
  let arcaTotal = 0;
  let arcaDupes = 0;
  let nonArcaTotal = 0;
  let nonArcaDupes = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    const doc = JSON.parse(line);
    total++;

    const isDup = (doc.display_name_normalized === doc.search_text_normalized);
    if (isDup) dupes++;

    const srcIds = (doc.source_ids || []).join(',');
    const isArca = srcIds.toUpperCase().includes('ARCA') || srcIds.toUpperCase().includes('PADRON') || srcIds.toUpperCase().includes('CUIT');
    if (isArca) {
      arcaTotal++;
      if (isDup) arcaDupes++;
    } else {
      nonArcaTotal++;
      if (isDup) nonArcaDupes++;
    }

    if (total % 250000 === 0) {
      console.log(`Processed ${total} docs... current dupes=${dupes} (${((dupes/total)*100).toFixed(2)}%)`);
    }
  }

  console.log('================================================================');
  console.log('RESULTS FOR CANONICAL SEARCH CORPUS (1,001,007 DOCS)');
  console.log('================================================================');
  console.log(`TOTAL_DOCS               : ${total}`);
  console.log(`ALL_SOURCES_DUPES        : ${dupes} (${((dupes/total)*100).toFixed(2)}%)`);
  console.log(`NON_ARCA_DOCS            : ${nonArcaTotal}, DUPES: ${nonArcaDupes} (${nonArcaTotal > 0 ? ((nonArcaDupes/nonArcaTotal)*100).toFixed(2) : 0}%)`);
  console.log(`ARCA_DOCS                : ${arcaTotal}, DUPES: ${arcaDupes} (${arcaTotal > 0 ? ((arcaDupes/arcaTotal)*100).toFixed(2) : 0}%)`);
}

main().catch(console.error);
