CREATE TABLE IF NOT EXISTS public.atlas_admin_memberships (
  user_id UUID NOT NULL PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'admin',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT atlas_admin_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE public.atlas_admin_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read atlas_admin_memberships" ON public.atlas_admin_memberships 
FOR SELECT TO authenticated USING (true);
