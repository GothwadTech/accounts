# 📚 Gothwad Accounts Documentation (`docs/`)

Welcome to **Gothwad Accounts v2.0 (100% Cloudflare Native — Zero Supabase)** documentation!

| Document | Purpose |
|---|---|
| **[`SETUP.md`](SETUP.md)** | **Step-by-step Cloudflare Dashboard deployment guide** (`accounts` D1 + Worker Secrets) |
| **[`CLOUDFLARE_NATIVE_PLAN.md`](CLOUDFLARE_NATIVE_PLAN.md)** | **Master Hybrid Architecture Plan** (`Accounts` + `Mail` on Cloudflare D1 · `PlusTube` + `Indogram` + `GrixChat` on Supabase) |
| **[`MAIL_D1_MIGRATION_PROMPT.md`](MAIL_D1_MIGRATION_PROMPT.md)** | **Copy-Paste Master Prompt & Spec for `GothwadTech/mail` AI Agents** (100% Cloudflare D1 `mail` DB + `500`-email smart retention) |
| **[`MAIL_INTERNAL.md`](MAIL_INTERNAL.md)** | **Mail ↔ Accounts HTTP Contract** (`GET /api/internal/usernames/:username`, `/api/auth/me`, cookie forwarding & naming rules) |
| **[`ARCHITECTURE.md`](ARCHITECTURE.md)** | Deep technical diagram of WebCrypto PBKDF2, JWT separation (`session` vs `oauth_access`), edge-cached avatars & D1 tables |
| **[`OAUTH.md`](OAUTH.md)** | Developer integration guide for `"Sign in with Gothwad"` (OAuth 2.0 + S256 PKCE) |
| **[`STORE_OAUTH.md`](STORE_OAUTH.md)** | Exact callback allowlist & Android deep-link setup for **Kiwi Store** |
