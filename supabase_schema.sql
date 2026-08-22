-- Esquema de Base de Datos para YouApp TV (Supabase)

-- 1. Habilitar la extensión para IDs únicos (UUID)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Tabla de Usuarios (Profiles) vinculada a Supabase Auth
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  username TEXT UNIQUE,
  avatar_url TEXT
);

-- Habilitar Row Level Security (RLS) para proteger los datos
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Usuarios pueden ver su propio perfil" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Usuarios pueden actualizar su propio perfil" ON profiles FOR UPDATE USING (auth.uid() = id);

-- 3. Tabla de Canales Personalizados (Studio)
CREATE TABLE user_channels (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  channel_data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

ALTER TABLE user_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo el dueño puede ver sus canales" ON user_channels FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Solo el dueño puede crear canales" ON user_channels FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Solo el dueño puede borrar sus canales" ON user_channels FOR DELETE USING (auth.uid() = user_id);

-- 4. Tabla de Momentos Guardados
CREATE TABLE user_moments (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  moment_data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

ALTER TABLE user_moments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Solo el dueño puede ver sus momentos" ON user_moments FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Solo el dueño puede guardar momentos" ON user_moments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Solo el dueño puede borrar momentos" ON user_moments FOR DELETE USING (auth.uid() = user_id);

-- 5. Tabla de Historial de Búsqueda y Favoritos
CREATE TABLE user_preferences (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  search_history JSONB DEFAULT '[]'::jsonb,
  favorites JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Dueño lee preferencias" ON user_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Dueño actualiza preferencias" ON user_preferences FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Dueño inserta preferencias" ON user_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 6. Trigger automático para crear perfil cuando alguien se registra (o entra anónimo)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (new.id);
  
  INSERT INTO public.user_preferences (user_id)
  VALUES (new.id);
  
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
