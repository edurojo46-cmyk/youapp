-- Phase 10E-B: Message Generation Engine updates

-- Update contact decisions check constraint
ALTER TABLE public.atlas_contact_decisions DROP CONSTRAINT IF EXISTS atlas_contact_decisions_decision_check;
ALTER TABLE public.atlas_contact_decisions ADD CONSTRAINT atlas_contact_decisions_decision_check CHECK (decision IN ('CONTACT_NOW', 'REVIEW_REQUIRED', 'DO_NOT_CONTACT', 'WAIT', 'OBSERVE', 'HUMAN_REVIEW', 'NO_ACTION'));

-- Add structural columns to atlas_message_policies
ALTER TABLE public.atlas_message_policies ADD COLUMN IF NOT EXISTS subject_allowed BOOLEAN DEFAULT false;
ALTER TABLE public.atlas_message_policies ADD COLUMN IF NOT EXISTS subject_max_length INT;
ALTER TABLE public.atlas_message_policies ADD COLUMN IF NOT EXISTS cta_allowed BOOLEAN DEFAULT false;
ALTER TABLE public.atlas_message_policies ADD COLUMN IF NOT EXISTS cta_required BOOLEAN DEFAULT false;
ALTER TABLE public.atlas_message_policies ADD COLUMN IF NOT EXISTS allowed_cta_types JSONB;
ALTER TABLE public.atlas_message_policies ADD COLUMN IF NOT EXISTS body_format TEXT DEFAULT 'PLAIN_TEXT';
ALTER TABLE public.atlas_message_policies ADD COLUMN IF NOT EXISTS public_constraints JSONB;
