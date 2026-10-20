# 📚 `docs/` — Gothwad Accounts Documentation Hub

| Document | Audience | What's Inside |
|----------|----------|---------------|
| **[CLOUDFLARE_NATIVE_PLAN.md](CLOUDFLARE_NATIVE_PLAN.md)** | 🧭 Founder & Architects | **Master Plan:** 100% Cloudflare Native (`D1` + Worker Auth + R2) architecture for `Accounts` (completed!) + step-by-step roadmap to eliminate Supabase across `Mail`, `Store`, `GrixChat` & future apps |
| **[SETUP.md](SETUP.md)** | 👤 Everyone (Beginner Friendly) | **Step-by-Step Deployment Guide:** Exact click-by-click Cloudflare Dashboard instructions (works from mobile or desktop browser — no CLI required!) |
| **[ARCHITECTURE.md](ARCHITECTURE.md)** | 🏗️ Developers & AI | Complete technical flows: PBKDF2-SHA256 hashing, `session` vs `oauth_access` JWTs, D1 schema, Edge-cached avatars, SSO cookies |
| **[OAUTH.md](OAUTH.md)** | 🧩 App Developers | How to integrate **"Sign in with Gothwad"** (OAuth 2.0 + S256 PKCE) into any web or Android app |
| **[MAIL_INTERNAL.md](MAIL_INTERNAL.md)** | 📧 Mail Maintainers | Server-to-server `GET /api/internal/usernames/:username` contract & naming rules |
| **[STORE_OAUTH.md](STORE_OAUTH.md)** | 🥝 Store Maintainers | Kiwi Store web + Android (`gothwadstore://` & `kiwistore://`) callback registration in D1 |
