-- Habilitar extensión para UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Tabla de Perfiles de Usuario (se sincroniza con la tabla auth.users de Supabase)
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Habilitar RLS para profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public profiles are viewable by everyone." ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert their own profile." ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update their own profile." ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- 2. Tabla de Canales
CREATE TABLE public.channels (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  is_public BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public channels are viewable by everyone." ON public.channels FOR SELECT USING (is_public = true OR auth.uid() = user_id);
CREATE POLICY "Users can insert their own channels." ON public.channels FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own channels." ON public.channels FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own channels." ON public.channels FOR DELETE USING (auth.uid() = user_id);

-- 3. Tabla de Videos (Cache de metadatos de YouTube)
CREATE TABLE public.videos (
  id TEXT PRIMARY KEY, -- El ID del video de YouTube (ej. 'sO3NlF8yNqE')
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  duration TEXT,
  thumbnail TEXT,
  provider TEXT DEFAULT 'youtube' NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Videos are viewable by everyone." ON public.videos FOR SELECT USING (true);
-- Cualquier usuario autenticado puede agregar un video a la base de datos si no existe
CREATE POLICY "Authenticated users can insert videos." ON public.videos FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- 4. Tabla de Programación (La grilla: qué video suena a qué hora en qué canal)
CREATE TABLE public.programming (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  channel_id UUID REFERENCES public.channels(id) ON DELETE CASCADE NOT NULL,
  video_id TEXT REFERENCES public.videos(id) ON DELETE CASCADE NOT NULL,
  start_time TIMESTAMP WITH TIME ZONE NOT NULL,
  end_time TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

ALTER TABLE public.programming ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Programming is viewable by everyone." ON public.programming FOR SELECT USING (true);
CREATE POLICY "Users can manage programming of their own channels." ON public.programming FOR INSERT WITH CHECK (
  auth.uid() = (SELECT user_id FROM public.channels WHERE id = channel_id)
);
CREATE POLICY "Users can update programming of their own channels." ON public.programming FOR UPDATE USING (
  auth.uid() = (SELECT user_id FROM public.channels WHERE id = channel_id)
);
CREATE POLICY "Users can delete programming of their own channels." ON public.programming FOR DELETE USING (
  auth.uid() = (SELECT user_id FROM public.channels WHERE id = channel_id)
);

-- 5. Trigger para crear perfil automáticamente al registrarse un nuevo usuario en Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (new.id, split_part(new.email, '@', 1));
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
