import { GOTHWAD_CONFIG } from './config.js';
const domain = GOTHWAD_CONFIG.APP_DOMAIN;
/**
 * Gothwad product catalog (Accounts dashboard).
 * Core = First-party Gothwad Services: automatically enabled with the account, non-revocable.
 * Others = Connected apps using Sign in with Gothwad: revocable at any time.
 */

export const GOTHWAD_SERVICES = [
  {
    id: 'gothwad-meet',
    name: 'Gothwad Meet',
    url: `https://meet.${domain}`,
    icon: 'video',
    description: 'Video meetings for your Gothwad Account',
  },
  {
    id: 'gothwad-mail',
    name: 'Gothwad Mail',
    url: `https://mail.${domain}`,
    icon: 'mail',
    description: `Your account address at ${domain}; mailbox availability is managed by Mail`,
  },
  {
    id: 'kiwi-store',
    name: 'Kiwi Store',
    url: `https://kiwistore.${domain}`,
    icon: 'store',
    description: 'Apps and add-ons for Kiwi Store',
  },
  {
    id: 'gothwad-drive',
    name: 'Gothwad Drive',
    url: `https://drive.${domain}`,
    icon: 'hard-drive',
    description: 'Files and folders on your account',
  },
  {
    id: 'gothwad-notes',
    name: 'Gothwad Notes',
    url: `https://notes.${domain}`,
    icon: 'file-text',
    description: 'Notes and lists, synced',
  },
  {
    id: 'gothwad-calendar',
    name: 'Gothwad Calendar',
    url: `https://calender.${domain}`,
    icon: 'calendar',
    description: 'Events and reminders',
  },
  {
    id: 'gothwad-contacts',
    name: 'Gothwad Contacts',
    url: `https://contacts.${domain}`,
    icon: 'users',
    description: 'People and addresses',
  },
];

export const GOTHWAD_PRODUCTS = [
  {
    id: 'gothwad-tube',
    name: 'Gothwad Tube (PlusTube)',
    url: `https://tube.${domain}`,
    icon: 'play',
    description: 'Video — PlusTube',
  },
  {
    id: 'gothwad-chat',
    name: 'GrixChat (Gothwad Chat)',
    url: `https://grixchat.${domain}`,
    icon: 'message-circle',
    description: 'Messaging',
  },
  {
    id: 'gothwad-indogram',
    name: 'Indogram',
    url: `https://indogram.${domain}`,
    icon: 'send',
    description: 'Telegram-style chat',
  },
];

export const CORE_APP_IDS = GOTHWAD_SERVICES.map((a) => a.id);

export function isCoreApp(id) {
  return CORE_APP_IDS.includes(id);
}
