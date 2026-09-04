-- 20260903110000_create_asset_semantic_annotations.sql

CREATE TABLE IF NOT EXISTS asset_semantic_annotations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES youapp_index(id) ON DELETE CASCADE,
    
    semantic_entity_id TEXT,
    semantic_work_id TEXT,
    semantic_venue_id TEXT,
    
    content_type TEXT,
    performance_mode TEXT,
    content_role TEXT DEFAULT 'PRIMARY',
    
    entity_confidence NUMERIC(3,2),
    work_confidence NUMERIC(3,2),
    venue_confidence NUMERIC(3,2),
    overall_confidence NUMERIC(3,2),
    
    evidence JSONB,
    
    status TEXT DEFAULT 'VERIFIED',
    semantic_version TEXT DEFAULT 'v1.4',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for semantic retrieval lane
CREATE INDEX IF NOT EXISTS idx_asset_semantic_annotations_entity_work 
    ON asset_semantic_annotations(semantic_entity_id, semantic_work_id);

CREATE INDEX IF NOT EXISTS idx_asset_semantic_annotations_entity_venue 
    ON asset_semantic_annotations(semantic_entity_id, semantic_venue_id);

CREATE INDEX IF NOT EXISTS idx_asset_semantic_annotations_entity_content_type
    ON asset_semantic_annotations(semantic_entity_id, content_type);

-- Ensure we only have one active annotation per asset
CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_semantic_annotations_asset_id_active
    ON asset_semantic_annotations(asset_id)
    WHERE status = 'VERIFIED';

-- RLS
ALTER TABLE asset_semantic_annotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon read access on semantic annotations" 
ON asset_semantic_annotations FOR SELECT TO anon USING (true);

CREATE POLICY "Allow authenticated read access on semantic annotations" 
ON asset_semantic_annotations FOR SELECT TO authenticated USING (true);
