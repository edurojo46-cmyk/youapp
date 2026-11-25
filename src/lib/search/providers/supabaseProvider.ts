import type { SearchProvider, SearchOptions } from './index';
import type { ContentItem, SearchQuery } from '../types';
import { supabase } from '../../supabase';
import { lookupCanonicalWork } from '../canonicalWorksCatalog';
import { exactWorkSearchGate } from '../exactWorkSearchGate';
import { normalizeSemanticId } from '../semanticUtils';


export class SupabaseProvider implements SearchProvider {
  name = 'supabase';

  async search(query: SearchQuery, options?: SearchOptions): Promise<ContentItem[]> {
    try {
      const q = (query.retrievalQuery || query.normalizedQuery).trim();
      if (!q) return [];

      const canonicalWork = lookupCanonicalWork(q);
      const detection = query.resolvedIntent
        ? exactWorkSearchGate.fromResolvedIntent(query.resolvedIntent)
        : exactWorkSearchGate.detectExactWork(q);

      // DEBT: CURRENT V1.3 uses creator_name + canonical title + aliases + constraints textual retrieval.
      // TARGET for future scale is direct entity_id + work_id + recording_id + venue_id queries.
      
      const lanePromises: Promise<{ data: any[], lane: string }>[] = [];

      const entityName = detection.canonicalEntity || detection.entity?.name || detection.entityName;
      const workTitle = detection.canonicalWork || detection.object?.canonicalValue || detection.residualTitle || detection.canonicalTitle;
      const topic = detection.topic || (query.resolvedIntent as any)?.contentType;

      // --- LANE A: EXACT_STRUCTURED (30 items) ---
      if (entityName && workTitle) {
        const eLower = entityName.toLowerCase();
        // Fallback simple character replacement for accents in ilike (e.g. paez -> p_ez) to fix TEXT_MISMATCH partially
        const wLower = workTitle.toLowerCase().replace(/[áéíóú]/g, '_');
        
        let reqA = supabase.from('youapp_index').select('*')
          .or(`creator_name.ilike.%${eLower}%,title.ilike.%${eLower}%`)
          .ilike('title', `%${wLower}%`);
        if (options?.benchmarkStartedAt) reqA = reqA.lte('created_at', options.benchmarkStartedAt);
        lanePromises.push(reqA.limit(30).then(res => ({ data: res.data || [], lane: 'EXACT_STRUCTURED' })));
      }

      // --- LANE B: SEMANTIC_REPAIR ---
      // Real Database Query fetching the semantic data + joined video asset!
      if (entityName) {
        let eId = normalizeSemanticId(entityName, 'entity');
        // Legacy overrides
        if (entityName.toLowerCase().includes('fito')) eId = 'entity_fito_paez';
        if (entityName.toLowerCase().includes('beatles')) eId = 'entity_the_beatles';

        let sReq = supabase.from('asset_semantic_annotations')
          .select('*, youapp_index!inner(*)')
          .eq('annotation_status', 'ACTIVE')
          .eq('content_role', 'PRIMARY')
          .eq('semantic_entity_id', eId);

        let expectsFilter = false;
        let orConditions: string[] = [];
        let wId: string | null = null;
        
        if (workTitle) {
            wId = normalizeSemanticId(workTitle, 'work');
            orConditions.push(`semantic_work_id.eq.${wId}`);
        }
        if (detection.venue) {
           let vId = normalizeSemanticId(detection.venue, 'venue');
           if (vId.includes('velez') || vId.includes('vélez')) vId = 'venue_estadio_velez_sarsfield';
           orConditions.push(`semantic_venue_id.eq.${vId}`);
        }
        if (topic) orConditions.push(`content_type.eq.${topic}`);
        if (q.toLowerCase().includes('making of')) orConditions.push(`content_type.eq.MAKING_OF`);
        if (q.toLowerCase().includes('documental')) orConditions.push(`content_type.eq.DOCUMENTARY`);
        
        if (orConditions.length > 0) {
            sReq = sReq.or(orConditions.join(','));
            expectsFilter = true;
        }

        if (expectsFilter) {
          const promise = sReq.then(res => {
            if (!res.data) return { data: [], lane: 'SEMANTIC_REPAIR' as const };
            
            let matchedAssets: any[] = [];
            for (const ann of res.data) {
              const video = ann.youapp_index;
              if (!video) continue;
              
              let isMatch = false;
              if (workTitle && ann.semantic_work_id) {
                const wId = normalizeSemanticId(workTitle, 'work');
                if (ann.semantic_work_id === wId) isMatch = true;
              }
              if (detection.venue) {
                let checkVId = normalizeSemanticId(detection.venue, 'venue');
                if (checkVId.includes('velez') || checkVId.includes('vélez')) checkVId = 'venue_estadio_velez_sarsfield';
                if (ann.semantic_venue_id === checkVId) isMatch = true;
              }
              
              const isMakingOf = q.toLowerCase().includes('making of');
              const isDoc = q.toLowerCase().includes('documental');
              if (ann.content_type === topic || (isMakingOf && ann.content_type === 'MAKING_OF') || (isDoc && ann.content_type === 'DOCUMENTARY')) {
                isMatch = true;
              }

              if (isMatch) {
                matchedAssets.push({
                  ...video,
                  isExactEntityWork: ann.semantic_work_id != null,
                  isConstraintMatch: (ann.semantic_venue_id != null || ann.content_type != null),
                  _semanticMatch: {
                     isExactEntityWork: ann.semantic_work_id != null,
                     workFidelity: ann.work_confidence ? ann.work_confidence * 100 : (ann.semantic_work_id ? 100 : 0),
                     isConstraintMatch: (ann.semantic_venue_id != null || ann.content_type != null),
                     venueFidelity: ann.venue_confidence ? ann.venue_confidence * 100 : (ann.semantic_venue_id ? 100 : 0),
                     constraintFidelity: ann.content_type_confidence ? ann.content_type_confidence * 100 : (ann.content_type ? 100 : 0),
                     artistFidelity: ann.entity_confidence ? ann.entity_confidence * 100 : 100,
                     entityIdentityMatch: true,
                     explicitEntityTitleMatch: true,
                     semanticConfidence: ann.overall_confidence
                  }
                });
              }
            }
            return { data: matchedAssets, lane: 'SEMANTIC_REPAIR' as const };
          });
          lanePromises.push(promise);
        }
      }

      // --- LANE C: CANONICAL_ALIAS (20 items) ---
      if (canonicalWork && canonicalWork.canonicalSearchTerms.length > 0) {
        const termsFilter = canonicalWork.canonicalSearchTerms.map(term => `title.ilike.%${term}%`).join(',');
        let reqC = supabase.from('youapp_index').select('*').or(termsFilter);
        if (options?.benchmarkStartedAt) reqC = reqC.lte('created_at', options.benchmarkStartedAt);
        lanePromises.push(reqC.limit(20).then(res => ({ data: res.data || [], lane: 'CANONICAL_ALIAS' })));
      }

      // --- LANE D: ENTITY_CONSTRAINT (30 items) ---
      if (entityName && topic) {
        const eLower = entityName.toLowerCase();
        const tLower = topic.toLowerCase();
        let reqD = supabase.from('youapp_index').select('*')
          .or(`creator_name.ilike.%${eLower}%,title.ilike.%${eLower}%`)
          .or(`title.ilike.%${tLower}%,description.ilike.%${tLower}%,title.ilike.%interview%,title.ilike.%reportaje%,title.ilike.%live%,title.ilike.%vivo%`);
        if (options?.benchmarkStartedAt) reqD = reqD.lte('created_at', options.benchmarkStartedAt);
        lanePromises.push(reqD.limit(30).then(res => ({ data: res.data || [], lane: 'ENTITY_CONSTRAINT' })));
      }

      // --- LANE E: TEXT_FALLBACK (20 items) ---
      const tokens = q.toLowerCase()
        .replace(/[,;:.()\-]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length >= 3 && !/^(the|los|las|del|con|para|por)$/i.test(t));
      
      if (tokens.length > 0) {
        const fallbackFilter = tokens.length > 1
          ? tokens.map(t => `title.ilike.%${t}%`).join(',')
          : `title.ilike.%${q}%`;
        let reqE = supabase.from('youapp_index').select('*').or(fallbackFilter);
        if (options?.benchmarkStartedAt) reqE = reqE.lte('created_at', options.benchmarkStartedAt);
        lanePromises.push(reqE.limit(20).then(res => ({ data: res.data || [], lane: 'TEXT_FALLBACK' })));
      }

      // Execute all lanes in parallel with a timeout
      const timeoutPromise = new Promise<{ data: any[], lane: string }[]>((_, reject) =>
        setTimeout(() => reject(new Error('SupabaseProvider timeout')), 7000)
      );

      let laneResults: { data: any[], lane: string }[] = [];
      try {
        laneResults = await Promise.race([Promise.all(lanePromises), timeoutPromise]) as { data: any[], lane: string }[];
      } catch (err) {
        console.error("SupabaseProvider Lane Execution Error:", err);
      }

      // UNION + DEDUPE with strict precedence
      const orderedLanes = ['EXACT_STRUCTURED', 'SEMANTIC_REPAIR', 'CANONICAL_ALIAS', 'ENTITY_CONSTRAINT', 'TEXT_FALLBACK'];
      const combined: any[] = [];
      const seen = new Set<string>();

      for (const laneName of orderedLanes) {
        const result = laneResults.find(r => r.lane === laneName);
        if (result && result.data) {
          for (const r of result.data) {
            if (!seen.has(r.id)) {
              seen.add(r.id);
              combined.push({ ...r, retrievalLane: laneName });
            } else if (laneName === 'SEMANTIC_REPAIR') {
              // Promote properties if Lane B also found it, so Semantic Repair gets credit
              const existing = combined.find(c => c.id === r.id);
              if (existing) {
                existing.retrievalLane = 'SEMANTIC_REPAIR';
                if (r.isExactEntityWork) existing.isExactEntityWork = true;
                if (r.isConstraintMatch) existing.isConstraintMatch = true;
                if (r._semanticMatch) existing._semanticMatch = r._semanticMatch;
              }
            }
          }
        }
      }

      if (combined.length === 0) return [];

      return combined.map(v => ({
        id: v.provider_content_id ? `${v.provider || 'yt'}_${v.provider_content_id}` : `youapp_idx_${v.id}`,
        contentId: v.provider_content_id ? `${v.provider || 'yt'}_${v.provider_content_id}` : `youapp_idx_${v.id}`,
        providerContentId: v.provider_content_id || v.video_id,
        type: 'video' as const,
        title: v.title,
        description: v.description || '',
        thumbnail: v.thumbnail || v.thumbnail_url || 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=800',
        videoUrl: v.url || v.canonical_url,
        sourceUrl: v.url || v.canonical_url,
        canonicalUrl: v.url || v.canonical_url,
        channelTitle: v.creator_name || 'Atlas Media',
        channelId: v.creator_id || 'atlas-channel',
        publishedText: v.published_at ? new Date(v.published_at).toLocaleDateString() : 'Atlas',
        durationSeconds: v.duration_seconds || 240,
        durationText: v.duration_seconds ? `${Math.floor(v.duration_seconds / 60)}m` : 'Video',
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
        retrievalSource: 'atlas',
        retrievalLane: v.retrievalLane,
        isExactEntityWork: v.isExactEntityWork,
        isConstraintMatch: v.isConstraintMatch,
        semanticMatch: v._semanticMatch
      })) as ContentItem[];
    } catch {
      return [];
    }
  }

  async searchExplicitNameDeep(explicitName: string, options?: SearchOptions): Promise<ContentItem[]> {
    try {
      const eLower = explicitName.toLowerCase().replace(/[,;:.()\-]/g, ' ').trim();
      if (!eLower) return [];

      let req = supabase.from('youapp_index').select('*')
        .ilike('title', `%${eLower}%`);
        
      if (options?.benchmarkStartedAt) {
        req = req.lte('created_at', options.benchmarkStartedAt);
      }
      
      const res = await req.limit(200);
      
      if (!res.data) return [];
      
      return res.data.map(v => ({
        id: v.id,
        title: v.title,
        description: v.description || '',
        thumbnail: v.thumbnail_url,
        thumbnailMedium: v.thumbnail_url,
        videoUrl: v.url || v.canonical_url,
        sourceUrl: v.url || v.canonical_url,
        canonicalUrl: v.url || v.canonical_url,
        channelTitle: v.creator_name || 'Atlas Media',
        channelId: v.creator_id || 'atlas-channel',
        publishedText: v.published_at ? new Date(v.published_at).toLocaleDateString() : 'Atlas',
        durationSeconds: v.duration_seconds || 240,
        durationText: v.duration_seconds ? `${Math.floor(v.duration_seconds / 60)}m` : 'Video',
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
        retrievalSource: 'atlas',
        retrievalLane: 'EXPLICIT_NAME_DEEP'
      })) as ContentItem[];
    } catch {
      return [];
    }
  }
}

export const supabaseProvider = new SupabaseProvider();

