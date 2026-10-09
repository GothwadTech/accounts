import { EcosystemApp, GothwadUser, UserSession } from '../types/auth';

export const INITIAL_USER: GothwadUser = {
  id: 'usr_gothwad_7829',
  firstName: 'Pawan',
  lastName: 'Gothwad',
  username: 'pwngtwd',
  gothwadEmail: 'pwngtwd@gothwadtech.com',
  recoveryEmail: 'pwngtwd@gmail.com',
  phoneNumber: '+91 98765 43210',
  twoFactorEnabled: true,
  storageUsedBytes: 2147483648, // 2.0 GB used
  storageLimitBytes: 16106127360, // 15 GB total
  createdAt: '2026-01-15T10:30:00Z',
};

export const INITIAL_APPS: EcosystemApp[] = [
  {
    id: 'gothwad-mail',
    name: 'Gothwad Mail',
    subdomain: 'mail.gothwadtech.com',
    description: 'Fast, secure and encrypted email suite on your custom @gothwadtech.com address.',
    iconName: 'Mail',
    color: '#EA4335',
    scopes: ['Read emails', 'Send emails as pwngtwd@gothwadtech.com', 'Contacts access'],
    isAuthorized: true,
    lastUsed: 'Just now',
    sampleUi: {
      title: 'Inbox (3 Unread)',
      description: 'Connected as pwngtwd@gothwadtech.com via Single Sign-On',
      dataPoints: [
        { label: 'Primary Inbox', value: '42 Threads' },
        { label: 'Custom Domain', value: '@gothwadtech.com' },
        { label: 'Storage Used', value: '620 MB of 15 GB' },
      ],
    },
  },
  {
    id: 'gothwad-drive',
    name: 'Gothwad Drive',
    subdomain: 'drive.gothwadtech.com',
    description: 'Cloud file storage, shared workspaces, docs and synchronized folders.',
    iconName: 'HardDrive',
    color: '#34A853',
    scopes: ['Full drive read/write', 'Shared link creation', 'Offline file sync'],
    isAuthorized: true,
    lastUsed: '15 mins ago',
    sampleUi: {
      title: 'My Drive & Cloud Folders',
      description: 'Shared quota with Gothwad Account',
      dataPoints: [
        { label: 'Total Files', value: '184 Files' },
        { label: 'Shared Workspaces', value: '3 Active Teams' },
        { label: 'Drive Space', value: '1.38 GB allocated' },
      ],
    },
  },
  {
    id: 'gothwad-tube',
    name: 'Gothwad Tube',
    subdomain: 'tube.gothwadtech.com',
    description: 'Video sharing, creator channel studio and high-definition video streaming.',
    iconName: 'Tv',
    color: '#FF0000',
    scopes: ['Channel management', 'Video uploads', 'Comments and playlists'],
    isAuthorized: true,
    lastUsed: '2 hours ago',
    sampleUi: {
      title: 'Gothwad Creator Studio',
      description: 'Channel: Pawan Gothwad Tech',
      dataPoints: [
        { label: 'Subscribers', value: '12.4K' },
        { label: 'Published Videos', value: '38 Videos' },
        { label: 'SSO Status', value: 'Auto-linked channel' },
      ],
    },
  },
  {
    id: 'gothwad-notes',
    name: 'Gothwad Notes',
    subdomain: 'notes.gothwadtech.com',
    description: 'Real-time encrypted markdown notes, quick voice memos, and task checklists.',
    iconName: 'FileText',
    color: '#FBBC05',
    scopes: ['Notes read/write', 'Tags and notebooks', 'Export notes'],
    isAuthorized: true,
    lastUsed: 'Yesterday',
    sampleUi: {
      title: 'Notes & Workspace Memos',
      description: 'Synchronized with Gothwad Cloud',
      dataPoints: [
        { label: 'Active Notes', value: '56 Notes' },
        { label: 'Pinned Checklists', value: '8 Tasks' },
        { label: 'Encryption', value: 'AES-256 Enabled' },
      ],
    },
  },
  {
    id: 'gothwad-manager',
    name: 'Gothwad Manager',
    subdomain: 'manager.gothwadtech.com',
    description: 'Business productivity, project tracking, invoices and client workspace CRM.',
    iconName: 'Briefcase',
    color: '#4285F4',
    scopes: ['Business profiles', 'Client contacts', 'Financial invoices read/write'],
    isAuthorized: false,
    lastUsed: 'Never',
    sampleUi: {
      title: 'Business & Project CRM',
      description: 'Enterprise operations suite',
      dataPoints: [
        { label: 'Active Projects', value: '4 Projects' },
        { label: 'Team Members', value: '6 Colleagues' },
        { label: 'SSO Status', value: 'Pending Authorization' },
      ],
    },
  },
  {
    id: 'gothwad-browser',
    name: 'Gothwad Browser',
    subdomain: 'browser.gothwadtech.com',
    description: 'Next-generation privacy-first web browser with cloud sync for bookmarks and history.',
    iconName: 'Compass',
    color: '#9333EA',
    scopes: ['Sync bookmarks', 'Sync open tabs', 'Password vault access'],
    isAuthorized: true,
    lastUsed: '3 days ago',
    sampleUi: {
      title: 'Gothwad Browser Cloud Sync',
      description: 'Active profile: pwngtwd@gothwadtech.com',
      dataPoints: [
        { label: 'Synced Bookmarks', value: '312 Items' },
        { label: 'Connected Devices', value: '2 Devices' },
        { label: 'Tracker Protection', value: 'High Shield' },
      ],
    },
  },
];

export const INITIAL_SESSIONS: UserSession[] = [
  {
    id: 'sess_curr_01',
    deviceName: 'Windows 11 PC (Chrome)',
    deviceType: 'desktop',
    browser: 'Google Chrome 124.0',
    location: 'Delhi, India',
    ipAddress: '103.21.124.89',
    lastActive: 'Active now',
    isCurrent: true,
  },
  {
    id: 'sess_mob_02',
    deviceName: 'iPhone 15 Pro (Safari)',
    deviceType: 'mobile',
    browser: 'Mobile Safari 17.4',
    location: 'Mumbai, India',
    ipAddress: '157.34.88.12',
    lastActive: '45 minutes ago',
    isCurrent: false,
  },
  {
    id: 'sess_cf_03',
    deviceName: 'Cloudflare Edge Worker Session',
    deviceType: 'cloud',
    browser: 'Gothwad Single Sign-On Agent',
    location: 'Cloudflare Edge (DEL Data Center)',
    ipAddress: '172.68.14.99',
    lastActive: 'Continuous Sync',
    isCurrent: false,
  },
];

export const RESERVED_USERNAMES = [
  'admin',
  'support',
  'help',
  'root',
  'accounts',
  'mail',
  'billing',
  'system',
  'security',
];
