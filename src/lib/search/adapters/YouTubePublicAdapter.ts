/**
 * YouTube Public Discovery Adapter
 * Directives:
 * 1. CHANNEL != PERSON (BUSINESS_AS_PERSON_FALSE_POSITIVES = 0)
 * 2. SEARCH QUERY IS NOT GEOGRAPHIC EVIDENCE (QUERY_TERM_AS_LOCATION_EVIDENCE = 0)
 * 3. SOCIAL LOCATION SEMANTICS (SOCIAL_LOCATION_DECLARED only when explicitly declared in profile)
 * 4. YOUTUBE PERSON CLASSIFICATION (PERSON, ORGANIZATION, BUSINESS, MEDIA_CHANNEL, UNKNOWN)
 * 5. PERSON EVIDENCE (Individual name, credentials, professional bio)
 * 6. SECURITY REMEDIATION: ZERO hardcoded keys in source code.
 */

import type { LightweightPersonRecord, LocationRelationType, ProviderPaginationCursor } from '../MassDiscoveryTypes';
import type { QueryIntent } from '../UniversalQueryModel';
import type { IExternalPersonSourceAdapter } from '../IExternalPersonSourceAdapter';
import { SocialEntityClassifier, type ClassifiedEntityType } from '../social/SocialEntityClassifier';

export interface YouTubeChannelAuditResult {
  channel_id: string;
  title: string;
  description: string;
  classified_entity: ClassifiedEntityType;
  is_person: boolean;
  has_explicit_geography: boolean;
  matched_neighborhood?: string;
  rejection_reason?: string;
}

export class YouTubePublicAdapter implements IExternalPersonSourceAdapter {
  public source_id = 'YOUTUBE_PUBLIC';
  public source_name = 'YouTube Public Creators & Channels';
  public priority = 4;

  private getApiKey(): string {
    return (typeof process !== 'undefined' && process.env?.YOUTUBE_API_KEY) || '';
  }

  public isApplicable(intent: QueryIntent): boolean {
    const geo = (intent.geography || intent.neighborhood || intent.raw_query || '').toUpperCase();
    const isCaba = !geo || geo.includes('CABA') || geo.includes('BUENOS AIRES') || geo.includes('CABALLITO') || geo.includes('PALERMO') || geo.includes('BELGRANO') || geo.includes('RECOLETA') || geo.includes('FLORES') || geo.includes('URQUIZA');
    return isCaba;
  }

  /**
   * Fetches and audits YouTube channels with strict Person vs Organization gating.
   * BUSINESS_AS_PERSON_FALSE_POSITIVES = 0
   * QUERY_TERM_AS_LOCATION_EVIDENCE = 0
   */
  public async fetchPeople(intent: QueryIntent, limit: number = 20): Promise<LightweightPersonRecord[]> {
    const geo = intent.neighborhood || intent.geography || 'Caballito';
    const prof = intent.profession || intent.occupation || intent.trade || intent.role_class || intent.work_concept?.canonical_id || '';
    
    // Construct focused CABA query: e.g. "médico Caballito", "psicólogo Palermo", "arquitecto Belgrano"
    const queryTerm = [prof, geo, 'CABA'].filter(Boolean).join(' ');
    
    const apiKey = this.getApiKey();
    if (!apiKey) {
      console.warn('[YouTubePublicAdapter] BLOCKED_MISSING_CREDENTIALS: VITE_YOUTUBE_API_KEY is not configured in environment.');
      return [];
    }

    try {
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=${Math.min(limit, 15)}&q=${encodeURIComponent(queryTerm)}&type=channel&key=${apiKey}`;
      
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) {
        console.warn('[YouTubePublicAdapter] API responded with status:', res.status);
        return [];
      }

      const data = await res.json();
      if (!data.items || !Array.isArray(data.items)) {
        return [];
      }

      const records: LightweightPersonRecord[] = [];

      for (const item of data.items) {
        const channelId = item.id?.channelId || item.snippet?.channelId;
        const title = (item.snippet?.title || '').trim();
        const description = item.snippet?.description || '';
        
        if (!channelId || !title || title.length < 3) continue;

        // Gate 1: Classify Entity (PERSON vs ORGANIZATION / BUSINESS / MEDIA_CHANNEL / UNKNOWN)
        const classification = SocialEntityClassifier.classify(title, description);

        // Directive Section 1: BUSINESS_AS_PERSON_FALSE_POSITIVES = 0
        // Only PERSON may enter people candidate stream
        if (!classification.is_person) {
          continue;
        }

        // Gate 2: Extract explicit geographic evidence from profile content
        // Directive Section 2: QUERY_TERM_AS_LOCATION_EVIDENCE = 0
        const geoEvidence = SocialEntityClassifier.extractDeclaredGeographicEvidence(description, title);

        const channelUrl = `https://www.youtube.com/channel/${channelId}`;
        const now = new Date().toISOString();

        // Location relation is only SOCIAL_LOCATION_DECLARED if profile explicitly contains geographic evidence
        const locRelation: LocationRelationType = geoEvidence.has_explicit_evidence
          ? ('SOCIAL_LOCATION_DECLARED' as LocationRelationType)
          : ('UNKNOWN' as any);

        records.push({
          candidate_id: `yt_${channelId}`,
          display_name: classification.extracted_person_name || title,
          entity_type: 'PERSON',
          work_concept: prof || 'CREATOR_PROFESSIONAL',
          profession_claim: prof ? `${prof} (Canal Público YouTube)` : 'Profesional / Creador de Contenido',
          role_claim: `Titular de canal verificado en YouTube: ${title}`,
          organization: title,
          geography_claim: geoEvidence.matched_neighborhood || (geoEvidence.has_explicit_evidence ? 'CABA' : undefined),
          geography_neighborhood: geoEvidence.matched_neighborhood,
          location_relation_type: locRelation,
          location_evidence: geoEvidence.has_explicit_evidence
            ? geoEvidence.evidence_text
            : 'Canal sin mención geográfica explícita en perfil público (QUERY_TERM_AS_LOCATION_EVIDENCE = 0)',
          location_source_url: channelUrl,
          source_id: 'YOUTUBE_PUBLIC',
          source_record_id: channelId,
          source_url: channelUrl,
          person_source_url: channelUrl,
          website: channelUrl,
          social_profiles: [{
            platform: 'YOUTUBE_PUBLIC' as any,
            url: channelUrl,
            handle: title,
            state: 'SOCIAL_SOURCE_NATIVE_PROFILE',
            corroboration_evidence: classification.classification_evidence
          }],
          evidence_score: classification.confidence,
          is_current_professional: true,
          last_seen_at: now
        });
      }

      return records;
    } catch (err: any) {
      console.warn('[YouTubePublicAdapter] Fetch warning:', err.message);
      return [];
    }
  }

  /**
   * Paginated search for MassDiscoveryEngine integration.
   */
  public async searchPaginated(
    intent: QueryIntent,
    cursor: ProviderPaginationCursor
  ): Promise<{ records: LightweightPersonRecord[]; nextCursor: ProviderPaginationCursor }> {
    const nextCursor: ProviderPaginationCursor = {
      ...cursor,
      page: cursor.page || 1,
      page_size: Math.min(cursor.page_size || 15, 15),
      retrievable_limit: 1000,
      discovered_so_far: cursor.discovered_so_far || 0,
      provider_exhausted: false
    };

    if ((nextCursor.page || 1) > 10) {
      nextCursor.provider_exhausted = true;
      return { records: [], nextCursor };
    }

    const geo = intent.neighborhood || intent.geography || 'Caballito';
    const prof = intent.profession || intent.occupation || intent.trade || intent.role_class || intent.work_concept?.canonical_id || '';
    const queryTerm = [prof, geo, 'CABA'].filter(Boolean).join(' ');

    const apiKey = this.getApiKey();
    if (!apiKey) {
      nextCursor.provider_exhausted = true;
      return { records: [], nextCursor };
    }

    try {
      const pageTokenParam = cursor.cursor ? `&pageToken=${encodeURIComponent(cursor.cursor)}` : '';
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=${nextCursor.page_size}&q=${encodeURIComponent(queryTerm)}&type=channel${pageTokenParam}&key=${apiKey}`;

      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) {
        nextCursor.provider_exhausted = true;
        return { records: [], nextCursor };
      }

      const data = await res.json();
      if (data.nextPageToken) {
        nextCursor.cursor = data.nextPageToken;
        nextCursor.page = (nextCursor.page || 1) + 1;
      } else {
        nextCursor.provider_exhausted = true;
      }

      if (!data.items || !Array.isArray(data.items)) {
        return { records: [], nextCursor };
      }

      const records: LightweightPersonRecord[] = [];
      for (const item of data.items) {
        const channelId = item.id?.channelId || item.snippet?.channelId;
        const title = (item.snippet?.title || '').trim();
        const description = item.snippet?.description || '';

        if (!channelId || !title || title.length < 3) continue;

        // Gate 1: Classify Entity (PERSON vs ORGANIZATION / BUSINESS / MEDIA_CHANNEL / UNKNOWN)
        const classification = SocialEntityClassifier.classify(title, description);

        // Directive Section 1: BUSINESS_AS_PERSON_FALSE_POSITIVES = 0
        if (!classification.is_person) {
          continue;
        }

        // Gate 2: Extract explicit geographic evidence from profile content
        // Directive Section 2: QUERY_TERM_AS_LOCATION_EVIDENCE = 0
        const geoEvidence = SocialEntityClassifier.extractDeclaredGeographicEvidence(description, title);

        const channelUrl = `https://www.youtube.com/channel/${channelId}`;
        const now = new Date().toISOString();

        const locRelation: LocationRelationType = geoEvidence.has_explicit_evidence
          ? ('SOCIAL_LOCATION_DECLARED' as LocationRelationType)
          : ('UNKNOWN' as any);

        records.push({
          candidate_id: `yt_${channelId}`,
          display_name: classification.extracted_person_name || title,
          entity_type: 'PERSON',
          work_concept: prof || 'CREATOR_PROFESSIONAL',
          profession_claim: prof ? `${prof} (Canal Público YouTube)` : 'Profesional / Creador de Contenido',
          role_claim: `Titular de canal verificado en YouTube: ${title}`,
          organization: title,
          geography_claim: geoEvidence.matched_neighborhood || (geoEvidence.has_explicit_evidence ? 'CABA' : undefined),
          geography_neighborhood: geoEvidence.matched_neighborhood,
          location_relation_type: locRelation,
          location_evidence: geoEvidence.has_explicit_evidence
            ? geoEvidence.evidence_text
            : 'Canal sin mención geográfica explícita en perfil público (QUERY_TERM_AS_LOCATION_EVIDENCE = 0)',
          location_source_url: channelUrl,
          source_id: 'YOUTUBE_PUBLIC',
          source_record_id: channelId,
          source_url: channelUrl,
          person_source_url: channelUrl,
          website: channelUrl,
          social_profiles: [{
            platform: 'YOUTUBE_PUBLIC' as any,
            url: channelUrl,
            handle: title,
            state: 'SOCIAL_SOURCE_NATIVE_PROFILE',
            corroboration_evidence: classification.classification_evidence
          }],
          evidence_score: classification.confidence,
          is_current_professional: true,
          last_seen_at: now
        });
      }

      nextCursor.discovered_so_far = (nextCursor.discovered_so_far || 0) + records.length;
      return { records, nextCursor };
    } catch (err: any) {
      console.warn('[YouTubePublicAdapter] Paginated fetch warning:', err.message);
      nextCursor.provider_exhausted = true;
      return { records: [], nextCursor };
    }
  }
}
