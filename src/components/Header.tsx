import React from 'react';
import { Map as MapIcon, Layers, Settings, User as UserIcon, LogOut, Languages } from 'lucide-react';
import { User } from 'firebase/auth';
import { useTranslation } from 'react-i18next';

interface HeaderProps {
  user: User;
  onSignOut: () => void;
  onOpenSettings: () => void;
}

export const Header: React.FC<HeaderProps> = ({ user, onSignOut, onOpenSettings }) => {
  const { t, i18n } = useTranslation();

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  return (
    <header className="h-16 border-b border-gray-200 bg-white flex items-center justify-between px-4 md:px-6 shrink-0">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 sm:w-10 sm:h-10 bg-black rounded-lg flex items-center justify-center text-white">
          <MapIcon size={18} className="sm:hidden" />
          <MapIcon size={24} className="hidden sm:block" />
        </div>
        <div className="hidden xs:block">
          <h1 className="font-bold text-sm sm:text-lg leading-tight">{t('app.name')}</h1>
          <p className="hidden sm:block text-xs text-gray-400 font-medium uppercase tracking-widest">{t('app.welcome')}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-4">
        {/* Language Switcher */}
        <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
          {['pt', 'en', 'es'].map((lng) => (
            <button
              key={lng}
              onClick={() => changeLanguage(lng)}
              className={`px-2 py-1 text-[10px] font-black uppercase rounded transition-all ${
                i18n.language.startsWith(lng) ? 'bg-white shadow-sm text-black' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {lng}
            </button>
          ))}
        </div>

        <nav className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
          <button className="px-3 py-1.5 text-sm font-medium bg-white shadow-sm rounded-md flex items-center gap-2">
            <Layers size={14} />
            <span className="hidden xs:inline">Map</span>
          </button>
          <button 
            onClick={onOpenSettings}
            className="px-3 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-700 flex items-center gap-2 transition-colors"
          >
            <Settings size={14} />
            <span className="hidden xs:inline">{t('map.areas')}</span>
          </button>
        </nav>
        
        <div className="hidden sm:block w-px h-6 bg-gray-200 mx-2" />
        
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="text-right hidden md:block">
            <p className="text-sm font-semibold leading-none">{user.displayName}</p>
            <p className="text-xs text-gray-400">{user.email}</p>
          </div>
          <div className="relative group">
            <button className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gray-100 overflow-hidden border border-gray-200 hover:border-gray-300 transition-all">
              {user.photoURL ? (
                <img src={user.photoURL} alt={user.displayName || ''} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
              ) : (
                <>
                  <UserIcon size={16} className="m-auto text-gray-600 sm:hidden" />
                  <UserIcon size={20} className="m-auto text-gray-600 hidden sm:block" />
                </>
              )}
            </button>
            <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
              <div className="px-4 py-2 border-b border-gray-100 md:hidden">
                <p className="text-sm font-semibold truncate">{user.displayName}</p>
                <p className="text-xs text-gray-400 truncate">{user.email}</p>
              </div>
              <button
                onClick={onSignOut}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut size={14} />
                {t('app.logout')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
