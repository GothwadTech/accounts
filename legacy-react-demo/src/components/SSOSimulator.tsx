import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { EcosystemApp } from '../types/auth';
import { GothwadLogo } from './GothwadLogo';
import { SignInWithGothwadButton } from './SignInWithGothwadButton';
import {
  Mail,
  HardDrive,
  Tv,
  FileText,
  Briefcase,
  Compass,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  Key,
  Cookie,
  ExternalLink,
  Lock,
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

export const SSOSimulator: React.FC = () => {
  const { user, apps, selectedSsoApp, setSelectedSsoApp, toggleAppAuthorization, setView } = useAuth();

  const currentApp = selectedSsoApp || apps[0];
  const [ssoStep, setSsoStep] = useState<'app_entry' | 'oauth_prompt' | 'token_exchange' | 'logged_in'>('logged_in');
  const [isSimulating, setIsSimulating] = useState(false);

  const triggerSsoFlow = (app: EcosystemApp) => {
    setSelectedSsoApp(app);
    setSsoStep('app_entry');
    setIsSimulating(true);

    setTimeout(() => {
      setSsoStep('oauth_prompt');
      setIsSimulating(false);
    }, 600);
  };

  const handleAuthorize = () => {
    setIsSimulating(true);
    setSsoStep('token_exchange');

    setTimeout(() => {
      if (!currentApp.isAuthorized) {
        toggleAppAuthorization(currentApp.id);
      }
      setSsoStep('logged_in');
      setIsSimulating(false);
    }, 700);
  };

  if (!user) {
    return (
      <div className="max-w-xl mx-auto my-12 p-8 bg-white rounded-2xl border border-slate-200 text-center shadow-xs">
        <Lock className="w-12 h-12 text-slate-400 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-slate-900">Sign In to Gothwad Account First</h3>
        <p className="text-xs text-slate-500 mt-1 mb-6">
          To test Single Sign-On across Gothwad Mail, Drive, and Tube, you must be signed in with a Gothwad Account.
        </p>
        <button
          onClick={() => setView('signin')}
          className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 cursor-pointer"
        >
          Sign In Now
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-xs font-semibold text-blue-600 mb-1">
          <Sparkles className="w-4 h-4" />
          <span>Interactive Ecosystem Tester</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Single Sign-On (SSO) Simulator
        </h1>
        <p className="text-xs text-slate-500 mt-1 max-w-2xl">
          Dekhein kaise ek baar Gothwad Account me login karne ke baad user bina dobara password dale
          Gothwad Mail, Tube, Drive, Notes, Browser aur Manager me 1-click se login ho jata hai.
        </p>
      </div>

      {/* App Switcher Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mb-8">
        {apps.map((app) => (
          <button
            key={app.id}
            onClick={() => triggerSsoFlow(app)}
            className={`p-3 rounded-2xl border text-left transition-all flex flex-col items-center sm:items-start cursor-pointer ${
              currentApp.id === app.id
                ? 'border-blue-600 bg-blue-50/40 shadow-xs ring-1 ring-blue-600'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center mb-2">
              {ICON_MAP[app.iconName]}
            </div>
            <span className="text-xs font-bold text-slate-900 truncate w-full">
              {app.name}
            </span>
            <span className="text-[10px] text-slate-500 font-mono truncate w-full">
              {app.subdomain.split('.')[0]}
            </span>
          </button>
        ))}
      </div>

      {/* Main Simulation Viewport */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Flow Details & Technical Breakdown */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
              <Key className="w-4 h-4 text-blue-600" />
              <span>SSO Handshake Process</span>
            </h3>

            <div className="space-y-4 text-xs">
              <div className="flex items-start gap-2.5">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 ${
                  ssoStep === 'app_entry' ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  1
                </div>
                <div>
                  <div className="font-semibold text-slate-800">App Entry</div>
                  <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                    https://{currentApp.subdomain}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 ${
                  ssoStep === 'oauth_prompt' ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  2
                </div>
                <div>
                  <div className="font-semibold text-slate-800">Auth Redirect</div>
                  <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                    accounts.gothwadtech.com/oauth/authorize
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 ${
                  ssoStep === 'token_exchange' ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  3
                </div>
                <div>
                  <div className="font-semibold text-slate-800">Wildcard Cookie & JWT</div>
                  <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                    Domain=.gothwadtech.com
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 ${
                  ssoStep === 'logged_in' ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  4
                </div>
                <div>
                  <div className="font-semibold text-slate-800">Seamless Access</div>
                  <div className="text-[11px] text-slate-500">
                    Logged in as {user.gothwadEmail}
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={() => triggerSsoFlow(currentApp)}
              className="mt-6 w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Replay SSO Login Flow</span>
            </button>
          </div>

          {/* Technical Wildcard Cookie Inspector */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs text-xs">
            <div className="flex items-center gap-2 font-bold text-slate-900 mb-3">
              <Cookie className="w-4 h-4 text-amber-500" />
              <span>Active SSO Session Token</span>
            </div>
            <div className="space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-200 font-mono text-[11px]">
              <div>
                <span className="text-slate-500">Cookie: </span>
                <span className="text-slate-900 font-bold">__Host-Gothwad-Session</span>
              </div>
              <div>
                <span className="text-slate-500">Domain: </span>
                <span className="text-blue-600 font-bold">.gothwadtech.com</span>
              </div>
              <div>
                <span className="text-slate-500">Subject: </span>
                <span className="text-emerald-700">{user.gothwadEmail}</span>
              </div>
              <div>
                <span className="text-slate-500">Target App: </span>
                <span className="text-purple-700">{currentApp.id}</span>
              </div>
              <div>
                <span className="text-slate-500">SameSite: </span>
                <span className="text-slate-700">Lax; Secure; HttpOnly</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Simulated Application Screen */}
        <div className="lg:col-span-2">
          {/* Simulated Browser Window Frame */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-md overflow-hidden">
            {/* Browser Address Bar */}
            <div className="bg-slate-100 px-4 py-3 border-b border-slate-200 flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
              </div>
              <div className="flex-1 bg-white px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-mono text-slate-600 flex items-center gap-2">
                <Lock className="w-3 h-3 text-emerald-600 shrink-0" />
                <span className="text-slate-400">https://</span>
                <span className="font-semibold text-slate-800">{currentApp.subdomain}</span>
                {ssoStep === 'oauth_prompt' && (
                  <span className="text-blue-600">/auth/redirect?sso=gothwad</span>
                )}
              </div>
            </div>

            {/* Browser Inner Viewport */}
            <div className="p-6 min-h-[420px] flex flex-col justify-center items-center bg-slate-50/50">
              {/* STATE 1: App Entry Loading */}
              {ssoStep === 'app_entry' && (
                <div className="text-center p-8">
                  <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-4 animate-bounce">
                    {ICON_MAP[currentApp.iconName]}
                  </div>
                  <h3 className="text-base font-bold text-slate-900">Connecting to {currentApp.name}</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Checking Single Sign-On session on <span className="font-mono">accounts.gothwadtech.com</span>...
                  </p>
                </div>
              )}

              {/* STATE 2: OAuth 2.0 Consent Prompt (Google style) */}
              {ssoStep === 'oauth_prompt' && (
                <div className="w-full max-w-md bg-white p-6 rounded-2xl border border-slate-200 shadow-lg text-center animate-in fade-in zoom-in-95">
                  <GothwadLogo size="lg" className="mb-3" />
                  <h3 className="text-base font-bold text-slate-900">Sign in with Gothwad Account</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    to continue to <span className="font-semibold text-slate-800">{currentApp.name}</span>
                  </p>

                  <div className="my-5 p-3.5 rounded-xl border border-blue-200 bg-blue-50/50 flex items-center gap-3 text-left">
                    <div className="w-10 h-10 rounded-full bg-blue-600 text-white font-bold text-sm flex items-center justify-center shrink-0">
                      {user.firstName.charAt(0)}
                      {user.lastName.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-slate-900">
                        {user.firstName} {user.lastName}
                      </div>
                      <div className="text-[11px] text-slate-600 font-mono truncate">
                        {user.gothwadEmail}
                      </div>
                    </div>
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  </div>

                  <div className="text-left text-xs space-y-1 mb-5">
                    <span className="text-[11px] text-slate-500 font-medium">This will grant:</span>
                    {currentApp.scopes.map((s, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-slate-700 text-[11px]">
                        <span className="w-1 h-1 rounded-full bg-slate-400" />
                        <span>{s}</span>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={handleAuthorize}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-all cursor-pointer"
                  >
                    Continue as {user.firstName}
                  </button>
                </div>
              )}

              {/* STATE 3: Token Exchange */}
              {ssoStep === 'token_exchange' && (
                <div className="text-center p-8">
                  <div className="w-12 h-12 rounded-full border-4 border-blue-200 border-t-blue-600 animate-spin mx-auto mb-4" />
                  <h3 className="text-base font-bold text-slate-900">Authorizing SSO Token...</h3>
                  <p className="text-xs text-slate-500 mt-1 font-mono">
                    Cloudflare Worker issuing cross-domain session token
                  </p>
                </div>
              )}

              {/* STATE 4: Logged In App Interface */}
              {ssoStep === 'logged_in' && (
                <div className="w-full h-full text-left">
                  {/* App Mini Navbar */}
                  <div className="flex items-center justify-between pb-4 border-b border-slate-200 mb-6">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                        {ICON_MAP[currentApp.iconName]}
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900">{currentApp.name}</h3>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {currentApp.subdomain}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="text-right hidden sm:block">
                        <div className="text-xs font-bold text-slate-800">
                          {user.firstName} {user.lastName}
                        </div>
                        <div className="text-[10px] text-emerald-600 font-mono font-medium">
                          SSO Verified
                        </div>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-blue-600 text-white text-xs font-semibold flex items-center justify-center shadow-xs">
                        {user.firstName.charAt(0)}
                      </div>
                    </div>
                  </div>

                  {/* App Content Card */}
                  <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-bold text-slate-900">
                        {currentApp.sampleUi.title}
                      </h4>
                      <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                        Single Sign-On Active
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mb-6">
                      {currentApp.sampleUi.description}
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {currentApp.sampleUi.dataPoints.map((dp, i) => (
                        <div key={i} className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                          <span className="text-[11px] text-slate-500">{dp.label}</span>
                          <div className="text-sm font-bold text-slate-900 mt-1 font-mono">
                            {dp.value}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                      <span>Zero separate passwords needed for this app</span>
                      <button
                        onClick={() => triggerSsoFlow(currentApp)}
                        className="text-blue-600 font-medium hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <span>Re-test SSO</span>
                        <RefreshCw className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Standard Sign in with Gothwad Button Showcase */}
                  <div className="mt-6 p-4 rounded-xl bg-white border border-slate-200">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h4 className="text-xs font-bold text-slate-900">
                          Official "Sign in with Gothwad" Button Variants
                        </h4>
                        <p className="text-[11px] text-slate-500">
                          Embed this button in any Gothwad app or 3rd party site (like "Sign in with Google")
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <SignInWithGothwadButton
                        variant="outline"
                        text="Sign in with Gothwad"
                        onClick={() => triggerSsoFlow(currentApp)}
                      />
                      <SignInWithGothwadButton
                        variant="standard"
                        text="Continue with Gothwad"
                        onClick={() => triggerSsoFlow(currentApp)}
                      />
                      <SignInWithGothwadButton
                        variant="dark"
                        text="Sign in with Gothwad"
                        onClick={() => triggerSsoFlow(currentApp)}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
