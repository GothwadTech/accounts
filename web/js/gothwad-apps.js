/**
 * Gothwad product catalog (Accounts dashboard).
 * Core = Gothwad Services: account ke saath auto-connected, revoke nahi.
 * Others = Sign in with Gothwad apps: user disconnect kar sakta hai.
 */

export const GOTHWAD_SERVICES = [
  {
    id: 'gothwad-meet',
    name: 'Gothwad Meet',
    url: 'https://meet.gothwadtech.com',
    icon: 'video',
    description: 'Video meetings for your Gothwad Account',
  },
  {
    id: 'gothwad-mail',
    name: 'Gothwad Mail',
    url: 'https://mail.gothwadtech.com',
    icon: 'mail',
    description: 'username@gothwadtech.com inbox',
  },
  {
    id: 'gothwad-store',
    name: 'Gothwad Store',
    url: 'https://store.gothwadtech.com',
    icon: 'store',
    description: 'Apps and add-ons for Gothwad',
  },
  {
    id: 'gothwad-drive',
    name: 'Gothwad Drive',
    url: 'https://drive.gothwadtech.com',
    icon: 'hard-drive',
    description: 'Files and folders on your account',
  },
  {
    id: 'gothwad-notes',
    name: 'Gothwad Notes',
    url: 'https://notes.gothwadtech.com',
    icon: 'file-text',
    description: 'Notes and lists, synced',
  },
  {
    id: 'gothwad-calendar',
    name: 'Gothwad Calendar',
    url: 'https://calender.gothwadtech.com',
    icon: 'calendar',
    description: 'Events and reminders',
  },
  {
    id: 'gothwad-contacts',
    name: 'Gothwad Contacts',
    url: 'https://contacts.gothwadtech.com',
    icon: 'users',
    description: 'People and addresses',
  },
];

export const GOTHWAD_PRODUCTS = [
  {
    id: 'gothwad-tube',
    name: 'Gothwad Tube (PlusTube)',
    url: 'https://tube.gothwadtech.com',
    icon: 'play',
    description: 'Video — PlusTube',
  },
  {
    id: 'gothwad-chat',
    name: 'GrixChat (Gothwad Chat)',
    url: 'https://grixchat.gothwadtech.com',
    icon: 'message-circle',
    description: 'Messaging',
  },
  {
    id: 'gothwad-indogram',
    name: 'Indogram',
    url: 'https://indogram.gothwadtech.com',
    icon: 'send',
    description: 'Telegram-style chat',
  },
];

export const CORE_APP_IDS = GOTHWAD_SERVICES.map((a) => a.id);

export function isCoreApp(id) {
  return CORE_APP_IDS.includes(id);
}
