/** Date-only birthdays are rendered in UTC with a named month, never shifted by timezone. */
export function formatProfileBirthday(value) {
  if (!value) return 'Not set';
  const date = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return 'Not available';
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
}
