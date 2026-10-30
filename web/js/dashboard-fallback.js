window.__gothwadModuleError = function () {
  var box = document.getElementById('auth-loading');
  if (!box || !document.getElementById('dash-root').classList.contains('hidden')) return;
  box.innerHTML =
    '<p style="font-weight:500;color:var(--text);">Could not finish loading your Gothwad Account.</p>' +
    '<div style="display:flex;gap:10px;margin-top:8px;">' +
    '<button type="button" class="btn btn-tonal" id="gothwad-reload">Reload</button>' +
    '<a class="btn btn-primary" href="/signin?next=%2Fme">Sign in</a></div>';
  document.getElementById('gothwad-reload').addEventListener('click', () => location.reload());
};
setTimeout(function () {
  if (!window.__GOTHWAD_ME_BOOTED) window.__gothwadModuleError();
}, 8000);
// Capture module load errors without CSP-blocked HTML event attributes.
document.addEventListener('error', (event) => {
  if (event.target?.id === 'gothwad-dashboard-module') window.__gothwadModuleError();
}, true);
