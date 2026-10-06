ALTER TABLE public.atlas_argentina_people_search_projection_v1
ADD COLUMN IF NOT EXISTS profession_status TEXT DEFAULT 'UNPROCESSED';

-- Re-create the view to include the new column
DROP VIEW IF EXISTS public.atlas_argentina_people_search_v1;
CREATE VIEW public.atlas_argentina_people_search_v1 AS
SELECT * FROM public.atlas_argentina_people_search_projection_v1;