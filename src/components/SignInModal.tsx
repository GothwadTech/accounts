import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ArrowRight, Eye, EyeOff, ShieldCheck, KeyRound, Sparkles, CheckCircle2 } from 'lucide-react';
import { GothwadLogo } from './GothwadLogo';

export const SignInModal: React.FC = () => {
  const { signIn, setView } = useAuth();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [identifier, setIdentifier] = useState('pwngtwd@gothwadtech.com');
  const [password, setPassword] = useState('password123');
  const [showPassword, setShowPassword] = useState(false);
  const [otpCode, setOtpCode] = useState('482910');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNextStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!identifier.trim()) {
      setError('Enter an email or Gothwad username');
      return;
    }
    setStep(2);
  };

  const handleNextStep2 = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!password.trim()) {
      setError('Enter your password');
      return;
    }

    // If identifier indicates 2FA enabled, show step 3
    if (identifier.includes('pwngtwd')) {
      setStep(3);
    } else {
      executeSignIn();
    }
  };

  const executeSignIn = async () => {
    setLoading(true);
    setError(null);
    const res = await signIn(identifier, password);
    setLoading(false);
    if (!res.success) {
      setError(res.error || 'Failed to sign in');
    }
  };

  const handleStep3 = (e: React.FormEvent) => {
    e.preventDefault();
    if (otpCode.length < 6) {
      setError('Enter the 6-digit verification code');
      return;
    }
    executeSignIn();
  };

  const quickFill = (userType: 'founder' | 'new') => {
    if (userType === 'founder') {
      setIdentifier('pwngtwd@gothwadtech.com');
      setPassword('password123');
    } else {
      setIdentifier('rahul@gothwadtech.com');
      setPassword('securePass2026!');
    }
    setStep(1);
    setError(null);
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center p-4 sm:p-6 bg-slate-50">
      <div className="w-full max-w-md bg-white rounded-2xl sm:rounded-3xl shadow-xl border border-slate-200/80 p-8 sm:p-10 transition-all">
        {/* Header Branding */}
        <div className="flex flex-col items-center text-center mb-8">
          <GothwadLogo size="lg" className="mb-3" />
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Sign in</h1>
          <p className="text-sm text-slate-500 mt-1">
            with your <span className="font-semibold text-slate-700">Gothwad Account</span>
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
            {error}
          </div>
        )}

        {/* STEP 1: IDENTIFIER */}
        {step === 1 && (
          <form onSubmit={handleNextStep1} className="space-y-6">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Email or Gothwad Username
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="username@gothwadtech.com"
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 text-slate-900 text-sm focus:outline-hidden focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition-all font-mono"
                  autoFocus
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5">
                Tip: Enter just <span className="font-mono text-blue-600">pwngtwd</span> to sign in to{' '}
                <span className="font-mono">pwngtwd@gothwadtech.com</span>
              </p>
            </div>

            <div className="flex items-center justify-between text-xs">
              <button
                type="button"
                onClick={() => setView('architecture-lab')}
                className="text-blue-600 hover:underline font-medium cursor-pointer"
              >
                Forgot email?
              </button>
              <button
                type="button"
                onClick={() => setView('signup')}
                className="text-blue-600 hover:underline font-medium cursor-pointer"
              >
                Create account
              </button>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-xs hover:shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Next</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </form>
        )}

        {/* STEP 2: PASSWORD */}
        {step === 2 && (
          <form onSubmit={handleNextStep2} className="space-y-6">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-semibold flex items-center justify-center shrink-0">
                  {identifier.charAt(0).toUpperCase()}
                </div>
                <span className="text-xs font-medium text-slate-800 truncate font-mono">
                  {identifier.includes('@') ? identifier : `${identifier}@gothwadtech.com`}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-xs text-blue-600 hover:underline shrink-0 font-medium cursor-pointer"
              >
                Change
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Enter your password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className="w-full px-4 py-3 pr-10 rounded-xl border border-slate-300 text-slate-900 text-sm focus:outline-hidden focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition-all"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs">
              <label className="flex items-center gap-2 text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showPassword}
                  onChange={(e) => setShowPassword(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>Show password</span>
              </label>
              <button
                type="button"
                onClick={() => setView('architecture-lab')}
                className="text-blue-600 hover:underline font-medium cursor-pointer"
              >
                Forgot password?
              </button>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="w-1/3 py-3 px-4 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-semibold transition-all cursor-pointer"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading}
                className="w-2/3 py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl text-sm font-semibold shadow-xs hover:shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? 'Verifying...' : 'Next'}
                {!loading && <ArrowRight className="w-4 h-4" />}
              </button>
            </div>
          </form>
        )}

        {/* STEP 3: 2-STEP VERIFICATION (GOOGLE AUTHENTICATOR / OTP) */}
        {step === 3 && (
          <form onSubmit={handleStep3} className="space-y-6">
            <div className="text-center p-4 bg-blue-50/50 rounded-2xl border border-blue-100 mb-2">
              <div className="w-10 h-10 rounded-full bg-blue-600/10 text-blue-600 flex items-center justify-center mx-auto mb-2">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">2-Step Verification</h3>
              <p className="text-xs text-slate-600 mt-1">
                To protect your Gothwad Account, enter the 6-digit code from your Authenticator App
                or registered SMS.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5 text-center">
                Enter 6-digit code
              </label>
              <input
                type="text"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                className="w-full text-center text-2xl tracking-widest font-mono py-3 rounded-xl border border-slate-300 focus:outline-hidden focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
                autoFocus
              />
              <p className="text-[11px] text-slate-500 text-center mt-1">
                Demo code prefilled: <span className="font-mono text-blue-600 font-bold">482910</span>
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="w-1/3 py-3 px-4 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-semibold transition-all cursor-pointer"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading}
                className="w-2/3 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold shadow-xs hover:shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? 'Confirming...' : 'Verify & Sign in'}
                {!loading && <CheckCircle2 className="w-4 h-4" />}
              </button>
            </div>
          </form>
        )}

        {/* Demo Fast-Switch Helpers */}
        <div className="mt-8 pt-6 border-t border-slate-100">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-2">
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            <span className="font-medium text-slate-700">Quick Testing Accounts:</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => quickFill('founder')}
              className="p-2 text-left bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors text-xs cursor-pointer"
            >
              <div className="font-semibold text-slate-800">Founder Account</div>
              <div className="text-[10px] text-slate-500 font-mono truncate">pwngtwd@gothwadtech.com</div>
            </button>
            <button
              onClick={() => quickFill('new')}
              className="p-2 text-left bg-slate-50 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors text-xs cursor-pointer"
            >
              <div className="font-semibold text-slate-800">Member Account</div>
              <div className="text-[10px] text-slate-500 font-mono truncate">rahul@gothwadtech.com</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
