-- 1. Nuevos campos en channels para Sponsors y Control de Acceso
ALTER TABLE public.channels 
ADD COLUMN IF NOT EXISTS require_email_gate BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS sponsor_bumper_url TEXT,
ADD COLUMN IF NOT EXISTS sponsor_bumper_interval INTEGER DEFAULT 3;

-- 2. Tabla de Suscriptores / Leads de Emails del Canal
CREATE TABLE IF NOT EXISTS public.channel_subscribers (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  channel_id UUID REFERENCES public.channels(id) ON DELETE CASCADE NOT NULL,
  email TEXT NOT NULL,
  name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(channel_id, email)
);

ALTER TABLE public.channel_subscribers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can subscribe to a channel." 
  ON public.channel_subscribers FOR INSERT WITH CHECK (true);

CREATE POLICY "Channel owners can view their subscribers." 
  ON public.channel_subscribers FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.channels 
      WHERE channels.id = channel_subscribers.channel_id 
      AND channels.user_id = auth.uid()
    )
  );

-- 3. Tabla de Colaboradores de Canal
CREATE TABLE IF NOT EXISTS public.channel_collaborators (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  channel_id UUID REFERENCES public.channels(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT DEFAULT 'editor' NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  UNIQUE(channel_id, user_id)
);

ALTER TABLE public.channel_collaborators ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Channel owners and collaborators can view collaborators." 
  ON public.channel_collaborators FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.channels 
      WHERE channels.id = channel_collaborators.channel_id 
      AND (channels.user_id = auth.uid() OR channel_collaborators.user_id = auth.uid())
    )
  );
