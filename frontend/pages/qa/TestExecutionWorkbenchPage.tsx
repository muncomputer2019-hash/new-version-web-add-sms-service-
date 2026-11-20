import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckSquare,
  Globe,
  Layers,
  Lock,
  Play,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { UserProfile } from '../../modules/types';
import {
  phase09Api,
  QaBrowserCompatibilityRecord,
  QaEnvironmentConfig,
  QaEnvironmentKey,
  QaPriority,
  QaTestCaseDef,
  QaTestResultRecord,
  QaTestSuiteDef,
} from '../../services/phase09Api';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { formatDateTimeIST } from '../../services/formatters';

interface TestExecutionWorkbenchPageProps {
  currentUser: UserProfile;
  onShowToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}

const STATUS_TEXT: Record<string, string> = {
  PASSED: 'text-emerald-700 dark:text-emerald-400 font-semibold',
  FAILED: 'text-red-700 dark:text-red-400 font-semibold',
  BLOCKED: 'text-amber-700 dark:text-amber-400 font-semibold',
  PENDING: 'text-neutral-500 dark:text-neutral-400',
};

export const TestExecutionWorkbenchPage: React.FC<TestExecutionWorkbenchPageProps> = ({
  currentUser,
  onShowToast,
}) => {
  const [environments, setEnvironments] = useState<QaEnvironmentConfig[]>([]);
  const [suites, setSuites] = useState<QaTestSuiteDef[]>([]);
  const [cases, setCases] = useState<QaTestCaseDef[]>([]);
  const [results, setResults] = useState<QaTestResultRecord[]>([]);
  const [compatMatrix, setCompatMatrix] = useState<QaBrowserCompatibilityRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const [envKey, setEnvKey] = useState<QaEnvironmentKey>('TESTING');
  const [suiteFilter, setSuiteFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [executing, setExecuting] = useState(false);

  // New custom test case modal
  const [createOpen, setCreateOpen] = useState(false);
  const [newSuite, setNewSuite] = useState('SUITE-SYS');
  const [newModule, setNewModule] = useState('Applications & Services');
  const [newPhase, setNewPhase] = useState('Phase 09');
  const [newPriority, setNewPriority] = useState<QaPriority>('HIGH');
  const [newTitle, setNewTitle] = useState('');
  const [newSteps, setNewSteps] = useState('1. Open workflow\n2. Submit valid input\n3. Verify database persistence');
  const [newExpected, setNewExpected] = useState('');

  // Manual verification modal
  const [manualTarget, setManualTarget] = useState<QaTestCaseDef | null>(null);
  const [manualStatus, setManualStatus] = useState<'PASSED' | 'FAILED' | 'BLOCKED'>('PASSED');
  const [manualNotes, setManualNotes] = useState('');

  const canOperate = currentUser.role === 'ADMIN' || currentUser.role === 'MANAGER';

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [envRes, suiteRes, caseRes, execRes, compatRes] = await Promise.all([
        phase09Api.getEnvironments(),
        phase09Api.getSuites(),
        phase09Api.getTestCases({
          suiteCode: suiteFilter,
          status: statusFilter,
          search: search || undefined,
        }),
        phase09Api.getExecutions(),
        phase09Api.getBrowserMatrix(),
      ]);
      setEnvironments(envRes.data);
      setSuites(suiteRes.data);
      setCases(caseRes.data);
      setResults(execRes.data.results);
      setCompatMatrix(compatRes.data);
    } catch (err) {
      onShowToast('error', 'Failed to load Workbench', err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [onShowToast, search, statusFilter, suiteFilter]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleRunSuite = async (targetSuite: string) => {
    if (!canOperate) return;
    setExecuting(true);
    try {
      const res = await phase09Api.executeSuite({
        envKey,
        suiteCode: targetSuite,
        triggerSource: 'MANUAL_UI',
      });
      onShowToast(
        res.data.batch.failedCount === 0 ? 'success' : 'error',
        `Suite ${targetSuite} executed on ${envKey}`,
        `${res.data.batch.passedCount} Passed, ${res.data.batch.failedCount} Failed, ${res.data.batch.blockedCount} Blocked`
      );
      await loadAll();
    } catch (err) {
      onShowToast('error', 'Execution Blocked', err instanceof Error ? err.message : undefined);
    } finally {
      setExecuting(false);
    }
  };

  const handleRunSingleCase = async (caseCode: string) => {
    if (!canOperate) return;
    setExecuting(true);
    try {
      const res = await phase09Api.executeSuite({
        envKey,
        caseCodes: [caseCode],
        triggerSource: 'MANUAL_UI',
      });
      const r = res.data.results[0];
      onShowToast(
        r?.status === 'PASSED' ? 'success' : 'info',
        `${caseCode}: ${r?.status || 'DONE'}`,
        r?.actualResult
      );
      await loadAll();
    } catch (err) {
      onShowToast('error', 'Case Execution Failed', err instanceof Error ? err.message : undefined);
    } finally {
      setExecuting(false);
    }
  };

  const handleCreateCustomCase = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await phase09Api.createTestCase({
        suiteCode: newSuite,
        moduleName: newModule,
        targetPhase: newPhase,
        testType: 'SYSTEM',
        polarity: 'POSITIVE',
        priority: newPriority,
        title: newTitle,
        preconditions: 'Logged in to isolated QA sandbox',
        steps: newSteps.split('\n').map((s) => s.trim()).filter(Boolean),
        expectedResult: newExpected,
      });
      onShowToast('success', 'Custom Test Case Registered', 'Status initialized as PENDING.');
      setCreateOpen(false);
      setNewTitle('');
      setNewExpected('');
      await loadAll();
    } catch (err) {
      onShowToast('error', 'Creation failed', err instanceof Error ? err.message : undefined);
    }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTarget) return;
    try {
      await phase09Api.recordManualCaseResult(manualTarget.caseCode, {
        status: manualStatus,
        actualResult: manualNotes,
        envKey,
      });
      onShowToast('success', `${manualTarget.caseCode} Signed Off`, `Recorded as ${manualStatus}.`);
      setManualTarget(null);
      setManualNotes('');
      await loadAll();
    } catch (err) {
      onShowToast('error', 'Manual recording failed', err instanceof Error ? err.message : undefined);
    }
  };

  const handleCompatUpdate = async (
    row: QaBrowserCompatibilityRecord,
    nextStatus: 'PASSED' | 'FAILED'
  ) => {
    try {
      await phase09Api.updateBrowserMatrix(row.matrixCode, {
        status: nextStatus,
        bengaliFontsOk: nextStatus === 'PASSED',
        pdfPrintOk: nextStatus === 'PASSED',
        responsiveOk: nextStatus === 'PASSED',
        verificationMode: 'MANUAL_QA_CHECK',
        notes:
          nextStatus === 'PASSED'
            ? `Verified by ${currentUser.userId} on ${row.browserName} (${row.viewport})`
            : `Issue flagged on ${row.browserName} (${row.viewport})`,
      });
      onShowToast('success', `${row.matrixCode} Updated`, `Marked ${nextStatus}`);
      await loadAll();
    } catch (err) {
      onShowToast('error', 'Update failed', err instanceof Error ? err.message : undefined);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-neutral-200 dark:border-neutral-800 pb-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-950 dark:text-white tracking-tight">
            Test Execution Workbench & Compatibility Matrix
          </h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Isolated environment controls, automated Unit/Integration/System runners, custom test registration & cross-browser QA matrix.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={envKey}
            onChange={(e) => setEnvKey(e.target.value as QaEnvironmentKey)}
            className="h-9 px-2.5 text-xs rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100"
          >
            {environments.map((env) => (
              <option key={env.envKey} value={env.envKey}>
                {env.envKey} {!env.allowAutomatedTests ? '(LOCKED)' : ''}
              </option>
            ))}
          </select>
          {canOperate && (
            <>
              <Button variant="secondary" size="sm" onClick={() => setCreateOpen(true)} icon={<Plus className="h-3.5 w-3.5" />}>
                Add Custom Case
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={executing}
                onClick={() => handleRunSuite(suiteFilter)}
                icon={<Play className="h-3.5 w-3.5" />}
              >
                {executing ? 'Executing...' : `Run ${suiteFilter === 'ALL' ? 'All Suites' : suiteFilter}`}
              </Button>
            </>
          )}
          <Button variant="ghost" size="sm" onClick={loadAll} icon={<RefreshCw className="h-3.5 w-3.5" />}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Isolated Environments Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {environments.map((env) => (
          <div
            key={env.envKey}
            className={`p-3 rounded-md border text-xs ${
              env.envKey === envKey
                ? 'border-blue-800 bg-blue-50/40 dark:bg-blue-950/20'
                : 'border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900'
            }`}
          >
            <div className="flex items-center justify-between font-semibold text-neutral-900 dark:text-white">
              <span className="flex items-center gap-1.5">
                {!env.allowAutomatedTests && <Lock className="h-3.5 w-3.5 text-red-600" />}
                {env.envKey}
              </span>
              <span className="font-mono text-[11px] text-emerald-700 dark:text-emerald-400">
                {env.healthStatus}
              </span>
            </div>
            <div className="text-[11px] text-neutral-500 mt-1 truncate">{env.displayName}</div>
            <div className="text-[11px] font-mono text-neutral-500 mt-1">
              Auto: {env.allowAutomatedTests ? 'YES' : 'NO'} · Destructive: {env.allowDestructiveDrills ? 'YES' : 'NO'}
            </div>
          </div>
        ))}
      </div>

      {/* Test Case Register */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-md p-4 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-950 dark:text-white">
            <Layers className="h-4 w-4 text-blue-800 dark:text-blue-400" />
            <span>Test Case Register ({cases.length})</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search case code, module, title..."
              className="h-8 px-2.5 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 w-56"
            />
            <select
              value={suiteFilter}
              onChange={(e) => setSuiteFilter(e.target.value)}
              className="h-8 px-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100"
            >
              <option value="ALL">All Suites</option>
              {suites.map((s) => (
                <option key={s.suiteCode} value={s.suiteCode}>
                  {s.suiteCode} ({s.testType})
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-8 px-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100"
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING">PENDING</option>
              <option value="PASSED">PASSED</option>
              <option value="FAILED">FAILED</option>
              <option value="BLOCKED">BLOCKED</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-800 text-left text-neutral-500">
                <th className="py-2 pr-3 font-medium">Case ID</th>
                <th className="py-2 px-2 font-medium">Module</th>
                <th className="py-2 px-2 font-medium">Type / Priority</th>
                <th className="py-2 px-2 font-medium">Test Objective</th>
                <th className="py-2 px-2 font-medium">Status</th>
                <th className="py-2 pl-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {loading && cases.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-neutral-500">
                    Loading registered test cases...
                  </td>
                </tr>
              ) : (
                cases.map((tc) => (
                  <tr key={tc.caseCode} className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40">
                    <td className="py-2.5 pr-3 font-mono text-neutral-900 dark:text-neutral-100 whitespace-nowrap">
                      {tc.caseCode}
                    </td>
                    <td className="py-2.5 px-2 text-neutral-700 dark:text-neutral-300 whitespace-nowrap">
                      <div>{tc.moduleName}</div>
                      <div className="text-[10px] text-neutral-500">{tc.targetPhase}</div>
                    </td>
                    <td className="py-2.5 px-2 font-mono text-[11px] text-neutral-600 dark:text-neutral-400 whitespace-nowrap">
                      {tc.testType} · {tc.priority}
                    </td>
                    <td className="py-2.5 px-2 text-neutral-800 dark:text-neutral-200 max-w-md">
                      <div className="font-medium">{tc.title}</div>
                      <div className="text-[11px] text-neutral-500 truncate">{tc.expectedResult}</div>
                    </td>
                    <td className={`py-2.5 px-2 font-mono whitespace-nowrap ${STATUS_TEXT[tc.lastStatus] || ''}`}>
                      {tc.lastStatus}
                    </td>
                    <td className="py-2.5 pl-2 text-right whitespace-nowrap space-x-1.5">
                      {canOperate && tc.isAutomated && (
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={executing}
                          onClick={() => handleRunSingleCase(tc.caseCode)}
                        >
                          Run
                        </Button>
                      )}
                      {canOperate && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setManualTarget(tc);
                            setManualStatus('PASSED');
                            setManualNotes('');
                          }}
                          icon={<CheckSquare className="h-3 w-3" />}
                        >
                          Sign Off
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Browser & Device Compatibility Matrix */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-md p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-950 dark:text-white">
            <Globe className="h-4 w-4 text-blue-800 dark:text-blue-400" />
            <span>Cross-Browser & Multi-Device Compatibility Matrix</span>
          </div>
          <span className="text-[11px] text-neutral-500">
            Remains PENDING until explicitly verified by QA tester (never pre-faked)
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-800 text-left text-neutral-500">
                <th className="py-2 pr-2 font-medium">Matrix ID</th>
                <th className="py-2 px-2 font-medium">OS / Device</th>
                <th className="py-2 px-2 font-medium">Browser</th>
                <th className="py-2 px-2 font-medium">Viewport</th>
                <th className="py-2 px-2 font-medium">Status</th>
                <th className="py-2 px-2 font-medium">Notes</th>
                <th className="py-2 pl-2 font-medium text-right">QA Sign-Off</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {compatMatrix.map((m) => (
                <tr key={m.matrixCode}>
                  <td className="py-2 pr-2 font-mono">{m.matrixCode}</td>
                  <td className="py-2 px-2">
                    {m.osPlatform} · {m.deviceType}
                  </td>
                  <td className="py-2 px-2">{m.browserName}</td>
                  <td className="py-2 px-2 font-mono">{m.viewport}</td>
                  <td className={`py-2 px-2 font-mono ${STATUS_TEXT[m.status] || ''}`}>{m.status}</td>
                  <td className="py-2 px-2 text-neutral-600 dark:text-neutral-400 max-w-xs truncate">
                    {m.notes}
                  </td>
                  <td className="py-2 pl-2 text-right whitespace-nowrap space-x-1.5">
                    <Button variant="secondary" size="sm" onClick={() => handleCompatUpdate(m, 'PASSED')}>
                      Mark Pass
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleCompatUpdate(m, 'FAILED')}>
                      Flag Fail
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Latest Execution Evidence Log */}
      {results.length > 0 && (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-md p-4 space-y-3">
          <h2 className="text-sm font-semibold text-neutral-950 dark:text-white">
            Latest Test Execution Evidence ({results.length})
          </h2>
          <div className="overflow-x-auto max-h-80">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800 text-left text-neutral-500">
                  <th className="py-2 pr-2 font-medium">Result ID</th>
                  <th className="py-2 px-2 font-medium">Case</th>
                  <th className="py-2 px-2 font-medium">Status</th>
                  <th className="py-2 px-2 font-medium text-right">Time</th>
                  <th className="py-2 px-2 font-medium">Actual Observed Result</th>
                  <th className="py-2 pl-2 font-medium text-right">Executed At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {results.slice(0, 30).map((r) => (
                  <tr key={r.resultCode}>
                    <td className="py-2 pr-2 font-mono whitespace-nowrap">{r.resultCode}</td>
                    <td className="py-2 px-2 font-mono whitespace-nowrap">{r.caseCode}</td>
                    <td className={`py-2 px-2 font-mono whitespace-nowrap ${STATUS_TEXT[r.status] || ''}`}>
                      {r.status}
                    </td>
                    <td className="py-2 px-2 font-mono text-right whitespace-nowrap">{r.durationMs}ms</td>
                    <td className="py-2 px-2 text-neutral-700 dark:text-neutral-300">{r.actualResult}</td>
                    <td className="py-2 pl-2 text-right text-neutral-500 whitespace-nowrap tabular-nums">
                      {formatDateTimeIST(r.executedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Custom Test Case Modal */}
      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Register Custom Test Case">
        <form onSubmit={handleCreateCustomCase} className="space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium mb-1">Suite</label>
              <select
                value={newSuite}
                onChange={(e) => setNewSuite(e.target.value)}
                className="w-full h-9 px-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
              >
                {suites.map((s) => (
                  <option key={s.suiteCode} value={s.suiteCode}>
                    {s.suiteCode}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">Priority</label>
              <select
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value as QaPriority)}
                className="w-full h-9 px-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
              >
                <option value="CRITICAL">CRITICAL</option>
                <option value="HIGH">HIGH</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="LOW">LOW</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium mb-1">Module Name</label>
              <input
                type="text"
                required
                value={newModule}
                onChange={(e) => setNewModule(e.target.value)}
                className="w-full h-9 px-2.5 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Target Phase</label>
              <input
                type="text"
                required
                value={newPhase}
                onChange={(e) => setNewPhase(e.target.value)}
                className="w-full h-9 px-2.5 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
              />
            </div>
          </div>
          <div>
            <label className="block font-medium mb-1">Test Objective / Title</label>
            <input
              type="text"
              required
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. Verify Bengali receipt print preview alignment"
              className="w-full h-9 px-2.5 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
            />
          </div>
          <div>
            <label className="block font-medium mb-1">Execution Steps (one per line)</label>
            <textarea
              rows={3}
              value={newSteps}
              onChange={(e) => setNewSteps(e.target.value)}
              className="w-full p-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
            />
          </div>
          <div>
            <label className="block font-medium mb-1">Expected Result</label>
            <input
              type="text"
              required
              value={newExpected}
              onChange={(e) => setNewExpected(e.target.value)}
              placeholder="e.g. PDF renders cleanly with company header and INR amount"
              className="w-full h-9 px-2.5 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              Register Case (Pending)
            </Button>
          </div>
        </form>
      </Modal>

      {/* Manual Verification Sign-Off Modal */}
      <Modal
        isOpen={Boolean(manualTarget)}
        onClose={() => setManualTarget(null)}
        title={`Manual QA Outcome — ${manualTarget?.caseCode || ''}`}
      >
        <form onSubmit={handleManualSubmit} className="space-y-3 text-xs">
          <div className="p-2.5 rounded bg-neutral-50 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300">
            {manualTarget?.title}
          </div>
          <div>
            <label className="block font-medium mb-1">Outcome Status</label>
            <select
              value={manualStatus}
              onChange={(e) => setManualStatus(e.target.value as 'PASSED' | 'FAILED' | 'BLOCKED')}
              className="w-full h-9 px-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
            >
              <option value="PASSED">PASSED</option>
              <option value="FAILED">FAILED</option>
              <option value="BLOCKED">BLOCKED</option>
            </select>
          </div>
          <div>
            <label className="block font-medium mb-1">Observed Evidence / Notes</label>
            <textarea
              rows={3}
              required
              value={manualNotes}
              onChange={(e) => setManualNotes(e.target.value)}
              placeholder="Document exact observed behavior during manual execution..."
              className="w-full p-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setManualTarget(null)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              Record Outcome
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
