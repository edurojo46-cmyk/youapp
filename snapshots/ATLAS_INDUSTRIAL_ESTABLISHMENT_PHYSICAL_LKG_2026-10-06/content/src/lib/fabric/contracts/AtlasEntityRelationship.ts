/**
 * ATLAS GENERIC RELATIONSHIP GRAPH CONTRACT V1
 * 
 * Formal contract representing typed, evidenced relationships between entities
 * across any domains in the Atlas Industrial Search Fabric.
 * 
 * Supported Graph Edges:
 * - PERSON -> ORGANIZATION (WORKS_IN, SERVES_IN)
 * - TENDER -> ORGANIZATION (ISSUED_BY)
 * - TENDER -> COMPANY (AWARDED_TO)
 * - COMPANY -> PERSON (GOVERNED_BY, LEGAL_REPRESENTATIVE)
 * - COMPANY -> COMPANY (SUBSIDIARY_OF, CONSORTIUM_WITH)
 */

export type UniversalRelationshipType = 
  | 'WORKS_IN'
  | 'SERVES_IN'
  | 'RESIDES_IN'
  | 'ASSOCIATED_WITH'
  | 'ISSUED_BY'
  | 'AWARDED_TO'
  | 'BIDDER_IN'
  | 'SUBSIDIARY_OF'
  | 'GOVERNED_BY'
  | 'AUTHORED_BY';

export interface AtlasEntityRelationship {
  relationship_id: string;
  from_domain: string;
  from_entity_id: string;
  from_entity_type: string;
  relationship_type: UniversalRelationshipType;
  to_domain: string;
  to_entity_id: string;
  to_entity_type: string;
  source_id: string;
  source_url?: string;
  confidence: number;
  observed_at: string;
  valid_until: string | null;
  metadata?: Record<string, any>;
}

export const ATLAS_ENTITY_RELATIONSHIP_VERSION = '1.0.0';
