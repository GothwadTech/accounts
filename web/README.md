# 🌐 web/ — Gothwad Accounts Modular Frontend

Static Vanilla HTML + Modular CSS + Native ES Modules (zero framework overhead). Cloudflare Pages serves `web/` directly alongside `web/_headers` (`Cache-Control: public, max-age=0, must-revalidate` so HTML/JS/CSS stay 100% version-synced on reload).

```text
web/
├── _headers                     Cloudflare Pages ETag revalidation headers (`must-revalidate`)
├── index.html                   → /         Session-aware root splash (/me or /signin)
├── signin/index.html            → /signin   Multi-account chooser + sign-in + recovery
├── signup/index.html            → /signup   4-step account creation
├── me/index.html                → /me       Account dashboard + inline module error/watchdog guard
├── privacy/index.html           → /privacy  Privacy Policy
├── terms/index.html             → /terms    Terms of Service
│
├── css/                         Modular dashboard design system (`<= 500` lines per file!)
│   ├── variables.css            Light + Dark design tokens
│   ├── base.css                 Reset, typography, app bar, avatar popover, toast, spinner
│   ├── components.css           Buttons, Material fields, cards, chips, modals
│   ├── auth.css                 Google-style auth cards & steps
│   ├── dashboard.css            `/me` shell, sidebar nav, section rows & lists
│   ├── legal.css                Legal shell, sidebar TOC & callouts
│   ├── legal-content.css        Privacy/Terms typography, responsive rules & animations
│   ├── root.css                 Root splash styles
│   └── legacy/                  🔒 Frozen dark-theme auth/legal stylesheets (7 modules, exact cascade)
│       ├── variables.css · base.css · components.css · auth.css
│       └── dashboard.css · legal-layout.css · legal-content.css
│
├── js/                          Shared ES modules (`config.js`, `api.js`, `accounts.js`, `common.js`, `theme.js`)
├── me/js/                       Dashboard entry (`me.js`), modals (`dialogs.js` + `dialogs-security.js`), `tabs/*`
├── signin/js/                   Sign-in entry (`signin.js`) + `modules/*`
└── signup/js/                   Sign-up entry (`signup.js`) + `modules/*`
```

## Mandatory Frontend Rules (`AGENTS.md`)
- **Rule #8 (`<= 500` lines/file):** Keep every HTML, CSS, and JS file `<= 500` lines (`500–800` max). Split large files into clean ES/CSS modules without changing visuals or behavior.
- **Verify Exports & Cascade (`npm run build && npm test`):** Never remove or rename an exported JS function without checking all `import { ... }` callers across `web/**` (`tests/frontend-and-filesize.test.mjs` enforces this automatically).
- **Zero Client Storage Tokens:** Never store session/OAuth tokens in `localStorage` or `sessionStorage` (only `gothwad-theme` is permitted).
