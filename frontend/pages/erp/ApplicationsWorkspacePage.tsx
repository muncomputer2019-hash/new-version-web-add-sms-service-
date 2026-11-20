import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Search, Settings2, UserCheck } from 'lucide-react';
import {
  ErpApplicationItem,
  ErpApplicationStatus,
  ReferenceFieldDefItem,
  UserProfile,
} from '../../modules/types';
import { erpApi } from '../../services/erpApi';
import { Button } from '../../components/Button';
import { DataTable, TableColumn } from '../../components/DataTable';
import { formatCurrency, paginateArray } from '../../services/apiClient';
import { formatDateIST } from '../../services/formatters';
import { ApplicationCreateWizard } from './ApplicationCreateWizard';
import { ApplicationProfileView } from './ApplicationProfileView';

interface ApplicationsWorkspacePageProps {
  currentUser: UserProfile;
  initialScope?: string;
  initialCustomerId?: string | null;
  initialServiceId?: string | null;
  initialSelectedAppNo?: string | null;
  startWizardOnOpen?: boolean;
  onConsumeWizardLaunch?: () => void;
  onShowToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}

const ALL_STATUSES: ErpApplicationStatus[] = [
  'Draft',
  'Submitted',
  'Under Review',
  'Processing',
  'Pending Customer',
  'Pending Office',
  'Approved',
  'Rejected',
  'Completed',
  'Cancelled',
  'On Hold',
  'Reopened',
];

export const ApplicationsWorkspacePage: React.FC<ApplicationsWorkspacePageProps> = ({
  currentUser,
  initialScope = 'all',
  initialCustomerId = null,
  initialServiceId = null,
  initialSelectedAppNo = null,
  startWizardOnOpen = false,
  onConsumeWizardLaunch,
  onShowToast,
}) => {
  const [scope, setScope] = useState<'all' | 'mine' | 'unassigned' | 'pending_docs' | 'overdue' | 'reassignments' | 'ref_config'>(
    (initialScope as 'all') || 'all'
  );
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  const [applications, setApplications] = useState<ErpApplicationItem[]>([]);
  const [reassignments, setReassignments] = useState<ErpApplicationItem['reassignments']>([]);
  const [refFields, setRefFields] = useState<ReferenceFieldDefItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [wizardOpen, setWizardOpen] = useState(startWizardOnOpen);
  const [selectedAppNo, setSelectedAppNo] = useState<string | null>(null);

  // Admin custom reference field creation
  const [newRefForm, setNewRefForm] = useState({
    fieldKey: '',
    label: '',
    uniqueScope: 'NONE' as 'NONE' | 'GLOBAL' | 'PER_SERVICE',
  });

  useEffect(() => {
    if (startWizardOnOpen) {
      setWizardOpen(true);
      onConsumeWizardLaunch?.();
    }
  }, [startWizardOnOpen, onConsumeWizardLaunch]);

  useEffect(() => {
    if (initialSelectedAppNo) {
      setSelectedAppNo(initialSelectedAppNo);
      onConsumeWizardLaunch?.();
    }
  }, [initialSelectedAppNo, onConsumeWizardLaunch]);

  useEffect(() => {
    if (initialScope && ['all', 'mine', 'unassigned', 'pending_docs', 'overdue'].includes(initialScope)) {
      setScope(initialScope as typeof scope);
    }
  }, [initialScope]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const apiScope = ['all', 'mine', 'unassigned', 'pending_docs', 'overdue'].includes(scope)
        ? scope
        : 'all';
      const [appsRes, reassRes, refRes] = await Promise.all([
        erpApi.listApplications({
          q: query || undefined,
          status: statusFilter || undefined,
          scope: apiScope,
        }),
        erpApi.listReassignmentRequests(),
        erpApi.listReferenceFields(),
      ]);
      setApplications(appsRes.data);
      setReassignments(reassRes.data);
      setRefFields(refRes.data);
    } catch (err) {
      onShowToast('error', 'Failed to load Applications', err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [scope, query, statusFilter, onShowToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const paginated = useMemo(() => paginateArray(applications, page, 8), [applications, page]);

  if (wizardOpen) {
    return (
      <ApplicationCreateWizard
        currentUser={currentUser}
        initialCustomerId={initialCustomerId}
        initialServiceId={initialServiceId}
        onCancel={() => setWizardOpen(false)}
        onCreated={(app) => {
          setWizardOpen(false);
          setSelectedAppNo(app.applicationNo);
          loadData();
        }}
        onShowToast={onShowToast}
      />
    );
  }

  const columns: TableColumn<ErpApplicationItem>[] = [
    {
      key: 'applicationNo',
      header: 'Application ID',
      render: (r) => (
        <div>
          <div className="font-mono text-xs font-semibold text-neutral-950 dark:text-white">
            {r.applicationNo}
          </div>
          <div className="font-mono text-[11px] text-neutral-500">
            SLA: {r.slaStatus.label}
          </div>
        </div>
      ),
    },
    {
      key: 'customer',
      header: 'Customer & Service',
      render: (r) => (
        <div>
          <div className="font-medium text-neutral-950 dark:text-white">
            {r.customerSnapshot.fullName} ({r.customerId})
          </div>
          <div className="text-xs text-neutral-500">
            {r.serviceSnapshot.name} · v{r.serviceSnapshot.appliedFormVersion}
          </div>
        </div>
      ),
    },
    {
      key: 'assigned',
      header: 'Staff / Counter',
      render: (r) => (
        <div className="text-xs">
          <div className="font-mono">{r.assignedStaffId || 'Unassigned'}</div>
          <div className="text-neutral-500">{r.assignedCounterCode || '-'}</div>
        </div>
      ),
    },
    {
      key: 'checklist',
      header: 'Docs & Refs',
      render: (r) => (
        <div className="text-xs font-mono">
          <div>
            Docs: {r.checklistSummary.verifiedDocuments}V / {r.checklistSummary.uploadedDocuments}U / {r.checklistSummary.missingCount}M
          </div>
          {r.references.length > 0 && (
            <div className="text-[11px] text-neutral-500">
              {r.references[0].label}: {r.references[0].value}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status & Due',
      render: (r) => (
        <div className="text-xs">
          <div className="font-semibold">{r.status}</div>
          <div className="font-mono text-neutral-500">{formatDateIST(r.expectedCompletionDate)}</div>
        </div>
      ),
    },
    {
      key: 'finance',
      header: 'Paid / Fee',
      align: 'right',
      render: (r) => (
        <div className="text-right font-mono text-xs tabular-nums">
          <div className="font-semibold">{formatCurrency(r.financialSummary.netCollected)}</div>
          <div className="text-neutral-500">of {formatCurrency(r.financialSummary.serviceCharge)}</div>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-neutral-950 dark:text-white">
            Applications Management Hub
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Dual creation workflows, 12-status tracking, document verification, dynamic reference numbers &amp; handover
          </p>
        </div>

        <Button
          size="sm"
          variant="primary"
          onClick={() => setWizardOpen(true)}
          icon={<Plus className="h-3.5 w-3.5" />}
        >
          New Application
        </Button>
      </div>

      {/* Sub-Module Navigation Tabs */}
      <div className="flex flex-wrap gap-1.5 text-xs">
        {(
          [
            ['all', 'All Applications'],
            ['mine', 'My Applications'],
            ['unassigned', 'Unassigned Queue'],
            ['pending_docs', 'Document Verification'],
            ['overdue', 'Overdue SLA'],
            ['reassignments', `Reassignments (${reassignments.filter((r) => r.status === 'Pending').length})`],
            ...(currentUser.role === 'ADMIN' ? [['ref_config', 'Reference Fields Config'] as const] : []),
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setScope(key);
              setPage(1);
            }}
            className={`px-3 py-1.5 rounded border font-medium cursor-pointer ${
              scope === key
                ? 'bg-neutral-950 text-white border-neutral-950 dark:bg-white dark:text-neutral-950'
                : 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {scope === 'reassignments' ? (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg divide-y divide-neutral-100 dark:divide-neutral-800 text-xs">
          {reassignments.length === 0 ? (
            <div className="p-6 text-neutral-500">No reassignment requests recorded.</div>
          ) : (
            reassignments.map((r) => (
              <div key={r.requestCode} className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-mono font-bold">{r.requestCode} · {r.applicationNo}</div>
                  <div>
                    Requested by {r.requestedBy} → Proposed: {r.proposedStaffId || 'Queue'} ({r.proposedCounterCode || '-'})
                  </div>
                  <div className="text-neutral-500">Reason: {r.reason} · Status: {r.status}</div>
                </div>
                {r.status === 'Pending' && (currentUser.role === 'ADMIN' || currentUser.role === 'MANAGER') && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="primary"
                      icon={<UserCheck className="h-3.5 w-3.5" />}
                      onClick={async () => {
                        await erpApi.reviewReassignment(r.requestCode, 'Approved', 'Approved by supervisor');
                        onShowToast('success', 'Reassignment Approved', r.requestCode);
                        loadData();
                      }}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        await erpApi.reviewReassignment(r.requestCode, 'Rejected', 'Rejected by supervisor');
                        loadData();
                      }}
                    >
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      ) : scope === 'ref_config' && currentUser.role === 'ADMIN' ? (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 space-y-4 text-xs">
          <div className="font-semibold text-sm flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            Dynamic Reference Number Configuration (7 Defaults + Admin Custom Fields)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
            <input
              value={newRefForm.fieldKey}
              onChange={(e) => setNewRefForm({ ...newRefForm, fieldKey: e.target.value })}
              placeholder="Field key (e.g. portal_arn)"
              className="h-9 px-3 border rounded font-mono bg-white dark:bg-neutral-950"
            />
            <input
              value={newRefForm.label}
              onChange={(e) => setNewRefForm({ ...newRefForm, label: e.target.value })}
              placeholder="Display Label (e.g. Portal ARN)"
              className="h-9 px-3 border rounded bg-white dark:bg-neutral-950"
            />
            <select
              value={newRefForm.uniqueScope}
              onChange={(e) => setNewRefForm({ ...newRefForm, uniqueScope: e.target.value as typeof newRefForm.uniqueScope })}
              className="h-9 px-2 border rounded bg-white dark:bg-neutral-950"
            >
              <option value="NONE">Uniqueness: None</option>
              <option value="PER_SERVICE">Uniqueness: Per Service</option>
              <option value="GLOBAL">Uniqueness: Global</option>
            </select>
            <Button
              size="sm"
              variant="primary"
              onClick={async () => {
                await erpApi.createReferenceField(newRefForm);
                setNewRefForm({ fieldKey: '', label: '', uniqueScope: 'NONE' });
                loadData();
              }}
            >
              Add Custom Field
            </Button>
          </div>
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800 border rounded">
            {refFields.map((rf) => (
              <div key={rf.id} className="p-3 flex items-center justify-between">
                <div>
                  <span className="font-semibold">{rf.label}</span>
                  <span className="ml-2 font-mono text-neutral-500">({rf.fieldKey} · Scope: {rf.uniqueScope})</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await erpApi.updateReferenceField(rf.id, { enabled: !rf.enabled });
                    loadData();
                  }}
                >
                  {rf.enabled ? 'Enabled (Disable)' : 'Disabled (Enable)'}
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search className="h-3.5 w-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search MCA ID, Customer, Mobile, Village, Reference #..."
                className="w-full h-9 pl-8 pr-3 text-xs bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded-md"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="h-9 px-2.5 text-xs bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded-md"
            >
              <option value="">All 12 Statuses</option>
              {ALL_STATUSES.map((st) => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          </div>

          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
            <DataTable
              columns={columns}
              data={paginated.items}
              rowKey={(r) => r.applicationNo}
              loading={loading}
              pagination={paginated.pagination}
              onPageChange={setPage}
              onRowClick={(r) => setSelectedAppNo(r.applicationNo)}
            />
          </div>
        </>
      )}

      {selectedAppNo && (
        <ApplicationProfileView
          applicationNo={selectedAppNo}
          currentUser={currentUser}
          onClose={() => setSelectedAppNo(null)}
          onUpdated={loadData}
          onShowToast={onShowToast}
        />
      )}
    </div>
  );
};
