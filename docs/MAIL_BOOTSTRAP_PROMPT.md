# Copy-paste prompt — Gothwad Mail repo (new Arena chat)

> Is file ka **poora neeche wala block** naya chat mein paste karo.  
> Woh chat **Mail repo** se connect honi chahiye (Accounts nahi).  
> Secrets/API keys is prompt mein mat daalna.

> **⚠️ UPDATE 2026-10-11 — This file's old plan is SUPERSEDED.**
> Mail now uses its **OWN Supabase project** and does **NOT** read Accounts DB.
> Inbound validation is via Accounts internal endpoint `GET /api/internal/usernames/:username`
> (Bearer `MAIL_INTERNAL_TOKEN`). See `docs/MAIL_INTERNAL.md` in Accounts repo.
> The section below still says "Same Supabase project as Accounts" — that line is outdated.
> New Mail prompt should mention own Supabase + internal lookup.

---

## PROMPT START (yahan se copy)

You are a coding agent on Arena.ai working in the **Gothwad Mail** Git repo (Vite + React + TSX webmail UI, currently mostly **demo/fake data**).

You are **NOT** in the Accounts repo. Do not try to edit GothwadTech/accounts. Mail is a **separate product** on **mail.gothwadtech.com**: own frontend (Cloudflare Pages) + own Cloudflare Worker(s). Accounts is only the identity hub.

Talk simple **English / Hinglish**. Comment “why”, not only “what”. After every session update `TASK.md` (create if missing). Never delete `AGENTS.md` once you create it.

### Who / brand
- Company: Gothwad Tech. Consumer: GOTHWAD.
- Domain: `gothwadtech.com` (future `gothwad.in` — **never hardcode** domain in logic; use env `APP_DOMAIN`, `AUTH_HUB_URL`, `MAIL_URL`).
- Founder: Pawan. Team beginners. **Zero paid budget** — free tiers only.

### Goal of THIS repo
Turn the existing **webmail UI** into a real app:

1. **Remove all demo/mock inbox/sent/contacts data.** Empty states when DB empty.
2. **Auth = Gothwad Accounts** (SSO). User already has `username@gothwadtech.com` as a **derived** email (DB stores **username only**, no email column).
3. **Backend in THIS repo:** Cloudflare Worker(s) — REST for list/read/send/star/trash + **Email Worker** for inbound.
4. **OWN Supabase project (NEW PLAN 2026-10-11 — supersedes old shared DB plan):** Mail uses its OWN Supabase project (user will paste URL + keys in wrangler secrets / `.env.example` placeholders only — **never commit real keys**, never echo secrets in chat). Accounts data stays in Accounts Supabase. For inbound mail validation, Mail calls Accounts internal endpoint `GET /api/internal/usernames/:username` with `Authorization: Bearer MAIL_INTERNAL_TOKEN` → `{"exists": bool}`. See Accounts `docs/MAIL_INTERNAL.md`.
5. **Outbound mail: Resend** (free 3000/month). From: `{username}@{APP_DOMAIN}`.
6. **Inbound: Cloudflare Email Routing** catch-all `*@gothwadtech.com` → Email Worker → `mail_messages` (in Mail's OWN Supabase) after validating username via Accounts internal lookup.
7. Write living docs: `AGENTS.md`, `PLAN.md`, `TASK.md`, `docs/SETUP.md`, `docs/MAIL.md`. Update TASK every session.

### What Gothwad Accounts already has (DO NOT rebuild)
Live: `https://accounts.gothwadtech.com`

**Pages:** only `/signin`, `/signup`, `/me`. Root redirects.

**API** (Worker, prefix `/api` on accounts host):

- Auth cookies (HttpOnly, `Domain=.gothwadtech.com`): `gothwad_at`, `gothwad_rt`, `gothwad_sid`
- Hybrid: cookies + tokens in JSON for iframe
- `GET /api/auth/me` — `{ authenticated, user }`  
  user: `id, username, email` (derived `username@APP_DOMAIN`), `first_name`, `last_name`, …
- `POST /api/auth/signin`, signup, signout, refresh, check-identifier, check-username
- OAuth 2.0 + PKCE S256:
  - `GET /api/oauth/authorize`
  - `POST /api/oauth/token`
  - `GET /api/oauth/userinfo` (Bearer)
  - `POST /api/oauth/decision`
- `client_id` for this app: **`gothwad-mail`**
- Gothwad Mail is a **core Gothwad Service**: always connected, user **cannot revoke** in Accounts. Still use OAuth/session so Mail knows **who** the user is.
- Multi-account: max 15 Gothwad Accounts per browser (Accounts UI). Mail should use **current** cookie session; if `me` 401 → redirect to Accounts signin with `next=` back to Mail.

**Authorize example:**
```
https://accounts.gothwadtech.com/api/oauth/authorize
  ?client_id=gothwad-mail
  &redirect_uri=https://mail.gothwadtech.com/auth/callback
  &response_type=code
  &scope=profile%20email%20offline_access
  &state=...
  &code_challenge=...
  &code_challenge_method=S256
```

Token:
```
POST https://accounts.gothwadtech.com/api/oauth/token
JSON: grant_type=authorization_code, code, redirect_uri, client_id=gothwad-mail, code_verifier
```

Userinfo:
```
GET https://accounts.gothwadtech.com/api/oauth/userinfo
Authorization: Bearer ACCESS_TOKEN
```
→ `sub`, `preferred_username`, `email` (`user@gothwadtech.com`), `name`

**SSO shortcut (same site cookies):** Mail frontend `fetch(AUTH_HUB + '/api/auth/me', { credentials: 'include' })`. If `authenticated`, skip full OAuth for first-party Mail. If not, redirect:
`https://accounts.gothwadtech.com/signin?choose=1&next=` + encodeURIComponent(current Mail URL or authorize URL).

Public SPA: PKCE required. No client_secret in frontend.

**Accounts SQL the human must run** (you cannot access Accounts repo). Put in `docs/SETUP.md`:
```sql
UPDATE public.ecosystem_apps
SET redirect_uris = ARRAY[
  'https://mail.gothwadtech.com/auth/callback',
  'http://localhost:5173/auth/callback'
]
WHERE id = 'gothwad-mail';
```
If row missing, INSERT id `gothwad-mail`, name `Gothwad Mail`.

### Architecture you MUST implement

```
IN:
  someone → pawan@gothwadtech.com
  → Cloudflare Email Routing (MX)
  → Email Worker email(message, env)
  → parse to/from/subject/text/html
  → insert mail_messages (to_username = local-part)
  → skip/huge attachments (Supabase 500MB total DB)

OUT:
  UI compose → POST /api/mail/send (session)
  → Resend API from username@APP_DOMAIN
  → save folder='sent'
  → soft rate limit (free 3000/month — show remaining if possible)

READ:
  UI → Worker GET /api/mail/messages?folder=inbox|sent|trash
  GET /api/mail/messages/:id
  POST star / read / trash
  RLS: user only own rows (to_username = JWT username OR user_id)
  Email Worker uses SERVICE ROLE insert only
```

**Supabase service key:** new keys `sb_secret_...` are NOT JWTs. Send as `apikey` header only — do **not** put them in `Authorization: Bearer` or Supabase returns Invalid API key. Legacy `eyJ...` service_role can use both.

### Schema (create `supabase/mail.sql`, human runs in SQL editor)

Suggested:

```sql
CREATE TABLE IF NOT EXISTS public.mail_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  to_username TEXT NOT NULL,
  from_email TEXT NOT NULL,
  from_name TEXT,
  to_email TEXT,
  subject TEXT,
  body_html TEXT,
  body_text TEXT,
  attachments JSONB NOT NULL DEFAULT '[]',
  folder TEXT NOT NULL DEFAULT 'inbox' CHECK (folder IN ('inbox','sent','drafts','trash')),
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  is_starred BOOLEAN NOT NULL DEFAULT FALSE,
  provider_id TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS mail_messages_user_folder ON public.mail_messages (to_username, folder, received_at DESC);
ALTER TABLE public.mail_messages ENABLE ROW LEVEL SECURITY;
-- policies: authenticated users select/update own rows via username from profiles
-- service_role bypasses RLS for Email Worker inserts
```

Do not store passwords. Do not log secrets.

### UI rules (existing React app)
- Keep the visual design. Replace mocks with API hooks.
- Folders: Inbox, Sent, Drafts, Trash, Starred if UI has them.
- Compose: to, subject, body; send via Worker not Resend from browser (Resend key **only on Worker**).
- Show Gothwad email as `{username}@{APP_DOMAIN}` from session, not a fake gmail.
- Loading / empty / error states. No fake names like “John Demo”.
- Auth gate on every private route.
- `credentials: 'include'` for Mail Worker if cookies; or Bearer from OAuth storage.
- Dev: Vite proxy `/api` → local wrangler to avoid CORS pain. Production: Worker route `mail.gothwadtech.com/api/*`.

### Worker layout in THIS repo
- `worker/` or `cloudflare-worker/` — `fetch` for HTTP API
- same project or second wrangler for `email()` handler (Cloudflare Email Workers)
- wrangler.toml `[vars]` public: APP_DOMAIN, AUTH_HUB_URL, MAIL_URL, SUPABASE_URL
- secrets: SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, JWT if any
- CORS: `https://mail.gothwadtech.com`, `http://localhost:5173`, AUTH hub origin
- DEV_MODE for extra errors, never dump keys

### Free-tier
- Workers 100K req/day — no polling loops; optional Supabase Realtime later
- Resend 3000/month — per-user daily cap (e.g. 20–50) + UI message
- Attachments: tiny only (e.g. < 200KB total JSON); otherwise skip with note
- No paid services suggestions

### Docs to create immediately
1. `AGENTS.md` — this mission, don’t mix Accounts code here
2. `PLAN.md` — Mail steps: schema → inbound worker → send API → strip demo UI → DNS/Resend verify → deploy Pages+Worker
3. `TASK.md` — status board + work log every session
4. `docs/SETUP.md` — Cloudflare Pages, Worker routes, Email Routing catch-all, Resend domain verify, SQL to run, env list (names only)
5. `docs/MAIL.md` — API routes table

### Execution order (do in order, tick TASK.md)
1. Explore repo: how demo data is injected; routing; auth if any.
2. Add AGENTS/PLAN/TASK/docs stubs.
3. `supabase/mail.sql`
4. Worker: health + session resolve:
   - Prefer Accounts `GET {AUTH_HUB_URL}/api/auth/me` with forwarded cookies **or**
   - Verify OAuth access_token via `{AUTH_HUB_URL}/api/oauth/userinfo`
5. CRUD message APIs against Supabase (empty list OK).
6. Wire React: delete mock arrays/modules; use APIs.
7. `POST /api/mail/send` + Resend (works when secret set; without secret return clear 503).
8. Email Worker inbound parser + insert.
9. Auth UX: unauthenticated → Accounts signin `next=`.
10. `.env.example` + wrangler example **without real keys**.

### Do NOT
- Merge this app into Accounts
- Call Resend or Supabase **directly from the browser** with service/Resend keys
- Invent Accounts endpoints
- Hardcode `gothwadtech.com` in more than default env fallback
- Leave demo mail threads in production build
- Ask the user for passwords or to paste live secret keys in chat — tell them `wrangler secret put` / dashboard only

### First reply in that chat
- Confirm you are in the Mail repo (list package.json, src structure)
- Summarize what is demo vs real
- Start step 1–4 unless blocked
- If Accounts callback SQL isn’t run, still build Mail; document the SQL for the human

## PROMPT END
