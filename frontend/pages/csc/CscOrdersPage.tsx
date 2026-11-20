import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  FileText,
  Plus,
  Printer,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
  Wallet,
} from 'lucide-react';
import {
  ALL_CSC_APPLICATION_STATUSES,
  CscApplicationStatus,
  CscDocumentRecord,
  CscOrderRecord,
  CscPaymentEntry,
  CscService,
} from '../../../shared/cscTypes';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { MobileNumberInput } from '../../components/MobileNumberInput';
import { StatusText } from '../../components/StatusText';
import { UserProfile } from '../../modules/types';
import { CscPaymentMethodItem, CscReceiptPayload, cscApi } from '../../services/cscApi';
import { formatDateIST, formatDateTimeIST, formatINR } from '../../services/formatters';
import { CscReceiptPrintModal } from './CscReceiptPrintModal';
import { extractFriendlyErrorMessage } from '../../services/firebase';

interface CscOrdersPageProps {
  currentUser: UserProfile;
  initialServiceId?: string | null;
  onConsumeInitialService?: () => void;
  onShowToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}

export const CscOrdersPage: React.FC<CscOrdersPageProps> = ({
  currentUser,
  initialServiceId,
  onConsumeInitialService,
  onShowToast,
}) => {
  const [services, setServices] = useState<CscService[]>([]);
  const [orders, setOrders] = useState<CscOrderRecord[]>([]);
  const [documents, setDocuments] = useState<CscDocumentRecord[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<CscPaymentMethodItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');

  // Multi-Service Order Builder
  const [builderOpen, setBuilderOpen] = useState(false);
  const [custName, setCustName] = useState('');
  const [custMobile, setCustMobile] = useState('');
  const [custAddress, setCustAddress] = useState('');
  const [custDistrict, setCustDistrict] = useState('North 24 Parganas');
  const [custBlock, setCustBlock] = useState('');
  const [svcSearch, setSvcSearch] = useState('');
  const [cart, setCart] = useState<Array<{ service: CscService; quantity: number }>>([]);
  const [advancePay, setAdvancePay] = useState('0');
  const [payMethod, setPayMethod] = useState('Cash');
  const [payRef, setPayRef] = useState('');
  const [adminRemarks, setAdminRemarks] = useState('');
  const [ekycMethod, setEkycMethod] = useState<CscOrderRecord['ekycMethod']>('Not Applicable');
  const [submitting, setSubmitting] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);

  // Order Detail / Status / Payment / Docs
  const [selectedOrder, setSelectedOrder] = useState<CscOrderRecord | null>(null);
  const [nextStatus, setNextStatus] = useState<CscApplicationStatus>('Processing');
  const [statusRemarks, setStatusRemarks] = useState('');
  const [externalAckNo, setExternalAckNo] = useState('');
  const [collectAmt, setCollectAmt] = useState('');
  const [collectType, setCollectType] = useState<CscPaymentEntry['paymentType']>('Due Collection');
  const [collectMethod, setCollectMethod] = useState('Cash');

  // Document Upload inside selectedOrder
  const [docCategory, setDocCategory] = useState('Aadhaar / Identity Proof (Masked)');
  const [docName, setDocName] = useState('');
  const [docMime, setDocMime] = useState('application/pdf');
  const [docBase64, setDocBase64] = useState('');

  // Admin Custom Payment Method
  const [newMethodName, setNewMethodName] = useState('');
  const [receiptPreview, setReceiptPreview] = useState<CscReceiptPayload | null>(null);

  const isAdmin = currentUser.role === 'ADMIN';

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [svcRes, ordRes, docRes, pmRes] = await Promise.all([
        cscApi.getServices(),
        cscApi.getCscOrders(),
        cscApi.getCscDocuments(),
        cscApi.getPaymentMethods(),
      ]);
      setServices(svcRes.data);
      setOrders(ordRes.data);
      setDocuments(docRes.data);
      setPaymentMethods(pmRes.data);
      if (selectedOrder) {
        const refreshed = ordRes.data.find((o) => o.orderId === selectedOrder.orderId);
        if (refreshed) setSelectedOrder(refreshed);
      }
    } catch (err) {
      onShowToast('error', 'Failed to load CSC Orders', extractFriendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [onShowToast]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (initialServiceId && services.length > 0) {
      const found = services.find((s) => s.id === initialServiceId);
      if (found) {
        setBuilderOpen(true);
        if (found.rateConfigured) {
          setCart([{ service: found, quantity: 1 }]);
        } else {
          onShowToast('error', 'Rate Not Configured', `${found.name} has blank rates. Configure rate first.`);
        }
      }
      onConsumeInitialService?.();
    }
  }, [initialServiceId, services, onConsumeInitialService, onShowToast]);

  const configuredServices = useMemo(
    () =>
      services.filter(
        (s) =>
          s.rateConfigured &&
          s.active &&
          s.availability === 'Available' &&
          (!svcSearch.trim() ||
            s.name.toLowerCase().includes(svcSearch.toLowerCase()) ||
            s.categoryName.toLowerCase().includes(svcSearch.toLowerCase()) ||
            s.code.toLowerCase().includes(svcSearch.toLowerCase()))
      ),
    [services, svcSearch]
  );

  const cartTotals = useMemo(() => {
    const sc = cart.reduce((s, c) => s + (c.service.serviceCharge || 0) * c.quantity, 0);
    const gf = cart.reduce((s, c) => s + (c.service.govtFee || 0) * c.quantity, 0);
    return { serviceCharge: sc, govtFee: gf, total: sc + gf };
  }, [cart]);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (statusFilter !== 'ALL' && o.applicationStatus !== statusFilter) return false;
      if (
        q &&
        !o.orderId.toLowerCase().includes(q) &&
        !o.customerName.toLowerCase().includes(q) &&
        !o.mobile.toLowerCase().includes(q) &&
        !o.selectedServiceName.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [orders, statusFilter, search]);

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setOrderError(null);
    if (!custName.trim() || custMobile.trim().length < 10) {
      const msg = 'Customer Name and a valid 10-digit Mobile Number are required.';
      setOrderError(msg);
      onShowToast('error', 'Validation Failed', msg);
      return;
    }
    if (cart.length === 0) {
      const msg = 'Select at least one configured service before creating the order.';
      setOrderError(msg);
      onShowToast('error', 'Select at least one configured service');
      return;
    }
    setSubmitting(true);
    try {
      const res = await cscApi.createCscOrder({
        customerName: custName.trim(),
        mobile: custMobile.trim(),
        address: custAddress.trim(),
        district: custDistrict.trim(),
        blockOrMunicipality: custBlock.trim(),
        items: cart.map((c) => ({ serviceId: c.service.id, quantity: c.quantity })),
        advancePayment: Number(advancePay || 0),
        paymentMethod: payMethod,
        paymentReference: payRef.trim(),
        adminRemarks: adminRemarks.trim(),
        ekycMethod,
      });
      onShowToast('success', 'CSC Order Created', `${res.data.orderId} · Total ${formatINR(res.data.totalAmount)}`);
      setBuilderOpen(false);
      setCart([]);
      setCustName('');
      setCustMobile('');
      setAdvancePay('0');
      setSelectedOrder(res.data);
      await loadData();
    } catch (err) {
      const msg = extractFriendlyErrorMessage(err, 'Unable to create CSC order.');
      setOrderError(msg);
      onShowToast('error', 'Order Blocked', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateStatus = async () => {
    if (!selectedOrder) return;
    try {
      const res = await cscApi.updateCscOrderStatus(selectedOrder.orderId, {
        status: nextStatus,
        remarks: statusRemarks,
        externalAckNo: externalAckNo || undefined,
      });
      setSelectedOrder(res.data);
      onShowToast('success', 'Status Updated', `${res.data.orderId} → ${res.data.applicationStatus}`);
      setStatusRemarks('');
      await loadData();
    } catch (err) {
      onShowToast('error', 'Status Update Failed', extractFriendlyErrorMessage(err));
    }
  };

  const handleCollectPayment = async () => {
    if (!selectedOrder) return;
    const amt = Number(collectAmt);
    if (!Number.isFinite(amt) || amt <= 0) {
      onShowToast('error', 'Enter a positive payment amount');
      return;
    }
    try {
      const res = await cscApi.collectCscOrderPayment(selectedOrder.orderId, {
        amount: amt,
        paymentType: collectType,
        paymentMethod: collectMethod,
      });
      setSelectedOrder(res.data.order);
      setCollectAmt('');
      onShowToast('success', 'Transaction Recorded', `Receipt ${res.data.receipt.receiptNumber}`);
      await loadData();
    } catch (err) {
      onShowToast('error', 'Payment Error', extractFriendlyErrorMessage(err));
    }
  };

  const handleUploadDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;
    try {
      await cscApi.uploadCscDocument({
        customerId: selectedOrder.customerId,
        orderId: selectedOrder.orderId,
        category: docCategory,
        docName: docName || 'Customer Document',
        mimeType: docMime,
        fileSizeBytes: docBase64 ? Math.round((docBase64.length * 3) / 4) : 1024,
        contentBase64: docBase64 || undefined,
      });
      onShowToast('success', 'Uploaded to Private Vault');
      setDocName('');
      setDocBase64('');
      await loadData();
    } catch (err) {
      onShowToast('error', 'Upload Failed', extractFriendlyErrorMessage(err));
    }
  };

  const handlePrintReceipt = async (receiptNumber: string) => {
    try {
      const res = await cscApi.reprintReceipt(receiptNumber);
      setReceiptPreview(res.data);
    } catch (err) {
      onShowToast('error', 'Receipt Error', extractFriendlyErrorMessage(err));
    }
  };

  const orderDocs = useMemo(
    () =>
      selectedOrder
        ? documents.filter(
            (d) => d.orderId === selectedOrder.orderId || d.customerId === selectedOrder.customerId
          )
        : [],
    [documents, selectedOrder]
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-neutral-950 dark:text-white">
            CSC Orders, 17-Status Workflow &amp; Private Document Vault
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Multi-service orders with immutable rate snapshots, partial/due collection, refunds, A4 receipts, and private document verification.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="primary"
            size="sm"
            icon={<Plus className="h-3.5 w-3.5" />}
            onClick={() => {
              setOrderError(null);
              setBuilderOpen(true);
            }}
          >
            New CSC Service Order
          </Button>
          <Button variant="outline" size="sm" onClick={loadData} loading={loading} icon={<RefreshCw className="h-3.5 w-3.5" />}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-3.5 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 text-xs">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search Order ID, Customer Name, Mobile, Service..."
          className="flex-1 h-9 px-3 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 px-2.5 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
        >
          <option value="ALL">All 17 Application Statuses</option>
          {ALL_CSC_APPLICATION_STATUSES.map((st) => (
            <option key={st} value={st}>
              {st}
            </option>
          ))}
        </select>
      </div>

      {/* Orders Grid + Detail Drawer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className={`${selectedOrder ? 'lg:col-span-7' : 'lg:col-span-12'} bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-neutral-50 dark:bg-neutral-950 border-b border-neutral-200 dark:border-neutral-800 text-neutral-500">
                <tr>
                  <th className="px-3.5 py-2.5">Order / Customer</th>
                  <th className="px-3.5 py-2.5">Service Snapshot</th>
                  <th className="px-3.5 py-2.5">Status</th>
                  <th className="px-3.5 py-2.5 text-right">Total / Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {filteredOrders.map((o) => (
                  <tr
                    key={o.orderId}
                    onClick={() => {
                      setSelectedOrder(o);
                      setNextStatus(o.applicationStatus);
                      setExternalAckNo(o.externalAckNo || '');
                    }}
                    className={`cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800/40 ${
                      selectedOrder?.orderId === o.orderId ? 'bg-neutral-100/80 dark:bg-neutral-800/60' : ''
                    }`}
                  >
                    <td className="px-3.5 py-2.5">
                      <div className="font-mono font-semibold text-neutral-950 dark:text-white">{o.orderId}</div>
                      <div className="text-neutral-700 dark:text-neutral-300">{o.customerName}</div>
                      <div className="font-mono text-[11px] text-neutral-500">{o.mobile}</div>
                    </td>
                    <td className="px-3.5 py-2.5">
                      <div className="font-medium text-neutral-950 dark:text-white">{o.selectedServiceName}</div>
                      <div className="text-[11px] text-neutral-500">
                        {o.items.length} line(s) · {formatDateIST(o.orderDate)}
                      </div>
                    </td>
                    <td className="px-3.5 py-2.5">
                      <StatusText status={o.applicationStatus} />
                      <div className="text-[11px] font-mono text-neutral-500 mt-0.5">{o.paymentStatus}</div>
                    </td>
                    <td className="px-3.5 py-2.5 text-right font-mono tabular-nums">
                      <div className="font-semibold">{formatINR(o.totalAmount)}</div>
                      <div className={`text-[11px] ${o.remainingDue > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                        Due {formatINR(o.remainingDue)}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredOrders.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-neutral-500">
                      No CSC service orders recorded yet. Click "New CSC Service Order" to begin.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Order Detail / Workflow / Payments / Vault */}
        {selectedOrder && (
          <div className="lg:col-span-5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 space-y-4 text-xs">
            <div className="flex items-start justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
              <div>
                <div className="font-mono text-sm font-bold text-neutral-950 dark:text-white">
                  {selectedOrder.orderId}
                </div>
                <div className="text-neutral-600 dark:text-neutral-300">
                  {selectedOrder.customerName} · {selectedOrder.mobile}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="text-neutral-500 hover:text-neutral-950 dark:hover:text-white cursor-pointer"
              >
                Close
              </button>
            </div>

            {/* Immutable Snapshot Lines */}
            <div className="space-y-1.5">
              <div className="font-semibold text-neutral-800 dark:text-neutral-200">
                Immutable Rate Snapshots
              </div>
              {selectedOrder.items.map((it) => (
                <div key={it.lineId} className="p-2 rounded bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 flex justify-between gap-2">
                  <div>
                    <div className="font-medium">{it.serviceName}</div>
                    <div className="text-[11px] font-mono text-neutral-500">
                      {it.quantity} × {it.unitType} (SC {formatINR(it.serviceChargeSnapshot)} + GF {formatINR(it.govtFeeSnapshot)})
                    </div>
                  </div>
                  <div className="font-mono font-semibold shrink-0">{formatINR(it.lineTotal)}</div>
                </div>
              ))}
            </div>

            {/* 17-Status Workflow */}
            <div className="p-3 rounded border border-neutral-200 dark:border-neutral-800 space-y-2">
              <div className="font-semibold">Progress Application Status (17 Stages)</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <select
                  value={nextStatus}
                  onChange={(e) => setNextStatus(e.target.value as CscApplicationStatus)}
                  className="h-8 px-2 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
                >
                  {ALL_CSC_APPLICATION_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {st}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={externalAckNo}
                  onChange={(e) => setExternalAckNo(e.target.value)}
                  placeholder="Govt Portal Ack No."
                  className="h-8 px-2 font-mono bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
                />
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={statusRemarks}
                  onChange={(e) => setStatusRemarks(e.target.value)}
                  placeholder="Status remarks..."
                  className="flex-1 h-8 px-2 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
                />
                <Button variant="primary" size="sm" onClick={handleUpdateStatus}>
                  Update Status
                </Button>
              </div>
            </div>

            {/* Payment & Refund Collector + Receipts */}
            <div className="p-3 rounded border border-neutral-200 dark:border-neutral-800 space-y-2">
              <div className="flex items-center justify-between font-semibold">
                <span className="flex items-center gap-1.5">
                  <Wallet className="h-3.5 w-3.5" /> Payments &amp; Due ({formatINR(selectedOrder.remainingDue)} Due)
                </span>
                <span className="font-mono">{selectedOrder.paymentStatus}</span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  value={collectAmt}
                  onChange={(e) => setCollectAmt(e.target.value)}
                  placeholder="Amount ₹"
                  className="h-8 px-2 font-mono bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
                />
                <select
                  value={collectType}
                  onChange={(e) => setCollectType(e.target.value as CscPaymentEntry['paymentType'])}
                  className="h-8 px-1.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
                >
                  <option value="Due Collection">Due Collection</option>
                  <option value="Partial">Partial</option>
                  <option value="Full">Full</option>
                  <option value="Refund">Refund</option>
                </select>
                <select
                  value={collectMethod}
                  onChange={(e) => setCollectMethod(e.target.value)}
                  className="h-8 px-1.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
                >
                  {paymentMethods.map((m) => (
                    <option key={m.id} value={m.name}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
              <Button variant="secondary" size="sm" onClick={handleCollectPayment} className="w-full">
                Record Payment / Refund
              </Button>

              {selectedOrder.payments.length > 0 && (
                <div className="divide-y divide-neutral-100 dark:divide-neutral-800 pt-1">
                  {selectedOrder.payments.map((p) => (
                    <div key={p.receiptNumber} className="py-1.5 flex items-center justify-between gap-2">
                      <div>
                        <span className="font-mono font-semibold">{p.receiptNumber}</span> · {p.paymentType} ({p.paymentMethod})
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono font-semibold">{formatINR(p.amount)}</span>
                        <Button
                          variant="outline"
                          size="sm"
                          icon={<Printer className="h-3 w-3" />}
                          onClick={() => handlePrintReceipt(p.receiptNumber)}
                        >
                          Print
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Private Document Vault (Part 10) */}
            <div className="p-3 rounded border border-neutral-200 dark:border-neutral-800 space-y-2.5">
              <div className="font-semibold flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" />
                Private Document Vault ({orderDocs.length})
              </div>

              <form onSubmit={handleUploadDoc} className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    required
                    value={docName}
                    onChange={(e) => setDocName(e.target.value)}
                    placeholder="Document Name *"
                    className="h-8 px-2 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
                  />
                  <input
                    type="text"
                    value={docCategory}
                    onChange={(e) => setDocCategory(e.target.value)}
                    placeholder="Category"
                    className="h-8 px-2 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (!docName) setDocName(file.name);
                      setDocMime(file.type || 'application/pdf');
                      const reader = new FileReader();
                      reader.onload = () => setDocBase64(String(reader.result || '').slice(0, 65000));
                      reader.readAsDataURL(file);
                    }}
                    className="flex-1 text-[11px]"
                  />
                  <Button type="submit" variant="outline" size="sm" icon={<Upload className="h-3 w-3" />}>
                    Upload Private Doc
                  </Button>
                </div>
              </form>

              <div className="space-y-1.5 max-h-44 overflow-y-auto">
                {orderDocs.map((d) => (
                  <div key={d.docId} className="p-2 rounded bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate flex items-center gap-1">
                        <FileText className="h-3 w-3 shrink-0" /> {d.docName}
                      </div>
                      <div className="text-[11px] font-mono text-neutral-500">
                        {d.verificationStatus} · {formatDateTimeIST(d.uploadedAt)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await cscApi.verifyCscDocument(d.docId, 'Verified');
                            onShowToast('success', 'Document Verified', d.docName);
                            await loadData();
                          } catch (err) {
                            onShowToast('error', 'Verification Failed', extractFriendlyErrorMessage(err));
                          }
                        }}
                        title="Verify Document"
                        className="px-2 py-1 rounded border border-emerald-300 text-emerald-700 dark:text-emerald-400 text-[11px] cursor-pointer"
                      >
                        <CheckCircle2 className="h-3 w-3 inline mr-0.5" />Verify
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await cscApi.verifyCscDocument(d.docId, 'Re-upload Requested', 'Clear scan required');
                            onShowToast('info', 'Re-upload Requested', d.docName);
                            await loadData();
                          } catch (err) {
                            onShowToast('error', 'Action Failed', extractFriendlyErrorMessage(err));
                          }
                        }}
                        className="px-2 py-1 rounded border border-amber-300 text-amber-700 dark:text-amber-400 text-[11px] cursor-pointer"
                      >
                        Re-upload
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {isAdmin && (
              <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800 flex items-center gap-2">
                <input
                  type="text"
                  value={newMethodName}
                  onChange={(e) => setNewMethodName(e.target.value)}
                  placeholder="Add Payment Method (e.g. GPay QR)"
                  className="flex-1 h-8 px-2 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    if (!newMethodName.trim()) return;
                    try {
                      await cscApi.addPaymentMethod(newMethodName.trim());
                      setNewMethodName('');
                      await loadData();
                    } catch (err) {
                      onShowToast('error', 'Failed', err instanceof Error ? err.message : undefined);
                    }
                  }}
                >
                  Add Method
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Multi-Service Order Builder Modal */}
      <Modal
        isOpen={builderOpen}
        onClose={() => {
          setOrderError(null);
          setBuilderOpen(false);
        }}
        title="Create Multi-Service CSC Order"
        maxWidthClass="max-w-3xl"
      >
        <form onSubmit={handleCreateOrder} className="space-y-4 text-xs" noValidate>
          {orderError && (
            <div role="alert" className="px-3 py-2 rounded border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300">
              {orderError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium mb-1">Customer Full Name *</label>
              <input
                type="text"
                required
                value={custName}
                onChange={(e) => setCustName(e.target.value)}
                className="w-full h-9 px-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Mobile Number *</label>
              <MobileNumberInput
                required
                value={custMobile}
                onChange={setCustMobile}
                aria-label="CSC customer mobile number"
              />
            </div>
            <input
              type="text"
              value={custAddress}
              onChange={(e) => setCustAddress(e.target.value)}
              placeholder="Village / Street Address"
              className="h-9 px-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={custBlock}
                onChange={(e) => setCustBlock(e.target.value)}
                placeholder="Block / Municipality"
                className="h-9 px-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
              />
              <input
                type="text"
                value={custDistrict}
                onChange={(e) => setCustDistrict(e.target.value)}
                placeholder="District"
                className="h-9 px-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
              />
            </div>
          </div>

          <div className="border border-neutral-200 dark:border-neutral-800 rounded p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">Add Configured-Rate Services ({configuredServices.length} ready)</span>
              <input
                type="search"
                value={svcSearch}
                onChange={(e) => setSvcSearch(e.target.value)}
                placeholder="Filter configured services..."
                className="w-56 h-8 px-2 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
              />
            </div>
            <div className="max-h-36 overflow-y-auto divide-y divide-neutral-100 dark:divide-neutral-800 border border-neutral-100 dark:border-neutral-800 rounded">
              {configuredServices.slice(0, 30).map((s) => (
                <div key={s.id} className="px-2.5 py-1.5 flex items-center justify-between gap-2">
                  <div className="truncate">
                    <span className="font-medium">{s.name}</span>{' '}
                    <span className="text-neutral-500">({s.categoryName})</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono font-semibold">{formatINR(s.totalAmount || 0)}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setCart((prev) => {
                          const existing = prev.find((p) => p.service.id === s.id);
                          if (existing) {
                            return prev.map((p) =>
                              p.service.id === s.id ? { ...p, quantity: p.quantity + 1 } : p
                            );
                          }
                          return [...prev, { service: s, quantity: 1 }];
                        })
                      }
                      className="px-2 py-0.5 rounded bg-neutral-950 text-white dark:bg-white dark:text-neutral-950 cursor-pointer"
                    >
                      + Add
                    </button>
                  </div>
                </div>
              ))}
              {configuredServices.length === 0 && (
                <div className="p-3 text-center text-amber-700 dark:text-amber-400">
                  No services have configured rates yet. Open CSC Services &amp; Rates to configure pricing first (all services initialize blank by design).
                </div>
              )}
            </div>

            {cart.length > 0 && (
              <div className="space-y-1.5 pt-2">
                {cart.map((c) => (
                  <div key={c.service.id} className="flex items-center justify-between gap-2 bg-neutral-50 dark:bg-neutral-950 px-2.5 py-1.5 rounded">
                    <span className="font-medium truncate">{c.service.name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <input
                        type="number"
                        min="1"
                        value={c.quantity}
                        onChange={(e) =>
                          setCart((prev) =>
                            prev.map((p) =>
                              p.service.id === c.service.id
                                ? { ...p, quantity: Math.max(1, Number(e.target.value)) }
                                : p
                            )
                          )
                        }
                        className="w-16 h-7 px-1.5 font-mono text-right border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-900"
                      />
                      <span className="font-mono w-20 text-right">
                        {formatINR((c.service.totalAmount || 0) * c.quantity)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCart((prev) => prev.filter((p) => p.service.id !== c.service.id))}
                        className="text-red-600 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
                <div className="flex justify-between font-bold text-sm pt-1">
                  <span>Order Total (SC {formatINR(cartTotals.serviceCharge)} + Govt {formatINR(cartTotals.govtFee)})</span>
                  <span className="font-mono text-emerald-700 dark:text-emerald-400">{formatINR(cartTotals.total)}</span>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-medium mb-1">Advance / Paid Now (₹)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={advancePay}
                onChange={(e) => setAdvancePay(e.target.value)}
                className="w-full h-9 px-2.5 font-mono bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Payment Method</label>
              <select
                value={payMethod}
                onChange={(e) => setPayMethod(e.target.value)}
                className="w-full h-9 px-2 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
              >
                {paymentMethods.map((m) => (
                  <option key={m.id} value={m.name}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">e-KYC Method (PM-JAY / General)</label>
              <select
                value={ekycMethod}
                onChange={(e) => setEkycMethod(e.target.value as CscOrderRecord['ekycMethod'])}
                className="w-full h-9 px-2 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
              >
                <option value="Not Applicable">Not Applicable</option>
                <option value="Aadhaar OTP">Aadhaar OTP (Client-Side Portal Only)</option>
                <option value="Face Auth">Face Auth</option>
                <option value="Fingerprint Biometric">Fingerprint Biometric</option>
                <option value="IRIS Scan">IRIS Scan</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              value={payRef}
              onChange={(e) => setPayRef(e.target.value)}
              placeholder="Payment Ref / UTR (optional)"
              className="h-9 px-2.5 font-mono bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
            />
            <input
              type="text"
              value={adminRemarks}
              onChange={(e) => setAdminRemarks(e.target.value)}
              placeholder="Application remarks..."
              className="h-9 px-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setBuilderOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={submitting}>
              Create Service Order
            </Button>
          </div>
        </form>
      </Modal>

      <CscReceiptPrintModal
        isOpen={Boolean(receiptPreview)}
        receiptPayload={receiptPreview}
        onClose={() => setReceiptPreview(null)}
      />
    </div>
  );
};
