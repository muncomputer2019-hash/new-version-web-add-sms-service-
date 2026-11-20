import React, { useCallback, useEffect, useState } from 'react';
import {
  BarChart3,
  RefreshCw,
  ArrowUpRight,
  FileSpreadsheet,
  PieChart,
  Wrench,
  Clock,
  Archive,
  TrendingUp,
  Users,
  FileText,
  IndianRupee,
} from 'lucide-react';
import { PageKey, UserProfile } from '../../modules/types';
import { formatINR } from '../../services/formatters';
import { ReportingDashboardData, reportApi } from '../../services/reportApi';
import { Button } from '../../components/Button';

interface ReportsDashboardPageProps {
  currentUser: UserProfile;
  onNavigate: (page: PageKey) => void;
  onQuickOpenReport?: (reportKey: string) => void;
  onShowToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}

export const ReportsDashboardPage: React.FC<ReportsDashboardPageProps> = ({
  currentUser,
  onNavigate,
  onQuickOpenReport,
  onShowToast,
}) => {
  const [data, setData] = useState<ReportingDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [financialYear, setFinancialYear] = useState('ALL');
  const [searchStaff, setSearchStaff] = useState('');

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await reportApi.getDashboard({
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        financialYear: financialYear !== 'ALL' ? financialYear : undefined,
      });
      setData(res.data);
    } catch (err) {
      onShowToast('error', 'Failed to load Reporting Dashboard', err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, financialYear, onShowToast]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const kpis = data?.kpis;
  const totalPayMix =
    (kpis?.paymentBreakdown.cash ?? 0) +
    (kpis?.paymentBreakdown.upi ?? 0) +
    (kpis?.paymentBreakdown.other ?? 0);

  const pct = (part: number) => (totalPayMix > 0 ? Math.round((part / totalPayMix) * 100) : 0);

  const filteredStaff = (data?.staffPerformance ?? []).filter(
    (s) =>
      !searchStaff.trim() ||
      s.staffId.toLowerCase().includes(searchStaff.toLowerCase()) ||
      s.staffName.toLowerCase().includes(searchStaff.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header & Quick Navigation */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-neutral-950 dark:text-white tracking-tight">
            Reporting &amp; Business Intelligence Dashboard
          </h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Live database figures across CRM, Applications, Service Margins &amp; Posted GL Vouchers · Scope: {currentUser.role}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => onNavigate('reports-catalog')} icon={<FileSpreadsheet className="h-3.5 w-3.5" />}>
            All 45+ Reports
          </Button>
          <Button variant="outline" size="sm" onClick={() => onNavigate('reports-analytics')} icon={<PieChart className="h-3.5 w-3.5" />}>
            Analytics
          </Button>
          <Button variant="outline" size="sm" onClick={() => onNavigate('reports-builder')} icon={<Wrench className="h-3.5 w-3.5" />}>
            Custom Builder
          </Button>
          <Button variant="outline" size="sm" onClick={() => onNavigate('reports-scheduler')} icon={<Clock className="h-3.5 w-3.5" />}>
            Schedules
          </Button>
          <Button variant="outline" size="sm" onClick={() => onNavigate('reports-archive')} icon={<Archive className="h-3.5 w-3.5" />}>
            Archives &amp; Audit
          </Button>
          <Button variant="primary" size="sm" loading={loading} onClick={loadDashboard} icon={<RefreshCw className="h-3.5 w-3.5" />}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
        <div>
          <label className="block font-medium text-neutral-600 dark:text-neutral-400 mb-1">Financial Year</label>
          <select
            value={financialYear}
            onChange={(e) => setFinancialYear(e.target.value)}
            className="w-full h-9 px-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded-md"
          >
            <option value="ALL">All Financial Years</option>
            <option value="2026-27">FY 2026-27 (Apr–Mar)</option>
            <option value="2025-26">FY 2025-26 (Apr–Mar)</option>
          </select>
        </div>
        <div>
          <label className="block font-medium text-neutral-600 dark:text-neutral-400 mb-1">From Date</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-full h-9 px-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded-md"
          />
        </div>
        <div>
          <label className="block font-medium text-neutral-600 dark:text-neutral-400 mb-1">To Date</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-full h-9 px-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded-md"
          />
        </div>
        <div className="flex items-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setFromDate('');
              setToDate('');
              setFinancialYear('ALL');
            }}
          >
            Reset Filters
          </Button>
        </div>
      </div>

      {/* Primary KPI Grid */}
      {kpis && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4">
              <div className="flex items-center justify-between text-xs text-neutral-500">
                <span>Reports Generated</span>
                <BarChart3 className="h-4 w-4 text-neutral-700 dark:text-neutral-300" />
              </div>
              <div className="mt-2 text-2xl font-bold text-neutral-950 dark:text-white tabular-nums">
                {kpis.totalReportsGenerated}
              </div>
              <div className="mt-1 text-[11px] text-neutral-500 tabular-nums">
                Today: {kpis.dailyReportsCount} · 7d: {kpis.weeklyReportsCount} · 30d: {kpis.monthlyReportsCount}
              </div>
            </div>

            <button
              type="button"
              onClick={() => onQuickOpenReport ? onQuickOpenReport('CUST_COMPLETE_LIST') : onNavigate('reports-catalog')}
              className="text-left bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 hover:border-neutral-400 rounded-lg p-4 cursor-pointer transition-colors"
            >
              <div className="flex items-center justify-between text-xs text-neutral-500">
                <span>Total Customers</span>
                <Users className="h-4 w-4 text-neutral-700 dark:text-neutral-300" />
              </div>
              <div className="mt-2 text-2xl font-bold text-neutral-950 dark:text-white tabular-nums flex items-center gap-2">
                {kpis.totalCustomers}
                <ArrowUpRight className="h-4 w-4 text-neutral-400" />
              </div>
              <div className="mt-1 text-[11px] text-neutral-500 tabular-nums">
                Active: {kpis.activeCustomers} · Growth: {kpis.growthIndicators.customerGrowthPct}%
              </div>
            </button>

            <button
              type="button"
              onClick={() => onQuickOpenReport ? onQuickOpenReport('APP_TOTAL_REPORT') : onNavigate('reports-catalog')}
              className="text-left bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 hover:border-neutral-400 rounded-lg p-4 cursor-pointer transition-colors"
            >
              <div className="flex items-center justify-between text-xs text-neutral-500">
                <span>Applications &amp; Success Rate</span>
                <FileText className="h-4 w-4 text-neutral-700 dark:text-neutral-300" />
              </div>
              <div className="mt-2 text-2xl font-bold text-neutral-950 dark:text-white tabular-nums flex items-center gap-2">
                {kpis.totalApplications} <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">({kpis.applicationSuccessRatePct}%)</span>
              </div>
              <div className="mt-1 text-[11px] text-neutral-500 tabular-nums">
                Done: {kpis.completedApplications} · Pending: {kpis.pendingApplications} · Rej/Can: {kpis.rejectedOrCancelledApplications}
              </div>
            </button>

            <button
              type="button"
              onClick={() => onQuickOpenReport ? onQuickOpenReport('CUST_DUE_REPORT') : onNavigate('reports-catalog')}
              className="text-left bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 hover:border-neutral-400 rounded-lg p-4 cursor-pointer transition-colors"
            >
              <div className="flex items-center justify-between text-xs text-neutral-500">
                <span>Collections vs Customer Dues</span>
                <IndianRupee className="h-4 w-4 text-neutral-700 dark:text-neutral-300" />
              </div>
              <div className="mt-2 text-xl font-bold text-neutral-950 dark:text-white tabular-nums">
                {formatINR(kpis.totalCollections)}
              </div>
              <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-400 font-medium tabular-nums">
                Outstanding Dues: {formatINR(kpis.outstandingCustomerDues)}
              </div>
            </button>
          </div>

          {/* Financial Row + Payment Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-7 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-neutral-950 dark:text-white">
                  Posted Financial Performance (Excludes PNB CSP Principal &amp; Draft/Reversed Vouchers)
                </h2>
                <TrendingUp className="h-4 w-4 text-neutral-500" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="p-3 rounded border border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-950/50">
                  <div className="text-[11px] text-neutral-500">Total Income</div>
                  <div className="mt-1 text-lg font-bold text-neutral-950 dark:text-white tabular-nums">
                    {currentUser.role === 'STAFF' ? 'Restricted' : formatINR(kpis.totalIncome)}
                  </div>
                </div>
                <div className="p-3 rounded border border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-950/50">
                  <div className="text-[11px] text-neutral-500">Total Expenses</div>
                  <div className="mt-1 text-lg font-bold text-neutral-950 dark:text-white tabular-nums">
                    {currentUser.role === 'STAFF' ? 'Restricted' : formatINR(kpis.totalExpenses)}
                  </div>
                </div>
                <div className="p-3 rounded border border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-950/50">
                  <div className="text-[11px] text-neutral-500">Net Profit</div>
                  <div className="mt-1 text-lg font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                    {currentUser.role === 'STAFF' ? 'Restricted' : formatINR(kpis.netProfit)}
                  </div>
                </div>
              </div>
              <p className="mt-3 text-[11px] text-neutral-500">
                {kpis.growthIndicators.methodologyNote}
              </p>
            </div>

            <div className="lg:col-span-5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
              <h2 className="text-sm font-semibold text-neutral-950 dark:text-white mb-3">
                Cash / UPI / Other Collection Summary
              </h2>
              <div className="space-y-2.5 text-xs">
                {[
                  { label: 'Cash', val: kpis.paymentBreakdown.cash, bar: 'bg-neutral-950 dark:bg-white' },
                  { label: 'UPI / Digital', val: kpis.paymentBreakdown.upi, bar: 'bg-blue-700 dark:bg-blue-400' },
                  { label: 'Card / Bank / Other', val: kpis.paymentBreakdown.other, bar: 'bg-neutral-500' },
                ].map((item) => (
                  <div key={item.label}>
                    <div className="flex justify-between tabular-nums mb-1">
                      <span className="text-neutral-700 dark:text-neutral-300">{item.label}</span>
                      <span className="font-semibold text-neutral-950 dark:text-white">
                        {formatINR(item.val)} ({pct(item.val)}%)
                      </span>
                    </div>
                    <div className="h-2 bg-neutral-100 dark:bg-neutral-800 rounded overflow-hidden">
                      <div className={`h-full ${item.bar}`} style={{ width: `${pct(item.val)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Staff Performance & Module Activation Status */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <h2 className="text-sm font-semibold text-neutral-950 dark:text-white">
              Staff Performance &amp; SLA Compliance
            </h2>
            <input
              type="text"
              value={searchStaff}
              onChange={(e) => setSearchStaff(e.target.value)}
              placeholder="Search staff ID or name..."
              className="h-8 px-2.5 text-xs bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800 text-neutral-500">
                  <th className="py-2 pr-3">Staff</th>
                  <th className="py-2 px-2 text-right">Assigned</th>
                  <th className="py-2 px-2 text-right">Done</th>
                  <th className="py-2 px-2 text-right">Overdue</th>
                  <th className="py-2 pl-2 text-right">Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {filteredStaff.map((st) => (
                  <tr key={st.staffId}>
                    <td className="py-2 pr-3">
                      <div className="font-medium text-neutral-950 dark:text-white">{st.staffName}</div>
                      <div className="font-mono text-[11px] text-neutral-500">{st.staffId}</div>
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums">{st.totalAssigned}</td>
                    <td className="py-2 px-2 text-right tabular-nums">{st.completed}</td>
                    <td className="py-2 px-2 text-right tabular-nums text-red-600">{st.overdue}</td>
                    <td className="py-2 pl-2 text-right tabular-nums font-semibold">{st.completionRatePct}%</td>
                  </tr>
                ))}
                {filteredStaff.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-4 text-center text-neutral-500">
                      No staff assignments recorded in range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-neutral-950 dark:text-white mb-2">
              Business Module Report Availability
            </h2>
            <div className="space-y-2 text-xs">
              {(data?.enabledBusinessModules ?? []).map((mod) => (
                <div
                  key={mod.key}
                  className="p-2.5 rounded border border-neutral-200 dark:border-neutral-800 flex items-start justify-between gap-2"
                >
                  <div>
                    <div className="font-medium text-neutral-900 dark:text-neutral-100">{mod.label}</div>
                    <div className="text-[11px] text-neutral-500 mt-0.5">{mod.reason}</div>
                  </div>
                  <span
                    className={`px-2 py-0.5 text-[10px] font-mono rounded ${
                      mod.enabled
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
                    }`}
                  >
                    {mod.enabled ? 'ACTIVE' : 'HIDDEN'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-neutral-200 dark:border-neutral-800 pt-3">
            <h3 className="text-xs font-semibold text-neutral-800 dark:text-neutral-200 mb-2">
              Recent Report Activity
            </h3>
            <div className="space-y-1.5 text-[11px]">
              {(data?.recentReportsActivity ?? []).slice(0, 5).map((act) => (
                <div key={act.id} className="flex items-center justify-between gap-2 text-neutral-600 dark:text-neutral-300">
                  <span className="truncate">
                    <span className="font-mono font-semibold">{act.action}</span> · {act.reportName}
                  </span>
                  <span className="font-mono text-neutral-400 shrink-0">{act.exportFormat}</span>
                </div>
              ))}
              {(data?.recentReportsActivity ?? []).length === 0 && (
                <div className="text-neutral-500">No report exports logged yet in this session.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
