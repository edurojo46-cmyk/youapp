/**
 * src/lib/atlas/discovery/general/AtlasNormalizedSourceItem.mjs
 * 
 * ATLAS NORMALIZED SOURCE ITEM (DATA PLANE ENVELOPE)
 * 
 * Architectural Contract:
 * - Emitted by Acquisition Motors upon retrieving technical records.
 * - Completely DOMAIN-AGNOSTIC: does not interpret person, video, company, or event.
 * - Enforces payload_reference over raw payload bloat for lightweight routing.
 * - Strict content hashing for deduplication across domain routers.
 */

import crypto from 'crypto';

export const NORMALIZED_ITEM_SCHEMA_VERSION = '1.0.0';

export class AtlasNormalizedSourceItem {
  constructor(data) {
    if (!data.source_entity_id || !data.source_surface_id || !data.item_id) {
      throw new Error('CONTRACT_VIOLATION: source_entity_id, source_surface_id, and item_id are mandatory.');
    }

    this.schema_version = NORMALIZED_ITEM_SCHEMA_VERSION;
    this.source_entity_id = data.source_entity_id;
    this.source_surface_id = data.source_surface_id;
    this.item_id = String(data.item_id);
    this.item_url = data.item_url || null;
    this.content_type = data.content_type || 'application/json'; // text/csv, application/json, text/html, application/xml
    this.published_at = data.published_at || null;
    this.retrieved_at = data.retrieved_at || new Date().toISOString();
    
    // Lineage & Provenance
    this.provenance = Object.freeze({
      endpoint_url: data.provenance?.endpoint_url || null,
      protocol: data.provenance?.protocol || null,
      acquisition_motor_id: data.provenance?.acquisition_motor_id || null,
      batch_id: data.provenance?.batch_id || null,
      http_status: data.provenance?.http_status || 200
    });

    // Lightweight Payload Reference or small inline record
    this.payload_reference = data.payload_reference || null; // e.g. s3:// or local hash URI
    this.raw_fields_sample = data.raw_fields_sample ? Object.freeze({ ...data.raw_fields_sample }) : null;

    // Content Integrity Hash
    if (data.content_hash) {
      this.content_hash = data.content_hash;
    } else {
      const hashInput = JSON.stringify({
        entity: this.source_entity_id,
        surface: this.source_surface_id,
        id: this.item_id,
        fields: this.raw_fields_sample
      });
      this.content_hash = crypto.createHash('sha256').update(hashInput).digest('hex');
    }

    Object.freeze(this);
  }
}
