# Surgical Follow-Up Hotfix Prompt for `GothwadTech/store` (Post-PR #8 Audit)

```text
Work inside `GothwadTech/store` on the current branch from `main` (`e7758e2`).

IMPORTANT ENGINEERING DIRECTIVE:
Do NOT follow this prompt blindly — read the live files and run `npm test` + `npm run build` + `npm run lint` + `npm run test:ui` yourself first to verify every item below, and fix anything else you uncover while keeping every tracked file strictly `<= 500` lines and `100%` pure English (`ZERO` Hindi/Hinglish anywhere in code, UI, comments, SQL, or docs).

### Exact Post-Merge Bugs Verified on `main` (`e7758e2`)

1. **`src/shared/AccountMenu.tsx` (`onSignOutAccount` contract bug — wipes ALL accounts instead of 1 slot!) + `+N` Avatar Badge:**
   - Look at `src/shared/AccountMenu.tsx` around line 148:
     `https://accounts.gothwadtech.com/widget/account-menu.js` calls `onSignOutAccount(slotId, targetAccount)` where the 1st argument `slotId` is a primitive `string` (e.g. `"b"`).
     Currently `AccountMenu.tsx` writes:
     ```ts
     onSignOutAccount: async (acc) => {
       await signOutSlot(acc.id);
     }
     ```
     Because `"b".id` is `undefined`, `signOutSlot(undefined)` calls `authSignOut(undefined)` (`src/lib/auth.ts`), which calls `POST /api/auth/signout` and signs out **ALL** browser accounts instead of slot `"b"`!
   - Fix `onSignOutAccount` in `src/shared/AccountMenu.tsx` to extract the slot ID safely from either `string` or `{ id: string }`:
     ```ts
     onSignOutAccount: async (slotOrAccount: string | { id: string }) => {
       const slotId = typeof slotOrAccount === 'string' ? slotOrAccount : slotOrAccount?.id;
       if (slotId) await signOutSlot(slotId);
     },
     ```
   - Also render a compact Google-style `+N` pill badge (`+{accounts.length - 1}`) on the top-right avatar trigger button in `src/shared/AccountMenu.tsx` whenever `accounts.length > 1` (matching `Gothwad Mail` and `Gothwad Accounts`), AND wire per-slot `Sign out` inside `src/shared/gothwadAccountMenuFallback.ts` so the offline fallback menu also supports single-slot sign-out cleanly.
   - Keep `extraActions` supporting both `{ id, label, href }` AND `onClick: () => { window.location.href = href; }` so navigation works across any cached or fresh version of `account-menu.js`.

2. **Broken `npm ci && npm run build` (`package.json` `"typescript": "^7.0.2"` -> `sh: 1: tsc: not found`):**
   - `package.json` currently specifies `"typescript": "^7.0.2"`, which does NOT provide a `node_modules/.bin/tsc` binary, causing `npm ci && npm run build` (`tsc --noEmit && vite build`) and `npm run lint` to fail with `sh: 1: tsc: not found` (exit code `127`) in clean CI environments.
   - Pin `"typescript": "^5.8.3"` in `package.json` and regenerate `package-lock.json` via `npm install`, then verify a clean `npm ci && npm run lint && npm run build` exits `0` with zero warnings or errors.

3. **Broken Subtest #27 in `tests/filesize-and-integrity.test.mjs` (`41/42` pass, `1` fail):**
   - Running `npm test` currently fails on test #27 (`web auth uses direct first-party /signin?next=, silent Accounts SSO fallback, and Universal Account Menu`) with:
     `ERR_UNSUPPORTED_RESOLVE_REQUEST: Failed to resolve module specifier "react" from "data:text/javascript;base64,..."`
     because `src/lib/auth.ts` imports `getAuthuserFromLocation` from `src/lib/router.ts`, which imports `'react'`, and `tests/helpers/ts.mjs` transforms relative `.ts` modules into `data:text/javascript;base64,...` URLs where CJS `react` cannot be resolved cleanly.
   - Either move pure URL helpers (`getAuthuserFromLocation`, `withAuthuserPrefix`, `stripAuthuserPrefix`, `parsePath`) into a zero-React pure TS module (re-exported by `src/lib/router.ts`) AND/OR fix `tests/helpers/ts.mjs` bare specifier handling so `npm test` passes **`100%` (`0` failures)** after a fresh `npm ci`, and add a unit test explicitly asserting `onSignOutAccount("b")` only signs out slot `"b"` and NEVER hits `/auth/signout`.

### Required Verification Gates Before Finishing
1. `rm -rf node_modules && npm ci`
2. `npm run lint` (`0` errors across web + worker)
3. `npm test` (`100%` passing, `0` failures)
4. `npm run build` (`tsc --noEmit && vite build` clean exit `0`)
5. `npm run test:ui` (`All 8 render cases passed`)
6. `(cd worker && npx wrangler deploy --dry-run)` (`env.DB (store)` + all env vars valid)
7. Update `TASK.md` cleanly and verify `git status` is clean.
```
