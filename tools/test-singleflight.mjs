/**
 * One-off test: SINGLE-FLIGHT refresh — browser jaisi parallel race.
 * (Run: node tools/test-singleflight.mjs — servers chal rahe hone chahiye)
 */
const store = new Map();
globalThis.sessionStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { api, getTokens, saveTokens, clearTokens } = await import('../web/js/api.js');
const { GOTHWAD_CONFIG } = await import('../web/js/config.js');
GOTHWAD_CONFIG.API_URL = 'http://localhost:3000'; // Node fetch ko absolute URL chahiye

const BASE = 'http://localhost:3000';
let fails = 0;
const check = (name, cond) => {
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
  if (!cond) fails++;
};

// 1) Fresh login
clearTokens();
const login = await api.post('/auth/signin', { identifier: 'pawan', password: 'pawan3017@' });
check('signin ok + tokens saved', login.ok && !!getTokens().access_token);

// 2) Access token "expire" kar do (browser mein 1h baad yahi hota hai)
const staleRefresh = getTokens().refresh_token;
saveTokens({ access_token: 'EXPIRED_DEAD_TOKEN', refresh_token: staleRefresh });

// 3) BILKUL browser jaisi PARALLEL calls (header + dashboard ek saath)
const [a, b, c] = await Promise.all([
  api.get('/auth/me'),
  api.get('/auth/me'),
  api.get('/oauth/authorizations'),
]);
check(`parallel me#1 authenticated=${a.data?.authenticated}`, a.data?.authenticated === true);
check(`parallel me#2 authenticated=${b.data?.authenticated}`, b.data?.authenticated === true);
check(`parallel apps ok=${c.data?.ok}`, c.ok && c.data?.ok === true);

// 4) Tokens refresh ho gaye? (single-flight rotation)
const now = getTokens();
check('tokens rotated (naya access)', now.access_token && now.access_token !== 'EXPIRED_DEAD_TOKEN');

// 5) Ab DOBARA parallel — naye token se seedha (koi refresh nahi)
const [d, e] = await Promise.all([api.get('/auth/me'), api.get('/auth/me')]);
check('second round dono authenticated', d.data?.authenticated === true && e.data?.authenticated === true);

// 6) Genuinely logged-out state — consistent false (bounce hona chahiye, flash nahi)
clearTokens();
const [f, g] = await Promise.all([api.get('/auth/me'), api.get('/auth/me')]);
check('logged-out dono consistent false', f.data?.authenticated === false && g.data?.authenticated === false);

console.log(fails === 0 ? '\n🎉 ALL PASS — browser symptom FIXED' : `\n💥 ${fails} FAILURES`);
process.exit(fails ? 1 : 0);
