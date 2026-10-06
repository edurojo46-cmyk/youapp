ALTER TABLE atlas_message_policies 
ADD COLUMN IF NOT EXISTS deterministic_fallback_allowed BOOLEAN DEFAULT true;
