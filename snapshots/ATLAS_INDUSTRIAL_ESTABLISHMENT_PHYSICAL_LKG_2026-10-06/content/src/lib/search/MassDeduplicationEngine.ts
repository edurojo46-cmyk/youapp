import { LightweightPersonRecord, PossibleMatchCluster } from './MassDiscoveryTypes';

export interface DedupResult {
  unique_records: LightweightPersonRecord[];
  clusters: PossibleMatchCluster[];
  merged_count: number;
  clustered_count: number;
}

export class MassDeduplicationEngine {
  /**
   * Performs incremental deduplication at scale with complexity O(N).
   * 
   * Strict rules:
   * 1. Strong auto-merge: Only when proven by strong unassailable identifiers:
   *    - Same Wikidata QID
   *    - Same ORCID ID
   *    - Same GitHub username within GitHub
   *    - Same verified official registry ID
   *    - Same canonical person-specific profile identifier from the same factual source
   * 
   * 2. Moderate evidence: Normalized name + verified organization + city/province
   *    Creates a PossibleMatchCluster, NEVER an automatic physical-person merge!
   *    NAME_ORG_CITY_AUTO_MERGE = 0
   * 
   * 3. Weak evidence: Similar name, same profession, same location
   *    Kept completely separate as distinct records.
   *    NAME_PROFESSION_AUTO_MERGE = 0
   *    NAME_LOCATION_AUTO_MERGE = 0
   */
  public static deduplicate(records: LightweightPersonRecord[]): DedupResult {
    const strongKeyMap = new Map<string, LightweightPersonRecord>();
    const clusterMap = new Map<string, PossibleMatchCluster>();
    const uniqueRecords: LightweightPersonRecord[] = [];
    let mergedCount = 0;
    let clusteredCount = 0;

    for (const rec of records) {
      // 1. Check strong identity key
      const strongKey = this.extractStrongKey(rec);
      if (strongKey) {
        if (strongKeyMap.has(strongKey)) {
          // Merge metadata into existing record
          const existing = strongKeyMap.get(strongKey)!;
          this.mergeStrongIdentity(existing, rec);
          mergedCount++;
          continue;
        } else {
          strongKeyMap.set(strongKey, rec);
        }
      }

      // 2. Check moderate evidence (Normalized name + Org + City) -> Cluster (NOT auto-merge)
      const moderateKey = this.extractModerateClusterKey(rec);
      if (moderateKey) {
        if (!clusterMap.has(moderateKey)) {
          clusterMap.set(moderateKey, {
            cluster_id: 'cluster_' + Math.random().toString(36).substring(7),
            canonical_name: rec.display_name,
            organization: rec.organization || '',
            location: rec.location || rec.geography_claim || '',
            members: [rec]
          });
        } else {
          const cluster = clusterMap.get(moderateKey)!;
          cluster.members.push(rec);
          clusteredCount++;
          // In moderate evidence, we keep rec as a separate person entry,
          // but linked to the cluster so the UI can group them under "Posible coincidencia".
        }
      }

      uniqueRecords.push(rec);
    }

    return {
      unique_records: uniqueRecords,
      clusters: Array.from(clusterMap.values()).filter(c => c.members.length > 1),
      merged_count: mergedCount,
      clustered_count: clusteredCount
    };
  }

  private static extractStrongKey(rec: LightweightPersonRecord): string | null {
    if (rec.public_identifiers?.wikidata_qid) {
      return `wikidata:${rec.public_identifiers.wikidata_qid.toLowerCase().trim()}`;
    }
    if (rec.public_identifiers?.orcid_id) {
      return `orcid:${rec.public_identifiers.orcid_id.toLowerCase().trim()}`;
    }
    if (rec.provider === 'GITHUB_API' && rec.public_identifiers?.github_username) {
      return `github:${rec.public_identifiers.github_username.toLowerCase().trim()}`;
    }
    if (rec.public_identifiers?.official_registry_record_id && rec.source_id) {
      return `registry:${rec.source_id}:${rec.public_identifiers.official_registry_record_id.toLowerCase().trim()}`;
    }
    if (rec.public_identifiers?.source_scoped_fingerprint && rec.source_id) {
      return `fingerprint:${rec.source_id}:${rec.public_identifiers.source_scoped_fingerprint}`;
    }
    return null;
  }

  private static extractModerateClusterKey(rec: LightweightPersonRecord): string | null {
    if (!rec.display_name || !rec.organization) return null;
    const normName = rec.display_name.toLowerCase().replace(/\s+/g, ' ').trim();
    const normOrg = rec.organization.toLowerCase().replace(/\s+/g, ' ').trim();
    const normLoc = (rec.location || rec.geography_claim || '').toLowerCase().trim();

    if (normName.length > 3 && normOrg.length > 2 && normLoc.length > 2) {
      return `${normName}|${normOrg}|${normLoc}`;
    }
    return null;
  }

  private static mergeStrongIdentity(target: LightweightPersonRecord, incoming: LightweightPersonRecord): void {
    // Combine evidence and identifiers
    if (!target.organization && incoming.organization) target.organization = incoming.organization;
    if (!target.location && incoming.location) target.location = incoming.location;
    if (!target.why_matched_work && incoming.why_matched_work) target.why_matched_work = incoming.why_matched_work;
    if (!target.why_matched_geography && incoming.why_matched_geography) target.why_matched_geography = incoming.why_matched_geography;
    target.evidence_score = Math.max(target.evidence_score, incoming.evidence_score);

    // Merge public identifiers
    target.public_identifiers = {
      ...target.public_identifiers,
      ...incoming.public_identifiers
    };
  }
}
