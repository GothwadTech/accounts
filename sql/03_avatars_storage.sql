-- ═══════════════════════════════════════════════════════════════════════════
-- GOTHWAD ACCOUNTS — FILE 03: PROFILE PHOTOS (SUPABASE STORAGE BUCKET)
-- ═══════════════════════════════════════════════════════════════════════════
-- File: sql/03_avatars_storage.sql
--
-- KYA HAI IS FILE MEIN?
--   Profile photo (avatar) ke liye Supabase Storage bucket "avatars".
--   User dashboard se photo upload karta hai → Worker (service_role) usse
--   is bucket mein `user_id/avatar.jpg` path par save karta hai → public URL
--   profiles.avatar_url column mein chala jaata hai.
--
-- SAFE HAI:
--   * FIRST TIME → bucket banega + public read policy lagegi.
--   * RE-RUN     → koi error nahi, kuch duplicate nahi hoga.
--
-- Run order: 01 ke BAAD (koi table dependency nahi, lekin sequence maintain karo).
--
-- ⚠️  SIRF GOTHWAD ACCOUNTS KE SUPABASE PROJECT KE LIYE (sql/README.md dekho).
-- ═══════════════════════════════════════════════════════════════════════════


-- -----------------------------------------------------------------------------
-- 1. "avatars" bucket banao (agar pehle se nahi hai)
-- -----------------------------------------------------------------------------
-- public = true → photo ka URL koi bhi khol sakta hai (Google/GitHub avatar
-- jaisa hi model hai). Upload sirf Worker (service key) kar sakta hai.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152,  -- 2 MB limit per photo
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public             = true,
      file_size_limit    = 2097152,
      allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];


-- -----------------------------------------------------------------------------
-- 2. Public read policy — photos sabko dikhni chahiye (sirf READ, write nahi)
-- -----------------------------------------------------------------------------
-- storage.objects par RLS already ON hota hai (Supabase default).
-- Yeh policy sirf "avatars" bucket ke objects ko publically READABLE banati hai.
-- WRITE koi policy nahi → upload/delete sirf service_role (Worker) kar sakta hai.

DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'avatars');


-- -----------------------------------------------------------------------------
-- 3. Helper notes (informational — run karne ki zaroorat nahi)
-- -----------------------------------------------------------------------------
--
-- Photo ka public URL banne ka formula:
--   {SUPABASE_URL}/storage/v1/object/public/avatars/{user_id}/avatar.jpg
--
-- Worker upload kaise karta hai (reference):
--   PUT {SUPABASE_URL}/storage/v1/object/avatars/{user_id}/avatar.jpg
--   Headers: apikey + Authorization (service key), Content-Type: image/jpeg
--   Body: image bytes
--
-- Agar kabhi bucket private karni ho (URL signed bana kar dikhao), to:
--   UPDATE storage.buckets SET public = false WHERE id = 'avatars';
--   (phir Worker ko signed URL generate karna hoga — createSignedUrl)


-- ═══════════════════════════════════════════════════════════════════════════
-- FILE 03 COMPLETE 🎉
-- Abhi ke liye bas itni hi files hain. Naya feature aayega to FILE 04 banega
-- (rules: sql/README.md).
-- ═══════════════════════════════════════════════════════════════════════════
