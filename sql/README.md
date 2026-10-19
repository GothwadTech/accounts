# 🗄️ sql/ — Gothwad Accounts Database (Numbered SQL Files)

Yeh folder **Gothwad Accounts** ka poora database hai — tables, security,
triggers, storage bucket, sab kuch. Files **number wise** hain, sequence mein
run karni hain.

---

## ⚠️ SABSE PEHLE YEH PADHO — Kaunsa Supabase Project?

Gothwad ecosystem mein **har app ka APNA alag Supabase project/database hai**:

| App | Supabase Project | Yeh SQL chalao? |
|-----|------------------|-----------------|
| **Gothwad Accounts** | Accounts wala project | ✅ **HAAN — sirf yahin** |
| GrixChat | GrixChat ka apna alag project | ❌ NAHI |
| Indogram | Indogram ka apna alag project | ❌ NAHI |
| Gothwad Mail | Mail ka apna alag project | ❌ NAHI |
| Gothwad Store / Android Store | Store ka apna alag project | ❌ NAHI — OAuth registration bhi **Accounts** mein hoti hai |

**Is folder ki SQL files SIRF "Gothwad Accounts" wale Supabase project mein
chalani hain.** GrixChat / Indogram / Gothwad Mail ke databases mein mat
chalana — unke apne projects mein unki apni SQL hoti hai, aur yahan ki tables
wahan exist hi nahi karti (aur karna chahiye bhi nahi).

**Kaise pata karein ki sahi project khola hai?** Supabase Dashboard ke top par
project ka naam dekho (jaise "accounts", "gothwad-accounts" waghera). Connection
string / Project Settings → Database mein bhi project ka reference dikhta hai.
Agar doubt ho to `public.profiles` table Test/SQL Editor mein check karo —
Accounts project mein yeh table milti hai.

---

## 📁 Files (is order mein run karo)

| # | File | Kya karta hai | Lines (approx) |
|---|------|---------------|----------------|
| 1 | `01_core_schema.sql` | Core tables + RLS + triggers + helpers + seed apps | ~470 |
| 2 | `02_account_activity.sql` | "Recent activity" log (Google-style security feed) | ~120 |
| 3 | `03_avatars_storage.sql` | Profile photo bucket (Supabase Storage) | ~90 |


---

## ▶️ Kaise Run Karein (Supabase SQL Editor)

1. Supabase Dashboard kholo → apna **Gothwad Accounts** project select karo
2. Left menu → **SQL Editor**
3. `01_core_schema.sql` ka **poora content** copy-paste karo → **Run** dabao
4. Phir `02_account_activity.sql` → Run
5. Phir `03_avatars_storage.sql` → Run


Verify kaise karein: **Table Editor** mein jaao — `profiles`,
`user_sessions`, `ecosystem_apps`, `app_authorizations`, `oauth_auth_codes`,
`oauth_refresh_tokens`, `account_activity` tables dikhni chahiye.

---

## 🔁 DOBARA RUN KARNE PAR ERROR NAHI AAYEGA (Idempotent)

Har file **idempotent** banai gayi hai — matlab:

- **First time** run → sab kuch fresh ban jata hai. ✅
- **Dobara** run (database pehle se bani ho) → **koi error nahi**, kuch duplicate
  nahi banega. Jo cheezein update hui hon (naye columns, naye policies) wo
  smooth update ho jayengi. ✅

Yeh isliye possible hai kyunki har jagah yeh patterns use hue hain:

| Kaam | Idempotent Pattern |
|------|--------------------|
| Table | `CREATE TABLE IF NOT EXISTS` |
| Column | `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` |
| Index | `CREATE INDEX IF NOT EXISTS` |
| Policy (RLS) | `DROP POLICY IF EXISTS ... ; CREATE POLICY ...` |
| Trigger | `DROP TRIGGER IF EXISTS ... ; CREATE TRIGGER ...` |
| Function | `CREATE OR REPLACE FUNCTION` |
| Seed data | `INSERT ... ON CONFLICT (id) DO UPDATE/NOTHING` |

**Isliye jab bye hum (ya koi AI agent) naya column/feature add kare, toh SQL
yahan hi numbered file mein aisi likho ki dobara run par bhi error na aaye.**

---

## 🧠 Design Rules (jo database follow karti hai)

1. **Username-only (Rule #2):** `profiles` mein sirf `username` store hota hai.
   Email KABHI database mein nahi — `username@APP_DOMAIN` API layer par
   calculate hota hai. Isliye domain badalne par database mein kuch nahi badalna
   padta.
2. **RLS ON everywhere:** har table par Row Level Security hai. User sirf apna
   data dekh sakta hai. `oauth_*` + `account_activity` par write policy hi nahi
   hai — sirf Worker (service_role) likh sakta hai.
3. **Domain-agnostic:** kahin bhi `gothwadtech.com` hardcoded nahi hai.
   `ecosystem_apps.redirect_uris` deploy ke waqt UPDATE se bhari jaati hain
   (example `docs/OAUTH.md` mein).
4. **Free tier friendly:** purani activity rows limit (100/user) — storage
   bachane ke liye `cleanup_old_activity()` helper bana rakha hai.

---

## ❓ FAQ

**Q: Supabase project banaya hi nahi hai, kaha se banau?**
→ `docs/SETUP.md` ka STEP 1 follow karo (poora deploy guide hai).

**Q: Galti se GrixChat wale project mein chal gayi?**
→ Koi data loss nahi hoga — bas Accounts ke saare tables wahan ban jayenge.
Unhe delete karna ho to Table Editor se manually hata sakte ho. Lekin dhyan
rakho next time! 😅

**Q: Naya column add karna hai profiles mein?**
→ `01_core_schema.sql` mein CREATE TABLE mein column add karo AUR ek
`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` line bhi (purane databases ke liye).
Phir is README ke table mein note kar do.
