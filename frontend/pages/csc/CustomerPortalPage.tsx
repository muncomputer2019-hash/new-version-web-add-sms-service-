import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  CreditCard,
  FileText,
  Printer,
  RefreshCw,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { Button } from '../../components/Button';
import { StatusText } from '../../components/StatusText';
import { UserProfile } from '../../modules/types';
import { CustomerPortalPayload, CscReceiptPayload, cscApi } from '../../services/cscApi';
import { formatDateIST, formatINR } from '../../services/formatters';
import { CscReceiptPrintModal } from './CscReceiptPrintModal';

interface CustomerPortalPageProps {
  currentUser: UserProfile;
  onShowToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}

export const CustomerPortalPage: React.FC<CustomerPortalPageProps> = ({
  currentUser,
  onShowToast,
}) => {
  const [portal, setPortal] = useState<CustomerPortalPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [receiptPreview, setReceiptPreview] = useState<CscReceiptPayload | null>(null);

  // Self-service Document Re-upload
  const [docName, setDocName] = useState('');
  const [docOrderId, setDocOrderId] = useState('');

  // Self-service Grievance / Inquiry
  const [grvSubject, setGrvSubject] = useState('');
  const [grvDetails, setGrvDetails] = useState('');
  const [grvDept, setGrvDept] = useState('Citizen Support');

  const loadPortal = useCallback(async () => {
    setLoading(true);
    try {
      const res = await cscApi.getPortalMe();
      setPortal(res.data);
    } catch (err) {
      onShowToast('error', 'Failed to load Customer Portal', err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [onShowToast]);

  useEffect(() => {
    loadPortal();
  }, [loadPortal]);

  const handlePrint = async (receiptNumber: string) => {
    try {
      const res = await cscApi.reprintReceipt(receiptNumber);
      setReceiptPreview(res.data);
    } catch (err) {
      onShowToast('error', 'Receipt Unavailable', err instanceof Error ? err.message : undefined);
    }
  };

  const totalBilled =
    (portal?.orders.reduce((s, o) => s + o.totalAmount, 0) || 0) +
    (portal?.pvcOrders.reduce((s, o) => s + o.grandTotal, 0) || 0);
  const totalPaid =
    (portal?.orders.reduce((s, o) => s + o.totalPaid, 0) || 0) +
    (portal?.pvcOrders.reduce((s, o) => s + o.totalPaid, 0) || 0);
  const totalDue =
    (portal?.orders.reduce((s, o) => s + o.remainingDue, 0) || 0) +
    (portal?.pvcOrders.reduce((s, o) => s + o.remainingDue, 0) || 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-neutral-950 dark:text-white">
            Citizen Self-Service Portal — {currentUser.fullName}
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 font-mono">
            Portal ID: {currentUser.userId} · Customer Ref: {portal?.customer.customerId || '—'} · Strictly Private Session
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadPortal} loading={loading} icon={<RefreshCw className="h-3.5 w-3.5" />}>
          Refresh My Records
        </Button>
      </div>

      {/* Security & Privacy Assurance Banner */}
      <div className="p-3.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-xs flex items-start gap-2.5">
        <ShieldCheck className="h-4 w-4 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
        <div className="text-emerald-900 dark:text-emerald-200">
          Your portal displays only your own applications, PVC print orders, uploaded documents, grievances, and payment receipts. MUN COMPUTER never stores OTPs, UPI PINs, ATM PINs, CVVs, or banking passwords.
        </div>
      </div>

      {/* Payment Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4">
          <div className="text-neutral-500">My Service Orders</div>
          <div className="text-xl font-bold font-mono mt-1">{portal?.orders.length ?? 0}</div>
        </div>
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4">
          <div className="text-neutral-500">Total Billed</div>
          <div className="text-xl font-bold font-mono mt-1">{formatINR(totalBilled)}</div>
        </div>
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4">
          <div className="text-neutral-500">Total Paid</div>
          <div className="text-xl font-bold font-mono text-emerald-700 dark:text-emerald-400 mt-1">
            {formatINR(totalPaid)}
          </div>
        </div>
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4">
          <div className="text-neutral-500">Remaining Due</div>
          <div className="text-xl font-bold font-mono text-amber-700 dark:text-amber-400 mt-1">
            {formatINR(totalDue)}
          </div>
        </div>
      </div>

      {/* My Service Orders */}
      <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden text-xs">
        <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 font-semibold flex items-center gap-2">
          <FileText className="h-4 w-4 text-blue-800 dark:text-blue-400" />
          My Service Applications &amp; Statuses
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-neutral-50 dark:bg-neutral-950 border-b border-neutral-200 dark:border-neutral-800 text-neutral-500">
              <tr>
                <th className="px-4 py-2.5">Order ID</th>
                <th className="px-4 py-2.5">Service</th>
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Total / Paid / Due</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {(portal?.orders || []).map((o) => (
                <tr key={o.orderId}>
                  <td className="px-4 py-2.5 font-mono font-semibold">{o.orderId}</td>
                  <td className="px-4 py-2.5">
                    <div>{o.selectedServiceName}</div>
                    {o.externalAckNo && (
                      <div className="font-mono text-[11px] text-neutral-500">Ack: {o.externalAckNo}</div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-mono">{formatDateIST(o.orderDate)}</td>
                  <td className="px-4 py-2.5"><StatusText status={o.applicationStatus} /></td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                    {formatINR(o.totalAmount)} · Paid {formatINR(o.totalPaid)} · Due {formatINR(o.remainingDue)}
                  </td>
                </tr>
              ))}
              {(!portal?.orders || portal.orders.length === 0) && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-neutral-500">
                    No service applications on your profile yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Printable Receipts & PVC Orders */}
        <section className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 space-y-3 text-xs">
          <div className="font-semibold flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
            My Payment Receipts &amp; PVC Card Orders
          </div>
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {(portal?.receipts || []).map((r) => (
              <div key={r.receiptNumber} className="py-2 flex items-center justify-between gap-2">
                <div>
                  <div className="font-mono font-semibold">{r.receiptNumber}</div>
                  <div className="text-neutral-500">
                    {r.orderId} · {formatDateIST(r.paymentDate)} · {r.paymentMethod}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold">{formatINR(r.amount)}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    icon={<Printer className="h-3 w-3" />}
                    onClick={() => handlePrint(r.receiptNumber)}
                  >
                    A4 Print
                  </Button>
                </div>
              </div>
            ))}
            {(!portal?.receipts || portal.receipts.length === 0) && (
              <div className="py-4 text-neutral-500">No payment receipts issued yet.</div>
            )}
          </div>
        </section>

        {/* Self-Service Document Upload & Grievance Request */}
        <div className="space-y-4 text-xs">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!portal?.customer.customerId) return;
              try {
                await cscApi.uploadCscDocument({
                  customerId: portal.customer.customerId,
                  orderId: docOrderId || undefined,
                  category: 'Customer Self Upload',
                  docName: docName || 'Supporting Document',
                  mimeType: 'application/pdf',
                  fileSizeBytes: 2048,
                });
                onShowToast('success', 'Uploaded to Private Vault');
                setDocName('');
                await loadPortal();
              } catch (err) {
                onShowToast('error', 'Upload Failed', err instanceof Error ? err.message : undefined);
              }
            }}
            className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 space-y-2.5"
          >
            <div className="font-semibold flex items-center gap-1.5">
              <Upload className="h-4 w-4" /> Upload / Re-upload Private Document
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                required
                value={docName}
                onChange={(e) => setDocName(e.target.value)}
                placeholder="Document Name *"
                className="h-8 px-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
              />
              <input
                type="text"
                value={docOrderId}
                onChange={(e) => setDocOrderId(e.target.value)}
                placeholder="Order ID (optional)"
                className="h-8 px-2.5 font-mono bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
              />
            </div>
            <Button type="submit" variant="outline" size="sm">
              Upload Private Document
            </Button>
          </form>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await cscApi.createGrievance({
                  customerId: portal?.customer.customerId,
                  customerName: portal?.customer.fullName || currentUser.fullName,
                  mobile: portal?.customer.mobile || currentUser.mobile,
                  complaintCategory: 'Portal Citizen Support',
                  serviceType: 'Complaint Status Tracking',
                  department: grvDept,
                  complaintSubject: grvSubject,
                  complaintDetails: grvDetails,
                });
                onShowToast('success', 'Grievance / Support Ticket Submitted');
                setGrvSubject('');
                setGrvDetails('');
                await loadPortal();
              } catch (err) {
                onShowToast('error', 'Submission Failed', err instanceof Error ? err.message : undefined);
              }
            }}
            className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 space-y-2.5"
          >
            <div className="font-semibold flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-blue-800 dark:text-blue-400" />
              Raise Support Inquiry / Grievance Tracker ({portal?.grievances.length ?? 0})
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                required
                value={grvSubject}
                onChange={(e) => setGrvSubject(e.target.value)}
                placeholder="Subject *"
                className="h-8 px-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
              />
              <input
                type="text"
                value={grvDept}
                onChange={(e) => setGrvDept(e.target.value)}
                placeholder="Department"
                className="h-8 px-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
              />
            </div>
            <textarea
              rows={2}
              required
              value={grvDetails}
              onChange={(e) => setGrvDetails(e.target.value)}
              placeholder="Describe your inquiry (never share OTP/PIN)..."
              className="w-full p-2 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
            />
            <Button type="submit" variant="primary" size="sm">
              Submit Grievance
            </Button>
          </form>
        </div>
      </div>

      <CscReceiptPrintModal
        isOpen={Boolean(receiptPreview)}
        receiptPayload={receiptPreview}
        onClose={() => setReceiptPreview(null)}
      />
    </div>
  );
};
