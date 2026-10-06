ALTER TABLE public.atlas_argentina_people_search_projection_v1
ADD COLUMN IF NOT EXISTS public_email TEXT,
ADD COLUMN IF NOT EXISTS public_phone TEXT,
ADD COLUMN IF NOT EXISTS personal_web TEXT;

DROP VIEW IF EXISTS public.atlas_argentina_people_search_v1;
CREATE VIEW public.atlas_argentina_people_search_v1 AS
SELECT * FROM public.atlas_argentina_people_search_projection_v1;