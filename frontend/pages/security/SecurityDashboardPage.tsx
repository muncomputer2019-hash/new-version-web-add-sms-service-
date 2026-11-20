import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  HardDrive,
  Lock,
  Plus,
  RefreshCw,
  Shield,
  ShieldAlert,
  UserX,
} from 'lucide-react';
import {
  IdGenerationHistoryItem,
  Phase02NotificationItem,
  ServicePermissionsOverviewPayload,
  UserProfile,
} from '../../modules/types';
import {
  Phase08DashboardPayload,
  phase08Api,
} from '../../services/phase08Api';
import { securityRequest } from '../../services/securityApi';
import { Button } from '../../components/Button';
import { StatusText } from '../../components/StatusText';
import { Modal } from '../../components/Modal';

interface SecurityDashboardPageProps {
  currentUser: UserProfile;
  onShowToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}

const APPROVED_CONTROLS = [
  ['1. Login Security', 'OTP + Password + CAPTCHA'],
  ['2. Two-Factor Auth', 'SMS OTP + Google Authenticator (TOTP)'],
  ['3. Login Protection', 'Lockout + Device Monitoring'],
  ['4. Role Permissions', 'Module + Page + Action'],
  ['5. Audit Log', 'Before/After + SHA-256 Chain'],
  ['6. Backup Frequency', 'Daily + Weekly + Monthly + FY'],
  ['7. Backup Storage', 'DB + Cloud + Secondary'],
  ['8. Backup Encryption', 'AES-256-GCM + HMAC-SHA256'],
  ['9. Backup Retention', 'Permanent + Version History'],
  ['10. Restore Authority', 'Admin Only + Approval + Preview'],
  ['11. Data Recovery', 'Soft Delete + Recovery + Admin Purge'],
  ['12. Security Monitoring', 'Real-Time Alerts + Dashboard'],
];

export const SecurityDashboardPage: React.FC<SecurityDashboardPageProps> = ({
  currentUser,
  onShowToast,
}) => {
  const [data, setData] = useState<Phase08DashboardPayload | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [svcOverview, setSvcOverview] = useState<ServicePermissionsOverviewPayload | null>(null);
  const [idHistory, setIdHistory] = useState<IdGenerationHistoryItem[]>([]);
  const [secNotifs, setSecNotifs] = useState<Phase02NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Incident modal
  const [incidentOpen, setIncidentOpen] = useState(false);
  const [incTitle, setIncTitle] = useState('');
  const [incCategory, setIncCategory] = useState('UNAUTHORIZED_ACCESS_ATTEMPT');
  const [incSeverity, setIncSeverity] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'>('HIGH');
  const [incDescription, setIncDescription] = useState('');

  // Emergency lock state
  const [emergencyUserId, setEmergencyUserId] = useState('');
  const [emergencyReason, setEmergencyReason] = useState('Compromised credentials or suspicious behavior');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [dashRes, usersRes, svcRes, idHistRes, notifRes] = await Promise.all([
        phase08Api.getDashboard(),
        securityRequest<UserProfile[]>('/api/users').catch(() => ({ data: [] as UserProfile[] })),
        securityRequest<ServicePermissionsOverviewPayload>('/api/service-permissions/overview').catch(
          () => ({ data: null as ServicePermissionsOverviewPayload | null })
        ),
        securityRequest<IdGenerationHistoryItem[]>('/api/users/id-generation-history').catch(
          () => ({ data: [] as IdGenerationHistoryItem[] })
        ),
        securityRequest<Phase02NotificationItem[]>('/api/notifications/security').catch(
          () => ({ data: [] as Phase02NotificationItem[] })
        ),
      ]);
      setData(dashRes.data);
      setSvcOverview(svcRes.data);
      setIdHistory(idHistRes.data);
      setSecNotifs(notifRes.data);
      const nonSelf = usersRes.data.filter((u) => u.userId !== currentUser.userId && !u.isMasterAdmin);
      setUsers(nonSelf);
      if (nonSelf.length > 0 && !emergencyUserId) {
        setEmergencyUserId(nonSelf[0].userId);
      }
    } catch (err) {
      onShowToast('error', 'Failed to load Security Dashboard', err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [currentUser.userId, emergencyUserId, onShowToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleVerifyAuditChain = async () => {
    try {
      const res = await phase08Api.verifyAuditChain();
      onShowToast(
        res.data.valid ? 'success' : 'error',
        res.data.valid ? 'Audit Hash Chain Verified' : 'Tampering Detected',
        `${res.data.totalEntriesChecked} log entries checked.`
      );
      loadData();
    } catch (err) {
      onShowToast('error', 'Verification failed', err instanceof Error ? err.message : undefined);
    }
  };

  const handleAcknowledgeAlert = async (alertCode: string) => {
    try {
      await phase08Api.acknowledgeAlert(alertCode);
      onShowToast('info', 'Alert Acknowledged', alertCode);
      loadData();
    } catch (err) {
      onShowToast('error', 'Action failed', err instanceof Error ? err.message : undefined);
    }
  };

  const handleResolveAlert = async (alertCode: string) => {
    try {
      await phase08Api.resolveAlert(alertCode, 'Verified and resolved from Security Operations Center.');
      onShowToast('success', 'Alert Resolved', alertCode);
      loadData();
    } catch (err) {
      onShowToast('error', 'Resolve failed', err instanceof Error ? err.message : undefined);
    }
  };

  const handleCreateIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await phase08Api.createIncident({
        title: incTitle,
        category: incCategory,
        severity: incSeverity,
        description: incDescription,
      });
      onShowToast('success', 'Incident Registered', 'Assigned for security investigation.');
      setIncidentOpen(false);
      setIncTitle('');
      setIncDescription('');
      loadData();
    } catch (err) {
      onShowToast('error', 'Could not register incident', err instanceof Error ? err.message : undefined);
    }
  };

  const handleAdvanceIncident = async (incidentCode: string, nextStatus: string) => {
    try {
      await phase08Api.updateIncident(incidentCode, {
        investigationStatus: nextStatus,
        resolutionNotes: `Updated to ${nextStatus} by ${currentUser.userId}.`,
      });
      onShowToast('success', 'Incident Updated', `${incidentCode} -> ${nextStatus}`);
      loadData();
    } catch (err) {
      onShowToast('error', 'Update failed', err instanceof Error ? err.message : undefined);
    }
  };

  const handleEmergencyLock = async () => {
    if (!emergencyUserId) return;
    try {
      await phase08Api.emergencyLockUser(emergencyUserId, emergencyReason);
      onShowToast('success', 'Emergency Lock Applied', `${emergencyUserId} suspended and all sessions revoked.`);
      loadData();
    } catch (err) {
      onShowToast('error', 'Emergency lock failed', err instanceof Error ? err.message : undefined);
    }
  };

  const handleForceLogout = async () => {
    if (!emergencyUserId) return;
    try {
      const res = await phase08Api.emergencyRevokeSessions(emergencyUserId);
      onShowToast('info', 'Sessions Revoked', (res as { message?: string }).message || 'All active tokens closed.');
      loadData();
    } catch (err) {
      onShowToast('error', 'Force logout failed', err instanceof Error ? err.message : undefined);
    }
  };

  if (loading && !data) {
    return (
      <div className="p-8 text-xs text-neutral-500 dark:text-neutral-400">
        Loading Enterprise Security &amp; Disaster Recovery Dashboard...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-neutral-950 dark:text-white">
            Security Command Center &amp; Health Monitor
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Phase 08 Enterprise Security, Intrusion Alerts, Incident Response &amp; Disaster Recovery Posture
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleVerifyAuditChain} icon={<CheckCircle2 className="h-3.5 w-3.5" />}>
            Verify Audit Chain
          </Button>
          <Button variant="outline" size="sm" onClick={() => setIncidentOpen(true)} icon={<Plus className="h-3.5 w-3.5" />}>
            Log Incident
          </Button>
          <Button variant="outline" size="sm" onClick={loadData} icon={<RefreshCw className="h-3.5 w-3.5" />}>
            Refresh
          </Button>
        </div>
      </div>

      {/* KPI Grid */}
      {data && (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4">
            <div className="text-[11px] text-neutral-500 font-medium">System Health</div>
            <div className="mt-1.5 flex items-center justify-between">
              <span className="text-lg font-bold font-mono text-neutral-950 dark:text-white">
                {data.health.overallStatus}
              </span>
              <Activity className="h-4 w-4 text-neutral-500" />
            </div>
            <div className="mt-1 text-[11px] text-neutral-500 font-mono">
              Uptime: {data.health.api.uptimeSeconds}s
            </div>
          </div>

          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4">
            <div className="text-[11px] text-neutral-500 font-medium">Open Alerts</div>
            <div className="mt-1.5 flex items-center justify-between">
              <span className="text-lg font-bold font-mono tabular-nums text-neutral-950 dark:text-white">
                {data.kpis.openAlertsCount}
              </span>
              <ShieldAlert className="h-4 w-4 text-amber-600" />
            </div>
            <div className="mt-1 text-[11px] text-neutral-500 font-mono">
              High/Critical: {data.kpis.criticalAlertsCount}
            </div>
          </div>

          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4">
            <div className="text-[11px] text-neutral-500 font-medium">Active Sessions</div>
            <div className="mt-1.5 flex items-center justify-between">
              <span className="text-lg font-bold font-mono tabular-nums text-neutral-950 dark:text-white">
                {data.kpis.activeSessionsCount}
              </span>
              <Shield className="h-4 w-4 text-blue-800 dark:text-blue-400" />
            </div>
            <div className="mt-1 text-[11px] text-neutral-500 font-mono">
              Locked Accounts: {data.kpis.lockedUsersCount}
            </div>
          </div>

          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4">
            <div className="text-[11px] text-neutral-500 font-medium">Devices Tracked</div>
            <div className="mt-1.5 flex items-center justify-between">
              <span className="text-lg font-bold font-mono tabular-nums text-neutral-950 dark:text-white">
                {data.kpis.registeredDevicesCount}
              </span>
              <HardDrive className="h-4 w-4 text-neutral-500" />
            </div>
            <div className="mt-1 text-[11px] text-neutral-500 font-mono">
              Pending Verify: {data.kpis.pendingDevicesCount}
            </div>
          </div>

          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4">
            <div className="text-[11px] text-neutral-500 font-medium">Encrypted Backups</div>
            <div className="mt-1.5 flex items-center justify-between">
              <span className="text-lg font-bold font-mono tabular-nums text-neutral-950 dark:text-white">
                {data.kpis.totalBackupsCount}
              </span>
              <Database className="h-4 w-4 text-neutral-500" />
            </div>
            <div className="mt-1 text-[11px] text-neutral-500 font-mono">
              Key: {data.settings.activeEncryptionKeyVersion}
            </div>
          </div>

          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4">
            <div className="text-[11px] text-neutral-500 font-medium">Audit Ledger Chain</div>
            <div className="mt-1.5 flex items-center justify-between">
              <span className="text-lg font-bold font-mono text-neutral-950 dark:text-white">
                {data.kpis.auditChainValid ? 'INTACT' : 'BROKEN'}
              </span>
              <Lock className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="mt-1 text-[11px] text-neutral-500 font-mono">
              {data.kpis.auditEntriesCount} entries
            </div>
          </div>
        </div>
      )}

      {/* 12 Approved Baseline Controls Matrix */}
      <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-neutral-950 dark:text-white mb-3">
          Approved Phase 08 Security &amp; Disaster Recovery Policy Matrix
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {APPROVED_CONTROLS.map(([title, val]) => (
            <div
              key={title}
              className="p-3 rounded-md border border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-neutral-950/60"
            >
              <div className="text-[11px] text-neutral-500 dark:text-neutral-400">{title}</div>
              <div className="mt-0.5 text-xs font-semibold font-mono text-neutral-950 dark:text-white">{val}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Role-Aware Phase 02 Governance Summary & Notifications */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 space-y-3">
          <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
            Phase 02 Governance Summary ({currentUser.role})
          </h3>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div className="p-3 border border-neutral-200 dark:border-neutral-800 rounded">
              <div className="text-neutral-500">Departments</div>
              <div className="mt-1 text-base font-bold font-mono tabular-nums">
                {svcOverview?.departments.length ?? 5}
              </div>
            </div>
            <div className="p-3 border border-neutral-200 dark:border-neutral-800 rounded">
              <div className="text-neutral-500">Manager Services</div>
              <div className="mt-1 text-base font-bold font-mono tabular-nums">
                {svcOverview?.managerAssignments.filter((a) => a.status === 'ACTIVE').length ?? 0}
              </div>
            </div>
            <div className="p-3 border border-neutral-200 dark:border-neutral-800 rounded">
              <div className="text-neutral-500">Pending Approvals</div>
              <div className="mt-1 text-base font-bold font-mono tabular-nums">
                {svcOverview?.staffRequests.filter((r) => r.status === 'PENDING_ADMIN_APPROVAL').length ?? 0}
              </div>
            </div>
          </div>
          {idHistory.length > 0 && (
            <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800 text-[11px]">
              <div className="font-semibold text-neutral-700 dark:text-neutral-200 mb-1">
                Recent Atomic User IDs Issued (MCYYFFMMSSSS)
              </div>
              <div className="space-y-1">
                {idHistory.slice(0, 4).map((h) => (
                  <div key={h.id} className="flex items-center justify-between font-mono text-neutral-600 dark:text-neutral-300">
                    <span>{h.generatedUserId} · {h.role}</span>
                    <span>FY {h.financialYearLabel}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 space-y-3">
          <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
            Security &amp; Permission Event Notifications ({secNotifs.length})
          </h3>
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800 text-xs max-h-48 overflow-y-auto">
            {secNotifs.length === 0 && (
              <div className="py-4 text-neutral-500">No recent Phase 02 security notifications.</div>
            )}
            {secNotifs.slice(0, 6).map((n) => (
              <div key={n.notificationCode} className="py-2">
                <div className="font-semibold text-neutral-950 dark:text-white">{n.title}</div>
                <div className="text-neutral-600 dark:text-neutral-300">{n.message}</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Emergency Lockdown Controls (Admin Only) */}
      {currentUser.role === 'ADMIN' && users.length > 0 && (
        <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
          <div className="flex items-center gap-2 mb-3">
            <UserX className="h-4 w-4 text-red-600" />
            <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
              Emergency Account Lock &amp; Force Session Termination
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Target Account
              </label>
              <select
                value={emergencyUserId}
                onChange={(e) => setEmergencyUserId(e.target.value)}
                className="w-full h-9 px-3 text-xs font-mono bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded-md"
              >
                {users.map((u) => (
                  <option key={u.userId} value={u.userId}>
                    {u.userId} — {u.fullName} ({u.role} · {u.status})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">
                Security Justification
              </label>
              <input
                type="text"
                value={emergencyReason}
                onChange={(e) => setEmergencyReason(e.target.value)}
                className="w-full h-9 px-3 text-xs bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded-md"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleForceLogout}>
                Force Logout Sessions
              </Button>
              <Button variant="danger" size="sm" onClick={handleEmergencyLock}>
                Emergency Lock
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* Alerts & Incidents Split */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-neutral-950 dark:text-white flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Real-Time Security Alerts ({data?.recentAlerts.length ?? 0})
            </h3>
          </div>
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {(!data || data.recentAlerts.length === 0) && (
              <div className="py-6 text-xs text-neutral-500 text-center">No security alerts recorded yet.</div>
            )}
            {data?.recentAlerts.map((alert) => (
              <div key={alert.alertCode} className="py-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-neutral-950 dark:text-white">
                    {alert.title}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] px-2 py-0.5 border border-neutral-200 dark:border-neutral-700 rounded">
                      {alert.severity}
                    </span>
                    <StatusText status={alert.status} />
                  </div>
                </div>
                <p className="text-xs text-neutral-600 dark:text-neutral-300">{alert.description}</p>
                <div className="flex items-center justify-between text-[11px] text-neutral-400">
                  <span className="font-mono">{alert.alertCode} · {alert.createdAt.slice(0, 19).replace('T', ' ')}</span>
                  <div className="flex gap-2">
                    {alert.status === 'OPEN' && (
                      <Button variant="outline" size="sm" onClick={() => handleAcknowledgeAlert(alert.alertCode)}>
                        Acknowledge
                      </Button>
                    )}
                    {currentUser.role === 'ADMIN' && alert.status !== 'RESOLVED' && (
                      <Button variant="primary" size="sm" onClick={() => handleResolveAlert(alert.alertCode)}>
                        Resolve
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-neutral-950 dark:text-white mb-3">
            Security Incident Investigation Log ({data?.recentIncidents.length ?? 0})
          </h3>
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {(!data || data.recentIncidents.length === 0) && (
              <div className="py-6 text-xs text-neutral-500 text-center">No active security incidents filed.</div>
            )}
            {data?.recentIncidents.map((inc) => (
              <div key={inc.incidentCode} className="py-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-neutral-950 dark:text-white">
                    {inc.title}
                  </span>
                  <StatusText status={inc.investigationStatus} />
                </div>
                <p className="text-xs text-neutral-600 dark:text-neutral-300">{inc.description}</p>
                <div className="flex items-center justify-between text-[11px] text-neutral-400">
                  <span className="font-mono">{inc.incidentCode} · {inc.severity} · {inc.reportedBy}</span>
                  {currentUser.role === 'ADMIN' && inc.investigationStatus !== 'CLOSED' && (
                    <div className="flex gap-1.5">
                      {inc.investigationStatus === 'OPEN' && (
                        <Button variant="outline" size="sm" onClick={() => handleAdvanceIncident(inc.incidentCode, 'INVESTIGATING')}>
                          Investigate
                        </Button>
                      )}
                      {inc.investigationStatus !== 'RESOLVED' && (
                        <Button variant="outline" size="sm" onClick={() => handleAdvanceIncident(inc.incidentCode, 'RESOLVED')}>
                          Resolve
                        </Button>
                      )}
                      <Button variant="primary" size="sm" onClick={() => handleAdvanceIncident(inc.incidentCode, 'CLOSED')}>
                        Close
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* System Health & Software Version History */}
      {data && (
        <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
            <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
              System Health Telemetry &amp; Version History ({data.health.appVersion})
            </h3>
            <span className="text-xs font-mono text-neutral-500">
              Storage Usage: {data.health.storage.primaryUsedMb} MB / {data.health.storage.capacityLimitMb} MB ({data.health.storage.usagePct}%) · Cloud: {data.health.storage.cloudConfigured ? 'Connected' : 'Pending Configuration'}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
            {data.health.versionHistory.map((v) => (
              <div key={v.version} className="p-3 border border-neutral-200 dark:border-neutral-800 rounded-md">
                <div className="flex items-center justify-between text-xs font-mono font-semibold text-neutral-950 dark:text-white">
                  <span>{v.version}</span>
                  <span className="text-neutral-500">{v.phase}</span>
                </div>
                <div className="mt-1 text-[11px] text-neutral-600 dark:text-neutral-300 leading-relaxed">{v.notes}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      <Modal isOpen={incidentOpen} onClose={() => setIncidentOpen(false)} title="Register Security Incident" size="md">
        <form onSubmit={handleCreateIncident} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">Incident Title *</label>
            <input
              type="text"
              required
              value={incTitle}
              onChange={(e) => setIncTitle(e.target.value)}
              placeholder="e.g., Suspicious bulk export attempt from unknown IP"
              className="w-full h-9 px-3 text-sm bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded-md"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">Category</label>
              <select
                value={incCategory}
                onChange={(e) => setIncCategory(e.target.value)}
                className="w-full h-9 px-3 text-xs bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded-md"
              >
                <option value="UNAUTHORIZED_ACCESS_ATTEMPT">Unauthorized Access Attempt</option>
                <option value="BRUTE_FORCE_LOGIN">Brute Force Login</option>
                <option value="DATA_EXFILTRATION_RISK">Suspicious Data Export</option>
                <option value="BACKUP_INTEGRITY_ISSUE">Backup / Integrity Issue</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">Severity</label>
              <select
                value={incSeverity}
                onChange={(e) => setIncSeverity(e.target.value as typeof incSeverity)}
                className="w-full h-9 px-3 text-xs bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded-md"
              >
                <option value="LOW">LOW</option>
                <option value="MEDIUM">MEDIUM</option>
                <option value="HIGH">HIGH</option>
                <option value="CRITICAL">CRITICAL</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1">Details</label>
            <textarea
              rows={3}
              value={incDescription}
              onChange={(e) => setIncDescription(e.target.value)}
              placeholder="Describe evidence, impacted accounts, and immediate containment..."
              className="w-full p-3 text-xs bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded-md"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setIncidentOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" size="sm">Register Incident</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
