/**
 * ATLAS 10F-A Canonical Execution Contract Types
 * 
 * Defines the immutable boundaries and data shapes for external payload translation.
 */

// We reuse the exact canonical enum from the database (atlas_action_type)
export type AtlasActionType = 
  | 'EMAIL_SEND'
  | 'WHATSAPP_MARKETING_MESSAGE'
  | 'WHATSAPP_SERVICE_REPLY'
  | 'INSTAGRAM_DM'
  | 'INSTAGRAM_PUBLIC_REPLY'
  | 'X_DM'
  | 'X_PUBLIC_REPLY'
  | 'YOUTUBE_COMMENT'
  | 'YOUTUBE_LIVE_CHAT'
  | 'LINKEDIN_COMMENT'
  | 'META_AD_AUDIENCE'
  | 'GOOGLE_AD_AUDIENCE';

export type AtlasChannel = 
  | 'EMAIL' 
  | 'WHATSAPP' 
  | 'INSTAGRAM' 
  | 'X' 
  | 'YOUTUBE' 
  | 'LINKEDIN'
  | 'META_AD'
  | 'GOOGLE_AD';

// Strongly typed discriminated union for destination references
export type DestinationRef =
  | { kind: 'EMAIL'; contact_id: string; email_address_id: string; }
  | { kind: 'WHATSAPP'; contact_id: string; whatsapp_destination_id: string; conversation_id?: string; }
  | { kind: 'INSTAGRAM_DM'; account_ref: string; thread_ref: string; }
  | { kind: 'INSTAGRAM_PUBLIC_REPLY'; account_ref: string; target_content_ref: string; parent_comment_ref?: string; }
  | { kind: 'X_DM'; account_ref: string; conversation_ref: string; }
  | { kind: 'X_PUBLIC_REPLY'; account_ref: string; target_post_ref: string; }
  | { kind: 'YOUTUBE_COMMENT'; channel_ref: string; video_ref: string; parent_comment_ref?: string; }
  | { kind: 'YOUTUBE_LIVE_CHAT'; channel_ref: string; live_chat_ref: string; }
  | { kind: 'LINKEDIN_COMMENT'; account_ref: string; target_post_ref: string; };

export interface AtlasExecutionRequest {
  readonly execution_request_id: string;
  readonly tenant_id: string;

  readonly subject_type: 'PERSON' | 'COMPANY';
  readonly subject_id: string;

  readonly action_type: AtlasActionType;
  readonly channel: AtlasChannel;

  readonly nba_decision_id: string;
  readonly message_draft_id: string;
  readonly message_certification_id: string;
  
  readonly certification_snapshot_hash: string;
  
  readonly destination_ref: DestinationRef;

  readonly message_body: string;
  readonly message_subject: string | null;

  // Metadata that adapters might need but shouldn't alter
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export type ValidationStatus = 
  | 'VALID'
  | 'INVALID'
  | 'UNSUPPORTED'
  | 'MISSING_DESTINATION'
  | 'MISSING_MESSAGE'
  | 'INVALID_CERTIFICATION_BINDING' // We do not check JIT stales here, only structural bindings
  | 'CAPABILITY_MISMATCH'
  | 'UNKNOWN';

export interface ValidationResult {
  status: ValidationStatus;
  reason?: string;
}

export interface ProviderCapability {
  provider: string;
  channel: AtlasChannel;
  supportedActions: AtlasActionType[];
  supportsPlainText: boolean;
  supportsSubject: boolean;
  requiresTargetContent: boolean;
  requiresConversationThread: boolean;
  supportsIdempotencyToken: boolean;
  supportsProviderNativeIdempotency: boolean;
}
