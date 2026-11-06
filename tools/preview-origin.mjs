/** Exact public origin for opt-in Arena previews; never trusts browser-supplied origins. */
export function arenaPreviewOrigin(environment) {
  if (environment.LOCAL_PREVIEW_PROXY !== 'true') return null;
  if (environment.DEV_MODE !== 'true' || environment.NODE_ENV === 'production' ||
    environment.CI || environment.CF_PAGES || environment.WORKERS_CI) {
    throw new Error('Public preview origin handling is restricted to explicit local development.');
  }
  const sandbox = environment.E2B_SANDBOX_ID;
  if (!sandbox) return null; // Regular local development still uses the request origin.
  const port = String(environment.PORT || '3000');
  if (!/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/i.test(sandbox) ||
    !/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error('Invalid local sandbox or preview port configuration.');
  }
  return `https://${Number(port)}-${sandbox}.e2b.app`;
}
