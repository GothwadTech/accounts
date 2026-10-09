import React from 'react';

interface SignInWithGothwadButtonProps {
  onClick?: () => void;
  variant?: 'standard' | 'outline' | 'dark';
  text?: string;
  className?: string;
  disabled?: boolean;
}

export const SignInWithGothwadButton: React.FC<SignInWithGothwadButtonProps> = ({
  onClick,
  variant = 'outline',
  text = 'Sign in with Gothwad',
  className = '',
  disabled = false,
}) => {
  const baseClasses =
    'inline-flex items-center justify-center gap-3 px-4 py-2.5 rounded-xl font-semibold text-xs sm:text-sm transition-all shadow-xs cursor-pointer select-none';

  const variantClasses = {
    outline:
      'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 hover:border-slate-400 active:bg-slate-100',
    standard:
      'bg-blue-600 text-white hover:bg-blue-700 border border-transparent shadow-sm active:bg-blue-800',
    dark:
      'bg-slate-900 text-white hover:bg-slate-800 border border-slate-800 active:bg-black',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${baseClasses} ${variantClasses[variant]} ${className}`}
    >
      <div className="w-5 h-5 rounded-md overflow-hidden shrink-0 bg-white flex items-center justify-center p-0.5 shadow-xs">
        <img
          src="/icon-192.png"
          alt="Gothwad Logo"
          className="w-full h-full object-contain"
        />
      </div>
      <span>{text}</span>
    </button>
  );
};
