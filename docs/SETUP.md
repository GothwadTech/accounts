# 🛠️ Cloudflare Dashboard Setup Guide — Gothwad Accounts (v2.0 Native D1)

> **Status:** `cloudflare-worker/wrangler.toml` mein aapka **`accounts`** D1 database (`392aacf8-1b43-490a-9519-ced4daf5a40f`) pehle hi configure ho chuka hai! ✅
> **0 Credit Card Required · 0 Supabase Keys · 100% Free Forever**

---

## ✅ Checklist: Production 100% Live Karne Ke Exact Steps

### 🔹 Step 1: Cloudflare D1 Databases (✅ Aapne Kar Liya Hai!)
- Database 1: **`accounts`** (`392aacf8-1b43-490a-9519-ced4daf5a40f`) — bound in `cloudflare-worker/wrangler.toml` (`binding = "DB"`)
- Database 2: **`mail`** — ready for `GothwadTech/mail` migration next!

---

### 🔹 Step 2: Pull Request Ko `main` Mein Merge Karo (Automatic Deploy!)
1. GitHub Pull Request ko **`Merge pull request`** click karke `main` mein merge karo.
2. Merge hote hi Cloudflare **Workers Builds** automatic Worker **`accounts`** (`api.gothwadtech.com`) aur Pages **`accounts.gothwadtech.com`** par naya v2.0 code + D1 binding deploy kar dega!

---

### 🔹 Step 3: Worker (`accounts`) Ke Secrets Check Karo
**Cloudflare Dashboard ➔ Compute (Workers) ➔ Workers & Pages ➔ `accounts` ➔ Settings ➔ Variables and Secrets:**
- 🗑️ Purane `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` hata do (ab unki 0% zaroorat hai).
- 🔐 Ye **Secrets (`Type: Secret`)** set hone chahiye:
  1. **`JWT_SECRET`** — 40+ char random secret string
  2. **`MAIL_INTERNAL_TOKEN`** — Mail Worker ke `ACCOUNTS_INTERNAL_TOKEN` ke barabar same value
  3. **`RESEND_API_KEY`** *(Optional)* — Forgot Password recovery emails ke liye

---

### 🔹 Step 4: D1 Console (`accounts`) Mein All-in-One Setup SQL Paste Karo
**Cloudflare Dashboard ➔ Storage & Databases ➔ D1 SQL Database ➔ `accounts` ➔ Console:**

> 💡 Neeche wala poora SQL (`sql/00_d1_console_bootstrap.sql`) **ek hi baar Copy karke Console mein Paste + Enter** karo — yeh **saari 11 tables + indexes + saare Gothwad OAuth callbacks (`Mail`, `Kiwi Store Web + Android`, `Meet`, `Drive`, `PlusTube`, `GrixChat`, `Indogram`)** ek hi shot mein create aur register kar dega!

```sql
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), CONSTRAINT username_length CHECK (length(username) BETWEEN 3 AND 24), CONSTRAINT username_lowercase CHECK (username = lower(username)));
CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);
CREATE TABLE IF NOT EXISTS profiles (id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE, username TEXT NOT NULL UNIQUE COLLATE NOCASE, first_name TEXT NOT NULL DEFAULT '', last_name TEXT NOT NULL DEFAULT '', recovery_email TEXT, phone_number TEXT, avatar_url TEXT, date_of_birth TEXT, gender TEXT, two_factor_enabled INTEGER NOT NULL DEFAULT 0, storage_used_bytes INTEGER NOT NULL DEFAULT 0, storage_limit_bytes INTEGER NOT NULL DEFAULT 16106127360, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), CONSTRAINT gender_values CHECK (gender IS NULL OR gender IN ('Male', 'Female', 'Other', 'Rather not say')));
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON profiles (phone_number) WHERE phone_number IS NOT NULL;
CREATE TABLE IF NOT EXISTS user_sessions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE, device_name TEXT NOT NULL DEFAULT 'Unknown device', browser TEXT NOT NULL DEFAULT 'Unknown', os TEXT, ip_address TEXT, remember_me INTEGER NOT NULL DEFAULT 0, last_active TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), is_current INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')));
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions (user_id, last_active DESC);
CREATE TABLE IF NOT EXISTS auth_refresh_tokens (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE, session_id TEXT REFERENCES user_sessions (id) ON DELETE CASCADE, expires_at TEXT NOT NULL, revoked INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')));
CREATE INDEX IF NOT EXISTS idx_auth_refresh_user ON auth_refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_auth_refresh_session ON auth_refresh_tokens (session_id);
CREATE TABLE IF NOT EXISTS password_reset_tokens (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE, expires_at TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')));
CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens (user_id);
CREATE TABLE IF NOT EXISTS ecosystem_apps (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, icon TEXT, redirect_uris TEXT NOT NULL DEFAULT '[]', is_verified INTEGER NOT NULL DEFAULT 0, client_id TEXT UNIQUE, secret_hash TEXT, homepage_url TEXT, is_core INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')));
CREATE TABLE IF NOT EXISTS app_authorizations (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE, app_id TEXT NOT NULL REFERENCES ecosystem_apps (id) ON DELETE CASCADE, scopes TEXT NOT NULL DEFAULT '["profile","email"]', granted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), last_used_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), UNIQUE (user_id, app_id));
CREATE INDEX IF NOT EXISTS idx_app_auth_user ON app_authorizations (user_id);
CREATE TABLE IF NOT EXISTS oauth_auth_codes (code TEXT PRIMARY KEY, client_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE, redirect_uri TEXT NOT NULL, scopes TEXT NOT NULL DEFAULT '[]', code_challenge TEXT, code_challenge_method TEXT, expires_at TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')));
CREATE INDEX IF NOT EXISTS idx_oauth_codes_user ON oauth_auth_codes (user_id);
CREATE TABLE IF NOT EXISTS oauth_refresh_tokens (id TEXT PRIMARY KEY, token_hash TEXT UNIQUE NOT NULL, user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE, client_id TEXT NOT NULL, scopes TEXT NOT NULL DEFAULT '[]', expires_at TEXT NOT NULL, revoked INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')));
CREATE INDEX IF NOT EXISTS idx_oauth_refresh_user ON oauth_refresh_tokens (user_id);
CREATE TABLE IF NOT EXISTS account_activity (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE, type TEXT NOT NULL, title TEXT NOT NULL, detail TEXT, ip_address TEXT, user_agent TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')));
CREATE INDEX IF NOT EXISTS idx_account_activity_user ON account_activity (user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS user_avatars (user_id TEXT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE, mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')), data BLOB NOT NULL, byte_size INTEGER NOT NULL, etag TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')));
INSERT INTO ecosystem_apps (id, client_id, name, description, icon, redirect_uris, is_verified, is_core) VALUES ('gothwad-meet', 'gothwad-meet', 'Gothwad Meet', 'Video meetings for your Gothwad Account', 'video', '["https://meet.gothwadtech.com/auth/callback","https://meet.gothwadtech.com/oauth/callback"]', 1, 1), ('gothwad-mail', 'gothwad-mail', 'Gothwad Mail', 'username inbox for your Gothwad Account', 'mail', '["https://mail.gothwadtech.com/auth/callback","https://mail.gothwadtech.com/oauth/callback"]', 1, 1), ('kiwi-store', 'kiwi-store', 'Kiwi Store', 'Apps and add-ons for Kiwi Store', 'store', '["gothwadstore://oauth/callback","kiwistore://oauth/callback","https://kiwistore.gothwadtech.com/auth/callback","https://kiwiconsole.gothwadtech.com/auth/callback","https://kiwiadmin.gothwadtech.com/auth/callback","https://kiwiapp.gothwadtech.com/auth/callback","http://localhost:3000/auth/callback","http://localhost:5173/auth/callback"]', 1, 1), ('gothwad-drive', 'gothwad-drive', 'Gothwad Drive', 'Files and folders on your account', 'hard-drive', '["https://drive.gothwadtech.com/auth/callback","https://drive.gothwadtech.com/oauth/callback"]', 1, 1), ('gothwad-notes', 'gothwad-notes', 'Gothwad Notes', 'Notes and lists, synced', 'file-text', '[]', 1, 1), ('gothwad-calendar', 'gothwad-calendar', 'Gothwad Calendar', 'Events and reminders', 'calendar', '[]', 1, 1), ('gothwad-contacts', 'gothwad-contacts', 'Gothwad Contacts', 'People and addresses', 'users', '[]', 1, 1), ('gothwad-tube', 'gothwad-tube', 'Gothwad Tube (PlusTube)', 'Video - PlusTube', 'play', '["https://plustube.gothwadtech.com/auth/callback","https://tube.gothwadtech.com/auth/callback"]', 1, 0), ('gothwad-chat', 'gothwad-chat', 'GrixChat (Gothwad Chat)', 'Messaging', 'message-circle', '["https://grixchat.gothwadtech.com/auth/callback","https://chat.gothwadtech.com/auth/callback"]', 1, 0), ('gothwad-indogram', 'gothwad-indogram', 'Indogram', 'Telegram-style chat', 'send', '["https://indogram.gothwadtech.com/auth/callback"]', 1, 0) ON CONFLICT (id) DO UPDATE SET client_id = excluded.client_id, name = excluded.name, description = excluded.description, icon = excluded.icon, redirect_uris = excluded.redirect_uris, is_verified = excluded.is_verified, is_core = excluded.is_core;
SELECT id, name, redirect_uris FROM ecosystem_apps WHERE redirect_uris != '[]';
```

---

### 🔹 Step 5: Verify Production Health & Claim Founder Account 🎉
1. Open **`https://api.gothwadtech.com/api/health`** → `"engine": "cloudflare-d1-native"` dikhega!
2. Open **`https://accounts.gothwadtech.com/signup`** → Apna founder username (`pawan`) create karo aur `/me` dashboard par photo lagao!
