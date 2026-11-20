import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ApplicationRecord,
  CustomerRecord,
  DailyCashClosingRecord,
  ErpDashboardSummary,
  ErpNotificationDispatchItem,
  LanguageCode,
  MasterSettingsOverview,
  NotificationItem,
  PageKey,
  ServiceRateItem,
  ThemeMode,
  ToastMessage,
  TransactionRecord,
  UserProfile,
} from './modules/types';
import { SIDEBAR_NAV_ITEMS } from './modules/navigation';
import { cacheUiPrefs, getCachedUiPrefs } from './services/firebase';
import { securityRequest, setAuthToken, setCsrfToken } from './services/securityApi';
import { erpApi } from './services/erpApi';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LanguageProvider } from './i18n/translations';
import { DashboardLayout } from './layouts/DashboardLayout';
import { DashboardPage } from './pages/DashboardPage';
import { NotificationsPage } from './pages/DirectoryPages';
import { CustomersCrmPage } from './pages/erp/CustomersCrmPage';
import { ServicesCatalogPage } from './pages/erp/ServicesCatalogPage';
import { CustomerFeedbackPage } from './pages/CustomerFeedbackPage';
import { ApplicationsWorkspacePage } from './pages/erp/ApplicationsWorkspacePage';
import { FinancialLedgerPage } from './pages/erp/FinancialLedgerPage';
import { PayrollEmployeesPage } from './pages/erp/PayrollEmployeesPage';
import { ProductsInventoryPage } from './pages/erp/ProductsInventoryPage';
import { FinanceEngineHubPage } from './pages/finance/FinanceEngineHubPage';
import { ChartOfAccountsPage } from './pages/finance/ChartOfAccountsPage';
import { BankingAndCspPage } from './pages/finance/BankingAndCspPage';
import { ReportsDashboardPage } from './pages/reports/ReportsDashboardPage';
import { AllReportsCenterPage } from './pages/reports/AllReportsCenterPage';
import { BusinessAnalyticsPage } from './pages/reports/BusinessAnalyticsPage';
import { CustomReportBuilderPage } from './pages/reports/CustomReportBuilderPage';
import { ScheduledReportsPage } from './pages/reports/ScheduledReportsPage';
import { ReportArchiveAuditPage } from './pages/reports/ReportArchiveAuditPage';
import { ModulePlaceholderPage } from './pages/ModulePlaceholderPage';
import { SettingsPage } from './pages/SettingsPage';
import { MasterSettingsHub } from './pages/master-settings/MasterSettingsHub';
import { LoginPage } from './pages/LoginPage';
import {
  AddUserPage,
  UserProfilePage,
  UsersPage,
} from './pages/UserManagementPages';
import { PermissionsPage, RolesPage } from './pages/AccessControlPages';
import { ApprovalsManagementPage } from './pages/ApprovalsPages';
import { SecurityLogsPage, SessionsPage } from './pages/SecurityAuditPages';
import { SecurityDashboardPage } from './pages/security/SecurityDashboardPage';
import { DeviceMonitoringPage } from './pages/security/DeviceMonitoringPage';
import { BackupRecoveryPage } from './pages/security/BackupRecoveryPage';
import { DataRecoveryPage } from './pages/security/DataRecoveryPage';
import { QaDashboardPage } from './pages/qa/QaDashboardPage';
import { TestExecutionWorkbenchPage } from './pages/qa/TestExecutionWorkbenchPage';
import { BugAndRegressionPage } from './pages/qa/BugAndRegressionPage';
import { ReleaseUatPage } from './pages/qa/ReleaseUatPage';
import { CscServicesAndRatesPage } from './pages/csc/CscServicesAndRatesPage';
import { PvcPrintingPage } from './pages/csc/PvcPrintingPage';
import { CscOrdersPage } from './pages/csc/CscOrdersPage';
import { GrievanceRtiPage } from './pages/csc/GrievanceRtiPage';
import { OfficialSchemesHubPage } from './pages/csc/OfficialSchemesHubPage';
import { OperatorControlPage } from './pages/csc/OperatorControlPage';
import { CustomerPortalPage } from './pages/csc/CustomerPortalPage';
import {
  QuickCreateModal,
  QuickCreateMode,
} from './components/QuickCreateModal';
import { ApplicationDetailModal } from './components/ApplicationDetailModal';
import { ConfirmDialog } from './components/ConfirmDialog';
import { ToastContainer } from './components/ToastContainer';
import { Button } from './components/Button';

const INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000; // 60 minutes

export function MunComputerApp() {
  const [initialBootstrap] = useState(() => {
    const cachedPrefs = getCachedUiPrefs();
    return {
      initialUser: null as UserProfile | null,
      readyForData: false,
      authChecking: true,
      initialPage: 'dashboard' as PageKey,
      theme: (cachedPrefs.theme ?? 'light') as ThemeMode,
      language: (cachedPrefs.language ?? 'en') as LanguageCode,
    };
  });

  const [authChecking, setAuthChecking] = useState(initialBootstrap.authChecking);
  const [authReadyForData, setAuthReadyForData] = useState(initialBootstrap.readyForData);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(initialBootstrap.initialUser);
  const [inspectedUser, setInspectedUser] = useState<UserProfile | null>(null);
  const [activePage, setActivePage] = useState<PageKey>(initialBootstrap.initialPage);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<string | null>(null);
  const [sessionRememberMe, setSessionRememberMe] = useState<boolean>(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const signingOutRef = useRef(false);
  const authChannelRef = useRef<BroadcastChannel | null>(null);

  // Phase 03 Theme, Localization & Master Configuration Workspace
  const [theme, setTheme] = useState<ThemeMode>(initialBootstrap.theme);
  const [language, setLanguage] = useState<LanguageCode>(initialBootstrap.language);
  const [masterOverview, setMasterOverview] = useState<MasterSettingsOverview | null>(null);
  const [serviceRates, setServiceRates] = useState<ServiceRateItem[]>([]);
  const [dailyCashClosings, setDailyCashClosings] = useState<DailyCashClosingRecord[]>([]);

  // Live Operational & Enterprise ERP State
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [applications, setApplications] = useState<ApplicationRecord[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [erpSummary, setErpSummary] = useState<ErpDashboardSummary | null>(null);
  const [erpNotifications, setErpNotifications] = useState<ErpNotificationDispatchItem[]>([]);
  const [appLaunchContext, setAppLaunchContext] = useState<{
    scope?: string;
    customerId?: string | null;
    serviceId?: string | null;
    selectedAppNo?: string | null;
    startWizard?: boolean;
  }>({});
  const [quickReportKey, setQuickReportKey] = useState<string | null>(null);
  const [cscLaunchServiceId, setCscLaunchServiceId] = useState<string | null>(null);

  // Modals & Notifications
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickCreateMode, setQuickCreateMode] = useState<QuickCreateMode>('application');
  const [selectedApplication, setSelectedApplication] = useState<ApplicationRecord | null>(null);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (type: ToastMessage['type'], title: string, description?: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, { id, type, title, description }]);
      setTimeout(() => {
        dismissToast(id);
      }, 4200);
    },
    [dismissToast]
  );

  // Sync Tailwind v4 class-based dark mode on <html>
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', theme === 'dark');
    }
  }, [theme]);

  // Authoritative HTTP-only backend session restoration + multi-tab BroadcastChannel sync
  useEffect(() => {
    let active = true;

    const hydrateServerSession = () => {
      securityRequest<{
        user: Omit<UserProfile, 'avatarInitials'>;
        permissions: Record<string, boolean>;
        csrfToken: string | null;
        session?: {
          id: string;
          expiresAt: string;
          rememberMe?: boolean;
        };
      }>('/api/auth/me', { timeoutMs: 3500 })
        .then((res) => {
          if (!active) return;
          setCsrfToken(res.data.csrfToken);
          const initials = res.data.user.fullName
            .split(' ')
            .map((p) => p[0])
            .slice(0, 2)
            .join('')
            .toUpperCase();
          const loadedUser: UserProfile = {
            ...res.data.user,
            avatarInitials: initials || 'MC',
            permissions: res.data.permissions,
          };
          setCurrentUser(loadedUser);
          setAuthReadyForData(true);
          if (res.data.session?.expiresAt) {
            setSessionExpiresAt(res.data.session.expiresAt);
            setSessionRememberMe(Boolean(res.data.session.rememberMe));
          }
          if (loadedUser.role === 'CUSTOMER') {
            setActivePage('customer-portal');
          }
        })
        .catch(() => {
          if (!active) return;
          setCsrfToken(null);
          setAuthToken(null);
          setCurrentUser(null);
          setAuthReadyForData(false);
        })
        .finally(() => {
          if (active) setAuthChecking(false);
        });
    };

    hydrateServerSession();

    const handleAuthExpired = () => {
      if (!active) return;
      setCsrfToken(null);
      setAuthToken(null);
      setCurrentUser(null);
      setAuthReadyForData(false);
      setSessionExpiresAt(null);
      setSessionRememberMe(false);
      showToast('error', 'Session Expired', 'Please sign in again to continue.');
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('mun:auth-expired', handleAuthExpired);
    }

    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel('mun_auth_sync');
      authChannelRef.current = channel;
      channel.onmessage = (evt: MessageEvent<{ type?: string }>) => {
        if (!active) return;
        if (evt.data?.type === 'LOGOUT') {
          setCsrfToken(null);
          setAuthToken(null);
          setCurrentUser(null);
          setAuthReadyForData(false);
          setSessionExpiresAt(null);
          setSessionRememberMe(false);
          setLogoutConfirmOpen(false);
        } else if (evt.data?.type === 'LOGIN') {
          hydrateServerSession();
        }
      };
    }

    return () => {
      active = false;
      if (typeof window !== 'undefined') {
        window.removeEventListener('mun:auth-expired', handleAuthExpired);
      }
      authChannelRef.current?.close();
      authChannelRef.current = null;
    };
  }, [showToast]);

  const loadPhase03Workspace = useCallback(async (role?: UserProfile['role']) => {
    try {
      if (role === 'CUSTOMER') {
        return;
      }
      const [ovRes, ratesRes, cashRes, erpDashRes, erpNotifRes, custRes] = await Promise.allSettled([
        securityRequest<MasterSettingsOverview>('/api/master-settings/overview'),
        securityRequest<{ rates: ServiceRateItem[] }>('/api/service-rates'),
        securityRequest<DailyCashClosingRecord[]>('/api/daily-cash'),
        erpApi.getDashboardSummary(),
        erpApi.listNotifications(),
        erpApi.listCustomers(),
      ]);
      if (ovRes.status === 'fulfilled') {
        setMasterOverview(ovRes.value.data);
        const nextLang = ovRes.value.data.userLanguage ?? 'en';
        const nextTheme = ovRes.value.data.appearanceTheme ?? 'light';
        setLanguage(nextLang);
        setTheme(nextTheme);
        cacheUiPrefs({ theme: nextTheme, language: nextLang });
      }
      if (ratesRes.status === 'fulfilled') {
        setServiceRates(ratesRes.value.data.rates);
      }
      if (cashRes.status === 'fulfilled') {
        setDailyCashClosings(cashRes.value.data);
      }
      if (erpDashRes.status === 'fulfilled') {
        const dash = erpDashRes.value.data;
        setErpSummary(dash);
        setApplications(
          (dash.recentApplications || []).map((a) => ({
            id: a.id,
            applicationNo: a.applicationNo,
            customerId: 0,
            customerName: a.customerSnapshot.fullName,
            customerPhone: a.customerSnapshot.mobile,
            serviceName: a.serviceSnapshot.name,
            category: a.serviceSnapshot.categoryName,
            feeAmount: a.financialSummary.serviceCharge,
            paidAmount: a.financialSummary.totalPaid,
            assignedTo: a.assignedStaffId || 'Unassigned',
            status:
              a.status === 'Completed' || a.status === 'Approved'
                ? 'Completed'
                : a.status === 'On Hold' || a.status === 'Rejected' || a.status === 'Cancelled'
                  ? 'On Hold'
                  : a.status === 'Processing' || a.status === 'Under Review'
                    ? 'Processing'
                    : 'Pending',
            submittedAt: a.createdAt,
            dueDate: a.expectedCompletionDate,
            notes: `Status: ${a.status}`,
          }))
        );
        setTransactions(
          (dash.recentPayments || []).map((p) => ({
            id: p.id,
            referenceNo: p.receiptNo || p.transactionId,
            applicationNo: p.applicationNo,
            customerName: p.customerName || p.customerId,
            paymentMethod:
              p.paymentMethod === 'UPI'
                ? 'Mobile Banking'
                : p.paymentMethod === 'Other'
                  ? 'Cash'
                  : p.paymentMethod,
            amount: p.amount,
            type: 'Collection',
            status: p.verificationStatus === 'Confirmed' ? 'Paid' : 'Pending',
            recordedAt: p.recordedAt,
          }))
        );
      }
      if (custRes.status === 'fulfilled') {
        setCustomers(
          custRes.value.data.map((c) => ({
            id: c.id,
            customerCode: c.customerId,
            fullName: c.fullName,
            phone: c.mobile,
            email: c.email,
            segment: c.segment,
            status: c.status === 'Active' ? 'Active' : 'Inactive',
            totalApplications: c.stats?.applicationCount ?? 0,
            totalSpent: c.stats?.totalPaid ?? 0,
            createdAt: c.createdAt.slice(0, 10),
          }))
        );
      }
      if (erpNotifRes.status === 'fulfilled') {
        setErpNotifications(erpNotifRes.value.data);
        setNotifications(
          erpNotifRes.value.data.map((n) => ({
            id: n.id,
            title: n.eventKey,
            message: n.messagePreview,
            category: 'System' as const,
            createdAt: n.createdAt,
            isRead: false,
          }))
        );
      }
    } catch {
      // Non-blocking if session ended mid-flight
    }
  }, []);

  useEffect(() => {
    if (currentUser && authReadyForData) {
      loadPhase03Workspace(currentUser.role);
    } else if (!currentUser) {
      setMasterOverview(null);
      setServiceRates([]);
      setDailyCashClosings([]);
      setErpSummary(null);
      setErpNotifications([]);
      setCustomers([]);
      setApplications([]);
      setTransactions([]);
      setNotifications([]);
    }
  }, [currentUser, authReadyForData, loadPhase03Workspace]);

  const performLogout = useCallback(
    async (title = 'Signed Out', description = 'Session ended.') => {
      if (signingOutRef.current) return;
      signingOutRef.current = true;
      setLoggingOut(true);

      try {
        await securityRequest('/api/auth/logout', {
          method: 'POST',
          body: '{}',
          timeoutMs: 2500,
        }).catch(() => null);
      } finally {
        authChannelRef.current?.postMessage({ type: 'LOGOUT' });
        setCsrfToken(null);
        setAuthToken(null);
        setCurrentUser(null);
        setAuthReadyForData(false);
        setAuthChecking(false);
        setInspectedUser(null);
        setSessionExpiresAt(null);
        setSessionRememberMe(false);
        setLogoutConfirmOpen(false);
        setLoggingOut(false);
        signingOutRef.current = false;
        showToast('info', title, description);
      }
    },
    [showToast]
  );

  // Absolute server session expiry watcher (240-min Remember Me or 60-min standard cap)
  useEffect(() => {
    if (!currentUser || !sessionExpiresAt) return;
    const expiryMs = Date.parse(sessionExpiresAt);
    if (!Number.isFinite(expiryMs)) return;

    const checkExpiry = () => {
      if (Date.now() >= expiryMs) {
        performLogout(
          'Session Expired',
          sessionRememberMe
            ? 'Your 4-hour (240-minute) Remember Me session has expired. Please sign in again.'
            : 'Your session expired. Please sign in again.'
        );
      }
    };

    checkExpiry();
    const timer = setInterval(checkExpiry, 15_000);
    return () => clearInterval(timer);
  }, [currentUser, sessionExpiresAt, sessionRememberMe, performLogout]);

  // 60-minute inactivity auto-logout timer
  useEffect(() => {
    if (!currentUser || typeof window === 'undefined') return;
    let timeoutId: ReturnType<typeof setTimeout>;

    const resetTimer = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        performLogout(
          'Session Timed Out',
          'Automatically signed out after 60 minutes of inactivity.'
        );
      }, INACTIVITY_TIMEOUT_MS);
    };

    const events: Array<keyof WindowEventMap> = [
      'mousemove',
      'mousedown',
      'keydown',
      'scroll',
      'touchstart',
    ];
    events.forEach((evt) => window.addEventListener(evt, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      clearTimeout(timeoutId);
      events.forEach((evt) => window.removeEventListener(evt, resetTimer));
    };
  }, [currentUser, performLogout]);

  const handleChangeTheme = useCallback(
    async (nextTheme: ThemeMode) => {
      setTheme(nextTheme);
      cacheUiPrefs({ theme: nextTheme });
      if (currentUser) {
        try {
          await securityRequest('/api/master-settings/appearance', {
            method: 'PUT',
            body: JSON.stringify({ theme: nextTheme }),
          });
        } catch {
          // Keep UI theme responsive even if persistence request fails
        }
      }
    },
    [currentUser]
  );

  const handleChangeLanguage = useCallback(
    async (nextLang: LanguageCode) => {
      setLanguage(nextLang);
      cacheUiPrefs({ language: nextLang });
      if (currentUser) {
        try {
          await securityRequest('/api/master-settings/user-language', {
            method: 'PUT',
            body: JSON.stringify({ language: nextLang }),
          });
        } catch {
          // Keep selected UI language active
        }
      }
    },
    [currentUser]
  );

  const handleLoginSuccess = (
    user: UserProfile,
    permissions: Record<string, boolean>,
    sessionMeta?: { expiresAt?: string; rememberMe?: boolean }
  ) => {
    const rememberMe = Boolean(sessionMeta?.rememberMe);
    setCurrentUser({ ...user, permissions });
    setAuthReadyForData(true);
    setAuthChecking(false);
    setInspectedUser(null);
    setSessionExpiresAt(sessionMeta?.expiresAt ?? null);
    setSessionRememberMe(rememberMe);
    setActivePage(user.role === 'CUSTOMER' ? 'customer-portal' : 'dashboard');
    authChannelRef.current?.postMessage({ type: 'LOGIN' });
  };

  const handleLogout = async () => {
    await performLogout();
  };

  const handleNavigate = (page: PageKey) => {
    if (page === 'user-profile') {
      setInspectedUser(null);
    }
    setActivePage(page);
    if (page === 'dashboard' || page === 'notifications') {
      loadPhase03Workspace(currentUser?.role);
    }
  };

  const handleOpenQuickCreate = (mode: QuickCreateMode) => {
    if (mode === 'application') {
      setAppLaunchContext({
        scope: 'all',
        customerId: null,
        serviceId: null,
        selectedAppNo: null,
        startWizard: true,
      });
      setActivePage('applications');
      return;
    }
    setQuickCreateMode(mode);
    setQuickCreateOpen(true);
  };

  const handleCreateCustomer = async (
    payload: Omit<
      CustomerRecord,
      'id' | 'customerCode' | 'totalApplications' | 'totalSpent' | 'createdAt'
    >
  ) => {
    try {
      const res = await erpApi.createCustomer({
        fullName: payload.fullName,
        mobile: payload.phone,
        whatsapp: payload.phone,
        email: payload.email,
        segment: payload.segment,
        village: 'Mamudpur',
        district: 'Murshidabad',
      });
      await loadPhase03Workspace();
      showToast(
        'success',
        'Customer Registered',
        `${res.data.customerId} — ${res.data.fullName} saved to live database.`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to save customer.';
      showToast('error', 'Customer Registration Failed', msg);
      throw err;
    }
  };

  const handleCreateApplication = async () => {
    setAppLaunchContext({
      scope: 'all',
      customerId: null,
      serviceId: null,
      selectedAppNo: null,
      startWizard: true,
    });
    setActivePage('applications');
  };

  const handleUpdateApplicationStatus = async (
    id: number,
    status: ApplicationRecord['status']
  ) => {
    const target = applications.find((app) => app.id === id);
    if (!target?.applicationNo) return;
    try {
      await erpApi.transitionStatus(target.applicationNo, {
        nextStatus: status,
        remarks: 'Updated from Dashboard detail modal',
      });
      await loadPhase03Workspace();
      showToast('success', 'Status Updated', `${target.applicationNo} moved to ${status}.`);
    } catch (err) {
      showToast(
        'error',
        'Status Update Failed',
        err instanceof Error ? err.message : 'Could not update application status.'
      );
    }
  };

  const handleMarkAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    showToast('info', 'Notifications Cleared', 'All notifications marked as read.');
  };

  const isAuthorizedForPage = (page: PageKey, user: UserProfile): boolean => {
    if (user.role === 'ADMIN') return true;
    if (user.role === 'CUSTOMER') {
      return page === 'customer-portal' || page === 'user-profile';
    }
    const navItem = SIDEBAR_NAV_ITEMS.find((n) => n.id === page);
    if (!navItem?.requiredPermission) return true;
    return Boolean(user.permissions?.[navItem.requiredPermission]);
  };

  const renderPage = (user: UserProfile) => {
    if (!isAuthorizedForPage(activePage, user)) {
      return (
        <div className="max-w-lg bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-6">
          <h2 className="text-base font-semibold text-neutral-950 dark:text-white">
            Access Restricted
          </h2>
          <p className="mt-1.5 text-sm text-neutral-600 dark:text-neutral-300">
            Your current role ({user.role}) does not have permission to access this module.
          </p>
          <div className="mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActivePage(user.role === 'CUSTOMER' ? 'customer-portal' : 'dashboard')}
            >
              Return to {user.role === 'CUSTOMER' ? 'Citizen Portal' : 'Dashboard'}
            </Button>
          </div>
        </div>
      );
    }

    switch (activePage) {
      case 'dashboard':
        return (
          <DashboardPage
            currentUser={user}
            dashboardPreferences={masterOverview?.dashboardPreferences}
            serviceRates={serviceRates}
            pendingApprovalsCount={masterOverview?.pendingProposalsCount ?? 0}
            erpSummary={erpSummary}
            customers={customers}
            applications={applications}
            transactions={transactions}
            onNavigate={handleNavigate}
            onOpenApplicationScope={(scope, appNo) => {
              setAppLaunchContext({
                scope,
                customerId: null,
                serviceId: null,
                selectedAppNo: appNo ?? null,
                startWizard: false,
              });
              setActivePage('applications');
            }}
            onRefreshErp={loadPhase03Workspace}
            onOpenQuickCreate={handleOpenQuickCreate}
            onSelectApplication={setSelectedApplication}
            onShowToast={showToast}
          />
        );
      case 'customers':
        return (
          <CustomersCrmPage
            currentUser={user}
            onStartApplicationForCustomer={(customerId) => {
              setAppLaunchContext({
                scope: 'all',
                customerId,
                serviceId: null,
                selectedAppNo: null,
                startWizard: true,
              });
              setActivePage('applications');
            }}
            onShowToast={showToast}
          />
        );
      case 'feedback':
        return (
          <CustomerFeedbackPage
            currentUser={user}
            onShowToast={showToast}
          />
        );
      case 'services':
        return (
          <ServicesCatalogPage
            currentUser={user}
            onStartApplicationForService={(serviceId) => {
              setAppLaunchContext({
                scope: 'all',
                customerId: null,
                serviceId,
                selectedAppNo: null,
                startWizard: true,
              });
              setActivePage('applications');
            }}
            onShowToast={showToast}
          />
        );
      case 'applications':
        return (
          <ApplicationsWorkspacePage
            currentUser={user}
            initialScope={appLaunchContext.scope}
            initialCustomerId={appLaunchContext.customerId}
            initialServiceId={appLaunchContext.serviceId}
            initialSelectedAppNo={appLaunchContext.selectedAppNo}
            startWizardOnOpen={appLaunchContext.startWizard}
            onConsumeWizardLaunch={() =>
              setAppLaunchContext((prev) => ({
                ...prev,
                startWizard: false,
                selectedAppNo: null,
              }))
            }
            onShowToast={showToast}
          />
        );
      case 'transactions':
      case 'cashbook':
      case 'expenses':
      case 'income':
        return (
          <FinancialLedgerPage
            currentUser={user}
            mode={activePage}
            dailyCashClosings={dailyCashClosings}
            onNavigate={handleNavigate}
            onShowToast={showToast}
          />
        );
      case 'finance-hub':
        return (
          <FinanceEngineHubPage
            currentUser={user}
            onNavigate={handleNavigate}
            onShowToast={showToast}
          />
        );
      case 'chart-of-accounts':
        return (
          <ChartOfAccountsPage
            currentUser={user}
            onShowToast={showToast}
          />
        );
      case 'banking-csp':
        return (
          <BankingAndCspPage
            currentUser={user}
            onShowToast={showToast}
          />
        );
      case 'employees':
        return (
          <PayrollEmployeesPage
            currentUser={user}
            onShowToast={showToast}
          />
        );
      case 'products':
      case 'inventory':
        return (
          <ProductsInventoryPage
            currentUser={user}
            mode={activePage}
            onShowToast={showToast}
          />
        );
      case 'reports':
        return (
          <ReportsDashboardPage
            currentUser={user}
            onNavigate={handleNavigate}
            onQuickOpenReport={(key) => {
              setQuickReportKey(key);
              setActivePage('reports-catalog');
            }}
            onShowToast={showToast}
          />
        );
      case 'reports-catalog':
        return (
          <AllReportsCenterPage
            currentUser={user}
            companyProfile={masterOverview?.companyProfile}
            initialReportKey={quickReportKey}
            onShowToast={showToast}
          />
        );
      case 'reports-analytics':
        return <BusinessAnalyticsPage onShowToast={showToast} />;
      case 'reports-builder':
        return (
          <CustomReportBuilderPage
            companyProfile={masterOverview?.companyProfile}
            onShowToast={showToast}
          />
        );
      case 'reports-scheduler':
        return <ScheduledReportsPage onShowToast={showToast} />;
      case 'reports-archive':
        return <ReportArchiveAuditPage currentUser={user} onShowToast={showToast} />;
      case 'notifications':
        return (
          <NotificationsPage
            notifications={notifications}
            liveDispatches={erpNotifications}
            onMarkAllRead={handleMarkAllRead}
          />
        );
      case 'master-settings':
        return (
          <MasterSettingsHub
            currentUser={user}
            theme={theme}
            onChangeTheme={handleChangeTheme}
            onChangeLanguage={handleChangeLanguage}
            onNavigate={handleNavigate}
            onOverviewUpdated={(ov) => setMasterOverview(ov)}
            onShowToast={showToast}
          />
        );
      case 'settings':
        return (
          <SettingsPage
            onShowToast={showToast}
          />
        );
      // Phase 02 Security & User Management Routes
      case 'users':
        return (
          <UsersPage
            currentUser={user}
            onNavigate={handleNavigate}
            onInspectProfile={(target) => {
              setInspectedUser({
                ...target,
                avatarInitials: target.fullName
                  .split(' ')
                  .map((p) => p[0])
                  .slice(0, 2)
                  .join('')
                  .toUpperCase(),
              });
              setActivePage('user-profile');
            }}
            onShowToast={showToast}
          />
        );
      case 'add-user':
        return (
          <AddUserPage
            currentUser={user}
            onNavigate={handleNavigate}
            onShowToast={showToast}
          />
        );
      case 'user-profile':
        return (
          <UserProfilePage
            viewer={user}
            targetUser={inspectedUser ?? user}
            onProfileUpdated={(updated) => {
              if (updated.userId === user.userId) {
                setCurrentUser((prev) => (prev ? { ...prev, ...updated } : prev));
              } else {
                setInspectedUser(updated);
              }
            }}
            onShowToast={showToast}
          />
        );
      case 'roles':
        return <RolesPage />;
      case 'permissions':
        return <PermissionsPage currentUser={user} onShowToast={showToast} />;
      case 'registration-requests':
        return <ApprovalsManagementPage mode="requests" currentUser={user} onShowToast={showToast} />;
      case 'approvals':
        return <ApprovalsManagementPage mode="approvals" currentUser={user} onShowToast={showToast} />;
      case 'login-history':
        return <SecurityLogsPage mode="login-history" onShowToast={showToast} />;
      case 'security-logs':
        return <SecurityLogsPage mode="security-logs" onShowToast={showToast} />;
      case 'sessions':
        return (
          <SessionsPage
            onShowToast={showToast}
            onCurrentSessionRevoked={() => {
              void performLogout(
                'Session Revoked',
                'Your active session has been signed out.'
              );
            }}
          />
        );
      case 'security-dashboard':
        return <SecurityDashboardPage currentUser={user} onShowToast={showToast} />;
      case 'device-monitoring':
        return <DeviceMonitoringPage currentUser={user} onShowToast={showToast} />;
      case 'backup-recovery':
        return <BackupRecoveryPage currentUser={user} onShowToast={showToast} />;
      case 'data-recovery':
        return <DataRecoveryPage currentUser={user} onShowToast={showToast} />;
      case 'qa-dashboard':
        return (
          <QaDashboardPage
            currentUser={user}
            onNavigate={handleNavigate}
            onShowToast={showToast}
          />
        );
      case 'qa-workbench':
        return <TestExecutionWorkbenchPage currentUser={user} onShowToast={showToast} />;
      case 'qa-bugs':
        return <BugAndRegressionPage currentUser={user} onShowToast={showToast} />;
      case 'qa-release':
        return <ReleaseUatPage currentUser={user} onShowToast={showToast} />;
      case 'customer-portal':
        return <CustomerPortalPage currentUser={user} onShowToast={showToast} />;
      default: {
        const moduleConfig = SIDEBAR_NAV_ITEMS.find((n) => n.id === activePage);
        if (!moduleConfig) return null;
        return (
          <ModulePlaceholderPage
            moduleConfig={moduleConfig}
            onNavigate={handleNavigate}
          />
        );
      }
    }
  };

  if (authChecking && !currentUser) {
    return (
      <div className="min-h-screen bg-white dark:bg-neutral-950 flex flex-col">
        <div className="h-14 border-b border-neutral-200 dark:border-neutral-800 px-6 flex items-center justify-between">
          <div className="h-5 w-40 rounded bg-neutral-200 dark:bg-neutral-800 animate-pulse" />
          <div className="h-7 w-24 rounded bg-neutral-200 dark:bg-neutral-800 animate-pulse" />
        </div>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md space-y-4">
            <div className="h-8 w-56 rounded bg-neutral-200 dark:bg-neutral-800 animate-pulse mx-auto" />
            <div className="h-64 w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/60 p-6 space-y-4 animate-pulse">
              <div className="h-4 w-1/3 rounded bg-neutral-200 dark:bg-neutral-800" />
              <div className="h-10 w-full rounded bg-neutral-200 dark:bg-neutral-800" />
              <div className="h-10 w-full rounded bg-neutral-200 dark:bg-neutral-800" />
              <div className="h-10 w-full rounded bg-neutral-300 dark:bg-neutral-700" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <LanguageProvider language={language} onChangeLanguage={handleChangeLanguage}>
        {!currentUser ? (
          <LoginPage
            onLoginSuccess={handleLoginSuccess}
            onShowToast={showToast}
          />
        ) : (
          <DashboardLayout
            activePage={activePage}
            user={currentUser}
            customers={customers}
            applications={applications}
            transactions={transactions}
            notifications={notifications}
            mobileMenuOpen={mobileMenuOpen}
            theme={theme}
            logoSrc={masterOverview?.companyProfile.logoUrl}
            sessionExpiresAt={sessionExpiresAt}
            sessionRememberMe={sessionRememberMe}
            onChangeTheme={handleChangeTheme}
            onChangeLanguage={handleChangeLanguage}
            onSetMobileMenuOpen={setMobileMenuOpen}
            onNavigate={handleNavigate}
            onOpenQuickCreate={handleOpenQuickCreate}
            onSelectApplication={setSelectedApplication}
            onMarkAllRead={handleMarkAllRead}
            onRequestLogout={() => setLogoutConfirmOpen(true)}
          >
            {renderPage(currentUser)}
          </DashboardLayout>
        )}

        <QuickCreateModal
          isOpen={quickCreateOpen}
          mode={quickCreateMode}
          customers={customers}
          onClose={() => setQuickCreateOpen(false)}
          onCreateCustomer={handleCreateCustomer}
          onCreateApplication={handleCreateApplication}
        />

        <ApplicationDetailModal
          application={selectedApplication}
          onClose={() => setSelectedApplication(null)}
          onUpdateStatus={handleUpdateApplicationStatus}
        />

        <ConfirmDialog
          isOpen={logoutConfirmOpen}
          onClose={() => {
            if (!loggingOut) setLogoutConfirmOpen(false);
          }}
          onConfirm={handleLogout}
          loading={loggingOut}
          title="Sign out of MUN COMPUTER?"
          description="Your active HTTP-only server authentication session will be signed out immediately across open tabs."
          confirmLabel="Sign Out"
          variant="primary"
        />

        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </LanguageProvider>
    </ErrorBoundary>
  );
}
