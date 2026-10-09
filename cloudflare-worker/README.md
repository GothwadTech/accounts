# Cloudflare Worker Deployment Guide (Gothwad Unified Auth)

## 📌 Asaan Bhasha Me Deploy Kaise Karein (Step-by-Step)

### Step 1: Cloudflare Account & Node.js
1. Apne computer me terminal ya command prompt kholein.
2. Check karein ki Node.js installed hai (`node -v`).

### Step 2: Wrangler CLI Install Karein
```bash
npm install -g wrangler
```

### Step 3: Cloudflare Me Login Karein
```bash
npx wrangler login
```
Ek browser window open hogi, wahan **Allow** par click karein.

### Step 4: Environment Variables Set Karein
Is folder me aakar secrets configure karein:
```bash
# Apne Supabase Project ke API Keys daalein:
npx wrangler secret put SUPABASE_ANON_KEY
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

### Step 5: Worker Deploy Karein!
```bash
npx wrangler deploy
```
Aapka worker 5 seconds me live ho jayega aur ek URL milega (e.g. `https://gothwad-unified-auth.your-subdomain.workers.dev`).

### Step 6: Custom Domain Attach Karein (`accounts.gothwadtech.com`)
1. Cloudflare Dashboard me jayein.
2. **Workers & Pages** -> **gothwad-unified-auth** select karein.
3. **Settings** -> **Domains & Routes** -> **Add Custom Domain** par click karein.
4. Type karein: `accounts.gothwadtech.com`.
5. Cloudflare automatically SSL certificate issue kar dega!
