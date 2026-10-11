# 📧 MAIL_INTERNAL.md — Mail → Accounts Internal Lookup

> Gothwad Mail uses its **OWN Supabase project**. It does **NOT** read the Accounts database (`public.profiles`) directly.
> Accounts remains the source of truth for usernames. Mail needs to know whether `someone@gothwadtech.com` is a real Accounts user, so it keeps inbound mail only for real users.

Accounts exposes a small internal endpoint for Mail's Worker to call.

---

## Endpoint

**Method and path:** `GET /api/internal/usernames/:username`

- Worker strips `/api` prefix, so internally the route is `/internal/usernames/:username`.
- Full URL in production (recommended route `accounts.gothwadtech.com/api/*`):
  - `https://accounts.gothwadtech.com/api/internal/usernames/:username`
- Alternative if custom domain `api.gothwadtech.com` is used:
  - `https://api.gothwadtech.com/internal/usernames/:username`

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

Mail Worker (Cloudflare Email Routing → Email Worker) does:

```ts
// env.AUTH_HUB_URL = https://accounts.gothwadtech.com/api  (or https://accounts.gothwadtech.com/api is base, see below)
// env.MAIL_INTERNAL_TOKEN = same secret as Accounts Worker

const username = localPart.toLowerCase().trim(); // from `someone@gothwadtech.com`
const res = await fetch(`${AUTH_HUB_URL}/internal/usernames/${encodeURIComponent(username)}`, {
  headers: { Authorization: `Bearer ${MAIL_INTERNAL_TOKEN}` },
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

Note: `AUTH_HUB_URL` in Mail should be the Accounts API base URL **without** trailing slash, e.g. `https://accounts.gothwadtech.com/api`.

---

## Manual Checks (replace placeholders with real values; never paste real token into repo or chat)

```bash
BASE=https://accounts.gothwadtech.com/api
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
