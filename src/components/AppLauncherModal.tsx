import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Mail, HardDrive, Tv, FileText, Briefcase, Compass, ExternalLink } from 'lucide-react';
import { EcosystemApp } from '../types/auth';
import { GothwadLogo } from './GothwadLogo';

const ICON_MAP: Record<string, React.ReactNode> = {
  Mail: <Mail className="w-6 h-6 text-red-500" />,
  HardDrive: <HardDrive className="w-6 h-6 text-emerald-500" />,
  Tv: <Tv className="w-6 h-6 text-rose-600" />,
  FileText: <FileText className="w-6 h-6 text-amber-500" />,
  Briefcase: <Briefcase className="w-6 h-6 text-blue-600" />,
  Compass: <Compass className="w-6 h-6 text-purple-600" />,
};

interface AppLauncherProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AppLauncherModal: React.FC<AppLauncherProps> = ({ isOpen, onClose }) => {
  const { apps, setSelectedSsoApp, setView } = useAuth();

  if (!isOpen) return null;

  const handleAppClick = (app: EcosystemApp) => {
    setSelectedSsoApp(app);
    setView('sso-simulator');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end p-4 md:p-6" onClick={onClose}>
      <div
        className="w-80 md:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 p-4 mt-12 animate-in fade-in slide-in-from-top-2 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3 px-2">
          <div className="flex items-center gap-2">
            <GothwadLogo size="sm" />
            <span className="text-sm font-semibold text-slate-800">Gothwad Ecosystem</span>
          </div>
          <span className="text-xs text-slate-500 font-mono">*.gothwadtech.com</span>
        </div>

        <div className="grid grid-cols-3 gap-3 p-1">
          {/* Primary Gothwad Account Tile */}
          <button
            onClick={() => {
              setView('dashboard');
              onClose();
            }}
            className="flex flex-col items-center justify-center p-3 rounded-xl hover:bg-slate-50 border border-slate-200 hover:border-blue-300 transition-all text-center group cursor-pointer bg-blue-50/20"
          >
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-white shadow-xs group-hover:scale-105 transition-transform mb-2 p-1.5 border border-slate-200">
              <img src="/icon-192.png" alt="Gothwad Account" className="w-full h-full object-contain" />
            </div>
            <span className="text-xs font-bold text-slate-900 group-hover:text-blue-600 line-clamp-1">
              Account
            </span>
            <span className="text-[10px] text-blue-600 font-medium mt-0.5">
              Hub
            </span>
          </button>

          {apps.map((app) => (
            <button
              key={app.id}
              onClick={() => handleAppClick(app)}
              className="flex flex-col items-center justify-center p-3 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-all text-center group cursor-pointer"
            >
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-slate-100 group-hover:scale-105 transition-transform mb-2">
                {ICON_MAP[app.iconName] || <Compass className="w-6 h-6 text-slate-700" />}
              </div>
              <span className="text-xs font-medium text-slate-800 group-hover:text-blue-600 line-clamp-1">
                {app.name.replace('Gothwad ', '')}
              </span>
              <span className="text-[10px] text-slate-500 font-mono mt-0.5 truncate max-w-full">
                {app.subdomain.split('.')[0]}
              </span>
            </button>
          ))}
        </div>

        <div className="mt-3 pt-3 border-t border-slate-100 px-2 flex items-center justify-between">
          <button
            onClick={() => {
              setView('architecture-lab');
              onClose();
            }}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 hover:underline cursor-pointer"
          >
            <span>Worker & Supabase Config</span>
            <ExternalLink className="w-3 h-3" />
          </button>
          <span className="text-[11px] text-slate-500 font-mono">*.gothwadtech.com</span>
        </div>
      </div>
    </div>
  );
};
