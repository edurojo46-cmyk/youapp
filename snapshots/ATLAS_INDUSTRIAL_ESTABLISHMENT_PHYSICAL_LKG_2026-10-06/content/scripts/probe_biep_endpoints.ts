process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import fetch from 'node-fetch';
import fs from 'fs';

async function main() {
  const queries = ['biep', 'empleo publico', 'dotacion de personal', 'base integrada'];
  const output: string[] = [];

  for (const q of queries) {
    const url = `https://datos.gob.ar/api/3/action/package_search?q=${encodeURIComponent(q)}&rows=10`;
    const res = await fetch(url);
    const json: any = await res.json();
    output.push(`\n=== QUERY: "${q}" (Total: ${json.result?.count}) ===`);
    for (const p of json.result?.results || []) {
      output.push(`Package: ${p.title} (${p.id})`);
      output.push(`Notes: ${p.notes?.slice(0, 150)}...`);
      for (const r of p.resources || []) {
        output.push(`  -> [${r.format}] ${r.name}: ${r.url}`);
      }
    }
  }

  // Probe Mapa del Estado CSV directly
  try {
    const mapaCsvUrl = 'https://mapadelestado.jefatura.gob.ar/includes/estructura_csv.php?r=0';
    output.push(`\nProbing Mapa del Estado CSV: ${mapaCsvUrl}`);
    const mRes = await fetch(mapaCsvUrl);
    output.push(`Status: ${mRes.status}, Content-Type: ${mRes.headers.get('content-type')}`);
    if (mRes.ok) {
      const text = await mRes.text();
      output.push(`Total length: ${text.length} chars, lines: ${text.split('\n').length}`);
      output.push('First 3 lines:\n' + text.split('\n').slice(0, 3).join('\n'));
    }
  } catch (e: any) {
    output.push(`Mapa CSV error: ${e.message}`);
  }

  fs.writeFileSync('scratch/probe_biep_results.txt', output.join('\n'), 'utf8');
  console.log('Results written to scratch/probe_biep_results.txt');
}

main().catch(console.error);
