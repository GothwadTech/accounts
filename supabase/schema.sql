-- =============================================================================
-- GOTHWAD ACCOUNTS — SUPABASE DATABASE SCHEMA
-- =============================================================================
-- Kaise use karein:
--   1. Supabase Dashboard kholo → left menu "SQL Editor"
--   2. Is poore file ka content copy-paste karo
--   3. "Run" dabao. Bas! Tables + Security + Auto-profile ready.
--
-- IMPORTANT RULES (Gothwad Architecture):
--   * Domain-agnostic: kahin bhi "gothwadtech.com" hardcoded NAHI hai.
--     Email = username + "@" + APP_DOMAIN, lekin database mein sirf
--     "username" store hota hai. Email API/Worker layer par calculate hota hai.
--   * Security: har table par Row Level Security (RLS) ON hai.
--     Ek user sirf apna data dekh/sakta hai, doosre ka kabhi nahi.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. PROFILES — Har Gothwad user ki main profile
-- -----------------------------------------------------------------------------
-- Yeh table automatically banta hai jab koi Supabase Auth mein register karta hai
-- (niche trigger #5 dekho). Isme password KABHI nahi hota — wo Supabase Auth
-- ke secure vault mein rehta hai.

CREATE TABLE IF NOT EXISTS public.profiles (
  id                 UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  username           TEXT NOT NULL UNIQUE,          -- sirf username, email nahi!
  first_name         TEXT NOT NULL DEFAULT '',
  last_name          TEXT NOT NULL DEFAULT '',
  recovery_email     TEXT,                          -- password reset is email par jaata hai
  phone_number       TEXT,
  avatar_url         TEXT,
  two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  storage_used_bytes BIGINT NOT NULL DEFAULT 0,     -- kitna storage use kiya (bytes)
  storage_limit_bytes BIGINT NOT NULL DEFAULT 16106127360, -- 15 GB default quota
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Username rules: sirf chhote letters, numbers, dot, dash, underscore (3-24 chars)
  CONSTRAINT username_format CHECK (
    username ~ '^[a-z0-9](?:[a-z0-9._-]{1,22}[a-z0-9])?$'
  )
);

-- Helpful comment (Supabase Table Editor mein dikhta hai)
COMMENT ON TABLE public.profiles IS 'Gothwad user profiles. Email is NOT stored: it is always username@APP_DOMAIN.';


-- -----------------------------------------------------------------------------
-- 2. USER_SESSIONS — Kaunse devices par user logged-in hai
-- -----------------------------------------------------------------------------
-- Dashboard ke "Security" tab mein devices dikhte hain, aur user
-- kisi bhi device se remotely "Sign out" kar sakta hai.

CREATE TABLE IF NOT EXISTS public.user_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  device_name TEXT NOT NULL DEFAULT 'Unknown device',
  browser     TEXT NOT NULL DEFAULT 'Unknown',
  os          TEXT,
  ip_address  TEXT,
  remember_me BOOLEAN NOT NULL DEFAULT FALSE,
  last_active TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_current  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON public.user_sessions (user_id);


-- -----------------------------------------------------------------------------
-- 3. ECOSYSTEM_APPS — Gothwad ke registered apps (Mail, Drive, Chat...)
-- -----------------------------------------------------------------------------
-- Step 2 (OAuth 2.0 provider) mein in apps ke liye "Sign in with Gothwad"
-- banega. redirect_uris baad mein update karne hain (apne domain ke hisaab se).

CREATE TABLE IF NOT EXISTS public.ecosystem_apps (
  id            TEXT PRIMARY KEY,                  -- jaise 'gothwad-mail'
  name          TEXT NOT NULL,
  description   TEXT,
  icon          TEXT,
  redirect_uris TEXT[] NOT NULL DEFAULT '{}',      -- OAuth callback URLs
  is_verified   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed data: Gothwad ecosystem ke apps.
-- NOTE: redirect_uris abhi khaali hain (domain-agnostic rule).
-- Jab OAuth live karoge, tab example:
--   UPDATE public.ecosystem_apps
--     SET redirect_uris = ARRAY['https://mail.' || 'YOUR-DOMAIN' || '/auth/callback']
--     WHERE id = 'gothwad-mail';
INSERT INTO public.ecosystem_apps (id, name, description, icon) VALUES
  ('gothwad-mail',    'Gothwad Mail',    'Custom email address with webmail inbox',            'mail'),
  ('gothwad-drive',   'Gothwad Drive',   'Unlimited cloud storage powered by Telegram',        'hard-drive'),
  ('gothwad-chat',    'Gothwad Chat',    'Fast messaging for teams and friends',               'message-circle'),
  ('gothwad-notes',   'Gothwad Notes',   'Synced notes, lists and voice memos',                'file-text'),
  ('gothwad-calendar','Gothwad Calendar','Events, reminders and shared calendars',             'calendar'),
  ('gothwad-browser', 'Gothwad Browser', 'Private browser with cloud-synced tabs & bookmarks', 'compass')
ON CONFLICT (id) DO NOTHING;


-- -----------------------------------------------------------------------------
-- 4. APP_AUTHORIZATIONS — Kis user ne kis app ko access diya hai
-- -----------------------------------------------------------------------------
-- Jab user "Sign in with Gothwad" karta hai, uska grant yahan save hota hai.
-- User dashboard se access REVOKE bhi kar sakta hai.

CREATE TABLE IF NOT EXISTS public.app_authorizations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  app_id       TEXT NOT NULL REFERENCES public.ecosystem_apps (id) ON DELETE CASCADE,
  scopes       TEXT[] NOT NULL DEFAULT ARRAY['profile', 'email'],
  granted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, app_id)
);


-- -----------------------------------------------------------------------------
-- 5. AUTO-PROFILE TRIGGER — Naya user bante hi profile bana do
-- -----------------------------------------------------------------------------
-- Jab bhi Supabase Auth mein naya user register hoga, yeh trigger
-- automatically public.profiles mein ek row insert kar deta hai.
-- (Worker signup API user_metadata mein username etc. bhejta hai.)

CREATE OR REPLACE FUNCTION public.handle_new_gothwad_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER   -- RLS ke bina chalta hai, isliye profile insert ho paati hai
SET search_path = public
AS $$
DECLARE
  v_username TEXT;
BEGIN
  -- Username user_metadata se aana chahiye (Worker wahan bhejta hai).
  -- Fallback: email ka part before @ (Supabase ke default emails ke liye).
  v_username := LOWER(TRIM(COALESCE(
    NEW.raw_user_meta_data ->> 'username',
    SPLIT_PART(NEW.email, '@', 1)
  )));

  INSERT INTO public.profiles (
    id, username, first_name, last_name, recovery_email, phone_number
  ) VALUES (
    NEW.id,
    v_username,
    COALESCE(NEW.raw_user_meta_data ->> 'first_name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''),
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data ->> 'recovery_email', '')), ''),
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data ->> 'phone_number', '')), '')
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_gothwad_user();


-- -----------------------------------------------------------------------------
-- 6. UPDATED_AT TRIGGER — profile change hote hi updated_at refresh
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_touch_updated_at ON public.profiles;
CREATE TRIGGER profiles_touch_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- -----------------------------------------------------------------------------
-- 7. ROW LEVEL SECURITY — Sab kuch lock, sirf maalik ka access
-- -----------------------------------------------------------------------------
-- Rule: RLS ON = koi bhi direct query kare to use sirf apni row mile.

ALTER TABLE public.profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ecosystem_apps     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_authorizations ENABLE ROW LEVEL SECURITY;

-- PROFILES: user sirf APNA profile dekh/update kar sake.
-- INSERT/DELETE policies isliye nahi hain kyunki profile sirf trigger
-- (ya Worker service_role se) banata/bigadta hai — yeh extra security hai.
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- USER_SESSIONS: user sirf apne sessions dekh/modify/delete kar sake.
DROP POLICY IF EXISTS "sessions_select_own" ON public.user_sessions;
CREATE POLICY "sessions_select_own"
  ON public.user_sessions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "sessions_insert_own" ON public.user_sessions;
CREATE POLICY "sessions_insert_own"
  ON public.user_sessions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "sessions_update_own" ON public.user_sessions;
CREATE POLICY "sessions_update_own"
  ON public.user_sessions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "sessions_delete_own" ON public.user_sessions;
CREATE POLICY "sessions_delete_own"
  ON public.user_sessions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ECOSYSTEM_APPS: app list sabko padhne do (public info hai),
-- lekin change sirf service_role (Worker) kar sakta hai — RLS ke wajah se.
DROP POLICY IF EXISTS "apps_select_public" ON public.ecosystem_apps;
CREATE POLICY "apps_select_public"
  ON public.ecosystem_apps FOR SELECT
  TO anon, authenticated
  USING (true);

-- APP_AUTHORIZATIONS: user sirf apne grants dekh/chalaye.
DROP POLICY IF EXISTS "grants_select_own" ON public.app_authorizations;
CREATE POLICY "grants_select_own"
  ON public.app_authorizations FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "grants_insert_own" ON public.app_authorizations;
CREATE POLICY "grants_insert_own"
  ON public.app_authorizations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "grants_update_own" ON public.app_authorizations;
CREATE POLICY "grants_update_own"
  ON public.app_authorizations FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "grants_delete_own" ON public.app_authorizations;
CREATE POLICY "grants_delete_own"
  ON public.app_authorizations FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);


-- -----------------------------------------------------------------------------
-- 8. HELPER: username availability check
-- -----------------------------------------------------------------------------
-- Yeh function ANON (bina login) bhi call kar sakta hai, lekin sirf
-- "available hai ya nahi" batata hai — koi private data leak nahi hota.
-- Signup page live availability check ke liye isse use karta hai.

CREATE OR REPLACE FUNCTION public.is_username_available(p_username TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE username = LOWER(TRIM(p_username))
  );
$$;

-- Anon users ko sirf yeh function chalane ki permission (table access nahi)
GRANT EXECUTE ON FUNCTION public.is_username_available(TEXT) TO anon, authenticated;

-- =============================================================================
-- HO GAYA! 🎉
-- Next: docs/SETUP.md follow karo — Worker + Frontend connect karne ke liye.
-- =============================================================================
