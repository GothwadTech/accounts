/** Failed requests are not empty lists. Keep the failure visible and provide an explicit retry. */
export function renderDataFailure(target, retry) {
  const node = typeof target === 'string' ? document.getElementById(target) : target;
  if (!node) return;
  node.innerHTML = '<div role="alert"><p class="text-sm">Could not load this information. Please try again.</p><button type="button" class="btn btn-tonal btn-sm">Retry</button></div>';
  node.querySelector('button').addEventListener('click', async event => {
    const button = event.currentTarget; if (button.disabled) return;
    button.disabled = true; button.textContent = 'Retrying…';
    try { await retry(); } finally { if (button.isConnected) { button.disabled = false; button.textContent = 'Retry'; } }
  });
}
