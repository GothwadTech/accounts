# 🚀 Master Prompt for `GothwadTech/mail` — Universal Google-Style Account Switcher & Seamless Auto-SSO

You are an autonomous Principal Full-Stack & Frontend Architect working inside **`GothwadTech/mail`**.

Communicate with founder **Pawan** in **clear, friendly Hinglish (simple Hindi + English)**.

---

## ⚠️ 0. CRITICAL MANDATE — DO NOT BLINDLY TRUST THIS PROMPT! AUDIT & BUILD WHAT IS BEST!

1. **Zero Blind Trust (`Andha Bharosa Bilkul Mat Karna`):**
   - Treat this document as an engineering brief — **NOT blind dogma**. Before editing a single line, **inspect EVERY relevant live file yourself** in:
     1. **`GothwadTech/mail`** (`src/components/Header.tsx`, `src/components/AccountSheet.tsx`, `src/context/MailContext.tsx`, `src/context/useAccountsSwitcher.ts`, `src/hooks/useSession.ts`, `src/services/mailApi.ts`, `src/services/authRedirect.ts`, `src/services/authuser.ts`, `worker/src/*`, `worker/test/*`, and all `.md` docs).
     2. **Live `GothwadTech/accounts` (`main` branch)** (`gh api` / `git clone --depth=1`): specifically **`web/widget/account-menu.js`**, **`web/widget/account-menu-styles.js`**, **`cloudflare-worker/src/http.ts`**, and **`cloudflare-worker/src/browser-slots.ts`** so you see the exact live `window.GothwadAccountMenu` API, options, CSS variables, and CORS headers!
2. **Engineering Autonomy (`Khudka 100% Best Effort Lagana`):**
   - Use your sharpest judgment. If you uncover any subtle edge case (offline/slow network loading of external script, mobile viewport safe areas, keyboard focus restoration, unread count reactivity, dark-mode sync, multi-tab `/u/0..5` URL preservation), **implement the cleanest, fastest, most resilient engineering solution possible**.
3. **Hard Ecosystem Rules (Never Violate):**
   - **Zero Credit Card / Zero R2 / Zero Supabase** (keep existing native Cloudflare D1 `mail` architecture 100% intact).
   - **Domain-agnostic (`APP_DOMAIN` / configured `accountUrl` origin — never hardcode domains in app logic)**.
   - **Zero tokens in `localStorage` or `sessionStorage`** (`.gothwadtech.com` `HttpOnly` cookies only).
   - **Every file in the repository strictly `<= 500` lines.**
   - **Keep all documentation (`README.md`, `TASK.md`, `PLAN.md`, `docs/*`) 100% clean, honest, and up to date.**

---

## 🎯 1. PROBLEM WE ARE SOLVING FOR THE USER

Right now, when a user taps their profile photo across our ecosystem (`Accounts`, `Mail`, `Kiwi Store`, `Kiwi Console`, `Kiwi Admin`), **every app opens a completely different custom menu**!
On Google (`google.com`, `Gmail`, `Keep/Notes`, `Play Store`, `Firebase Console`), tapping the top-right profile avatar opens **THE EXACT SAME CENTRAL GOOGLE ACCOUNT SHEET** everywhere (`OneGoogleBar`), Hosted ONCE by `Accounts`:
- **`https://accounts.<domain>/widget/account-menu.js`** (`window.GothwadAccountMenu`)!

---

## 🛠️ 2. EXACT IMPLEMENTATION GOALS IN `GothwadTech/mail`

1. **Dynamic Central Widget Loader (`src/services/accountWidget.ts`):**
   - Derive `accountsWebOrigin` dynamically from `accountUrl` / session config (never hardcoded `gothwadtech.com`, falling back cleanly in local dev).
   - Dynamically load ES module `${accountsWebOrigin}/widget/account-menu.js` once (`import(/* @vite-ignore */ `${accountsWebOrigin}/widget/account-menu.js`)`), returning `window.GothwadAccountMenu`.
   - **Resilience requirement:** Preload the script quietly right after session boot (`requestIdleCallback` / `setTimeout`) so when the user taps their profile avatar (or presses **`Shift+A`**!), **the sheet opens in `0ms` with ZERO network wait**! Include a tiny clean fallback only if offline so tapping the avatar NEVER fails silently.
2. **Replace Custom `AccountSheet.tsx` UI with Central `GothwadAccountMenu` (`src/components/AccountSheet.tsx` & `src/components/Header.tsx`):**
   - Pass `anchorEl` (the clicked mobile search-bar avatar button OR desktop top-right avatar button so desktop positions the floating `396px` Google popover right beneath the avatar, while mobile opens the full-screen Google sheet!).
   - Pass all live Mail data & zero-reload hooks directly into `GothwadAccountMenu.open(state, opts)`:
     - `user`: `{ username: currentUser.username, name: currentUser.name, firstName: ..., lastName: ..., email: currentUser.email, avatarUrl: currentUser.avatarUrl }`
     - `accounts`: full `accounts` array (preserving every slot's **real `avatarUrl`** photo!)
     - `activeId`: `activeAccountId`
     - `authuser`: current `authuser` index (`0..5`)
     - `theme`: current Mail `'light' | 'dark'` theme so switching Light/Dark mode matches 100%!
     - `badges`: `accountUnread` (`Record<string, number>`) so unread email pills (`3`, `99+`) continue showing cleanly next to secondary accounts!
     - `accountHref`: `(acct) => `/u/${acct.authuser}/`` so `Ctrl+Click` / `Cmd+Click` / `Middle-Click` opens that account's mailbox in a new browser tab!
     - `nextUrl`: `window.location.href` (so `+ Add another account` returns straight back to Mail after login!)
     - `manageAccountHref`: `${accountsWebOrigin}/u/${authuser}/me`
     - `onSwitchAccount`: `(target) => switchAccount(target.id)` — preserves Mail's draft auto-save before switching AND `< 16ms` zero-reload mailbox cache switch!
     - `onSignOutAccount`: `(slotId) => signOutAccount(slotId)` — preserves per-slot cache purge & automatic promotion of remaining signed-in account!
     - `onSignOutAll`: signs out all accounts cleanly and redirects to sign-in.
   - Keep Mail's **Settings** (`⚙️`) and **Theme Toggle** (`☀️/🌙`) accessible right in `Header.tsx` / `MobileDrawer.tsx` (and/or via clean `extraActions` passed to `GothwadAccountMenu.open` if helpful on mobile where header space is compact — verify both mobile & desktop layouts!).
3. **Verify Auto-SSO Sign-In Flow:**
   - Ensure Mail NEVER shows any third-party `"Sign in with..."` consent screen — unauthenticated visitors redirect cleanly to `${accountsWebOrigin}/signin?next=${encodeURIComponent(window.location.href)}`, and authenticated `.gothwadtech.com` browser sessions load the inbox automatically with zero clicks!

---

## 🧪 3. VERIFICATION & CLEAN DOCS CHECKLIST

1. Run existing + new tests (`npm test` / Worker + UI build `npm run build`) and verify **100% pass with zero TypeScript errors**.
2. Verify **every code, test, and `.md` file is strictly `<= 500` lines**.
3. Update **`TASK.md`**, **`README.md`**, and architecture/handover docs cleanly so everything reflects the live Universal Account Widget integration accurately.
