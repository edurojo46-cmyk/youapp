/**
 * scripts/discovery/unified_discovery_graph.mjs
 * 
 * ATLAS — UNIFIED DISCOVERY GRAPH V16
 * 
 * Mandates:
 * 1. Maintain deterministic graph links across:
 *    PERSON CANDIDATE <-> SOCIAL PROFILE <-> MEDIA ARTICLE <-> MAP ENTITY 
 *    <-> GOOGLE RESULT <-> WEBSITE <-> ORGANIZATION <-> PROFESSION 
 *    <-> CITY <-> PROVINCE <-> OFFICIAL SOURCE <-> PUBLIC REGISTRY 
 *    <-> DATASET <-> CANONICAL HUMAN
 * 2. Exists strictly for discovery discovery routing and multi-source identity evidence.
 * 3. INVARIANT: IT MUST NEVER MULTIPLY FUEL CREDITS (ONE HUMAN = ONE CREDIT).
 */

export class UnifiedDiscoveryGraph {
  constructor() {
    this.nodes = new Map(); // id -> { type, label, data }
    this.edges = [];        // { from, to, relation, weight }
    this.personEvidenceMap = new Map(); // personId -> Set of evidence node IDs
  }

  addNode(id, type, label, data = {}) {
    if (!this.nodes.has(id)) {
      this.nodes.set(id, { id, type, label, data });
    }
    return this.nodes.get(id);
  }

  addEdge(fromId, toId, relation, weight = 1.0) {
    this.edges.push({ from: fromId, to: toId, relation, weight });
  }

  /**
   * Link multi-source evidence to a person candidate.
   */
  linkPersonEvidence(personCanonicalKey, evidenceNodeId) {
    if (!this.personEvidenceMap.has(personCanonicalKey)) {
      this.personEvidenceMap.set(personCanonicalKey, new Set());
    }
    this.personEvidenceMap.get(personCanonicalKey).add(evidenceNodeId);
  }

  get stats() {
    const typeCounts = {};
    for (const node of this.nodes.values()) {
      typeCounts[node.type] = (typeCounts[node.type] || 0) + 1;
    }
    return {
      totalNodes: this.nodes.size,
      totalEdges: this.edges.length,
      nodesByType: typeCounts,
      personsWithLinkedEvidence: this.personEvidenceMap.size
    };
  }
}
