# 🗄️ supabase/ — Database Schema

`schema.sql` = poora database (tables + RLS + triggers + seeds).
**Copy-paste in Supabase Dashboard → SQL Editor → Run.** Bas.

## Tables

| Table | Kya | Kaun access karta hai |
|-------|-----|----------------------|
| `profiles` | User profile (username, names, recovery_email, storage quota) | User (own row, RLS) + Worker |
| `user_sessions` | Device sessions (dashboard "Security" tab) | User (own) + Worker |
| `ecosystem_apps` | OAuth clients (gothwad-mail, gothwad-drive...) + redirect_uris | Public read; Worker write |
| `app_authorizations` | User ↔ app grants (scopes) | User (own) + Worker |
| `oauth_auth_codes` | One-time OAuth codes (5 min) | **Worker ONLY** (RLS blocks all) |
| `oauth_refresh_tokens` | Hashed refresh tokens (30 days) | **Worker ONLY** |

## Important design points
- **username only — email column NAHI hai** (Rule #2). Email = `username@APP_DOMAIN`
  API layer par calculate hota hai (`presentUser()` in worker).
- **RLS ON** on every table. `oauth_*` tables have NO policies = worker-only.
- **Trigger** `on_auth_user_created`: signup par profile auto-create
  (SECURITY DEFINER — RLS ke bina insert kar sakta hai).
- **Helpers:** `is_username_available(p_username)` (anon-safe),
  `get_my_app_grants()` (user ke connected apps).

## Kaise update karo
1. Naya SQL `schema.sql` mein append karo (ya `mail.sql` jaisa separate file
   for Step 3+) with comments
2. Supabase SQL Editor mein run karo
3. Table Editor mein verify karo (tables + policies dikhnے chahiye)

## ⚠️ Domain-agnostic
Schema mein kahin `gothwadtech.com` hardcoded nahi hai. `ecosystem_apps.redirect_uris`
empty hain — deploy par UPDATE se bharte hain (docs/OAUTH.md mein example).
