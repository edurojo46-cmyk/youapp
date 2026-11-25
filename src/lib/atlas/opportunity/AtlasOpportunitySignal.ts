/**
 * ATLAS OPPORTUNITY ENGINE V1
 * Module: AtlasOpportunitySignal.ts
 * Path: src/lib/atlas/opportunity/AtlasOpportunitySignal.ts
 * 
 * Commercial Signal Model.
 * Represents an individual, verified commercial signal extracted from Truth Assertions,
 * Temporal Events, and Physical Evidence.
 * 
 * Strict Invariant:
 * SIGNAL != OPPORTUNITY.
 * A signal is an observed factual indicator, NOT an inferred business opportunity.
 * Never creates a signal without traceable assertion/event/evidence.
 */

import crypto from 'crypto';
import type { TemporalSemantics } from '../temporal/AtlasTemporalEvent.ts';

export type OpportunitySignalType =
  | 'COMPANY_OPENED'
  | 'NEW_BRANCH'
  | 'ADDRESS_APPEARED'
  | 'ADDRESS_CHANGED'
  | 'ACTIVITY_APPEARED'
  | 'NEW_ROLE'
  | 'ORGANIZATION_CHANGED'
  | 'CONTACT_APPEARED'
  | 'PUBLIC_TENDER_APPEARED'
  | 'PUBLIC_CONTRACT_APPEARED'
  | 'JOB_POSTING_APPEARED'
  | 'NEW_LICENSE'
  | 'NEW_REGISTRATION';

export interface OpportunitySignal {
  signal_id: string;
  subject_type: 'PERSON' | 'COMPANY' | 'ORGANIZATION';
  subject_id: string;
  signal_type: OpportunitySignalType;
  temporal_semantics?: TemporalSemantics;
  assertion_id: string;
  temporal_event_id?: string | null;
  source_id: string;
  route_id?: string | null;
  detected_at: string;
  time_anchor: string;
  quality_score: number; // 0.0 - 1.0 based on source quality and evidence confidence
  payload: Record<string, any>;
  environment: 'TEST' | 'PRODUCTION';
  created_at: string;
}

export class AtlasOpportunitySignalHelper {
  public static generateSignalId(
    subject_id: string,
    signal_type: OpportunitySignalType,
    assertion_id: string,
    time_anchor: string
  ): string {
    const raw = `${subject_id}:${signal_type}:${assertion_id}:${time_anchor}`;
    const hash = crypto.createHash('sha256').update(raw).digest('hex').substring(0, 16);
    return `SIG_${signal_type}_${hash}`;
  }
}
