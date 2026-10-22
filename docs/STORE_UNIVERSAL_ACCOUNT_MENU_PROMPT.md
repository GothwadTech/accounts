# 🚀 Master Prompt for `GothwadTech/store` — Automatic Silent SSO + Universal Google Account Switcher (Zero `"Sign in with..."` on Web!)

You are an autonomous Principal Full-Stack & Cloudflare Edge Architect working inside **`GothwadTech/store`**.

Communicate with founder **Pawan** in **clear, friendly Hinglish (simple Hindi + English)**.

---

## ⚠️ 0. CRITICAL MANDATE — DO NOT BLINDLY TRUST THIS PROMPT! AUDIT & BUILD WHAT IS BEST!

1. **Zero Blind Trust (`Andha Bharosa Bilkul Mat Karna`):**
   - Treat this document as an engineering starting brief — **NOT blind dogma**. Before changing code, **inspect EVERY relevant file yourself** in:
     1. **`GothwadTech/store`** (`worker/wrangler.toml`, `worker/src/*`, `shared/brand.ts`, `src/lib/auth.ts`, `src/lib/api.ts`, `src/lib/config.ts`, `src/lib/AppContext.tsx`, `src/shared/AccountMenu.tsx`, `src/store/*`, `src/console/*`, `src/admin/*`, `src/landing/*`, tests, and all `.md` files).
     2. **Live `GothwadTech/accounts` (`main` branch)** (`gh api` / `git clone --depth=1`): specifically **`web/widget/account-menu.js`**, **`web/widget/account-menu-styles.js`**, **`cloudflare-worker/src/http.ts`**, and **`cloudflare-worker/src/browser-slots.ts`**.
     3. **Live `GothwadTech/storeapp`** (`StoreApi.kt`, `StoreModels.kt`): confirm Android native app OAuth PKCE + `Authorization: Bearer <token>` routes stay **100% untouched & compatible**!
2. **Engineering Autonomy (`Khudka 100% Best Effort Lagana`):**
   - Think critically! If you discover additional reasons why auto-login failed, edge cases across the 4 web surfaces (`kiwistore`, `kiwiconsole`, `kiwiadmin`, `kiwiapp`), CORS issues, or UX rough edges — **fix all of them cleanly and implement whatever is genuinely best**.
3. **Hard Ecosystem Rules (Never Violate):**
   - **ZERO Credit Card / ZERO R2 / ZERO Supabase / ZERO ImgBB** — keep live Cloudflare D1 (`database_name = "store"`, `database_id = "a3dc3e71-cf89-4e0a-89d1-693fcf6f227a"`) + `store_images` D1 `BLOB` + `caches.default` + `GothwadTech/storefiles` 100% intact!
   - **Domain-agnostic (`shared/brand.ts` / `APP_DOMAIN` — never hardcode domains outside config defaults).**
   - **Zero tokens in `localStorage` or `sessionStorage` on web.**
   - **Every single file across the entire repository strictly `<= 500` lines.**
   - **Keep all docs (`README.md`, `TASK.md`, `HANDOVER.md`, `PLAN.md`, `sql/README.md`) 100% clean, accurate, and up to date.**

---

## 🔥 1. TWO EXACT PRODUCTION PROBLEMS WE ARE SOLVING RIGHT NOW

### Problem #1 — User Had to Click `"Sign in with Gothwad"` Instead of Automatic Silent Login!
On Google (`Play Store`, `Google Play Console`, `Gmail`, `Notes`, `Firebase Console`), if a user is ALREADY signed in on `.google.com`, opening Play Store or Play Console **logs them in AUTOMATICALLY on page load with ZERO clicks**, and if signed out, shows a simple first-party **`Sign in`** button that goes straight to `accounts.<domain>/signin?next=<current_url>` — **NEVER a third-party OAuth consent screen (`"Allow Kiwi Store to access your account"`)!**

**Why `GothwadTech/store` failed to auto-sign-in & showed `"Sign in with..."`:**
1. **`worker/wrangler.toml` Missing Active `routes = [...]` Declaration:**
   - In `worker/wrangler.toml`, the 4 production custom domain `/api/*` routes (`kiwistore.gothwadtech.com/api/*`, `kiwiconsole.gothwadtech.com/api/*`, `kiwiadmin.gothwadtech.com/api/*`, `kiwiapp.gothwadtech.com/api/*`) were only written inside `#` comments! Without `routes = [...]` in `worker/wrangler.toml`, `wrangler deploy` only deploys to `*.workers.dev`, causing `/api/me` on `kiwistore.gothwadtech.com` to hit Cloudflare Pages SPA `index.html` (`200 text/html`), fail JSON parsing silently, and treat every logged-in user as signed out!
   - **Fix in `worker/wrangler.toml`:** Add explicit `routes = [` binding all 4 hosts (`kiwistore.<domain>/api/*`, `kiwiconsole.<domain>/api/*`, `kiwiadmin.<domain>/api/*`, `kiwiapp.<domain>/api/*` with `zone_name = "gothwadtech.com"`) so `wrangler deploy` automatically attaches all 4 routes with ZERO manual Cloudflare Dashboard steps!
2. **Direct First-Party Browser Silent SSO Fallback (`https://api.<domain>/api/auth/me`):**
   - `https://api.<domain>/api/auth/me` (and `https://accounts.<domain>/api/auth/me`) ALREADY allow `credentials: 'include'` + `X-Gothwad-Authuser` CORS requests from **every `https://*.<domain>` subdomain directly from the browser in ~15ms**!
   - Update web session hydration (`src/lib/api.ts` / `src/lib/auth.ts` / `src/lib/AppContext.tsx`) so:
     - Even if `/api/me` is still booting or unreachable, direct browser `fetch(`${AUTH_BASE}/api/auth/me`, { credentials: 'include', headers: authHeaders() })` ** IMMEDIATELY resolves `{ user, activeId, authuser, accounts }` silently on page load across ALL 4 websites (`kiwistore`, `kiwiconsole`, `kiwiadmin`, `kiwiapp`) with ZERO clicks!**
     - `/api/me` still enriches `isAdmin` / `developer` profile cleanly whenever the Store Worker responds.
3. **Remove ALL Web `"Sign in with Gothwad"` OAuth Flows — Use Pure First-Party Sign-In (`Sign in`):**
   - Across **ALL web surfaces** (`StoreApp.tsx`, `ConsoleShell.tsx`, `ConsoleApp.tsx`, `AdminApp.tsx`, `StoreAppLanding.tsx`, `auth.ts`), change button copy from `"Sign in with Gothwad"` to clean Google-style **`Sign in`**, and navigate directly to:
     ```ts
     `${AUTH_SIGNIN_URL}/signin?next=${encodeURIComponent(window.location.href)}`
     ```
     (NO `/oauth/authorize` PKCE dance on web!).
   - Keep `POST /api/auth/exchange` + `Authorization: Bearer <token>` on `worker/src/auth.ts` **100% intact ONLY so Android native `GothwadTech/storeapp` APKs continue working without a single breaking change**!

---

### Problem #2 — Replace Store's Custom Dropdown with the Universal Google-Style Account Drawer!
Right now `src/shared/AccountMenu.tsx` renders a small custom dark box (`w-72 bg-[#262626]`).
Instead, load **`${AUTH_SIGNIN_URL}/widget/account-menu.js`** (`window.GothwadAccountMenu`) dynamically on boot (preloaded so clicking the avatar opens in **`0ms`**!) and update `src/shared/AccountMenu.tsx`:
- When signed out: render a clean pill **`Sign in`** button linking directly to `${AUTH_SIGNIN_URL}/signin?next=${encodeURIComponent(window.location.href)}`.
- When signed in: render the circular profile avatar button (showing real `user.avatarUrl || user.picture` or crisp monogram fallback), and on click invoke **`window.GothwadAccountMenu.open(state, opts)`** passing:
  - `user`, `accounts` (with every slot's real `avatarUrl`!), `activeId: activeSlot`, `authuser`
  - `anchorEl: buttonRef.current` (opens the exact Google floating rounded card on desktop & full-screen sheet on mobile!)
  - `nextUrl: window.location.href`
  - `manageAccountHref: manageAccountUrl(authuser)`
  - `accountHref: (acct) => withAuthuserPrefix(window.location.pathname, acct.authuser) + window.location.search`
  - `onSwitchAccount: (target) => switchAccount({ id: target.id, authuser: target.authuser })` (`< 16ms` zero-reload switch across Store, Console, and Admin — calling `${AUTH_BASE}/api/auth/switch` directly if `/api/auth/switch` isn't reachable!)
  - `onSignOutAccount: (slotId) => signOutSlot(slotId)`
  - `onSignOutAll: () => signOut()`
- Include a tiny safe fallback if offline so the avatar button never fails silently.

---

## 🧪 2. VERIFICATION & DOCUMENTATION CHECKLIST

1. Write/update automated tests covering:
   - `worker/wrangler.toml` defines active `routes` for all 4 domains (`kiwistore`, `kiwiconsole`, `kiwiadmin`, `kiwiapp`) + D1 `store` (`a3dc3e71-cf89-4e0a-89d1-693fcf6f227a`).
   - Direct silent SSO boot (`${AUTH_BASE}/api/auth/me` + `/api/me`), `< 16ms` multi-account switch, per-slot/all sign-out, first-party `Sign in` URL (`${AUTH_SIGNIN_URL}/signin?next=...` — NEVER `/oauth/authorize` on web!), AND preserved Android `Bearer` + `/api/auth/exchange` support!
   - Repo-wide `<= 500` lines check on EVERY file + clean `npm test` & `npm run build`!
2. Maintain clean, accurate documentation across **`README.md`**, **`TASK.md`**, **`HANDOVER.md`**, and **`PLAN.md`** explaining the silent `.gothwadtech.com` SSO + central `account-menu.js` architecture clearly!
