/**
 * scripts/discovery/atlas_universal_public_source_graph.mjs
 * 
 * ATLAS — UNIVERSAL PUBLIC SOURCE GRAPH
 * WIDE NET V3
 * 
 * Primary Principle:
 * Atlas must NOT think only in terms of isolated datasets or a fixed list of source classes.
 * It builds and continuously expands a UNIVERSAL GRAPH OF LEGITIMATE PUBLIC INFORMATION.
 * 
 * NO USEFUL PUBLIC NODE IS TERMINAL.
 */

export const PUBLIC_NODE_CLASSES = new Set([
  // Core Entities
  'PERSON',
  'BUSINESS',
  'COMPANY',
  'CORPORATION',

  // Chambers & Trade
  'CHAMBER',
  'BUSINESS_CHAMBER',
  'TRADE_ASSOCIATION',

  // Associations & Foundations
  'PROFESSIONAL_ASSOCIATION',
  'CIVIL_ASSOCIATION',
  'FOUNDATION',
  'NGO',
  'COOPERATIVE',
  'FEDERATION',
  'CONFEDERATION',

  // Clubs & Sports
  'CLUB',
  'SPORTS_CLUB',
  'CULTURAL_CLUB',

  // Professional Bodies & Regulators
  'PROFESSIONAL_BODY',
  'PROFESSIONAL_COUNCIL',

  // Academic & Research
  'UNIVERSITY',
  'FACULTY',
  'RESEARCH_CENTER',
  'INSTITUTE',

  // Government & Municipal
  'PUBLIC_AGENCY',
  'MUNICIPALITY',
  'PROVINCE',
  'PUBLIC_ENTITY',
  'STATE_COMPANY',

  // Registries, Directories & Lists
  'PUBLIC_REGISTRY',
  'DIRECTORY',
  'PUBLIC_ROSTER',
  'ARCHIVE',
  'DOCUMENT',
  'FILE',
  'LIST',
  'CATALOG',

  // Legal & Normative
  'BULLETIN',
  'GAZETTE',
  'DECREE',
  'RESOLUTION',
  'ACT',
  'ANNEX',

  // Events & Academic Outputs
  'PROGRAM',
  'EVENT',
  'CONFERENCE',
  'CONGRESS',
  'JOURNAL',
  'AWARD',
  'COMPETITION',

  // Procurement & Licenses
  'PUBLIC_PROCUREMENT',
  'SUPPLIER',
  'CONTRACTOR',
  'LICENSE',
  'PERMIT',
  'PROFESSIONAL_LICENSE',

  // Roles & Creators
  'CORPORATE_OFFICER',
  'DIRECTOR',
  'AUTHOR',
  'CREATOR',
  'PROFESSIONAL',

  // Media & Social
  'MEDIA_OUTLET',
  'PUBLIC_PAGE',
  'PUBLIC_GROUP',
  'PUBLIC_CHANNEL',
  'PUBLIC_COMMUNITY',

  // Technical & Web Infrastructure
  'WEBSITE',
  'DATASET',
  'OPEN_DATA_PORTAL',

  // Context & Geography
  'LOCATION',
  'PROFESSION',
  'INDUSTRY'
]);

export class AtlasUniversalPublicSourceGraph {
  constructor() {
    this.nodes = new Map(); // nodeId -> NodeObject
    this.edges = [];        // { from, to, relation, weight, metadata }
    this.adjacency = new Map(); // fromNodeId -> Set of toNodeIds
    this.extensibleClasses = new Set(PUBLIC_NODE_CLASSES);
    this.sensitiveClasses = new Set([
      'TRADE_UNION',
      'POLITICAL_PARTY',
      'RELIGIOUS_BODY',
      'HEALTH_CONDITION_ASSOCIATION',
      'VICTIM_SUPPORT_ORG'
    ]);
  }

  registerNewPublicNodeClass(className) {
    const normalized = className.toUpperCase().replace(/\s+/g, '_');
    this.extensibleClasses.add(normalized);
    return normalized;
  }

  isClassKnown(className) {
    return this.extensibleClasses.has(className.toUpperCase());
  }

  addNode(node) {
    const {
      id,
      nodeClass,
      label,
      platform = 'WEB',
      jurisdiction = 'ARG',
      publicAccessStatus = 'PUBLICLY_ACCESSIBLE',
      purposeCompatible = true,
      metadata = {}
    } = node;

    if (!id) throw new Error('Node must have a unique id');

    let finalClass = (nodeClass || 'WEBSITE').toUpperCase();
    if (!this.extensibleClasses.has(finalClass)) {
      finalClass = this.registerNewPublicNodeClass(finalClass);
    }

    if (!this.nodes.has(id)) {
      this.nodes.set(id, {
        id,
        nodeClass: finalClass,
        label: label || id,
        platform,
        jurisdiction,
        publicAccessStatus,
        purposeCompatible,
        depth: node.depth || 0,
        expansionScore: node.expansionScore || 1.0,
        networkMultiplierScore: node.networkMultiplierScore || 1.0,
        discoveredAt: node.discoveredAt || new Date().toISOString(),
        metadata,
        inDegree: 0,
        outDegree: 0
      });
      this.adjacency.set(id, new Set());
    }

    return this.nodes.get(id);
  }

  addEdge(fromId, toId, relation, weight = 1.0, metadata = {}) {
    if (!this.nodes.has(fromId) || !this.nodes.has(toId)) {
      return false;
    }

    this.edges.push({ from: fromId, to: toId, relation, weight, metadata });
    this.adjacency.get(fromId).add(toId);

    const fromNode = this.nodes.get(fromId);
    const toNode = this.nodes.get(toId);
    fromNode.outDegree++;
    toNode.inDegree++;

    return true;
  }

  getNode(id) {
    return this.nodes.get(id);
  }

  hasNode(id) {
    return this.nodes.has(id);
  }

  getNeighbors(id) {
    return Array.from(this.adjacency.get(id) || []).map(nid => this.nodes.get(nid));
  }

  /**
   * Sensitive Organization Boundary Gate (Section 4):
   * Ensures that while organizations themselves are valuable discovery nodes,
   * sensitive private memberships (unions, political parties, health, religion)
   * are NEVER ingested as personal fuel. Only public leadership/officers.
   */
  evaluateSensitiveBoundary(node) {
    const cls = node.nodeClass?.toUpperCase();
    const isSensitive = this.sensitiveClasses.has(cls) ||
      node.metadata?.isUnion ||
      node.metadata?.isPoliticalParty ||
      node.metadata?.isReligious;

    if (!isSensitive) {
      return { allowedForGraph: true, allowMemberIngestion: true };
    }

    // Sensitive organization: Graph expansion permitted (leadership, branches, documents),
    // but private/non-public membership lists strictly prohibited.
    return {
      allowedForGraph: true,
      allowMemberIngestion: false,
      reason: 'SENSITIVE_ORGANIZATION_BOUNDARY_ENFORCED',
      allowedRoles: ['PUBLIC_OFFICER', 'PUBLIC_REPRESENTATIVE', 'PUBLIC_DIRECTOR', 'LEGAL_REPRESENTATIVE']
    };
  }

  /**
   * Generates recursive discovery hypotheses for any node according to Section 2:
   * "NO NODE IS TERMINAL"
   */
  generateExpansionHypotheses(nodeId) {
    const node = this.nodes.get(nodeId);
    if (!node) return [];

    const hypotheses = [];
    const cls = node.nodeClass;
    const label = node.label;
    const jur = node.jurisdiction || 'ARG';

    // 1. What people does this node publicly reference?
    hypotheses.push({
      type: 'PERSON_REFERENCES',
      query: `${label} "autoridades" OR "directores" OR "integrantes"`,
      targetClass: 'PERSON',
      parent: nodeId
    });

    // 2. What organizations does it connect to?
    hypotheses.push({
      type: 'ORGANIZATION_CONNECTIONS',
      query: `${label} "cámara" OR "federación" OR "asociación"`,
      targetClass: 'ORGANIZATION',
      parent: nodeId
    });

    // 3. What documents does it publish?
    hypotheses.push({
      type: 'DOCUMENT_EXPANSION',
      query: `site:${node.metadata?.domain || label} filetype:pdf OR filetype:xlsx OR filetype:csv`,
      targetClass: 'DOCUMENT',
      parent: nodeId
    });

    // 4. What lists does it contain?
    hypotheses.push({
      type: 'LIST_EXPANSION',
      query: `${label} "nómina" OR "padrón" OR "listado" OR "directorio"`,
      targetClass: 'LIST',
      parent: nodeId
    });

    // 5. What analogous entities exist?
    hypotheses.push({
      type: 'ANALOGY_EXPANSION',
      query: `${cls} ${jur} analogous entities`,
      targetClass: cls,
      parent: nodeId
    });

    return hypotheses;
  }

  get stats() {
    const classDistribution = {};
    for (const n of this.nodes.values()) {
      classDistribution[n.nodeClass] = (classDistribution[n.nodeClass] || 0) + 1;
    }

    return {
      totalNodes: this.nodes.size,
      totalEdges: this.edges.length,
      classDistribution,
      extensibleClassesCount: this.extensibleClasses.size
    };
  }
}
