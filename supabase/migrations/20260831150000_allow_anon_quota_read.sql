-- Permitir que usuarios anónimos y autenticados (clientes) puedan LEER el uso de la cuota diaria.
-- Es necesario para que QuotaBrain y la UI puedan mostrar "budget left" y "organic X / Y".
-- (La escritura sigue estando protegida solo para service_role y el RPC).

CREATE POLICY "Allow anon reads youtube quota" 
  ON public.youtube_quota_daily
  FOR SELECT 
  TO anon 
  USING (true);

CREATE POLICY "Allow authenticated reads youtube quota" 
  ON public.youtube_quota_daily
  FOR SELECT 
  TO authenticated 
  USING (true);
