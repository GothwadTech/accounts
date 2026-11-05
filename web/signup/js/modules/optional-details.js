/** Optional birthday disclosure; leaving it blank never blocks account creation. */
export function latestBirthDate() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function birthDateError(value, badInput = false) {
  if (!value && !badInput) return '';
  const date = new Date(`${value}T00:00:00Z`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value && value <= latestBirthDate()
    ? '' : 'Please enter a valid date of birth in the past.';
}

/** Read every segment at validation time too, including browser autofill without input events. */
export function readBirthDate() {
  const parts = ['birth-day', 'birth-month', 'birth-year'].map(id => document.getElementById(id).value.trim());
  const [day, month, year] = parts;
  const blank = parts.every(value => !value);
  const complete = /^\d{1,2}$/.test(day) && /^\d{1,2}$/.test(month) && /^\d{4}$/.test(year);
  const value = blank ? '' : complete ? `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}` : 'incomplete';
  document.getElementById('date_of_birth').value = complete ? value : '';
  return { value, error: birthDateError(value), focusId: !day ? 'birth-day' : !month ? 'birth-month' : !year ? 'birth-year' : 'birth-day' };
}

export function initOptionalDetails() {
  const toggle = document.getElementById('signup-optional-toggle');
  const details = document.getElementById('signup-optional-details');
  const input = document.getElementById('date_of_birth');
  if (!toggle || !details || !input) return;
  for (const id of ['birth-day', 'birth-month', 'birth-year']) {
    document.getElementById(id).addEventListener('input', event => {
      event.target.value = event.target.value.replace(/[^0-9]/g, '').slice(0, id === 'birth-year' ? 4 : 2);
      readBirthDate();
    });
  }
  function setOpen(open) {
    toggle.setAttribute('aria-expanded', String(open));
    details.hidden = !open;
    details.inert = !open;
  }
  setOpen(false);
  toggle.addEventListener('click', () => {
    const open = details.hidden;
    setOpen(open);
  });
  return () => { setOpen(true); };
}
