export interface GothwadUser {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  gothwadEmail: string; // e.g. pwngtwd@gothwadtech.com
  recoveryEmail: string;
  phoneNumber?: string;
  avatarUrl?: string;
  twoFactorEnabled: boolean;
  storageUsedBytes: number; // e.g. 1.2 GB
  storageLimitBytes: number; // e.g. 15 GB
  createdAt: string;
}

export interface EcosystemApp {
  id: string;
  name: string;
  subdomain: string; // e.g. mail.gothwadtech.com
  description: string;
  iconName: string;
  color: string;
  scopes: string[];
  isAuthorized: boolean;
  lastUsed?: string;
  sampleUi: {
    title: string;
    description: string;
    dataPoints: { label: string; value: string }[];
  };
}

export interface UserSession {
  id: string;
  deviceName: string;
  deviceType: 'desktop' | 'mobile' | 'tablet' | 'cloud';
  browser: string;
  location: string;
  ipAddress: string;
  lastActive: string;
  isCurrent: boolean;
}

export type AuthView = 'dashboard' | 'signin' | 'signup' | 'sso-simulator' | 'architecture-lab';
