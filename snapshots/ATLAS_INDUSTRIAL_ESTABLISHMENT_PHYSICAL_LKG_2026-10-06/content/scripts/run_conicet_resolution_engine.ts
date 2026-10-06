import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface ConicetResolutionStats {
  UNRESOLVED_BEFORE: number;
  RESOLVED: number;
  WITH_ORCID: number;
  CABA_CONFIRMED: number;
  NON_CABA_CONFIRMED: number;
  STILL_UNRESOLVED: number;
  PROMOTED_CURRENT_DIRECT_CABA: number;
  PROMOTED_RECENT_EVIDENCE: number;
  PROMOTED_STALE_ASSOCIATED: number;
  NET_NEW_CONFIRMED_CABA: number;
  PROCESSING_TIME_MS: number;
}

const CABA_INSTITUTION_KEYWORDS = [
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
  'instituto raoffo',
  'hospital de ninos'
];

function isCabaAffiliation(inst: any): boolean {
  const city = (inst.city || inst.geo?.city || '').toLowerCase();
  const name = (inst.display_name || '').toLowerCase();
  const ror = (inst.ror || '').toLowerCase();

  if (city === 'buenos aires' || city === 'ciudad autonoma de buenos aires') {
    return true;
  }

  for (const kw of CABA_INSTITUTION_KEYWORDS) {
    if (name.includes(kw)) return true;
  }

  return false;
}

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

export async function runConicetResolution(limitToProcess = 500): Promise<ConicetResolutionStats> {
  const startTime = Date.now();
  console.log('=== TRACK B: CONICET RESOLUTION ENGINE ===');
  console.log(`Processing batch of existing unresolved CONICET authors (target: ${limitToProcess})...\n`);

  // 1. Fetch unresolved CONICET candidates from Discovery
  const { data: candidates, error } = await supabase
    .from('atlas_people_discovery_candidates')
    .select('discovery_id, display_name, organization, role, location_relation_type, current_activity_state, social_profiles')
    .eq('source_id', 'CONICET_OAI_PMH')
    .eq('location_relation_type', 'PUBLICATION_ASSOCIATED_WITH_CABA_INSTITUTE')
    .limit(limitToProcess);

  if (error) throw error;
  console.log(`Fetched ${candidates?.length || 0} unresolved CONICET authors to evaluate.`);

  const stats: ConicetResolutionStats = {
    UNRESOLVED_BEFORE: candidates?.length || 0,
    RESOLVED: 0,
    WITH_ORCID: 0,
    CABA_CONFIRMED: 0,
    NON_CABA_CONFIRMED: 0,
    STILL_UNRESOLVED: 0,
    PROMOTED_CURRENT_DIRECT_CABA: 0,
    PROMOTED_RECENT_EVIDENCE: 0,
    PROMOTED_STALE_ASSOCIATED: 0,
    NET_NEW_CONFIRMED_CABA: 0,
    PROCESSING_TIME_MS: 0
  };

  const updatesToExecute: Array<{ id: string; patch: any }> = [];

  for (let i = 0; i < (candidates || []).length; i++) {
    const c = candidates![i];
    const authorName = c.display_name;

    try {
      const url = `https://api.openalex.org/authors?search=${encodeURIComponent(authorName)}&per_page=1&mailto=contact@youapp.com`;
      const res = await fetch(url);
      if (!res.ok) {
        stats.STILL_UNRESOLVED++;
        continue;
      }

      const json = await res.json();
      const match = json.results?.[0];

      if (!match) {
        stats.STILL_UNRESOLVED++;
        continue;
      }

      stats.RESOLVED++;
      const orcid = match.orcid ? match.orcid.replace(/https?:\/\/orcid\.org\//, '').trim() : null;
      if (orcid) stats.WITH_ORCID++;

      const shortId = match.id.replace('https://openalex.org/', '');
      const insts = match.last_known_institutions || [];
      const cabaInst = insts.find((inst: any) => isCabaAffiliation(inst));

      let maxYear = 0;
      if (match.counts_by_year && match.counts_by_year.length > 0) {
        maxYear = Math.max(...match.counts_by_year.map((cy: any) => cy.year));
      }

      if (cabaInst) {
        stats.CABA_CONFIRMED++;
        stats.NET_NEW_CONFIRMED_CABA++;

        let newRelType = 'CABA_INSTITUTION_ASSOCIATED';
        let newState = 'ACTIVE';

        if (maxYear >= 2025) {
          // Contemporary evidence (2025-2026) with confirmed CABA affiliation
          newRelType = 'WORKS_IN';
          newState = 'ACTIVE';
          stats.PROMOTED_CURRENT_DIRECT_CABA++;
        } else if (maxYear >= 2023) {
          // Recent evidence (2023-2024)
          newRelType = 'CABA_INSTITUTION_ASSOCIATED';
          newState = 'ACTIVE';
          stats.PROMOTED_RECENT_EVIDENCE++;
        } else {
          // Historical / Stale
          newRelType = 'CABA_INSTITUTION_ASSOCIATED';
          newState = 'STALE';
          stats.PROMOTED_STALE_ASSOCIATED++;
        }

        const currentProfiles = Array.isArray(c.social_profiles) ? c.social_profiles : [];
        const newProfiles = [
          ...currentProfiles,
          {
            platform: 'OPENALEX',
            profile_url: `https://openalex.org/${shortId}`,
            openalex_id: shortId,
            orcid: orcid,
            resolved_institution: cabaInst.display_name,
            latest_work_year: maxYear || null
          }
        ];

        updatesToExecute.push({
          id: c.discovery_id,
          patch: {
            organization: cabaInst.display_name || c.organization,
            location_relation_type: newRelType,
            current_activity_state: newState,
            location_evidence: `Filiación individual verificada en ${cabaInst.display_name} (CABA), última obra registrada: ${maxYear || 'N/D'}`,
            social_profiles: newProfiles,
            last_seen_at: new Date().toISOString()
          }
        });
      } else {
        // Non-CABA institution (e.g. La Plata, Córdoba, Rosario)
        stats.NON_CABA_CONFIRMED++;
        const nonCabaInstName = insts[0]?.display_name || 'Institución fuera de CABA';
        
        updatesToExecute.push({
          id: c.discovery_id,
          patch: {
            location_evidence: `Filiación individual radicada fuera de CABA (${nonCabaInstName})`,
            last_seen_at: new Date().toISOString()
          }
        });
      }

      if ((i + 1) % 50 === 0 || i === (candidates?.length || 0) - 1) {
        console.log(`[Resolution Progress] ${i + 1}/${candidates?.length} | Resolved: ${stats.RESOLVED} | CABA Confirmed: ${stats.CABA_CONFIRMED} | Non-CABA: ${stats.NON_CABA_CONFIRMED}`);
      }

      await sleep(100); // Polite pool limit
    } catch (err: any) {
      console.error(`Error resolving author "${authorName}":`, err.message);
      stats.STILL_UNRESOLVED++;
    }
  }

  // Execute Supabase updates in batches
  console.log(`\nExecuting ${updatesToExecute.length} database updates for resolved CONICET candidates...`);
  for (const upd of updatesToExecute) {
    await supabase
      .from('atlas_people_discovery_candidates')
      .update(upd.patch)
      .eq('discovery_id', upd.id);
  }

  stats.PROCESSING_TIME_MS = Date.now() - startTime;

  console.log('\n=== ESTADÍSTICAS FINALES CONICET RESOLUTION ENGINE ===');
  console.table(stats);

  return stats;
}

if (process.argv[1]?.endsWith('run_conicet_resolution_engine.ts')) {
  runConicetResolution(500).catch(console.error);
}
