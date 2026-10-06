-- Migration to drop the obsolete overloaded function signature
-- This resolves PostgREST PGRST203 function overload ambiguity.

DROP FUNCTION IF EXISTS public.certify_message_current_state(UUID);
