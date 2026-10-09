import React, { createContext, useContext, useState, useEffect } from 'react';
import { EcosystemApp, GothwadUser, UserSession, AuthView } from '../types/auth';
import { INITIAL_USER, INITIAL_APPS, INITIAL_SESSIONS } from '../data/mockData';

interface AuthContextType {
  user: GothwadUser | null;
  isAuthenticated: boolean;
  apps: EcosystemApp[];
  sessions: UserSession[];
  view: AuthView;
  setView: (view: AuthView) => void;
  selectedSsoApp: EcosystemApp | null;
  setSelectedSsoApp: (app: EcosystemApp | null) => void;
  signIn: (identifier: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signUp: (data: {
    firstName: string;
    lastName: string;
    username: string;
    recoveryEmail: string;
    phoneNumber?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  signOut: () => void;
  updateProfile: (data: Partial<GothwadUser>) => void;
  toggleAppAuthorization: (appId: string) => void;
  revokeSession: (sessionId: string) => void;
  revokeAllOtherSessions: () => void;
  notification: string | null;
  showNotification: (msg: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<GothwadUser | null>(INITIAL_USER);
  const [apps, setApps] = useState<EcosystemApp[]>(INITIAL_APPS);
  const [sessions, setSessions] = useState<UserSession[]>(INITIAL_SESSIONS);
  const [view, setView] = useState<AuthView>('dashboard');
  const [selectedSsoApp, setSelectedSsoApp] = useState<EcosystemApp | null>(INITIAL_APPS[0]);
  const [notification, setNotification] = useState<string | null>(null);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => {
      setNotification((curr) => (curr === msg ? null : curr));
    }, 4000);
  };

  const signIn = async (identifier: string, password: string): Promise<{ success: boolean; error?: string }> => {
    // Simulate network delay
    await new Promise((r) => setTimeout(r, 600));

    if (!identifier.trim() || !password.trim()) {
      return { success: false, error: 'Email and password are required' };
    }

    const cleanUsername = identifier.split('@')[0].toLowerCase().trim();
    const newUser: GothwadUser = {
      id: `usr_${Date.now()}`,
      firstName: cleanUsername.charAt(0).toUpperCase() + cleanUsername.slice(1),
      lastName: 'User',
      username: cleanUsername,
      gothwadEmail: `${cleanUsername}@gothwadtech.com`,
      recoveryEmail: identifier.includes('@') && !identifier.endsWith('@gothwadtech.com') ? identifier : 'user@gmail.com',
      twoFactorEnabled: false,
      storageUsedBytes: 157286400, // 150 MB initial
      storageLimitBytes: 16106127360, // 15 GB
      createdAt: new Date().toISOString(),
    };

    setUser(newUser);
    setView('dashboard');
    showNotification(`Signed in successfully as ${newUser.gothwadEmail}`);
    return { success: true };
  };

  const signUp = async (data: {
    firstName: string;
    lastName: string;
    username: string;
    recoveryEmail: string;
    phoneNumber?: string;
  }): Promise<{ success: boolean; error?: string }> => {
    await new Promise((r) => setTimeout(r, 700));

    const cleanUser = data.username.toLowerCase().trim();
    const newUser: GothwadUser = {
      id: `usr_${Date.now()}`,
      firstName: data.firstName.trim(),
      lastName: data.lastName.trim(),
      username: cleanUser,
      gothwadEmail: `${cleanUser}@gothwadtech.com`,
      recoveryEmail: data.recoveryEmail.trim(),
      phoneNumber: data.phoneNumber?.trim(),
      twoFactorEnabled: false,
      storageUsedBytes: 52428800, // 50 MB initial
      storageLimitBytes: 16106127360,
      createdAt: new Date().toISOString(),
    };

    setUser(newUser);
    setView('dashboard');
    showNotification(`Gothwad Account created! Your email is ${newUser.gothwadEmail}`);
    return { success: true };
  };

  const signOut = () => {
    setUser(null);
    setView('signin');
    showNotification('Signed out from Gothwad Account');
  };

  const updateProfile = (data: Partial<GothwadUser>) => {
    if (!user) return;
    setUser({ ...user, ...data });
    showNotification('Account profile updated successfully');
  };

  const toggleAppAuthorization = (appId: string) => {
    setApps((prev) =>
      prev.map((app) =>
        app.id === appId
          ? {
              ...app,
              isAuthorized: !app.isAuthorized,
              lastUsed: !app.isAuthorized ? 'Just now' : app.lastUsed,
            }
          : app
      )
    );
    const target = apps.find((a) => a.id === appId);
    if (target) {
      showNotification(
        target.isAuthorized
          ? `Access revoked for ${target.name}`
          : `Single Sign-On granted for ${target.name}`
      );
    }
  };

  const revokeSession = (sessionId: string) => {
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    showNotification('Device session revoked');
  };

  const revokeAllOtherSessions = () => {
    setSessions((prev) => prev.filter((s) => s.isCurrent));
    showNotification('All other active device sessions have been terminated');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        apps,
        sessions,
        view,
        setView,
        selectedSsoApp,
        setSelectedSsoApp,
        signIn,
        signUp,
        signOut,
        updateProfile,
        toggleAppAuthorization,
        revokeSession,
        revokeAllOtherSessions,
        notification,
        showNotification,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
