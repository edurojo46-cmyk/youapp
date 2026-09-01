-- Migration: 20260901060000_fix_telemetry_provider_events_rls.sql
-- Description: Fix RLS policies for telemetry_provider_events so anon/authenticated clients can log telemetry without 403

ALTER TABLE IF EXISTS public.telemetry_provider_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon insert telemetry_provider_events" ON public.telemetry_provider_events;
DROP POLICY IF EXISTS "Allow authenticated insert telemetry_provider_events" ON public.telemetry_provider_events;
DROP POLICY IF EXISTS "Allow public insert telemetry_provider_events" ON public.telemetry_provider_events;
DROP POLICY IF EXISTS "Allow public read telemetry_provider_events" ON public.telemetry_provider_events;

CREATE POLICY "Allow public insert telemetry_provider_events"
ON public.telemetry_provider_events
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "Allow public read telemetry_provider_events"
ON public.telemetry_provider_events
FOR SELECT
TO anon, authenticated
USING (true);
