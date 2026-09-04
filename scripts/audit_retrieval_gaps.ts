import * as fs from 'fs';
import * as path from 'path';
import { executeSearch } from '../src/lib/search/searchEngine';
import { supabase } from '../src/lib/supabase';
import { analyzeQuery } from '../src/lib/search/intentDetector';
import { exactWorkSearchGate } from '../src/lib/search/exactWorkSearchGate';
import type { ContentItem } from '../src/lib/search/types';

const ARTIFACTS_DIR = 'C:\\Users\\Eduardo\\.gemini\\antigravity-ide\\brain\\a1c5284f-3194-48ca-b85b-b39604695364';

function extractJson(content: string) {
  const match = content.match(/```json\n([\s\S]*?)\n```/);
  if (match && match[1]) {
    try { return JSON.parse(match[1].replace(/\/\/.*$/gm, '')); } catch { return null; }
  }
  return null;
}

// Mapeo crudo de BD a ContentItem (igual a SupabaseProvider)
function mapToContentItem(v: any): ContentItem {
  return {
    id: v.provider_content_id ? `${v.provider || 'yt'}_${v.provider_content_id}` : `youapp_idx_${v.id}`,
    contentId: v.provider_content_id ? `${v.provider || 'yt'}_${v.provider_content_id}` : `youapp_idx_${v.id}`,
    providerContentId: v.provider_content_id || v.video_id,
    type: 'video',
    title: v.title,
    description: v.description || '',
    thumbnail: v.thumbnail || v.thumbnail_url || '',
    videoUrl: v.url || v.canonical_url,
    sourceUrl: v.url || v.canonical_url,
    canonicalUrl: v.url || v.canonical_url,
    channelTitle: v.creator_name || 'Atlas Media',
    channelId: v.creator_id || 'atlas-channel',
    publishedText: v.published_at ? new Date(v.published_at).toLocaleDateString() : 'Atlas',
    durationSeconds: v.duration_seconds || 240,
    isLive: false,
    isVerified: true,
    provider: (v.provider as any) || 'youtube',
    atlasRowExists: true,
    discoveryOrigin: v.source || 'atlas_index',
    isFixture: false,
    isDemo: false,
    playability: 'verified_stream',
    source: {
      provider: v.provider || 'youtube',
      discoveryMethod: v.source || 'atlas_bootstrap',
      discoveredAt: v.created_at || new Date().toISOString()
    },
    retrievalSource: 'atlas'
  } as ContentItem;
}

async function getPhysicalCandidates(detection: any): Promise<ContentItem[]> {
    const eLower = (detection.canonicalEntity || '').toLowerCase();
    const wLower = (detection.canonicalWork || detection.residualTitle || detection.topic || '').toLowerCase();
    
    const terms = [eLower, wLower].filter(Boolean);
    if (terms.length === 0) return [];
    
    // Hacemos una búsqueda ultra amplia para traer todo lo plausible
    let req = supabase.from('youapp_index').select('*');
    if (eLower) {
        req = req.or(`creator_name.ilike.%${eLower}%,title.ilike.%${eLower}%`);
    }
    
    const { data, error } = await req.limit(1500);
    if (error || !data) return [];
    
    return data.map(mapToContentItem);
}

async function runDefinitiveAudit() {
  const benchmarkStartedAt = new Date().toISOString();
  let allQueries: any[] = [];
  for (const block of ['a', 'b', 'c', 'd']) {
    let p = path.join(ARTIFACTS_DIR, `benchmark_v1_2_plan_block_${block}.md`);
    if (fs.existsSync(p)) {
      const parsed = extractJson(fs.readFileSync(p, 'utf-8'));
      if (parsed) {
        if (Array.isArray(parsed)) allQueries.push(...parsed);
        else if (parsed.queries) allQueries.push(...parsed.queries);
      }
    }
  }

  // Filtrar solo las que fallaron en el último benchmark como RETRIEVAL_GAP
  // Como no tenemos la lista exacta a mano en el script, evaluamos las que V1.2 evaluó como gap.
  // Para estar seguros, corremos executeSearch. Si Search.list (CandidatePool) == 0 exactos, entonces entra a auditoría.
  
  const results: any[] = [];
  console.log("Running DEFINITIVE INVENTORY AUDIT...");
  
  for (let i = 0; i < allQueries.length; i++) {
    const q = allQueries[i];
    if (q.category === 'SYNTHETIC_NEGATIVE') continue;

    let searchRes;
    try {
      searchRes = await executeSearch(q.query, {
        readOnlyBenchmark: true,
        benchmarkStartedAt,
        trafficClass: 'benchmark',
        routingMode: 'static',
        bypassCandidatePool: true // forzamos retrieval local V1.3
      });
    } catch { continue; }

    const intentData = analyzeQuery(q.query);
    const detection = exactWorkSearchGate.detectExactWork(q.query, intentData);
    const resolvedSearchIntent = exactWorkSearchGate.toResolvedIntent(detection);
    const mandatoryGates = exactWorkSearchGate.buildMandatoryGates(detection, resolvedSearchIntent);

    // ¿Cuántos fully qualified recuperó el CandidatePool V1.3?
    // Primero, poblamos la metadata de fidelidad (score) simulando la fase de filterAndDiversify
    const poolScored = exactWorkSearchGate.filterAndDiversifyExactWorkCandidates(searchRes.all, detection, 0);
    const candidatePoolFullyQualified = poolScored.filter(c => exactWorkSearchGate.evaluateMandatoryGates(c, mandatoryGates).passed);
    
    if (candidatePoolFullyQualified.length > 0) {
        // SearchEngine los recuperó exitosamente
        continue;
    }

    // El SearchEngine falló en recuperar fully-qualified. ¿Por qué?
    const physicalCandidates = await getPhysicalCandidates(detection);
    const physicalPlausibleCount = physicalCandidates.length;

    // Pasamos los físicos por el evaluador EXACTO de producción
    const physicalScored = exactWorkSearchGate.filterAndDiversifyExactWorkCandidates(physicalCandidates, detection, 0);
    
    const physicalFullyQualified = physicalScored.filter(c => {
        const result = exactWorkSearchGate.evaluateMandatoryGates(c, mandatoryGates);
        return result.passed;
    });

    if (physicalPlausibleCount === 0) {
        results.push({
            query: q.query,
            class: 'TRUE_INVENTORY_GAP',
            plausible: 0,
            qualified: 0
        });
    } else if (physicalFullyQualified.length === 0) {
        results.push({
            query: q.query,
            class: 'METADATA_GAP',
            plausible: physicalPlausibleCount,
            qualified: 0
        });
    } else {
        results.push({
            query: q.query,
            class: 'RETRIEVAL_GAP',
            plausible: physicalPlausibleCount,
            qualified: physicalFullyQualified.length
        });
    }
    console.log(`[${results[results.length-1].class}] ${q.query}`);
  }
  
  const reportPath = path.join(ARTIFACTS_DIR, 'definitive_gap_classification.md');
  let md = "# DEFINITIVE INVENTORY vs RETRIEVAL GAP CLASSIFICATION\n\n";
  
  const grouped = results.reduce((acc, curr) => {
      acc[curr.class] = (acc[curr.class] || 0) + 1;
      return acc;
  }, {});
  
  md += `## Totales\n`;
  md += `- **TRUE_INVENTORY_GAP**: ${grouped['TRUE_INVENTORY_GAP'] || 0}\n`;
  md += `- **METADATA / LOCAL_REPAIRABLE_GAP**: ${grouped['METADATA_GAP'] || 0}\n`;
  md += `- **REAL RETRIEVAL_GAP**: ${grouped['RETRIEVAL_GAP'] || 0}\n\n`;
  
  for (const c of ['TRUE_INVENTORY_GAP', 'METADATA_GAP', 'RETRIEVAL_GAP']) {
      md += `### ${c}\n`;
      const items = results.filter(r => r.class === c);
      md += `| Query | Phys. Plausible | Phys. Qualified |\n`;
      md += `|---|---|---|\n`;
      items.forEach(i => {
          md += `| ${i.query} | ${i.plausible} | ${i.qualified} |\n`;
      });
      md += "\n";
  }
  
  fs.writeFileSync(reportPath, md);
  console.log('✅ Definitive Audit finished. Report written to', reportPath);
}

runDefinitiveAudit().catch(console.error);
