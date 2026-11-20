import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bug,
  CheckCircle2,
  FileDown,
  FileSpreadsheet,
  FlaskConical,
  Play,
  RefreshCw,
  Rocket,
  ShieldAlert,
} from 'lucide-react';
import { PageKey, UserProfile } from '../../modules/types';
import { phase09Api, QaDashboardOverview, QaEnvironmentKey } from '../../services/phase09Api';
import { Button } from '../../components/Button';
import { formatDateTimeIST } from '../../services/formatters';

interface QaDashboardPageProps {
  currentUser: UserProfile;
  onNavigate: (page: PageKey) => void;
  onShowToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}

const READINESS_COLORS: Record<string, string> = {
  RELEASED: 'text-emerald-700 dark:text-emerald-400',
  APPROVED: 'text-emerald-700 dark:text-emerald-400',
  READY_FOR_ADMIN_APPROVAL: 'text-blue-800 dark:text-blue-400',
  TESTING_IN_PROGRESS: 'text-amber-700 dark:text-amber-400',
  BLOCKED: 'text-red-700 dark:text-red-400',
  NOT_READY: 'text-neutral-600 dark:text-neutral-400',
};

export const QaDashboardPage: React.FC<QaDashboardPageProps> = ({
  currentUser,
  onNavigate,
  onShowToast,
}) => {
  const [data, setData] = useState<QaDashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [exportLang, setExportLang] = useState<'en' | 'bn'>('en');

  // Interactive Filters
  const [envKey, setEnvKey] = useState<QaEnvironmentKey>('TESTING');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [testerFilter, setTesterFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const canExecute = currentUser.role === 'ADMIN' || currentUser.role === 'MANAGER';

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await phase09Api.getDashboard({
        severity: severityFilter,
        testerUserId: testerFilter || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
      });
      setData(res.data);
    } catch (err) {
      onShowToast(
        'error',
        'Failed to load QA Dashboard',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setLoading(false);
    }
  }, [fromDate, onShowToast, severityFilter, testerFilter, toDate]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const handleRunFullSuite = async () => {
    if (!canExecute) return;
    setRunning(true);
    try {
      const res = await phase09Api.executeSuite({
        envKey,
        suiteCode: 'ALL',
        triggerSource: 'AUTOMATED_SUITE',
      });
      onShowToast(
        res.data.batch.failedCount === 0 ? 'success' : 'error',
        `QA Run Completed (${res.data.batch.executionCode})`,
        `${res.data.batch.passedCount} Passed, ${res.data.batch.failedCount} Failed, ${res.data.batch.blockedCount} Blocked`
      );
      await loadDashboard();
    } catch (err) {
      onShowToast(
        'error',
        'Suite Execution Blocked',
        err instanceof Error ? err.message : undefined
      );
    } finally {
      setRunning(false);
    }
  };

  const handleExportPdf = async () => {
    try {
      const name = await phase09Api.downloadPdfReport(exportLang);
      onShowToast('success', 'QA PDF Exported', name);
    } catch (err) {
      onShowToast('error', 'PDF Export Failed', err instanceof Error ? err.message : undefined);
    }
  };

  const handleExportExcel = async () => {
    try {
      const name = await phase09Api.downloadExcelWorkbook(exportLang);
      onShowToast('success', 'QA 10-Sheet Excel Exported', name);
    } catch (err) {
      onShowToast('error', 'Excel Export Failed', err instanceof Error ? err.message : undefined);
    }
  };

  const t = data?.totals;

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-neutral-200 dark:border-neutral-800 pb-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-950 dark:text-white tracking-tight">
            Phase 09 Quality Assurance & Release Readiness
          </h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Live verification evidence across Unit, Integration, System, OWASP Security, Performance, Financial Reconciliation, Backup Drills, Regression & UAT.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={envKey}
            onChange={(e) => setEnvKey(e.target.value as QaEnvironmentKey)}
            aria-label="Target QA Environment"
            className="h-9 px-2.5 text-xs rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100"
          >
            <option value="DEVELOPMENT">Env: DEVELOPMENT</option>
            <option value="TESTING">Env: TESTING (Isolated)</option>
            <option value="STAGING">Env: STAGING</option>
            <option value="PRODUCTION">Env: PRODUCTION (Locked)</option>
          </select>

          <select
            value={exportLang}
            onChange={(e) => setExportLang(e.target.value as 'en' | 'bn')}
            aria-label="Report Language"
            className="h-9 px-2.5 text-xs rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100"
          >
            <option value="en">Report: English</option>
            <option value="bn">Report: বাংলা + EN</option>
          </select>

          <Button variant="secondary" size="sm" onClick={handleExportPdf} icon={<FileDown className="h-3.5 w-3.5" />}>
            QA PDF
          </Button>
          <Button variant="secondary" size="sm" onClick={handleExportExcel} icon={<FileSpreadsheet className="h-3.5 w-3.5" />}>
            10-Sheet Excel
          </Button>
          {canExecute && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleRunFullSuite}
              disabled={running}
              icon={<Play className="h-3.5 w-3.5" />}
            >
              {running ? 'Running All Suites...' : 'Execute Full QA Suite'}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={loadDashboard} icon={<RefreshCw className="h-3.5 w-3.5" />}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-md p-3">
        <div>
          <label className="block text-[11px] font-medium text-neutral-500 dark:text-neutral-400 mb-1">
            Priority / Severity
          </label>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="w-full h-8 px-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100"
          >
            <option value="ALL">All Priorities</option>
            <option value="CRITICAL">CRITICAL Only</option>
            <option value="HIGH">HIGH Only</option>
            <option value="MEDIUM">MEDIUM Only</option>
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-neutral-500 dark:text-neutral-400 mb-1">
            Tester User ID
          </label>
          <input
            type="text"
            value={testerFilter}
            onChange={(e) => setTesterFilter(e.target.value)}
            placeholder="e.g. MC2627110001"
            className="w-full h-8 px-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 font-mono"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-neutral-500 dark:text-neutral-400 mb-1">
            Executed From
          </label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-full h-8 px-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-neutral-500 dark:text-neutral-400 mb-1">
            Executed To
          </label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-full h-8 px-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100"
          />
        </div>
      </div>

      {/* Release Readiness Banner */}
      {data && (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-md p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
              <Rocket className="h-4 w-4 text-blue-800 dark:text-blue-400" />
              <span>Release Gate ({data.releaseReadiness.releaseVersion})</span>
            </div>
            <div className={`text-lg font-semibold tracking-tight ${READINESS_COLORS[data.releaseReadiness.releaseStatus] || ''}`}>
              {data.releaseReadiness.releaseStatus.replace(/_/g, ' ')}
            </div>
            {data.releaseReadiness.blockers.length > 0 ? (
              <p className="text-xs text-neutral-600 dark:text-neutral-300">
                Current Blockers ({data.releaseReadiness.blockers.length}): {data.releaseReadiness.blockers.slice(0, 3).join(' · ')}
              </p>
            ) : (
              <p className="text-xs text-emerald-700 dark:text-emerald-400">
                All mandatory automated, financial, backup, regression & UAT gates satisfied.
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => onNavigate('qa-workbench')}>
              Open Execution Workbench
            </Button>
            <Button variant="secondary" size="sm" onClick={() => onNavigate('qa-bugs')}>
              Bugs, Security & Perf
            </Button>
            <Button variant="primary" size="sm" onClick={() => onNavigate('qa-release')}>
              UAT, Reconciliation & Approval
            </Button>
          </div>
        </div>
      )}

      {/* Primary KPI Grid */}
      {loading && !t ? (
        <div className="p-8 text-center text-xs text-neutral-500">Loading QA telemetry...</div>
      ) : t ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-md p-3.5">
              <div className="text-[11px] text-neutral-500 dark:text-neutral-400">Total Test Cases</div>
              <div className="text-2xl font-semibold font-mono tabular-nums text-neutral-950 dark:text-white mt-1">
                {t.totalTestCases}
              </div>
              <div className="text-[11px] text-neutral-500 mt-1 tabular-nums">
                {t.executedCases} Executed · {t.pendingCases} Pending
              </div>
            </div>

            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-md p-3.5">
              <div className="text-[11px] text-neutral-500 dark:text-neutral-400">Pass Rate</div>
              <div className="text-2xl font-semibold font-mono tabular-nums text-emerald-700 dark:text-emerald-400 mt-1">
                {t.passPercentage}%
              </div>
              <div className="text-[11px] text-neutral-500 mt-1 tabular-nums">
                {t.passedCases} Passed · {t.failedCases} Failed
              </div>
            </div>

            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-md p-3.5">
              <div className="text-[11px] text-neutral-500 dark:text-neutral-400 flex items-center gap-1">
                <Bug className="h-3.5 w-3.5" /> Open Bugs
              </div>
              <div className="text-2xl font-semibold font-mono tabular-nums text-neutral-950 dark:text-white mt-1">
                {t.criticalBugs + t.highBugs + t.mediumBugs + t.lowBugs}
              </div>
              <div className="text-[11px] text-red-700 dark:text-red-400 mt-1 tabular-nums">
                Crit {t.criticalBugs} · High {t.highBugs} · Med {t.mediumBugs}
              </div>
            </div>

            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-md p-3.5">
              <div className="text-[11px] text-neutral-500 dark:text-neutral-400 flex items-center gap-1">
                <ShieldAlert className="h-3.5 w-3.5" /> Open Security Vulns
              </div>
              <div className={`text-2xl font-semibold font-mono tabular-nums mt-1 ${t.openVulnerabilities > 0 ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                {t.openVulnerabilities}
              </div>
              <div className="text-[11px] text-neutral-500 mt-1">OWASP Pen-Test Audit</div>
            </div>

            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-md p-3.5">
              <div className="text-[11px] text-neutral-500 dark:text-neutral-400">Performance SLA Issues</div>
              <div className={`text-2xl font-semibold font-mono tabular-nums mt-1 ${t.performanceIssues > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-neutral-950 dark:text-white'}`}>
                {t.performanceIssues}
              </div>
              <div className="text-[11px] text-neutral-500 mt-1">Load, Stress & Exports</div>
            </div>

            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-md p-3.5">
              <div className="text-[11px] text-neutral-500 dark:text-neutral-400">Regression & UAT</div>
              <div className="text-sm font-semibold font-mono text-neutral-950 dark:text-white mt-1.5">
                REG: {t.regressionStatus}
              </div>
              <div className="text-xs font-mono text-neutral-600 dark:text-neutral-300 mt-1">
                UAT: {t.uatApprovalStatus}
              </div>
            </div>
          </div>

          {/* Charts: Module-Wise Pass Rates & Phase Coverage */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-md p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-neutral-950 dark:text-white">
                  Module Quality & Pass Coverage
                </h2>
                <span className="text-[11px] font-mono text-neutral-500">Live Case Status</span>
              </div>
              <div className="space-y-2.5">
                {data.moduleBreakdown.map((m) => (
                  <div key={m.moduleName} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-neutral-800 dark:text-neutral-200 truncate pr-2">
                        {m.moduleName}
                      </span>
                      <span className="font-mono tabular-nums text-neutral-600 dark:text-neutral-400 shrink-0">
                        {m.passed}/{m.total} ({m.qualityScorePct}%)
                      </span>
                    </div>
                    <div className="h-2 w-full bg-neutral-100 dark:bg-neutral-800 rounded-sm overflow-hidden flex">
                      {m.total > 0 && (
                        <>
                          <div
                            className="bg-emerald-600 h-full"
                            style={{ width: `${(m.passed / m.total) * 100}%` }}
                          />
                          <div
                            className="bg-red-600 h-full"
                            style={{ width: `${(m.failed / m.total) * 100}%` }}
                          />
                          <div
                            className="bg-amber-500 h-full"
                            style={{ width: `${(m.blocked / m.total) * 100}%` }}
                          />
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-md p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-neutral-950 dark:text-white">
                  Recent Test Execution Batches
                </h2>
                <button
                  type="button"
                  onClick={() => onNavigate('qa-workbench')}
                  className="text-xs text-blue-800 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  Inspect All Results
                </button>
              </div>
              {data.recentExecutions.length === 0 ? (
                <div className="py-10 text-center text-xs text-neutral-500 dark:text-neutral-400 border border-dashed border-neutral-200 dark:border-neutral-800 rounded">
                  <FlaskConical className="h-5 w-5 mx-auto mb-2 text-neutral-400" />
                  No QA test batches executed yet. Click &ldquo;Execute Full QA Suite&rdquo; to run real isolated tests.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-neutral-200 dark:border-neutral-800 text-left text-neutral-500">
                        <th className="py-2 pr-2 font-medium">Execution ID</th>
                        <th className="py-2 px-2 font-medium">Env</th>
                        <th className="py-2 px-2 font-medium">Suite</th>
                        <th className="py-2 px-2 font-medium text-right">Pass / Fail</th>
                        <th className="py-2 pl-2 font-medium text-right">When</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                      {data.recentExecutions.map((b) => (
                        <tr key={b.executionCode}>
                          <td className="py-2 pr-2 font-mono text-neutral-900 dark:text-neutral-100">
                            {b.executionCode}
                          </td>
                          <td className="py-2 px-2 font-mono text-neutral-600 dark:text-neutral-400">
                            {b.envKey}
                          </td>
                          <td className="py-2 px-2 text-neutral-700 dark:text-neutral-300">
                            {b.suiteFilter}
                          </td>
                          <td className="py-2 px-2 text-right font-mono tabular-nums">
                            <span className="text-emerald-700 dark:text-emerald-400">{b.passedCount}P</span>{' '}
                            /{' '}
                            <span className={b.failedCount > 0 ? 'text-red-700 dark:text-red-400' : 'text-neutral-500'}>
                              {b.failedCount}F
                            </span>
                          </td>
                          <td className="py-2 pl-2 text-right text-neutral-500 tabular-nums">
                            {formatDateTimeIST(b.completedAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* 8 Release Gate Checklist Snapshot */}
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-md p-4">
            <h2 className="text-sm font-semibold text-neutral-950 dark:text-white mb-3">
              8 Mandatory Release Readiness Gates
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              {[
                ['Critical Tests Executed & Passed', data.releaseReadiness.gates.criticalTestsExecutedAndPassed],
                ['Zero Open Critical/High Bugs', data.releaseReadiness.gates.noCriticalOrHighOpenBugs],
                ['Zero Unresolved Security Vulns', data.releaseReadiness.gates.noUnresolvedHighSecurityVulns],
                ['Financial Reconciliation Balanced', data.releaseReadiness.gates.financialReconciliationPassed],
                ['Backup & Full Restore Drill Passed', data.releaseReadiness.gates.backupRestoreDrillPassed],
                ['Full Regression Suite Passed', data.releaseReadiness.gates.regressionPassed],
                ['Multi-Role UAT (Admin/Mgr/Staff)', data.releaseReadiness.gates.uatApprovedByRoles],
                ['Production Build & CI Pipeline Valid', data.releaseReadiness.gates.buildVerificationRecorded],
              ].map(([label, ok]) => (
                <div
                  key={String(label)}
                  className="flex items-center justify-between p-2.5 rounded border border-neutral-200 dark:border-neutral-800"
                >
                  <span className="text-neutral-700 dark:text-neutral-300 pr-2">{label}</span>
                  {ok ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};
