/**
 * ATLAS SOURCE FACTORY V1
 * Module: AtlasSourceFactoryRegistry.ts
 * Path: src/lib/atlas/source-factory/AtlasSourceFactoryRegistry.ts
 * 
 * In-memory & DB Registry for Source Factory state transitions.
 * Tracks candidate sources across the factory pipeline lifecycle.
 */

export type FactoryState =
  | 'DISCOVERED_NOT_INSPECTED'
  | 'INSPECTING'
  | 'INSPECTED'
  | 'ADAPTER_SPEC_CREATED'
  | 'PROBE_PENDING'
  | 'PROBE_FAILED'
  | 'PROBE_PASSED'
  | 'EXECUTABLE'
  | 'NEEDS_NEW_ADAPTER'
  | 'QUARANTINED';

export interface DiscoveredSourceCandidate {
  source_id: string;
  source_family: string;
  domain: string;
  location: string;
  discovery_provenance?: string;
  detected_format?: string;
  current_state: FactoryState;
  created_at: string;
  updated_at: string;
  last_error?: string;
}

export class AtlasSourceFactoryRegistry {
  private static instance: AtlasSourceFactoryRegistry;
  private candidates: Map<string, DiscoveredSourceCandidate> = new Map();

  private constructor() {}

  public static getInstance(): AtlasSourceFactoryRegistry {
    if (!AtlasSourceFactoryRegistry.instance) {
      AtlasSourceFactoryRegistry.instance = new AtlasSourceFactoryRegistry();
    }
    return AtlasSourceFactoryRegistry.instance;
  }

  public registerCandidate(candidate: Omit<DiscoveredSourceCandidate, 'created_at' | 'updated_at'>): DiscoveredSourceCandidate {
    const existing = this.candidates.get(candidate.source_id);
    const now = new Date().toISOString();
    const entry: DiscoveredSourceCandidate = {
      ...candidate,
      created_at: existing ? existing.created_at : now,
      updated_at: now
    };
    this.candidates.set(candidate.source_id, entry);
    return entry;
  }

  public updateState(source_id: string, state: FactoryState, last_error?: string): void {
    const existing = this.candidates.get(source_id);
    if (existing) {
      existing.current_state = state;
      existing.updated_at = new Date().toISOString();
      if (last_error) existing.last_error = last_error;
    }
  }

  public getCandidate(source_id: string): DiscoveredSourceCandidate | undefined {
    return this.candidates.get(source_id);
  }

  public getAllCandidates(): DiscoveredSourceCandidate[] {
    return Array.from(this.candidates.values());
  }
}
