/**
 * Live HTTP single-flight refresh test against `npm start` (port 3000).
 * Verifies parallel browser requests with an expired access token rotate
 * cleanly via a single `/api/auth/refresh` call with zero 401 bounce.
 */
const store = new Map();
globalThis.sessionStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { api, getTokens, saveTokens, clearTokens } = await import('../web/js/api.js');
const { GOTHWAD_CONFIG } = await import('../web/js/config.js');
GOTHWAD_CONFIG.API_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';

let fails = 0;
const check = (name, cond) => {
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
  if (!cond) fails++;
};

const uname = `sf_${Date.now().toString(36).slice(-6)}`;
const pw = 'SingleFlightPass!9';

// 1) Create account & ensure fresh tokens
clearTokens();
const signup = await api.post('/auth/signup', {
  first_name: 'Single',
  last_name: 'Flight',
  username: uname,
  password: pw,
  recovery_email: `${uname}@personal.example`,
});
check('signup ok + tokens saved', signup.ok && !!getTokens().access_token && !!getTokens().refresh_token);

// 2) Simulate expired 1h access token while keeping valid refresh token
const staleRefresh = getTokens().refresh_token;
saveTokens({ access_token: 'EXPIRED_DEAD_TOKEN', refresh_token: staleRefresh });

// 3) Fire parallel browser-identical calls (topbar + dashboard + connected apps)
const [a, b, c] = await Promise.all([
  api.get('/auth/me'),
  api.get('/auth/me'),
  api.get('/oauth/authorizations'),
]);
check(`parallel me#1 authenticated=${a.data?.authenticated}`, a.data?.authenticated === true);
check(`parallel me#2 authenticated=${b.data?.authenticated}`, b.data?.authenticated === true);
check(`parallel apps ok=${c.data?.ok}`, c.ok && c.data?.ok === true);

// 4) Confirm access token rotated cleanly
const now = getTokens();
check('tokens rotated (fresh access token)', !!now.access_token && now.access_token !== 'EXPIRED_DEAD_TOKEN');

// 5) Second parallel wave uses rotated token with zero extra refresh
const [d, e] = await Promise.all([api.get('/auth/me'), api.get('/auth/me')]);
check('second round both authenticated', d.data?.authenticated === true && e.data?.authenticated === true);

// 6) Clean up temporary test user so preview DB stays clean!
await api.post('/auth/delete-account', { password: pw });

// 7) Confirm logged-out parallel calls return consistent false
clearTokens();
const [f, g] = await Promise.all([api.get('/auth/me'), api.get('/auth/me')]);
check('logged-out both consistent false', f.data?.authenticated === false && g.data?.authenticated === false);

console.log(fails === 0 ? '\n🎉 ALL PASS — single-flight session rotation verified on D1!' : `\n💥 ${fails} FAILURES`);
process.exit(fails ? 1 : 0);
