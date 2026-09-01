-- ============================================================
-- FASE 5.1: Soporte para perfiles anónimos (Guest Auth)
-- ============================================================

-- Modificamos la función handle_new_user para que tolere usuarios anónimos
-- que no tienen email, evitando que el trigger falle y devuelva error 500.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  v_username text;
BEGIN
  -- Si el usuario es anónimo o no tiene email, generamos un username genérico basado en su ID
  IF new.email IS NULL OR new.email = '' THEN
    v_username := 'guest_' || substr(new.id::text, 1, 8);
  ELSE
    v_username := split_part(new.email, '@', 1);
  END IF;

  INSERT INTO public.profiles (id, username)
  VALUES (new.id, v_username)
  ON CONFLICT (id) DO NOTHING;
  
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
