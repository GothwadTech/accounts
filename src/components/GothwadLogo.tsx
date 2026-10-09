import React from 'react';

interface GothwadLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  withText?: boolean;
}

const SIZE_MAP = {
  sm: 'w-6 h-6',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
  xl: 'w-16 h-16',
};

export const GothwadLogo: React.FC<GothwadLogoProps> = ({
  size = 'md',
  className = '',
  withText = false,
}) => {
  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      <div
        className={`${SIZE_MAP[size]} shrink-0 rounded-xl overflow-hidden flex items-center justify-center bg-white shadow-xs border border-slate-100/80 transition-transform group-hover:scale-105`}
      >
        <img
          src="/icon-192.png"
          alt="Gothwad Tech Logo"
          className="w-full h-full object-contain p-0.5"
          onError={(e) => {
            // Fallback if image fails to render
            const target = e.currentTarget;
            target.onerror = null;
            target.src = '/favicon.ico';
          }}
        />
      </div>
      {withText && (
        <span className="font-bold tracking-tight text-slate-900 whitespace-nowrap">
          Gothwad Account
        </span>
      )}
    </div>
  );
};
