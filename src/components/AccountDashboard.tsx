import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  User,
  Shield,
  Smartphone,
  Grid,
  Lock,
  Mail,
  HardDrive,
  Tv,
  FileText,
  Briefcase,
  Compass,
  CheckCircle2,
  AlertTriangle,
  Download,
  Trash2,
  ExternalLink,
  Laptop,
  Globe,
  LogOut,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

const ICON_MAP: Record<string, React.ReactNode> = {
  Mail: <Mail className="w-5 h-5 text-red-500" />,
  HardDrive: <HardDrive className="w-5 h-5 text-emerald-500" />,
  Tv: <Tv className="w-5 h-5 text-rose-600" />,
  FileText: <FileText className="w-5 h-5 text-amber-500" />,
  Briefcase: <Briefcase className="w-5 h-5 text-blue-600" />,
  Compass: <Compass className="w-5 h-5 text-purple-600" />,
};

export const AccountDashboard: React.FC = () => {
  const {
    user,
    apps,
    sessions,
    updateProfile,
    toggleAppAuthorization,
    revokeSession,
    revokeAllOtherSessions,
    setSelectedSsoApp,
    setView,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<'overview' | 'personal' | 'security' | 'apps' | 'data'>('overview');

  // Personal Info Form State
  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [recoveryEmail, setRecoveryEmail] = useState(user?.recoveryEmail || '');
  const [phoneNumber, setPhoneNumber] = useState(user?.phoneNumber || '');

  if (!user) return null;

  const storageUsedMB = (user.storageUsedBytes / (1024 * 1024)).toFixed(0);
  const storageLimitGB = (user.storageLimitBytes / (1024 * 1024 * 1024)).toFixed(0);
  const storagePercent = Math.min(100, Math.round((user.storageUsedBytes / user.storageLimitBytes) * 100));

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfile({
      firstName,
      lastName,
      recoveryEmail,
      phoneNumber,
    });
  };

  const handleDownloadArchive = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(user, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `gothwad-account-export-${user.username}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Hero Welcome Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-8 border-b border-slate-200">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white font-bold text-2xl flex items-center justify-center shadow-md">
            {user.firstName.charAt(0)}
            {user.lastName.charAt(0)}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Welcome, {user.firstName} {user.lastName}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <img src="/icon-192.png" alt="Gothwad Tech" className="w-4 h-4 object-contain" />
              <p className="text-sm text-slate-600 font-mono">
                {user.gothwadEmail}
              </p>
              <span className="text-[10px] font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                Unified ID
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setView('sso-simulator')}
            className="px-4 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-blue-600" />
            <span>Launch SSO Simulator</span>
          </button>
          <button
            onClick={() => setView('architecture-lab')}
            className="px-4 py-2 bg-slate-900 text-white hover:bg-slate-800 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <span>Worker & Supabase Lab</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Tabs Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 mt-8">
        {/* Left Side Tab Navigation */}
        <div className="lg:col-span-1 space-y-1">
          <button
            onClick={() => setActiveTab('overview')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all text-left cursor-pointer ${
              activeTab === 'overview'
                ? 'bg-blue-50 text-blue-700 font-semibold'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>Account Overview</span>
          </button>

          <button
            onClick={() => setActiveTab('personal')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all text-left cursor-pointer ${
              activeTab === 'personal'
                ? 'bg-blue-50 text-blue-700 font-semibold'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <User className="w-4 h-4" />
            <span>Personal Info</span>
          </button>

          <button
            onClick={() => setActiveTab('security')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all text-left cursor-pointer ${
              activeTab === 'security'
                ? 'bg-blue-50 text-blue-700 font-semibold'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Lock className="w-4 h-4" />
            <span>Security & Devices</span>
          </button>

          <button
            onClick={() => setActiveTab('apps')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all text-left cursor-pointer ${
              activeTab === 'apps'
                ? 'bg-blue-50 text-blue-700 font-semibold'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Grid className="w-4 h-4" />
            <span>Connected Apps ({apps.filter((a) => a.isAuthorized).length})</span>
          </button>

          <button
            onClick={() => setActiveTab('data')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all text-left cursor-pointer ${
              activeTab === 'data'
                ? 'bg-blue-50 text-blue-700 font-semibold'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <Download className="w-4 h-4" />
            <span>Data & Privacy</span>
          </button>
        </div>

        {/* Right Main Content Area */}
        <div className="lg:col-span-3">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Security Health Card */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">Security Checkup</h3>
                      <p className="text-xs text-slate-500">Your Gothwad Account is strongly protected</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveTab('security')}
                    className="text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
                  >
                    Manage security
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6 pt-6 border-t border-slate-100">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-[11px] text-slate-500 font-medium">2-Step Verification</span>
                    <p className="text-sm font-bold text-emerald-600 mt-1">
                      {user.twoFactorEnabled ? 'Enabled' : 'Disabled'}
                    </p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-[11px] text-slate-500 font-medium">Active Devices</span>
                    <p className="text-sm font-bold text-slate-900 mt-1">{sessions.length} Devices</p>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-[11px] text-slate-500 font-medium">SSO Apps Connected</span>
                    <p className="text-sm font-bold text-slate-900 mt-1">
                      {apps.filter((a) => a.isAuthorized).length} of {apps.length}
                    </p>
                  </div>
                </div>
              </div>

              {/* Cloud Storage Allocation Card */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Gothwad Unified Storage</h3>
                    <p className="text-xs text-slate-500">Shared storage for Gothwad Mail & Gothwad Drive</p>
                  </div>
                  <span className="text-xs font-mono font-bold text-slate-700">
                    {storageUsedMB} MB / {storageLimitGB} GB ({storagePercent}%)
                  </span>
                </div>

                <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden flex">
                  <div
                    className="bg-blue-600 h-full transition-all duration-500"
                    style={{ width: `${Math.max(storagePercent, 5)}%` }}
                  />
                </div>

                <div className="flex items-center gap-6 mt-4 text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                    <span>Gothwad Drive ({Math.round(Number(storageUsedMB) * 0.7)} MB)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                    <span>Gothwad Mail ({Math.round(Number(storageUsedMB) * 0.3)} MB)</span>
                  </div>
                </div>
              </div>

              {/* Ecosystem Quick Access Grid */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-bold text-slate-900">Your Gothwad Suite</h3>
                  <button
                    onClick={() => setActiveTab('apps')}
                    className="text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
                  >
                    View permissions
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {apps.map((app) => (
                    <div
                      key={app.id}
                      onClick={() => {
                        setSelectedSsoApp(app);
                        setView('sso-simulator');
                      }}
                      className="p-3.5 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50/30 transition-all cursor-pointer group"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 group-hover:scale-105 transition-transform flex items-center justify-center">
                          {ICON_MAP[app.iconName]}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-slate-900 truncate">{app.name}</h4>
                          <span className="text-[10px] text-slate-500 font-mono truncate block">
                            {app.subdomain}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PERSONAL INFO */}
          {activeTab === 'personal' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
              <h3 className="text-base font-bold text-slate-900 mb-1">Personal Info</h3>
              <p className="text-xs text-slate-500 mb-6">
                Info about you and your preferences across Gothwad services.
              </p>

              <form onSubmit={handleSaveProfile} className="space-y-5 max-w-lg">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">First Name</label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-hidden focus:border-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Last Name</label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-hidden focus:border-blue-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Gothwad Email (Permanent Ecosystem Identity)
                  </label>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono text-slate-800 flex items-center justify-between">
                    <span>{user.gothwadEmail}</span>
                    <span className="text-[10px] text-blue-600 font-semibold bg-blue-100 px-2 py-0.5 rounded-md">
                      Verified
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Recovery Email (For password resets)
                  </label>
                  <input
                    type="email"
                    value={recoveryEmail}
                    onChange={(e) => setRecoveryEmail(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-hidden focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Phone Number</label>
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-hidden focus:border-blue-600"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-xs"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 3: SECURITY & DEVICES */}
          {activeTab === 'security' && (
            <div className="space-y-6">
              {/* 2-Step Verification */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                      <Lock className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900">2-Step Verification</h3>
                      <p className="text-xs text-slate-500">
                        Prevent unauthorized access to your Gothwad Account by requiring an extra verification step.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => updateProfile({ twoFactorEnabled: !user.twoFactorEnabled })}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                      user.twoFactorEnabled
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {user.twoFactorEnabled ? '2FA Enabled' : 'Enable 2FA'}
                  </button>
                </div>
              </div>

              {/* Active Sessions & Devices */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Your Devices & Active Sessions</h3>
                    <p className="text-xs text-slate-500">
                      Devices currently signed in with your Gothwad master cookie.
                    </p>
                  </div>
                  {sessions.length > 1 && (
                    <button
                      onClick={revokeAllOtherSessions}
                      className="text-xs font-semibold text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                    >
                      Sign out of other devices
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  {sessions.map((sess) => (
                    <div
                      key={sess.id}
                      className={`p-4 rounded-xl border flex items-center justify-between ${
                        sess.isCurrent ? 'border-blue-200 bg-blue-50/20' : 'border-slate-200 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                          {sess.deviceType === 'desktop' ? (
                            <Laptop className="w-5 h-5" />
                          ) : sess.deviceType === 'mobile' ? (
                            <Smartphone className="w-5 h-5" />
                          ) : (
                            <Globe className="w-5 h-5 text-blue-600" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs font-bold text-slate-900">{sess.deviceName}</h4>
                            {sess.isCurrent && (
                              <span className="text-[10px] font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                                Current Session
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500">
                            {sess.browser} · {sess.location} · {sess.lastActive}
                          </p>
                          <span className="text-[10px] text-slate-500 font-mono">IP: {sess.ipAddress}</span>
                        </div>
                      </div>

                      {!sess.isCurrent && (
                        <button
                          onClick={() => revokeSession(sess.id)}
                          className="text-xs text-red-600 hover:text-red-700 font-medium px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                        >
                          Sign out
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: CONNECTED ECOSYSTEM APPS */}
          {activeTab === 'apps' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
              <h3 className="text-base font-bold text-slate-900 mb-1">Gothwad Suite Applications</h3>
              <p className="text-xs text-slate-500 mb-6">
                These applications use your Gothwad Account via Single Sign-On (SSO). You do not need separate passwords.
              </p>

              <div className="space-y-4">
                {apps.map((app) => (
                  <div
                    key={app.id}
                    className="p-4 rounded-xl border border-slate-200 hover:border-slate-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="flex items-start gap-3.5">
                      <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                        {ICON_MAP[app.iconName]}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-slate-900">{app.name}</h4>
                          <span className="text-xs font-mono text-slate-500">{app.subdomain}</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">{app.description}</p>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {app.scopes.map((s, idx) => (
                            <span
                              key={idx}
                              className="text-[10px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md"
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      <button
                        onClick={() => {
                          setSelectedSsoApp(app);
                          setView('sso-simulator');
                        }}
                        className="px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                      >
                        Launch App
                      </button>
                      <button
                        onClick={() => toggleAppAuthorization(app.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                          app.isAuthorized
                            ? 'text-red-600 hover:bg-red-50'
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                      >
                        {app.isAuthorized ? 'Revoke Access' : 'Authorize SSO'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 5: DATA & PRIVACY */}
          {activeTab === 'data' && (
            <div className="space-y-6">
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Download your Gothwad data</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Download a copy of your Gothwad Account profile, preferences, and security settings as a JSON archive.
                    </p>
                  </div>
                  <button
                    onClick={handleDownloadArchive}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Export JSON</span>
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-red-200 p-6 shadow-xs">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-base font-bold text-red-600">Delete your Gothwad Account</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      Permanently delete your account and access to Gothwad Mail, Drive, and all connected services.
                    </p>
                  </div>
                  <button
                    onClick={() => alert('Account deletion is locked for founder protection.')}
                    className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete Account</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
