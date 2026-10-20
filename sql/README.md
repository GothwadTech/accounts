# 🗄️ `sql/` — Gothwad Accounts Database (100% Cloudflare D1 Native)

> **🎉 ZERO SUPABASE:** Gothwad Accounts ab **100% Cloudflare Native (`Cloudflare D1` SQLite + Worker WebCrypto Auth)** par chalta hai!
> Supabase ki ab **kisi bhi table, auth service ya storage bucket ki zaroorat NAHI hai**.

---

## ⚡ SABSE BADI KHOOBI: Auto-Bootstrap + Manual SQL Support!

1. **Automatic First-Boot Setup:** Jab aap Cloudflare Dashboard mein `gothwad-accounts-db` bana kar Worker ke saath bind karte ho, **Accounts Worker pehli API request par hi core tables, indexes aur app seeds automatically bana leta hai!**
2. **Manual D1 Console Control:** Phir bhi saari database structure is `sql/` folder mein clean, numbered, **100% idempotent** SQL files ke roop mein rakhi gayi hai taaki aap **Cloudflare Dashboard → Storage & Databases → D1 → `gothwad-accounts-db` → Console** mein kabhi bhi inspect ya re-run kar sako.

---

## 📁 Numbered SQL Files (Order: `01` → `05`)

| # | File | Kya banata hai |
|---|------|----------------|
| 1 | `01_core_schema.sql` | `users` (pure username + PBKDF2-SHA256 hash), `profiles`, `user_sessions`, `auth_refresh_tokens`, `password_reset_tokens`, `ecosystem_apps`, `app_authorizations`, `oauth_auth_codes`, `oauth_refresh_tokens` |
| 2 | `02_account_activity.sql` | `account_activity` (Google-style Security & Recent Activity log) |
| 3 | `03_avatars_storage.sql` | `user_avatars` (256×256 profile photo storage in D1 + Cloudflare Edge CDN cache; optional R2 ready) |
| 4 | `04_kiwi_store_oauth_migration.sql` | `kiwi-store` web + Android OAuth callbacks setup & legacy grant migration |
| 5 | `05_store_android_oauth.sql` | Ensures Android native callbacks (`gothwadstore://oauth/callback`, `kiwistore://oauth/callback`) stay registered without dropping web URLs |

> Bonus: Apne `APP_DOMAIN` ke hisaab se Store + Mail + Ecosystem callbacks ki ready SQL nikalne ke liye:
> ```bash
> node tools/generate-store-oauth-sql.mjs
> ```

---

## 🧠 Core Database Rules (Never Break These!)

1. **100% Pure Username-Only (`Rule #2`):** `users` aur `profiles` dono mein **koi `email` column hai hi nahi!** Email hamesha runtime par `username + "@" + APP_DOMAIN` calculate hota hai. Kal domain `gothwad.in` karne par **0 SQL lines** badalni padengi!
2. **Zero Raw Secrets in DB:**
   - Passwords = `pbkdf2_sha256$100000$<salt>$<hash>`
   - Session Refresh Tokens = `SHA-256(token)`
   - Password Reset Tokens = `SHA-256(token)` (15 min expiry, single-use)
   - OAuth Refresh Tokens = `SHA-256(token)`
   - Confidential Client Secrets = `SHA-256(secret)`
3. **Zero Browser DB Access:** Browser kabhi D1 ko touch nahi kar sakta — D1 binding (`env.DB`) sirf Cloudflare Worker ke andar private network par available hoti hai!
