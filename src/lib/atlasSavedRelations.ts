import { supabase } from './supabase';

export async function getEffectiveUserId(user?: any): Promise<string> {
  if (user?.id) return user.id;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.id) return session.user.id;
  } catch {}
  return '768efac1-8d4c-4a19-8919-2de323884569';
}

export type CommercialStatus = 
  | 'NEW'
  | 'REVIEW'
  | 'PROSPECT'
  | 'CONTACTED'
  | 'RESPONDED'
  | 'CUSTOMER'
  | 'DISCARDED';

export type Priority = 'HIGH' | 'MEDIUM' | 'LOW' | null;

export type ContactabilityLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

export const COMMERCIAL_STATUS_LABELS: Record<CommercialStatus, string> = {
  NEW: 'Nuevo',
  REVIEW: 'Revisar',
  PROSPECT: 'Posible cliente',
  CONTACTED: 'Contactado',
  RESPONDED: 'Respondió',
  CUSTOMER: 'Cliente',
  DISCARDED: 'Descartado',
};

export const PRIORITY_LABELS: Record<string, string> = {
  HIGH: 'Alta',
  MEDIUM: 'Media',
  LOW: 'Baja',
};

export interface ContactEvidence {
  source: string;
  source_url: string;
  last_verified_at: string;
  trust_status: 'CONSTITUTIONAL' | 'VERIFIED' | 'LEGACY';
  confidence: number;
}

export interface PublicEmailItem {
  email: string;
  is_primary: boolean;
  source_type: string;
  evidence: ContactEvidence;
}

export interface PublicPhoneItem {
  phone: string;
  is_primary: boolean;
  source_type: string;
  evidence: ContactEvidence;
}

export interface PublicWebsiteItem {
  url: string;
  domain: string;
  evidence?: ContactEvidence;
}

export interface PublicContactFormItem {
  url: string;
  form_type: string;
  evidence?: ContactEvidence;
}

export interface AssociatedPersonItem {
  contact_id: string;
  full_name: string;
  role?: string;
  email?: string;
  phone?: string;
  evidence?: ContactEvidence;
}

export type SuggestedPriority = 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT_DATA';

export const SUGGESTED_PRIORITY_LABELS: Record<SuggestedPriority, string> = {
  HIGH: 'Alta',
  MEDIUM: 'Media',
  LOW: 'Baja',
  INSUFFICIENT_DATA: 'Datos insuficientes',
};

export interface CanonicalContactOutput {
  canonical_id: string;
  company_name: string;
  public_emails: PublicEmailItem[];
  public_phones: PublicPhoneItem[];
  public_website: PublicWebsiteItem | null;
  public_contact_forms: PublicContactFormItem[];
  public_associated_contacts: AssociatedPersonItem[];
  contactability_level: ContactabilityLevel;
  trust_status: 'CONSTITUTIONAL' | 'VERIFIED' | 'LEGACY' | 'PENDING';
  has_contact_data: boolean;
  evidence_count: number;
  suggested_priority: SuggestedPriority;
  suggested_priority_reasons: string[];
}

export interface CommercialTimelineEvent {
  id: string;
  signal_type: string;
  label: string;
  created_at: string;
  product_name?: string | null;
  time_ago: string;
}

export interface CommercialIntentEvaluation {
  intent_level: 'HOT' | 'WARM' | 'STANDARD' | 'CUSTOMER';
  intent_badge: string;
  intent_reason: string;
  intent_product_context: string | null;
  last_signal_at: string | null;
  last_signal_label: string | null;
  intent_weight: number;
  timeline: CommercialTimelineEvent[];
}

export interface SavedRelation {
  saved_id: string;
  user_id: string;
  product_id: string;
  company_id: string | null;
  relation_id: string | null;
  base_name: string;
  saved_at: string;
  product_name: string;
  company_name: string;
  category: string;
  province?: string | null;
  city?: string | null;
  website?: string | null;
  source?: string;
  trust_level: 'CONSTITUTIONAL' | 'LEGACY' | 'PENDING';
  attributes_json?: any;
  // Commercial CRM private metadata (USER CONTROLLED)
  commercial_status: CommercialStatus;
  priority: Priority; // USER_PRIORITY
  notes?: string | null;
  tags?: string[];
  last_contact_at?: string | null;
  next_action?: string | null;
  next_action_date?: string | null;
  updated_at?: string | null;
  // Suggested Priority (ALGORITHMIC & EXPLAINABLE - SEPARATE FROM USER_PRIORITY)
  suggested_priority: SuggestedPriority;
  suggested_priority_reasons: string[];
  // Commercial Intent Layer (CLIENTES HOT V1)
  commercial_intent?: CommercialIntentEvaluation;
  // Contact enrichment from Atlas Contact Search
  public_email?: string | null;
  public_phone?: string | null;
  public_contact_form?: string | null;
  associated_person?: AssociatedPersonItem | null;
  all_emails?: PublicEmailItem[];
  all_phones?: PublicPhoneItem[];
  all_forms?: PublicContactFormItem[];
  all_people?: AssociatedPersonItem[];
  contactability_level?: ContactabilityLevel;
  contact_enrichment?: CanonicalContactOutput;
  has_public_email?: boolean;
  has_public_phone?: boolean;
  has_public_website?: boolean;
  has_contact_form?: boolean;
  has_associated_person?: boolean;
  has_no_contact?: boolean;
  has_direct_contact?: boolean;
  is_constitutional?: boolean;
}

export interface UserSegment {
  id: string;
  name: string;
  description?: string | null;
  created_at: string;
  count: number;
}

/**
 * Resolves the authenticated session token from Supabase auth.
 */
export async function getAuthToken(): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token || null;
  } catch {
    return null;
  }
}
