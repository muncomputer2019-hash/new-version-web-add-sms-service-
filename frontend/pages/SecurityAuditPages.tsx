import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Download, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { AuditLogItem, SecurityLogItem, SessionItem } from '../modules/types';
import { securityRequest } from '../services/securityApi';
import { phase08Api, TamperAuditEntry } from '../services/phase08Api';
import { paginateArray } from '../services/apiClient';
import { exportAuditChainCsv } from '../services/clientExportService';
import { DataTable, TableColumn } from '../components/DataTable';
import { StatusText } from '../components/StatusText';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';

/* ============================================================================
 * 1. LOGIN HISTORY, SECURITY LOGS & PHASE 08 BEFORE/AFTER AUDIT CHAIN
 * ========================================================================== */
interface SecurityLogsPageProps {
  mode: 'login-history' | 'security-logs';
  onShowToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}

export const SecurityLogsPage: React.FC<SecurityLogsPageProps> = ({
  mode,
  onShowToast,
}) => {
  const [securityLogs, setSecurityLogs] = useState<SecurityLogItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [chainEntries, setChainEntries] = useState<TamperAuditEntry[]>([]);
  const [chainIntegrity, setChainIntegrity] = useState<{
    valid: boolean;
    totalEntriesChecked: number;
    brokenEntryUuid: string | null;
  } | null>(null);
  const [tab, setTab] = useState<'security' | 'audit' | 'chain'>(mode === 'security-logs' ? 'chain' : 'security');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  // Chain filters
  const [filterQuery, setFilterQuery] = useState('');
  const [filterModule, setFilterModule] = useState('');
  const [filterResult, setFilterResult] = useState('');

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const [secRes, audRes, chainRes] = await Promise.all([
        securityRequest<SecurityLogItem[]>('/api/security-logs'),
        securityRequest<AuditLogItem[]>('/api/audit-logs'),
        phase08Api.getAuditChain({
          q: filterQuery,
          module: filterModule,
          actionResult: filterResult,
        }),
      ]);
      setSecurityLogs(secRes.data);
      setAuditLogs(audRes.data);
      setChainEntries(chainRes.data.entries);
      setChainIntegrity(chainRes.data.integrity);
    } catch (err) {
      onShowToast('error', 'Failed to load logs', err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [filterModule, filterQuery, filterResult, onShowToast]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const handleVerifyChain = async () => {
    try {
      const res = await phase08Api.verifyAuditChain();
      setChainIntegrity(res.data);
      onShowToast(
        res.data.valid ? 'success' : 'error',
        res.data.valid ? 'Audit Hash Chain Intact' : 'Hash Chain Tampered',
        `Checked ${res.data.totalEntriesChecked} chained audit entry(ies).`
      );
    } catch (err) {
      onShowToast('error', 'Verification failed', err instanceof Error ? err.message : undefined);
    }
  };

  const filteredSec = useMemo(() => {
    if (mode === 'login-history') {
      return securityLogs.filter((l) =>
        ['LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'ACCOUNT_LOCKED', 'OTP_VERIFIED', 'OTP_FAILED'].includes(
          l.eventType
        )
      );
    }
    return securityLogs;
  }, [securityLogs, mode]);

  const paginatedSec = useMemo(() => paginateArray(filteredSec, page, 8), [filteredSec, page]);
  const paginatedAudit = useMemo(() => paginateArray(auditLogs, page, 8), [auditLogs, page]);
  const paginatedChain = useMemo(() => paginateArray(chainEntries, page, 8), [chainEntries, page]);

  const secColumns: TableColumn<SecurityLogItem>[] = [
    {
      key: 'createdAt',
      header: 'Timestamp (UTC)',
      render: (r) => (
        <span className="font-mono text-xs text-neutral-500 whitespace-nowrap">
          {r.createdAt.slice(0, 19).replace('T', ' ')}
        </span>
      ),
    },
    {
      key: 'actorUserId',
      header: 'Actor User ID',
      render: (r) => <span className="font-mono text-xs font-medium">{r.actorUserId}</span>,
    },
    {
      key: 'eventType',
      header: 'Event',
      render: (r) => <span className="font-mono text-xs text-neutral-800 dark:text-neutral-200">{r.eventType}</span>,
    },
    {
      key: 'result',
      header: 'Result',
      render: (r) => <StatusText status={r.result} />,
    },
    {
      key: 'ipAddress',
      header: 'IP / Device',
      className: 'hidden md:table-cell',
      render: (r) => (
        <div className="text-xs">
          <div className="font-mono text-neutral-800 dark:text-neutral-200">{r.ipAddress}</div>
          <div className="text-neutral-400 truncate max-w-[180px]">{r.deviceInfo}</div>
        </div>
      ),
    },
    {
      key: 'summary',
      header: 'Summary (Sanitized)',
      render: (r) => <span className="text-xs text-neutral-700 dark:text-neutral-300">{r.summary}</span>,
    },
  ];

  const auditColumns: TableColumn<AuditLogItem>[] = [
    {
      key: 'createdAt',
      header: 'Timestamp (UTC)',
      render: (r) => (
        <span className="font-mono text-xs text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
          {r.createdAt.slice(0, 19).replace('T', ' ')}
        </span>
      ),
    },
    {
      key: 'actor',
      header: 'Actor',
      render: (r) => <span className="font-mono text-xs font-medium">{r.actorUserId}</span>,
    },
    {
      key: 'action',
      header: 'Action',
      render: (r) => <span className="font-mono text-xs">{r.action}</span>,
    },
    {
      key: 'target',
      header: 'Target',
      render: (r) => <span className="font-mono text-xs text-neutral-700 dark:text-neutral-300">{r.targetId}</span>,
    },
    {
      key: 'details',
      header: 'Details',
      render: (r) => <span className="text-xs text-neutral-700 dark:text-neutral-300">{r.details}</span>,
    },
  ];

  const chainColumns: TableColumn<TamperAuditEntry>[] = [
    {
      key: 'createdAt',
      header: 'Timestamp',
      render: (r) => (
        <div className="font-mono text-[11px] text-neutral-500 whitespace-nowrap">
          <div>{r.createdAt.slice(0, 19).replace('T', ' ')}</div>
          <div className="text-[10px] text-neutral-400">#{r.entryHash.slice(0, 12)}</div>
        </div>
      ),
    },
    {
      key: 'user',
      header: 'User / Role',
      render: (r) => (
        <div className="font-mono text-xs">
          <div className="font-semibold text-neutral-950 dark:text-white">{r.userId}</div>
          <div className="text-[11px] text-neutral-500">{r.userRole}</div>
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Module / Action',
      render: (r) => (
        <div className="font-mono text-xs">
          <div>{r.actionType}</div>
          <div className="text-[11px] text-neutral-500">{r.module} · {r.recordId}</div>
        </div>
      ),
    },
    {
      key: 'beforeAfter',
      header: 'Before / After Values',
      render: (r) => (
        <div className="font-mono text-[11px] max-w-[280px] space-y-0.5">
          {r.beforeValues && (
            <div className="text-neutral-500 truncate" title={JSON.stringify(r.beforeValues)}>
              Before: {JSON.stringify(r.beforeValues)}
            </div>
          )}
          {r.afterValues && (
            <div className="text-neutral-800 dark:text-neutral-200 truncate" title={JSON.stringify(r.afterValues)}>
              After: {JSON.stringify(r.afterValues)}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'result',
      header: 'Result',
      render: (r) => <StatusText status={r.actionResult} />,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-neutral-950 dark:text-white">
            {mode === 'login-history' ? 'Login & Session History' : 'Security & Tamper-Evident Audit Logs'}
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Immutable records · Before/After SHA-256 hash chain · Passwords, OTPs &amp; Aadhaar secrets are never logged
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {mode === 'security-logs' && (
            <>
              <Button variant="outline" size="sm" onClick={handleVerifyChain} icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}>
                Verify SHA-256 Chain
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const filename = exportAuditChainCsv(chainEntries);
                  onShowToast('success', 'CSV Exported', filename);
                }}
                icon={<Download className="h-3.5 w-3.5" />}
              >
                Export CSV
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={loadLogs} icon={<RefreshCw className="h-3.5 w-3.5" />}>
            Refresh Logs
          </Button>
        </div>
      </div>

      {chainIntegrity && mode === 'security-logs' && (
        <div className="px-4 py-2.5 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-md flex items-center justify-between text-xs font-mono">
          <span className="inline-flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            <span>
              Hash Chain Integrity: <strong>{chainIntegrity.valid ? 'VERIFIED INTACT' : 'BROKEN / TAMPERED'}</strong> ({chainIntegrity.totalEntriesChecked} entries)
            </span>
          </span>
          {chainIntegrity.brokenEntryUuid && <span className="text-red-600">Broken UUID: {chainIntegrity.brokenEntryUuid}</span>}
        </div>
      )}

      {mode === 'security-logs' && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 dark:border-neutral-800 pb-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => { setTab('chain'); setPage(1); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                tab === 'chain'
                  ? 'bg-neutral-950 text-white dark:bg-white dark:text-neutral-950'
                  : 'text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
              }`}
            >
              Before/After Audit Chain ({chainEntries.length})
            </button>
            <button
              type="button"
              onClick={() => { setTab('security'); setPage(1); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                tab === 'security'
                  ? 'bg-neutral-950 text-white dark:bg-white dark:text-neutral-950'
                  : 'text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
              }`}
            >
              Security Events ({securityLogs.length})
            </button>
            <button
              type="button"
              onClick={() => { setTab('audit'); setPage(1); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                tab === 'audit'
                  ? 'bg-neutral-950 text-white dark:bg-white dark:text-neutral-950'
                  : 'text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
              }`}
            >
              Admin Trail ({auditLogs.length})
            </button>
          </div>

          {tab === 'chain' && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                placeholder="Search user, action, record..."
                className="h-8 px-2.5 text-xs border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
              />
              <input
                type="text"
                value={filterModule}
                onChange={(e) => setFilterModule(e.target.value)}
                placeholder="Module (e.g. permissions)"
                className="h-8 px-2.5 text-xs font-mono border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950 w-36"
              />
              <select
                value={filterResult}
                onChange={(e) => setFilterResult(e.target.value)}
                className="h-8 px-2 text-xs border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
              >
                <option value="">All Results</option>
                <option value="SUCCESS">SUCCESS</option>
                <option value="FAILURE">FAILURE</option>
                <option value="BLOCKED">BLOCKED</option>
              </select>
            </div>
          )}
        </div>
      )}

      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
        {mode === 'login-history' || tab === 'security' ? (
          <DataTable
            columns={secColumns}
            data={paginatedSec.items}
            rowKey={(l) => l.id}
            loading={loading}
            pagination={paginatedSec.pagination}
            onPageChange={setPage}
          />
        ) : tab === 'chain' ? (
          <DataTable
            columns={chainColumns}
            data={paginatedChain.items}
            rowKey={(l) => l.auditUuid}
            loading={loading}
            pagination={paginatedChain.pagination}
            onPageChange={setPage}
          />
        ) : (
          <DataTable
            columns={auditColumns}
            data={paginatedAudit.items}
            rowKey={(l) => l.id}
            loading={loading}
            pagination={paginatedAudit.pagination}
            onPageChange={setPage}
          />
        )}
      </div>
    </div>
  );
};

/* ============================================================================
 * 2. SESSION MANAGEMENT PAGE
 * ========================================================================== */
interface SessionsPageProps {
  onShowToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
  onCurrentSessionRevoked: () => void;
}

export const SessionsPage: React.FC<SessionsPageProps> = ({
  onShowToast,
  onCurrentSessionRevoked,
}) => {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokeTarget, setRevokeTarget] = useState<SessionItem | null>(null);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await securityRequest<SessionItem[]>('/api/sessions');
      setSessions(res.data);
    } catch (err) {
      onShowToast('error', 'Failed to load sessions', err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [onShowToast]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handleConfirmRevoke = async () => {
    if (!revokeTarget) return;
    try {
      await securityRequest(`/api/sessions/${revokeTarget.id}`, { method: 'DELETE' });
      onShowToast('success', 'Session Revoked', `Session ${revokeTarget.id} invalidated.`);
      const revokedSelf = revokeTarget.isCurrent;
      setRevokeTarget(null);
      if (revokedSelf) {
        onCurrentSessionRevoked();
      } else {
        loadSessions();
      }
    } catch (err) {
      onShowToast('error', 'Revoke Failed', err instanceof Error ? err.message : undefined);
      setRevokeTarget(null);
    }
  };

  const columns: TableColumn<SessionItem>[] = [
    {
      key: 'id',
      header: 'Session ID',
      render: (r) => (
        <div className="font-mono text-xs">
          <span className="font-medium text-neutral-950 dark:text-white">{r.id}</span>
          {r.isCurrent && (
            <span className="ml-2 text-blue-800 dark:text-blue-400 font-semibold">(Current)</span>
          )}
        </div>
      ),
    },
    {
      key: 'userId',
      header: 'User ID',
      render: (r) => (
        <span className="font-mono text-xs">
          {r.userId} · {r.role}
        </span>
      ),
    },
    {
      key: 'ip',
      header: 'IP & Device',
      render: (r) => (
        <div className="text-xs">
          <div className="font-mono text-neutral-800 dark:text-neutral-200">{r.ipAddress}</div>
          <div className="text-neutral-500 dark:text-neutral-400 truncate max-w-[200px]">{r.deviceInfo}</div>
        </div>
      ),
    },
    {
      key: 'expires',
      header: 'Expires At (UTC)',
      className: 'hidden sm:table-cell',
      render: (r) => (
        <span className="font-mono text-xs text-neutral-500 dark:text-neutral-400">
          {r.expiresAt.slice(0, 19).replace('T', ' ')}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <StatusText status={r.status} />,
    },
    {
      key: 'actions',
      header: 'Action',
      align: 'right',
      render: (r) =>
        r.status === 'ACTIVE' ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRevokeTarget(r)}
            icon={<Trash2 className="h-3.5 w-3.5 text-red-600" />}
          >
            Revoke
          </Button>
        ) : (
          <span className="text-xs text-neutral-400">Closed</span>
        ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-neutral-950 dark:text-white">Session Management</h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            HttpOnly cookie sessions · 60-minute inactivity timeout · Revoking immediately blocks API access
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadSessions}
          icon={<RefreshCw className="h-3.5 w-3.5" />}
        >
          Refresh
        </Button>
      </div>

      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
        <DataTable
          columns={columns}
          data={sessions}
          rowKey={(s) => s.id}
          loading={loading}
        />
      </div>

      <ConfirmDialog
        isOpen={Boolean(revokeTarget)}
        onClose={() => setRevokeTarget(null)}
        onConfirm={handleConfirmRevoke}
        title="Revoke Active Session?"
        description={`Invalidating session ${revokeTarget?.id ?? ''} will immediately terminate access for ${revokeTarget?.userId ?? ''}.`}
        confirmLabel="Revoke Session"
        variant="danger"
      />
    </div>
  );
};
