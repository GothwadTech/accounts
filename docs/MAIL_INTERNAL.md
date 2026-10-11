# 📧 MAIL_INTERNAL.md — Mail → Accounts Internal Lookup

> Gothwad Mail uses its **OWN Supabase project**. It does **NOT** read the Accounts database (`public.profiles`) directly.
> Accounts remains the source of truth for usernames. Mail needs to know whether `someone@gothwadtech.com` is a real Accounts user, so it keeps inbound mail only for real users.

Accounts exposes a small internal endpoint for Mail's Worker to call.

---

## ⚠️ Naming — pehle yeh padho (2026-10-11 update)

Teen alag-alag naam hain, inhe **mix mat karo**:

| Kya | Naam | Kahan |
|-----|------|-------|
| Mail ka **Cloudflare Worker** (dashboard) | **`mail`** | `GothwadTech/mail` repo ka `worker/wrangler.toml` → `name = "mail"` |
| Accounts ka OAuth **`client_id`** (app id) | **`gothwad-mail`** | Accounts `ecosystem_apps` table + `web/js/gothwad-apps.js` |
| Mail ke `/api/health` JSON ka `service` field | `gothwad-mail-api` | Sirf **cosmetic label** hai, Worker ka naam **nahi** |

- Worker ka naam **`gothwad-mail-api` NAHI hai** — woh purani `wrangler.toml` ki galti thi (fix: `GothwadTech/mail` PR #7).
- Worker **rename mat karo**: `mail` ke andar secrets (`ACCOUNTS_INTERNAL_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`), route `mail.gothwadtech.com/api/*`, aur Email Routing catch-all — sab usi par hain.
- `client_id` **`gothwad-mail`** waisa hi rehta hai (OAuth rows + Mail repo ke docs isi ka use karte hain) — yeh Worker ke naam se alag cheez hai.
- `gothwad-mail-api` string sirf ek label ke roop mein `/api/health` JSON aur uske examples mein bachi hai. Agar kabhi confusion ho: **file (repo config) ko fix karo, dashboard ko nahi.**

---

## Endpoint

**Method and path:** `GET /api/internal/usernames/:username`

- Worker strips `/api` prefix, so internally the route is `/internal/usernames/:username`.
- Full URL in production (recommended route `accounts.gothwadtech.com/api/*`):
  - `https://accounts.gothwadtech.com/api/internal/usernames/:username`
- **Recommended for Worker-to-Worker calls (same zone):** custom domain `api.gothwadtech.com`
  - `https://api.gothwadtech.com/api/internal/usernames/:username`
  - A Worker Route (`accounts.gothwadtech.com/api/*`) cannot be fetched by another Worker in the same zone.

**Input:** `:username` from path.

- Normalised with `trim()` + `toLowerCase()` — usernames are stored lowercase.
- Validated **before** any DB query. Allowed regex: `^[a-z0-9][a-z0-9._-]{0,63}$`
- If format invalid → `400 {"error":"bad_username"}` with no DB query.

**DB check:** `public.profiles` where `username = <normalised>` — one cheap `select id` via service_role.

---

## Auth (required)

- Header: `Authorization: Bearer <token>`
- Secret name: `MAIL_INTERNAL_TOKEN`
- Source: `env.MAIL_INTERNAL_TOKEN` (Cloudflare Worker secret)
- Set via:
  ```bash
  npx wrangler secret put MAIL_INTERNAL_TOKEN
  # or Cloudflare Dashboard → Accounts Worker → Settings → Variables and Secrets → Add (Type: Secret)
  ```
- Missing or wrong token → `401 {"error":"unauthorized"}` — does not reveal whether username exists.
- Comparison is constant-time (SHA-256 digests compared with timing-safe loop).
- Never hardcode, never commit, never log the secret.
- Placeholder in `.dev.vars.example`: `MAIL_INTERNAL_TOKEN=REPLACE_ME`
- **Mail side ka naam alag hai, value same:** Mail apne Worker mein isi token ko secret
  **`ACCOUNTS_INTERNAL_TOKEN`** ke naam se padhta hai (dekho `GothwadTech/mail` →
  `worker/src/config.ts`). Ek hi random value, do env names — dono jagah same honi chahiye,
  warna Mail ko `401 unauthorized` milega.

---

## Response

- Success: `200` with:
  - `Content-Type: application/json`
  - `Cache-Control: no-store`
  - Body exactly `{"exists": true}` or `{"exists": false}`
- Returns **NOTHING else**: no name, no email, no id, no profile fields.
- **No CORS headers** — server-to-server only, browser must not be able to call it.
- No cookies set, no session followed/created, cookies ignored.

Error shapes:
- `400 {"error":"bad_username"}` — invalid format
- `401 {"error":"unauthorized"}` — missing/wrong token
- `405 {"error":"method_not_allowed"}` — non-GET
- `500 {"error":"server_not_configured"}` — secret not set in env
- `500 {"error":"internal_error"}` — DB failure

---

## Logging and Safety

- Do not log usernames at normal volume. Logs only status codes and `exists` boolean.
- Handler is cheap: one DB query + short JSON response.
- No polling, cron, or background sync — request-driven only.
- Free tier only.

---

## Usage from Mail Worker

Mail Worker (`GothwadTech/mail` repo, deployed Worker name **`mail`** — Cloudflare Email Routing → same Worker's `email()` handler) does:

```ts
// env.AUTH_HUB_URL       = https://api.gothwadtech.com   (server-to-server host — no trailing slash)
// env.ACCOUNTS_INTERNAL_TOKEN = same value as Accounts' MAIL_INTERNAL_TOKEN

const username = localPart.toLowerCase().trim(); // from `someone@gothwadtech.com`
const res = await fetch(`${AUTH_HUB_URL}/api/internal/usernames/${encodeURIComponent(username)}`, {
  headers: { Authorization: `Bearer ${ACCOUNTS_INTERNAL_TOKEN}` },
});
if (!res.ok) {
  // 401 → misconfigured token, log error, maybe reject mail
  // 400 → invalid username format, drop
  // 500 → transient, maybe retry or drop
}
const { exists } = await res.json() as { exists: boolean };
if (!exists) {
  // drop mail, do not store
}
```

**`AUTH_HUB_URL` ka rule (yeh bug already ek baar ho chuka hai):**

- Server-to-server (Mail Worker → Accounts Worker) base = **`https://api.gothwadtech.com`** —
  Accounts Worker ka Custom Domain. **`accounts.gothwadtech.com/api` mat use karo.**
- Kyun: same zone mein ek Worker ki `fetch()` dusre Worker ko uska **Route**
  (`accounts.gothwadtech.com/api/*`) use karke call nahi kar sakti — request Pages origin
  par jaati hai aur `200 text/html` lauta deti hai. Isi wajah se Mail ne pehle
  `503 accounts_unexpected_response` dikhaya tha (fix: `GothwadTech/mail` PR #5).
- Browser-facing links (sign-in redirect) ke liye Mail ek **alag** var rakhta hai:
  `AUTH_SIGNIN_URL = https://accounts.gothwadtech.com`. Dono ko mix mat karo.
- Dono bases **without trailing slash** rakho; Mail code khud bhi trailing slash strip karta hai.

---

## Manual Checks (replace placeholders with real values; never paste real token into repo or chat)

Usi host se check karo jo Mail actually use karta hai — Accounts Worker ka Custom Domain.
(`accounts.gothwadtech.com/api` bhi laptop/browser se chalta hai, lekin woh route hai —
Worker-to-Worker calls ke liye `api.` host hi sahi hai.)

```bash
BASE=https://api.gothwadtech.com/api
TOKEN=your-secret-here

# No token → 401
curl -i $BASE/internal/usernames/alice
# → 401 {"error":"unauthorized"}

# Wrong token → 401
curl -i -H "Authorization: Bearer wrong" $BASE/internal/usernames/alice
# → 401

# Good token, existing username → {"exists": true}
curl -i -H "Authorization: Bearer $TOKEN" $BASE/internal/usernames/pawan
# → 200 {"exists": true}

# Good token, unknown username → {"exists": false}
curl -i -H "Authorization: Bearer $TOKEN" $BASE/internal/usernames/thisuserdoesnotexist123
# → 200 {"exists": false}

# Good token, invalid format (e.g. -bad) → 400
curl -i -H "Authorization: Bearer $TOKEN" $BASE/internal/usernames/-bad
# → 400 {"error":"bad_username"}

# Upper-case input (e.g. ALICE) → same result as lowercase
curl -i -H "Authorization: Bearer $TOKEN" $BASE/internal/usernames/ALICE
# → 200 (same as alice)

# Check headers
curl -i -H "Authorization: Bearer $TOKEN" $BASE/internal/usernames/alice
# → Content-Type: application/json
# → Cache-Control: no-store
# → No Access-Control-Allow-Origin
# → No Set-Cookie
```

---

## Why this exists (supersedes old plan)

Old plan in `docs/MAIL_BOOTSTRAP_PROMPT.md` said Mail would use **same Supabase project as Accounts** and read `public.profiles` directly. That plan is **superseded**.

New plan (2026-10-11):

- Mail uses its **OWN** Supabase project.
- Mail **does NOT** read Accounts DB.
- Mail calls this internal endpoint to validate recipient usernames.
- Accounts stays source of truth.

If you see docs saying Mail reads Accounts DB, update them — Mail does not do that anymore.
