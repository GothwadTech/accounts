/** Keep Enter scoped to the visible form and allow only one pending action at a time. */
export function isActiveForm(form) {
  return !!form && form.isConnected !== false && !form.closest?.('[hidden], .hidden, [inert]');
}

export function bindFormSubmit(form, action) {
  if (!form) return;
  let busy = false, finished = false;
  form.addEventListener('keydown', event => {
    if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229) return;
    const input = event.target;
    if (input?.tagName === 'BUTTON' && event.repeat) { event.preventDefault(); return; }
    if (input?.tagName !== 'INPUT' || ['button', 'submit', 'reset', 'checkbox', 'radio', 'file', 'range', 'color'].includes(input.type)) return;
    // Do not let the browser activate a hidden default submit button in a later step.
    event.preventDefault();
    if (event.repeat || busy || finished || input.disabled || !isActiveForm(form) ||
      input.closest?.('[hidden], .hidden, [inert]')) return;
    form.requestSubmit();
  });
  async function run(action, event) {
    if (busy || finished || !isActiveForm(form)) return;
    busy = true;
    form.setAttribute?.('aria-busy', 'true');
    const buttons = [...(form.querySelectorAll?.('button') || [])].map(button => [button, button.disabled]);
    buttons.forEach(([button]) => { button.disabled = true; });
    try {
      // true means successful terminal navigation; keep locked until it completes.
      finished = await action(event, () => isActiveForm(form)) === true;
    } finally {
      busy = false;
      if (finished) {
        buttons.forEach(([button]) => { button.disabled = true; });
      } else {
        buttons.forEach(([button, disabled]) => { button.disabled = disabled; });
        form.removeAttribute?.('aria-busy');
      }
    }
  }
  form.addEventListener('submit', event => {
    event.preventDefault();
    return run(action, event);
  });
  return alternateAction => run(alternateAction);
}
