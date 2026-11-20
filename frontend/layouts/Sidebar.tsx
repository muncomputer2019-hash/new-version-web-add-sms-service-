import React from 'react';
import {
  LayoutDashboard,
  Users,
  Briefcase,
  FileText,
  ArrowLeftRight,
  BookOpen,
  Receipt,
  TrendingUp,
  UserCheck,
  Package,
  Boxes,
  BarChart3,
  Bell,
  Star,
  Settings,
  SlidersHorizontal,
  X,
  UserPlus,
  Shield,
  KeyRound,
  ClipboardList,
  CheckSquare,
  History,
  ShieldAlert,
  Laptop,
  User,
  Landmark,
  Layers,
  FileSpreadsheet,
  PieChart,
  Wrench,
  Clock,
  Archive,
  FolderKanban,
  ShieldCheck,
  Smartphone,
  HardDriveDownload,
  ArchiveRestore,
  FlaskConical,
  ListChecks,
  Bug,
  Rocket,
  LayoutGrid,
  CreditCard,
  ClipboardCheck,
  MessageSquareWarning,
  UserCog,
  UserSquare2,
} from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { BRAND } from '../assets/brand';
import { SIDEBAR_NAV_ITEMS } from '../modules/navigation';
import { PageKey, UserProfile } from '../modules/types';
import { useLanguage } from '../i18n/translations';

interface SidebarProps {
  activePage: PageKey;
  user: UserProfile;
  onNavigate: (page: PageKey) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  unreadNotifications: number;
  logoSrc?: string | null;
}

const ICON_MAP: Record<PageKey, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  customers: Users,
  services: Briefcase,
  applications: FileText,
  transactions: ArrowLeftRight,
  cashbook: BookOpen,
  expenses: Receipt,
  income: TrendingUp,
  'finance-hub': Layers,
  'chart-of-accounts': FileSpreadsheet,
  'banking-csp': Landmark,
  employees: UserCheck,
  products: Package,
  inventory: Boxes,
  reports: BarChart3,
  'reports-catalog': FolderKanban,
  'reports-analytics': PieChart,
  'reports-builder': Wrench,
  'reports-scheduler': Clock,
  'reports-archive': Archive,
  notifications: Bell,
  'master-settings': SlidersHorizontal,
  settings: Settings,
  users: Users,
  'add-user': UserPlus,
  'user-profile': User,
  roles: Shield,
  permissions: KeyRound,
  'registration-requests': ClipboardList,
  approvals: CheckSquare,
  'login-history': History,
  'security-logs': ShieldAlert,
  sessions: Laptop,
  'security-dashboard': ShieldCheck,
  'device-monitoring': Smartphone,
  'backup-recovery': HardDriveDownload,
  'data-recovery': ArchiveRestore,
  'qa-dashboard': FlaskConical,
  'qa-workbench': ListChecks,
  'qa-bugs': Bug,
  'qa-release': Rocket,
  'customer-portal': UserSquare2,
  feedback: Star,
};

const GROUPS: Array<
  | 'Overview'
  | 'Citizen Portal'
  | 'Operations'
  | 'Finance'
  | 'Catalog & Team'
  | 'Reports & BI'
  | 'Security & Access'
  | 'Quality & Release'
  | 'System'
> = [
  'Overview',
  'Citizen Portal',
  'Operations',
  'Finance',
  'Catalog & Team',
  'Reports & BI',
  'Security & Access',
  'Quality & Release',
  'System',
];

export const Sidebar: React.FC<SidebarProps> = ({
  activePage,
  user,
  onNavigate,
  mobileOpen,
  onCloseMobile,
  unreadNotifications,
  logoSrc,
}) => {
  const { t } = useLanguage();

  const canSeeNav = (itemId: PageKey, requiredPerm?: string): boolean => {
    if (user.role === 'CUSTOMER') {
      return itemId === 'customer-portal' || itemId === 'user-profile';
    }
    if (itemId === 'customer-portal') return false;
    if (!requiredPerm) return true;
    if (user.role === 'ADMIN') return true;
    return Boolean(user.permissions?.[requiredPerm]);
  };

  const navContent = (
    <div className="flex flex-col h-full bg-white dark:bg-neutral-950 border-r border-neutral-200 dark:border-neutral-800 w-64 select-none">
      {/* Sidebar Brand Header */}
      <div className="h-16 px-5 flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 shrink-0">
        <button
          type="button"
          onClick={() => {
            onNavigate(user.role === 'CUSTOMER' ? 'customer-portal' : 'dashboard');
            onCloseMobile();
          }}
          className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-800 rounded cursor-pointer"
        >
          <BrandLogo size="sm" logoSrc={logoSrc} />
        </button>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          className="lg:hidden p-1.5 rounded-md text-neutral-500 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-neutral-900 cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Navigation Groups */}
      <nav aria-label="Primary Sidebar" className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {GROUPS.map((group) => {
          const items = SIDEBAR_NAV_ITEMS.filter(
            (item) => item.group === group && canSeeNav(item.id, item.requiredPermission)
          );
          if (items.length === 0) return null;

          return (
            <div key={group}>
              <div className="px-3 mb-1.5 text-[11px] font-semibold text-neutral-400 dark:text-neutral-500 tracking-wide">
                {t.navGroups[group] ?? group}
              </div>
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const Icon = ICON_MAP[item.id];
                  const isActive = activePage === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onNavigate(item.id);
                          onCloseMobile();
                        }}
                        aria-current={isActive ? 'page' : undefined}
                        className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-md text-sm transition-colors duration-150 cursor-pointer whitespace-nowrap ${
                          isActive
                            ? 'bg-neutral-950 text-white dark:bg-white dark:text-neutral-950 font-medium'
                            : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-900 hover:text-neutral-950 dark:hover:text-white'
                        }`}
                      >
                        <span className="flex items-center gap-2.5 min-w-0">
                          <Icon
                            className={`h-4 w-4 shrink-0 ${
                              isActive
                                ? 'text-white dark:text-neutral-950'
                                : 'text-neutral-500 dark:text-neutral-400'
                            }`}
                          />
                          <span className="truncate">
                            {t.navLabels[item.id] ?? item.label}
                          </span>
                        </span>

                        {item.id === 'notifications' && unreadNotifications > 0 && (
                          <span
                            className={`text-xs font-mono tabular-nums ${
                              isActive
                                ? 'text-neutral-300 dark:text-neutral-700'
                                : 'text-blue-800 dark:text-blue-400 font-semibold'
                            }`}
                          >
                            {unreadNotifications}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      {/* Quiet Brand Footer */}
      <div className="px-5 py-3.5 border-t border-neutral-200 dark:border-neutral-800 text-xs text-neutral-500 dark:text-neutral-400 shrink-0">
        <div className="font-medium text-neutral-800 dark:text-neutral-200">{BRAND.name}</div>
        <div className="mt-0.5 font-mono text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
          {user.userId} · {user.role}
        </div>
        <div className="mt-0.5 tabular-nums">
          v{BRAND.version} · Phase 09 QA & Release
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden lg:block shrink-0 no-print">{navContent}</aside>

      {/* Mobile / Tablet Slide-over Drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden flex no-print"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile Navigation"
        >
          <div
            className="fixed inset-0 bg-neutral-950/50"
            onClick={onCloseMobile}
          />
          <div className="relative z-10 h-full">{navContent}</div>
        </div>
      )}
    </>
  );
};
