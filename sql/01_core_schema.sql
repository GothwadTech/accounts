-- ═══════════════════════════════════════════════════════════════════════════
-- GOTHWAD ACCOUNTS — FILE 01: CORE SCHEMA
-- ═══════════════════════════════════════════════════════════════════════════
-- File: sql/01_core_schema.sql
--
-- KYA HAI IS FILE MEIN?
--   Gothwad Accounts ki core database — tables, security (RLS), triggers,
--   helper functions aur seed data. (Yehi pehle run hogi.)
--
-- SAFE HAI:
--   * FIRST TIME  → sab tables fresh ban jayengi.
--   * RE-RUN       → koi error nahi, kuch bhi duplicate nahi banega.
--                    Jo naya ho (naye columns waghera) wo update ho jayega.
--                    Isliye yeh file KITNI BHI BAAR run kar sakte ho.
--
-- ⚠️  SIRF GOTHWAD ACCOUNTS KE SUPABASE PROJECT KE LIYE!
--   GrixChat, Indogram, Gothwad Mail — in sabke apne ALAG Supabase projects
--   hain. Yeh SQL unke database mein kabhi mat chalao. Yeh sirf Accounts wale
--   project ka schema hai. (details: sql/README.md)
-- ═══════════════════════════════════════════════════════════════════════════


-- -----------------------------------------------------------------------------
-- 1. PROFILES — Har Gothwad user ki main profile
-- -----------------------------------------------------------------------------
-- Yeh table automatically banti hai jab koi Supabase Auth mein register karta
-- hai (niche trigger #6 dekho). Isme password KABHI nahi hota — wo Supabase
-- Auth ke secure vault mein rehta hai.
--
-- IMPORTANT (Rule #2): yahan sirf USERNAME store hota hai, email NAHI.
-- Email = username + "@" + APP_DOMAIN — API/Worker layer par calculate hota hai.

CREATE TABLE IF NOT EXISTS public.profiles (
  id                  UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  username            TEXT NOT NULL UNIQUE,          -- sirf username, email nahi!
  first_name          TEXT NOT NULL DEFAULT '',
  last_name           TEXT NOT NULL DEFAULT '',
  recovery_email      TEXT,                          -- password reset is email par jaata hai
  phone_number        TEXT,
  avatar_url          TEXT,                          -- profile photo (Supabase Storage URL)
  date_of_birth       DATE,                          -- Google-style personal info
  gender              TEXT,                          -- 'Male' | 'Female' | 'Other' | 'Rather not say' | NULL
  two_factor_enabled  BOOLEAN NOT NULL DEFAULT FALSE,
  storage_used_bytes  BIGINT NOT NULL DEFAULT 0,     -- kitna storage use kiya (bytes)
  storage_limit_bytes BIGINT NOT NULL DEFAULT 16106127360, -- 15 GB default quota
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Username rules: sirf chhote letters, numbers, dot, dash, underscore (3-24 chars)
  CONSTRAINT username_format CHECK (
    username ~ '^[a-z0-9](?:[a-z0-9._-]{1,22}[a-z0-9])?$'
  ),
  -- Gender sirf fixed values ho sakta hai (ya NULL = not set)
  CONSTRAINT gender_values CHECK (
    gender IS NULL OR gender IN ('Male', 'Female', 'Other', 'Rather not say')
  )
);

-- Agar database PURANI hai (table pehle se bani thi bina naye columns ke),
-- to yahan naye columns add ho jayenge — error nahi aayega.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url         TEXT,
  ADD COLUMN IF NOT EXISTS date_of_birth      DATE,
  ADD COLUMN IF NOT EXISTS gender             TEXT,
  ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS storage_used_bytes  BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS storage_limit_bytes BIGINT NOT NULL DEFAULT 16106127360;

-- Purani DB mein gender CHECK constraint na ho to add kar do (agar hai to skip).
-- DO blocks "IF NOT EXISTS" support nahi karte constraints par, isliye exception
-- ko ignore kar dete hain — constraint pehle se ho to error aata hai jo safe hai.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'gender_values'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT gender_values CHECK (
        gender IS NULL OR gender IN ('Male', 'Female', 'Other', 'Rather not say')
      );
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;  -- pehle se hai — koi baat nahi
  WHEN undefined_column THEN NULL;  -- column abhi bana — agli run par constraint lag jayega
END $$;

COMMENT ON TABLE public.profiles IS 'Gothwad user profiles. Email is NOT stored: it is always username@APP_DOMAIN.';


-- -----------------------------------------------------------------------------
-- 2. USER_SESSIONS — Kaunse devices par user logged-in hai
-- -----------------------------------------------------------------------------
-- Dashboard ke "Security → Your devices" section mein devices dikhte hain,
-- aur user kisi bhi device se remotely "Sign out" kar sakta hai.

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
-- In apps ke liye "Sign in with Gothwad" (OAuth 2.0) chalta hai.
-- redirect_uris deploy ke waqt UPDATE se bhari jaati hain (domain-agnostic rule).

CREATE TABLE IF NOT EXISTS public.ecosystem_apps (
  id            TEXT PRIMARY KEY,                  -- jaise 'gothwad-mail'
  name          TEXT NOT NULL,
  description   TEXT,
  icon          TEXT,
  redirect_uris TEXT[] NOT NULL DEFAULT '{}',      -- OAuth callback URLs
  is_verified   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- OAuth client fields (Step 2 se) — purani DB ke liye safe add:
--   client_id   = app ki public id (authorize URL mein jaati hai)
--   secret_hash = server-side apps ka secret (SHA-256). NULL = public client
--                 (PKCE mandatory — mobile/SPA ke liye best practice)
ALTER TABLE public.ecosystem_apps
  ADD COLUMN IF NOT EXISTS client_id   TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS secret_hash TEXT;

UPDATE public.ecosystem_apps SET client_id = id WHERE client_id IS NULL;

-- Seed data: Gothwad ecosystem ke apps.
-- ON CONFLICT DO UPDATE = naam/description badle hon to re-run par update ho jaye.
-- NOTE: redirect_uris yahan khaali hain (domain-agnostic rule). Deploy par:
--   UPDATE public.ecosystem_apps
--     SET redirect_uris = ARRAY['https://mail.YOUR-DOMAIN/auth/callback']
--     WHERE id = 'gothwad-mail';
INSERT INTO public.ecosystem_apps (id, name, description, icon) VALUES
  ('gothwad-meet',     'Gothwad Meet',              'Video meetings for your Gothwad Account', 'video'),
  ('gothwad-mail',     'Gothwad Mail',              'username inbox for your Gothwad Account', 'mail'),
  ('gothwad-store',    'Gothwad Store',             'Apps and add-ons for Gothwad',            'store'),
  ('gothwad-drive',    'Gothwad Drive',             'Files and folders on your account',       'hard-drive'),
  ('gothwad-notes',    'Gothwad Notes',             'Notes and lists, synced',                 'file-text'),
  ('gothwad-calendar', 'Gothwad Calendar',          'Events and reminders',                    'calendar'),
  ('gothwad-contacts', 'Gothwad Contacts',          'People and addresses',                    'users'),
  ('gothwad-tube',     'Gothwad Tube (PlusTube)',   'Video — PlusTube',                        'play'),
  ('gothwad-chat',     'GrixChat (Gothwad Chat)',   'Messaging',                               'message-circle'),
  ('gothwad-indogram', 'Indogram',                  'Telegram-style chat',                     'send')
ON CONFLICT (id) DO UPDATE
  SET name        = EXCLUDED.name,
      description = EXCLUDED.description,
      icon        = EXCLUDED.icon;


-- -----------------------------------------------------------------------------
-- 4. APP_AUTHORIZATIONS — Kis user ne kis app ko access diya hai
-- -----------------------------------------------------------------------------
-- Jab user "Sign in with Gothwad" karta hai, uska grant yahan save hota hai.
-- User dashboard (Security → apps) se access REVOKE bhi kar sakta hai.

CREATE TABLE IF NOT EXISTS public.app_authorizations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  app_id       TEXT NOT NULL REFERENCES public.ecosystem_apps (id) ON DELETE CASCADE,
  scopes       TEXT[] NOT NULL DEFAULT ARRAY['profile', 'email'],
  granted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, app_id)
);

CREATE INDEX IF NOT EXISTS idx_app_auth_user ON public.app_authorizations (user_id);


-- -----------------------------------------------------------------------------
-- 5. OAUTH_AUTH_CODES — one-time login codes (max 5 min valid)
-- -----------------------------------------------------------------------------
-- Flow: user consent deta hai → ek code banta hai → app us code ko token se
-- exchange karta hai → code turant "used" mark ho jaata hai (reuse impossible).

CREATE TABLE IF NOT EXISTS public.oauth_auth_codes (
  code                  TEXT PRIMARY KEY,
  client_id             TEXT NOT NULL,                 -- kis app ke liye
  user_id               UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  redirect_uri          TEXT NOT NULL,
  scopes                TEXT[] NOT NULL DEFAULT '{}',
  code_challenge        TEXT,                          -- PKCE (mobile/SPA security)
  code_challenge_method TEXT,                          -- 'S256'
  expires_at            TIMESTAMPTZ NOT NULL,
  used                  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oauth_codes_user ON public.oauth_auth_codes (user_id);


-- -----------------------------------------------------------------------------
-- 6. OAUTH_REFRESH_TOKENS — lambi sessions ke liye (scope: offline_access)
-- -----------------------------------------------------------------------------
-- NOTE: token ka ORIGINAL kabhi store nahi hota — sirf SHA-256 hash.
-- (Agar DB leak bhi ho jaaye to actual tokens leak nahi hote.)

CREATE TABLE IF NOT EXISTS public.oauth_refresh_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT UNIQUE NOT NULL,                     -- SHA-256(refresh_token)
  user_id    UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  client_id  TEXT NOT NULL,
  scopes     TEXT[] NOT NULL DEFAULT '{}',
  expires_at TIMESTAMPTZ NOT NULL,
  revoked    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_oauth_refresh_user ON public.oauth_refresh_tokens (user_id);


-- -----------------------------------------------------------------------------
-- 7. AUTO-PROFILE TRIGGER — Naya user bante hi profile bana do
-- -----------------------------------------------------------------------------
-- Jab bhi Supabase Auth mein naya user register hoga, yeh trigger
-- automatically public.profiles mein row insert kar deta hai.
-- (Worker signup API user_metadata mein username etc. bhejta hai.)

CREATE OR REPLACE FUNCTION public.handle_new_gothwad_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER   -- RLS ke bina chalta hai, isliye profile insert ho paati hai
SET search_path = public
AS $$
DECLARE
  v_username TEXT;
  v_dob      DATE;
  v_gender   TEXT;
BEGIN
  -- Username user_metadata se aana chahiye (Worker wahan bhejta hai).
  -- Fallback: email ka part before @ (Supabase ke default emails ke liye).
  v_username := LOWER(TRIM(COALESCE(
    NEW.raw_user_meta_data ->> 'username',
    SPLIT_PART(NEW.email, '@', 1)
  )));

  -- Date of birth: metadata mein 'YYYY-MM-DD' string aata hai → DATE mein convert
  v_dob := NULL;
  BEGIN
    v_dob := (NEW.raw_user_meta_data ->> 'date_of_birth')::DATE;
  EXCEPTION WHEN OTHERS THEN
    v_dob := NULL;  -- galat format hai to chhod do (koi error nahi)
  END;

  -- Gender: sirf fixed values accept karo, warna NULL
  v_gender := COALESCE(
    NEW.raw_user_meta_data ->> 'gender',
    ''
  );
  IF v_gender NOT IN ('Male', 'Female', 'Other', 'Rather not say') THEN
    v_gender := NULL;
  END IF;

  INSERT INTO public.profiles (
    id, username, first_name, last_name, recovery_email, phone_number,
    date_of_birth, gender
  ) VALUES (
    NEW.id,
    v_username,
    COALESCE(NEW.raw_user_meta_data ->> 'first_name', ''),
    COALESCE(NEW.raw_user_meta_data ->> 'last_name', ''),
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data ->> 'recovery_email', '')), ''),
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data ->> 'phone_number', '')), ''),
    v_dob,
    v_gender
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
-- 8. UPDATED_AT TRIGGER — profile change hote hi updated_at refresh
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
-- 9. ROW LEVEL SECURITY — Sab kuch lock, sirf maalik ka access
-- -----------------------------------------------------------------------------
-- Rule: RLS ON = koi bhi direct query kare to use sirf apni row mile.

ALTER TABLE public.profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ecosystem_apps     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_auth_codes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_refresh_tokens ENABLE ROW LEVEL SECURITY;

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
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

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
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "grants_delete_own" ON public.app_authorizations;
CREATE POLICY "grants_delete_own"
  ON public.app_authorizations FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- OAUTH_* tables: RLS ON hai lekin upar koi policy NAHI hai.
-- Matlab: in tables ko SIRF Worker (service_role) padh/sakta hai.
-- User/apps inhe directly kabhi touch nahi kar sakte — extra secure.


-- -----------------------------------------------------------------------------
-- 10. HELPER: username availability check (signup page live check)
-- -----------------------------------------------------------------------------
-- Yeh function ANON (bina login) bhi call kar sakta hai, lekin sirf
-- "available hai ya nahi" batata hai — koi private data leak nahi hota.

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


-- -----------------------------------------------------------------------------
-- 11. Helper: user ke connected apps (dashboard "Connected apps" ke liye)
-- -----------------------------------------------------------------------------
-- User apne authorized apps dekh sake — sirf apne grants.
-- (Direct profiles access nahi — safe.)

CREATE OR REPLACE FUNCTION public.get_my_app_grants()
RETURNS TABLE (
  app_id       TEXT,
  app_name     TEXT,
  app_icon     TEXT,
  scopes       TEXT[],
  granted_at   TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT a.app_id, e.name, e.icon, a.scopes, a.granted_at, a.last_used_at
  FROM public.app_authorizations a
  JOIN public.ecosystem_apps e ON e.id = a.app_id
  WHERE a.user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_app_grants() TO authenticated;


-- ═══════════════════════════════════════════════════════════════════════════
-- FILE 01 COMPLETE 🎉
-- Next: sql/02_account_activity.sql (recent activity feature)
-- ═══════════════════════════════════════════════════════════════════════════
