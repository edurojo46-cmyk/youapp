import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export class AtlasSourceGraph {
  constructor(storagePath = 'scratch/atlas_source_graph.json') {
    this.storagePath = path.resolve(storagePath);
    this.nodes = new Map();     // sourceId -> SourceNode
    this.resources = new Map(); // resourceId -> ResourceNode
    this.entities = new Map();  // entityId -> EntityNode
    this.edges = [];            // Array of SourceGraphEdge
    this.load();
  }

  load() {
    if (fs.existsSync(this.storagePath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(this.storagePath, 'utf8'));
        for (const n of (raw.nodes || [])) {
          this.nodes.set(n.sourceId, n);
        }
        for (const r of (raw.resources || [])) {
          this.resources.set(r.resourceId, r);
        }
        for (const e of (raw.entities || [])) {
          this.entities.set(e.entityId, e);
        }
        this.edges = raw.edges || [];
        console.log(`[AtlasSourceGraph] Loaded persistent graph: ${this.nodes.size} sources, ${this.resources.size} resources, ${this.entities.size} entities, ${this.edges.length} edges.`);
      } catch (err) {
        console.warn('[AtlasSourceGraph] Could not load graph, initializing fresh:', err.message);
      }
    }
  }

  save() {
    const dir = path.dirname(this.storagePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const payload = {
      version: '2.1.0',
      savedAt: new Date().toISOString(),
      stats: {
        totalSources: this.nodes.size,
        totalResources: this.resources.size,
        totalEntities: this.entities.size,
        totalEdges: this.edges.length
      },
      nodes: Array.from(this.nodes.values()),
      resources: Array.from(this.resources.values()),
      entities: Array.from(this.entities.values()),
      edges: this.edges
    };

    fs.writeFileSync(this.storagePath, JSON.stringify(payload, null, 2), 'utf8');
  }

  addEntityNode(entity) {
    const entityId = entity.entityId || `ENT_${crypto.randomBytes(6).toString('hex')}`;
    let existing = this.entities.get(entityId);
    if (!existing) {
      existing = {
        entityId,
        entityType: entity.entityType || 'ORGANIZATION',
        entityName: entity.entityName,
        officialId: entity.officialId || null,
        jurisdiction: entity.jurisdiction || 'ARG',
        sector: entity.sector || 'GENERAL',
        parentSourceId: entity.parentSourceId || null,
        metadata: entity.metadata || {},
        discoveredAt: new Date().toISOString()
      };
      this.entities.set(entityId, existing);
    }
    return existing;
  }

  canonicalizeSourceId(rawId) {
    if (!rawId) return `SRC_UNKNOWN_${crypto.randomBytes(4).toString('hex')}`;
    return rawId.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  }

  canonicalizeResourceId(sourceId, rawResourceId) {
    if (!rawResourceId) return `RES_${sourceId}_${crypto.randomBytes(4).toString('hex')}`;
    return `RES_${sourceId}_${rawResourceId.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_')}`;
  }

  addSourceNode(node) {
    const sourceId = this.canonicalizeSourceId(node.sourceId);
    let existing = this.nodes.get(sourceId);

    if (!existing) {
      existing = {
        sourceId,
        sourceFamily: node.sourceFamily || 'GENERAL_CATALOG',
        sourceName: node.sourceName || sourceId,
        organization: node.organization || 'UNKNOWN_ORGANIZATION',
        domain: node.domain || (node.url ? new URL(node.url).hostname : 'unknown'),
        url: node.url || '',
        apiEndpoints: node.apiEndpoints || [],
        catalogEndpoints: node.catalogEndpoints || [],
        geographicScope: node.geographicScope || 'ARG / NACIONAL',
        entityTypes: node.entityTypes || ['NATURAL_PERSON', 'ORGANIZATION'],
        dataFormats: node.dataFormats || ['CSV', 'JSON'],
        accessMethod: node.accessMethod || 'REST_API',
        publicAccessStatus: node.publicAccessStatus || 'PUBLIC_OPEN',
        discoveredBy: node.discoveredBy || 'RADAR_DISCOVERY',
        discoveredAt: node.discoveredAt || new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        lastProbed: null,
        lastSuccessfulFetch: null,
        estimatedScale: node.estimatedScale || 10000,
        features: node.features || {},
        childSources: [],
        parentSources: [],
        relatedSources: []
      };
      this.nodes.set(sourceId, existing);
    } else {
      // Update existing node with newly observed endpoints or features
      existing.lastSeen = new Date().toISOString();
      if (node.features) {
        existing.features = { ...existing.features, ...node.features };
      }
    }
    return existing;
  }

  getNode(sourceId) {
    return this.nodes.get(this.canonicalizeSourceId(sourceId));
  }

  getResource(resourceId) {
    return this.resources.get(resourceId);
  }

  addResourceNode(resource) {
    const resourceId = resource.resourceId || this.canonicalizeResourceId(resource.sourceId, resource.url);
    let existing = this.resources.get(resourceId);

    if (!existing) {
      existing = {
        resourceId,
        sourceId: this.canonicalizeSourceId(resource.sourceId),
        resourceName: resource.resourceName || resourceId,
        url: resource.url,
        format: (resource.format || 'CSV').toUpperCase(),
        resourceClass: resource.resourceClass || 'DIRECTORY_CATALOG',
        status: resource.status || 'DISCOVERED', // UNKNOWN, DISCOVERED, PROBED, PRODUCTIVE, LOW_YIELD, ZERO_YIELD, EXHAUSTED, TEMPORARILY_UNAVAILABLE
        version: {
          contentHash: resource.contentHash || null,
          etag: resource.etag || null,
          lastModified: resource.lastModified || null,
          snapshotDate: resource.snapshotDate || new Date().toISOString()
        },
        observedYields: {}, // targetType -> stats
        discoveredBy: resource.discoveredBy || 'RADAR_DISCOVERY',
        discoveredAt: resource.discoveredAt || new Date().toISOString(),
        lastProbed: null,
        lastFetched: null
      };
      this.resources.set(resourceId, existing);
    } else {
      existing.url = resource.url || existing.url;
      if (resource.status) existing.status = resource.status;
      if (resource.contentHash) existing.version.contentHash = resource.contentHash;
    }
    return existing;
  }

  addEdge(fromSourceId, toSourceId, edgeType, metadata = {}) {
    const from = this.canonicalizeSourceId(fromSourceId);
    const to = this.canonicalizeSourceId(toSourceId);

    // Prevent duplicate edges
    const exists = this.edges.some(e => e.fromSourceId === from && e.toSourceId === to && e.edgeType === edgeType);
    if (!exists) {
      const edge = {
        fromSourceId: from,
        toSourceId: to,
        edgeType, // PARENT_CHILD, SIBLING, FEDERATION_MEMBER, DIRECTORY_OF, AFFILIATE_OF, PROVIDER_OF, CATALOG_OF, RELATED
        metadata,
        discoveredAt: new Date().toISOString()
      };
      this.edges.push(edge);

      // Update node references
      const fromNode = this.nodes.get(from);
      const toNode = this.nodes.get(to);
      if (fromNode && toNode) {
        if (edgeType === 'PARENT_CHILD') {
          fromNode.childSources = Array.from(new Set([...(fromNode.childSources || []), to]));
          toNode.parentSources = Array.from(new Set([...(toNode.parentSources || []), from]));
        } else {
          fromNode.relatedSources = Array.from(new Set([...(fromNode.relatedSources || []), to]));
          toNode.relatedSources = Array.from(new Set([...(toNode.relatedSources || []), from]));
        }
      }
      return edge;
    }
    return null;
  }

  getFrontiers(targetType = 'TARGET_EMAIL') {
    const productive = [];
    const unproductive = [];
    const unexplored = [];
    const exhausted = [];

    for (const res of this.resources.values()) {
      if (res.status === 'EXHAUSTED') {
        exhausted.push(res);
      } else if (res.status === 'PRODUCTIVE') {
        productive.push(res);
      } else if (res.status === 'ZERO_YIELD') {
        unproductive.push(res);
      } else {
        unexplored.push(res);
      }
    }

    return {
      KNOWN_PRODUCTIVE_FRONTIER: productive,
      KNOWN_UNPRODUCTIVE_FRONTIER: unproductive,
      UNEXPLORED_FRONTIER: unexplored,
      EXHAUSTED_FRONTIER: exhausted
    };
  }

  getCoverageMap() {
    const byJurisdiction = {};
    const byFamily = {};
    const byEntityType = {};

    for (const n of this.nodes.values()) {
      byJurisdiction[n.geographicScope] = (byJurisdiction[n.geographicScope] || 0) + 1;
      byFamily[n.sourceFamily] = (byFamily[n.sourceFamily] || 0) + 1;
      for (const t of (n.entityTypes || [])) {
        byEntityType[t] = (byEntityType[t] || 0) + 1;
      }
    }

    return {
      byJurisdiction,
      byFamily,
      byEntityType,
      totalSources: this.nodes.size,
      totalResources: this.resources.size
    };
  }
}
