/**
 * src/lib/atlas/discovery/snapshots/AtlasSourceSnapshotRegistry.mjs
 * 
 * ATLAS GATE #32: Source Snapshot Registry
 * 
 * Immutably registers and tracks processed bulk source snapshots:
 * - source_surface_id
 * - snapshot_timestamp
 * - source_content_sha256
 * - etag
 * - last_modified
 * - content_length
 * - schema_version
 * - record_count
 * - first_seen_at
 * - last_processed_at
 * 
 * Prevents redundant processing of identical government data dumps.
 */

import fs from 'node:fs';
import path from 'node:path';

export class AtlasSourceSnapshotRegistry {
  constructor(options = {}) {
    this.registryFilePath = options.registryFilePath || path.resolve('reports/atlas/discovery/atlas_source_snapshot_registry_v1.json');
    this.snapshots = new Map();
    this.load();
  }

  load() {
    if (fs.existsSync(this.registryFilePath)) {
      try {
        const raw = fs.readFileSync(this.registryFilePath, 'utf8');
        const data = JSON.parse(raw);
        if (Array.isArray(data.snapshots)) {
          for (const s of data.snapshots) {
            const key = `${s.source_surface_id}:${s.source_content_sha256}`;
            this.snapshots.set(key, s);
          }
        }
      } catch (e) {
        console.error('Failed to load snapshot registry:', e.message);
      }
    }
  }

  save() {
    const dir = path.dirname(this.registryFilePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const data = {
      registry_id: 'ATLAS_SOURCE_SNAPSHOT_REGISTRY_V1',
      last_updated_at: new Date().toISOString(),
      total_registered_snapshots: this.snapshots.size,
      snapshots: Array.from(this.snapshots.values())
    };
    fs.writeFileSync(this.registryFilePath, JSON.stringify(data, null, 2), 'utf8');
  }

  isSnapshotProcessed(sourceSurfaceId, contentSha256) {
    const key = `${sourceSurfaceId}:${contentSha256}`;
    const entry = this.snapshots.get(key);
    return entry ? entry.status === 'PROCESSED' : false;
  }

  getLatestSnapshot(sourceSurfaceId) {
    const matching = Array.from(this.snapshots.values()).filter(s => s.source_surface_id === sourceSurfaceId);
    if (matching.length === 0) return null;
    matching.sort((a, b) => new Date(b.snapshot_timestamp).getTime() - new Date(a.snapshot_timestamp).getTime());
    return matching[0];
  }

  registerSnapshot(metadata) {
    const key = `${metadata.source_surface_id}:${metadata.source_content_sha256}`;
    const now = new Date().toISOString();

    const record = {
      source_surface_id: metadata.source_surface_id,
      snapshot_timestamp: metadata.snapshot_timestamp || now,
      source_content_sha256: metadata.source_content_sha256,
      etag: metadata.etag || null,
      last_modified: metadata.last_modified || null,
      content_length: metadata.content_length || 0,
      schema_version: metadata.schema_version || '1.0',
      record_count: metadata.record_count || 0,
      first_seen_at: now,
      last_processed_at: now,
      status: metadata.status || 'PROCESSED'
    };

    this.snapshots.set(key, record);
    this.save();
    return record;
  }
}
