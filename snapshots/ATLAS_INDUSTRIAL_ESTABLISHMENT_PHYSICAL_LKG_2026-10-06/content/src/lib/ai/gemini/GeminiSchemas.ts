export interface StructuredPersonQuery {
  intent: 'PERSON_SEARCH' | 'NAME_SEARCH' | 'PROFESSION_SEARCH' | 'ORGANIZATION_SEARCH' | 'UNKNOWN';
  personName: string | null;
  profession: string | null;
  personCategory: 'WORKER' | 'PUBLIC_EMPLOYEE' | 'PROFESSIONAL' | 'BUSINESS_OWNER' | 'ENTREPRENEUR' | 'RESEARCHER' | 'TEACHER' | 'CREATOR' | 'JOB_CANDIDATE' | 'UNKNOWN' | null;
  employmentStatus: string | null;
  organization: string | null;
  location: {
    country: string | null;
    jurisdiction: string | null;
    neighborhood: string | null;
  } | null;
  confidence: number;
  ambiguities: string[] | null;
}

export interface GeminiCandidateEvidence {
  url: string;
  domain: string;
  title: string | null;
  claimTypes: string[];
}

export interface GeminiCandidate {
  candidateId: string;
  displayName: string;
  professionClaim: string | null;
  roleClaim: string | null;
  organizationClaim: string | null;
  locationClaim: string | null;
  evidence: GeminiCandidateEvidence[] | null;
  aiConfidence: number;
}
