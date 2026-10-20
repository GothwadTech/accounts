# 🗺️ PLAN.md — Gothwad Master Plan (100% Cloudflare Native Ecosystem)

> **Last updated:** 2026-10-20
> Deep technical plan & per-repo migration guide: **[`docs/CLOUDFLARE_NATIVE_PLAN.md`](docs/CLOUDFLARE_NATIVE_PLAN.md)**
> Step-by-step Cloudflare Dashboard setup: **[`docs/SETUP.md`](docs/SETUP.md)**

---

## 🎯 VISION & INFRASTRUCTURE DECISION

**Gothwad Tech** ek complete independent ecosystem bana raha hai (`Accounts`, `Mail`, `Kiwi Store`, `Meet`, `PlusTube`, `GrixChat`, `Indogram`, `Drive`, `Notes`, `Calendar`, `Browser`).

**2026-10-20 Architectural Upgrade — Goodbye Supabase, Hello 100% Cloudflare Native:**
- **Zero Supabase Dependency:** Na 2-project limit, na 50K MAU cap, na 7-day inactivity pause!
- **Cloudflare Workers + Cloudflare D1 (10 Free SQLite DBs) + Global Edge Cache (+ Optional R2):**
  1. `gothwad-accounts-db` → **Gothwad Accounts (`GothwadTech/accounts`) — ✅ COMPLETED!**
  2. `gothwad-mail-db` → **Gothwad Mail (`GothwadTech/mail`) — 🔜 Next Repo Migration**
  3. `gothwad-store-db` → **Kiwi Store (`GothwadTech/store`) — 📋 Next After Mail**
  4. `gothwad-workspace-db` → **Notes + Calendar + Contacts + Sync**
  5. `gothwad-chat-db` + **Durable Objects WebSockets** → **GrixChat (`GothwadTech/grixchat`)**

---

## 📊 ROADMAP STATUS

| Phase | Milestone | Status |
|-------|-----------|--------|
| **Step 1** | Gothwad Accounts UI (`/signin`, `/signup`, `/me`) + Google-style Light/Dark Dashboard | ✅ DONE |
| **Step 2** | OAuth 2.0 + S256 PKCE Provider (`"Sign in with Gothwad"`) + Subdomain Cookie SSO | ✅ DONE |
| **Step 2.5** | **100% Cloudflare Native Upgrade (`D1` + `PBKDF2-SHA256` + Edge Avatars — Zero Supabase!)** | ✅ **DONE (2026-10-20)** |
| **Step 3** | Deploy `gothwad-accounts-db` on Cloudflare Dashboard (`docs/SETUP.md` — 10 min!) | 🔜 Owner Action |
| **Step 4** | Migrate `GothwadTech/mail` & `GothwadTech/store` Workers to Cloudflare D1 | 📋 Planned |
| **Step 5** | Connect `GothwadTech/grixchat` to `"Sign in with Gothwad"` SSO + D1/Durable Objects | 📋 Planned |
