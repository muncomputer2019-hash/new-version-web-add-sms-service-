import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  CreditCard,
  Download,
  FileCheck2,
  Printer,
  Send,
  Truck,
  Upload,
  UserCheck,
  XCircle,
} from 'lucide-react';
import {
  ErpApplicationItem,
  ErpApplicationStatus,
  ReferenceFieldDefItem,
  UserProfile,
} from '../../modules/types';
import { erpApi, readFileAsBase64 } from '../../services/erpApi';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { formatCurrency } from '../../services/apiClient';
import { formatDateIST } from '../../services/formatters';

interface ApplicationProfileViewProps {
  applicationNo: string;
  currentUser: UserProfile;
  onClose: () => void;
  onUpdated: () => void;
  onShowToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}

const ALLOWED_TRANSITIONS: Record<ErpApplicationStatus, ErpApplicationStatus[]> = {
  Draft: ['Submitted', 'Cancelled'],
  Submitted: ['Under Review', 'Processing', 'Pending Customer', 'On Hold', 'Cancelled', 'Rejected'],
  'Under Review': ['Processing', 'Pending Customer', 'Pending Office', 'Approved', 'Rejected', 'On Hold', 'Cancelled'],
  Processing: ['Pending Customer', 'Pending Office', 'Approved', 'Completed', 'Rejected', 'On Hold', 'Cancelled'],
  'Pending Customer': ['Under Review', 'Processing', 'On Hold', 'Cancelled', 'Rejected'],
  'Pending Office': ['Under Review', 'Processing', 'Approved', 'Rejected', 'Completed', 'On Hold', 'Cancelled'],
  Approved: ['Processing', 'Completed', 'Cancelled', 'On Hold'],
  Rejected: ['Reopened'],
  Completed: ['Reopened'],
  Cancelled: ['Reopened'],
  'On Hold': ['Under Review', 'Processing', 'Pending Customer', 'Pending Office', 'Cancelled', 'Rejected'],
  Reopened: ['Under Review', 'Processing', 'Pending Customer', 'Pending Office', 'Approved', 'Completed', 'Cancelled'],
};

export const ApplicationProfileView: React.FC<ApplicationProfileViewProps> = ({
  applicationNo,
  currentUser,
  onClose,
  onUpdated,
  onShowToast,
}) => {
  const [app, setApp] = useState<ErpApplicationItem | null>(null);
  const [refFields, setRefFields] = useState<ReferenceFieldDefItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'docs' | 'refs' | 'notes' | 'finance' | 'delivery' | 'print'>('overview');

  // Action states
  const [nextStatus, setNextStatus] = useState<string>('');
  const [statusReason, setStatusReason] = useState('');
  const [assignStaffId, setAssignStaffId] = useState('');
  const [assignCounterCode, setAssignCounterCode] = useState('CTR-01');
  const [reassignReason, setReassignReason] = useState('');

  // Reference entry
  const [refKey, setRefKey] = useState('');
  const [refVal, setRefVal] = useState('');
  const [refReason, setRefReason] = useState('');

  // Notes & Followups
  const [noteType, setNoteType] = useState<'INTERNAL' | 'CUSTOMER_REMARK'>('CUSTOMER_REMARK');
  const [noteContent, setNoteContent] = useState('');
  const [fuDate, setFuDate] = useState('');
  const [fuReason, setFuReason] = useState('');

  // Payment & Refund
  const [payAmount, setPayAmount] = useState(0);
  const [payMethod, setPayMethod] = useState<'Cash' | 'UPI' | 'Card'>('Cash');
  const [payUpiRef, setPayUpiRef] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [refundAmount, setRefundAmount] = useState(0);
  const [refundTxnId, setRefundTxnId] = useState('');

  // Delivery & Cancellation
  const [deliverableType, setDeliverableType] = useState('Original Document / Printout');
  const [deliveryMethod, setDeliveryMethod] = useState('Physical Handover');
  const [receivedBy, setReceivedBy] = useState('');
  const [handoverConfirmed, setHandoverConfirmed] = useState(true);
  const [cancelReason, setCancelReason] = useState('');

  // Notification test
  const [notifChannel, setNotifChannel] = useState<'DASHBOARD' | 'SMS' | 'WHATSAPP' | 'EMAIL_SMTP'>('SMS');

  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      const [detRes, refRes] = await Promise.all([
        erpApi.getApplicationDetail(applicationNo),
        erpApi.listReferenceFields(),
      ]);
      setApp(detRes.data.application);
      setRefFields(refRes.data);
      const nextOpts = ALLOWED_TRANSITIONS[detRes.data.application.status] ?? [];
      setNextStatus(nextOpts[0] ?? '');
      setPayAmount(detRes.data.application.financialSummary.balanceDue || 0);
      setReceivedBy(detRes.data.application.customerSnapshot.fullName);
      if (detRes.data.application.payments.length > 0) {
        setRefundTxnId(detRes.data.application.payments[0].transactionId);
        setRefundAmount(detRes.data.application.payments[0].amount);
      }
      if (refRes.data.length > 0 && !refKey) {
        setRefKey(refRes.data[0].fieldKey);
      }
    } catch (err) {
      onShowToast('error', 'Failed to inspect Application', err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [applicationNo, onShowToast, refKey]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const handleStatusTransition = async () => {
    if (!app || !nextStatus) return;
    try {
      await erpApi.transitionStatus(app.applicationNo, {
        nextStatus,
        reason: statusReason,
      });
      setStatusReason('');
      onShowToast('success', 'Workflow Updated', `${app.applicationNo} -> ${nextStatus}`);
      await loadDetail();
      onUpdated();
    } catch (err) {
      onShowToast('error', 'Transition Rejected', err instanceof Error ? err.message : undefined);
    }
  };

  const handleAssignOrReassign = async () => {
    if (!app) return;
    try {
      if (currentUser.role === 'STAFF') {
        await erpApi.requestReassignment(app.applicationNo, {
          proposedStaffId: assignStaffId || null,
          proposedCounterCode: assignCounterCode,
          reason: reassignReason,
        });
        onShowToast('success', 'Reassignment Request Sent', 'Pending Manager/Admin approval.');
      } else {
        await erpApi.assignApplication(app.applicationNo, {
          assignedStaffId: assignStaffId || null,
          assignedCounterCode: assignCounterCode,
          reason: reassignReason || 'Supervisor assignment',
        });
        onShowToast('success', 'Application Assigned');
      }
      setReassignReason('');
      await loadDetail();
      onUpdated();
    } catch (err) {
      onShowToast('error', 'Assignment Failed', err instanceof Error ? err.message : undefined);
    }
  };

  const handleDownloadPrivateDoc = async (fileUuid: string) => {
    try {
      const res = await erpApi.downloadDocument(fileUuid);
      const bytes = Uint8Array.from(atob(res.data.contentBase64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: res.data.mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.data.originalName;
      a.click();
      URL.revokeObjectURL(url);
      onShowToast('info', 'Private Download Logged', res.data.originalName);
    } catch (err) {
      onShowToast('error', 'Download Blocked', err instanceof Error ? err.message : undefined);
    }
  };

  const handleUploadDoc = async (docKey: string, category: string, file: File | null, replaceUuid?: string) => {
    if (!app || !file) return;
    try {
      const contentBase64 = await readFileAsBase64(file);
      await erpApi.uploadDocument(app.applicationNo, {
        docKey,
        category,
        originalName: file.name,
        mimeType: file.type,
        contentBase64,
        replaceFileUuid: replaceUuid,
      });
      onShowToast('success', 'Document Uploaded to Private Vault', file.name);
      await loadDetail();
      onUpdated();
    } catch (err) {
      onShowToast('error', 'Upload Rejected', err instanceof Error ? err.message : undefined);
    }
  };

  if (!app && loading) {
    return (
      <Modal isOpen={true} onClose={onClose} title={`Loading ${applicationNo}...`}>
        <div className="p-6 text-xs text-neutral-500">Fetching full 25-point application profile...</div>
      </Modal>
    );
  }
  if (!app) return null;

  const canApproveDocs = currentUser.role === 'ADMIN' || currentUser.role === 'MANAGER';
  const nextStatuses = ALLOWED_TRANSITIONS[app.status] ?? [];
  const applicableRefDefs = refFields.filter(
    (r) => r.enabled && (r.serviceId === 'ALL' || r.serviceId === app.serviceId)
  );

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={`${app.applicationNo} · ${app.serviceSnapshot.name}`}
      description={`${app.customerSnapshot.fullName} (${app.customerId}) · SLA: ${app.slaStatus.label} · Due ${formatDateIST(app.expectedCompletionDate)}`}
      maxWidthClass="max-w-6xl"
    >
      <div className="space-y-4">
        {/* Top Workflow & Quick Stats Strip */}
        <div className="bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <span className="text-neutral-500">Status: </span>
              <span className="font-bold text-neutral-950 dark:text-white">{app.status}</span>
            </div>
            <div>
              <span className="text-neutral-500">Assigned: </span>
              <span className="font-mono font-semibold">{app.assignedStaffId || 'Unassigned'}</span> ({app.assignedCounterCode || '-'})
            </div>
            <div>
              <span className="text-neutral-500">Checklist: </span>
              <span className="font-mono font-semibold">
                {app.checklistSummary.verifiedDocuments} verified / {app.checklistSummary.uploadedDocuments} uploaded / {app.checklistSummary.missingCount} missing
              </span>
            </div>
            <div>
              <span className="text-neutral-500">Payment: </span>
              <span className="font-mono font-semibold">
                {app.financialSummary.paymentStatus} ({formatCurrency(app.financialSummary.netCollected)} / {formatCurrency(app.financialSummary.serviceCharge)})
              </span>
            </div>
          </div>

          {!app.assignedStaffId && (
            <Button
              size="sm"
              variant="primary"
              onClick={async () => {
                await erpApi.assignApplication(app.applicationNo, { action: 'CLAIM' });
                onShowToast('success', 'Application Claimed');
                loadDetail();
                onUpdated();
              }}
              icon={<UserCheck className="h-3.5 w-3.5" />}
            >
              Claim Unassigned
            </Button>
          )}
        </div>

        {/* Sub-navigation Tabs */}
        <div className="flex flex-wrap gap-1.5 border-b border-neutral-200 dark:border-neutral-800 pb-2 text-xs no-print">
          {(
            [
              ['overview', 'Workflow & Form Data'],
              ['docs', `Documents (${app.documents.length})`],
              ['refs', `References (${app.references.length})`],
              ['notes', `Notes & Follow-ups (${app.notes.length + app.followUps.length})`],
              ['finance', `Payments & Refunds (${app.payments.length})`],
              ['delivery', 'Delivery & Cancel'],
              ['print', 'A4 Customer Print Preview'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`px-3 py-1.5 rounded border font-medium cursor-pointer ${
                tab === id
                  ? 'bg-neutral-950 text-white border-neutral-950 dark:bg-white dark:text-neutral-950'
                  : 'border-neutral-200 dark:border-neutral-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 text-xs">
            <div className="lg:col-span-6 space-y-4">
              {/* Status Transition Box */}
              <div className="border border-neutral-200 dark:border-neutral-800 rounded p-4 space-y-2">
                <div className="font-semibold text-sm">Transition Workflow Status</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select
                    value={nextStatus}
                    onChange={(e) => setNextStatus(e.target.value)}
                    className="h-9 px-2 border rounded bg-white dark:bg-neutral-950"
                  >
                    {nextStatuses.map((st) => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                  <input
                    value={statusReason}
                    onChange={(e) => setStatusReason(e.target.value)}
                    placeholder="Reason / Remarks (Mandatory for Hold/Reject/Cancel/Reopen)"
                    className="h-9 px-2.5 border rounded bg-white dark:bg-neutral-950"
                  />
                </div>
                <Button size="sm" variant="primary" onClick={handleStatusTransition} disabled={!nextStatus}>
                  Apply Status Transition
                </Button>
              </div>

              {/* Assignment / Reassignment Box */}
              <div className="border border-neutral-200 dark:border-neutral-800 rounded p-4 space-y-2">
                <div className="font-semibold text-sm">
                  {currentUser.role === 'STAFF' ? 'Request Reassignment (Needs Approval)' : 'Assign / Transfer Staff & Counter'}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={assignStaffId}
                    onChange={(e) => setAssignStaffId(e.target.value)}
                    placeholder="Staff User ID (e.g. MC2627110003)"
                    className="h-8 px-2 border rounded font-mono bg-white dark:bg-neutral-950"
                  />
                  <input
                    value={assignCounterCode}
                    onChange={(e) => setAssignCounterCode(e.target.value)}
                    placeholder="Counter (e.g. CTR-01)"
                    className="h-8 px-2 border rounded font-mono bg-white dark:bg-neutral-950"
                  />
                </div>
                <input
                  value={reassignReason}
                  onChange={(e) => setReassignReason(e.target.value)}
                  placeholder="Assignment / transfer reason..."
                  className="w-full h-8 px-2 border rounded bg-white dark:bg-neutral-950"
                />
                <Button size="sm" variant="outline" onClick={handleAssignOrReassign}>
                  {currentUser.role === 'STAFF' ? 'Submit Reassignment Request' : 'Update Assignment'}
                </Button>
              </div>

              {/* Submitted Form Values (Snapshot Versioned) */}
              <div className="border border-neutral-200 dark:border-neutral-800 rounded p-4 space-y-2">
                <div className="font-semibold text-sm">
                  Submitted Form Data (Form v{app.serviceSnapshot.appliedFormVersion} Snapshot)
                </div>
                <dl className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {app.serviceSnapshot.formFieldsSnapshot.map((f) => (
                    <div key={f.fieldKey} className="py-1.5 flex justify-between gap-4">
                      <dt className="text-neutral-500">{f.label}</dt>
                      <dd className="font-medium text-right">
                        {Array.isArray(app.formData[f.fieldKey])
                          ? (app.formData[f.fieldKey] as string[]).join(', ')
                          : String(app.formData[f.fieldKey] ?? '-')}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>

            {/* Right: Timeline & Consent-Gated Notification Dispatch */}
            <div className="lg:col-span-6 space-y-4">
              <div className="border border-neutral-200 dark:border-neutral-800 rounded p-4 space-y-2">
                <div className="font-semibold text-sm">Consent-Gated Notification Dispatch</div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={notifChannel}
                    onChange={(e) => setNotifChannel(e.target.value as typeof notifChannel)}
                    className="h-8 px-2 border rounded bg-white dark:bg-neutral-950"
                  >
                    <option value="DASHBOARD">Internal Dashboard Alert</option>
                    <option value="SMS">SMS Gateway (Consent + Config Gated)</option>
                    <option value="WHATSAPP">WhatsApp (Consent + Config Gated)</option>
                    <option value="EMAIL_SMTP">Email SMTP (Consent + Config Gated)</option>
                  </select>
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<Send className="h-3 w-3" />}
                    onClick={async () => {
                      const res = await erpApi.sendNotification({
                        customerId: app.customerId,
                        applicationNo: app.applicationNo,
                        channel: notifChannel,
                        eventKey: 'APPLICATION_STATUS_UPDATE',
                        consentCategory:
                          notifChannel === 'SMS'
                            ? 'SMS_CONSENT'
                            : notifChannel === 'WHATSAPP'
                              ? 'WHATSAPP_CONSENT'
                              : 'STATUS_UPDATE_CONSENT',
                        messagePreview: `Status update for ${app.applicationNo}: currently ${app.status}.`,
                      });
                      onShowToast('info', `Channel Status: ${res.data.status}`, res.data.statusReason);
                      loadDetail();
                    }}
                  >
                    Send Status Alert
                  </Button>
                </div>
                <div className="max-h-32 overflow-y-auto divide-y divide-neutral-100 dark:divide-neutral-800">
                  {app.notifications.map((n) => (
                    <div key={n.id} className="py-1.5 flex justify-between gap-2">
                      <span>[{n.channel}] {n.messagePreview}</span>
                      <span className="font-mono font-semibold shrink-0">{n.status}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border border-neutral-200 dark:border-neutral-800 rounded p-4 space-y-2">
                <div className="font-semibold text-sm">Status &amp; Activity Audit Trail</div>
                <div className="max-h-60 overflow-y-auto divide-y divide-neutral-100 dark:divide-neutral-800">
                  {app.statusHistory.map((h) => (
                    <div key={h.id} className="py-1.5">
                      <div className="font-semibold">
                        {h.previousStatus || 'INIT'} → {h.newStatus}
                      </div>
                      <div className="text-neutral-500">
                        By {h.changedBy} ({h.changedByRole}) · {h.reason}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'docs' && (
          <div className="space-y-4 text-xs">
            <div className="border border-neutral-200 dark:border-neutral-800 rounded p-4 space-y-2">
              <div className="font-semibold text-sm">Service Document Checklist &amp; Private Vault Upload</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {app.serviceSnapshot.requiredDocsSnapshot.map((rd) => (
                  <div key={rd.docKey} className="border border-neutral-200 dark:border-neutral-800 rounded p-3 flex items-center justify-between gap-2">
                    <div>
                      <div className="font-semibold">{rd.label} {rd.required ? '*' : '(Optional)'}</div>
                      <div className="text-[11px] text-neutral-500">{rd.category} · Max {rd.maxSizeMb} MB</div>
                    </div>
                    <label className="px-2.5 py-1.5 border rounded cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800 inline-flex items-center gap-1">
                      <Upload className="h-3.5 w-3.5" />
                      <span>Upload</span>
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        className="hidden"
                        onChange={(e) => handleUploadDoc(rd.docKey, rd.category, e.target.files?.[0] ?? null)}
                      />
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-neutral-200 dark:border-neutral-800 rounded divide-y divide-neutral-100 dark:divide-neutral-800">
              {app.documents.length === 0 ? (
                <div className="p-4 text-neutral-500">No documents uploaded yet.</div>
              ) : (
                app.documents.map((doc) => (
                  <div key={doc.fileUuid} className="p-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold flex items-center gap-2">
                        <FileCheck2 className="h-4 w-4" />
                        <span>{doc.originalName}</span>
                        <span className="font-mono text-[11px] text-neutral-500">v{doc.versionNo} · {(doc.fileSizeBytes / 1024).toFixed(1)} KB</span>
                      </div>
                      <div className="text-[11px] text-neutral-500">
                        Status: <span className="font-semibold">{doc.verificationStatus}</span>
                        {doc.rejectionReason ? ` · Rejection: ${doc.rejectionReason}` : ''}
                        {' · Uploaded by '}{doc.uploadedBy}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        icon={<Download className="h-3 w-3" />}
                        onClick={() => handleDownloadPrivateDoc(doc.fileUuid)}
                      >
                        Private Download
                      </Button>
                      <label className="px-2.5 h-8 inline-flex items-center border rounded cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800">
                        Replace
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          className="hidden"
                          onChange={(e) =>
                            handleUploadDoc(doc.docKey, doc.category, e.target.files?.[0] ?? null, doc.fileUuid)
                          }
                        />
                      </label>
                      {canApproveDocs && doc.verificationStatus !== 'Verified' && (
                        <>
                          <Button
                            size="sm"
                            variant="primary"
                            icon={<CheckCircle2 className="h-3 w-3" />}
                            onClick={async () => {
                              await erpApi.verifyDocument(doc.fileUuid, 'Verified', 'Verified clear scan');
                              loadDetail();
                              onUpdated();
                            }}
                          >
                            Verify
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            icon={<XCircle className="h-3 w-3" />}
                            onClick={async () => {
                              await erpApi.verifyDocument(doc.fileUuid, 'Rejected', 'Unclear or incomplete document scan');
                              loadDetail();
                              onUpdated();
                            }}
                          >
                            Reject
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {tab === 'refs' && (
          <div className="space-y-4 text-xs">
            <div className="border border-neutral-200 dark:border-neutral-800 rounded p-4 space-y-3">
              <div className="font-semibold text-sm">Add / Update Dynamic Reference Number</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <select
                  value={refKey}
                  onChange={(e) => setRefKey(e.target.value)}
                  className="h-9 px-2 border rounded bg-white dark:bg-neutral-950"
                >
                  {applicableRefDefs.map((rd) => (
                    <option key={rd.fieldKey} value={rd.fieldKey}>
                      {rd.label} ({rd.uniqueScope})
                    </option>
                  ))}
                </select>
                <input
                  value={refVal}
                  onChange={(e) => setRefVal(e.target.value)}
                  placeholder="Reference / Acknowledgement Number"
                  className="h-9 px-3 border rounded font-mono bg-white dark:bg-neutral-950"
                />
                <input
                  value={refReason}
                  onChange={(e) => setRefReason(e.target.value)}
                  placeholder="Update reason (optional)"
                  className="h-9 px-3 border rounded bg-white dark:bg-neutral-950"
                />
              </div>
              <Button
                size="sm"
                variant="primary"
                onClick={async () => {
                  try {
                    await erpApi.upsertReference(app.applicationNo, {
                      fieldKey: refKey,
                      value: refVal,
                      reason: refReason,
                    });
                    setRefVal('');
                    setRefReason('');
                    onShowToast('success', 'Reference Number Saved');
                    loadDetail();
                    onUpdated();
                  } catch (err) {
                    onShowToast('error', 'Reference Rejected', err instanceof Error ? err.message : undefined);
                  }
                }}
              >
                Save Reference Entry
              </Button>
            </div>

            <div className="border border-neutral-200 dark:border-neutral-800 rounded divide-y divide-neutral-100 dark:divide-neutral-800">
              {app.references.length === 0 ? (
                <div className="p-4 text-neutral-500">No external / acknowledgement reference numbers attached yet.</div>
              ) : (
                app.references.map((r) => (
                  <div key={r.fieldKey} className="p-3">
                    <div className="flex justify-between">
                      <span className="font-semibold">{r.label}</span>
                      <span className="font-mono font-bold">{r.value}</span>
                    </div>
                    <div className="text-[11px] text-neutral-500">
                      Updated by {r.updatedBy} · Modification history: {r.history.length} edit(s)
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {tab === 'notes' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Separate Internal Notes vs Customer-Facing Remarks */}
            <div className="border border-neutral-200 dark:border-neutral-800 rounded p-4 space-y-3">
              <div className="font-semibold text-sm">Internal Notes vs Customer Remarks</div>
              <p className="text-[11px] text-neutral-500">
                Internal Staff/Manager notes are strictly hidden from customer receipts and printouts.
              </p>
              <div className="flex gap-2">
                <select
                  value={noteType}
                  onChange={(e) => setNoteType(e.target.value as 'INTERNAL' | 'CUSTOMER_REMARK')}
                  className="h-8 px-2 border rounded bg-white dark:bg-neutral-950"
                >
                  <option value="CUSTOMER_REMARK">Customer-Facing Remark</option>
                  <option value="INTERNAL">Internal Staff Note (Private)</option>
                </select>
                <input
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder="Write note..."
                  className="flex-1 h-8 px-2 border rounded bg-white dark:bg-neutral-950"
                />
                <Button
                  size="sm"
                  variant="primary"
                  onClick={async () => {
                    if (!noteContent.trim()) return;
                    await erpApi.addNote(app.applicationNo, noteType, noteContent);
                    setNoteContent('');
                    loadDetail();
                  }}
                >
                  Add
                </Button>
              </div>
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {app.notes.map((n) => (
                  <div key={n.id} className="py-2">
                    <span className={`font-mono text-[10px] font-bold mr-2 ${n.noteType === 'INTERNAL' ? 'text-amber-700' : 'text-blue-700'}`}>
                      [{n.noteType}]
                    </span>
                    <span>{n.content}</span>
                    <span className="ml-2 text-neutral-400">({n.createdBy})</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Follow-up Scheduler */}
            <div className="border border-neutral-200 dark:border-neutral-800 rounded p-4 space-y-3">
              <div className="font-semibold text-sm">Follow-up Schedule &amp; Reminders</div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={fuDate}
                  onChange={(e) => setFuDate(e.target.value)}
                  className="h-8 px-2 border rounded bg-white dark:bg-neutral-950"
                />
                <input
                  value={fuReason}
                  onChange={(e) => setFuReason(e.target.value)}
                  placeholder="Follow-up action reason"
                  className="h-8 px-2 border rounded bg-white dark:bg-neutral-950"
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  if (!fuDate || !fuReason) return;
                  await erpApi.addFollowUp(app.applicationNo, {
                    followUpDate: fuDate,
                    reason: fuReason,
                  });
                  setFuDate('');
                  setFuReason('');
                  loadDetail();
                }}
              >
                Schedule Follow-up
              </Button>
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {app.followUps.map((f) => (
                  <div key={f.id} className="py-2 flex items-center justify-between gap-2">
                    <div>
                      <div className="font-semibold">{f.reason}</div>
                      <div className="text-neutral-500 font-mono">
                        Due: {f.followUpDate} · {f.status} ({f.assignedStaffId})
                      </div>
                    </div>
                    {f.status === 'Pending' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          await erpApi.updateFollowUp(f.id, { status: 'Completed' });
                          loadDetail();
                        }}
                      >
                        Done
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'finance' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="border border-neutral-200 dark:border-neutral-800 rounded p-4 space-y-3">
              <div className="font-semibold text-sm flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Collect Payment (Balance: {formatCurrency(app.financialSummary.balanceDue)})
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  value={payAmount}
                  onChange={(e) => setPayAmount(Number(e.target.value))}
                  className="h-8 px-2 border rounded font-mono bg-white dark:bg-neutral-950"
                />
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as 'Cash' | 'UPI' | 'Card')}
                  className="h-8 px-2 border rounded bg-white dark:bg-neutral-950"
                >
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="Card">Card</option>
                </select>
              </div>
              {payMethod === 'UPI' && (
                <input
                  value={payUpiRef}
                  onChange={(e) => setPayUpiRef(e.target.value)}
                  placeholder="UPI Reference ID *"
                  className="w-full h-8 px-2 border rounded font-mono bg-white dark:bg-neutral-950"
                />
              )}
              <Button
                size="sm"
                variant="primary"
                disabled={app.financialSummary.balanceDue <= 0}
                onClick={async () => {
                  try {
                    const res = await erpApi.recordPayment({
                      applicationNo: app.applicationNo,
                      amount: payAmount,
                      paymentMethod: payMethod,
                      upiReference: payUpiRef,
                    });
                    onShowToast('success', 'Receipt Issued', res.data.receiptNo);
                    loadDetail();
                    onUpdated();
                  } catch (err) {
                    onShowToast('error', 'Payment Rejected', err instanceof Error ? err.message : undefined);
                  }
                }}
              >
                Collect Payment &amp; Issue MCR Receipt
              </Button>

              <div className="divide-y divide-neutral-100 dark:divide-neutral-800 pt-2">
                {app.payments.map((p) => (
                  <div key={p.transactionId} className="py-1.5 flex justify-between">
                    <span>
                      <span className="font-mono font-semibold">{p.receiptNo}</span> ({p.paymentMethod} · {p.verificationStatus})
                    </span>
                    <span className="font-mono font-bold">{formatCurrency(p.amount)}</span>
                  </div>
                ))}
              </div>
            </div>

            {canApproveDocs && (
              <div className="border border-neutral-200 dark:border-neutral-800 rounded p-4 space-y-3">
                <div className="font-semibold text-sm">Issue Refund (MCRF Sequence · Over-Refund Guarded)</div>
                <select
                  value={refundTxnId}
                  onChange={(e) => setRefundTxnId(e.target.value)}
                  className="w-full h-8 px-2 border rounded font-mono bg-white dark:bg-neutral-950"
                >
                  {app.payments.map((p) => (
                    <option key={p.transactionId} value={p.transactionId}>
                      {p.transactionId} · {p.receiptNo} ({formatCurrency(p.amount)})
                    </option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(Number(e.target.value))}
                    className="h-8 px-2 border rounded font-mono bg-white dark:bg-neutral-950"
                  />
                  <input
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                    placeholder="Refund reason *"
                    className="h-8 px-2 border rounded bg-white dark:bg-neutral-950"
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!refundTxnId}
                  onClick={async () => {
                    try {
                      const res = await erpApi.createRefund({
                        applicationNo: app.applicationNo,
                        originalTransactionId: refundTxnId,
                        refundAmount,
                        refundMethod: 'Cash',
                        refundReason,
                      });
                      onShowToast('success', 'Refund Logged', `${res.data.refundId} (${res.data.status})`);
                      loadDetail();
                      onUpdated();
                    } catch (err) {
                      onShowToast('error', 'Refund Blocked', err instanceof Error ? err.message : undefined);
                    }
                  }}
                >
                  Request / Process Refund
                </Button>
                {app.refunds.map((r) => (
                  <div key={r.refundId} className="text-[11px] font-mono">
                    {r.refundId}: {formatCurrency(r.refundAmount)} · {r.status} ({r.refundReason})
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'delivery' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="border border-neutral-200 dark:border-neutral-800 rounded p-4 space-y-2.5">
              <div className="font-semibold text-sm flex items-center gap-2">
                <Truck className="h-4 w-4" />
                Customer Delivery &amp; Handover Tracking (MCD)
              </div>
              <input
                value={deliverableType}
                onChange={(e) => setDeliverableType(e.target.value)}
                placeholder="Deliverable Type"
                className="w-full h-8 px-2 border rounded bg-white dark:bg-neutral-950"
              />
              <select
                value={deliveryMethod}
                onChange={(e) => setDeliveryMethod(e.target.value)}
                className="w-full h-8 px-2 border rounded bg-white dark:bg-neutral-950"
              >
                <option value="Physical Handover">Physical Handover</option>
                <option value="Customer Collection">Customer Collection</option>
                <option value="Authorized Representative">Authorized Representative</option>
                <option value="Digital Delivery">Digital Delivery</option>
              </select>
              <input
                value={receivedBy}
                onChange={(e) => setReceivedBy(e.target.value)}
                placeholder="Received By Name *"
                className="w-full h-8 px-2 border rounded bg-white dark:bg-neutral-950"
              />
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={handoverConfirmed}
                  onChange={(e) => setHandoverConfirmed(e.target.checked)}
                />
                Customer Handover Acknowledgement Confirmed
              </label>
              <Button
                size="sm"
                variant="primary"
                onClick={async () => {
                  try {
                    const res = await erpApi.saveDelivery(app.applicationNo, {
                      deliverableType,
                      deliveryMethod,
                      receivedBy,
                      handoverConfirmed,
                      status: 'Delivered',
                    });
                    onShowToast('success', 'Handover Recorded', (res.data as { deliveryId: string }).deliveryId);
                    loadDetail();
                    onUpdated();
                  } catch (err) {
                    onShowToast('error', 'Delivery Error', err instanceof Error ? err.message : undefined);
                  }
                }}
              >
                Confirm Delivery Handover
              </Button>
              {app.delivery && (
                <div className="p-2 bg-neutral-50 dark:bg-neutral-950 border rounded font-mono text-[11px]">
                  {app.delivery.deliveryId} · {app.delivery.status} · Received by {app.delivery.receivedBy}
                </div>
              )}
            </div>

            <div className="border border-neutral-200 dark:border-neutral-800 rounded p-4 space-y-2.5">
              <div className="font-semibold text-sm">Cancellation Request Workflow</div>
              <input
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Mandatory cancellation reason *"
                className="w-full h-8 px-2 border rounded bg-white dark:bg-neutral-950"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  try {
                    await erpApi.requestCancellation(app.applicationNo, cancelReason);
                    setCancelReason('');
                    onShowToast('success', 'Cancellation Requested', 'Submitted for Manager/Admin review.');
                    loadDetail();
                    onUpdated();
                  } catch (err) {
                    onShowToast('error', 'Cancellation Error', err instanceof Error ? err.message : undefined);
                  }
                }}
              >
                Submit Cancellation Request
              </Button>
              {app.cancellations.map((c) => (
                <div key={c.requestCode} className="p-2 border rounded flex items-center justify-between">
                  <span>{c.requestCode}: {c.reason} ({c.status})</span>
                  {canApproveDocs && c.status === 'Pending' && (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={async () => {
                        await erpApi.reviewCancellation(c.requestCode, 'Approved', 'Approved via Profile');
                        loadDetail();
                        onUpdated();
                      }}
                    >
                      Approve
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'print' && (
          <div className="space-y-3">
            <div className="p-6 border-2 border-neutral-950 rounded bg-white text-neutral-950 text-xs space-y-3">
              <div className="flex justify-between border-b border-neutral-300 pb-2">
                <div>
                  <div className="text-base font-bold">MUN COMPUTER — APPLICATION ACKNOWLEDGEMENT</div>
                  <div>Official Customer Copy (Internal Staff Notes Excluded)</div>
                </div>
                <div className="text-right font-mono">
                  <div className="font-bold">{app.applicationNo}</div>
                  <div>FY {app.financialYear}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div><strong>Customer:</strong> {app.customerSnapshot.fullName} ({app.customerId})</div>
                  <div><strong>Mobile:</strong> {app.customerSnapshot.mobile}</div>
                  <div><strong>Address:</strong> {app.customerSnapshot.presentAddress}</div>
                </div>
                <div>
                  <div><strong>Service:</strong> {app.serviceSnapshot.name}</div>
                  <div><strong>Status:</strong> {app.status} · Due {formatDateIST(app.expectedCompletionDate)}</div>
                  <div><strong>Total Fee:</strong> {formatCurrency(app.financialSummary.serviceCharge)} · Paid {formatCurrency(app.financialSummary.netCollected)}</div>
                </div>
              </div>
              <div>
                <strong>Customer-Facing Remarks:</strong>
                <ul className="list-disc pl-4 mt-1">
                  {app.notes.filter((n) => n.noteType === 'CUSTOMER_REMARK').length === 0 ? (
                    <li>No customer remarks recorded.</li>
                  ) : (
                    app.notes
                      .filter((n) => n.noteType === 'CUSTOMER_REMARK')
                      .map((n) => <li key={n.id}>{n.content}</li>)
                  )}
                </ul>
              </div>
              <div className="pt-2 border-t border-neutral-200 text-[10px] text-neutral-600">
                Disclaimer: MUN COMPUTER acts strictly as an authorized private digital &amp; filing assistance service centre. Statutory outcomes and department processing times depend solely on the concerned Government/External Authority.
              </div>
            </div>
            <div className="flex justify-end no-print">
              <Button size="sm" variant="primary" onClick={() => window.print()} icon={<Printer className="h-3.5 w-3.5" />}>
                Print A4 Acknowledgement
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
