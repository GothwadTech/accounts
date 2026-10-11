-- ═══════════════════════════════════════════════════════════════════════════
-- GOTHWAD ACCOUNTS — FILE 02: ACCOUNT ACTIVITY LOG
-- ═══════════════════════════════════════════════════════════════════════════
-- File: sql/02_account_activity.sql
--
-- KYA HAI IS FILE MEIN?
--   "Recent activity" feature — Google Account jaisa security/activity feed.
--   Jab bhi account mein koi important cheez hoti hai (sign-in, password
--   change, app connect...), Worker yahan ek row likh deta hai.
--   Dashboard ke "Security" aur "Data & privacy" sections mein dikhta hai.
--
-- SAFE HAI:
--   * FIRST TIME → table fresh banegi.
--   * RE-RUN     → koi error nahi (CREATE TABLE IF NOT EXISTS pattern).
--
-- Run order: 01 ke BAAD (yeh table profiles par depend karti hai).
--
-- ⚠️  SIRF GOTHWAD ACCOUNTS KE SUPABASE PROJECT KE LIYE (sql/README.md dekho).
-- ═══════════════════════════════════════════════════════════════════════════


-- -----------------------------------------------------------------------------
-- 1. ACCOUNT_ACTIVITY — kya-kya hua account mein
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.account_activity (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  type       TEXT NOT NULL,          -- event ka type (neeche list dekho)
  title      TEXT NOT NULL,          -- short heading (English)
  detail     TEXT,                   -- extra info (kis device/browser se waghera)
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Worker in TYPE values use karta hai (naye add karne par yahan comment update karo):
--   'signup'           → Account created
--   'signin'           → Signed in
--   'signout'          → Signed out
--   'password_change'  → Password changed
--   'password_reset'   → Password reset (email link se)
--   'profile_update'   → Personal info updated
--   'avatar_update'    → Profile photo changed
--   'session_revoked'  → Device signed out (remote)
--   'app_authorized'   → App connected (OAuth allow)
--   'app_revoked'      → App disconnected
--   'account_deleted'  → Account deleted

CREATE INDEX IF NOT EXISTS idx_account_activity_user
  ON public.account_activity (user_id, created_at DESC);

COMMENT ON TABLE public.account_activity IS 'Gothwad Account recent activity feed (Google-style). Written by Worker only, read by owner only.';


-- -----------------------------------------------------------------------------
-- 2. ROW LEVEL SECURITY
-- -----------------------------------------------------------------------------
-- User sirf APNI activity padh sake. INSERT/DELETE policy NAHI hai —
-- matlab rows sirf Worker (service_role) likh/mita sakta hai. User directly
-- kuch add/delete nahi kar sakta (koi fake "password changed" entry nahi!).

ALTER TABLE public.account_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activity_select_own" ON public.account_activity;
CREATE POLICY "activity_select_own"
  ON public.account_activity FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);


-- -----------------------------------------------------------------------------
-- 3. Helper: purani activity rows saaf karo (storage bachao — free tier!)
-- -----------------------------------------------------------------------------
-- Har user ke liye sirf latest 100 entries rakho. Worker isse roz call kar
-- sakta hai, ya manually Supabase SQL Editor mein run kar sakte ho:
--   SELECT public.cleanup_old_activity();

CREATE OR REPLACE FUNCTION public.cleanup_old_activity()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Har user ki latest 100 ke baad wali rows delete karo
  DELETE FROM public.account_activity a
  USING public.profiles p
  WHERE a.user_id = p.id
    AND a.id NOT IN (
      SELECT id FROM public.account_activity
      WHERE user_id = p.id
      ORDER BY created_at DESC
      LIMIT 100
    );

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
-- FILE 02 COMPLETE 🎉
-- Next: sql/03_avatars_storage.sql (profile photos bucket)
-- ═══════════════════════════════════════════════════════════════════════════
