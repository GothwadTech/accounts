# 📦 Legacy React Demo (PLACEHOLDER — do not use)

Yeh folder **purana demo** hai jo pehle repo mein tha (React + Vite + Tailwind).
Isme auth **fake** tha (`setTimeout` + mock users) — real authentication nahi.

**Real system ab root folders mein hai:**

- `web/` → real frontend (HTML/CSS/JS)
- `cloudflare-worker/` → real auth API
- `supabase/schema.sql` → real database

Ise sirf reference ke liye rakha hai (UI ideas, SSO simulator, etc.).
Step 2 (OAuth) ke waqt iske `SignInWithGothwadButton` aur `SSOSimulator`
components se ideas le sakte ho.

Agar chalana ho (demo mode):

```bash
cd legacy-react-demo
npm install
npm run dev    # mock auth ke saath — real login nahi hoga
```
