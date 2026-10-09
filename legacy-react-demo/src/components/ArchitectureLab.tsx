import React, { useState } from 'react';
import {
  Server,
  Database,
  Cloud,
  Mail,
  Copy,
  Check,
  ShieldCheck,
  Cpu,
  Globe,
  FileCode,
  BookOpen,
  ArrowRight,
  ExternalLink,
} from 'lucide-react';

const SUPABASE_SQL_SNIPPET = `-- 1. Profiles Table for Gothwad Accounts
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  gothwad_email TEXT UNIQUE NOT NULL, -- e.g. username@gothwadtech.com
  recovery_email TEXT,
  phone_number TEXT,
  two_factor_enabled BOOLEAN DEFAULT FALSE,
  storage_used_bytes BIGINT DEFAULT 128450560,
  storage_limit_bytes BIGINT DEFAULT 16106127360, -- 15 GB default
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Registered Ecosystem Apps
CREATE TABLE IF NOT EXISTS public.ecosystem_apps (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  subdomain TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Auto-Provision Profile Trigger
CREATE OR REPLACE FUNCTION public.handle_new_gothwad_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (
    id, first_name, last_name, username, gothwad_email, recovery_email
  )
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'first_name', 'Gothwad'),
    COALESCE(new.raw_user_meta_data->>'last_name', 'User'),
    COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    lower(COALESCE(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))) || '@gothwadtech.com',
    new.raw_user_meta_data->>'recovery_email'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_gothwad_user();`;

const WORKER_CODE_SNIPPET = `export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const rootDomain = env.ROOT_DOMAIN || 'gothwadtech.com';

    // 1. Check Username Availability
    if (url.pathname === '/api/auth/check-username') {
      const username = url.searchParams.get('username')?.toLowerCase();
      const res = await fetch(\`\${env.SUPABASE_URL}/rest/v1/profiles?username=eq.\${username}&select=id\`, {
        headers: { apikey: env.SUPABASE_ANON_KEY }
      });
      const data = await res.json();
      return new Response(JSON.stringify({ available: data.length === 0, full_email: \`\${username}@\${rootDomain}\` }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 2. Sign In & Set Cross-Domain Wildcard Cookie
    if (url.pathname === '/api/auth/signin' && request.method === 'POST') {
      const { identifier, password } = await request.json();
      const email = identifier.includes('@') ? identifier : \`\${identifier}@\${rootDomain}\`;

      const supabaseRes = await fetch(\`\${env.SUPABASE_URL}/auth/v1/token?grant_type=password\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: env.SUPABASE_ANON_KEY },
        body: JSON.stringify({ email, password })
      });
      const authData = await supabaseRes.json();
      if (!supabaseRes.ok) return new Response(JSON.stringify({ error: 'Invalid login' }), { status: 401 });

      const headers = new Headers({ 'Content-Type': 'application/json' });
      // Wildcard cookie shared across mail.gothwadtech.com, drive.gothwadtech.com etc.
      headers.append('Set-Cookie', \`gothwad_session=\${authData.access_token}; Domain=.\${rootDomain}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax\`);

      return new Response(JSON.stringify({ user: authData.user, email }), { headers });
    }

    return new Response('Gothwad Auth Worker Live', { status: 200 });
  }
};`;

export const ArchitectureLab: React.FC = () => {
  const [activeCodeTab, setActiveCodeTab] = useState<'sql' | 'worker' | 'dns' | 'button'>('sql');
  const [copied, setCopied] = useState<string | null>(null);

  const SIGNIN_BUTTON_SNIPPET = `<!-- 1. Include Gothwad Auth SDK Button in any App/Website -->
<button class="gothwad-signin-btn" onclick="signInWithGothwad()">
  <img src="https://accounts.gothwadtech.com/icon-192.png" width="20" height="20" alt="Gothwad Logo" />
  <span>Sign in with Gothwad</span>
</button>

<script>
function signInWithGothwad() {
  const clientId = 'YOUR_APP_ID'; // e.g. gothwad-mail, gothwad-tube
  const redirectUri = encodeURIComponent(window.location.origin + '/auth/callback');
  window.location.href = \`https://accounts.gothwadtech.com/oauth/authorize?client_id=\${clientId}&redirect_uri=\${redirectUri}&response_type=code\`;
}
</script>`;

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2500);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Intro Box in Hindi & English for the Founder */}
      <div className="bg-linear-to-r from-blue-900 to-indigo-900 text-white rounded-3xl p-8 mb-8 shadow-xl">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/30 text-blue-200 text-xs font-semibold mb-3">
            <BookOpen className="w-3.5 h-3.5" />
            <span>Founder Master Guide (Basic Se Aaram Se Detail Me)</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Gothwad Tech Architecture & Production Blueprint
          </h1>
          <p className="text-sm text-blue-100 mt-2 leading-relaxed">
            Pawan bhai, yahan sab kuch basic se detail me samjhaya gaya hai. Aapko koi deep coding
            experience na hone par bhi aap samajh sakte ho ki kaise Cloudflare Workers aur Supabase milkar
            Google jaisa high-speed Single Sign-On (SSO) system banate hain.
          </p>
        </div>
      </div>

      {/* 3 Core Pillars Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <div className="w-12 h-12 rounded-xl bg-orange-100 text-orange-600 flex items-center justify-center mb-4">
            <Cloud className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900">1. Cloudflare Workers</h3>
          <p className="text-xs text-slate-500 mt-2 leading-relaxed">
            <strong>Kyun use kar rahe hain?</strong> Pages sirf static HTML/CSS deta hai, jabki Workers
            poore global edge (Delhi, Mumbai, US) par serverless code chalata hai. Ye 10-20ms me login requests
            process karta hai aur cross-subdomain cookies (<code className="text-blue-600">.gothwadtech.com</code>)
            set karta hai.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4">
            <Database className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900">2. Supabase Backend</h3>
          <p className="text-xs text-slate-500 mt-2 leading-relaxed">
            <strong>Kyun use kar rahe hain?</strong> Ye PostgreSQL database par built hai. Passwords
            ko encrypted format me store karta hai, JWT auth tokens banata hai, aur SQL triggers se har user ko
            automatically 15 GB quota aur <code className="text-blue-600">username@gothwadtech.com</code> assign karta hai.
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
          <div className="w-12 h-12 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center mb-4">
            <Mail className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900">3. Custom Email System</h3>
          <p className="text-xs text-slate-500 mt-2 leading-relaxed">
            <strong>@gothwadtech.com kaise chalega?</strong> Cloudflare Email Routing (Free) se aane
            wali mails Worker ke pass aayengi. Aur bahar bhejne ke liye Resend/Mailgun API use hogi. Sabhi DNS
            records (MX, SPF, DKIM) neeche diye gaye hain.
          </p>
        </div>
      </div>

      {/* Visual Request Flow Diagram */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 mb-8 shadow-xs">
        <h3 className="text-base font-bold text-slate-900 mb-2">Step-by-Step Login / SSO Request Flow</h3>
        <p className="text-xs text-slate-500 mb-6">
          Jab user kisi bhi Gothwad app me login karta hai to background me ye 4 steps hote hain:
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center mb-2">
              1
            </div>
            <h4 className="text-xs font-bold text-slate-900">User visits Sub-App</h4>
            <p className="text-[11px] text-slate-500 mt-1">
              User opens <span className="font-mono text-blue-600">mail.gothwadtech.com</span>. App detects no session and redirects to <span className="font-mono">accounts.gothwadtech.com</span>.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center mb-2">
              2
            </div>
            <h4 className="text-xs font-bold text-slate-900">Cloudflare Worker Checks</h4>
            <p className="text-[11px] text-slate-500 mt-1">
              Worker receives password, verifies hash with Supabase Auth, and generates a signed JWT token.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center mb-2">
              3
            </div>
            <h4 className="text-xs font-bold text-slate-900">Wildcard Cookie Issue</h4>
            <p className="text-[11px] text-slate-500 mt-1">
              Worker sets cookie with <span className="font-mono text-emerald-700">Domain=.gothwadtech.com</span>. This cookie is automatically visible to all subdomains!
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center mb-2">
              4
            </div>
            <h4 className="text-xs font-bold text-slate-900">All 6 Apps Unlocked</h4>
            <p className="text-[11px] text-slate-500 mt-1">
              Mail, Tube, Drive, Notes, Browser, and Manager read the wildcard cookie and let the user in instantly!
            </p>
          </div>
        </div>
      </div>

      {/* Code Snippets & Config Generator */}
      <div className="bg-slate-900 text-slate-100 rounded-2xl border border-slate-800 p-6 shadow-xl mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveCodeTab('sql')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                activeCodeTab === 'sql' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Supabase SQL Schema
            </button>
            <button
              onClick={() => setActiveCodeTab('worker')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                activeCodeTab === 'worker' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              Cloudflare Worker (src/index.ts)
            </button>
            <button
              onClick={() => setActiveCodeTab('dns')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                activeCodeTab === 'dns' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              DNS & Email Configuration
            </button>
            <button
              onClick={() => setActiveCodeTab('button')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                activeCodeTab === 'button' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              "Sign in with Gothwad" Button SDK
            </button>
          </div>

          <button
            onClick={() => {
              const textToCopy =
                activeCodeTab === 'sql'
                  ? SUPABASE_SQL_SNIPPET
                  : activeCodeTab === 'worker'
                  ? WORKER_CODE_SNIPPET
                  : activeCodeTab === 'dns'
                  ? 'MX: mx.cloudflare.net (Priority 10)\nSPF: v=spf1 include:_spf.mx.cloudflare.net ~all'
                  : SIGNIN_BUTTON_SNIPPET;
              handleCopy(textToCopy, activeCodeTab);
            }}
            className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer self-start sm:self-auto"
          >
            {copied === activeCodeTab ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Copied to Clipboard!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Code</span>
              </>
            )}
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          {activeCodeTab === 'sql' && (
            <pre className="text-xs font-mono text-emerald-400 leading-relaxed max-h-[350px] overflow-y-auto">
              {SUPABASE_SQL_SNIPPET}
            </pre>
          )}

          {activeCodeTab === 'worker' && (
            <pre className="text-xs font-mono text-blue-300 leading-relaxed max-h-[350px] overflow-y-auto">
              {WORKER_CODE_SNIPPET}
            </pre>
          )}

          {activeCodeTab === 'button' && (
            <pre className="text-xs font-mono text-amber-300 leading-relaxed max-h-[350px] overflow-y-auto">
              {SIGNIN_BUTTON_SNIPPET}
            </pre>
          )}

          {activeCodeTab === 'dns' && (
            <div className="text-xs font-mono space-y-4 py-2">
              <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700">
                <div className="text-slate-400 mb-1">// 1. MX Record (Incoming Mail to gothwadtech.com)</div>
                <div className="text-emerald-400">Type: MX | Name: @ | Target: route1.mx.cloudflare.net | Priority: 10</div>
              </div>
              <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700">
                <div className="text-slate-400 mb-1">// 2. SPF Record (Spam Protection)</div>
                <div className="text-emerald-400">Type: TXT | Name: @ | Content: "v=spf1 include:_spf.mx.cloudflare.net ~all"</div>
              </div>
              <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700">
                <div className="text-slate-400 mb-1">// 3. Subdomain CNAMEs</div>
                <div className="text-emerald-400">Type: CNAME | Name: accounts | Target: gothwad-unified-auth.workers.dev</div>
                <div className="text-emerald-400">Type: CNAME | Name: mail | Target: mail.gothwadtech.com</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Terminal Deployment Commands */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs">
        <h3 className="text-base font-bold text-slate-900 mb-2">
          Worker Deploy Karne Ke 3 Simple Steps (Terminal Commands)
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          Aapke project ke <code className="text-blue-600 font-mono">/cloudflare-worker/</code> folder me saari production files bani hui hain.
        </p>

        <div className="space-y-3 font-mono text-xs">
          <div className="p-3 bg-slate-900 text-slate-100 rounded-xl flex items-center justify-between">
            <span>npm install -g wrangler</span>
            <span className="text-slate-400 font-sans text-[11px]">Install Cloudflare CLI</span>
          </div>
          <div className="p-3 bg-slate-900 text-slate-100 rounded-xl flex items-center justify-between">
            <span>npx wrangler login</span>
            <span className="text-slate-400 font-sans text-[11px]">Connect your Cloudflare account</span>
          </div>
          <div className="p-3 bg-slate-900 text-slate-100 rounded-xl flex items-center justify-between">
            <span>npx wrangler deploy</span>
            <span className="text-emerald-400 font-sans text-[11px]">Deploys worker in 5 seconds!</span>
          </div>
        </div>
      </div>
    </div>
  );
};
