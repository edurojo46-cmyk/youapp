import { ExternalPersonObservation } from '../IExternalPersonSourceAdapter';
import { GeminiCandidate } from '../../ai/gemini/GeminiSchemas';

export interface GroundedDiscoveryTelemetry {
  planned: boolean;
  called: boolean;
  http_success: boolean;
  raw_results: number;
  valid_results: number;
  rejected_results: number;
  rejected_entity_type: number;
  rejected_no_activity_evidence: number;
  rejected_geography: number;
  status: 'LIVE' | 'BLOCKED_MISSING_CREDENTIALS' | 'ERROR';
}

export interface GroundedDiscoveryResult {
  candidates: GeminiCandidate[];
  observations: ExternalPersonObservation[];
  businesses?: any[];
  telemetry?: GroundedDiscoveryTelemetry;
  metadata: {
    citations: string[];
    searchEntryPoint: string[];
  };
}

export interface IGroundedPersonDiscoveryProvider {
  discover(query: string, requiredConstraints: any): Promise<GroundedDiscoveryResult>;
}
