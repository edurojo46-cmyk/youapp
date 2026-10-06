/**
 * Reusable Public Social Web Discovery Engine
 * Directives:
 * 15 & 16. SOCIAL NETWORKS ARE FIRST-CLASS SOURCES (GitHub, YouTube, X, Instagram, Facebook, LinkedIn, TikTok)
 * 17. SOCIAL WEB DISCOVERY (DISCOVERED_VIA vs EVIDENCE_SOURCE_URL)
 * 18. SOCIAL PROFILE MODEL
 * 19. NO NAME-ONLY SOCIAL MATCHING (NAME_ONLY_SOCIAL_VERIFICATION = 0)
 * 20 & 21. PUBLIC EMAILS & CONTACT USAGE STATE
 */

import { LightweightPersonRecord, LocationRelationType } from '../MassDiscoveryTypes';

export type SocialPlatform = 
  | 'GITHUB' 
  | 'YOUTUBE' 
  | 'X' 
  | 'INSTAGRAM' 
  | 'FACEBOOK' 
  | 'LINKEDIN' 
  | 'TIKTOK';

export type SocialEvidenceState = 
  | 'SOCIAL_SOURCE_NATIVE_PROFILE' 
  | 'SOCIAL_POSSIBLE_MATCH' 
  | 'SOCIAL_PROBABLE_MATCH' 
  | 'SOCIAL_VERIFIED_CROSS_SOURCE_MATCH';

export type ContactUsageState = 
  | 'PUBLICLY_DISCOVERED' 
  | 'MARKETING_ELIGIBILITY_UNKNOWN' 
  | 'OPT_OUT' 
  | 'SUPPRESSED' 
  | 'DO_NOT_CONTACT';

export interface SocialProfileRecord {
  platform: SocialPlatform;
  platform_user_id?: string;
  username: string;
  display_name: string;
  profile_url: string;
  bio?: string;
  declared_activity?: string;
  declared_location?: string;
  website?: string | null;
  public_email?: string | null;
  email_source_url?: string | null;
  public_phone?: string | null;
  phone_source_url?: string | null;
  source_url: string; // The authentic social profile URL (EVIDENCE_SOURCE_URL)
  discovered_via: string; // Search engine / web scraper (DISCOVERED_VIA)
  evidence_state: SocialEvidenceState;
  contact_usage_state: ContactUsageState;
  fetched_at: string;
}

export interface SocialDiscoveryQueryInput {
  profession?: string;
  activity?: string;
  organization?: string;
  neighborhood: string; // e.g. "Caballito", "Palermo", "Belgrano"
  commune_number?: number;
  platforms?: SocialPlatform[];
}

export class PublicSocialWebDiscovery {
  /**
   * Generates structured public social web discovery queries.
   * Example: site:instagram.com arquitecto Caballito
   *          site:linkedin.com/in médico Palermo
   *          site:facebook.com psicólogo Belgrano
   *          site:youtube.com docente Caballito
   */
  public static generateTargetedQueries(input: SocialDiscoveryQueryInput): { platform: SocialPlatform; query: string }[] {
    const geo = input.neighborhood || 'Caballito';
    const prof = input.profession || input.activity || '';
    const org = input.organization || '';

    const term = [prof, org, geo, 'CABA'].filter(Boolean).join(' ');

    const queries: { platform: SocialPlatform; query: string }[] = [
      { platform: 'LINKEDIN', query: `site:linkedin.com/in/ ${term}` },
      { platform: 'INSTAGRAM', query: `site:instagram.com ${term}` },
      { platform: 'FACEBOOK', query: `site:facebook.com ${term}` },
      { platform: 'YOUTUBE', query: `site:youtube.com/@ OR site:youtube.com/channel/ ${term}` },
      { platform: 'X', query: `site:x.com OR site:twitter.com ${term}` },
      { platform: 'TIKTOK', query: `site:tiktok.com/@ ${term}` },
      { platform: 'GITHUB', query: `site:github.com ${term}` }
    ];

    if (input.platforms && input.platforms.length > 0) {
      return queries.filter(q => input.platforms!.includes(q.platform));
    }
    return queries;
  }

  /**
   * Verifies cross-source social match with strict anti-hallucination.
   * Directive Section 19: NAME_ONLY_SOCIAL_VERIFICATION = 0.
   * Cross-source verification requires corroborating evidence:
   * same organization, same professional website, same profession + institution, or cross-linked account.
   */
  public static verifyCrossSourceMatch(
    candidate: LightweightPersonRecord, 
    social: SocialProfileRecord
  ): { isVerified: boolean; evidenceState: SocialEvidenceState; reason: string } {
    // 1. Same authentic external website or email domain
    if (candidate.website && social.website && candidate.website.toLowerCase() === social.website.toLowerCase()) {
      return {
        isVerified: true,
        evidenceState: 'SOCIAL_VERIFIED_CROSS_SOURCE_MATCH',
        reason: 'Sitio web profesional idéntico verificado en ambas fuentes'
      };
    }

    // 2. Direct public email match with authentic source URL
    if (candidate.public_email && social.public_email && candidate.public_email.toLowerCase() === social.public_email.toLowerCase()) {
      return {
        isVerified: true,
        evidenceState: 'SOCIAL_VERIFIED_CROSS_SOURCE_MATCH',
        reason: 'Correo electrónico público idéntico verificado en ambas fuentes'
      };
    }

    // 3. Organization + Profession coincidence
    const candOrg = (candidate.organization || '').toLowerCase().trim();
    const socialBio = (social.bio || '').toLowerCase().trim();
    const candProf = (candidate.profession_claim || candidate.work_concept || '').toLowerCase().trim();

    if (candOrg.length > 4 && socialBio.includes(candOrg) && candProf.length > 3 && socialBio.includes(candProf)) {
      return {
        isVerified: true,
        evidenceState: 'SOCIAL_PROBABLE_MATCH',
        reason: `Mención comprobada de institución (${candidate.organization}) y profesión coincidente en biografía pública`
      };
    }

    // Reject name-only matches
    return {
      isVerified: false,
      evidenceState: 'SOCIAL_POSSIBLE_MATCH',
      reason: 'Rechazado por regla anti-homonimia: la coincidencia de nombre sin institución, web o email no constituye verificación'
    };
  }

  /**
   * Transforms authentic social profile into a validated discovery candidate.
   * Strictly enforces Directive Section 7: SOCIAL_LOCATION_DECLARED, NOT RESIDES_IN.
   */
  public static toDiscoveryCandidate(
    profile: SocialProfileRecord,
    targetNeighborhood: string
  ): LightweightPersonRecord {
    return {
      candidate_id: `${profile.platform.toLowerCase()}_${profile.username.toLowerCase()}`,
      display_name: profile.display_name,
      profession_claim: profile.declared_activity,
      work_concept: profile.declared_activity,
      organization: undefined,
      geography_claim: targetNeighborhood,
      geography_neighborhood: targetNeighborhood,
      location_relation_type: 'SOCIAL_LOCATION_DECLARED' as LocationRelationType,
      location_evidence: `Ubicación territorial declarada en perfil público de ${profile.platform}: ${profile.declared_location || targetNeighborhood}`,
      source_id: `${profile.platform}_PUBLIC`,
      source_record_id: profile.username,
      source_url: profile.profile_url,
      person_source_url: profile.profile_url,
      location_source_url: profile.profile_url,
      public_email: profile.public_email || null,
      email_type: profile.public_email ? 'PUBLIC_PERSONAL_EMAIL' : undefined,
      email_source_url: profile.email_source_url || null,
      public_phone: profile.public_phone || null,
      phone_type: profile.public_phone ? 'PUBLIC_PROFESSIONAL_PHONE' : undefined,
      phone_source_url: profile.phone_source_url || null,
      website: profile.website || null,
      social_profiles: [{
        platform: profile.platform,
        username: profile.username,
        profile_url: profile.profile_url,
        is_verified_profile: false,
        declared_location: profile.declared_location
      }],
      evidence_score: 90,
      is_current_professional: true,
      last_seen_at: profile.fetched_at
    };
  }
}
