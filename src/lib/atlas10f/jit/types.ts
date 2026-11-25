import { AtlasActionType } from '../types';

export type AtlasSubjectType = 'PERSON' | 'COMPANY';

export type AtlasJitAuthorizationStatus = 
  | 'AUTHORIZED'
  | 'DENIED'
  | 'REVIEW_REQUIRED'
  | 'STALE'
  | 'UNKNOWN';

export interface JitAuthorizationRequest {
  logical_execution_identity: string;
  execution_request_id: string;
  
  subject_type: AtlasSubjectType;
  subject_id: string;
  action_type: AtlasActionType;
  channel: string;
  
  nba_id?: string;
  certification_id?: string;
  certification_hash?: string;
  
  destination_hash: string;
  prepared_payload_hash: string;
  email_hash?: string;
}

export interface JitAuthorizationResult {
  status: AtlasJitAuthorizationStatus;
  reason_codes: string[];
  authority_bundle_hash: string;
  expires_at: string;
}
