import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  ChevronDown,
  Globe,
  Laptop,
  LogOut,
  Menu,
  Moon,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Sun,
  User,
} from 'lucide-react';
import { Dropdown, DropdownMenuItem } from '../components/Dropdown';
import { Button } from '../components/Button';
import {
  ApplicationRecord,
  CustomerRecord,
  GlobalSearchResult,
  NotificationItem,
  PageKey,
  TransactionRecord,
  UserProfile,
} from '../modules/types';
import { SIDEBAR_NAV_ITEMS } from '../modules/navigation';
import { QuickCreateMode } from '../components/QuickCreateModal';
import { formatCurrency } from '../services/apiClient';
import { LanguageCode, useLanguage } from '../i18n/translations';

interface TopNavbarProps {
  activePage: PageKey;
  user: UserProfile;
  customers: CustomerRecord[];
  applications: ApplicationRecord[];
  transactions: TransactionRecord[];
  notifications: NotificationItem[];
  theme: 'light' | 'dark';
  onChangeTheme: (theme: 'light' | 'dark') => void;
  onChangeLanguage: (lang: LanguageCode) => void;
  onOpenMobileMenu: () => void;
  onNavigate: (page: PageKey) => void;
  onOpenQuickCreate: (mode: QuickCreateMode) => void;
  onSelectApplication: (app: ApplicationRecord) => void;
  onMarkAllRead: () => void;
  onRequestLogout: () => void;
}

export const TopNavbar: React.FC<TopNavbarProps> = ({
  activePage,
  user,
  customers,
  applications,
  transactions,
  notifications,
  theme,
  onChangeTheme,
  onChangeLanguage,
  onOpenMobileMenu,
  onNavigate,
  onOpenQuickCreate,
  onSelectApplication,
  onMarkAllRead,
  onRequestLogout,
}) => {
  const { language, t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const currentNav = SIDEBAR_NAV_ITEMS.find((n) => n.id === activePage);
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchResults = useMemo<GlobalSearchResult[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];

    const results: GlobalSearchResult[] = [];

    SIDEBAR_NAV_ITEMS.forEach((nav) => {
      const allowed =
        !nav.requiredPermission ||
        user.role === 'ADMIN' ||
        Boolean(user.permissions?.[nav.requiredPermission]);
      const localized = t.navLabels[nav.id] ?? nav.label;
      if (
        allowed &&
        (nav.label.toLowerCase().includes(q) ||
          localized.toLowerCase().includes(q) ||
          nav.description.toLowerCase().includes(q))
      ) {
        results.push({
          id: `page-${nav.id}`,
          type: 'Page',
          title: localized,
          subtitle: t.navGroups[nav.group] ?? nav.group,
          targetPage: nav.id,
        });
      }
    });

    applications.forEach((app) => {
      if (
        app.applicationNo.toLowerCase().includes(q) ||
        app.customerName.toLowerCase().includes(q) ||
        app.serviceName.toLowerCase().includes(q)
      ) {
        results.push({
          id: `app-${app.id}`,
          type: 'Application',
          title: `${app.applicationNo} — ${app.customerName}`,
          subtitle: `${app.serviceName} · ${app.status}`,
          targetPage: 'applications',
          recordId: app.id,
        });
      }
    });

    customers.forEach((cust) => {
      if (
        cust.fullName.toLowerCase().includes(q) ||
        cust.customerCode.toLowerCase().includes(q) ||
        cust.phone.toLowerCase().includes(q)
      ) {
        results.push({
          id: `cust-${cust.id}`,
          type: 'Customer',
          title: `${cust.fullName} (${cust.customerCode})`,
          subtitle: `${cust.segment} · ${cust.phone}`,
          targetPage: 'customers',
          recordId: cust.id,
        });
      }
    });

    if (user.role === 'ADMIN' || user.permissions?.['transactions.VIEW']) {
      transactions.forEach((txn) => {
        if (
          txn.referenceNo.toLowerCase().includes(q) ||
          txn.customerName.toLowerCase().includes(q)
        ) {
          results.push({
            id: `txn-${txn.id}`,
            type: 'Transaction',
            title: `${txn.referenceNo} — ${formatCurrency(txn.amount)}`,
            subtitle: `${txn.customerName} · ${txn.paymentMethod}`,
            targetPage: 'transactions',
            recordId: txn.id,
          });
        }
      });
    }

    return results.slice(0, 8);
  }, [searchQuery, applications, customers, transactions, user, t]);

  const handleSearchSelect = (res: GlobalSearchResult) => {
    setSearchQuery('');
    setSearchFocused(false);
    if (res.type === 'Application' && res.recordId) {
      const found = applications.find((a) => a.id === res.recordId);
      if (found) {
        onSelectApplication(found);
        return;
      }
    }
    onNavigate(res.targetPage);
  };

  const quickCreateItems: DropdownMenuItem[] = [
    {
      id: 'new-application',
      label: t.newApplication,
      onClick: () => onOpenQuickCreate('application'),
    },
    {
      id: 'new-customer',
      label: t.addCustomer,
      onClick: () => onOpenQuickCreate('customer'),
    },
    ...(user.role === 'ADMIN' || user.permissions?.['users.ADD']
      ? [
          {
            id: 'new-user',
            label: t.navLabels['add-user'] ?? 'Add User / Register Staff',
            onClick: () => onNavigate('add-user'),
          },
        ]
      : []),
  ];

  const userMenuItems: DropdownMenuItem[] = [
    {
      id: 'profile',
      label: t.navLabels['user-profile'] ?? 'My Profile & Password',
      icon: <User className="h-4 w-4" />,
      onClick: () => onNavigate('user-profile'),
    },
    {
      id: 'sessions',
      label: t.navLabels['sessions'] ?? 'Session Management',
      icon: <Laptop className="h-4 w-4" />,
      onClick: () => onNavigate('sessions'),
    },
    ...(user.role === 'ADMIN' || user.permissions?.['settings_proposal.VIEW']
      ? [
          {
            id: 'master-settings',
            label: t.navLabels['master-settings'] ?? 'Master Settings',
            icon: <SlidersHorizontal className="h-4 w-4" />,
            onClick: () => onNavigate('master-settings'),
          },
        ]
      : []),
    ...(user.role === 'ADMIN'
      ? [
          {
            id: 'system-settings',
            label: t.navLabels['settings'] ?? 'System Architecture',
            icon: <Settings className="h-4 w-4" />,
            onClick: () => onNavigate('settings'),
          },
        ]
      : []),
    {
      id: 'logout',
      label: t.signOut,
      icon: <LogOut className="h-4 w-4 text-red-600" />,
      onClick: onRequestLogout,
      danger: true,
      dividerAbove: true,
    },
  ];

  return (
    <header className="no-print h-16 bg-white dark:bg-neutral-950 border-b border-neutral-200 dark:border-neutral-800 px-4 sm:px-6 flex items-center justify-between gap-3 shrink-0 sticky top-0 z-30">
      {/* Left: Mobile Trigger + Contextual Breadcrumb */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Open navigation menu"
          className="lg:hidden h-10 w-10 inline-flex items-center justify-center rounded-md border border-neutral-200 dark:border-neutral-700 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-900 cursor-pointer shrink-0"
        >
          <Menu className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-2 text-sm min-w-0">
          <span className="hidden sm:inline text-neutral-400 dark:text-neutral-500 whitespace-nowrap">
            {t.workspace}
          </span>
          <span className="hidden sm:inline text-neutral-300 dark:text-neutral-700" aria-hidden="true">
            /
          </span>
          <h1 className="font-semibold text-neutral-950 dark:text-white truncate">
            {currentNav ? (t.navLabels[currentNav.id] ?? currentNav.label) : t.navLabels.dashboard}
          </h1>
        </div>
      </div>

      {/* Center: Global Search */}
      <div ref={searchRef} className="relative flex-1 max-w-md hidden xl:block">
        <div className="relative">
          <Search
            className="h-4 w-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchQuery}
            onFocus={() => setSearchFocused(true)}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSearchFocused(true);
            }}
            placeholder={t.searchPlaceholder}
            aria-label="Global search"
            className="w-full h-9 pl-9 pr-3 text-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md text-neutral-950 dark:text-neutral-100 placeholder:text-neutral-400 focus:bg-white dark:focus:bg-neutral-950 focus:outline-none focus:border-blue-800 transition-colors"
          />
        </div>

        {searchFocused && searchQuery.trim().length > 0 && (
          <div className="absolute left-0 right-0 mt-1.5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg overflow-hidden z-40">
            {searchResults.length === 0 ? (
              <div className="px-4 py-4 text-xs text-neutral-500 dark:text-neutral-400">
                No matching records found for “{searchQuery}”.
              </div>
            ) : (
              <ul className="divide-y divide-neutral-100 dark:divide-neutral-800 max-h-80 overflow-y-auto">
                {searchResults.map((res) => (
                  <li key={res.id}>
                    <button
                      type="button"
                      onClick={() => handleSearchSelect(res)}
                      className="w-full px-4 py-2.5 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800 flex items-center justify-between gap-3 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-neutral-950 dark:text-neutral-100 truncate">
                          {res.title}
                        </div>
                        <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                          {res.subtitle}
                        </div>
                      </div>
                      <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 shrink-0">
                        {res.type}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Right: Language Switcher, Theme Toggle, Quick Action, Notifications, User Dropdown */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Language Switcher */}
        <div
          role="group"
          aria-label="Language switcher"
          className="hidden sm:inline-flex items-center border border-neutral-200 dark:border-neutral-700 rounded-md overflow-hidden bg-neutral-50 dark:bg-neutral-900 shrink-0"
        >
          <span className="px-2 text-neutral-400 dark:text-neutral-500 hidden md:inline-flex items-center">
            <Globe className="h-3.5 w-3.5" />
          </span>
          {(
            [
              { code: 'en', short: 'EN' },
              { code: 'bn', short: 'বাংলা' },
              { code: 'hi', short: 'हि' },
            ] as Array<{ code: LanguageCode; short: string }>
          ).map((item) => {
            const active = language === item.code;
            return (
              <button
                key={item.code}
                type="button"
                onClick={() => onChangeLanguage(item.code)}
                className={`h-8 px-2 text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  active
                    ? 'bg-neutral-950 text-white dark:bg-white dark:text-neutral-950'
                    : 'text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                }`}
              >
                {item.short}
              </button>
            );
          })}
        </div>

        {/* Light/Dark Mode Toggle */}
        <button
          type="button"
          onClick={() => onChangeTheme(theme === 'dark' ? 'light' : 'dark')}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={theme === 'dark' ? t.lightMode : t.darkMode}
          className="h-9 px-2.5 inline-flex items-center gap-1.5 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer"
        >
          {theme === 'dark' ? (
            <>
              <Sun className="h-3.5 w-3.5" />
              <span className="hidden md:inline">{t.lightMode}</span>
            </>
          ) : (
            <>
              <Moon className="h-3.5 w-3.5" />
              <span className="hidden md:inline">{t.darkMode}</span>
            </>
          )}
        </button>

        {user.role !== 'CUSTOMER' && (
          <Dropdown
            align="right"
            widthClass="w-56"
            items={quickCreateItems}
            trigger={
              <Button variant="primary" size="sm" icon={<Plus className="h-3.5 w-3.5" />}>
                <span className="whitespace-nowrap">{t.quickAdd}</span>
                <ChevronDown className="h-3.5 w-3.5 opacity-80" />
              </Button>
            }
          />
        )}

        <Dropdown
          align="right"
          widthClass="w-80"
          trigger={
            <button
              type="button"
              aria-label={t.notifications}
              className="relative h-9 w-9 inline-flex items-center justify-center rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-50 dark:hover:bg-neutral-800 hover:text-neutral-950 dark:hover:text-white cursor-pointer shrink-0"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="sr-only">{unreadCount} unread notifications</span>
              )}
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded bg-blue-900 text-white text-[10px] font-mono tabular-nums flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>
          }
          header={
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-neutral-950 dark:text-white">
                {t.notifications}
              </span>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={onMarkAllRead}
                  className="text-xs text-blue-800 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  {t.markAllRead}
                </button>
              )}
            </div>
          }
          customContent={
            <div className="divide-y divide-neutral-100 dark:divide-neutral-800 max-h-72 overflow-y-auto">
              {notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => onNavigate('notifications')}
                  className="w-full px-3.5 py-2.5 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800 cursor-pointer"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-xs font-medium ${
                        n.isRead
                          ? 'text-neutral-600 dark:text-neutral-400'
                          : 'text-neutral-950 dark:text-white'
                      }`}
                    >
                      {n.title}
                    </span>
                    <span className="text-[11px] text-neutral-400 shrink-0">
                      {n.createdAt}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400 line-clamp-2">
                    {n.message}
                  </p>
                </button>
              ))}
            </div>
          }
        />

        <Dropdown
          align="right"
          widthClass="w-64"
          items={userMenuItems}
          header={
            <div>
              <div className="text-sm font-semibold text-neutral-950 dark:text-white truncate">
                {user.fullName}
              </div>
              <div className="text-xs font-mono text-neutral-600 dark:text-neutral-300 mt-0.5">
                {user.userId}
              </div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate mt-0.5">
                {user.role} · {user.branch}
              </div>
            </div>
          }
          trigger={
            <button
              type="button"
              aria-label="User account menu"
              className="h-9 pl-1.5 pr-2.5 inline-flex items-center gap-2 rounded-md border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 hover:bg-neutral-50 dark:hover:bg-neutral-800 cursor-pointer shrink-0"
            >
              <span className="h-6 w-6 rounded bg-neutral-950 dark:bg-white text-white dark:text-neutral-950 text-xs font-semibold flex items-center justify-center shrink-0">
                {user.avatarInitials}
              </span>
              <span className="hidden sm:inline text-xs font-medium text-neutral-900 dark:text-neutral-100 whitespace-nowrap">
                {user.fullName}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-neutral-500 dark:text-neutral-400 shrink-0" />
            </button>
          }
        />
      </div>
    </header>
  );
};
