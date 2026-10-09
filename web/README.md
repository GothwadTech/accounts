# 🌐 web/ — Gothwad Accounts Frontend

Static HTML/CSS/JS (no build step, no framework). Cloudflare Pages serves
this folder directly. **Site ke sirf 3 routes hain** (pretty URLs = folders):

```
web/
├── signin/index.html    → /signin   Login + forgot-password + reset-password
├── signup/index.html    → /signup   Create account (live username check)
├── me/index.html        → /me       Account dashboard (4 tabs)
├── index.html           → /         Smart redirect (/me ya /signin)
│
├── css/styles.css       Design system — CSS variables (dark + brand blue #2f80ed)
├── js/
│   ├── config.js        ⚙️ THE 1 FILE to edit: API_URL + APP_DOMAIN (Rule #1)
│   ├── api.js           fetch wrapper (credentials: include, JSON, errors)
│   ├── common.js        session (getSession/requireAuth/signOut), toasts,
│   │                    topbar, formatBytes/formatDate, passwordStrength
│   ├── signin.js        /signin logic (3 modes: login / forgot / reset)
│   ├── signup.js        /signup logic (live check + strength meter)
│   └── me.js            /me logic (profile, password, devices, connected apps)
│
├── icon-192.png etc.    🔵 REAL brand icons (blue snowflake) — mat hatao!
├── favicon.ico
└── manifest.json        PWA manifest (theme #2f80ed)
```

## Rules (AGENTS.md se)
- **Naya route/page mat banao** bina user ke kehne (3 routes fixed hain)
- Colors sirf CSS variables se — inline colors mat likho
- User input ko kabhi direct HTML mein mat dalo — `escapeHtml()` use karo
- Absolute paths (`/js/...`, `/css/...`) — relative nahi

## Local dev
`node tools/dev-server.js` → http://localhost:3000 (repo root se)

## Design tokens (quick reference)
| Token | Value | Use |
|-------|-------|-----|
| `--bg` | `#0d1117` | page background |
| `--bg-panel` | `#161b22` | cards |
| `--accent` | `#2f80ed` | buttons, links (brand blue) |
| `--text` | `#e6edf3` | main text |
| `--font` | Inter / system-ui | everywhere |
