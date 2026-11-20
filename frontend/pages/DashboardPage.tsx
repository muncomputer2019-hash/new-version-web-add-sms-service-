import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Clock,
  CreditCard,
  DollarSign,
  FilePlus2,
  FileText,
  Printer,
  Receipt,
  RefreshCw,
  Search,
  Settings,
  SlidersHorizontal,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react';
import { CscAdminDashboardKpis } from '../../shared/cscTypes';
import {
  ApplicationRecord,
  ApplicationStatus,
  CustomerRecord,
  DashboardPreferenceConfig,
  ErpDashboardSummary,
  PageKey,
  ServiceRateItem,
  TransactionRecord,
  UserProfile,
} from '../modules/types';
import { Button } from '../components/Button';
import { DataTable, TableColumn } from '../components/DataTable';
import { StatusText } from '../components/StatusText';
import { KpiSkeletonGrid } from '../components/LoadingSkeleton';
import { formatCurrency, paginateArray } from '../services/apiClient';
import { cscApi } from '../services/cscApi';
import { formatDateIST, formatINR } from '../services/formatters';
import { QuickCreateMode } from '../components/QuickCreateModal';
import { useLanguage } from '../i18n/translations';

interface DashboardPageProps {
  currentUser?: UserProfile;
  dashboardPreferences?: DashboardPreferenceConfig;
  serviceRates?: ServiceRateItem[];
  pendingApprovalsCount?: number;
  erpSummary?: ErpDashboardSummary | null;
  customers: CustomerRecord[];
  applications: ApplicationRecord[];
  transactions: TransactionRecord[];
  onNavigate: (page: PageKey) => void;
  onOpenApplicationScope?: (scope: string, appNo?: string) => void;
  onRefreshErp?: () => Promise<void> | void;
  onOpenQuickCreate: (mode: QuickCreateMode) => void;
  onSelectApplication: (app: ApplicationRecord) => void;
  onShowToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}

const STATUS_FILTERS: Array<'All' | ApplicationStatus> = [
  'All',
  'Processing',
  'Pending',
  'Completed',
  'On Hold',
];

export const DashboardPage: React.FC<DashboardPageProps> = ({
  currentUser,
  dashboardPreferences,
  serviceRates = [],
  pendingApprovalsCount = 0,
  erpSummary,
  customers,
  applications,
  transactions,
  onNavigate,
  onOpenApplicationScope,
  onRefreshErp,
  onOpenQuickCreate,
  onSelectApplication,
  onShowToast,
}) => {
  const { t } = useLanguage();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [appSearch, setAppSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | ApplicationStatus>('All');
  const [appPage, setAppPage] = useState(1);
  const [txnPage, setTxnPage] = useState(1);
  const [period, setPeriod] = useState<'Today' | 'This Week' | 'This Month'>(
    dashboardPreferences?.defaultPeriod ?? 'Today'
  );
  const [customizeOpen, setCustomizeOpen] = useState(false);

  // Part 13: CSC 24 Operational KPIs & Date Filter
  const [cscKpis, setCscKpis] = useState<CscAdminDashboardKpis | null>(null);
  const [kpiFromDate, setKpiFromDate] = useState('');
  const [kpiToDate, setKpiToDate] = useState('');
  const [cscKpiLoading, setCscKpiLoading] = useState(false);

  const role = currentUser?.role ?? 'ADMIN';

  const loadCscKpis = useCallback(async () => {
    if (role === 'CUSTOMER') return;
    setCscKpiLoading(true);
    try {
      const res = await cscApi.getDashboardKpis({
        fromDate: kpiFromDate || undefined,
        toDate: kpiToDate || undefined,
      });
      setCscKpis(res.data);
    } catch {
      // Keep dashboard resilient if CSC service metrics fail to load
    } finally {
      setCscKpiLoading(false);
    }
  }, [role, kpiFromDate, kpiToDate]);

  useEffect(() => {
    loadCscKpis();
  }, [loadCscKpis]);

  const defaultRoleWidgets = useMemo(() => {
    if (dashboardPreferences && dashboardPreferences.enabledWidgets.length > 0) {
      return dashboardPreferences.enabledWidgets;
    }
    if (role === 'ADMIN') {
      return [
        'Total Customers',
        'Total Applications',
        'Today Collection',
        'Pending Payments',
        'Total Expenses',
        'Today Profit',
        'Recent Activities',
        'Pending Approvals',
        'Service-wise Reports',
        'Monthly Collection',
      ];
    }
    if (role === 'MANAGER') {
      return [
        'Total Customers',
        'Total Applications',
        'Today Collection',
        'Pending Payments',
        'Pending Approvals',
        'Recent Activities',
      ];
    }
    return ['Total Customers', 'Total Applications', 'Today Collection', 'Pending Payments', 'Recent Activities'];
  }, [dashboardPreferences, role]);

  const [hiddenWidgets, setHiddenWidgets] = useState<Record<string, boolean>>({});
  const isWidgetVisible = (name: string) =>
    defaultRoleWidgets.includes(name) && !hiddenWidgets[name];

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.allSettled([Promise.resolve(onRefreshErp?.()), loadCscKpis()]);
      onShowToast('info', 'Dashboard Refreshed', 'Displaying latest live ERP & CSC operational dataset.');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Map live ERP recent applications & payments into table shape when available
  const displayApplications = useMemo<ApplicationRecord[]>(() => {
    if (erpSummary?.recentApplications && erpSummary.recentApplications.length > 0) {
      return erpSummary.recentApplications.map((a) => ({
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
        notes: `Live Status: ${a.status}`,
      }));
    }
    return applications;
  }, [erpSummary, applications]);

  const displayTransactions = useMemo<TransactionRecord[]>(() => {
    if (erpSummary?.recentPayments && erpSummary.recentPayments.length > 0) {
      return erpSummary.recentPayments.map((p) => ({
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
      }));
    }
    return transactions;
  }, [erpSummary, transactions]);

  // KPI computations (Live ERP when loaded, period-aware fallback)
  const totalCustomers = erpSummary ? erpSummary.kpis.totalCustomers : customers.length;
  const totalAppsCount = erpSummary ? erpSummary.kpis.totalApplications : applications.length;
  const activeApplications = erpSummary
    ? erpSummary.kpis.activeApplications
    : applications.filter((a) => a.status === 'Processing' || a.status === 'Pending').length;
  const pendingApplications = erpSummary
    ? erpSummary.kpis.pendingApplications
    : applications.filter((a) => a.status === 'Pending').length;

  const periodCollection = useMemo(() => {
    if (erpSummary) {
      return period === 'Today' ? erpSummary.kpis.todayCollection : erpSummary.kpis.totalCollection;
    }
    const paid = transactions.filter((txn) => txn.status === 'Paid');
    if (period === 'Today') {
      return paid
        .filter((txn) => txn.recordedAt.startsWith('2026-11-16'))
        .reduce((sum, txn) => sum + txn.amount, 0);
    }
    if (period === 'This Week') {
      return paid
        .filter((txn) => txn.recordedAt >= '2026-11-10')
        .reduce((sum, txn) => sum + txn.amount, 0);
    }
    return paid.reduce((sum, txn) => sum + txn.amount, 0);
  }, [erpSummary, transactions, period]);

  const monthlyCollection = useMemo(
    () =>
      erpSummary
        ? erpSummary.kpis.totalCollection
        : transactions.filter((txn) => txn.status === 'Paid').reduce((sum, txn) => sum + txn.amount, 0),
    [erpSummary, transactions]
  );

  const pendingPaymentsTotal = useMemo(() => {
    if (erpSummary?.recentApplications) {
      return erpSummary.recentApplications.reduce(
        (sum, app) => sum + Math.max(0, app.financialSummary.balanceDue),
        0
      );
    }
    return applications.reduce(
      (sum, app) => sum + Math.max(0, app.feeAmount - app.paidAmount),
      0
    );
  }, [erpSummary, applications]);

  const totalExpenses = erpSummary
    ? erpSummary.kpis.totalExpenses
    : period === 'Today'
    ? 450
    : period === 'This Week'
    ? 1850
    : 6400;
  const todayProfit = useMemo(() => {
    if (erpSummary) {
      return Math.max(0, erpSummary.kpis.netCashBalance);
    }
    if (serviceRates.length > 0) {
      const avgMargin = 0.62;
      return Math.max(0, Math.round(periodCollection * avgMargin) - totalExpenses);
    }
    return Math.max(0, Math.round(periodCollection * 0.62) - totalExpenses);
  }, [erpSummary, periodCollection, totalExpenses, serviceRates]);

  // Filtered Recent Applications
  const filteredApplications = useMemo(() => {
    const q = appSearch.trim().toLowerCase();
    return displayApplications.filter((app) => {
      const matchesStatus = statusFilter === 'All' || app.status === statusFilter;
      const matchesQuery =
        !q ||
        app.applicationNo.toLowerCase().includes(q) ||
        app.customerName.toLowerCase().includes(q) ||
        app.serviceName.toLowerCase().includes(q);
      return matchesStatus && matchesQuery;
    });
  }, [displayApplications, appSearch, statusFilter]);

  const paginatedApps = useMemo(
    () => paginateArray(filteredApplications, appPage, 5),
    [filteredApplications, appPage]
  );

  const paginatedTxns = useMemo(
    () => paginateArray(displayTransactions, txnPage, 5),
    [displayTransactions, txnPage]
  );

  // Status Overview counts
  const statusBreakdown = useMemo(() => {
    if (erpSummary) {
      const sb = erpSummary.applicationStatusBreakdown || {};
      const total = Math.max(1, erpSummary.kpis.totalApplications);
      const completed = (sb['Completed'] || 0) + (sb['Approved'] || 0);
      const processing = (sb['Processing'] || 0) + (sb['Under Review'] || 0);
      const pending =
        (sb['Draft'] || 0) +
        (sb['Submitted'] || 0) +
        (sb['Pending Customer'] || 0) +
        (sb['Pending Office'] || 0) +
        (sb['Reopened'] || 0);
      const onHold = (sb['On Hold'] || 0) + (sb['Rejected'] || 0) + (sb['Cancelled'] || 0);
      return {
        total: erpSummary.kpis.totalApplications,
        items: [
          { label: 'Completed' as const, count: completed, pct: Math.round((completed / total) * 100), barColor: 'bg-emerald-600' },
          { label: 'Processing' as const, count: processing, pct: Math.round((processing / total) * 100), barColor: 'bg-blue-800' },
          { label: 'Pending' as const, count: pending, pct: Math.round((pending / total) * 100), barColor: 'bg-amber-500' },
          { label: 'On Hold' as const, count: onHold, pct: Math.round((onHold / total) * 100), barColor: 'bg-neutral-400' },
        ],
      };
    }
    const total = Math.max(1, applications.length);
    const counts: Record<ApplicationStatus, number> = {
      Completed: applications.filter((a) => a.status === 'Completed').length,
      Processing: applications.filter((a) => a.status === 'Processing').length,
      Pending: applications.filter((a) => a.status === 'Pending').length,
      'On Hold': applications.filter((a) => a.status === 'On Hold').length,
    };
    return {
      total: applications.length,
      items: [
        { label: 'Completed' as const, count: counts.Completed, pct: Math.round((counts.Completed / total) * 100), barColor: 'bg-emerald-600' },
        { label: 'Processing' as const, count: counts.Processing, pct: Math.round((counts.Processing / total) * 100), barColor: 'bg-blue-800' },
        { label: 'Pending' as const, count: counts.Pending, pct: Math.round((counts.Pending / total) * 100), barColor: 'bg-amber-500' },
        { label: 'On Hold' as const, count: counts['On Hold'], pct: Math.round((counts['On Hold'] / total) * 100), barColor: 'bg-neutral-400' },
      ],
    };
  }, [erpSummary, applications]);

  // Customer Overview breakdown
  const customerSegments = useMemo(() => {
    const individual = customers.filter((c) => c.segment === 'Individual').length;
    const corporate = customers.filter((c) => c.segment === 'Corporate').length;
    const government = customers.filter((c) => c.segment === 'Government').length;
    const active = customers.filter((c) => c.status === 'Active').length;
    return { individual, corporate, government, active };
  }, [customers]);

  const applicationColumns: TableColumn<ApplicationRecord>[] = [
    {
      key: 'applicationNo',
      header: 'Application ID',
      render: (row) => (
        <span className="font-mono text-xs font-medium text-neutral-950 dark:text-neutral-100 whitespace-nowrap">
          {row.applicationNo}
        </span>
      ),
    },
    {
      key: 'customerName',
      header: 'Customer',
      render: (row) => (
        <div className="min-w-0">
          <div className="font-medium text-neutral-950 dark:text-white truncate">{row.customerName}</div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400 truncate">{row.serviceName}</div>
        </div>
      ),
    },
    {
      key: 'assignedTo',
      header: 'Assigned',
      className: 'hidden sm:table-cell',
      render: (row) => (
        <span className="text-xs text-neutral-700 dark:text-neutral-300 whitespace-nowrap">
          {row.assignedTo}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusText status={row.status} />,
    },
    {
      key: 'feeAmount',
      header: 'Fee',
      align: 'right',
      render: (row) => (
        <span className="font-mono text-xs font-medium text-neutral-950 dark:text-neutral-100 whitespace-nowrap tabular-nums">
          {formatCurrency(row.feeAmount)}
        </span>
      ),
    },
  ];

  const transactionColumns: TableColumn<TransactionRecord>[] = [
    {
      key: 'referenceNo',
      header: 'Reference',
      render: (row) => (
        <span className="font-mono text-xs font-medium text-neutral-950 dark:text-neutral-100 whitespace-nowrap">
          {row.referenceNo}
        </span>
      ),
    },
    {
      key: 'customerName',
      header: 'Customer',
      render: (row) => (
        <div>
          <div className="text-sm font-medium text-neutral-950 dark:text-white">{row.customerName}</div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400 font-mono">{row.applicationNo}</div>
        </div>
      ),
    },
    {
      key: 'paymentMethod',
      header: 'Method',
      className: 'hidden sm:table-cell',
      render: (row) => <span className="text-xs text-neutral-700 dark:text-neutral-300">{row.paymentMethod}</span>,
    },
    {
      key: 'recordedAt',
      header: 'Recorded',
      className: 'hidden md:table-cell',
      render: (row) => (
        <span className="font-mono text-xs text-neutral-500 dark:text-neutral-400 tabular-nums whitespace-nowrap">
          {formatDateIST(row.recordedAt.slice(0, 10))}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusText status={row.status} />,
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (row) => (
        <span className="font-mono text-xs font-semibold text-neutral-950 dark:text-white whitespace-nowrap tabular-nums">
          {formatCurrency(row.amount)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header, Period Filter & Customize Widgets */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-950 dark:text-white">
            {t.operationsDashboard}
          </h2>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            {role} Workspace · Operational preview (INR ₹ · IST DD/MM/YYYY)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Default Period Filter */}
          <div className="inline-flex items-center border border-neutral-200 dark:border-neutral-700 rounded-md overflow-hidden bg-neutral-50 dark:bg-neutral-900">
            {(['Today', 'This Week', 'This Month'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`px-2.5 h-8 text-xs font-medium whitespace-nowrap cursor-pointer ${
                  period === p
                    ? 'bg-neutral-950 text-white dark:bg-white dark:text-neutral-950'
                    : 'text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                }`}
              >
                {p === 'Today' ? t.today : p === 'This Week' ? t.thisWeek : t.thisMonth}
              </button>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setCustomizeOpen((prev) => !prev)}
            icon={<SlidersHorizontal className="h-3.5 w-3.5" />}
          >
            {t.customizableWidgets}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            loading={isRefreshing}
            icon={<RefreshCw className="h-3.5 w-3.5" />}
          >
            {t.refreshView}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onOpenQuickCreate('application')}
            icon={<FilePlus2 className="h-3.5 w-3.5" />}
          >
            {t.newApplication}
          </Button>
        </div>
      </div>

      {/* Customizable Widgets Drawer */}
      {customizeOpen && (
        <section className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-neutral-900 dark:text-white">
              Visible Dashboard Widgets ({role})
            </span>
            <button
              type="button"
              onClick={() => setHiddenWidgets({})}
              className="text-xs text-blue-800 dark:text-blue-400 hover:underline cursor-pointer"
            >
              Reset Default
            </button>
          </div>
          <div className="flex flex-wrap gap-3">
            {defaultRoleWidgets.map((w) => (
              <label
                key={w}
                className="inline-flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={!hiddenWidgets[w]}
                  onChange={() =>
                    setHiddenWidgets((prev) => ({ ...prev, [w]: !prev[w] }))
                  }
                  className="h-3.5 w-3.5 rounded border-neutral-300 dark:border-neutral-700"
                />
                <span>{t.dashboardWidgets[w] ?? w}</span>
              </label>
            ))}
          </div>
        </section>
      )}

      {/* Primary KPI Statistic Cards */}
      {isRefreshing ? (
        <KpiSkeletonGrid />
      ) : (
        <section aria-label="Key Statistics" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {isWidgetVisible('Total Customers') && (
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
              <div className="flex items-center justify-between text-xs font-medium text-neutral-500 dark:text-neutral-400">
                <span>{t.dashboardWidgets['Total Customers']}</span>
                <Users className="h-4 w-4 text-neutral-400" aria-hidden="true" />
              </div>
              <div className="mt-2.5 text-2xl font-bold tracking-tight text-neutral-950 dark:text-white tabular-nums">
                {totalCustomers}
              </div>
              <div className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">
                {customerSegments.active} active · Individual &amp; Corporate
              </div>
            </div>
          )}

          {isWidgetVisible('Total Applications') && (
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
              <div className="flex items-center justify-between text-xs font-medium text-neutral-500 dark:text-neutral-400">
                <span>{t.dashboardWidgets['Total Applications']}</span>
                <FileText className="h-4 w-4 text-blue-800 dark:text-blue-400" aria-hidden="true" />
              </div>
              <div className="mt-2.5 text-2xl font-bold tracking-tight text-neutral-950 dark:text-white tabular-nums">
                {activeApplications} <span className="text-sm font-normal text-neutral-400">/ {totalAppsCount}</span>
              </div>
              <div className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">
                {pendingApplications} pending action
              </div>
            </div>
          )}

          {isWidgetVisible('Today Collection') && (
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
              <div className="flex items-center justify-between text-xs font-medium text-neutral-500 dark:text-neutral-400">
                <span>{period === 'Today' ? t.dashboardWidgets['Today Collection'] : `${period} Collection`}</span>
                <DollarSign className="h-4 w-4 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
              </div>
              <div className="mt-2.5 text-2xl font-bold tracking-tight text-neutral-950 dark:text-white font-mono tabular-nums">
                {formatCurrency(periodCollection)}
              </div>
              <div className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">
                Settled counter receipts · {formatDateIST('2026-11-16')}
              </div>
            </div>
          )}

          {isWidgetVisible('Pending Payments') && (
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
              <div className="flex items-center justify-between text-xs font-medium text-neutral-500 dark:text-neutral-400">
                <span>{t.dashboardWidgets['Pending Payments']}</span>
                <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              </div>
              <div className="mt-2.5 text-2xl font-bold tracking-tight text-neutral-950 dark:text-white font-mono tabular-nums">
                {formatCurrency(pendingPaymentsTotal)}
              </div>
              <div className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">
                Outstanding fee balance across {pendingApplications} pending filings
              </div>
            </div>
          )}
        </section>
      )}

      {/* Role-Specific Financial & Governance Widgets (Admin / Manager) */}
      {(isWidgetVisible('Total Expenses') ||
        isWidgetVisible('Today Profit') ||
        isWidgetVisible('Pending Approvals') ||
        isWidgetVisible('Monthly Collection')) && (
        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {role === 'ADMIN' && isWidgetVisible('Total Expenses') && (
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
              <div className="flex items-center justify-between text-xs font-medium text-neutral-500 dark:text-neutral-400">
                <span>{t.dashboardWidgets['Total Expenses']} ({period})</span>
                <Wallet className="h-4 w-4 text-neutral-500" />
              </div>
              <div className="mt-2 text-xl font-bold font-mono text-neutral-950 dark:text-white tabular-nums">
                {formatCurrency(totalExpenses)}
              </div>
              <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                Admin financial visibility
              </div>
            </div>
          )}

          {role === 'ADMIN' && isWidgetVisible('Today Profit') && (
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
              <div className="flex items-center justify-between text-xs font-medium text-neutral-500 dark:text-neutral-400">
                <span>{t.dashboardWidgets['Today Profit']}</span>
                <TrendingUp className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
              </div>
              <div className="mt-2 text-xl font-bold font-mono text-emerald-700 dark:text-emerald-400 tabular-nums">
                {formatCurrency(todayProfit)}
              </div>
              <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                Service Charge − Cost − Expenses
              </div>
            </div>
          )}

          {isWidgetVisible('Pending Approvals') && (
            <button
              type="button"
              onClick={() => onNavigate(role === 'ADMIN' ? 'master-settings' : 'approvals')}
              className="text-left bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 hover:border-neutral-950 dark:hover:border-white rounded-lg p-5 transition-colors cursor-pointer"
            >
              <div className="flex items-center justify-between text-xs font-medium text-neutral-500 dark:text-neutral-400">
                <span>{t.dashboardWidgets['Pending Approvals']}</span>
                <ArrowUpRight className="h-4 w-4 text-blue-800 dark:text-blue-400" />
              </div>
              <div className="mt-2 text-xl font-bold font-mono text-neutral-950 dark:text-white tabular-nums">
                {pendingApprovalsCount}
              </div>
              <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                Registration, Cash Variance &amp; Settings Proposals
              </div>
            </button>
          )}

          {role === 'ADMIN' && isWidgetVisible('Monthly Collection') && (
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
              <div className="flex items-center justify-between text-xs font-medium text-neutral-500 dark:text-neutral-400">
                <span>{t.dashboardWidgets['Monthly Collection']}</span>
                <CreditCard className="h-4 w-4 text-blue-800 dark:text-blue-400" />
              </div>
              <div className="mt-2 text-xl font-bold font-mono text-neutral-950 dark:text-white tabular-nums">
                {formatCurrency(monthlyCollection)}
              </div>
              <div className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                FY 2026–27 current month total
              </div>
            </div>
          )}
        </section>
      )}

      {/* Operational Alerts & Drill-Down Reminders */}
      {erpSummary && (
        <section
          aria-label="Operational Reminders"
          className="grid grid-cols-2 lg:grid-cols-4 gap-3"
        >
          <button
            type="button"
            onClick={() => (onOpenApplicationScope ? onOpenApplicationScope('all') : onNavigate('applications'))}
            className="text-left bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 hover:border-neutral-950 dark:hover:border-white rounded-lg p-3.5 transition-colors cursor-pointer"
          >
            <div className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
              Pending Follow-ups
            </div>
            <div className="mt-1 text-lg font-bold font-mono text-neutral-950 dark:text-white tabular-nums">
              {erpSummary.reminders.pendingFollowUps}
            </div>
            <div className="text-[11px] text-blue-800 dark:text-blue-400 mt-0.5">
              Open queue &rarr;
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              onOpenApplicationScope ? onOpenApplicationScope('pending_docs') : onNavigate('applications')
            }
            className="text-left bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 hover:border-neutral-950 dark:hover:border-white rounded-lg p-3.5 transition-colors cursor-pointer"
          >
            <div className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
              Missing / Pending Docs
            </div>
            <div className="mt-1 text-lg font-bold font-mono text-amber-600 dark:text-amber-400 tabular-nums">
              {erpSummary.reminders.missingOrPendingDocs}
            </div>
            <div className="text-[11px] text-blue-800 dark:text-blue-400 mt-0.5">
              Verify checklist &rarr;
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              onOpenApplicationScope ? onOpenApplicationScope('unassigned') : onNavigate('applications')
            }
            className="text-left bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 hover:border-neutral-950 dark:hover:border-white rounded-lg p-3.5 transition-colors cursor-pointer"
          >
            <div className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
              Unassigned Queue
            </div>
            <div className="mt-1 text-lg font-bold font-mono text-neutral-950 dark:text-white tabular-nums">
              {erpSummary.reminders.unassignedApplications}
            </div>
            <div className="text-[11px] text-blue-800 dark:text-blue-400 mt-0.5">
              Claim / assign &rarr;
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              onOpenApplicationScope ? onOpenApplicationScope('overdue') : onNavigate('applications')
            }
            className="text-left bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 hover:border-neutral-950 dark:hover:border-white rounded-lg p-3.5 transition-colors cursor-pointer"
          >
            <div className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
              Overdue SLA
            </div>
            <div className="mt-1 text-lg font-bold font-mono text-red-600 dark:text-red-400 tabular-nums">
              {erpSummary.reminders.overdueSlaApplications}
            </div>
            <div className="text-[11px] text-blue-800 dark:text-blue-400 mt-0.5">
              Inspect SLA &rarr;
            </div>
          </button>
        </section>
      )}

      {/* 5 Quick Actions Strip */}
      <section
        aria-label="Quick Actions"
        className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg px-4 py-3 flex flex-wrap items-center justify-between gap-3"
      >
        <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-200">
          {t.quickActions}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onNavigate('customers')}
            icon={<UserPlus className="h-3.5 w-3.5" />}
          >
            {t.addCustomer}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenQuickCreate('application')}
            icon={<FilePlus2 className="h-3.5 w-3.5" />}
          >
            {t.newApplication}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onNavigate('transactions')}
            icon={<CreditCard className="h-3.5 w-3.5" />}
          >
            {t.newPayment}
          </Button>
          {(role === 'ADMIN' || role === 'MANAGER') && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigate('cashbook')}
              icon={<Printer className="h-3.5 w-3.5" />}
            >
              {t.createReceipt}
            </Button>
          )}
          {role === 'ADMIN' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigate('expenses')}
              icon={<Receipt className="h-3.5 w-3.5" />}
            >
              {t.addExpense}
            </Button>
          )}
          {(role === 'ADMIN' || role === 'MANAGER') && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigate('master-settings')}
              icon={<Settings className="h-3.5 w-3.5" />}
            >
              {t.navLabels['master-settings']}
            </Button>
          )}
        </div>
      </section>

      {/* Part 13: CSC Digital Service Center — 24 Operational KPIs */}
      {role !== 'CUSTOMER' && cscKpis && (
        <section
          aria-label="CSC Digital Center 24 Operational KPIs"
          className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 space-y-4"
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-neutral-100 dark:border-neutral-800 pb-4">
            <div>
              <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
                CSC Digital Service Center · 24 Live Operational KPIs
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                Real-time telemetry across 21 Categories, 550+ Services, PVC Printing, Grievances, PM-JAY, MMSBY &amp; e-KYC
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-300">
                <span>From</span>
                <input
                  type="date"
                  value={kpiFromDate}
                  onChange={(e) => setKpiFromDate(e.target.value)}
                  className="h-8 px-2 text-xs bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded-md font-mono text-neutral-900 dark:text-neutral-100"
                />
              </label>
              <label className="inline-flex items-center gap-1.5 text-xs text-neutral-600 dark:text-neutral-300">
                <span>To</span>
                <input
                  type="date"
                  value={kpiToDate}
                  onChange={(e) => setKpiToDate(e.target.value)}
                  className="h-8 px-2 text-xs bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded-md font-mono text-neutral-900 dark:text-neutral-100"
                />
              </label>
              {(kpiFromDate || kpiToDate) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setKpiFromDate('');
                    setKpiToDate('');
                  }}
                >
                  Clear Dates
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={loadCscKpis} loading={cscKpiLoading}>
                Sync KPIs
              </Button>
            </div>
          </div>

          {/* 24 KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Total Customers', value: String(cscKpis.totalCustomers), mono: false },
              { label: 'Total Categories', value: String(cscKpis.totalCategories), mono: false },
              { label: 'Total Services', value: String(cscKpis.totalServices), mono: false },
              { label: 'Active Services', value: String(cscKpis.activeServices), mono: false, tone: 'text-emerald-700 dark:text-emerald-400' },
              { label: 'Inactive Services', value: String(cscKpis.inactiveServices), mono: false },
              { label: 'Total Orders', value: String(cscKpis.totalOrders), mono: false },
              { label: 'Pending Applications', value: String(cscKpis.pendingApplications), mono: false, tone: 'text-amber-600 dark:text-amber-400' },
              { label: 'Processing Apps', value: String(cscKpis.processingApplications), mono: false, tone: 'text-blue-800 dark:text-blue-400' },
              { label: 'Completed Apps', value: String(cscKpis.completedApplications), mono: false, tone: 'text-emerald-700 dark:text-emerald-400' },
              { label: 'Total Sales', value: formatINR(cscKpis.totalSales), mono: true },
              { label: 'Total Collection', value: formatINR(cscKpis.totalCollection), mono: true, tone: 'text-emerald-700 dark:text-emerald-400' },
              { label: 'Total Due', value: formatINR(cscKpis.totalDue), mono: true, tone: 'text-red-600 dark:text-red-400' },
              { label: "Today's Sales", value: formatINR(cscKpis.todaysSales), mono: true },
              { label: 'Monthly Sales', value: formatINR(cscKpis.monthlySales), mono: true },
              { label: 'PVC Individual Orders', value: String(cscKpis.pvcIndividualOrders), mono: false },
              { label: 'PVC Wholesale Orders', value: String(cscKpis.pvcWholesaleOrders), mono: false },
              { label: 'Total PVC Cards Printed', value: String(cscKpis.totalPvcCardsPrinted), mono: false },
              { label: 'PVC Pending Orders', value: String(cscKpis.pvcPendingOrders), mono: false, tone: 'text-amber-600 dark:text-amber-400' },
              { label: 'Total Grievances', value: String(cscKpis.totalGrievances), mono: false },
              { label: 'Pending Grievances', value: String(cscKpis.pendingGrievances), mono: false, tone: 'text-amber-600 dark:text-amber-400' },
              { label: 'MMSBY Orders', value: String(cscKpis.mmsbyOrders), mono: false },
              { label: 'Ayushman Bharat Orders', value: String(cscKpis.ayushmanBharatOrders), mono: false },
              { label: 'e-KYC Pending', value: String(cscKpis.ekycPending), mono: false, tone: 'text-amber-600 dark:text-amber-400' },
              { label: 'e-KYC Completed', value: String(cscKpis.ekycCompleted), mono: false, tone: 'text-emerald-700 dark:text-emerald-400' },
            ].map((kpi) => (
              <div
                key={kpi.label}
                className="bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-md p-3"
              >
                <div className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 truncate">
                  {kpi.label}
                </div>
                <div
                  className={`mt-1 text-base font-bold tabular-nums truncate ${
                    kpi.mono ? 'font-mono ' : ''
                  }${kpi.tone ?? 'text-neutral-950 dark:text-white'}`}
                >
                  {kpi.value}
                </div>
              </div>
            ))}
          </div>

          {/* Quick Module Links & Category / Trend Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-2 border-t border-neutral-100 dark:border-neutral-800">
            <div className="lg:col-span-6 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-900 dark:text-white">
                  Category Revenue Breakdown
                </span>
                <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                  Top active service categories
                </span>
              </div>
              {cscKpis.categoryBreakdown.length === 0 ? (
                <p className="text-xs text-neutral-500 dark:text-neutral-400 py-2">
                  Configure service rates and place CSC orders to view category revenue breakdown.
                </p>
              ) : (
                <div className="space-y-2">
                  {cscKpis.categoryBreakdown.slice(0, 5).map((cat) => {
                    const maxSales = Math.max(
                      1,
                      ...cscKpis.categoryBreakdown.map((c) => c.sales)
                    );
                    const pct = Math.min(100, Math.round((cat.sales / maxSales) * 100));
                    return (
                      <div key={cat.categoryName} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-neutral-800 dark:text-neutral-200 truncate">
                            {cat.categoryName} ({cat.orders})
                          </span>
                          <span className="font-mono font-medium text-neutral-950 dark:text-white tabular-nums shrink-0">
                            {formatINR(cat.sales)}
                          </span>
                        </div>
                        <div className="h-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-800 dark:bg-blue-500" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="lg:col-span-6 flex flex-col justify-between gap-3">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-neutral-900 dark:text-white">
                    Recent Daily Sales Trend
                  </span>
                  <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    Sales vs Collection (INR)
                  </span>
                </div>
                {cscKpis.dailySalesTrend.length === 0 ? (
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 py-2">
                    No CSC orders recorded in the selected date window yet.
                  </p>
                ) : (
                  <div className="divide-y divide-neutral-100 dark:divide-neutral-800 border border-neutral-200 dark:border-neutral-800 rounded-md overflow-hidden">
                    {cscKpis.dailySalesTrend.slice(-4).map((d) => (
                      <div
                        key={d.date}
                        className="px-3 py-1.5 flex items-center justify-between text-xs bg-neutral-50/50 dark:bg-neutral-950/50"
                      >
                        <span className="font-mono text-neutral-700 dark:text-neutral-300 tabular-nums">
                          {formatDateIST(d.date)} · {d.orders} ord
                        </span>
                        <span className="font-mono text-neutral-950 dark:text-white tabular-nums">
                          Sales {formatINR(d.sales)} · Coll {formatINR(d.collection)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => onNavigate('services')}>
                  Services Catalog
                </Button>
                <Button variant="outline" size="sm" onClick={() => onNavigate('applications')}>
                  Applications Workspace
                </Button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Main Content Split: Recent Applications Table + Overviews */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Recent Applications Table (8 cols) */}
        <section className="lg:col-span-8 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
          <div className="px-4 sm:px-5 py-4 border-b border-neutral-200 dark:border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
                Recent Applications
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                Click any row to inspect details or update status
              </p>
            </div>

            <div className="relative w-full sm:w-56">
              <Search className="h-3.5 w-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={appSearch}
                onChange={(e) => {
                  setAppSearch(e.target.value);
                  setAppPage(1);
                }}
                placeholder="Filter applications..."
                aria-label="Filter recent applications"
                className="w-full h-9 pl-8 pr-3 text-xs bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded-md text-neutral-950 dark:text-neutral-100 focus:outline-none focus:border-blue-800"
              />
            </div>
          </div>

          <div className="px-4 sm:px-5 py-2.5 border-b border-neutral-100 dark:border-neutral-800 bg-neutral-50/50 dark:bg-neutral-950/40 flex items-center gap-1 overflow-x-auto">
            {STATUS_FILTERS.map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => {
                  setStatusFilter(status);
                  setAppPage(1);
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  statusFilter === status
                    ? 'bg-neutral-950 text-white dark:bg-white dark:text-neutral-950'
                    : 'text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-950 dark:hover:text-white'
                }`}
              >
                {status}
              </button>
            ))}
          </div>

          <DataTable
            columns={applicationColumns}
            data={paginatedApps.items}
            rowKey={(r) => r.applicationNo}
            loading={isRefreshing}
            pagination={paginatedApps.pagination}
            onPageChange={setAppPage}
            onRowClick={(row) => {
              if (erpSummary && onOpenApplicationScope) {
                onOpenApplicationScope('all', row.applicationNo);
              } else {
                onSelectApplication(row);
              }
            }}
            emptyTitle="No matching applications"
            emptyDescription="Clear the filter or create a new application."
            emptyActionLabel="Reset Filters"
            onEmptyAction={() => {
              setAppSearch('');
              setStatusFilter('All');
              setAppPage(1);
            }}
          />
        </section>

        {/* Right Column: Application Status Overview + Service/Customer Overview (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
                Application Status Overview
              </h3>
              <span className="text-xs font-mono text-neutral-500 dark:text-neutral-400 tabular-nums">
                {statusBreakdown.total} total
              </span>
            </div>

            <div className="mt-4 h-2.5 w-full rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden flex">
              {statusBreakdown.items.map(
                (item) =>
                  item.count > 0 && (
                    <div
                      key={item.label}
                      style={{ width: `${item.pct}%` }}
                      className={`${item.barColor} h-full`}
                      title={`${item.label}: ${item.count}`}
                    />
                  )
              )}
            </div>

            <div className="mt-4 divide-y divide-neutral-100 dark:divide-neutral-800">
              {statusBreakdown.items.map((item) => (
                <div
                  key={item.label}
                  className="py-2.5 flex items-center justify-between text-xs"
                >
                  <StatusText status={item.label} />
                  <div className="flex items-center gap-3 font-mono tabular-nums">
                    <span className="text-neutral-950 dark:text-white font-semibold">{item.count}</span>
                    <span className="text-neutral-400 w-9 text-right">{item.pct}%</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {role === 'ADMIN' && isWidgetVisible('Service-wise Reports') && serviceRates.length > 0 && (
            <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
                  {t.dashboardWidgets['Service-wise Reports']}
                </h3>
                <button
                  type="button"
                  onClick={() => onNavigate('reports')}
                  className="text-xs font-medium text-blue-800 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  Open Reports
                </button>
              </div>
              <div className="mt-3 divide-y divide-neutral-100 dark:divide-neutral-800">
                {serviceRates.slice(0, 4).map((sr) => (
                  <div key={sr.serviceCode} className="py-2 flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <div className="font-medium text-neutral-950 dark:text-white truncate">{sr.serviceName}</div>
                      <div className="font-mono text-[11px] text-neutral-500 dark:text-neutral-400">
                        Charge {formatCurrency(sr.customerCharge)} · Cost {formatCurrency(sr.serviceCost)}
                      </div>
                    </div>
                    <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400 shrink-0 tabular-nums">
                      +{formatCurrency(sr.profitAmount)}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
                Customer Overview
              </h3>
              <button
                type="button"
                onClick={() => onNavigate('customers')}
                className="text-xs font-medium text-blue-800 dark:text-blue-400 hover:underline cursor-pointer"
              >
                View all
              </button>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 pb-4 border-b border-neutral-100 dark:border-neutral-800 text-center">
              <div className="py-2 bg-neutral-50 dark:bg-neutral-950 rounded">
                <div className="text-base font-bold text-neutral-950 dark:text-white tabular-nums">
                  {customerSegments.individual}
                </div>
                <div className="text-[11px] text-neutral-500 dark:text-neutral-400">Individual</div>
              </div>
              <div className="py-2 bg-neutral-50 dark:bg-neutral-950 rounded">
                <div className="text-base font-bold text-neutral-950 dark:text-white tabular-nums">
                  {customerSegments.corporate}
                </div>
                <div className="text-[11px] text-neutral-500 dark:text-neutral-400">Corporate</div>
              </div>
              <div className="py-2 bg-neutral-50 dark:bg-neutral-950 rounded">
                <div className="text-base font-bold text-neutral-950 dark:text-white tabular-nums">
                  {customerSegments.government}
                </div>
                <div className="text-[11px] text-neutral-500 dark:text-neutral-400">Gov.</div>
              </div>
            </div>

            <div className="mt-3 divide-y divide-neutral-100 dark:divide-neutral-800">
              {customers.slice(0, 4).map((cust) => (
                <div
                  key={cust.id}
                  className="py-2.5 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-neutral-950 dark:text-white truncate">
                      {cust.fullName}
                    </div>
                    <div className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate">
                      {cust.segment} · {cust.totalApplications} applications
                    </div>
                  </div>
                  <div className="font-mono text-xs font-medium text-neutral-900 dark:text-neutral-200 tabular-nums shrink-0">
                    {formatCurrency(cust.totalSpent)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* Recent Transactions / Recent Activities Table */}
      {isWidgetVisible('Recent Activities') && (
        <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
          <div className="px-4 sm:px-5 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
                Recent Transactions
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                Latest payment collections across service counters
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigate('transactions')}
            >
              View Ledger
            </Button>
          </div>

          <DataTable
            columns={transactionColumns}
            data={paginatedTxns.items}
            rowKey={(tRow) => tRow.id}
            loading={isRefreshing}
            pagination={paginatedTxns.pagination}
            onPageChange={setTxnPage}
          />
        </section>
      )}
    </div>
  );
};
