# 📘 GOTHWAD ACCOUNTS — COMPLETE CLOUDFLARE NATIVE SETUP GUIDE (Basics Se Live Tak!)

> **Audience:** Ekdum beginner-friendly step-by-step guide (Hinglish).
> **Cost:** **₹0 / $0 Forever** (100% Cloudflare Free Plan — **NO Supabase needed!**)
> **Phone ya Laptop dono se ho jayega!** Aapko terminal / laptop kholne ki bhi zaroorat nahi — har step seedha **Cloudflare Dashboard + GitHub** se click karke ho jaata hai!

Total time: **~10 se 15 minutes**! ⏱️

---

## 🗺️ Pehle 30 Second Mein Samjho Kya Kahan Chal Raha Hai

```text
User Browser (accounts.gothwadtech.com)
   │
   ├── Pages (/signin, /signup, /me) ──► Cloudflare Pages (`web/` folder)
   │
   └── API (/api/*, /oauth/*) ─────────► Cloudflare Worker (`accounts`)
                                               │
                                               ▼ (1-5ms private binding `env.DB`)
                                         Cloudflare D1 SQLite (`gothwad-accounts-db`)
```

---

## STEP 1: Cloudflare Par Apna D1 Database Banao (2 Minute) 🗄️

1. Apne browser mein **[https://dash.cloudflare.com](https://dash.cloudflare.com)** kholo aur login karo.
2. Left side menu mein **Storage & Databases** (ya **Workers & Pages → D1 SQL Database**) par click karo → **D1 SQL Database** kholo.
3. Blue button **"Create"** (ya **"Create database"**) par click karo.
4. Details bharo:
   - **Database name:** `gothwad-accounts-db`
   - **Location hint (optional):** `Asia Pacific` (APAC — India ke sabse paas fast speed ke liye!)
5. **"Create"** par click kar do! 🎉
6. Jaise hi database khulega, upar right/overview mein aapko ek **Database ID** dikhegi (aisa dikhta hai: `a1b2c3d4-e5f6-7890-abcd-ef1234567890`).
   👉 **Us `Database ID` ko Copy kar lo!**

---

## STEP 2: Apni `Database ID` Ko `wrangler.toml` Mein Paste Karo (1 Minute) 📝

1. Apne GitHub repo (`GothwadTech/accounts`) mein yeh file kholo:
   **`cloudflare-worker/wrangler.toml`**
2. Line number ~25 par yeh block dikhega:
   ```toml
   [[d1_databases]]
   binding = "DB"
   database_name = "gothwad-accounts-db"
   database_id = "00000000-0000-0000-0000-000000000000"
   ```
3. Sirf `"00000000-0000-0000-0000-000000000000"` hata kar **apni Copy ki hui asli `Database ID` paste kar do**, jaise:
   ```toml
   [[d1_databases]]
   binding = "DB"
   database_name = "gothwad-accounts-db"
   database_id = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
   ```
4. **Commit changes** daba do! (Agar Workers Builds connected hai toh Cloudflare apne-aap Worker deploy kar dega!)

---

## STEP 3: Worker Secrets Check / Set Karo (3 Minute) 🔐

> 🧹 **Purani Safai:** Agar aapke `accounts` Worker mein pehle se `SUPABASE_ANON_KEY` ya `SUPABASE_SERVICE_ROLE_KEY` pade hain, unhe **Delete** kar sakte ho — ab unki zero zaroorat hai!

Cloudflare Dashboard → **Workers & Pages** → **`accounts`** Worker kholo → **Settings** tab → **Variables and Secrets** section mein jao:

Check karo ki yeh **Secrets** (`Type: Secret`) set hain:

| Secret Ka Naam | Kya Value Daalni Hai | Zaroori Hai? |
| :--- | :--- | :--- |
| **`JWT_SECRET`** | Koi bhi lambi strong random string (45–64 characters, jaise `gthw_9xK2mP7vQ4nL8rT1wZ5cB3jF6hN0sD8yV2kM4pQ7xR1a`). Ise kahin safe save bhi rakhna. | ✅ **HAAN (100% Required!)** |
| **`MAIL_INTERNAL_TOKEN`** | Wahi exact secret value jo aapne `mail` Worker ke `ACCOUNTS_INTERNAL_TOKEN` mein daali hai (dono jagah same value honi chahiye taaki Mail username verify kar sake). | ✅ **HAAN (Mail ke liye)** |
| **`RESEND_API_KEY`** | Resend (`https://resend.com`) ki API key (`re_...`) — Forgot Password email bhejne ke liye (3,000 emails/month free). | ⭕ Optional (Jab chaho tab add kar sakte ho) |

**Deploy & Routes Ek Nazar Check Kar Lo (Agar pehle se set hain toh chhedna nahi hai!):**
- **Settings → Builds:** Repo `GothwadTech/accounts`, Root directory: `cloudflare-worker`, Deploy command: `npx wrangler deploy`.
- **Settings → Domains & Routes:**
  1. Route: `accounts.gothwadtech.com/api/*` (Browser frontend ke liye)
  2. Custom Domain: `api.gothwadtech.com` (Mail & Store Workers ke server-to-server calls ke liye)
- **Cloudflare Pages Project (`accounts.gothwadtech.com`):** Build output directory = `web` (Static frontend).

---

## STEP 4: Store, Mail & Apps Ke OAuth Callbacks Register Karo (2 Minute) 🔗

> 💡 **Magic Feature:** Tables (`users`, `profiles`, `user_sessions`, `ecosystem_apps`, `user_avatars`...) aapko manually banane ki bhi zaroorat nahi hai — **Worker pehli request par saari tables khud bana deta hai!** (Aap chaho toh `sql/01_core_schema.sql` → `02` → `03` D1 Console mein run bhi kar sakte ho, dono safe hain.)

Pehli baar `https://accounts.gothwadtech.com/api/health` browser mein kholo — aapko yeh dikhega:
```json
{
  "status": "ok",
  "service": "gothwad-auth-api",
  "engine": "cloudflare-d1-native",
  "time": "..."
}
```
Iska matlab **Worker + D1 Database 100% connect ho gaye aur saari 10 tables ready ho gayi hain!** 🎉

Ab bas **ek baar** Cloudflare Dashboard → **Storage & Databases → D1 → `gothwad-accounts-db` → Console** tab kholo, neeche wala SQL copy-paste karo aur **Execute** daba do (isse `Kiwi Store` Web + Android APK, `Mail`, `Meet`, `GrixChat`, aur `Drive` sabke OAuth login callbacks ek saath register ho jayenge!):

```sql
UPDATE ecosystem_apps
SET redirect_uris = json_array(
  'https://kiwistore.gothwadtech.com/auth/callback',
  'https://kiwiconsole.gothwadtech.com/auth/callback',
  'https://kiwiadmin.gothwadtech.com/auth/callback',
  'http://localhost:3000/auth/callback',
  'gothwadstore://oauth/callback',
  'kiwistore://oauth/callback'
)
WHERE id = 'kiwi-store';

UPDATE ecosystem_apps SET redirect_uris = json_array('https://mail.gothwadtech.com/auth/callback') WHERE id = 'gothwad-mail';
UPDATE ecosystem_apps SET redirect_uris = json_array('https://meet.gothwadtech.com/auth/callback') WHERE id = 'gothwad-meet';
UPDATE ecosystem_apps SET redirect_uris = json_array('https://grixchat.gothwadtech.com/auth/callback') WHERE id = 'gothwad-chat';
UPDATE ecosystem_apps SET redirect_uris = json_array('https://drive.gothwadtech.com/auth/callback') WHERE id = 'gothwad-drive';

SELECT id, redirect_uris FROM ecosystem_apps WHERE redirect_uris != '[]';
```

*(Note: Agar kal aap apna domain badlo, toh terminal mein `node tools/generate-store-oauth-sql.mjs` chala kar naye domain ki SQL 1 second mein nikal sakte ho!)*

---

## STEP 5: Final Live Test Checklist (2 Minute) ✅

1. **`https://accounts.gothwadtech.com/signup`** kholo → अपना نیا **Pawan (`pawan`)** Gothwad Account banao!
   - *(Note: Kyunki naya D1 database fresh hai, purane Supabase test accounts yahan nahi honge — apna main username `pawan` sabse pehle claim kar lo!)*
2. Auto-login hokar **`/me` Dashboard** khulega:
   - **Personal info** mein apni **Profile Photo upload** karke page refresh karo — photo seedha Cloudflare Edge se load hogi!
   - **Security → Your devices** check karo — aapka phone/browser दिखेगा!
3. Ab same browser mein **`https://mail.gothwadtech.com`** aur **`https://kiwistore.gothwadtech.com`** khol kar check karo — `.gothwadtech.com` SSO cookie + OAuth PKCE seedha aapke naye Cloudflare D1 account se kaam karega!
4. Ab purane **Accounts Supabase Project** ko chaho toh pause/delete kar do — **Gothwad Accounts ab 100% Independent hai!** 🔥

---

## 💻 Bonus: Laptop / Terminal Par Local Kaise Chalayein?

Local चलाने ke liye ab koi `mock-supabase` server nahi chahiye! Sirf **1 single command**:

```bash
npm install
npm start
# → http://localhost:3000 (/signin · /signup · /me + real SQLite D1!)
```

Aur saare 62 security & integration tests chalane ke liye:
```bash
npm test
```
