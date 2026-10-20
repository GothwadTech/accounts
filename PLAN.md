# 🗺️ PLAN.md — Gothwad Hybrid Cloud Master Plan

> **Last updated:** 2026-10-20 (Final Hybrid Architecture Locked)
> Deep technical blueprint & Mail retention math: **[`docs/CLOUDFLARE_NATIVE_PLAN.md`](docs/CLOUDFLARE_NATIVE_PLAN.md)**
> Step-by-step Cloudflare Dashboard setup: **[`docs/SETUP.md`](docs/SETUP.md)**

---

## 🏗️ FINAL ECOSYSTEM ARCHITECTURE (HYBRID FREE-TIER POWERHOUSE)

| Zone | Apps | Backend Stack | Why |
|------|------|---------------|-----|
| **🟠 Zone A: Cloudflare Native (Zero Supabase!)** | **1. `Gothwad Accounts`** (`accounts.*`)<br>**2. `Gothwad Mail`** (`mail.*`) | **Cloudflare Pages + Workers + D1 SQLite** (`gothwad-accounts-db` & `gothwad-mail-db`) | `24×7` Zero Sleep (logins & inbound emails never pause!), `<15ms` speed, Unlimited MAU (`$0`), saves **both** free Supabase projects! |
| **🟢 Zone B: Supabase Powerhouse (Kept Forever!)** | **`PlusTube`** · **`Indogram`** · **`GrixChat`** *(+ heavy media apps)* | **Supabase PostgreSQL + Realtime WebSockets + Free Storage** *(authenticated via Gothwad SSO!)* | Full Postgres power for heavy feeds/search, live WebSockets for chat, and card-free media buckets! |

---

## 📊 ROADMAP STATUS

| Phase | Milestone | Status |
|-------|-----------|--------|
| **Step 1** | Gothwad Accounts UI (`/signin`, `/signup`, `/me`) + Google-style Light/Dark Dashboard | ✅ DONE |
| **Step 2** | OAuth 2.0 + S256 PKCE Provider (`"Sign in with Gothwad"`) + Subdomain Cookie SSO | ✅ DONE |
| **Step 2.5** | **`Gothwad Accounts` 100% Cloudflare D1 Native Upgrade (Zero Supabase, 62/62 Tests Passing)** | ✅ **DONE (2026-10-20)** |
| **Step 3** | Connect `gothwad-accounts-db` on Cloudflare Dashboard (`docs/SETUP.md`) | 🔜 Owner Action |
| **Step 4** | **`Gothwad Mail` (`GothwadTech/mail`) 100% Cloudflare D1 Migration + `500`-Email Smart Retention & User Settings Toggle** | 🔜 Next Repo Session |
| **Step 5** | Connect `PlusTube`, `Indogram`, `GrixChat` (on Supabase) seamlessly with `"Sign in with Gothwad"` SSO | 📋 Planned |
