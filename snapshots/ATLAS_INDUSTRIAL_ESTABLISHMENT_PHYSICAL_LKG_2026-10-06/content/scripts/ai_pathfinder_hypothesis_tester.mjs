import fs from 'fs';
import pg from 'pg';
import { parseDbUrl } from './export_search_projection_v2.mjs';
import { EMAIL_EXTRACTION_REGEX, EmailNormalizerAndClassifier } from '../src/lib/atlasIndustrialEmail/EmailNormalizerAndClassifier.ts';

async function testHypotheses() {
  const pool = new pg.Pool({ ...parseDbUrl(), max: 2 });
  const client = await pool.connect();
  const authRes = await client.query('SELECT email_normalized FROM public.atlas_global_email_authority;');
  const authSet = new Set(authRes.rows.map(r => r.email_normalized));
  client.release();
  await pool.end();

  console.log('Authority Set:', authSet.size);

  // Load all available candidate resources
  const allCandidates = [];
  function addFile(path) {
    if (!fs.existsSync(path)) return;
    try {
      const data = JSON.parse(fs.readFileSync(path, 'utf8'));
      for (const item of data) {
        const u = item.url || item.download_url || item.downloadURL;
        if (u && typeof u === 'string' && u.startsWith('http')) {
          allCandidates.push({
            url: u,
            name: item.name || item.resourceName || item.datasetTitle || item.title || 'Dataset'
          });
        }
      }
    } catch(e) {}
  }

  addFile('scratch/master_discovered_resource_urls.json');
  addFile('scratch/national_catalogs_distributions.json');
  addFile('scratch/search_datos_gob_ar_resources.json');
  addFile('scratch/ckan_email_candidates.json');

  console.log('Total candidate URLs loaded:', allCandidates.length);

  // Group into AI Pathfinder Hypotheses
  const hypotheses = [
    {
      id: 'HYP_ACADEMIC_FACULTY_RESEARCH',
      name: 'Academic, University & Scientific Research Institutional Directories',
      filter: (u) => u.includes('uba.ar') || u.includes('unlp.edu.ar') || u.includes('conicet.gov.ar') || u.includes('mincyt.gob.ar') || u.includes('educacion') || u.includes('educ.ar')
    },
    {
      id: 'HYP_COMMUNITY_CIVIC_INSTITUTIONS',
      name: 'Consular, Civil Collectivities & Cultural Societies',
      filter: (u) => u.includes('colectividades') || u.includes('consulad') || u.includes('embajada') || u.includes('cultura') || u.includes('teatro') || u.includes('biblioteca')
    },
    {
      id: 'HYP_PROVINCIAL_MUNICIPAL_SERVICES',
      name: 'Provincial & Municipal Decentralized Public Administration Registries',
      filter: (u) => u.includes('gba.gob.ar') || u.includes('buenosaires.gob.ar') || u.includes('municipio') || u.includes('ips') || u.includes('ioma') || u.includes('bahia.gob.ar')
    },
    {
      id: 'HYP_HEALTH_SYSTEM_ESTABLISHMENTS',
      name: 'Federal Health, Sanatoriums & Pharmaceutical Directories',
      filter: (u) => u.includes('salud.gob.ar') || u.includes('farmacia') || u.includes('drogueria') || u.includes('hospital') || u.includes('sanatorio') || u.includes('pami.org.ar')
    },
    {
      id: 'HYP_AGRO_ENVIRONMENT_OPERATORS',
      name: 'National Agricultural, Port & Environmental Operator Registers',
      filter: (u) => u.includes('magyp.gob.ar') || u.includes('ambiente.gob.ar') || u.includes('acumar.gob.ar') || u.includes('produccion.gob.ar') || u.includes('puerto')
    }
  ];

  for (const hyp of hypotheses) {
    const matching = allCandidates.filter(c => hyp.filter(c.url.toLowerCase()));
    console.log(`\n[${hyp.id}] ${hyp.name}: ${matching.length} matching resources`);

    // Cheap probe on first 10
    let alive = 0;
    let emailsFound = 0;
    let netNewFound = 0;

    for (let i = 0; i < Math.min(15, matching.length); i++) {
      const item = matching[i];
      try {
        const res = await fetch(item.url, { headers: { 'User-Agent': 'Mozilla/5.0 Atlas/3.0' }, signal: AbortSignal.timeout(3500) });
        if (res.ok) {
          alive++;
          const text = await res.text();
          const matches = text.match(EMAIL_EXTRACTION_REGEX) || [];
          for (const m of matches) {
            const norm = EmailNormalizerAndClassifier.normalizeEmail(m);
            if (norm && norm.length >= 5) {
              emailsFound++;
              if (!authSet.has(norm)) {
                netNewFound++;
              }
            }
          }
        }
      } catch(e) {}
    }

    const decision = netNewFound > 0 ? 'PROMOTE' : (alive > 0 ? 'NEUTRAL' : 'REJECT');
    console.log(`  Cheap probe: Alive: ${alive}/15 | Emails Found: ${emailsFound} | Net-New: ${netNewFound} | Decision: ${decision}`);
  }
}

testHypotheses().catch(console.error);
