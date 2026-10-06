/**
 * scripts/discovery/million_node_discovery_frontier.mjs
 * 
 * ATLAS — MILLION NODE DISCOVERY FRONTIER
 * WIDE NET V3
 * 
 * Target: MILLION_NODE_FRONTIER_CAPACITY >= 1,000,000.
 * Architecture can grow beyond 1M without redesign.
 */

export const FRONTIER_STATES = Object.freeze([
  'DISCOVERED',
  'QUEUED',
  'ACCESS_CHECK_PENDING',
  'ACCESS_PERMITTED',
  'DISCOVERY_ONLY',
  'READY_TO_PROBE',
  'PROBING',
  'PROBED',
  'EXPANSION_PENDING',
  'EXPANDED',
  'EXHAUSTED',
  'RETRY_LATER',
  'RATE_LIMITED',
  'ACCESS_NOT_PERMITTED',
  'PURPOSE_INCOMPATIBLE',
  'ERROR_RETRYABLE',
  'ERROR_FINAL'
]);

export class MillionNodeDiscoveryFrontier {
  constructor(initialCapacity = 1500000) {
    this.capacity = initialCapacity;
    this.nodes = new Map(); // nodeId -> FrontierNode
    this.stateIndex = new Map(); // stateString -> Set(nodeId)
    this.expandedLedger = new Set(); // Set of expanded node keys (loop prevention)

    // Metrics counters
    this.campaignInitialNodes = 0;
    this.campaignNodesProcessed = 0;
    this.newChildNodesDiscovered = 0;
    this.totalChildrenCount = 0;
    this.totalExpandedCount = 0;

    for (const st of FRONTIER_STATES) {
      this.stateIndex.set(st, new Set());
    }
  }

  registerNode(node) {
    const {
      nodeId,
      discoveredAt = new Date().toISOString(),
      discoveryParent = null,
      discoveryPath = '',
      depth = 0,
      platform = 'WEB',
      nodeClass = 'WEBSITE',
      publicAccessStatus = 'ACCESS_PERMITTED',
      automationStatus = 'READY_TO_PROBE',
      purposeCompatibility = true,
      initialState = 'DISCOVERED',
      expansionScore = 1.0,
      networkMultiplierScore = 1.0,
      downstreamSourceCount = 0,
      downstreamPersonCount = 0,
      lastProcessedSnapshot = null,
      isInitialCampaignNode = false
    } = node;

    if (this.nodes.has(nodeId)) {
      return this.nodes.get(nodeId); // Idempotent: already in frontier
    }

    const frontierNode = {
      nodeId,
      discoveredAt,
      discoveryParent,
      discoveryPath: discoveryPath || (discoveryParent ? `${discoveryParent} -> ${nodeId}` : nodeId),
      depth,
      platform,
      nodeClass,
      publicAccessStatus,
      automationStatus,
      purposeCompatibility,
      state: initialState,
      expansionScore,
      networkMultiplierScore,
      downstreamSourceCount,
      downstreamPersonCount,
      lastProcessedSnapshot,
      isInitialCampaignNode,
      directChildrenCount: 0
    };

    this.nodes.set(nodeId, frontierNode);
    this.stateIndex.get(initialState).add(nodeId);

    if (isInitialCampaignNode) {
      this.campaignInitialNodes++;
    } else {
      this.newChildNodesDiscovered++;
      if (discoveryParent && this.nodes.has(discoveryParent)) {
        const parent = this.nodes.get(discoveryParent);
        parent.directChildrenCount++;
        this.totalChildrenCount++;
      }
    }

    return frontierNode;
  }

  transitionState(nodeId, newState) {
    if (!FRONTIER_STATES.includes(newState)) {
      throw new Error(`Invalid state transition to: ${newState}`);
    }

    const node = this.nodes.get(nodeId);
    if (!node) return false;

    const oldState = node.state;
    if (oldState === newState) return true;

    this.stateIndex.get(oldState).delete(nodeId);
    this.stateIndex.get(newState).add(nodeId);
    node.state = newState;

    if (newState === 'EXPANDED' || newState === 'EXHAUSTED' || newState === 'DISCOVERY_ONLY' || 
        newState === 'ACCESS_NOT_PERMITTED' || newState === 'PURPOSE_INCOMPATIBLE' || newState === 'ERROR_FINAL') {
      if (node.isInitialCampaignNode && !node._campaignCounted) {
        this.campaignNodesProcessed++;
        node._campaignCounted = true;
      }
    }

    if (newState === 'EXPANDED') {
      this.expandedLedger.add(nodeId);
      this.totalExpandedCount++;
    }

    return true;
  }

  hasExpanded(nodeId) {
    return this.expandedLedger.has(nodeId);
  }

  getNodesInState(state) {
    return Array.from(this.stateIndex.get(state) || []);
  }

  getStateCount(state) {
    return (this.stateIndex.get(state) || []).size;
  }

  get stats() {
    const stateCounts = {};
    for (const [st, set] of this.stateIndex.entries()) {
      stateCounts[st] = set.size;
    }

    const totalNodes = this.nodes.size;
    const avgChildren = this.totalExpandedCount > 0 
      ? (this.totalChildrenCount / this.totalExpandedCount).toFixed(2)
      : '0.00';
    
    // R0 Discovery Reproduction Rate (virality)
    const r0 = this.totalExpandedCount > 0
      ? (this.newChildNodesDiscovered / this.totalExpandedCount).toFixed(2)
      : '1.00';

    return {
      frontierCapacity: this.capacity,
      totalFrontierNodes: totalNodes,
      campaignInitialNodes: this.campaignInitialNodes,
      campaignNodesProcessed: this.campaignNodesProcessed,
      campaignNodesRemaining: Math.max(0, this.campaignInitialNodes - this.campaignNodesProcessed),
      newChildNodesDiscovered: this.newChildNodesDiscovered,
      avgChildrenPerExpandedNode: parseFloat(avgChildren),
      discoveryReproductionRate: parseFloat(r0),
      stateCounts
    };
  }
}
