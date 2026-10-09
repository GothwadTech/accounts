import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Grid, User, LogOut, ShieldCheck, Sparkles } from 'lucide-react';
import { AppLauncherModal } from './AppLauncherModal';
import { GothwadLogo } from './GothwadLogo';

export const Header: React.FC = () => {
  const { user, isAuthenticated, signOut, view, setView } = useAuth();
  const [isWaffleOpen, setIsWaffleOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Brand Wordmark with Official Logo */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => setView(isAuthenticated ? 'dashboard' : 'signin')}
              className="flex items-center gap-2.5 text-left group cursor-pointer"
            >
              <GothwadLogo size="md" />
              <span className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
                Gothwad Account
              </span>
            </button>
          </div>

          {/* Zone 2: Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            {isAuthenticated && (
              <>
                <button
                  onClick={() => setView('dashboard')}
                  className={`hover:text-blue-600 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    view === 'dashboard' ? 'text-blue-600 font-semibold' : ''
                  }`}
                >
                  My Account
                </button>
              </>
            )}
            <button
              onClick={() => setView('sso-simulator')}
              className={`hover:text-blue-600 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                view === 'sso-simulator' ? 'text-blue-600 font-semibold' : ''
              }`}
            >
              SSO Ecosystem Simulator
            </button>
            <button
              onClick={() => setView('architecture-lab')}
              className={`hover:text-blue-600 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                view === 'architecture-lab' ? 'text-blue-600 font-semibold' : ''
              }`}
            >
              Cloudflare & Supabase Lab
            </button>
          </nav>

          {/* Zone 3: Primary Action & Google Waffle / Profile Menu */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Google-style 9-dot Waffle App Switcher */}
            <button
              onClick={() => setIsWaffleOpen((prev) => !prev)}
              aria-label="Gothwad Apps Launcher"
              className="w-10 h-10 rounded-full flex items-center justify-center text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              title="Gothwad Apps"
            >
              <Grid className="w-5 h-5" />
            </button>

            {isAuthenticated && user ? (
              <div className="relative">
                <button
                  onClick={() => setIsProfileMenuOpen((prev) => !prev)}
                  className="flex items-center gap-2 p-1 pl-2 rounded-full border border-slate-200 hover:border-slate-300 hover:shadow-xs transition-all cursor-pointer"
                >
                  <span className="text-xs font-medium text-slate-700 hidden sm:inline max-w-[120px] truncate">
                    {user.firstName}
                  </span>
                  <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-semibold text-xs flex items-center justify-center shadow-xs">
                    {user.firstName.charAt(0)}
                    {user.lastName.charAt(0)}
                  </div>
                </button>

                {isProfileMenuOpen && (
                  <div
                    className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-xl border border-slate-200 p-4 z-50 animate-in fade-in slide-in-from-top-2 duration-150"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex flex-col items-center text-center pb-3 border-b border-slate-100">
                      <div className="w-16 h-16 rounded-full bg-blue-600 text-white font-bold text-xl flex items-center justify-center mb-2 shadow-sm">
                        {user.firstName.charAt(0)}
                        {user.lastName.charAt(0)}
                      </div>
                      <h4 className="text-sm font-bold text-slate-900">
                        {user.firstName} {user.lastName}
                      </h4>
                      <p className="text-xs text-slate-500 font-mono mt-0.5 truncate max-w-full">
                        {user.gothwadEmail}
                      </p>
                      <div className="flex items-center gap-1 mt-2 text-[11px] text-emerald-600 font-medium">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>Unified Identity Active</span>
                      </div>
                    </div>

                    <div className="py-2 space-y-1">
                      <button
                        onClick={() => {
                          setView('dashboard');
                          setIsProfileMenuOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 rounded-lg flex items-center gap-2 cursor-pointer"
                      >
                        <User className="w-4 h-4 text-slate-500" />
                        <span>Manage your Gothwad Account</span>
                      </button>
                      <button
                        onClick={() => {
                          setView('sso-simulator');
                          setIsProfileMenuOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 rounded-lg flex items-center gap-2 cursor-pointer"
                      >
                        <Sparkles className="w-4 h-4 text-blue-500" />
                        <span>Simulate Gothwad Mail / Tube SSO</span>
                      </button>
                    </div>

                    <div className="pt-2 border-t border-slate-100">
                      <button
                        onClick={() => {
                          signOut();
                          setIsProfileMenuOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg flex items-center gap-2 cursor-pointer"
                      >
                        <LogOut className="w-4 h-4 text-red-500" />
                        <span>Sign out of Gothwad Account</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setView('signin')}
                  className="px-3.5 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                >
                  Sign In
                </button>
                <button
                  onClick={() => setView('signup')}
                  className="px-4 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-xs cursor-pointer whitespace-nowrap"
                >
                  Create Account
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Backdrop for profile menu */}
      {isProfileMenuOpen && (
        <div className="fixed inset-0 z-30" onClick={() => setIsProfileMenuOpen(false)} />
      )}

      {/* 9-dot Waffle modal */}
      <AppLauncherModal isOpen={isWaffleOpen} onClose={() => setIsWaffleOpen(false)} />
    </>
  );
};
