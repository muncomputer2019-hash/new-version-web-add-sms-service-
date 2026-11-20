import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  DatabaseBackup,
  Play,
  RefreshCw,
  Rocket,
  Scale,
  UserCheck,
} from 'lucide-react';
import { UserProfile } from '../../modules/types';
import {
  phase09Api,
  QaBackupDrillRecord,
  QaEnvironmentKey,
  QaFinancialReconciliationRecord,
  QaReleaseReadinessSummary,
  QaUatSessionRecord,
} from '../../services/phase09Api';
import { Button } from '../../components/Button';
import { formatDateTimeIST, formatINR } from '../../services/formatters';

interface ReleaseUatPageProps {
  currentUser: UserProfile;
  onShowToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}

export const ReleaseUatPage: React.FC<ReleaseUatPageProps> = ({
  currentUser,
  onShowToast,
}) => {
  const [reconciliations, setReconciliations] = useState<QaFinancialReconciliationRecord[]>([]);
  const [drills, setDrills] = useState<QaBackupDrillRecord[]>([]);
  const [uatSessions, setUatSessions] = useState<QaUatSessionRecord[]>([]);
  const [readiness, setReadiness] = useState<QaReleaseReadinessSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [envKey] = useState<QaEnvironmentKey>('TESTING');
  const [drillScope, setDrillScope] = useState<QaBackupDrillRecord['drillScope']>('FULL');
  const [scheduleTested, setScheduleTested] = useState<QaBackupDrillRecord['scheduleTested']>('DAILY');

  // UAT form
  const [uatRole, setUatRole] = useState<'ADMIN' | 'MANAGER' | 'STAFF'>(
    currentUser.role === 'STAFF' ? 'STAFF' : currentUser.role === 'MANAGER' ? 'MANAGER' : 'ADMIN'
  );
  const [uatWorkflow, setUatWorkflow] = useState('Customer Onboarding, Application Payment, Receipt Print & Closing');
  const [uatCasesCount, setUatCasesCount] = useState(12);
  const [uatFeedback, setUatFeedback] = useState('Workflow validated cleanly across screens and INR calculations.');

  // Admin Release Form
  const [releaseVersion, setReleaseVersion] = useState('v1.9.0-RC1');
  const [releaseNotes, setReleaseNotes] = useState(
    'All Phases 01–09 QA gates, Financial Reconciliation, Backup DR Drills & Multi-Role UAT verified.'
  );
  const [markReleased, setMarkReleased] = useState(true);

  const canOperate = currentUser.role === 'ADMIN' || currentUser.role === 'MANAGER';
  const isAdmin = currentUser.role === 'ADMIN';

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [finRes, bkpRes, uatRes, relRes] = await Promise.all([
        phase09Api.getFinancialReconciliations(),
        phase09Api.getBackupDrills(),
        phase09Api.getUatSessions(),
        phase09Api.getReleaseReadiness(),
      ]);
      setReconciliations(finRes.data);
      setDrills(bkpRes.data);
      setUatSessions(uatRes.data);
      setReadiness(relRes.data);
    } catch (err) {
      onShowToast('error', 'Failed to load Release & UAT workbench', err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [onShowToast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleRunFinRec = async () => {
    if (!canOperate) return;
    setBusy(true);
    try {
      const res = await phase09Api.runFinancialReconciliation(envKey);
      onShowToast(
        res.data.status === 'RECONCILED' ? 'success' : 'error',
        `Financial Reconciliation: ${res.data.status}`,
        `Mismatches: ${res.data.mismatchCount}`
      );
      await loadAll();
    } catch (err) {
      onShowToast('error', 'Financial check failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const handleRunBackupDrill = async () => {
    if (!canOperate) return;
    setBusy(true);
    try {
      const res = await phase09Api.runBackupDrill({
        envKey,
        drillScope,
        scheduleTested,
      });
      onShowToast(
        res.data.status === 'PASSED' ? 'success' : 'error',
        `Isolated Backup Drill: ${res.data.status}`,
        `${res.data.drillScope} verified in ${res.data.recoveryTimeMs}ms (RPO loss: ${res.data.recoveryPointLoss})`
      );
      await loadAll();
    } catch (err) {
      onShowToast('error', 'Backup drill blocked', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const handleSubmitUat = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await phase09Api.submitUatSession({
        testerRole: uatRole,
        workflowName: uatWorkflow,
        casesVerified: uatCasesCount,
        feedback: uatFeedback,
        acceptanceStatus: isAdmin ? 'ACCEPTED' : 'PENDING',
      });
      onShowToast('success', `UAT Session ${res.data.uatCode} Recorded`, `Role: ${res.data.testerRole} · ${res.data.acceptanceStatus}`);
      await loadAll();
    } catch (err) {
      onShowToast('error', 'UAT submission failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const handleReviewUat = async (uatCode: string, acceptanceStatus: 'ACCEPTED' | 'CHANGES_REQUESTED') => {
    if (!isAdmin) return;
    try {
      await phase09Api.reviewUatSession(uatCode, { acceptanceStatus });
      onShowToast('success', `${uatCode} ${acceptanceStatus}`, 'Updated release UAT gate.');
      await loadAll();
    } catch (err) {
      onShowToast('error', 'UAT review failed', err instanceof Error ? err.message : undefined);
    }
  };

  const handleApproveRelease = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    setBusy(true);
    try {
      const res = await phase09Api.approveRelease({
        releaseVersion,
        releaseNotes,
        markReleased,
      });
      onShowToast('success', `Release ${res.data.releaseStatus}`, `Signed off by ${currentUser.userId}`);
      await loadAll();
    } catch (err) {
      onShowToast('error', 'Release Approval Blocked', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const latestFin = reconciliations[0];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-neutral-200 dark:border-neutral-800 pb-4">
        <div>
          <h1 className="text-xl font-semibold text-neutral-950 dark:text-white tracking-tight">
            Financial Reconciliation, Backup DR Drills, Multi-Role UAT & Release Gate
          </h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Final release verification controls: double-entry TB/BS validation, isolated AES-256-GCM restore drills, Admin/Manager/Staff UAT & Admin Sign-Off.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={loadAll} icon={<RefreshCw className="h-3.5 w-3.5" />}>
          Refresh Status
        </Button>
      </div>

      {/* Financial Reconciliation & Backup DR Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Financial Reconciliation */}
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-md p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-950 dark:text-white flex items-center gap-2">
              <Scale className="h-4 w-4 text-blue-800 dark:text-blue-400" />
              Accounting Reconciliation Drill
            </h2>
            {canOperate && (
              <Button variant="secondary" size="sm" disabled={busy} onClick={handleRunFinRec} icon={<Play className="h-3.5 w-3.5" />}>
                Run Reconciliation
              </Button>
            )}
          </div>

          {!latestFin ? (
            <div className="py-8 text-center text-xs text-neutral-500 border border-dashed border-neutral-200 dark:border-neutral-800 rounded">
              Financial reconciliation check has not been executed yet.
            </div>
          ) : (
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 p-2.5 rounded bg-neutral-50 dark:bg-neutral-800/60">
                <div>
                  <span className="text-neutral-500">Status:</span>{' '}
                  <span
                    className={`font-mono font-semibold ${
                      latestFin.status === 'RECONCILED' ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'
                    }`}
                  >
                    {latestFin.status}
                  </span>
                </div>
                <div>
                  <span className="text-neutral-500">TB Debit / Credit:</span>{' '}
                  <span className="font-mono tabular-nums">{formatINR(latestFin.trialBalanceDebit)}</span>
                </div>
                <div>
                  <span className="text-neutral-500">Balance Sheet Diff:</span>{' '}
                  <span className="font-mono tabular-nums">{formatINR(latestFin.balanceSheetDiff)}</span>
                </div>
                <div>
                  <span className="text-neutral-500">Outstanding Dues:</span>{' '}
                  <span className="font-mono tabular-nums">{formatINR(latestFin.outstandingDuesTotal)}</span>
                </div>
              </div>

              <div className="space-y-1.5">
                {latestFin.checks.map((chk) => (
                  <div
                    key={chk.checkName}
                    className="flex items-center justify-between py-1.5 border-b border-neutral-100 dark:border-neutral-800 last:border-0"
                  >
                    <div>
                      <div className="font-medium text-neutral-800 dark:text-neutral-200">{chk.checkName}</div>
                      <div className="text-[11px] text-neutral-500">
                        Expected: {chk.expected} · Actual: {chk.actual}
                      </div>
                    </div>
                    <span className={`font-mono font-semibold ${chk.passed ? 'text-emerald-700' : 'text-red-700'}`}>
                      {chk.passed ? 'PASS' : 'FAIL'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Isolated Backup & Restore Drill */}
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-md p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-neutral-950 dark:text-white flex items-center gap-2">
              <DatabaseBackup className="h-4 w-4 text-blue-800 dark:text-blue-400" />
              Isolated Backup & Full Restore Drills
            </h2>
            {canOperate && (
              <div className="flex items-center gap-1.5">
                <select
                  value={drillScope}
                  onChange={(e) => setDrillScope(e.target.value as QaBackupDrillRecord['drillScope'])}
                  className="h-8 px-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
                >
                  <option value="FULL">FULL</option>
                  <option value="CUSTOMERS">CUSTOMERS</option>
                  <option value="FINANCE">FINANCE</option>
                  <option value="CONFIGURATION">CONFIG</option>
                  <option value="DOCUMENTS">DOCUMENTS</option>
                  <option value="REPORT_ARCHIVES">REPORTS</option>
                </select>
                <select
                  value={scheduleTested}
                  onChange={(e) => setScheduleTested(e.target.value as QaBackupDrillRecord['scheduleTested'])}
                  className="h-8 px-2 text-xs rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
                >
                  <option value="DAILY">DAILY</option>
                  <option value="WEEKLY">WEEKLY</option>
                  <option value="MONTHLY">MONTHLY</option>
                  <option value="FINANCIAL_YEAR">FY</option>
                </select>
                <Button variant="secondary" size="sm" disabled={busy} onClick={handleRunBackupDrill}>
                  Run Drill
                </Button>
              </div>
            )}
          </div>

          {drills.length === 0 ? (
            <div className="py-8 text-center text-xs text-neutral-500 border border-dashed border-neutral-200 dark:border-neutral-800 rounded">
              No isolated backup/restore drills executed yet.
            </div>
          ) : (
            <div className="overflow-x-auto max-h-64">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-neutral-200 dark:border-neutral-800 text-left text-neutral-500">
                    <th className="py-2 pr-2 font-medium">Drill / Scope</th>
                    <th className="py-2 px-2 font-medium">AES / HMAC / KeyRot / NoDup</th>
                    <th className="py-2 px-2 font-medium text-right">RTO</th>
                    <th className="py-2 pl-2 font-medium text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {drills.map((d) => (
                    <tr key={d.drillCode}>
                      <td className="py-2 pr-2">
                        <div className="font-mono">{d.drillCode}</div>
                        <div className="text-[11px] text-neutral-500">
                          {d.drillScope} ({d.scheduleTested})
                        </div>
                      </td>
                      <td className="py-2 px-2 font-mono text-[11px]">
                        {[
                          d.encryptionVerified ? 'AES' : 'NO-AES',
                          d.hmacVerified ? 'HMAC' : 'NO-HMAC',
                          d.keyRotationVerified ? 'KEY-ROT' : 'NO-KEY',
                          d.duplicatePreventionVerified ? '0-DUP' : 'DUP-ERR',
                        ].join(' · ')}
                      </td>
                      <td className="py-2 px-2 text-right font-mono tabular-nums">{d.recoveryTimeMs}ms</td>
                      <td
                        className={`py-2 pl-2 text-right font-mono font-semibold ${
                          d.status === 'PASSED' ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {d.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Multi-Role UAT Workbench */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-md p-4">
          <h2 className="text-sm font-semibold text-neutral-950 dark:text-white flex items-center gap-2 mb-3">
            <UserCheck className="h-4 w-4 text-blue-800 dark:text-blue-400" />
            Submit Role UAT Sign-Off
          </h2>
          <form onSubmit={handleSubmitUat} className="space-y-3 text-xs">
            <div>
              <label className="block font-medium mb-1">UAT Role</label>
              <select
                value={uatRole}
                disabled={!isAdmin}
                onChange={(e) => setUatRole(e.target.value as 'ADMIN' | 'MANAGER' | 'STAFF')}
                className="w-full h-9 px-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 disabled:opacity-60"
              >
                <option value="ADMIN">ADMIN</option>
                <option value="MANAGER">MANAGER</option>
                <option value="STAFF">STAFF</option>
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">Workflow Tested</label>
              <input
                type="text"
                required
                value={uatWorkflow}
                onChange={(e) => setUatWorkflow(e.target.value)}
                className="w-full h-9 px-2.5 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Cases Verified</label>
              <input
                type="number"
                min={1}
                value={uatCasesCount}
                onChange={(e) => setUatCasesCount(Number(e.target.value) || 1)}
                className="w-full h-9 px-2.5 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 font-mono"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Feedback / Sign-off Notes</label>
              <textarea
                rows={2}
                required
                value={uatFeedback}
                onChange={(e) => setUatFeedback(e.target.value)}
                className="w-full p-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
              />
            </div>
            <Button variant="primary" size="sm" type="submit" disabled={busy}>
              Submit {uatRole} UAT
            </Button>
          </form>
        </div>

        <div className="lg:col-span-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-md p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-950 dark:text-white">
              Multi-Role UAT Sessions ({uatSessions.length})
            </h2>
            <span className="text-[11px] text-neutral-500">Requires Admin + Manager + Staff acceptance</span>
          </div>
          {uatSessions.length === 0 ? (
            <div className="py-8 text-center text-xs text-neutral-500 border border-dashed border-neutral-200 dark:border-neutral-800 rounded">
              No UAT sessions recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-neutral-200 dark:border-neutral-800 text-left text-neutral-500">
                    <th className="py-2 pr-2 font-medium">UAT ID / Role</th>
                    <th className="py-2 px-2 font-medium">Workflow</th>
                    <th className="py-2 px-2 font-medium">Status</th>
                    <th className="py-2 px-2 font-medium">Submitted</th>
                    <th className="py-2 pl-2 font-medium text-right">Admin Review</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {uatSessions.map((u) => (
                    <tr key={u.uatCode}>
                      <td className="py-2 pr-2">
                        <div className="font-mono">{u.uatCode}</div>
                        <div className="text-[11px] font-semibold text-neutral-600 dark:text-neutral-400">
                          {u.testerRole} ({u.testerUserId})
                        </div>
                      </td>
                      <td className="py-2 px-2 max-w-xs">
                        <div className="font-medium">{u.workflowName}</div>
                        <div className="text-[11px] text-neutral-500 truncate">{u.feedback}</div>
                      </td>
                      <td
                        className={`py-2 px-2 font-mono font-semibold ${
                          u.acceptanceStatus === 'ACCEPTED'
                            ? 'text-emerald-700'
                            : u.acceptanceStatus === 'CHANGES_REQUESTED'
                              ? 'text-red-700'
                              : 'text-amber-700'
                        }`}
                      >
                        {u.acceptanceStatus}
                      </td>
                      <td className="py-2 px-2 text-neutral-500 tabular-nums whitespace-nowrap">
                        {formatDateTimeIST(u.createdAt)}
                      </td>
                      <td className="py-2 pl-2 text-right whitespace-nowrap space-x-1">
                        {isAdmin && u.acceptanceStatus !== 'ACCEPTED' && (
                          <Button variant="secondary" size="sm" onClick={() => handleReviewUat(u.uatCode, 'ACCEPTED')}>
                            Accept
                          </Button>
                        )}
                        {isAdmin && u.acceptanceStatus !== 'CHANGES_REQUESTED' && (
                          <Button variant="ghost" size="sm" onClick={() => handleReviewUat(u.uatCode, 'CHANGES_REQUESTED')}>
                            Reject
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Admin Final Release Approval Gate */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-md p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-neutral-950 dark:text-white flex items-center gap-2">
            <Rocket className="h-4 w-4 text-blue-800 dark:text-blue-400" />
            Admin Final Production Release Gate
          </h2>
          {readiness && (
            <span className="font-mono text-xs font-semibold text-neutral-900 dark:text-white">
              Status: {readiness.releaseStatus}
            </span>
          )}
        </div>

        {loading && !readiness ? (
          <div className="text-xs text-neutral-500">Checking release blockers...</div>
        ) : readiness ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
            <div className="space-y-2">
              <div className="font-semibold text-neutral-800 dark:text-neutral-200">
                Blocking Conditions ({readiness.blockers.length})
              </div>
              {readiness.blockers.length === 0 ? (
                <div className="p-3 rounded border border-emerald-200 dark:border-emerald-900 bg-emerald-50/40 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>Zero release blockers remain. Eligible for Admin Final Release Sign-Off.</span>
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {readiness.blockers.map((blk) => (
                    <li
                      key={blk}
                      className="p-2.5 rounded border border-red-200 dark:border-red-900/60 bg-red-50/40 dark:bg-red-950/20 text-red-800 dark:text-red-300 flex items-start gap-2"
                    >
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <span>{blk}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <form onSubmit={handleApproveRelease} className="space-y-3 border border-neutral-200 dark:border-neutral-800 rounded p-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium mb-1">Release Version</label>
                  <input
                    type="text"
                    required
                    value={releaseVersion}
                    onChange={(e) => setReleaseVersion(e.target.value)}
                    className="w-full h-9 px-2.5 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950 font-mono"
                  />
                </div>
                <div className="flex items-end pb-1.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={markReleased}
                      onChange={(e) => setMarkReleased(e.target.checked)}
                    />
                    <span>Promote directly to RELEASED</span>
                  </label>
                </div>
              </div>
              <div>
                <label className="block font-medium mb-1">Admin Release Sign-Off Notes</label>
                <textarea
                  rows={2}
                  required
                  value={releaseNotes}
                  onChange={(e) => setReleaseNotes(e.target.value)}
                  className="w-full p-2 rounded border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-950"
                />
              </div>
              <Button
                variant="primary"
                type="submit"
                disabled={!isAdmin || !readiness.canApprove || busy}
              >
                {!isAdmin
                  ? 'Admin Approval Required'
                  : !readiness.canApprove
                    ? 'Blocked — Resolve Gates First'
                    : 'Sign Off Final Production Release'}
              </Button>
            </form>
          </div>
        ) : null}
      </div>
    </div>
  );
};
