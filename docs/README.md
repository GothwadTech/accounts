# 📚 docs/ — Gothwad Documentation Index

| Doc | Kya hai | Kab padho |
|-----|---------|-----------|
| [SETUP.md](SETUP.md) | Step-by-step deploy guide (Supabase → Worker → Pages → Resend) | Project setup karte waqt |
| [OAUTH.md](OAUTH.md) | "Sign in with Gothwad" — OAuth 2.0 integration (endpoints, scopes, client registration, snippets) | Kisi app ko Gothwad Auth se connect karte waqt |
| [STORE_OAUTH.md](STORE_OAUTH.md) | Android `storeapp` + web `store`: exact callbacks, safe registration SQL, web `/api` URL fix | Store sign-in par redirect error aaye |
| [STORE_WEB_AUTH_FIX_PROMPT.md](STORE_WEB_AUTH_FIX_PROMPT.md) | Copy-paste handoff for Store web/API auth fixes | Store repo AI ko dene ke liye |
| [STOREAPP_AUTH_FIX_PROMPT.md](STOREAPP_AUTH_FIX_PROMPT.md) | Copy-paste handoff for Android callback/refresh/cancel fixes | Storeapp repo AI ko dene ke liye |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Technical deep dive — auth flows, cookies, JWT, DB schema, API table, design system | Code samajhna ho / naya AI |
| [MAIL_INTERNAL.md](MAIL_INTERNAL.md) | **NEW 2026-10-11** — Mail → Accounts internal username existence check (`/api/internal/usernames/:username`, Bearer `MAIL_INTERNAL_TOKEN`) + **naming rules** (Mail Worker = `mail`, not `gothwad-mail-api`; OAuth `client_id` = `gothwad-mail`; server base = `api.gothwadtech.com`) | Mail repo integration, inbound validation, koi bhi Mail naming doubt |
| [MAIL_BOOTSTRAP_PROMPT.md](MAIL_BOOTSTRAP_PROMPT.md) | Mail repo ke liye copy-paste prompt (naming/env updated 2026-10-11) | Naya Mail repo chat start karte waqt |
| [MAIL_SESSION_FIX_PROMPT.md](MAIL_SESSION_FIX_PROMPT.md) | ✅ DONE (PR #4/#5) — session 401/503 debugging reference | Historical / verification |

**Repo-level docs (root mein):**
- [../AGENTS.md](../AGENTS.md) — 🤖 AI working guide (PEHLE YEH)
- [../TASK.md](../TASK.md) — live status + work log
- [../PLAN.md](../PLAN.md) — master plan (Steps 3-6)
- [../README.md](../README.md) — project overview
- [../ROADMAP.md](../ROADMAP.md) — original vision (historical)
