/** Account-bound, single-flight 15-second presentation cache. Failed and stale results are never data. */
import { api } from '../../js/api.js';
import { captureView, onViewInvalidated } from './view-context.js';
const TTL = 15000, cache = new Map();
let version = 0;
export function resetMeStore() { version++; cache.clear(); }
onViewInvalidated(resetMeStore);
function request(key, path, select, force) {
  const old = cache.get(key);
  if (!force && old && Date.now() - old.at < TTL) return old.promise;
  const valid = captureView(), started = version;
  const entry = { at: Date.now(), promise: null };
  entry.promise = api.get(path).then(result => {
    if (!valid() || started !== version) throw new Error('Account data was superseded');
    if (!result.ok) throw new Error(result.error || 'Information could not be loaded');
    return select(result.data);
  });
  cache.set(key, entry);
  entry.promise.catch(() => { if (cache.get(key) === entry) cache.delete(key); });
  return entry.promise;
}
export const getActivity = (force = false) => request('activity', '/auth/activity', data => data.activity || [], force);
export const getAuthorizations = (force = false) => request('authorizations', '/oauth/authorizations', data => data, force);
