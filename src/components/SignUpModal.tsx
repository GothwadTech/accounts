import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { RESERVED_USERNAMES } from '../data/mockData';
import { Check, X, Shield, ArrowRight, Eye, EyeOff, Sparkles } from 'lucide-react';
import { GothwadLogo } from './GothwadLogo';

export const SignUpModal: React.FC = () => {
  const { signUp, setView } = useAuth();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [isCheckingUsername, setIsCheckingUsername] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'available' | 'taken' | 'too-short'>('idle');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check username availability as user types
  useEffect(() => {
    const clean = username.trim().toLowerCase();
    if (!clean) {
      setUsernameStatus('idle');
      return;
    }
    if (clean.length < 3) {
      setUsernameStatus('too-short');
      return;
    }

    setIsCheckingUsername(true);
    const timer = setTimeout(() => {
      setIsCheckingUsername(false);
      if (RESERVED_USERNAMES.includes(clean)) {
        setUsernameStatus('taken');
      } else {
        setUsernameStatus('available');
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [username]);

  // Calculate password strength
  const getPasswordStrength = () => {
    if (!password) return 0;
    let score = 0;
    if (password.length >= 8) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;
    return score;
  };

  const strength = getPasswordStrength();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!firstName.trim() || !lastName.trim()) {
      setError('Please provide your first and last name');
      return;
    }
    if (usernameStatus !== 'available') {
      setError('Please choose a valid and available username');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (!recoveryEmail.trim() || !recoveryEmail.includes('@')) {
      setError('Please provide a valid recovery email (e.g. your personal @gmail.com)');
      return;
    }

    setLoading(true);
    const res = await signUp({
      firstName,
      lastName,
      username,
      recoveryEmail,
      phoneNumber,
    });
    setLoading(false);

    if (!res.success) {
      setError(res.error || 'Failed to create account');
    }
  };

  const pickSuggestion = (sug: string) => {
    setUsername(sug);
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 sm:p-6 bg-slate-50">
      <div className="w-full max-w-xl bg-white rounded-2xl sm:rounded-3xl shadow-xl border border-slate-200/80 p-8 sm:p-10 transition-all">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <GothwadLogo size="lg" className="mb-3" />
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Create your Gothwad Account
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              One unified account for Gothwad Mail, Drive, Tube, Notes & Browser
            </p>
          </div>
          <button
            onClick={() => setView('signin')}
            className="text-xs font-semibold text-blue-600 hover:underline pt-2 cursor-pointer"
          >
            Sign in instead
          </button>
        </div>

        {error && (
          <div className="mb-6 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* First & Last Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">First name</label>
              <input
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Pawan"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm focus:outline-hidden focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Last name</label>
              <input
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Gothwad"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm focus:outline-hidden focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>

          {/* Username Picker with @gothwadtech.com suffix */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-slate-700">Choose your Gothwad Email</label>
              {usernameStatus === 'available' && (
                <span className="text-[11px] font-medium text-emerald-600 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Available!
                </span>
              )}
              {usernameStatus === 'taken' && (
                <span className="text-[11px] font-medium text-red-600 flex items-center gap-1">
                  <X className="w-3.5 h-3.5" /> Username already reserved
                </span>
              )}
            </div>

            <div className="flex items-center rounded-xl border border-slate-300 focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-100 overflow-hidden bg-white">
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9._-]/g, ''))}
                placeholder="yourname"
                className="w-full px-3.5 py-2.5 text-slate-900 text-sm font-mono focus:outline-hidden"
              />
              <span className="px-3.5 py-2.5 bg-slate-50 text-slate-500 font-mono text-xs border-l border-slate-200 select-none shrink-0 font-medium">
                @gothwadtech.com
              </span>
            </div>

            {/* Suggestions */}
            {firstName && !username && (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[11px] text-slate-500">Suggestions:</span>
                <button
                  type="button"
                  onClick={() => pickSuggestion(`${firstName.toLowerCase()}.${(lastName || 'tech').toLowerCase()}`)}
                  className="text-[11px] text-blue-600 font-mono hover:underline cursor-pointer"
                >
                  {firstName.toLowerCase()}.{(lastName || 'tech').toLowerCase()}
                </button>
                <button
                  type="button"
                  onClick={() => pickSuggestion(`${firstName.toLowerCase()}${new Date().getFullYear()}`)}
                  className="text-[11px] text-blue-600 font-mono hover:underline cursor-pointer"
                >
                  {firstName.toLowerCase()}{new Date().getFullYear()}
                </button>
              </div>
            )}
          </div>

          {/* Passwords */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 chars"
                  className="w-full px-3.5 py-2.5 pr-9 rounded-xl border border-slate-300 text-slate-900 text-sm focus:outline-hidden focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Confirm password</label>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repeat password"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm focus:outline-hidden focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>

          {/* Password Strength Indicator */}
          {password && (
            <div className="space-y-1">
              <div className="flex gap-1 h-1.5">
                {[1, 2, 3, 4].map((level) => (
                  <div
                    key={level}
                    className={`flex-1 rounded-full transition-colors ${
                      strength >= level
                        ? strength === 4
                          ? 'bg-emerald-500'
                          : strength === 3
                          ? 'bg-blue-500'
                          : 'bg-amber-500'
                        : 'bg-slate-200'
                    }`}
                  />
                ))}
              </div>
              <p className="text-[10px] text-slate-500">
                Use 8+ characters with uppercase letters, numbers & symbols for security.
              </p>
            </div>
          )}

          {/* Recovery Email */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Recovery Email (For password resets)
            </label>
            <input
              type="email"
              required
              value={recoveryEmail}
              onChange={(e) => setRecoveryEmail(e.target.value)}
              placeholder="e.g. pwngtwd@gmail.com"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm focus:outline-hidden focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              We will send recovery codes here if you ever lose your Gothwad Account password.
            </p>
          </div>

          {/* Terms info */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600">
            By creating a Gothwad Account, you agree to the{' '}
            <span className="text-blue-600 font-medium">Gothwad Terms of Service</span> and{' '}
            <span className="text-blue-600 font-medium">Privacy Policy</span>. Your unified identity
            will receive 15 GB of complimentary shared cloud storage.
          </div>

          {/* Submit */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl text-sm font-semibold shadow-xs hover:shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? 'Setting up Gothwad Account...' : 'Create Account'}
              {!loading && <ArrowRight className="w-4 h-4" />}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
