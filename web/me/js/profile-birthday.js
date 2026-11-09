/** Optional birthday uses one joined 48px Day / Month / Year control, not a calendar. */
import { birthDateError } from '../../signup/js/modules/optional-details.js';
import { api } from '../../js/api.js';
import { bindDialogForm } from './dialog-form.js';
import { el, modal, closeDialog, notifyUpdated, getDialogUser } from './dialogs.js';

export function dialogDob() {
  const [year = '', month = '', day = ''] = (getDialogUser()?.date_of_birth || '').split('-');
  modal({ title: 'Date of birth', sub: 'Optional profile detail. Leave all three parts blank to remove it. Saving does not change sharing permissions.',
    body: `<div class="btn-field-box profile-birthday" role="group" aria-label="Date of birth, day month year">
      <input class="input" id="dlg-dob-day" inputmode="numeric" maxlength="2" placeholder="Day" aria-label="Day" autocomplete="bday-day" />
      <input class="input" id="dlg-dob-month" inputmode="numeric" maxlength="2" placeholder="Month" aria-label="Month" autocomplete="bday-month" />
      <input class="input" id="dlg-dob-year" inputmode="numeric" maxlength="4" placeholder="Year" aria-label="Year" autocomplete="bday-year" />
      </div><p class="profile-birthday-note">Day / Month / Year. Use a valid date in the past.</p>`,
    actions: '<button type="button" class="btn btn-primary" id="dlg-save">Save</button>',
  });
  const inputs = ['day', 'month', 'year'].map(part => el('dlg-dob-' + part));
  [day, month, year].forEach((value, i) => { inputs[i].value = value; });
  inputs.forEach(input => input.addEventListener('input', () => { input.value = input.value.replace(/[^0-9]/g, '').slice(0, input.maxLength); }));
  inputs[0].focus();
  bindDialogForm({ read: () => {
    const [d, m, y] = inputs.map(input => input.value.trim());
    const blank = !d && !m && !y;
    const complete = /^\d{1,2}$/.test(d) && /^\d{1,2}$/.test(m) && /^\d{4}$/.test(y);
    return { date_of_birth: blank ? '' : complete ? `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}` : 'incomplete' };
  }, validate: body => { const message = birthDateError(body.date_of_birth); return message ? { message, fields: ['dlg-dob-day', 'dlg-dob-month', 'dlg-dob-year'] } : null; },
  submit: body => api.post('/auth/update-profile', body), success: body => body.date_of_birth ? 'Date of birth updated' : 'Date of birth removed' });
}
