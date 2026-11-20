import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, RotateCcw, ShieldAlert, Trash2 } from 'lucide-react';
import { UserProfile } from '../../modules/types';
import { DeletedRecordEntry, phase08Api } from '../../services/phase08Api';
import { Button } from '../../components/Button';
import { DataTable, TableColumn } from '../../components/DataTable';
import { StatusText } from '../../components/StatusText';

interface DataRecoveryPageProps {
  currentUser: UserProfile;
  onShowToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}

export const DataRecoveryPage: React.FC<DataRecoveryPageProps> = ({
  currentUser,
  onShowToast,
}) => {
  const [records, setRecords] = useState<DeletedRecordEntry[]>([]);
  const [logs, setLogs] = useState<
    Array<{ id: number; deletionCode: string; action: string; actorUserId: string; reason: string; createdAt: string }>
  >([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await phase08Api.getDeletedRecords();
      setRecords(res.data.deletedRecords);
      setLogs(res.data.recoveryLogs);
    } catch (err) {
      onShowToast('error', 'Failed to load Data Recovery Archive', err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [onShowToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRecover = async (item: DeletedRecordEntry) => {
    try {
      await phase08Api.recoverRecord(item.deletionCode, `Restored via Data Recovery Center by ${currentUser.userId}`);
      onShowToast('success', 'Record Recovered', `${item.displayLabel} restored to active records.`);
      loadData();
    } catch (err) {
      onShowToast('error', 'Recovery failed', err instanceof Error ? err.message : undefined);
    }
  };

  const handleRequestPermDelete = async (item: DeletedRecordEntry) => {
    try {
      await phase08Api.requestPermanentDelete(item.deletionCode, 'Approved archive cleanup request');
      onShowToast('info', 'Permanent Delete Queued', 'Awaiting Admin review and approval.');
      loadData();
    } catch (err) {
      onShowToast('error', 'Request Blocked', err instanceof Error ? err.message : undefined);
    }
  };

  const handleReviewPermDelete = async (item: DeletedRecordEntry, approve: boolean) => {
    try {
      await phase08Api.reviewPermanentDelete(
        item.deletionCode,
        approve,
        approve ? 'Admin approved permanent removal' : 'Admin rejected permanent removal'
      );
      onShowToast(
        approve ? 'info' : 'success',
        approve ? 'Permanently Purged' : 'Purge Rejected',
        item.displayLabel
      );
      loadData();
    } catch (err) {
      onShowToast('error', 'Review Blocked', err instanceof Error ? err.message : undefined);
    }
  };

  const cols: TableColumn<DeletedRecordEntry>[] = [
    {
      key: 'deletionCode',
      header: 'Deletion Code & Entity',
      render: (r) => (
        <div>
          <div className="font-mono text-xs font-semibold text-neutral-950 dark:text-white">{r.deletionCode}</div>
          <div className="text-[11px] font-mono text-neutral-500">{r.entityType} · {r.entityId}</div>
        </div>
      ),
    },
    {
      key: 'displayLabel',
      header: 'Record Label & Reason',
      render: (r) => (
        <div className="text-xs">
          <div className="font-medium text-neutral-900 dark:text-neutral-100">{r.displayLabel}</div>
          <div className="text-[11px] text-neutral-500">{r.deletionReason}</div>
        </div>
      ),
    },
    {
      key: 'deletedBy',
      header: 'Deleted By',
      render: (r) => (
        <div className="text-xs font-mono">
          <div>{r.deletedBy}</div>
          <div className="text-[11px] text-neutral-500">{r.deletedAt.slice(0, 19).replace('T', ' ')}</div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Recovery Status',
      render: (r) => <StatusText status={r.recoveryStatus} />,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1.5">
          {(r.recoveryStatus === 'SOFT_DELETED' || r.recoveryStatus === 'PENDING_PERMANENT_DELETE') &&
            (currentUser.role === 'ADMIN' || currentUser.role === 'MANAGER') && (
              <Button variant="outline" size="sm" onClick={() => handleRecover(r)} icon={<RotateCcw className="h-3.5 w-3.5 text-emerald-600" />}>
                Recover
              </Button>
            )}
          {r.recoveryStatus === 'SOFT_DELETED' &&
            (currentUser.role === 'ADMIN' || currentUser.role === 'MANAGER') && (
              <Button variant="outline" size="sm" onClick={() => handleRequestPermDelete(r)} icon={<Trash2 className="h-3.5 w-3.5 text-red-600" />}>
                Request Purge
              </Button>
            )}
          {r.recoveryStatus === 'PENDING_PERMANENT_DELETE' && currentUser.role === 'ADMIN' && (
            <>
              <Button variant="outline" size="sm" onClick={() => handleReviewPermDelete(r, false)}>
                Reject
              </Button>
              <Button variant="danger" size="sm" onClick={() => handleReviewPermDelete(r, true)}>
                Approve Purge
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-neutral-950 dark:text-white">
            Data Recovery &amp; Soft Delete Archive
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Recover soft-deleted Customers, Services, Applications, Documents &amp; Templates · Admin approval required for permanent deletion · Financial ledgers cannot be silently purged
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadData} icon={<RefreshCw className="h-3.5 w-3.5" />}>
          Refresh Archive
        </Button>
      </div>

      <div className="p-3.5 bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg flex items-start gap-2.5 text-xs text-neutral-700 dark:text-neutral-300">
        <ShieldAlert className="h-4 w-4 text-blue-800 dark:text-blue-400 shrink-0 mt-0.5" />
        <div>
          <strong>Statutory Financial Guard:</strong> Customer records with linked applications or confirmed payments, and posted double-entry vouchers, are blocked from permanent purge to preserve accounting integrity.
        </div>
      </div>

      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
        <DataTable columns={cols} data={records} rowKey={(r) => r.deletionCode} loading={loading} />
      </div>

      {logs.length > 0 && (
        <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5">
          <h3 className="text-sm font-semibold text-neutral-950 dark:text-white mb-3">
            Recovery &amp; Purge Approval Audit History
          </h3>
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800 text-xs font-mono">
            {logs.map((l) => (
              <div key={l.id} className="py-2 flex items-center justify-between gap-4">
                <div>
                  <span className="font-semibold text-neutral-950 dark:text-white">{l.actorUserId}</span>{' '}
                  performed <span>{l.action}</span> on <span>{l.deletionCode}</span> — {l.reason}
                </div>
                <span className="text-neutral-500 shrink-0">{l.createdAt.slice(0, 19).replace('T', ' ')}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
