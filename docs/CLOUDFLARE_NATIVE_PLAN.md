# 🧭 Gothwad Hybrid Cloud Master Plan (`Cloudflare Native` + `Supabase Powerhouse`)

> **Final Locked Architecture Decision — 2026-10-20 (by Pawan, Founder — Gothwad Tech)**
>
> **Golden Rule of Gothwad Infrastructure ($0 Cost, Best Tool for Each Job):**
> - **🟠 Zone A — 100% Cloudflare Native (`Workers` + `D1 SQLite` — Zero Supabase):**
>   1. **`Gothwad Accounts` (`GothwadTech/accounts`)** — Central Identity, SSO & OAuth 2.0 Hub *(✅ DONE!)*
>   2. **`Gothwad Mail` (`GothwadTech/mail`)** — Inbound/Outbound `@gothwadtech.com` Email Engine *(🔜 NEXT!)*
> - **🟢 Zone B — Supabase Powerhouse (Kept Permanently on Supabase Free Tier + `"Sign in with Gothwad"` SSO):**
>   - **`PlusTube` (`GothwadTech/tubeweb`, `tubeapp`)** — Heavy media metadata, comments, watch history & Postgres search
>   - **`Indogram` (`GothwadTech/indogramapp`)** — Social graph, posts, likes, media buckets & realtime feeds
>   - **`GrixChat` (`GothwadTech/grixchat`)** — Realtime WebSockets, chat channels, media attachments & presence

---

## 1. Why This Hybrid Split Is Engineering Perfection

| Requirement | `Accounts` + `Mail` (🟠 Cloudflare D1) | `PlusTube` + `Indogram` + `GrixChat` (🟢 Supabase) |
|---|---|---|
| **24×7 Always Awake?** | ✅ Critical! Login & incoming emails **can never fail** due to 7-day DB sleep | Handled naturally + easy keep-alive |
| **Free Project Slots** | Uses **0 Supabase slots!** Frees up full **2/2 Supabase projects** for heavy social/video apps | Full power of real PostgreSQL + Storage (`1 GB` card-free) + Realtime WebSockets |
| **Auth / User Cap** | **Unlimited users ($0 MAU)** via native `PBKDF2-SHA256` + `JWT` | Uses **Gothwad SSO (`accounts.gothwadtech.com`)** so one Gothwad ID unlocks all apps |
| **Speed** | `5–15ms` same-network Worker ↔ D1 reads/writes | Postgres indexes + realtime channels |

---

## 2. Phase 1: `Gothwad Accounts` (D1 DB: `accounts`) — ✅ COMPLETED

Implemented and verified across **62 automated tests (`npm test`)** in `GothwadTech/accounts`:
- **Database:** `accounts` (`392aacf8-1b43-490a-9519-ced4daf5a40f` on Cloudflare D1)
- **Zero Email Columns (`Rule #2`):** `users` & `profiles` store strictly lowercase `username`; switching `APP_DOMAIN` (e.g. `gothwad.in`) requires **zero DB migrations**.
- **Native Password Engine:** WebCrypto `PBKDF2-HMAC-SHA256` (`100,000` iterations + 16-byte CSPRNG salt + timing-safe comparison).
- **Token Security:** Strict JWT `token_use` isolation (`session` vs `oauth_access`), single-use `UPDATE ... RETURNING` consumption locks, and instant remote device logout.
- **Avatars (`0` Card Needed):** D1 `user_avatars` + Cloudflare Edge Cache (`ETag` + `1-year immutable CDN cache`), with zero-code drop-in upgrade support for `AVATARS_BUCKET` (Cloudflare R2).
- **Mail Bridge Ready:** `GET /api/internal/usernames/:username` verifies mailbox existence directly from D1 in `<5ms`.

---

## 3. Phase 2: `Gothwad Mail` (D1 DB: `mail`) — Blueprint & Retention Architecture

### Why `GothwadTech/mail` Fits Cloudflare D1 Cleanly
Inspection of `GothwadTech/mail` confirms **90% of the app already runs inside Cloudflare Workers**:
1. The React PWA frontend **never talks to Supabase directly** — all API calls already go through `worker/src/index.ts`.
2. Inbound email already runs natively in Cloudflare Email Routing (`worker/src/inbound.ts` with `postal-mime`).
3. Outbound email already sends via Resend HTTP API (`worker/src/resend.ts`).
4. Only **one single SQL table (`mail_messages`)** + **one new table (`mail_settings`)** is needed in `gothwad-mail-db`!

### Smart Storage Math & Retention Design (Protecting the Free `500 MB` D1 Limit)

| Parameter | Engineered Design for `Gothwad Mail` on D1 | Why It Matters |
|---|---|---|
| **Default Retention** | **Latest `500` emails per mailbox** (`retention_limit = 500` default) | Keeps inbox blazing fast and prevents old OTP/promo clutter from eating storage |
| **User Settings Choice** | Options in `SettingsModal.tsx`: **`500 emails (Default)`** · **`1,000 emails`** · **`All emails (up to 50 MB mailbox quota)`** | Gives users total freedom while ensuring **1 spam-flooded account can never eat the whole `500 MB` DB!** |
| **`⭐ Starred` Protection** | Auto-cleanup **NEVER deletes starred emails** (`AND is_starred = 0`) | Even on the `500`-email plan, important starred receipts/tickets stay safe forever! |
| **Trash Auto-Purge** | Emails in `folder = 'trash'` older than **30 days** auto-purge | Matches Gmail behavior and reclaims wasted space automatically |
| **Gzip Body Compression** | Compress `body_html` + `body_text` using Worker built-in `CompressionStream('gzip')` | Shrinks `15 KB` HTML newsletters down to **`~2 KB`** → **1 free `500 MB` D1 DB holds `~2,50,000` emails!** |
| **Row Size Safety Cap** | Cap raw body before compression & enforce `< 512 KB` stored row size | Guarantees 0 crashes against Cloudflare D1's hard `2 MB` SQLite row limit |

### Planned D1 Tables for `gothwad-mail-db`

```sql
-- 1. User mailbox preferences (synced with SettingsModal.tsx)
CREATE TABLE IF NOT EXISTS mail_settings (
  username          TEXT PRIMARY KEY CHECK (username = lower(username) AND length(username) BETWEEN 1 AND 64),
  retention_limit   INTEGER NOT NULL DEFAULT 500, -- 500 (default), 1000, or 0 = keep all up to mailbox_quota_bytes
  quota_bytes       INTEGER NOT NULL DEFAULT 52428800, -- 50 MB generous per-user mailbox cap (~25,000 compressed emails!)
  signature_text    TEXT NOT NULL DEFAULT '',
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 2. Mail messages (drop-in replacement for public.mail_messages)
CREATE TABLE IF NOT EXISTS mail_messages (
  id                TEXT PRIMARY KEY,
  to_username       TEXT NOT NULL CHECK (to_username = lower(to_username) AND length(to_username) BETWEEN 1 AND 64),
  from_email        TEXT NOT NULL,
  from_name         TEXT,
  to_email          TEXT,
  cc_emails         TEXT NOT NULL DEFAULT '[]',   -- JSON array
  bcc_emails        TEXT NOT NULL DEFAULT '[]',   -- JSON array
  subject           TEXT,
  snippet           TEXT,
  body_text         TEXT,
  body_html         TEXT,
  body_compressed   BLOB,                         -- Optional gzip payload for large HTML newsletters
  attachments       TEXT NOT NULL DEFAULT '[]',   -- JSON metadata [{name, type, size}]
  size_bytes        INTEGER NOT NULL DEFAULT 0,
  folder            TEXT NOT NULL DEFAULT 'inbox' CHECK (folder IN ('inbox', 'sent', 'drafts', 'trash')),
  is_read           INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
  is_starred        INTEGER NOT NULL DEFAULT 0 CHECK (is_starred IN (0, 1)),
  provider_id       TEXT,
  received_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_mail_user_folder
  ON mail_messages (to_username, folder, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_mail_user_starred
  ON mail_messages (to_username, is_starred) WHERE is_starred = 1;
```

### Automatic Trim Query (Runs Automatically After Every Inbound Insert!)
Whenever a new inbound email arrives for `username` and `retention_limit > 0`, a **single 1ms D1 statement** trims non-starred overflow messages automatically without needing cron jobs:

```sql
DELETE FROM mail_messages
WHERE to_username = ?1
  AND folder = 'inbox'
  AND is_starred = 0
  AND id NOT IN (
    SELECT id FROM mail_messages
    WHERE to_username = ?1 AND folder = 'inbox' AND is_starred = 0
    ORDER BY received_at DESC
    LIMIT ?2
  );
```
