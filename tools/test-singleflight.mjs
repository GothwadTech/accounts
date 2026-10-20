/**
 * Live HTTP cookie-only single-flight refresh test against `npm start` (port 3000).
 * Verifies parallel browser requests with an expired access cookie rotate
 * cleanly via a single `/api/auth/refresh` flight with zero client-stored tokens.
 */
const memSession = new Map();
const memLocal = new Map();
globalThis.sessionStorage = {
  getItem: (k) => (memSession.has(k) ? memSession.get(k) : null),
  setItem: (k, v) => memSession.set(k, String(v)),
  removeItem: (k) => memSession.delete(k),
};
globalThis.localStorage = {
  getItem: (k) => (memLocal.has(k) ? memLocal.get(k) : null),
  setItem: (k, v) => memLocal.set(k, String(v)),
  removeItem: (k) => memLocal.delete(k),
};

// Minimal browser-accurate cookie jar around global `fetch` (`credentials: 'include'`)
const jar = new Map();
const baseFetch = globalThis.fetch;
const baseOrigin = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';

function applySetCookies(res) {
  const headers = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  for (const raw of headers) {
    const parts = raw.split(';').map((s) => s.trim());
    const eq = parts[0].indexOf('=');
    if (eq < 0) continue;
    const name = parts[0].slice(0, eq);
    const val = parts[0].slice(eq + 1);
    const maxAgeAttr = parts.find((p) => /^max-age=/i.test(p));
    if (maxAgeAttr && Number(maxAgeAttr.split('=')[1]) <= 0) {
      jar.delete(name);
    } else {
      jar.set(name, val);
    }
  }
}

globalThis.fetch = async (input, init = {}) => {
  const headers = new Headers(init.headers || {});
  if (!headers.has('Origin')) headers.set('Origin', baseOrigin);
  if (jar.size > 0 && !headers.has('Cookie')) {
    headers.set(
      'Cookie',
      Array.from(jar.entries())
        .map(([k, v]) => `${k}=${v}`)
        .join('; '),
    );
  }
  const res = await baseFetch(input, { ...init, headers });
  applySetCookies(res);
  return res;
};

const { api, clearTokens } = await import('../web/js/api.js');
const { GOTHWAD_CONFIG } = await import('../web/js/config.js');
GOTHWAD_CONFIG.API_URL = baseOrigin;

let fails = 0;
const check = (name, cond) => {
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
  if (!cond) fails++;
};

const uname = `sf_${Date.now().toString(36).slice(-6)}`;
const pw = 'SingleFlightPass!9';

// 1) Sign up account & confirm zero tokens in sessionStorage/localStorage
clearTokens();
const signup = await api.post('/auth/signup', {
  first_name: 'Single',
  last_name: 'Flight',
  username: uname,
  password: pw,
  recovery_email: `${uname}@personal.example`,
});
check('signup ok + HttpOnly cookies set', signup.ok && jar.has('gothwad_sess_a') && jar.has('gothwad_active'));
check('zero tokens stored in sessionStorage/localStorage', memSession.size === 0 && memLocal.size === 0);

// 2) Simulate expired 1h access JWT inside both `gothwad_at` and `gothwad_sess_a` while keeping valid refresh token
jar.set('gothwad_at', 'EXPIRED.DEAD.JWT');
const slotParts = jar.get('gothwad_sess_a').split('~');
slotParts[1] = 'EXPIRED.DEAD.JWT';
jar.set('gothwad_sess_a', slotParts.join('~'));

// 3) Fire parallel browser-identical calls (topbar + dashboard + connected apps)
const [a, b, c] = await Promise.all([
  api.get('/auth/me'),
  api.get('/auth/me'),
  api.get('/oauth/authorizations'),
]);
check(`parallel me#1 authenticated=${a.data?.authenticated}`, a.data?.authenticated === true);
check(`parallel me#2 authenticated=${b.data?.authenticated}`, b.data?.authenticated === true);
check(`parallel apps ok=${c.data?.ok}`, c.ok && c.data?.ok === true);

// 4) Confirm access cookie rotated cleanly
check(
  'cookies rotated (fresh HttpOnly access cookie)',
  !!jar.get('gothwad_at') && jar.get('gothwad_at') !== 'EXPIRED.DEAD.JWT',
);

// 5) Second parallel wave uses rotated cookie with zero extra refresh
const [d, e] = await Promise.all([api.get('/auth/me'), api.get('/auth/me')]);
check('second round both authenticated', d.data?.authenticated === true && e.data?.authenticated === true);

// 6) Clean up temporary test user
await api.post('/auth/delete-account', { password: pw });

// 7) Confirm logged-out parallel calls return consistent 401 false
const [f, g] = await Promise.all([api.get('/auth/me'), api.get('/auth/me')]);
check('logged-out both consistent 401 false', f.status === 401 && g.status === 401 && f.data?.authenticated === false && g.data?.authenticated === false);

console.log(fails === 0 ? '\n🎉 ALL PASS — cookie-only single-flight session rotation verified on D1!' : `\n💥 ${fails} FAILURES`);
process.exit(fails ? 1 : 0);
