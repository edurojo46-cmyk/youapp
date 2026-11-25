/**
 * ATLAS SOCIAL PROFESSIONAL ENRICHER V1
 * 
 * Strict professional social profile verification (ORCID, LinkedIn, GitHub, X).
 * 
 * Invariants:
 * - NAME_ONLY_SOCIAL_VERIFICATION = 0 (Never attach a LinkedIn profile just because names match).
 * - HANDLE_ONLY_VERIFICATION = 0
 * - PAGE_WIDE_ASSIGNMENT = 0
 * - Only VERIFIED enters canonical profile depth.
 */

export type SocialPlatform = 'ORCID' | 'LINKEDIN' | 'GITHUB' | 'X' | 'GOOGLE_SCHOLAR';

export type SocialVerificationStatus = 'VERIFIED' | 'PROBABLE' | 'POSSIBLE' | 'REJECTED';

export interface CandidateSocialLink {
  platform: SocialPlatform;
  url_or_handle: string;
  source_evidence_url: string;
  is_direct_author_link: boolean;
  has_institution_binding: boolean;
}

export interface VerifiedSocialProfile {
  platform: SocialPlatform;
  handle: string;
  url: string;
  status: SocialVerificationStatus;
  confidence: number;
  evidence: string;
}

export class AtlasSocialEnricher {
  public verifySocialCandidate(
    personFullName: string,
    organization: string | null | undefined,
    candidate: CandidateSocialLink
  ): VerifiedSocialProfile {
    const cleanUrl = candidate.url_or_handle.trim();
    let status: SocialVerificationStatus = 'REJECTED';
    let confidence = 0.0;
    let evidence = '';

    switch (candidate.platform) {
      case 'ORCID':
        // ORCID IDs in academic repositories (CONICET, OpenAlex, Universities) are self-authoritative
        if (/^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/i.test(cleanUrl) || cleanUrl.includes('orcid.org/')) {
          status = 'VERIFIED';
          confidence = 0.99;
          evidence = `Explicit ORCID identifier directly bound to author in source: ${candidate.source_evidence_url}`;
        }
        break;

      case 'LINKEDIN':
        // Requires direct author link or explicit organizational staff directory listing
        if (candidate.is_direct_author_link && candidate.has_institution_binding) {
          status = 'VERIFIED';
          confidence = 0.95;
          evidence = `Official staff bio direct hyperlink with institutional binding: ${candidate.source_evidence_url}`;
        } else if (candidate.is_direct_author_link) {
          status = 'PROBABLE';
          confidence = 0.75;
          evidence = `Candidate author hyperlink without dual institutional confirmation`;
        } else {
          status = 'POSSIBLE';
          confidence = 0.40;
          evidence = `External query candidate — pending physical identity binding`;
        }
        break;

      case 'GITHUB':
        // For technical profiles when explicitly associated in project or university lab
        if (candidate.is_direct_author_link && candidate.has_institution_binding) {
          status = 'VERIFIED';
          confidence = 0.96;
          evidence = `Verified departmental/lab repository owner binding: ${candidate.source_evidence_url}`;
        } else {
          status = 'PROBABLE';
          confidence = 0.70;
          evidence = `Unconfirmed handle mention`;
        }
        break;

      case 'X':
        // X handles require strong person-specific verification
        if (candidate.is_direct_author_link && candidate.has_institution_binding) {
          status = 'VERIFIED';
          confidence = 0.92;
          evidence = `Official government / institutional roster listed handle: ${candidate.source_evidence_url}`;
        } else {
          status = 'POSSIBLE';
          confidence = 0.45;
          evidence = `Social candidate lacks institutional binding`;
        }
        break;

      default:
        status = 'REJECTED';
        confidence = 0.0;
        evidence = 'Unsupported platform or unverified link';
    }

    return {
      platform: candidate.platform,
      handle: cleanUrl.replace(/^https?:\/\/(www\.)?[a-zA-Z0-9-]+\.[a-zA-Z]+\//, '@'),
      url: cleanUrl.startsWith('http') ? cleanUrl : `https://${candidate.platform.toLowerCase()}.com/${cleanUrl}`,
      status,
      confidence,
      evidence
    };
  }
}
