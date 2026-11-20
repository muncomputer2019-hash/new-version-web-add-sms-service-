import React from 'react';
import { Sidebar } from './Sidebar';
import { TopNavbar } from './TopNavbar';
import { BRAND } from '../assets/brand';
import {
  ApplicationRecord,
  CustomerRecord,
  NotificationItem,
  PageKey,
  TransactionRecord,
  UserProfile,
} from '../modules/types';
import { QuickCreateMode } from '../components/QuickCreateModal';
import { LanguageCode } from '../i18n/translations';

interface DashboardLayoutProps {
  activePage: PageKey;
  user: UserProfile;
  customers: CustomerRecord[];
  applications: ApplicationRecord[];
  transactions: TransactionRecord[];
  notifications: NotificationItem[];
  mobileMenuOpen: boolean;
  theme: 'light' | 'dark';
  logoSrc?: string | null;
  sessionExpiresAt?: string | null;
  sessionRememberMe?: boolean;
  onChangeTheme: (theme: 'light' | 'dark') => void;
  onChangeLanguage: (lang: LanguageCode) => void;
  onSetMobileMenuOpen: (open: boolean) => void;
  onNavigate: (page: PageKey) => void;
  onOpenQuickCreate: (mode: QuickCreateMode) => void;
  onSelectApplication: (app: ApplicationRecord) => void;
  onMarkAllRead: () => void;
  onRequestLogout: () => void;
  children: React.ReactNode;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  activePage,
  user,
  customers,
  applications,
  transactions,
  notifications,
  mobileMenuOpen,
  theme,
  logoSrc,
  sessionExpiresAt,
  sessionRememberMe,
  onChangeTheme,
  onChangeLanguage,
  onSetMobileMenuOpen,
  onNavigate,
  onOpenQuickCreate,
  onSelectApplication,
  onMarkAllRead,
  onRequestLogout,
  children,
}) => {
  const unreadNotifications = notifications.filter((n) => !n.isRead).length;
  const remainingMinutes = sessionExpiresAt
    ? Math.max(0, Math.ceil((Date.parse(sessionExpiresAt) - Date.now()) / 60000))
    : null;
  const showExpiryWarning = remainingMinutes !== null && remainingMinutes <= 10;

  return (
    <div className="min-h-screen flex bg-white dark:bg-neutral-950 text-neutral-950 dark:text-neutral-100 transition-colors">
      <Sidebar
        activePage={activePage}
        user={user}
        onNavigate={onNavigate}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => onSetMobileMenuOpen(false)}
        unreadNotifications={unreadNotifications}
        logoSrc={logoSrc}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TopNavbar
          activePage={activePage}
          user={user}
          customers={customers}
          applications={applications}
          transactions={transactions}
          notifications={notifications}
          theme={theme}
          onChangeTheme={onChangeTheme}
          onChangeLanguage={onChangeLanguage}
          onOpenMobileMenu={() => onSetMobileMenuOpen(true)}
          onNavigate={onNavigate}
          onOpenQuickCreate={onOpenQuickCreate}
          onSelectApplication={onSelectApplication}
          onMarkAllRead={onMarkAllRead}
          onRequestLogout={onRequestLogout}
        />

        {showExpiryWarning && (
          <div className="no-print bg-amber-50 dark:bg-amber-950/50 border-b border-amber-200 dark:border-amber-900 px-4 sm:px-6 lg:px-8 py-2 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between gap-2">
            <span>
              Security Notice: Your session expires in{' '}
              <strong className="font-mono">{remainingMinutes} minute(s)</strong>
              {sessionRememberMe ? ' (240-min Remember Me maximum).' : '.'} Save pending work before automatic logout.
            </span>
            <button
              type="button"
              onClick={() => onNavigate('sessions')}
              className="font-semibold underline cursor-pointer shrink-0"
            >
              Manage Session
            </button>
          </div>
        )}

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 max-w-[1440px] w-full mx-auto">
          {children}
        </main>

        <footer className="no-print border-t border-neutral-200 dark:border-neutral-800 px-4 sm:px-6 lg:px-8 py-3.5 text-xs text-neutral-500 dark:text-neutral-400 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white dark:bg-neutral-950">
          <span>
            {BRAND.copyright}{' '}
            <a
              href={BRAND.websiteUrl}
              className="hover:underline text-neutral-700 dark:text-neutral-300"
            >
              www.muncomputer.org
            </a>{' '}
            · All rights reserved.
          </span>
          <span className="tabular-nums">
            v{BRAND.version} · Updated {BRAND.builtAtLabel}
            {remainingMinutes !== null ? ` · Session TTL: ${remainingMinutes}m` : ''}
          </span>
        </footer>
      </div>
    </div>
  );
};
