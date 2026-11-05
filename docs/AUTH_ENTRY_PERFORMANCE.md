# Sign In / Create New entry performance

## UI-only changes — 2026-11-05

The two tabs still use ordinary `/signin` and `/signup` navigation. Authentication,
redirect intent, account selection, session checks, cookie contracts and backend
handlers are unchanged. No client router, session cache or runtime framework was
introduced to make navigation appear faster.

The old entry pages requested an external Google Fonts stylesheet, which could
block first rendering when that host was slow. Every page visit also replayed a
300ms fade and downloaded a graph of individual browser modules.

Changes:
- Entry pages now use system fonts with zero external font requests.
- Removed the form-wide fade/translate animation; normal button feedback remains.
- `tools/bundle-auth.mjs` bundles the original modular sources at build time using
  pinned esbuild (development dependency only). Browser code has no new dependency.
- Each screen loads one content-hashed entry and preloads the same shared module,
  reducing the observed Create New JavaScript resource count from 13 to 2.
- Both entries plus the common module occupy about 29 KB combined uncompressed;
  each screen's entry plus shared code is capped by tests at 40 KB raw / 15 KB gzip.
- The local preview may cache only content-hashed static entry bundles immutably.
  HTML and API responses retain their existing cache policies. Production Pages'
  revalidation policy and security headers are unchanged.

## Google callback cache isolation

The Google chooser now uses the same content-hashed build, rather than loading
`/signin/google/google.js` at a stable URL. Its standalone bundle does not add
shared chunks or requests to the native entry pages. Callback success, error and popup
reauthentication documents use `?ui=accounts-v2`, avoiding the pre-chooser HTML
cache/history key. This does not change the registered Google callback URI.
Google callback HTML and the legacy source path have explicit `no-store` headers;
Google API fetches also bypass browser caches. A fresh legacy source on old HTML
refreshes once, preserving query flags and HttpOnly proofs; if the deployment is
still outdated it shows an update message instead of looping or signing in.
Publish matching Pages/Worker builds. Hashing cannot replace an actual frontend
release or repair arbitrary cache rules/proxies that ignore origin headers.

## Editing and deployment

Edit the existing source modules under `web/signin/js`, `web/signup/js` and shared
`web/js` and `web/signin/google`, not generated files under `web/assets/auth`. Small `entry.js` wrappers
combine each screen with its existing Google-button initializer. Run:

```sh
npm run build
```

The build writes hash-named assets and updates the matching entry/preload references
in all three entry HTML files. Keep generated assets with the HTML when publishing; they
are intentionally small and versioned together. Old generated outputs are removed
from this dedicated directory only. Existing CSS link/cascade order is preserved.

`npm run dev` and `npm start` build before serving. A running preview does not watch
source JavaScript: run the build after later JS edits, then refresh. CSS edits remain
served directly. No production credentials are needed for these build operations.

## Verification and measurement limits

`npm test` includes entry size, font dependency, animation, native navigation and
session-check regressions. Optional `tools/test-auth-entry-browser.mjs` exercises
mobile tab switching, native signup, Google-first-step placement, Back and MFA UI.
The existing synthetic-provider browser tool verifies Google onboarding and fresh
Google reauthentication still work with bundled entry code.

A controlled local Chromium check at 390px, with 100ms simulated network latency,
200 KB/s download throughput and an intentionally stalled external font stylesheet,
observed Create New DOMContentLoaded at about 2.13s before and 1.21s after, with
13 → 2 JS resources and 1 → 0 font CSS requests. These are individual diagnostic
runs, **not production benchmarks or a latency guarantee**. Real navigation still
needs the next HTML response; hosting, network and browser conditions can vary.
