/**
 * ATLAS MULTI-SOURCE IDENTITY CORROBORATOR V1
 * 
 * Cross-corroboration between independent official sources to elevate
 * MULTI_SOURCE_IDENTITY coverage without weak or unsafe merges.
 * 
 * Strict Invariants:
 * - NAME_ONLY_MERGE = 0
 * - NAME_ROLE_ONLY_MERGE = 0
 * - FALSE_IDENTITY_MERGE = 0
 * - Multi-source identity requires: Strong Identifier Hash OR Official Gazette ID OR ORCID OR Full Multi-Attribute Conjunction.
 */

export interface IdentityRecord {
  person_id: string;
  full_name: string;
  source_id: string;
  national_id_hash?: string | null;
  official_registry_id?: string | null;
  orcid?: string | null;
  institutional_id?: string | null;
  organization?: string | null;
  job_title?: string | null;
  province?: string | null;
}

export type CorroborationType = 
  | 'STRONG_NATIONAL_HASH_MATCH'
  | 'OFFICIAL_REGISTRY_ID_MATCH'
  | 'ORCID_BIBLIOGRAPHIC_MATCH'
  | 'INSTITUTIONAL_ID_MATCH'
  | 'PROBABLE_SAME_PERSON_CANDIDATE'
  | 'REJECTED_WEAK_MATCH';

export interface CorroborationResult {
  person_id: string;
  is_corroborated: boolean;
  corroboration_type: CorroborationType;
  canonical_merge_permitted: boolean;
  corroborating_sources: string[];
  confidence_score: number;
  evidence_summary: string;
}

export class AtlasMultiSourceCorroborator {
  public evaluateCorroboration(
    primary: IdentityRecord, 
    candidates: IdentityRecord[]
  ): CorroborationResult {
    const corroboratingSources = new Set<string>();
    corroboratingSources.add(primary.source_id);

    let bestType: CorroborationType = 'REJECTED_WEAK_MATCH';
    let highestConfidence = 0.0;
    let evidence = '';

    for (const c of candidates) {
      if (c.source_id === primary.source_id) continue;

      // 1. Strong National Identity Hash Match
      if (primary.national_id_hash && c.national_id_hash && primary.national_id_hash === c.national_id_hash) {
        corroboratingSources.add(c.source_id);
        bestType = 'STRONG_NATIONAL_HASH_MATCH';
        highestConfidence = 0.999;
        evidence = `Exact match on SHA-256 National Identity Anchor between [${primary.source_id}] and [${c.source_id}]`;
        break;
      }

      // 2. Official Registry ID Match (Decree / Resolution / Docket)
      if (primary.official_registry_id && c.official_registry_id && primary.official_registry_id === c.official_registry_id) {
        corroboratingSources.add(c.source_id);
        bestType = 'OFFICIAL_REGISTRY_ID_MATCH';
        highestConfidence = 0.995;
        evidence = `Official Registry ID match (${primary.official_registry_id}) between [${primary.source_id}] and [${c.source_id}]`;
        break;
      }

      // 3. ORCID Bibliographic Match
      if (primary.orcid && c.orcid && primary.orcid === c.orcid) {
        corroboratingSources.add(c.source_id);
        bestType = 'ORCID_BIBLIOGRAPHIC_MATCH';
        highestConfidence = 0.992;
        evidence = `ORCID iD link (${primary.orcid}) corroborated between [${primary.source_id}] and [${c.source_id}]`;
        break;
      }

      // 4. Institutional Person ID Match
      if (primary.institutional_id && c.institutional_id && primary.institutional_id === c.institutional_id) {
        corroboratingSources.add(c.source_id);
        bestType = 'INSTITUTIONAL_ID_MATCH';
        highestConfidence = 0.985;
        evidence = `Institutional Employee/Staff ID match (${primary.institutional_id}) between [${primary.source_id}] and [${c.source_id}]`;
        break;
      }

      // 5. Multi-Attribute Conjunction Pass (Requires 4 distinct matching dimensions: Normalized Name + Org + Specific Role + Province)
      const namesMatch = this.normalize(primary.full_name) === this.normalize(c.full_name);
      const orgsMatch = primary.organization && c.organization && this.normalize(primary.organization) === this.normalize(c.organization);
      const rolesMatch = primary.job_title && c.job_title && this.normalize(primary.job_title) === this.normalize(c.job_title);
      const provinceMatch = primary.province && c.province && this.normalize(primary.province) === this.normalize(c.province);

      if (namesMatch && orgsMatch && rolesMatch && provinceMatch) {
        corroboratingSources.add(c.source_id);
        bestType = 'PROBABLE_SAME_PERSON_CANDIDATE';
        highestConfidence = 0.940;
        evidence = `Multi-Attribute Conjunction: Full Name + Org ("${primary.organization}") + Role ("${primary.job_title}") + Province ("${primary.province}") — Marked as PROBABLE_SAME_PERSON (Canonical merge strictly blocked without strong anchor)`;
        break;
      }
    }

    const isCorroborated = corroboratingSources.size >= 2 && highestConfidence >= 0.90;
    const canonicalPermitted = isCorroborated && (
      bestType === 'STRONG_NATIONAL_HASH_MATCH' ||
      bestType === 'OFFICIAL_REGISTRY_ID_MATCH' ||
      bestType === 'ORCID_BIBLIOGRAPHIC_MATCH' ||
      bestType === 'INSTITUTIONAL_ID_MATCH'
    );

    return {
      person_id: primary.person_id,
      is_corroborated: isCorroborated,
      corroboration_type: isCorroborated ? bestType : 'REJECTED_WEAK_MATCH',
      canonical_merge_permitted: canonicalPermitted,
      corroborating_sources: Array.from(corroboratingSources),
      confidence_score: highestConfidence,
      evidence_summary: isCorroborated ? evidence : 'Insufficient independent source corroboration without violating safety invariants'
    };
  }

  private normalize(str: string): string {
    return (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }
}
