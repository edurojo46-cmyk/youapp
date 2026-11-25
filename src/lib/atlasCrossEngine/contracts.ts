export type AtlasCrossEngineId = "people" | "industrial" | "social" | "video" | "organizations" | "public_sources" | "public_contacts";
export type AtlasEvidenceState = "verified" | "observed" | "inferred" | "synthetic" | "unknown";
export interface AtlasCrossEngineEvidence { sourceId: string; sourceUrl?: string; observedAt: string; state: AtlasEvidenceState; confidence?: number; }
export interface AtlasCrossEngineRecord { recordId: string; entityType: string; displayName: string; attributes: Record<string, unknown>; evidence: AtlasCrossEngineEvidence[]; externalReferences?: Array<{ namespace: string; value: string }>; }
export interface AtlasCrossEngineQuery { text: string; geography?: string; limitPerEngine?: number; engines?: AtlasCrossEngineId[]; }
export interface AtlasCrossEngineAdapter { readonly engineId: AtlasCrossEngineId; search(query: AtlasCrossEngineQuery): Promise<AtlasCrossEngineRecord[]>; }
export interface AtlasCrossEngineFailure { engineId: AtlasCrossEngineId; message: string; }
export interface AtlasCrossEngineCandidateLink { reference: string; engineIds: AtlasCrossEngineId[]; recordIds: string[]; status: "candidate_requires_verification"; }
export interface AtlasCrossEngineReport { query: string; records: Array<{ engineId: AtlasCrossEngineId; record: AtlasCrossEngineRecord }>; failures: AtlasCrossEngineFailure[]; rejected: Array<{ engineId: AtlasCrossEngineId; recordId: string; reason: string }>; candidateLinks: AtlasCrossEngineCandidateLink[]; enginesRequested: AtlasCrossEngineId[]; enginesSucceeded: AtlasCrossEngineId[]; executionMode: "isolated_shadow"; }
