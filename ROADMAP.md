# 🚀 Gothwad Account: Unified SSO & Ecosystem Auth System
### Complete Master Roadmap & Beginner-Friendly Architecture Guide

> **📌 NOTE (2026-10):** Yeh original vision doc hai (historical reference).
> **Ab active plan [`PLAN.md`](PLAN.md) hai** — Steps 1-2 (Accounts + OAuth)
> already built hain. Live status: [`TASK.md`](TASK.md) · AI guide: [`AGENTS.md`](AGENTS.md)

> **Founder Note & Vision:**  
> "Main (Pawan / Gothwad Tech) ek aisi digital identity banana chahta hoon jaisa Google ka `accounts.google.com` hota hai. Isme user ek baar **Gothwad Account** banayega aur uska custom email `username@gothwadtech.com` banega. Is ek account se wo hamare saare apps login kar sakega:
> - 📧 **Gothwad Mail**
> - 🌐 **Gothwad Browser**
> - 🎥 **Gothwad Tube**
> - 📝 **Gothwad Notes**
> - 💼 **Gothwad Manager**
> - ☁️ **Gothwad Drive**
> 
> Chuki mujhe itni deep technical knowledge nahi hai, is roadmap me har ek cheez **basic se, aaram se, step-by-step detail me** samjhayi gayi hai taaki bina kisi confusion ke production-level par build aur deploy kiya ja sake."

---

## 📌 1. Basic Concepts (Sabse Pehle Asaan Bhasha Me Samjho)

### 1.1 Unified Auth / Single Sign-On (SSO) Kya Hota Hai?
* **Problem bina SSO ke:** Agar aapke 6 alag-alag apps hain (Mail, Tube, Drive, etc.), to user ko har app me alag-alag register karna padega aur alag-alag password yaad rakhna padega.
* **Solution (Unified Auth / SSO):** Ek **Master Identity Hub** hota hai — `accounts.gothwadtech.com`. 
  - User sirf yahan ek baar login ya sign up karega.
  - Jaise hi login ho jayega, browser me ek shared master security token (Cookie) store ho jata hai jo poore domain `*.gothwadtech.com` ke liye valid hota hai.
  - Ab jab user `mail.gothwadtech.com` ya `drive.gothwadtech.com` open karega, to app automatically dekh lega: *"Acha, Gothwad Account pe to user pehle se logged in hai!"* Aur bina password maange 1 second me user ka dashboard open kar dega.

### 1.2 Google Account (`accounts.google.com`) Kaise Kaam Karta Hai?
1. Aap browser me `youtube.com` ya `gmail.com` kholte ho.
2. Agar aap logged-in nahi ho, to wo aapko redirect karta hai:  
   `https://accounts.google.com/signin?continue=https://mail.google.com`
3. Aap wahan apna email aur password daalte ho.
4. Google verify karke ek secure HTTP-only Cookie set karta hai jo `.google.com` (wildcard) par lagti hai.
5. Fir aapko wapas Gmail ya YouTube par bhej diya jata hai with a temporary authorization code.
6. Gmail us code ko verify karke aapka inbox show kar deta hai.

### 1.3 Cloudflare Workers vs Cloudflare Pages (Aapne Workers Kyun Chuna?)
* **Cloudflare Pages:** Yeh static websites (HTML, CSS, React frontend) ko host karne ke liye accha hai.
* **Cloudflare Workers:** Yeh **Edge Computing (Serverless Backend)** hai. 
  - Poori duniya me Cloudflare ke 300+ data centers hain.
  - Jab koi India se login karega, to uska request kisi US server pe nahi jayega, balki Delhi ya Mumbai ke Cloudflare edge node par kuch hi milliseconds me process hoga.
  - Workers me zero cold-start hota hai, ye fast hota hai, aur ye custom HTTP headers, cookies, token signing, aur security rules ko directly control kar sakta hai.
  - Isliye **Unified Auth Hub ke liye Cloudflare Workers best choice hai!**

### 1.4 Supabase Auth + Database Kyun?
* Supabase open-source Firebase alternative hai jo **PostgreSQL** database par chalta hai.
* Yeh aapko:
  - User passwords ko highest-level encryption (Argon2 / bcrypt) ke sath safely store karta hai.
  - Secure JWT (JSON Web Tokens) generate karta hai.
  - Row Level Security (RLS) deta hai jisse koi ek user dusre user ka data na dekh sake.
  - SQL triggers deta hai jisse jab bhi naya account bane, automatically uska `@gothwadtech.com` email aur storage quota create ho sake.

---

## 🏛️ 2. High-Level Architecture (Poora System Kaise Connect Hoga)

```
                            [ USER BROWSER ]
                                   │
              ┌────────────────────┴────────────────────┐
              │                                         │
              ▼                                         ▼
   [ Sub-App: Gothwad Mail ]                [ Sub-App: Gothwad Drive ]
    (mail.gothwadtech.com)                    (drive.gothwadtech.com)
              │                                         │
              └───────────────┐         ┌───────────────┘
                              │         │
                 Redirect: "Login Chahiye?"
                              │         │
                              ▼         ▼
                 ┌─────────────────────────────┐
                 │    ACCOUNTS.GOTHWADTECH.COM │
                 │      (Frontend Auth Hub)    │
                 └──────────────┬──────────────┘
                                │
                      Fetch API Requests
                                │
                                ▼
                 ┌─────────────────────────────┐
                 │     CLOUDFLARE WORKER       │
                 │   (auth-api.gothwadtech.com)│
                 │  - Validates Cookies        │
                 │  - Signs OAuth JWTs         │
                 │  - Handles SSO Redirects    │
                 │  - Rate Limiting & Security │
                 └──────────────┬──────────────┘
                                │
                    Secure REST / GraphQL
                                │
                                ▼
                 ┌─────────────────────────────┐
                 │      SUPABASE BACKEND       │
                 │  - auth.users (Credentials) │
                 │  - public.profiles          │
                 │  - public.ecosystem_apps    │
                 │  - public.user_sessions     │
                 │  - PostgreSQL RLS           │
                 └─────────────────────────────┘
```

---

## 📧 3. Custom Email System (`username@gothwadtech.com`) Kaise Kaam Karega?

Google me jaise `pwngtwd@gmail.com` hota hai, aap chahte ho ki aapke users ka address `username@gothwadtech.com` bane.

### Email ke 4 Main Pillars (Basic Detail):
1. **MX Record (Mail Exchange):** DNS me batata hai ki jab koi `pawan@gothwadtech.com` par email bheje, to wo email kahan deliver ho.
2. **SPF (Sender Policy Framework):** Ek TXT record jo Gmail aur Yahoo ko batata hai ki kaunsa server aapke domain se email bhej sakta hai (taaki koi fake email na bhej sake).
3. **DKIM (DomainKeys Identified Mail):** Har email ke sath ek digital signature attach hoti hai jisse email spam folder me nahi jaati.
4. **DMARC:** Extra security policy.

### Setup Strategy for Gothwad Mail:
* **Option A (Cloudflare Email Routing - Free & Built-in):**
  - Cloudflare Dashboard me direct "Email Routing" on karo.
  - Koi bhi `pawan@gothwadtech.com` par email karega to Cloudflare Worker usko catch kar lega aur aapke Gothwad Mail Database me save kar dega!
* **Option B (Resend / Mailgun API for Sending Emails):**
  - Jab Gothwad Mail se kisi bahar wale ko (jaise kisi @gmail.com wale ko) email send karna ho, tab Cloudflare Worker Resend/Mailgun API ko call karke email bhej deta hai.

---

## 🗺️ 4. Step-by-Step Implementation Roadmap (Phases)

### 📌 Phase 1: Supabase Database Setup & Schema
1. Supabase pe free account banayein (`supabase.com`).
2. Naya project banayein: `gothwad-auth`.
3. SQL Editor me ja kar neeche diya gaya schema run karein (isme `profiles`, `ecosystem_apps`, `user_sessions`, and `oauth_tokens` tables hain).
4. Auto-profile trigger setup karein taaki user sign up hote hi uska `@gothwadtech.com` handle automatically register ho jaye.

### 📌 Phase 2: Cloudflare Worker Backend Build
1. Cloudflare account me ja kar Workers & Pages open karein.
2. Wrangler CLI install karein: `npm install -g wrangler`.
3. Worker me ye main API routes banayein:
   - `POST /api/auth/signup` → Naya Gothwad user create karna (`username@gothwadtech.com`).
   - `POST /api/auth/signin` → Password check + Session Cookie issue karna.
   - `GET /api/auth/verify-session` → Check karna ki kya user logged in hai.
   - `POST /api/auth/logout` → Session invalidate karna across all apps.
   - `GET /api/oauth/authorize` → Sub-apps (Mail, Tube, Drive) ke liye Single Sign-On code generate karna.
   - `POST /api/oauth/token` → Code exchange karke JWT token dena.
4. Worker ko deploy karein: `npx wrangler deploy`.
5. Custom domain add karein Cloudflare me: `accounts.gothwadtech.com`.

### 📌 Phase 3: Frontend Hub (`accounts.gothwadtech.com`)
1. Google Account jaisa pixel-perfect, clean, modern UI:
   - Step 1: Username / Email enter screen (auto-completes `@gothwadtech.com`).
   - Step 2: Password screen with "Forgot password?" link.
   - Step 3: Optional 2-Factor Authentication (OTP / Passkey prompt).
2. Sign Up Wizard:
   - First Name & Last Name.
   - Custom username picker with **Live Availability Check** (e.g. `pwngtwd@gothwadtech.com`).
   - Password confirmation + Strength bar.
   - Recovery email/phone.
3. My Account Dashboard (`myaccount.gothwadtech.com`):
   - Personal Info edit (Name, profile photo, recovery contact).
   - Security panel (Active devices list, remote sign-out button, 2FA toggle).
   - Connected Gothwad Apps (Gothwad Mail, Drive, Tube, Notes, Manager, Browser) - kis app ke paas kya permissions hain.
   - 9-Dot Google-style Waffle App Launcher menu.

### 📌 Phase 4: Sub-App Integration (Mail, Drive, Tube, Notes, etc.)
1. Har sub-app me ek chhota lightweight SDK / Hook add karna:
   ```typescript
   // Example in Gothwad Mail / Gothwad Drive:
   import { checkGothwadSession, redirectToLogin } from '@gothwad/auth-client';
   
   const session = await checkGothwadSession();
   if (!session) {
     redirectToLogin({ returnUrl: window.location.href });
   }
   ```
2. User ko seamless experience milega: ek app me login kiya, sabhi 6 apps me bina password login ho gaya!

### 📌 Phase 5: Production Domain, DNS & Email Routing
1. Cloudflare Dashboard me domain `gothwadtech.com` configure karein.
2. Sub-domains DNS A/CNAME records:
   - `accounts.gothwadtech.com` → Worker / Pages
   - `mail.gothwadtech.com` → Gothwad Mail App
   - `drive.gothwadtech.com` → Gothwad Drive App
   - `tube.gothwadtech.com` → Gothwad Tube App
3. Cloudflare Email Routing activate karein for `@gothwadtech.com`.

### 📌 Phase 6: Security Hardening (Google-Level Protection)
1. Cloudflare Turnstile CAPTCHA (invisible bot protection without annoying puzzles).
2. Rate Limiting (1 IP se 1 minute me max 5 failed password attempts allow karna).
3. Secure Cookies: `HttpOnly; Secure; SameSite=Lax; Domain=.gothwadtech.com`.
4. Audit Logs (kab aur kahan se login hua - IP address, browser type, timestamp).

---

## 🛠️ 5. Ready-To-Use Supabase SQL Script (Phase 1)

Neeche diya gaya SQL script seedhe apne Supabase SQL Editor me paste karke **Run** kar sakte hain:

```sql
-- 1. Create Profiles Table (Linked to Supabase Auth)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  gothwad_email TEXT UNIQUE NOT NULL, -- e.g. username@gothwadtech.com
  recovery_email TEXT,
  phone_number TEXT,
  avatar_url TEXT,
  two_factor_enabled BOOLEAN DEFAULT FALSE,
  storage_used_bytes BIGINT DEFAULT 0,
  storage_limit_bytes BIGINT DEFAULT 16106127360, -- 15 GB free default (like Google)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create Ecosystem Apps Registry
CREATE TABLE IF NOT EXISTS public.ecosystem_apps (
  id TEXT PRIMARY KEY, -- e.g. 'gothwad-mail', 'gothwad-drive', 'gothwad-tube'
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  redirect_uris TEXT[] NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default Gothwad Suite Apps
INSERT INTO public.ecosystem_apps (id, name, description, icon, redirect_uris)
VALUES 
  ('gothwad-mail', 'Gothwad Mail', 'Fast, secure inbox with @gothwadtech.com address', 'mail', ARRAY['https://mail.gothwadtech.com/auth/callback']),
  ('gothwad-drive', 'Gothwad Drive', 'Cloud storage, file sync & documents', 'hard-drive', ARRAY['https://drive.gothwadtech.com/auth/callback']),
  ('gothwad-tube', 'Gothwad Tube', 'Video sharing and creator platform', 'play-square', ARRAY['https://tube.gothwadtech.com/auth/callback']),
  ('gothwad-notes', 'Gothwad Notes', 'Sync notes, checklists & voice memos', 'file-text', ARRAY['https://notes.gothwadtech.com/auth/callback']),
  ('gothwad-manager', 'Gothwad Manager', 'Business management, CRM & workspace tools', 'briefcase', ARRAY['https://manager.gothwadtech.com/auth/callback']),
  ('gothwad-browser', 'Gothwad Browser', 'Private web browser synchronized across devices', 'compass', ARRAY['https://browser.gothwadtech.com/auth/callback'])
ON CONFLICT (id) DO NOTHING;

-- 3. Create Active User Sessions (for device management & remote logout)
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  device_name TEXT NOT NULL,
  browser TEXT NOT NULL,
  ip_address TEXT,
  location TEXT,
  last_active TIMESTAMPTZ DEFAULT NOW(),
  is_current BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ecosystem_apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- Profiles: Users can only read/edit their own profile
CREATE POLICY "Users can view own profile" 
ON public.profiles FOR SELECT 
USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" 
ON public.profiles FOR UPDATE 
USING (auth.uid() = id);

-- Ecosystem apps can be read by any authenticated user
CREATE POLICY "Anyone can view ecosystem apps" 
ON public.ecosystem_apps FOR SELECT 
TO authenticated 
USING (true);

-- Sessions: Users can manage their own active sessions
CREATE POLICY "Users manage own sessions" 
ON public.user_sessions FOR ALL 
USING (auth.uid() = user_id);
```

---

## ⚡ 6. Cloudflare Worker Code (Production Script)

Aapke project ke `/cloudflare-worker/` folder me complete production worker files include ki gayi hain:
1. `wrangler.toml`: Cloudflare Worker configuration, routes, environment variables.
2. `src/index.ts`: Worker router jo handles karta hai:
   - Cross-domain wildcard cookies (`domain=.gothwadtech.com`)
   - Supabase JWT token verification
   - SSO OAuth 2.0 flow
   - Active device sessions tracking
   - Username availability checking endpoint (`/api/check-username?username=pawan`)

---

## 💡 7. Founder Cheatsheet (Quick Q&A)

* **Q: Kya main baad me apna domain `gothwadtech.com` change kar sakta hoon?**  
  *Ans:* Haan bilkul! Sabhi configurations me domain ek environment variable (`ROOT_DOMAIN`) ke roop me set hota hai. Agar aap kal ko koi dusra domain lena chahein, to bas ek jagah change karne se poora system naye domain pe shift ho jayega.

* **Q: Cloudflare Worker free tier pe chalega ya paise lagenge?**  
  *Ans:* Cloudflare Worker free tier me **1,00,000 requests per day** deta hai jo shuruat ke liye bilkul free aur kaafi hai. Supabase bhi free tier me 50,000 monthly active users aur 500 MB database free deta hai. Zero cost me live ho sakta hai!

* **Q: Gothwad Mail me email aayegi kahan?**  
  *Ans:* Cloudflare Email Routing se incoming emails free me aapke backend worker pe JSON format me aati hain. Worker usko database me store karega aur aapke Gothwad Mail frontend me show karega.

---

## 🎨 8. Gothwad Logo & "Sign in with Gothwad" SDK

Aapke upload kiye gaye official brand icons poore system me set ho chuke hain:
- `favicon.ico`: Browser tab icon ke liye
- `icon-192.png` & `icon-512.png`: PWA, Mobile home screen, aur Auth header ke liye
- `apple-touch-icon.png`: Apple iOS devices ke liye
- `manifest.json`: Web application manifest configuration

### Sub-Apps me "Sign in with Gothwad" Button Lagane Ka Tarika (Google Jaisa):
Koi bhi app ya website pe ye button lagakar Gothwad Account se login karwaya ja sakta hai:
```html
<button class="gothwad-btn" onclick="loginWithGothwad()">
  <img src="https://accounts.gothwadtech.com/icon-192.png" width="20" height="20" />
  <span>Sign in with Gothwad</span>
</button>

<script>
function loginWithGothwad() {
  window.location.href = "https://accounts.gothwadtech.com/oauth/authorize?client_id=YOUR_APP_ID&redirect_uri=YOUR_CALLBACK";
}
</script>
```

---
*Roadmap Version 1.1 - Gothwad Tech Architecture*
