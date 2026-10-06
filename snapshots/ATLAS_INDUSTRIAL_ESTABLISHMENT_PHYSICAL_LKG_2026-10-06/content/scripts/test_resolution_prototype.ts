import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CABA_KEYWORDS = [
  'buenos aires',
  'caba',
  'ciudad autonoma de buenos aires',
  'universidad de buenos aires',
  'uba',
  'hospital italiano',
  'fundacion instituto leloir',
  'fundacion favaloro',
  'universidad torcuato di tella',
  'instituto tecnologico de buenos aires',
  'itba',
  'hospital de clinicas',
  'ifibyne',
  'ingebi',
  'iafe',
  'ifiba',
  'inquimae',
  'iquifib',
  'cct buenos aires',
  'centro cientifico tecnologico conicet buenos aires',
  'garrahan',
  'instituto roffo',
  'hospital de ninos',
  'hospital aleman',
  'ibioba'
];

function isCaba(inst: any): boolean {
  if (!inst) return false;
  const city = (inst.city || inst.geo?.city || '').toLowerCase();
  const name = (inst.display_name || '').toLowerCase();
  if (city === 'buenos aires' || city === 'ciudad autonoma de buenos aires') return true;
  for (const kw of CABA_KEYWORDS) {
    if (name.includes(kw)) return true;
  }
  return false;
}

function isArgentina(inst: any): boolean {
  if (!inst) return false;
  const country = (inst.country_code || inst.geo?.country_code || '').toUpperCase();
  const name = (inst.display_name || '').toLowerCase();
  return country === 'AR' || name.includes('argentina') || isCaba(inst);
}

async function testResolution() {
  console.log('Testing resolution for 15 unresolved CONICET candidates...');

  const { data: candidates } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('discovery_id, display_name, organization, location_evidence')
    .eq('source_id', 'CONICET_OAI_PMH')
    .eq('location_relation_type', 'PUBLICATION_ASSOCIATED_WITH_CABA_INSTITUTE')
    .not('location_evidence', 'ilike', '%radicada fuera de CABA%')
    .limit(15);

  for (const c of candidates || []) {
    const url = `https://api.openalex.org/authors?search=${encodeURIComponent(c.display_name)}&per_page=3&mailto=contact@youapp.com`;
    const res = await fetch(url);
    if (!res.ok) {
      console.log(`[${c.display_name}] HTTP Error ${res.status}`);
      continue;
    }
    const json = await res.json();
    const results = json.results || [];

    // Filter results by Argentine affiliation
    const argMatch = results.find((r: any) => {
      const insts = r.last_known_institutions || [];
      return insts.some((i: any) => isArgentina(i));
    });

    if (!argMatch) {
      console.log(`[${c.display_name}] -> UNRESOLVED: No Argentine institutional match among ${results.length} OpenAlex candidates`);
      continue;
    }

    const insts = argMatch.last_known_institutions || [];
    const cabaInst = insts.find((i: any) => isCaba(i));
    const orcid = argMatch.orcid ? argMatch.orcid.replace(/https?:\/\/orcid\.org\//, '') : null;
    const maxYear = argMatch.counts_by_year && argMatch.counts_by_year.length > 0
      ? Math.max(...argMatch.counts_by_year.map((cy: any) => cy.year))
      : null;

    if (cabaInst) {
      const state = maxYear && maxYear >= 2025 ? 'CURRENT' : maxYear && maxYear >= 2023 ? 'RECENT' : 'ASSOCIATED_STALE';
      console.log(`[${c.display_name}] -> CABA_CONFIRMED (${state}) | Inst: ${cabaInst.display_name} | MaxYear: ${maxYear} | ORCID: ${orcid || 'NONE'} | ID: ${argMatch.id}`);
    } else {
      const nonCabaInst = insts[0]?.display_name || 'Desconocida';
      console.log(`[${c.display_name}] -> NON_CABA_CONFIRMED | Inst: ${nonCabaInst} | ORCID: ${orcid || 'NONE'}`);
    }
    await new Promise(r => setTimeout(r, 100));
  }
}

testResolution().catch(console.error);
