/** Memory-only UI ownership and render tickets. Never an authentication mechanism. */
import { parsePageAuthuser } from '../../js/authuser.js';
let epoch = 0, owner = null, selector = null;
const revisions = new Map(), listeners = new Set();
export function bindViewAccount(user, index = parsePageAuthuser()) {
  const id = user?.id || null;
  if (owner === id && String(selector) === String(index)) return;
  owner = id; selector = index; invalidateViews();
}
export function invalidateViews() {
  epoch++; revisions.clear();
  for (const listener of listeners) listener();
}
export function onViewInvalidated(listener) { listeners.add(listener); return () => listeners.delete(listener); }
export function captureView() {
  const version = epoch, page = parsePageAuthuser();
  return () => version === epoch && page === parsePageAuthuser();
}
export function beginView(key) {
  const valid = captureView(), revision = (revisions.get(key) || 0) + 1;
  revisions.set(key, revision);
  return () => valid() && revisions.get(key) === revision;
}
export function selectedViewUser() { return owner; }
