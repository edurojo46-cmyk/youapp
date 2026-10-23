/**
 * SHARED TYPES PACKAGE
 * @packages/types
 * 
 * Neutral shared types for Atlas Platform, Busca Industrial, and YouApp.
 * Strictly avoids engine-specific internals (no ranking models, no search indices).
 */

export type ProductScope = 'ATLAS' | 'INDUSTRIAL' | 'YOUAPP';

// --- AUTH & USER PROFILE CONTRACTS ---
export interface SharedUser {
  id: string;
  email?: string;
  created_at?: string;
  app_metadata?: Record<string, any>;
  user_metadata?: Record<string, any>;
}

export interface SharedUserProfile {
  id: string;
  user_id: string;
  full_name?: string;
  avatar_url?: string;
  updated_at?: string;
}

export interface SharedCompanyProfile {
  id: string;
  user_id: string;
  company_name: string;
  cuit?: string;
  industry?: string;
  verified?: boolean;
}

// --- NEUTRAL CRM & RELATION CONTRACTS ---
export interface SharedProspect {
  id: string;
  user_id: string;
  entity_id: string;
  entity_type: 'PERSON' | 'ORGANIZATION' | 'INDUSTRIAL';
  entity_name: string;
  status: 'PROSPECT' | 'CONTACTED' | 'PROPOSAL_SENT' | 'CUSTOMER' | 'ARCHIVED';
  notes?: string;
  next_action?: string;
  next_action_date?: string;
  created_at: string;
  updated_at: string;
}

// --- NEUTRAL ENTITY INTERFACES FOR CROSS-QUERYING ---
export interface PersonSummary {
  id: string;
  name: string;
  headline?: string;
  city?: string;
  province?: string;
  country?: string;
}

export interface OrganizationSummary {
  id: string;
  name: string;
  tax_id?: string;
  industry?: string;
  city?: string;
  province?: string;
}

export interface ContactSummary {
  id: string;
  entity_id: string;
  type: 'EMAIL' | 'PHONE' | 'LINKEDIN' | 'WEBSITE';
  value: string;
  verified: boolean;
}

// --- ATLAS MAIL HORIZONTAL CONTRACTS ---
export type MailClassification = 'TRANSACTIONAL' | 'COMMERCIAL' | 'CAMPAIGN' | 'SECURITY';

export type MailDeliveryStatus = 
  | 'ACCEPTED'
  | 'QUEUED'
  | 'SENT'
  | 'DELIVERED'
  | 'BOUNCED'
  | 'COMPLAINED'
  | 'SUPPRESSED'
  | 'DEFERRED'
  | 'FAILED';

export interface SendMailOptions {
  product_scope: ProductScope;
  to: string;
  subject: string;
  template_id?: string;
  html?: string;
  text?: string;
  metadata?: Record<string, any>;
  correlation_id?: string;
}

export interface SendCommercialMailOptions extends SendMailOptions {
  proposal_id?: string;
  quote_id?: string;
  recipient_company?: string;
  reply_to?: string;
}

export interface SendCampaignMailOptions {
  product_scope: ProductScope;
  campaign_id: string;
  template_id: string;
  recipients: Array<{
    email: string;
    vars?: Record<string, string | number>;
  }>;
  metadata?: Record<string, any>;
}

export interface MailDeliveryResult {
  success: boolean;
  message_id?: string;
  status: MailDeliveryStatus;
  product_scope: ProductScope;
  error?: string;
  timestamp: string;
}

export interface DeliveryStatusResponse {
  message_id: string;
  product_scope: ProductScope;
  status: MailDeliveryStatus;
  events: Array<{
    event: string;
    timestamp: string;
    details?: string;
  }>;
}

export interface SuppressionCheckResponse {
  email: string;
  is_suppressed: boolean;
  reason?: string;
  product_scope?: ProductScope;
  global_suppression: boolean;
}

// --- GENERIC API CONTRACTS ---
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}
