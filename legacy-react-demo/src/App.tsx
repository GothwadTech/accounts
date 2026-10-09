/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Header } from './components/Header';
import { SignInModal } from './components/SignInModal';
import { SignUpModal } from './components/SignUpModal';
import { AccountDashboard } from './components/AccountDashboard';
import { SSOSimulator } from './components/SSOSimulator';
import { ArchitectureLab } from './components/ArchitectureLab';
import { CheckCircle2, Shield, Globe } from 'lucide-react';

const MainContent: React.FC = () => {
  const { view, notification } = useAuth();

  return (
    <div className="min-h-screen flex flex-col bg-[#f8fafd] text-[#202124]">
      {/* Top Bar */}
      <Header />

      {/* Floating Notification Toast */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 bg-slate-900 text-white rounded-xl shadow-2xl border border-slate-800 text-xs font-medium animate-in fade-in slide-in-from-bottom-2 duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{notification}</span>
        </div>
      )}

      {/* Primary Viewport */}
      <main className="flex-1">
        {view === 'signin' && <SignInModal />}
        {view === 'signup' && <SignUpModal />}
        {view === 'dashboard' && <AccountDashboard />}
        {view === 'sso-simulator' && <SSOSimulator />}
        {view === 'architecture-lab' && <ArchitectureLab />}
      </main>

      {/* Quiet Google-style Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-slate-700 font-medium">
              <Globe className="w-3.5 h-3.5 text-slate-500" />
              <span>English (India) · हिन्दी Support</span>
            </div>
            <span aria-hidden="true">·</span>
            <span>Gothwad Tech Ecosystem</span>
          </div>

          <div className="flex items-center gap-6">
            <a href="#help" onClick={(e) => e.preventDefault()} className="hover:text-slate-800 transition-colors">
              Help
            </a>
            <a href="#privacy" onClick={(e) => e.preventDefault()} className="hover:text-slate-800 transition-colors">
              Privacy
            </a>
            <a href="#terms" onClick={(e) => e.preventDefault()} className="hover:text-slate-800 transition-colors">
              Terms
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <MainContent />
    </AuthProvider>
  );
}
