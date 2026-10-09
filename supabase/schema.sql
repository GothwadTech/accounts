-- ==============================================================================
-- GOTHWAD UNIFIED AUTH & ECOSYSTEM DATABASE SCHEMA (SUPABASE POSTGRESQL)
-- ==============================================================================

-- 1. Profiles Table for Gothwad Accounts
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  gothwad_email TEXT UNIQUE NOT NULL, -- e.g. username@gothwadtech.com
  recovery_email TEXT,
  phone_number TEXT,
  avatar_url TEXT,
  two_factor_enabled BOOLEAN DEFAULT FALSE,
  storage_used_bytes BIGINT DEFAULT 128450560, -- 122 MB initial
  storage_limit_bytes BIGINT DEFAULT 16106127360, -- 15 GB default
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Registered Ecosystem Apps (Gothwad Mail, Tube, Drive, Notes, Manager, Browser)
CREATE TABLE IF NOT EXISTS public.ecosystem_apps (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  redirect_uris TEXT[] NOT NULL,
  is_verified BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed Ecosystem Apps
INSERT INTO public.ecosystem_apps (id, name, description, icon, redirect_uris)
VALUES 
  ('gothwad-mail', 'Gothwad Mail', 'Fast, encrypted mail with @gothwadtech.com address', 'mail', ARRAY['https://mail.gothwadtech.com/auth/callback', 'http://localhost:3000/auth/mail/callback']),
  ('gothwad-drive', 'Gothwad Drive', 'Cloud storage, docs, spreadsheets and file sharing', 'hard-drive', ARRAY['https://drive.gothwadtech.com/auth/callback', 'http://localhost:3000/auth/drive/callback']),
  ('gothwad-tube', 'Gothwad Tube', 'Video sharing and creator broadcast network', 'play-square', ARRAY['https://tube.gothwadtech.com/auth/callback', 'http://localhost:3000/auth/tube/callback']),
  ('gothwad-notes', 'Gothwad Notes', 'Fast synced markdown notes and voice memos', 'file-text', ARRAY['https://notes.gothwadtech.com/auth/callback', 'http://localhost:3000/auth/notes/callback']),
  ('gothwad-manager', 'Gothwad Manager', 'Business management, tasks and workflow CRM', 'briefcase', ARRAY['https://manager.gothwadtech.com/auth/callback', 'http://localhost:3000/auth/manager/callback']),
  ('gothwad-browser', 'Gothwad Browser', 'Private browser with cloud sync for bookmarks and tabs', 'compass', ARRAY['https://browser.gothwadtech.com/auth/callback', 'http://localhost:3000/auth/browser/callback'])
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

-- 3. User Active Sessions (Active devices with remote sign-out)
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  device_name TEXT NOT NULL,
  browser TEXT NOT NULL,
  os TEXT,
  ip_address TEXT,
  location TEXT,
  last_active TIMESTAMPTZ DEFAULT NOW(),
  is_current BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Authorized Ecosystem App Tokens (OAuth Grants)
CREATE TABLE IF NOT EXISTS public.app_authorizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  app_id TEXT REFERENCES public.ecosystem_apps(id) ON DELETE CASCADE,
  scopes TEXT[] DEFAULT ARRAY['profile', 'email'],
  granted_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, app_id)
);

-- 5. Enable Row-Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ecosystem_apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_authorizations ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own profile" 
ON public.profiles FOR SELECT 
USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" 
ON public.profiles FOR UPDATE 
USING (auth.uid() = id);

CREATE POLICY "Public read for apps" 
ON public.ecosystem_apps FOR SELECT 
USING (true);

CREATE POLICY "Users can manage own sessions" 
ON public.user_sessions FOR ALL 
USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own app authorizations" 
ON public.app_authorizations FOR ALL 
USING (auth.uid() = user_id);

-- 6. Trigger to automatically create a profile when user registers via Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_gothwad_user()
RETURNS trigger AS $$
DECLARE
  v_username text;
  v_first_name text;
  v_last_name text;
BEGIN
  v_username := COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1));
  v_first_name := COALESCE(new.raw_user_meta_data->>'first_name', 'Gothwad');
  v_last_name := COALESCE(new.raw_user_meta_data->>'last_name', 'User');

  INSERT INTO public.profiles (
    id,
    first_name,
    last_name,
    username,
    gothwad_email,
    recovery_email
  )
  VALUES (
    new.id,
    v_first_name,
    v_last_name,
    v_username,
    lower(v_username) || '@gothwadtech.com',
    new.raw_user_meta_data->>'recovery_email'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_gothwad_user();
