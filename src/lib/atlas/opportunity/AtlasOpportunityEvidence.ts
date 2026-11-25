/**
 * ATLAS OPPORTUNITY ENGINE V1
 * Module: AtlasOpportunityEvidence.ts
 * Path: src/lib/atlas/opportunity/AtlasOpportunityEvidence.ts
 * 
 * Opportunity Evidence Model.
 * Bridges an Opportunity Hypothesis with its supporting physical facts:
 * OPPORTUNITY -> SIGNAL -> TEMPORAL EVENT -> ASSERTION -> EVIDENCE -> ROUTE -> SOURCE GENOME
 */

import crypto from 'crypto';

export interface OpportunityEvidenceLink {
  opportunity_evidence_id: string;
  opportunity_id: string;
  signal_id: string;
  assertion_id: string;
  temporal_event_id?: string | null;
  source_id: string;
  route_id?: string | null;
  observed_at: string;
  role_in_hypothesis: string;
  weight: number;
  environment: 'TEST' | 'PRODUCTION';
  created_at: string;
}

export class AtlasOpportunityEvidenceHelper {
  public static generateLinkId(
    opportunity_id: string,
    signal_id: string,
    assertion_id: string
  ): string {
    const raw = `${opportunity_id}:${signal_id}:${assertion_id}`;
    const hash = crypto.createHash('sha256').update(raw).digest('hex').substring(0, 16);
    return `OPPEVD_${hash}`;
  }
}
