/**
 * ATLAS — AI PATHFINDER V1
 * Module: OntologyDiscovery (Section 17)
 * 
 * Inspects newly discovered clusters of evidence to identify and propose
 * candidate new entity classes/types (ONTOLOGY_CANDIDATE) for promotion.
 */

import type { DatabaseRecord, OntologyCandidate } from './types.ts';

export class OntologyDiscovery {
  private static candidates: Map<string, OntologyCandidate> = new Map();

  public static inspectRecordsForOntologyCandidates(
    missionId: string,
    parentClass: string,
    records: DatabaseRecord[]
  ): OntologyCandidate[] {
    const newlyDiscovered: OntologyCandidate[] = [];

    // Analyze recurrent attributes across records
    const attributeFrequencies: Record<string, number> = {};
    for (const r of records) {
      for (const [key, val] of Object.entries(r.data)) {
        if (val !== undefined && val !== null && val !== '') {
          attributeFrequencies[key] = (attributeFrequencies[key] || 0) + 1;
        }
      }
    }

    // If specialized patterns emerge (e.g. biotech patents, medical device registrations, open data feeds)
    const count = records.length;
    if (count >= 1) {
      if ((attributeFrequencies['cuit'] || attributeFrequencies['sector']) && parentClass === 'ORGANIZATION') {
        const candId = 'ONT_BIOTECH_MEDICAL_DEVICE_MANUFACTURER';
        if (!this.candidates.has(candId)) {
          const candidate: OntologyCandidate = {
            id: candId,
            className: 'MedicalDeviceAndBiotechManufacturer',
            parentClass: 'Organization',
            definingAttributes: ['cuit', 'activity_description', 'source_registry', 'registrationNumber'],
            evidenceFrequency: count,
            observedInMissions: [missionId],
            status: 'PROPOSED'
          };
          this.candidates.set(candId, candidate);
          newlyDiscovered.push(candidate);
          console.log(`[OntologyDiscovery] Emergent Ontology Candidate Proposed: "${candidate.className}" under ${candidate.parentClass}`);
        }
      } else if (attributeFrequencies['access_url'] && attributeFrequencies['format'] && parentClass === 'PUBLIC_SOURCE') {
        const candId = 'ONT_FEDERATED_CKAN_DISTRIBUTION';
        if (!this.candidates.has(candId)) {
          const candidate: OntologyCandidate = {
            id: candId,
            className: 'FederatedCkanDistribution',
            parentClass: 'PublicSource',
            definingAttributes: ['access_url', 'format', 'provenance_authority', 'public_access_status'],
            evidenceFrequency: count,
            observedInMissions: [missionId],
            status: 'PROPOSED'
          };
          this.candidates.set(candId, candidate);
          newlyDiscovered.push(candidate);
          console.log(`[OntologyDiscovery] Emergent Ontology Candidate Proposed: "${candidate.className}" under ${candidate.parentClass}`);
        }
      }
    }

    return newlyDiscovered;
  }

  public static getCandidates(): OntologyCandidate[] {
    return Array.from(this.candidates.values());
  }

  public static getAllCandidates(): OntologyCandidate[] {
    return Array.from(this.candidates.values());
  }
}
