import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Bug,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react';
import { UserProfile } from '../../modules/types';
import {
  BugCategory,
  BugPriority,
  BugStatus,
  phase09Api,
  QaBugReport,
  QaEnvironmentKey,
  QaPerformanceResult,
  QaRegressionRunRecord,
  QaSecurityFinding,
} from '../../services/phase09Api';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { formatDateTimeIST } from '../../services/formatters';

interface BugAndRegressionPageProps {
  currentUser: UserProfile;
  onShowToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}

const BUG_CATEGORIES: BugCategory[] = [
  'Functional',
  'UI',
  'Database',
  'API',
  'Security',
  'Performance',
  'Financial Calculation',
  'Integration',
  'Compatibility',
];

const BUG_STATUSES: BugStatus[] = [
  'New',
  'Assigned',
  'In Progress',
  'Fixed',
  'Ready for Retest',
  'Verified',
  'Closed',
  'Reopened',
];

export const BugAndRegressionPage: React.FC<BugAndRegressionPageProps> = ({
  currentUser,
  onShowToast,
}) => {
  const [bugs, setBugs] = useState<QaBugReport[]>([]);
  const [notifications, setNotifications] = useState<
    Array<{ id: number; bugCode: string; message: string; recipientUserId: string; createdAt: string }>
  >([]);
  const [securityFindings, setSecurityFindings] = useState<QaSecurityFinding[]>([]);
  const [perfResults, setPerfResults] = useState<QaPerformanceResult[]>([]);
  const [regressionRuns, setRegressionRuns] = useState<QaRegressionRunRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState(false);

  // Filters
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [envKey] = useState<QaEnvironmentKey>('TESTING');

  // Create Bug modal
  const [bugModalOpen, setBugModalOpen] = useState(false);
  const [bugTitle, setBugTitle] = useState('');
  const [bugCategory, setBugCategory] = useState<BugCategory>('Functional');
  const [bugPriority, setBugPriority] = useState<BugPriority>('High');
  const [bugModule, setBugModule] = useState('Applications & Services');
  const [bugDesc, setBugDesc] = useState('');
  const [bugSteps, setBugSteps] = useState('1. Open module\n2. Submit form');
  const [bugExpected, setBugExpected] = useState('');
  const [bugActual, setBugActual] = useState('');
  const [bugDeveloper, setBugDeveloper] = useState('MC2627110001');

  // Lifecycle / Retest Modal
  const [editBug, setEditBug] = useState<QaBugReport | null>(null);
  const [nextStatus, setNextStatus] = useState<BugStatus>('In Progress');
  const [nextDev, setNextDev] = useState('');
  const [notes, setNotes] = useState('');
  const [retestMode, setRetestMode] = useState<'NONE' | 'PASSED' | 'FAILED'>('NONE');

  // Regression Trigger Modal
  const [regModalOpen, setRegModalOpen] = useState(false);
  const [regReason, setRegReason] = useState('Post-bug-fix regression verification');

  const canOperate = currentUser.role === 'ADMIN' || currentUser.role === 'MANAGER';

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [bugRes, secRes, perfRes, regRes] = await Promise.all([
        phase09Api.getBugs({
          priority: priorityFilter,
          status: statusFilter,
          category: categoryFilter,
        }),
        phase09Api.getSecurityFindings(),
        phase09Api.getPerformanceResults(),
        phase09Api.getRegressionRuns(),
      ]);
      setBugs(bugRes.data.bugs);
      setNotifications(bugRes.data.notifications);
      setSecurityFindings(secRes.data);
      setPerfResults(perfRes.data);
      setRegressionRuns(regRes.data);
    } catch (err) {
      onShowToast('error', 'Failed to load Bug & Security data', err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, onShowToast, priorityFilter, statusFilter]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleCreateBug = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await phase09Api.createBug({
        title: bugTitle,
        category: bugCategory,
        priority: bugPriority,
        moduleName: bugModule,
        envKey,
        description: bugDesc,
        reproductionSteps: bugSteps,
        expectedResult: bugExpected,
        actualResult: bugActual,
        assignedDeveloper: bugDeveloper || undefined,
      });
      onShowToast('success', `Bug ${res.data.bugCode} Logged`, `${res.data.priority} · Assigned to ${res.data.assignedDeveloper || 'Queue'}`);
      setBugModalOpen(false);
      setBugTitle('');
      setBugDesc('');
      setBugExpected('');
      setBugActual('');
      await loadAll();
    } catch (err) {
      onShowToast('error', 'Bug creation failed', err instanceof Error ? err.message : undefined);
    }
  };

  const handleUpdateBug = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editBug) return;
    try {
      await phase09Api.updateBug(editBug.bugCode, {
        status: retestMode === 'NONE' ? nextStatus : undefined,
        assignedDeveloper: nextDev || null,
        resolutionNotes: notes,
        retestOutcome: retestMode === 'NONE' ? undefined : retestMode,
      });
      onShowToast('success', `Bug ${editBug.bugCode} Updated`, 'Lifecycle state & audit history recorded.');
      setEditBug(null);
      setNotes('');
      setRetestMode('NONE');
      await loadAll();
    } catch (err) {
      onShowToast('error', 'Bug update failed', err instanceof Error ? err.message : undefined);
    }
  };

  const handleRunSecurityAudit = async () => {
    if (!canOperate) return;
    setBusyAction(true);
    try {
      const res = await phase09Api.runSecurityAudit();
      onShowToast('success', 'OWASP Security Audit Executed', `${res.data.length} controls evaluated.`);
      await loadAll();
    } catch (err) {
      onShowToast('error', 'Security audit failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusyAction(false);
    }
  };

  const handleRunPerformance = async () => {
    if (!canOperate) return;
    setBusyAction(true);
    try {
      const res = await phase09Api.runPerformanceBenchmarks();
      const failed = res.data.filter((x) => !x.passed).length;
      onShowToast(
        failed === 0 ? 'success' : 'error',
        `Performance Benchmarks Completed`,
        `${res.data.length} scenarios measured · ${failed} SLA failures`
      );
      await loadAll();
    } catch (err) {
      onShowToast('error', 'Performance run failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusyAction(false);
    }
  };

  const handleRunRegression = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canOperate) return;
    setBusyAction(true);
    try {
      const res = await phase09Api.runRegression({
        triggerReason: regReason,
        affectedModules: ['ALL_MODULES'],
        envKey,
      });
      onShowToast(
        res.data.status === 'PASSED' ? 'success' : 'error',
        `Regression ${res.data.regressionCode}: ${res.data.status}`,
        `${res.data.passedCount}/${res.data.totalCases} passed`
      );
      setRegModalOpen(false);
      await loadAll();
    } catch (err) {
      onShowToast('error', 'Regression run failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusyAction(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-neutral-200 dark:border-neutral-800 pb-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-950 dark:text-white tracking-tight">
            Bug Tracking, OWASP Security, Performance & Regression
          </h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Full defect workflow (New → Assigned → Fixed → Retest → Verified → Closed), OWASP penetration scans & SLA load benchmarks.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" size="sm" onClick={() => setBugModalOpen(true)} icon={<Plus className="h-3.5 w-3.5" />}>
            Log Bug Report
          </Button>
          {canOperate && (
            <>
              <Button variant="secondary" size="sm" disabled={busyAction} onClick={handleRunSecurityAudit} icon={<ShieldAlert className="h-3.5 w-3.5" />}>
                Run OWASP Audit
              </Button>
              <Button variant="secondary" size="sm" disabled={busyAction} onClick={handleRunPerformance} icon={<Activity className="h-3.5 w-3.5" />}>
                Run Load Benchmarks
              </Button>
              <Button variant="secondary" size="sm" disabled={busyAction} onClick={() => setRegModalOpen(true)} icon={<RotateCcw className="h-3.5 w-3.5" />}>
                Run Regression
              </Button>
            </>
          )}
          <Button variant="ghost" size="sm" onClick={loadAll} icon={<RefreshCw className="h-3.5 w-3.5" />}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Bug Register */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-md p-4 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-950 dark:text-white">
            <Bug className="h-4 w-4 text-red-700 dark:text-red-400" />
            <span>Defect & Retest Register ({bugs.length})</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="h-8 px-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
            >
              <option value="ALL">All Priorities</option>
              <option value="Critical">Critical</option>
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-8 px-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
            >
              <option value="ALL">All Statuses</option>
              {BUG_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-8 px-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
            >
              <option value="ALL">All Categories</option>
              {BUG_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading && bugs.length === 0 ? (
          <div className="py-6 text-center text-xs text-neutral-500">Loading bug register...</div>
        ) : bugs.length === 0 ? (
          <div className="py-8 text-center text-xs text-neutral-500 border border-dashed border-neutral-200 dark:border-neutral-800 rounded">
            No defects logged matching current filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800 text-left text-neutral-500">
                  <th className="py-2 pr-2 font-medium">Bug ID</th>
                  <th className="py-2 px-2 font-medium">Priority / Category</th>
                  <th className="py-2 px-2 font-medium">Title & Module</th>
                  <th className="py-2 px-2 font-medium">Status</th>
                  <th className="py-2 px-2 font-medium">Assigned Dev</th>
                  <th className="py-2 px-2 font-medium">Retests</th>
                  <th className="py-2 pl-2 font-medium text-right">Workflow</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {bugs.map((b) => (
                  <tr key={b.bugCode}>
                    <td className="py-2.5 pr-2 font-mono whitespace-nowrap">{b.bugCode}</td>
                    <td className="py-2.5 px-2 whitespace-nowrap">
                      <span
                        className={`font-semibold ${
                          b.priority === 'Critical'
                            ? 'text-red-700 dark:text-red-400'
                            : b.priority === 'High'
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-neutral-700 dark:text-neutral-300'
                        }`}
                      >
                        {b.priority}
                      </span>{' '}
                      · <span className="text-neutral-500">{b.category}</span>
                    </td>
                    <td className="py-2.5 px-2 max-w-sm">
                      <div className="font-medium text-neutral-900 dark:text-neutral-100">{b.title}</div>
                      <div className="text-[11px] text-neutral-500 truncate">{b.moduleName}</div>
                    </td>
                    <td className="py-2.5 px-2 font-mono whitespace-nowrap">{b.status}</td>
                    <td className="py-2.5 px-2 font-mono text-neutral-600 dark:text-neutral-400 whitespace-nowrap">
                      {b.assignedDeveloper || 'Unassigned'}
                    </td>
                    <td className="py-2.5 px-2 font-mono tabular-nums">{b.retestHistory.length}</td>
                    <td className="py-2.5 pl-2 text-right whitespace-nowrap">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setEditBug(b);
                          setNextStatus(b.status);
                          setNextDev(b.assignedDeveloper || '');
                          setNotes('');
                          setRetestMode('NONE');
                        }}
                      >
                        Transition / Retest
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {notifications.length > 0 && (
          <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800">
            <div className="text-[11px] font-semibold text-neutral-500 mb-1.5">
              Recent Defect Assignment Notifications
            </div>
            <div className="space-y-1 text-xs text-neutral-600 dark:text-neutral-400">
              {notifications.slice(0, 4).map((n) => (
                <div key={n.id} className="flex items-center justify-between">
                  <span>{n.message}</span>
                  <span className="font-mono text-[11px]">{formatDateTimeIST(n.createdAt)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* OWASP Security Findings + Performance SLA Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-md p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-950 dark:text-white flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-blue-800 dark:text-blue-400" />
              OWASP Security Audit Findings ({securityFindings.length})
            </h2>
          </div>
          {securityFindings.length === 0 ? (
            <div className="py-8 text-center text-xs text-neutral-500 border border-dashed border-neutral-200 dark:border-neutral-800 rounded">
              Security audit has not been run yet. Click &ldquo;Run OWASP Audit&rdquo;.
            </div>
          ) : (
            <div className="overflow-x-auto max-h-80">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-neutral-200 dark:border-neutral-800 text-left text-neutral-500">
                    <th className="py-2 pr-2 font-medium">OWASP / Area</th>
                    <th className="py-2 px-2 font-medium">Severity</th>
                    <th className="py-2 px-2 font-medium">Status</th>
                    <th className="py-2 pl-2 font-medium">Evidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {securityFindings.slice(0, 16).map((s) => (
                    <tr key={s.findingCode}>
                      <td className="py-2 pr-2">
                        <div className="font-medium text-neutral-900 dark:text-neutral-100">{s.testArea}</div>
                        <div className="text-[11px] text-neutral-500">{s.owaspCategory}</div>
                      </td>
                      <td className="py-2 px-2 font-mono">{s.severity}</td>
                      <td
                        className={`py-2 px-2 font-mono whitespace-nowrap ${
                          s.status === 'OPEN_VULNERABILITY'
                            ? 'text-red-700 dark:text-red-400 font-semibold'
                            : 'text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {s.status}
                      </td>
                      <td className="py-2 pl-2 text-neutral-600 dark:text-neutral-400">{s.evidence}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-md p-4 space-y-3">
          <h2 className="text-sm font-semibold text-neutral-950 dark:text-white flex items-center gap-2">
            <Activity className="h-4 w-4 text-blue-800 dark:text-blue-400" />
            Performance & Export Throughput Benchmarks ({perfResults.length})
          </h2>
          {perfResults.length === 0 ? (
            <div className="py-8 text-center text-xs text-neutral-500 border border-dashed border-neutral-200 dark:border-neutral-800 rounded">
              Benchmarks not run yet. Click &ldquo;Run Load Benchmarks&rdquo;.
            </div>
          ) : (
            <div className="overflow-x-auto max-h-80">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-neutral-200 dark:border-neutral-800 text-left text-neutral-500">
                    <th className="py-2 pr-2 font-medium">Scenario</th>
                    <th className="py-2 px-2 font-medium text-right">Avg / P95</th>
                    <th className="py-2 px-2 font-medium text-right">SLA</th>
                    <th className="py-2 px-2 font-medium text-right">RPS</th>
                    <th className="py-2 pl-2 font-medium text-right">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {perfResults.slice(0, 15).map((p) => (
                    <tr key={p.benchmarkCode}>
                      <td className="py-2 pr-2">
                        <div className="font-medium text-neutral-900 dark:text-neutral-100">{p.scenarioName}</div>
                        <div className="text-[11px] font-mono text-neutral-500">
                          {p.testType} · {p.totalRequests} reqs · {p.memoryRssMb}MB RSS
                        </div>
                      </td>
                      <td className="py-2 px-2 text-right font-mono tabular-nums whitespace-nowrap">
                        {p.avgResponseMs} / {p.p95ResponseMs}ms
                      </td>
                      <td className="py-2 px-2 text-right font-mono tabular-nums whitespace-nowrap">
                        ≤ {p.targetThresholdMs}ms
                      </td>
                      <td className="py-2 px-2 text-right font-mono tabular-nums">{p.throughputRps}</td>
                      <td
                        className={`py-2 pl-2 text-right font-mono font-semibold ${
                          p.passed ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'
                        }`}
                      >
                        {p.passed ? 'PASS' : 'FAIL'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Regression History */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-md p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-neutral-950 dark:text-white">
            Regression Test Runs ({regressionRuns.length})
          </h2>
          {canOperate && (
            <Button variant="secondary" size="sm" onClick={() => setRegModalOpen(true)} icon={<Play className="h-3.5 w-3.5" />}>
              Trigger Full Regression
            </Button>
          )}
        </div>
        {regressionRuns.length === 0 ? (
          <div className="py-6 text-center text-xs text-neutral-500 border border-dashed border-neutral-200 dark:border-neutral-800 rounded">
            No full regression run executed yet. Required prior to release approval.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800 text-left text-neutral-500">
                  <th className="py-2 pr-2 font-medium">Run ID</th>
                  <th className="py-2 px-2 font-medium">Trigger Reason</th>
                  <th className="py-2 px-2 font-medium text-right">Pass / Total</th>
                  <th className="py-2 px-2 font-medium">Status</th>
                  <th className="py-2 pl-2 font-medium text-right">Executed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {regressionRuns.map((r) => (
                  <tr key={r.regressionCode}>
                    <td className="py-2 pr-2 font-mono">{r.regressionCode}</td>
                    <td className="py-2 px-2">{r.triggerReason}</td>
                    <td className="py-2 px-2 text-right font-mono tabular-nums">
                      {r.passedCount}/{r.totalCases}
                    </td>
                    <td
                      className={`py-2 px-2 font-mono font-semibold ${
                        r.status === 'PASSED' ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'
                      }`}
                    >
                      {r.status}
                    </td>
                    <td className="py-2 pl-2 text-right text-neutral-500 tabular-nums">
                      {formatDateTimeIST(r.executedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Bug Modal */}
      <Modal isOpen={bugModalOpen} onClose={() => setBugModalOpen(false)} title="Log New Bug Report">
        <form onSubmit={handleCreateBug} className="space-y-3 text-xs">
          <div>
            <label className="block font-medium mb-1">Title</label>
            <input
              type="text"
              required
              value={bugTitle}
              onChange={(e) => setBugTitle(e.target.value)}
              placeholder="Concise summary of the defect"
              className="w-full h-9 px-2.5 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block font-medium mb-1">Priority</label>
              <select
                value={bugPriority}
                onChange={(e) => setBugPriority(e.target.value as BugPriority)}
                className="w-full h-9 px-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
              >
                <option value="Critical">Critical</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">Category</label>
              <select
                value={bugCategory}
                onChange={(e) => setBugCategory(e.target.value as BugCategory)}
                className="w-full h-9 px-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
              >
                {BUG_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">Assign Dev UID</label>
              <input
                type="text"
                value={bugDeveloper}
                onChange={(e) => setBugDeveloper(e.target.value)}
                className="w-full h-9 px-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 font-mono"
              />
            </div>
          </div>
          <div>
            <label className="block font-medium mb-1">Module Name</label>
            <input
              type="text"
              required
              value={bugModule}
              onChange={(e) => setBugModule(e.target.value)}
              className="w-full h-9 px-2.5 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
            />
          </div>
          <div>
            <label className="block font-medium mb-1">Description</label>
            <textarea
              rows={2}
              required
              value={bugDesc}
              onChange={(e) => setBugDesc(e.target.value)}
              className="w-full p-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
            />
          </div>
          <div>
            <label className="block font-medium mb-1">Reproduction Steps</label>
            <textarea
              rows={2}
              required
              value={bugSteps}
              onChange={(e) => setBugSteps(e.target.value)}
              className="w-full p-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block font-medium mb-1">Expected Result</label>
              <input
                type="text"
                required
                value={bugExpected}
                onChange={(e) => setBugExpected(e.target.value)}
                className="w-full h-9 px-2.5 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Actual Result</label>
              <input
                type="text"
                required
                value={bugActual}
                onChange={(e) => setBugActual(e.target.value)}
                className="w-full h-9 px-2.5 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setBugModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              Create Bug Report
            </Button>
          </div>
        </form>
      </Modal>

      {/* Bug Lifecycle & Retest Modal */}
      <Modal
        isOpen={Boolean(editBug)}
        onClose={() => setEditBug(null)}
        title={`Update Bug — ${editBug?.bugCode || ''}`}
      >
        <form onSubmit={handleUpdateBug} className="space-y-3 text-xs">
          <div className="p-2.5 rounded bg-neutral-50 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200">
            <div className="font-semibold">{editBug?.title}</div>
            <div className="text-[11px] text-neutral-500 mt-0.5">
              Current Status: {editBug?.status} · Priority: {editBug?.priority}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block font-medium mb-1">Workflow Transition</label>
              <select
                value={nextStatus}
                onChange={(e) => {
                  setNextStatus(e.target.value as BugStatus);
                  setRetestMode('NONE');
                }}
                className="w-full h-9 px-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
              >
                {BUG_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">Retest Outcome (Overrides Status)</label>
              <select
                value={retestMode}
                onChange={(e) => setRetestMode(e.target.value as 'NONE' | 'PASSED' | 'FAILED')}
                className="w-full h-9 px-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
              >
                <option value="NONE">Status Update Only</option>
                <option value="PASSED">Retest PASSED → Verified</option>
                <option value="FAILED">Retest FAILED → Reopened</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block font-medium mb-1">Assigned Developer UID</label>
            <input
              type="text"
              value={nextDev}
              onChange={(e) => setNextDev(e.target.value)}
              className="w-full h-9 px-2.5 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 font-mono"
            />
          </div>
          <div>
            <label className="block font-medium mb-1">Resolution / Retest Notes</label>
            <textarea
              rows={2}
              required
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Document fix details or retest evidence..."
              className="w-full p-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setEditBug(null)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              Save Transition
            </Button>
          </div>
        </form>
      </Modal>

      {/* Regression Trigger Modal */}
      <Modal
        isOpen={regModalOpen}
        onClose={() => setRegModalOpen(false)}
        title="Execute Full Regression Suite"
      >
        <form onSubmit={handleRunRegression} className="space-y-3 text-xs">
          <div>
            <label className="block font-medium mb-1">Trigger Reason</label>
            <input
              type="text"
              required
              value={regReason}
              onChange={(e) => setRegReason(e.target.value)}
              className="w-full h-9 px-2.5 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
            />
          </div>
          <p className="text-neutral-500">
            Executes all automated Unit, Integration, System, Security, Financial, and Backup DR tests inside the isolated {envKey} sandbox.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setRegModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={busyAction}>
              {busyAction ? 'Running...' : 'Start Regression'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
