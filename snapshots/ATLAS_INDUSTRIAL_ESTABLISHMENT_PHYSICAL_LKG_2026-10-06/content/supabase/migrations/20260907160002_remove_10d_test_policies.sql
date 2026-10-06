-- Drop temporary permissive policies used for debugging tests

DROP POLICY IF EXISTS test_insert ON public.atlas_products;
DROP POLICY IF EXISTS test_insert ON public.atlas_product_offers;
DROP POLICY IF EXISTS test_insert ON public.atlas_people;
DROP POLICY IF EXISTS test_insert ON public.atlas_contacts;
DROP POLICY IF EXISTS test_insert ON public.atlas_audience_searches;
DROP POLICY IF EXISTS test_insert ON public.atlas_audience_matches;
