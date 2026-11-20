import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Cloud,
  Database,
  Download,
  HardDrive,
  KeyRound,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { UserProfile } from '../../modules/types';
import {
  BackupScheduleItem,
  BackupStorageLocationItem,
  EncryptionKeyItem,
  phase08Api,
  Phase08BackupItem,
  RestoreHistoryItem,
  RestorePreviewItem,
} from '../../services/phase08Api';
import { Button } from '../../components/Button';
import { StatusText } from '../../components/StatusText';
import { Modal } from '../../components/Modal';
import { exportBackupBundleJson } from '../../services/clientExportService';

interface BackupRecoveryPageProps {
  currentUser: UserProfile;
  onShowToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}

export const BackupRecoveryPage: React.FC<BackupRecoveryPageProps> = ({
  currentUser,
  onShowToast,
}) => {
  const [schedules, setSchedules] = useState<BackupScheduleItem[]>([]);
  const [storages, setStorages] = useState<BackupStorageLocationItem[]>([]);
  const [backups, setBackups] = useState<Phase08BackupItem[]>([]);
  const [keys, setKeys] = useState<EncryptionKeyItem[]>([]);
  const [restoreHistory, setRestoreHistory] = useState<RestoreHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Cloud configuration modal
  const [cloudModalOpen, setCloudModalOpen] = useState(false);
  const [cloudProvider, setCloudProvider] = useState('S3 / GCS / HTTPS Vault');
  const [cloudEndpoint, setCloudEndpoint] = useState('');
  const [cloudToken, setCloudToken] = useState('');

  // Compare backup versions
  const [compareBase, setCompareBase] = useState('');
  const [compareTarget, setCompareTarget] = useState('');
  const [compareDiffs, setCompareDiffs] = useState<
    Array<{ metric: string; baseCount: number; targetCount: number; delta: number }>
  >([]);

  // Restore Wizard (11-step verified workflow, Admin Only)
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreBackupCode, setRestoreBackupCode] = useState('');
  const [restoreScope, setRestoreScope] = useState('FULL');
  const [restorePreview, setRestorePreview] = useState<RestorePreviewItem | null>(null);
  const [confirmText, setConfirmText] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [schRes, stoRes, histRes, keyRes, rstRes] = await Promise.all([
        phase08Api.getBackupSchedules(),
        phase08Api.getBackupStorage(),
        phase08Api.getBackupHistory(),
        phase08Api.getEncryptionKeys(),
        phase08Api.getRestoreHistory(),
      ]);
      setSchedules(schRes.data);
      setStorages(stoRes.data);
      setBackups(histRes.data.backups);
      setKeys(keyRes.data);
      setRestoreHistory(rstRes.data);

      const cloud = stoRes.data.find((s) => s.storageCode === 'CLOUD_STORAGE');
      if (cloud) {
        setCloudProvider(cloud.providerName);
        setCloudEndpoint(cloud.endpointOrPath);
      }
      if (histRes.data.backups.length >= 2) {
        setCompareTarget((prev) => prev || histRes.data.backups[0].backupCode);
        setCompareBase((prev) => prev || histRes.data.backups[1].backupCode);
      }
    } catch (err) {
      onShowToast('error', 'Failed to load Backup & DR telemetry', err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [onShowToast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleCreateManualBackup = async () => {
    setBusy(true);
    try {
      const res = await phase08Api.createBackupSnapshot('MANUAL');
      onShowToast('success', 'Encrypted Backup Created', `${res.data.backupCode} (${res.data.keyVersion})`);
      loadAll();
    } catch (err) {
      onShowToast('error', 'Backup failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const handleRunSchedule = async (scheduleCode: string) => {
    setBusy(true);
    try {
      const res = await phase08Api.runBackupSchedule(scheduleCode);
      onShowToast('success', 'Schedule Executed', `${res.data.backupCode} completed.`);
      loadAll();
    } catch (err) {
      onShowToast('error', 'Scheduled run failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyBackup = async (backupCode: string) => {
    try {
      await phase08Api.verifyBackup(backupCode);
      onShowToast('success', 'Integrity Verified', `${backupCode}: SHA-256, HMAC-SHA256 & AES-256-GCM OK.`);
      loadAll();
    } catch (err) {
      onShowToast('error', 'Integrity Check Failed', err instanceof Error ? err.message : undefined);
    }
  };

  const handleRotateKey = async () => {
    setBusy(true);
    try {
      const res = await phase08Api.rotateEncryptionKey();
      onShowToast('success', 'Key Rotated', `Active backup key is now ${res.data.activeKey.keyVersion}.`);
      loadAll();
    } catch (err) {
      onShowToast('error', 'Rotation failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveCloudConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await phase08Api.configureCloudStorage({
        providerName: cloudProvider,
        endpointOrPath: cloudEndpoint,
        credentialsSecret: cloudToken || undefined,
      });
      onShowToast('success', 'Cloud Storage Updated', cloudEndpoint ? 'Endpoint saved.' : 'Cleared endpoint.');
      setCloudModalOpen(false);
      setCloudToken('');
      loadAll();
    } catch (err) {
      onShowToast('error', 'Save failed', err instanceof Error ? err.message : undefined);
    }
  };

  const handleCompare = async () => {
    if (!compareBase || !compareTarget) return;
    try {
      const res = await phase08Api.compareBackups(compareBase, compareTarget);
      setCompareDiffs(res.data.diffs);
    } catch (err) {
      onShowToast('error', 'Compare failed', err instanceof Error ? err.message : undefined);
    }
  };

  const handleOpenRestore = (backupCode: string) => {
    setRestoreBackupCode(backupCode);
    setRestoreScope('FULL');
    setRestorePreview(null);
    setConfirmText('');
    setRestoreOpen(true);
  };

  const handleGeneratePreview = async () => {
    setBusy(true);
    try {
      const res = await phase08Api.previewRestore(restoreBackupCode, restoreScope);
      setRestorePreview(res.data);
      onShowToast('info', 'Restore Preview Ready', `Integrity verified for ${restoreBackupCode}.`);
    } catch (err) {
      onShowToast('error', 'Preview blocked', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const handleExecuteRestore = async () => {
    if (!restorePreview) return;
    setBusy(true);
    try {
      const res = await phase08Api.executeRestore({
        backupCode: restoreBackupCode,
        previewId: restorePreview.previewId,
        scope: restoreScope,
        confirmationText: confirmText,
      });
      onShowToast('success', 'Restore Completed', `Safety backup: ${res.data.safetyBackupCode}`);
      setRestoreOpen(false);
      loadAll();
    } catch (err) {
      onShowToast('error', 'Restore Failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-neutral-950 dark:text-white">
            Backup, Encryption &amp; Disaster Recovery
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Daily + Weekly + Monthly + FY Backups · 3-Tier Storage (DB + Cloud + Secondary) · AES-256-GCM + Key Rotation · Permanent Retention · Admin-Only Verified Restore
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {currentUser.role === 'ADMIN' && (
            <>
              <Button variant="outline" size="sm" loading={busy} onClick={handleRotateKey} icon={<KeyRound className="h-3.5 w-3.5" />}>
                Rotate Encryption Key
              </Button>
              <Button variant="primary" size="sm" loading={busy} onClick={handleCreateManualBackup} icon={<Database className="h-3.5 w-3.5" />}>
                Create Encrypted Backup Now
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={loadAll} icon={<RefreshCw className="h-3.5 w-3.5" />}>
            Refresh
          </Button>
        </div>
      </div>

      {/* 3-Tier Storage Status */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {storages.map((s) => (
          <div key={s.storageCode} className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-xs font-bold text-neutral-950 dark:text-white">
                {s.storageCode === 'CLOUD_STORAGE' ? (
                  <Cloud className="h-4 w-4 text-blue-800 dark:text-blue-400" />
                ) : (
                  <HardDrive className="h-4 w-4 text-neutral-700 dark:text-neutral-300" />
                )}
                {s.storageCode}
              </span>
              <StatusText status={s.connectionStatus} />
            </div>
            <div className="text-xs text-neutral-600 dark:text-neutral-300">{s.providerName}</div>
            <div className="font-mono text-[11px] text-neutral-500 truncate">
              {s.endpointOrPath || 'Not configured — set Cloud Endpoint & Credentials'}
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-neutral-100 dark:border-neutral-800 text-[11px] font-mono text-neutral-500">
              <span>Used: {s.usedMb} / {s.capacityLimitMb} MB</span>
              {s.storageCode === 'CLOUD_STORAGE' && currentUser.role === 'ADMIN' && (
                <button
                  type="button"
                  onClick={() => setCloudModalOpen(true)}
                  className="text-blue-800 dark:text-blue-400 hover:underline font-sans font-medium cursor-pointer"
                >
                  Configure Cloud
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Backup Schedules (Daily, Weekly, Monthly, Financial Year) */}
      <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-neutral-950 dark:text-white mb-3">
          Automated Backup Schedules (Daily · Weekly · Monthly · Financial Year Apr–Mar)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {schedules.map((sch) => (
            <div key={sch.scheduleCode} className="p-3.5 border border-neutral-200 dark:border-neutral-800 rounded-md space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-neutral-950 dark:text-white">{sch.frequency}</span>
                <StatusText status={sch.lastStatus} />
              </div>
              <div className="text-[11px] font-mono text-neutral-500">
                Run IST: {sch.runTimeIst} · {sch.enabled ? 'ENABLED' : 'PAUSED'}
              </div>
              <div className="text-[11px] text-neutral-500 truncate">
                Last: {sch.lastRunAt ? sch.lastRunAt.slice(0, 19).replace('T', ' ') : 'Never'}
              </div>
              {currentUser.role === 'ADMIN' && (
                <Button variant="outline" size="sm" onClick={() => handleRunSchedule(sch.scheduleCode)} icon={<Play className="h-3 w-3" />}>
                  Run Schedule Now
                </Button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Encryption Key Ring */}
      <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-neutral-950 dark:text-white mb-3">
          Backup Encryption Key Ring (AES-256-GCM + Retired Keys Retained for Permanent Restore)
        </h3>
        <div className="flex flex-wrap gap-3">
          {keys.map((k) => (
            <div key={k.keyVersion} className="px-3.5 py-2.5 border border-neutral-200 dark:border-neutral-800 rounded-md text-xs">
              <div className="flex items-center gap-2 font-mono font-semibold text-neutral-950 dark:text-white">
                <KeyRound className="h-3.5 w-3.5" />
                <span>{k.keyVersion}</span>
                <StatusText status={k.status} />
              </div>
              <div className="mt-1 text-[11px] font-mono text-neutral-500">
                Created: {k.createdAt.slice(0, 10)} {k.rotatedAt ? `· Rotated: ${k.rotatedAt.slice(0, 10)}` : ''}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Permanent Version History & Integrity Verification */}
      <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-200 dark:border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
              Permanent Backup Version History ({backups.length})
            </h3>
            <p className="text-xs text-neutral-500">Historical versions are never auto-deleted under Permanent Retention policy.</p>
          </div>
          {backups.length >= 2 && (
            <div className="flex items-center gap-2">
              <select
                value={compareBase}
                onChange={(e) => setCompareBase(e.target.value)}
                className="h-8 px-2 text-xs font-mono border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
              >
                {backups.map((b) => <option key={b.backupCode} value={b.backupCode}>{b.backupCode} (v{b.versionNo})</option>)}
              </select>
              <span className="text-xs text-neutral-400">vs</span>
              <select
                value={compareTarget}
                onChange={(e) => setCompareTarget(e.target.value)}
                className="h-8 px-2 text-xs font-mono border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
              >
                {backups.map((b) => <option key={b.backupCode} value={b.backupCode}>{b.backupCode} (v{b.versionNo})</option>)}
              </select>
              <Button variant="outline" size="sm" onClick={handleCompare}>Compare Versions</Button>
            </div>
          )}
        </div>

        {compareDiffs.length > 0 && (
          <div className="p-4 bg-neutral-50 dark:bg-neutral-950 border-b border-neutral-200 dark:border-neutral-800">
            <div className="text-xs font-semibold mb-2">Version Record Comparison ({compareBase} → {compareTarget})</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 text-xs font-mono">
              {compareDiffs.map((d) => (
                <div key={d.metric} className="p-2 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded">
                  <div className="text-[11px] text-neutral-500">{d.metric}</div>
                  <div>{d.baseCount} → {d.targetCount} ({d.delta >= 0 ? `+${d.delta}` : d.delta})</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-neutral-50 dark:bg-neutral-950 border-b border-neutral-200 dark:border-neutral-800">
                <th className="px-4 py-3 font-semibold">Backup Code / Version</th>
                <th className="px-4 py-3 font-semibold">Frequency / FY</th>
                <th className="px-4 py-3 font-semibold">Encryption &amp; Checksum</th>
                <th className="px-4 py-3 font-semibold">Storage Replicas</th>
                <th className="px-4 py-3 font-semibold">Integrity</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {backups.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-neutral-500">
                    No backup versions created yet. Click &ldquo;Create Encrypted Backup Now&rdquo; to snapshot all modules.
                  </td>
                </tr>
              )}
              {backups.map((b) => (
                <tr key={b.backupCode} className="hover:bg-neutral-50/60 dark:hover:bg-neutral-800/30">
                  <td className="px-4 py-3">
                    <div className="font-mono font-semibold text-neutral-950 dark:text-white">{b.backupCode}</div>
                    <div className="text-[11px] font-mono text-neutral-500">v{b.versionNo} · {(b.fileSizeBytes / 1024).toFixed(1)} KB</div>
                  </td>
                  <td className="px-4 py-3 font-mono">
                    <div>{b.frequency}</div>
                    <div className="text-[11px] text-neutral-500">FY {b.financialYear}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px]">
                    <div>{b.encryptionAlgo} ({b.keyVersion})</div>
                    <div className="text-neutral-500 truncate max-w-[160px]" title={b.checksumSha256}>
                      SHA256: {b.checksumSha256.slice(0, 16)}...
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-0.5 text-[11px] font-mono">
                      {b.storageResults.map((sr) => (
                        <div key={sr.storageCode} className="flex items-center gap-1.5">
                          <span>{sr.storageCode}:</span>
                          <StatusText status={sr.status} />
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusText status={b.integrityStatus} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-1.5">
                      <Button variant="outline" size="sm" onClick={() => handleVerifyBackup(b.backupCode)} icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}>
                        Verify
                      </Button>
                      {currentUser.role === 'ADMIN' && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={async () => {
                              try {
                                const preview = await phase08Api.previewRestore(b.backupCode, 'FULL');
                                const filename = exportBackupBundleJson(
                                  { backup: b, integrity: preview.data },
                                  b.backupCode
                                );
                                onShowToast('success', 'Encrypted Bundle Downloaded', filename);
                              } catch (err) {
                                onShowToast('error', 'Bundle Download Failed', err instanceof Error ? err.message : undefined);
                              }
                            }}
                            icon={<Download className="h-3.5 w-3.5" />}
                          >
                            Bundle
                          </Button>
                          <Button variant="primary" size="sm" onClick={() => handleOpenRestore(b.backupCode)} icon={<RotateCcw className="h-3.5 w-3.5" />}>
                            Restore
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Restore History */}
      {restoreHistory.length > 0 && (
        <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-neutral-950 dark:text-white mb-3">
            Verified Restore History ({restoreHistory.length})
          </h3>
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800 text-xs font-mono">
            {restoreHistory.map((r) => (
              <div key={r.restoreCode} className="py-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-semibold text-neutral-950 dark:text-white">{r.restoreCode}</span> · Source: {r.backupCode} · Scope: {r.scope} · Safety Snapshot: {r.safetyBackupCode}
                </div>
                <div className="flex items-center gap-2">
                  <StatusText status={r.status} />
                  <span className="text-neutral-500">{r.executedAt.slice(0, 19).replace('T', ' ')}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Cloud Storage Modal */}
      <Modal isOpen={cloudModalOpen} onClose={() => setCloudModalOpen(false)} title="Configure Cloud Backup Storage" size="md">
        <form onSubmit={handleSaveCloudConfig} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1">Provider Label</label>
            <input
              type="text"
              value={cloudProvider}
              onChange={(e) => setCloudProvider(e.target.value)}
              className="w-full h-9 px-3 text-xs border border-neutral-200 dark:border-neutral-700 rounded-md bg-white dark:bg-neutral-950"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">S3 / GCS / HTTPS Endpoint URL</label>
            <input
              type="text"
              value={cloudEndpoint}
              onChange={(e) => setCloudEndpoint(e.target.value)}
              placeholder="https://backup-bucket.example.com/mun-computer"
              className="w-full h-9 px-3 text-xs font-mono border border-neutral-200 dark:border-neutral-700 rounded-md bg-white dark:bg-neutral-950"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Bearer Access Key / Secret (Write-Only)</label>
            <input
              type="password"
              value={cloudToken}
              onChange={(e) => setCloudToken(e.target.value)}
              placeholder="Leave blank to retain existing secret"
              className="w-full h-9 px-3 text-xs font-mono border border-neutral-200 dark:border-neutral-700 rounded-md bg-white dark:bg-neutral-950"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setCloudModalOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" size="sm">Save Cloud Config</Button>
          </div>
        </form>
      </Modal>

      {/* Admin-Only 11-Step Verified Restore Wizard */}
      <Modal isOpen={restoreOpen} onClose={() => setRestoreOpen(false)} title={`Verified Disaster Recovery Restore · ${restoreBackupCode}`} size="lg">
        <div className="space-y-4">
          <div className="p-3 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded text-xs space-y-1">
            <div className="font-semibold flex items-center gap-1.5 text-neutral-950 dark:text-white">
              <ShieldCheck className="h-4 w-4 text-blue-800 dark:text-blue-400" />
              Admin-Only Safeguarded Restore Protocol
            </div>
            <p className="text-neutral-600 dark:text-neutral-300">
              1) Verifies SHA-256 checksum &amp; HMAC-SHA256 signature &rarr; 2) Previews affected records &amp; duplicate financial voucher guard &rarr; 3) Creates automatic Pre-Restore Safety Backup &rarr; 4) Validates post-restore accounting equation.
            </p>
          </div>

          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium mb-1">Restore Scope</label>
              <select
                value={restoreScope}
                onChange={(e) => {
                  setRestoreScope(e.target.value);
                  setRestorePreview(null);
                }}
                className="w-full h-9 px-3 text-xs font-mono border border-neutral-200 dark:border-neutral-700 rounded-md bg-white dark:bg-neutral-950"
              >
                <option value="FULL">FULL SYSTEM RESTORE</option>
                <option value="CUSTOMERS">CUSTOMERS ONLY</option>
                <option value="APPLICATIONS">APPLICATIONS &amp; SERVICES ONLY</option>
                <option value="FINANCE">FINANCIAL LEDGERS (NO DUPLICATES)</option>
                <option value="CONFIGURATION">CONFIGURATION &amp; MASTER SETTINGS</option>
                <option value="DOCUMENTS">UPLOADED DOCUMENTS</option>
                <option value="REPORT_ARCHIVES">REPORT TEMPLATES &amp; ARCHIVES</option>
              </select>
            </div>
            <Button variant="outline" size="sm" loading={busy} onClick={handleGeneratePreview}>
              Run Integrity Check &amp; Preview
            </Button>
          </div>

          {restorePreview && (
            <div className="space-y-3 border border-neutral-200 dark:border-neutral-800 rounded-md p-4 text-xs">
              <div className="flex items-center justify-between font-mono">
                <span>Preview ID: <strong>{restorePreview.previewId}</strong></span>
                <span className="text-emerald-700 font-semibold">CHECKSUM + HMAC + AES-GCM VERIFIED</span>
              </div>
              <div className="grid grid-cols-3 gap-2 font-mono text-[11px]">
                <div className="p-2 border border-neutral-200 dark:border-neutral-800 rounded">
                  Customers to Restore: <strong>{restorePreview.affectedRecords.customers.toRestore}</strong>
                </div>
                <div className="p-2 border border-neutral-200 dark:border-neutral-800 rounded">
                  Applications to Restore: <strong>{restorePreview.affectedRecords.applications.toRestore}</strong>
                </div>
                <div className="p-2 border border-neutral-200 dark:border-neutral-800 rounded">
                  Vouchers Skipped (Dup): <strong>{restorePreview.affectedRecords.financeVouchers.duplicateSkipped}</strong>
                </div>
              </div>
              <ul className="list-disc pl-4 text-neutral-600 dark:text-neutral-300 space-y-1">
                {restorePreview.warnings.map((w) => <li key={w}>{w}</li>)}
              </ul>

              <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800">
                <label className="block text-xs font-semibold mb-1">
                  Type <span className="font-mono">CONFIRM RESTORE</span> to execute with automatic safety backup:
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="CONFIRM RESTORE"
                    className="flex-1 h-9 px-3 text-xs font-mono border border-neutral-200 dark:border-neutral-700 rounded-md bg-white dark:bg-neutral-950"
                  />
                  <Button
                    variant="danger"
                    size="sm"
                    loading={busy}
                    disabled={confirmText.trim().toUpperCase() !== 'CONFIRM RESTORE'}
                    onClick={handleExecuteRestore}
                  >
                    Execute Verified Restore
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};
