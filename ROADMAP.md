# 🚀 Gothwad Account: Unified SSO & Ecosystem Identity Roadmap

> **📌 Historical Reference Note:** This document captures the founding vision for the unified Gothwad Account identity platform (`accounts.gothwadtech.com`).
> **Live Production Architecture (`v2.4` — 100% Cloudflare Workers + Cloudflare D1 Native, Zero Supabase):** See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`TASK.md`](TASK.md), and [`AGENTS.md`](AGENTS.md).

---

## 🎯 Vision Overview

Build a unified, Google-grade digital identity platform (`accounts.<domain>`) where a user creates a single **Gothwad Account** with a primary `username@<domain>` handle and enjoys instant Single Sign-On (`SSO`), `< 16ms` multi-account switching (`/u/0`..`/u/5`), and a single shared Google-style Account Switcher UI across the entire product suite:

- 📧 **Gothwad Mail** (`mail.<domain>`) — Instant inbox access via shared `.APP_DOMAIN` `HttpOnly` cookies
- 🛍️ **Kiwi Store, Console & Admin** (`kiwistore.<domain>`, `kiwiconsole.<domain>`, `kiwiadmin.<domain>`, plus native Android APK via OAuth 2.0 PKCE)
- 🎥 **Meet**, 📝 **Notes**, 📅 **Calendar**, 👥 **Contacts**, ☁️ **Drive**, and OAuth-connected apps

---

## 🏛️ Core Architecture Pillars Delivered (`v1.0` → `v2.4`)

1. **Master Identity Hub (`web/` + `cloudflare-worker/`):**
   - Multi-step Google-style `/signin` (with browser account chooser) and `/signup` flows with live username availability checks.
   - Full `/me` Account Dashboard (`Home`, `Personal info`, `Security`, `Data & privacy`, `People & sharing`, `Connected apps`, instant search, dark/light theme, full JSON export, and permanent cascade account deletion).
2. **100% Cloudflare-Native Zero-Cost Stack (`Zero Supabase`, `Zero Credit Card`):**
   - Native Cloudflare Workers WebCrypto `PBKDF2-HMAC-SHA256` password hashing (`$0` unlimited MAU) + `HS256` JWT signing.
   - Dedicated Cloudflare D1 SQLite database (`accounts`) with `user_avatars` `BLOB` storage + global Cloudflare Edge Cache (`< 5ms` avatar delivery worldwide).
3. **Google-Grade Multi-Account Session Engine & Universal Switcher (`v2.3` – `v2.4`):**
   - Up to 6 simultaneous signed-in accounts per browser (`gothwad_sess_a`..`f` `HttpOnly` `.APP_DOMAIN` cookies) with `/u/0..5` & `X-Gothwad-Authuser` multi-tab isolation.
   - Central Shadow-DOM `<gothwad-account-menu>` widget (`web/widget/account-menu.js`) shared across `Accounts`, `Mail`, and `Kiwi Store`.
4. **Full OAuth 2.0 + S256 PKCE Provider:**
   - `/oauth/authorize`, `/oauth/token`, `/oauth/userinfo`, and `/oauth/revoke` supporting both first-party native Android apps (`kiwi-store`) and third-party public/confidential clients.
