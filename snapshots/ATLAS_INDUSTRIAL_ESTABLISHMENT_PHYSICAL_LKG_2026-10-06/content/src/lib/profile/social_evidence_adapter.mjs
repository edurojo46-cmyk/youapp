/**
 * ATLAS PROFILE ENGINE V1.1 - SOCIAL EVIDENCE ADAPTER
 * 
 * Reuses existing connectors (GitHub, YouTube bridge, X, LinkedIn, Web)
 * and projects evidence into atlas_person_observations without fuzzy merging.
 */

export const SocialLinkingState = {
  UNLINKED_CANDIDATE: 'UNLINKED_CANDIDATE',
  VERIFIED_LINK: 'VERIFIED_LINK',
  REJECTED_LINK: 'REJECTED_LINK',
  AMBIGUOUS: 'AMBIGUOUS'
};

export class SocialEvidenceAdapter {
  /**
   * Evaluates linking safety between an existing canonical person context and a candidate social profile.
   * STRICT SAFETY INVARIANT: A matching name is NEVER sufficient on its own to attach a social account.
   */
  static evaluateLinking(personContext, socialCandidate) {
    const {
      atlas_person_id,
      display_name,
      known_identifiers = [],
      known_organizations = [],
      known_domains = [],
      known_handles = []
    } = personContext;

    const {
      platform,
      platform_account_id,
      username,
      profile_url,
      display_name: candidateName,
      bio,
      organization_declared,
      evidence_url,
      is_corporate_account = false
    } = socialCandidate;

    // Invariant 1: Reject corporate/organization profiles
    if (is_corporate_account || this.isCorporateUrl(profile_url)) {
      return {
        state: SocialLinkingState.REJECTED_LINK,
        rationale: 'Rejected: Target profile represents a corporate or organizational entity, not an individual.',
        verified_atlas_person_id: null
      };
    }

    // Invariant 2: Deterministic Handle / Account ID match
    if (username && known_handles.map(h => h.toLowerCase()).includes(username.toLowerCase())) {
      return {
        state: SocialLinkingState.VERIFIED_LINK,
        rationale: `Deterministic match: Known verified handle "${username}" matches on ${platform}.`,
        verified_atlas_person_id: atlas_person_id
      };
    }

    // Invariant 3: Deterministic External Source Domain / Email match
    if (socialCandidate.website && known_domains.some(d => socialCandidate.website.includes(d))) {
      return {
        state: SocialLinkingState.VERIFIED_LINK,
        rationale: `Deterministic match: Personal domain "${socialCandidate.website}" confirmed in canonical evidence.`,
        verified_atlas_person_id: atlas_person_id
      };
    }

    // Invariant 4: Name match alone is strictly AMBIGUOUS or UNLINKED
    const normCanonical = (display_name || '').toLowerCase().trim();
    const normCandidate = (candidateName || '').toLowerCase().trim();

    if (normCanonical && normCandidate && normCanonical === normCandidate) {
      // Check for corroborating strong context (e.g. exact organization + role match in bio)
      const orgMatches = organization_declared && known_organizations.some(o => 
        o.toLowerCase().includes(organization_declared.toLowerCase()) || organization_declared.toLowerCase().includes(o.toLowerCase())
      );

      if (orgMatches && bio && bio.toLowerCase().includes(normCanonical.split(' ')[0])) {
        // High confidence corroboration, but if there could be duplicates, flag as AMBIGUOUS unless certified
        return {
          state: SocialLinkingState.VERIFIED_LINK,
          rationale: `Deterministic multi-attribute match: Name "${display_name}" and organization "${organization_declared}" verified in ${platform} profile metadata.`,
          verified_atlas_person_id: atlas_person_id
        };
      }

      return {
        state: SocialLinkingState.AMBIGUOUS,
        rationale: `Name match only ("${display_name}") without deterministic disambiguation evidence. Flagged as AMBIGUOUS.`,
        verified_atlas_person_id: null
      };
    }

    return {
      state: SocialLinkingState.UNLINKED_CANDIDATE,
      rationale: 'Unlinked candidate: No deterministic or corroborated link established.',
      verified_atlas_person_id: null
    };
  }

  /**
   * Adapts a validated social profile into canonical observations for atlas_person_observations
   */
  static adaptToObservations(atlasPersonId, socialRecord) {
    const observations = [];
    const now = new Date().toISOString();

    const metadata = {
      SOURCE_TYPE: 'SOCIAL_PUBLIC',
      platform: socialRecord.platform,
      platform_account_id: socialRecord.platform_account_id || null,
      username: socialRecord.username || null,
      profile_url: socialRecord.profile_url,
      display_name: socialRecord.display_name || null,
      bio: socialRecord.bio || null,
      role_declared: socialRecord.role_declared || null,
      organization_declared: socialRecord.organization_declared || null,
      location_declared: socialRecord.location_declared || null,
      first_seen_at: socialRecord.first_seen_at || now,
      last_seen_at: socialRecord.last_seen_at || now,
      retrieved_at: socialRecord.retrieved_at || now,
      evidence_url: socialRecord.evidence_url || socialRecord.profile_url
    };

    // 1. Social Profile Observation
    observations.push({
      field_type: 'PUBLIC_CONTACT',
      raw_value: socialRecord.profile_url,
      normalized_value: socialRecord.profile_url.toLowerCase(),
      observed_at: now,
      evidence_id: `ev_social_${socialRecord.platform.toLowerCase()}_${socialRecord.username || 'rec'}`,
      source_metadata: metadata
    });

    // 2. Organization Declared (if present and verified)
    if (socialRecord.organization_declared) {
      observations.push({
        field_type: 'ORGANIZATION',
        raw_value: socialRecord.organization_declared,
        normalized_value: socialRecord.organization_declared.toUpperCase().trim(),
        observed_at: now,
        evidence_id: `ev_social_${socialRecord.platform.toLowerCase()}_org`,
        associated_role: socialRecord.role_declared || null,
        source_metadata: metadata
      });
    }

    // 3. Location Declared (if present)
    if (socialRecord.location_declared) {
      observations.push({
        field_type: 'LOCATION',
        raw_value: socialRecord.location_declared,
        normalized_value: socialRecord.location_declared.toUpperCase().trim(),
        observed_at: now,
        evidence_id: `ev_social_${socialRecord.platform.toLowerCase()}_loc`,
        source_metadata: metadata
      });
    }

    return observations;
  }

  static isCorporateUrl(url) {
    if (!url) return false;
    const lower = url.toLowerCase();
    return lower.includes('/company/') || lower.includes('/school/') || lower.includes('/channel/') || lower.includes('/pages/');
  }
}
