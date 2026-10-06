export type SupportStatus = 'SUPPORTED' | 'UNSUPPORTED' | 'CONFLICT' | 'STALE' | 'FORBIDDEN' | 'STYLISTIC';
export type DraftStatus = 'DRAFT' | 'VALIDATING' | 'COPY_VALIDATED' | 'REJECTED' | 'STALE';

export type ChannelType = 
  | 'EMAIL' 
  | 'INSTAGRAM_PUBLIC_REPLY' 
  | 'INSTAGRAM_DM' 
  | 'X_PUBLIC_REPLY' 
  | 'X_DM' 
  | 'YOUTUBE_COMMENT' 
  | 'YOUTUBE_LIVE_CHAT' 
  | 'LINKEDIN_COMMENT' 
  | 'WHATSAPP_SERVICE_REPLY' 
  | 'WHATSAPP_MARKETING_MESSAGE';

export interface AuthorityRef {
  source_type: string;
  source_id: string;
  version_hash?: string;
  captured_at: Date;
}

export interface AllowedFact {
  claim_id: string; // ID assigned to this fact to be referenced by AI
  claim_type: string;
  structured_value: any;
  authority_ref: AuthorityRef;
  evidence_ref?: string; // ID in atlas_evidence_registry
  freshness: 'CURRENT' | 'STALE' | 'UNKNOWN';
}

export interface AllowedFactSet {
  facts: AllowedFact[];
  snapshot_hash: string;
  
  // Convenient structured groupings (optional but recommended by user)
  product?: AllowedFact[];
  offer?: AllowedFact[];
  intent?: AllowedFact[];
}

export interface StructuredClaim {
  id: string; // crypto.randomUUID
  type: string;
  text: string | null;
  value: any | null;
  support_status: SupportStatus;
  evidence_links: string[]; // evidence_ids
}

export interface DeterministicTemplateResult {
  subject: string | null;
  body: string;
  claims: StructuredClaim[];
  used_cta_id?: string;
}

export interface PolicyRules {
  allowed_claim_types: string[];
  forbidden_claim_types: string[];
  required_disclosures: string[];
  required_cta_rules: string[];
  
  // Structural Rules from 10E-B
  max_length?: number;
  subject_allowed: boolean;
  subject_max_length?: number;
  cta_allowed: boolean;
  cta_required: boolean;
  allowed_cta_types?: string[];
  body_format: 'PLAIN_TEXT' | 'HTML' | 'MARKDOWN';
  public_constraints?: any;
  ai_generation_allowed?: boolean;
  deterministic_fallback_allowed?: boolean;
}

export interface AIProposedDraft {
  text: string;
  subject_line: string | null;
  used_claim_ids: string[];
  used_cta_id: string | null;
  language: string;
  channel: ChannelType;
}
