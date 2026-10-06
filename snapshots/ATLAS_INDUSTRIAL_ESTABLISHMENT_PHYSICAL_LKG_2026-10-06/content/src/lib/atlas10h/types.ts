export type AtlasBusinessDomain = 'OUTREACH' | 'GROWTH' | 'COMMERCE';
export type AtlasEventClass = 'OBSERVED' | 'DERIVED';
export type AtlasEventType = 
    | 'PROVIDER_ACCEPTED' | 'DELIVERED' | 'BOUNCED' | 'COMPLAINT' | 'REJECTED' | 'DELIVERY_DELAY' | 'UNKNOWN_PROVIDER_OUTCOME'
    | 'OPEN' | 'CLICK' | 'REPLY' | 'UNSUBSCRIBE' | 'POSITIVE_REPLY' | 'NEGATIVE_REPLY'
    | 'LEAD' | 'QUALIFIED_LEAD' | 'MEETING_BOOKED' | 'PROPOSAL' | 'CUSTOMER' | 'PURCHASE' | 'CANCELLED_PURCHASE' | 'REFUND';

export type AtlasObjectType = 'PRODUCT' | 'OFFER' | 'LISTING' | 'CONTENT' | 'PAGE' | 'CAMPAIGN';

/**
 * Inputs for ingest_outcome_event.
 * NOTE: No event_fingerprint field. The DB computes the authoritative fingerprint.
 */
export interface IngestOutcomeEventParams {
    tenant_id: string;
    source_system: string;
    event_type: AtlasEventType;
    occurred_at: string;
    business_domain: AtlasBusinessDomain;
    event_class: AtlasEventClass;
    
    // Semantic fields used by DB for fingerprint construction (scope-dependent)
    source_event_id?: string;           // used when scope = GLOBAL_EVENT_ID
    provider_message_id?: string;       // used when scope = MESSAGE_PLUS_EVENT_TYPE
    object_canonical_ref?: string;      // used when scope = OBJECT_PLUS_EVENT_TYPE
    canonical_fields?: Record<string, any>; // used when scope = CANONICAL_FIELDS
    
    // Payload integrity
    payload_hash?: string;
    sanitized_metadata?: Record<string, any>;
    
    // Optional actor
    subject_type?: 'PERSON' | 'COMPANY';
    subject_id?: string;
    
    // Optional commercial object
    object_type?: AtlasObjectType;
    object_id?: string;
    
    // Optional Atlas context links (for attribution)
    logical_execution_identity?: string;
    attempt_id?: string;
    routing_id?: string;
    nba_id?: string;
    
    // Derived provenance (required if event_class = DERIVED)
    derivation_method?: string;
    derivation_version?: string;
    
    // Immutable relationships
    supersedes_event_id?: string;
    reverses_event_id?: string;
    related_event_id?: string;
}

export interface IngestOutcomeResult {
    success: boolean;
    status?: 'INSERTED' | 'ALREADY_RECORDED';
    event_id?: string;
    reason?: string;
}
