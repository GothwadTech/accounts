/**
 * /me — Shared 15-second data cache (`activity` + `authorizations`), reset on account switch.
 */

import { api } from '../../js/api.js';

const TTL = 15000;

let activityPromise = null;
let activityAt = 0;
let authzPromise = null;
let authzAt = 0;

export function resetMeStore() {
  activityPromise = null;
  activityAt = 0;
  authzPromise = null;
  authzAt = 0;
}

export function getActivity(force = false) {
  const fresh = Date.now() - activityAt < TTL;
  if (!force && fresh && activityPromise) return activityPromise;
  activityAt = Date.now();
  activityPromise = api.get('/auth/activity').then((res) =>
    res.ok ? res.data.activity || [] : [],
  );
  return activityPromise;
}

export function getAuthorizations(force = false) {
  const fresh = Date.now() - authzAt < TTL;
  if (!force && fresh && authzPromise) return authzPromise;
  authzAt = Date.now();
  authzPromise = api.get('/oauth/authorizations').then((res) =>
    res.ok ? res.data : { connected: [], apps: [] },
  );
  return authzPromise;
}
