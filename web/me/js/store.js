/**
 * /me — chhota data store: activity + authorizations ek hi baar fetch hote
 * hain aur 15 second cache ke saath share hote hain (free-tier friendly).
 */

import { api } from '../../js/api.js';

const TTL = 15000; // 15s — is window mein dobara fetch nahi hota

let activityPromise = null;
let activityAt = 0;
let authzPromise = null;
let authzAt = 0;

/** Recent activity (cached). force=true → fresh fetch. */
export function getActivity(force = false) {
  const fresh = Date.now() - activityAt < TTL;
  if (!force && fresh && activityPromise) return activityPromise;
  activityAt = Date.now();
  activityPromise = api.get('/auth/activity').then((res) =>
    res.ok ? res.data.activity || [] : [],
  );
  return activityPromise;
}

/** OAuth authorizations (cached). Response: { connected, apps }. */
export function getAuthorizations(force = false) {
  const fresh = Date.now() - authzAt < TTL;
  if (!force && fresh && authzPromise) return authzPromise;
  authzAt = Date.now();
  authzPromise = api.get('/oauth/authorizations').then((res) =>
    res.ok ? res.data : { connected: [], apps: [] },
  );
  return authzPromise;
}
