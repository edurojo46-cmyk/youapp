/**
 * src/lib/atlas/discovery/general/AtlasPeopleDomainViewBridge.mjs
 * 
 * ATLAS PEOPLE DOMAIN VIEW BRIDGE (READ-ONLY CROSSWALK)
 * 
 * Invariants:
 * 1. Preserves existing AtlasPeopleSourceMotorRegistry completely intact.
 * 2. Crosswalk is strictly READ-ONLY: People view cannot mutate General Source Map.
 * 3. Maps each historical People source_id to:
 *    - source_entity_id
 *    - source_surface_id (or archetype_id / query_capability_id)
 *    - node_type
 * 4. Ensures NO_DOMAIN_VIEW_WITHOUT_SOURCE_REFERENCE.
 */

import { NODE_TYPES } from './AtlasGeneralSourceMap.mjs';

export class AtlasPeopleDomainViewBridge {
  constructor(generalMap, peopleRegistry) {
    this.generalMap = generalMap;
    this.peopleRegistry = peopleRegistry;
    this.crosswalk = new Map(); // people_source_id -> { node_type, general_id, entity_id }
  }

  registerMapping(peopleSourceId, targetNodeType, targetGeneralId, targetEntityId) {
    // Validate target exists in General Map
    if (targetNodeType === NODE_TYPES.SOURCE_SURFACE && !this.generalMap.surfaces.has(targetGeneralId)) {
      throw new Error(`CROSSWALK_ERROR: Surface '${targetGeneralId}' does not exist in General Source Map.`);
    }
    if (targetNodeType === NODE_TYPES.SOURCE_ARCHETYPE && !this.generalMap.archetypes.has(targetGeneralId)) {
      throw new Error(`CROSSWALK_ERROR: Archetype '${targetGeneralId}' does not exist in General Source Map.`);
    }
    if (targetNodeType === NODE_TYPES.QUERY_CAPABILITY && !this.generalMap.queryCapabilities.has(targetGeneralId)) {
      throw new Error(`CROSSWALK_ERROR: Query capability '${targetGeneralId}' does not exist in General Source Map.`);
    }
    if (!this.generalMap.entities.has(targetEntityId)) {
      throw new Error(`CROSSWALK_ERROR: Entity '${targetEntityId}' does not exist in General Source Map.`);
    }

    this.crosswalk.set(peopleSourceId, Object.freeze({
      people_source_id: peopleSourceId,
      node_type: targetNodeType,
      general_id: targetGeneralId,
      source_entity_id: targetEntityId,
      mapped_at: new Date().toISOString()
    }));
  }

  getGeneralReference(peopleSourceId) {
    return this.crosswalk.get(peopleSourceId) || null;
  }

  /**
   * Validates that all People registrations have an authoritative General Map mapping
   */
  validateCrosswalkIntegrity() {
    const peopleSources = this.peopleRegistry.getAll();
    const missing = [];
    const complete = [];

    for (const ps of peopleSources) {
      const mapping = this.crosswalk.get(ps.source_id);
      if (!mapping) {
        missing.push(ps.source_id);
      } else {
        complete.push({
          people_source_id: ps.source_id,
          general_node_type: mapping.node_type,
          general_id: mapping.general_id,
          source_entity_id: mapping.source_entity_id
        });
      }
    }

    return {
      total_people_sources: peopleSources.length,
      crosswalk_entries: this.crosswalk.size,
      missing_mappings: missing,
      is_complete: missing.length === 0,
      mappings: complete
    };
  }
}
