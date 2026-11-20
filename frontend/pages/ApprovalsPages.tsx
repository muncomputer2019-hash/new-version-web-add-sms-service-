import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, MessageSquareWarning, XCircle, Eye, Layers } from 'lucide-react';
import {
  RegistrationRequestItem,
  ServicePermissionsOverviewPayload,
  UserProfile,
} from '../modules/types';
import { securityRequest } from '../services/securityApi';
import { DataTable, TableColumn } from '../components/DataTable';
import { StatusText } from '../components/StatusText';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';

interface ApprovalsPageProps {
  mode: 'requests' | 'approvals';
  currentUser: UserProfile;
  onShowToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}

export const ApprovalsManagementPage: React.FC<ApprovalsPageProps> = ({
  mode,
  currentUser,
  onShowToast,
}) => {
  const [requests, setRequests] = useState<RegistrationRequestItem[]>([]);
  const [svcOverview, setSvcOverview] = useState<ServicePermissionsOverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<RegistrationRequestItem | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [processing, setProcessing] = useState(false);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const [regRes, svcRes] = await Promise.all([
        securityRequest<RegistrationRequestItem[]>('/api/registration-requests'),
        securityRequest<ServicePermissionsOverviewPayload>('/api/service-permissions/overview').catch(
          () => ({ data: null as ServicePermissionsOverviewPayload | null })
        ),
      ]);
      setRequests(regRes.data);
      setSvcOverview(svcRes.data);
    } catch (err) {
      onShowToast('error', 'Failed to load requests', err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [onShowToast]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const handleApprove = async (reqItem: RegistrationRequestItem) => {
    setProcessing(true);
    try {
      const res = await securityRequest<{ issuedUserId: string }>(
        `/api/registration-requests/${reqItem.requestId}/approve`,
        {
          method: 'POST',
          body: JSON.stringify({ notes: reviewNotes || 'Approved and activated.' }),
        }
      );
      onShowToast(
        'success',
        'Registration Approved',
        `Issued permanent User ID ${res.data.issuedUserId} and logged to Audit Trail.`
      );
      setSelected(null);
      setReviewNotes('');
      loadRequests();
    } catch (err) {
      onShowToast('error', 'Approval Failed', err instanceof Error ? err.message : undefined);
    } finally {
      setProcessing(false);
    }
  };

  const handleRejectOrCorrection = async (
    reqItem: RegistrationRequestItem,
    correction: boolean
  ) => {
    if (!reviewNotes.trim()) {
      onShowToast('error', 'Reason Required', 'Enter review notes before rejecting or requesting correction.');
      return;
    }
    setProcessing(true);
    try {
      await securityRequest(`/api/registration-requests/${reqItem.requestId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ notes: reviewNotes.trim(), correction }),
      });
      onShowToast(
        'info',
        correction ? 'Correction Requested' : 'Registration Rejected',
        `${reqItem.requestId} updated and recorded in Audit Log.`
      );
      setSelected(null);
      setReviewNotes('');
      loadRequests();
    } catch (err) {
      onShowToast('error', 'Action Failed', err instanceof Error ? err.message : undefined);
    } finally {
      setProcessing(false);
    }
  };

  const handleDecideServiceRequest = async (requestCode: string, decision: 'APPROVE' | 'REJECT') => {
    try {
      await securityRequest(`/api/service-permissions/staff-requests/${requestCode}/decide`, {
        method: 'POST',
        body: JSON.stringify({
          decision,
          notes: decision === 'APPROVE' ? 'Approved by Admin' : 'Rejected by Admin',
        }),
      });
      onShowToast(
        decision === 'APPROVE' ? 'success' : 'info',
        `Service Request ${decision === 'APPROVE' ? 'Approved' : 'Rejected'}`,
        `${requestCode} processed and recorded in immutable approval logs.`
      );
      loadRequests();
    } catch (err) {
      onShowToast('error', 'Decision Failed', err instanceof Error ? err.message : undefined);
    }
  };

  const columns: TableColumn<RegistrationRequestItem>[] = [
    {
      key: 'requestId',
      header: 'Request ID',
      render: (r) => <span className="font-mono text-xs font-semibold">{r.requestId}</span>,
    },
    {
      key: 'applicantName',
      header: 'Applicant Name',
      render: (r) => (
        <div>
          <div className="font-medium text-neutral-950 dark:text-white">{r.applicantName}</div>
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            Submitted by {r.submittedBy} · {r.departmentCode || 'DEPT-CSC'}
          </div>
        </div>
      ),
    },
    {
      key: 'requestedRole',
      header: 'Requested Role',
      render: (r) => <span className="text-xs font-semibold">{r.requestedRole}</span>,
    },
    {
      key: 'mobile',
      header: 'Mobile Number',
      render: (r) => <span className="font-mono text-xs">{r.mobile}</span>,
    },
    {
      key: 'createdAt',
      header: 'Submission Date',
      className: 'hidden md:table-cell',
      render: (r) => (
        <span className="font-mono text-xs text-neutral-500">
          {r.createdAt.slice(0, 10)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Current Status',
      render: (r) => <StatusText status={r.status} />,
    },
    {
      key: 'reviewedBy',
      header: 'Reviewed By',
      className: 'hidden lg:table-cell',
      render: (r) => (
        <span className="font-mono text-xs text-neutral-600">{r.reviewedBy ?? '—'}</span>
      ),
    },
    {
      key: 'approvalDate',
      header: 'Approval Date',
      className: 'hidden lg:table-cell',
      render: (r) => (
        <span className="font-mono text-xs text-neutral-500">
          {r.approvalDate ? r.approvalDate.slice(0, 10) : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (r) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setSelected(r);
            setReviewNotes(r.reviewNotes ?? '');
          }}
          icon={<Eye className="h-3.5 w-3.5" />}
        >
          View Details
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-neutral-950 dark:text-white">
          {mode === 'approvals' ? 'Approval Management' : 'Onboarding Requests'}
        </h2>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
          Staff onboarding &amp; Manager → Staff service permission approvals (Admin final authority; self-approval blocked)
        </p>
      </div>

      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
        <DataTable
          columns={columns}
          data={requests}
          rowKey={(r) => r.requestId}
          loading={loading}
        />
      </div>

      {svcOverview && (
        <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-blue-800 dark:text-blue-400" />
            <div>
              <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
                Manager → Staff Service Permission Requests ({svcOverview.staffRequests.length})
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Only ADMIN may approve or reject Staff service access requested by Managers.
              </p>
            </div>
          </div>

          <div className="divide-y divide-neutral-100 dark:divide-neutral-800 text-xs">
            {svcOverview.staffRequests.length === 0 && (
              <div className="py-4 text-neutral-500">No Staff service permission requests recorded.</div>
            )}
            {svcOverview.staffRequests.map((sr) => (
              <div key={sr.requestCode} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="font-mono font-semibold text-neutral-950 dark:text-white">
                    {sr.requestCode} · Staff: {sr.staffUserId} · Requested by {sr.managerUserId}
                  </div>
                  <div className="text-neutral-600 dark:text-neutral-300 mt-0.5">
                    {sr.serviceId} — {sr.serviceName} ({sr.requestedPermissions.join(', ')})
                  </div>
                  {sr.reason && <div className="text-[11px] text-neutral-500">{sr.reason}</div>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusText status={sr.status} />
                  {currentUser.role === 'ADMIN' && sr.status === 'PENDING_ADMIN_APPROVAL' && (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleDecideServiceRequest(sr.requestCode, 'APPROVE')}
                        icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDecideServiceRequest(sr.requestCode, 'REJECT')}
                        icon={<XCircle className="h-3.5 w-3.5" />}
                      >
                        Reject
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          {svcOverview.approvalLogs.length > 0 && (
            <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800">
              <div className="text-xs font-semibold text-neutral-900 dark:text-white mb-2">
                Recent Service Permission Approval Logs
              </div>
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800 text-[11px] max-h-48 overflow-y-auto">
                {svcOverview.approvalLogs.slice(0, 10).map((log) => (
                  <div key={log.logCode} className="py-1.5 flex items-center justify-between gap-2">
                    <span className="text-neutral-700 dark:text-neutral-300">
                      <span className="font-mono font-semibold">{log.actorUserId}</span> · {log.details}
                    </span>
                    <span className="font-mono text-neutral-400 shrink-0">
                      {log.createdAt.slice(0, 19).replace('T', ' ')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      <Modal
        isOpen={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected ? `${selected.requestId} — ${selected.applicantName}` : ''}
        subtitle="Review applicant details and record approval decision"
        size="md"
        footer={
          selected &&
          (selected.status === 'PENDING' || selected.status === 'CORRECTION_REQUIRED') ? (
            <div className="flex flex-wrap items-center justify-between w-full gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  loading={processing}
                  onClick={() => handleApprove(selected)}
                  icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                >
                  Approve
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  loading={processing}
                  onClick={() => handleRejectOrCorrection(selected, true)}
                  icon={<MessageSquareWarning className="h-3.5 w-3.5" />}
                >
                  Request Correction
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  loading={processing}
                  onClick={() => handleRejectOrCorrection(selected, false)}
                  icon={<XCircle className="h-3.5 w-3.5" />}
                >
                  Reject
                </Button>
              </div>
              <Button variant="outline" size="sm" onClick={() => setSelected(null)}>
                Close
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setSelected(null)}>
              Close
            </Button>
          )
        }
      >
        {selected && (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <dt className="text-neutral-500 dark:text-neutral-400">Requested Role</dt>
                <dd className="font-semibold text-neutral-950 dark:text-white mt-0.5">{selected.requestedRole}</dd>
              </div>
              <div>
                <dt className="text-neutral-500 dark:text-neutral-400">Current Status</dt>
                <dd className="mt-0.5">
                  <StatusText status={selected.status} />
                </dd>
              </div>
              <div>
                <dt className="text-neutral-500 dark:text-neutral-400">Mobile (OTP Verified)</dt>
                <dd className="font-mono text-neutral-900 dark:text-neutral-100 mt-0.5">
                  {selected.mobile} · {selected.mobileVerified ? 'Verified' : 'Unverified'}
                </dd>
              </div>
              <div>
                <dt className="text-neutral-500 dark:text-neutral-400">Issued User ID</dt>
                <dd className="font-mono font-semibold text-blue-900 dark:text-blue-400 mt-0.5">
                  {selected.issuedUserId ?? 'Pending Approval'}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-neutral-500 dark:text-neutral-400">Address</dt>
                <dd className="text-neutral-900 dark:text-neutral-100 mt-0.5">{selected.address}</dd>
              </div>
            </dl>

            <div>
              <label className="block text-xs font-medium text-neutral-800 dark:text-neutral-200 mb-1.5">
                Reviewer Notes (Required for Reject / Request Correction)
              </label>
              <textarea
                rows={3}
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Enter verification remarks..."
                className="w-full px-3 py-2 text-xs bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded-md focus:outline-none focus:border-blue-800"
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
