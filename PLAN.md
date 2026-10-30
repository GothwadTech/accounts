# 🗺️ PLAN.md — Gothwad Hybrid Cloud Master Plan

> **Last updated:** 2026-10-20 (Final Hybrid Architecture Locked)
> Deep technical blueprint & Mail retention math: **[`docs/CLOUDFLARE_NATIVE_PLAN.md`](docs/CLOUDFLARE_NATIVE_PLAN.md)**
> Step-by-step Cloudflare Dashboard setup: **[`docs/SETUP.md`](docs/SETUP.md)**

---

## 🏗️ FINAL ECOSYSTEM ARCHITECTURE (HYBRID FREE-TIER POWERHOUSE)

| Zone | Apps | Backend Stack | Why |
|------|------|---------------|-----|
| **🟠 Zone A: Cloudflare Native (Zero Supabase!)** | **1. `Gothwad Accounts`** (`accounts.*`)<br>**2. `Gothwad Mail`** (`mail.*`) | **Cloudflare Pages + Workers + D1 SQLite** (D1 DBs: `accounts` & `mail`) | `24×7` Zero Sleep (logins & inbound emails never pause!), `<15ms` speed, Unlimited MAU (`$0`), saves **both** free Supabase projects! |
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


## Session startup follow-up — 2026-10-24

Accounts startup now has a prepared root-routing and request-waterfall fix.
Review and deploy both Pages and Worker, then measure production startup rather
than promising a fixed latency. Mail optional metadata and Store account-content
hydration must be decoupled from identity readiness in their own repositories.
See [the performance audit](docs/SESSION_STARTUP_PERFORMANCE.md).


## Accounts security hardening — 2026-10-29

Phases 0–4 coding and Phase 5 local release/operational preparation are complete.
Implemented: persistent throttling/CSP, verified recovery and sensitive changes,
optional authenticator MFA/recovery codes, user-verified passkeys, exact origins,
authenticated headerless transport, cookie-only browser session responses, and
live grant/password-bound OAuth revocation. Parent-domain SSO cookies remain
intentional; a host-only transition needs separate cross-app coordination.

Verification: **194 tests**, build, strict Worker types, dry-run, production audits,
real local workerd/D1 ES256/RS256/OAuth flows, Chromium virtual-passkey UI, and
synthetic SQLite restore checks. No production deployment or configuration occurred.
Real email, consumer/device pilots, backup recovery, live headers/rules/quotas, and
production release remain owner-only gates, not completed coding claims.

See [A–F findings](docs/ACCOUNTS_SECURITY_HARDENING.md),
[release/incident readiness](docs/SECURITY_RELEASE_READINESS.md), and the single
[final owner checklist](docs/SECURITY_OWNER_CHECKLIST.md). No paid infrastructure,
Supabase application edits, or automatic release are authorized.

### Sending-domain follow-up — 2026-10-30

The owner selected `noreply.gothwadtech.com`. RESEND_FROM is now maintained in
Wrangler configuration as `Gothwad Accounts <security@noreply.gothwadtech.com>`.
Provider DNS verification, the private sending API key, reviewed deployment, and
actual delivery verification remain pending; no dashboard-only sender edit is needed.

Worker deployment follow-up: verify production branch/root/commands and the actual
failed build log independently of Pages. See [the troubleshooting guide](docs/WORKER_BUILD_TROUBLESHOOTING.md); merging alone does not confirm API rollout.
