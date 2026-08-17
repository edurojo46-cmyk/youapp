-- 1. Nuevos campos para la tabla channels (personalización para creadores)
ALTER TABLE public.channels 
ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS banner_cta TEXT,
ADD COLUMN IF NOT EXISTS custom_links JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS is_24_7 BOOLEAN DEFAULT true;

-- 2. Tabla de Mensajes de Chat en Vivo
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  channel_id UUID REFERENCES public.channels(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Habilitar RLS en chat_messages
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Políticas para chat_messages
CREATE POLICY "Chat messages are viewable by everyone." 
  ON public.chat_messages FOR SELECT USING (true);

CREATE POLICY "Anyone can insert chat messages." 
  ON public.chat_messages FOR INSERT WITH CHECK (true);

-- Habilitar Realtime para chat_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
