import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CreditCard,
  Plus,
  Printer,
  RefreshCw,
  Trash2,
  Wallet,
} from 'lucide-react';
import {
  PvcCardType,
  PvcOrder,
  PvcOrderItem,
  PvcRateSlab,
  WholesaleShop,
} from '../../../shared/cscTypes';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { MobileNumberInput } from '../../components/MobileNumberInput';
import { UserProfile } from '../../modules/types';
import { CscPaymentMethodItem, CscReceiptPayload, WholesaleShopProfilePayload, cscApi } from '../../services/cscApi';
import { formatDateIST, formatINR } from '../../services/formatters';
import { CscReceiptPrintModal } from './CscReceiptPrintModal';
import { extractFriendlyErrorMessage } from '../../services/firebase';

interface PvcPrintingPageProps {
  currentUser: UserProfile;
  onShowToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}

export const PvcPrintingPage: React.FC<PvcPrintingPageProps> = ({ currentUser, onShowToast }) => {
  const [tab, setTab] = useState<'orders' | 'slabs' | 'shops' | 'cards'>('orders');
  const [loading, setLoading] = useState(true);

  const [cardTypes, setCardTypes] = useState<PvcCardType[]>([]);
  const [slabs, setSlabs] = useState<PvcRateSlab[]>([]);
  const [shops, setShops] = useState<WholesaleShop[]>([]);
  const [orders, setOrders] = useState<PvcOrder[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<CscPaymentMethodItem[]>([]);

  const isAdmin = currentUser.role === 'ADMIN';
  const canEditSlabs = isAdmin || Boolean(currentUser.permissions?.['csc.rateEdit']);

  // New Order Builder State
  const [orderMode, setOrderMode] = useState<'INDIVIDUAL' | 'WHOLESALE'>('INDIVIDUAL');
  const [custName, setCustName] = useState('');
  const [custMobile, setCustMobile] = useState('');
  const [selectedShopId, setSelectedShopId] = useState('');
  const [orderAddress, setOrderAddress] = useState('');
  const [draftLines, setDraftLines] = useState<Array<{ cardTypeId: string; quantity: number }>>([
    { cardTypeId: 'PVC-01', quantity: 1 },
  ]);
  const [quoteItems, setQuoteItems] = useState<PvcOrderItem[]>([]);
  const [quoteGrandTotal, setQuoteGrandTotal] = useState(0);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [advancePayment, setAdvancePayment] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [paymentReference, setPaymentReference] = useState('');
  const [orderRemarks, setOrderRemarks] = useState('');
  const [submittingOrder, setSubmittingOrder] = useState(false);

  // Slab Form
  const [slabMode, setSlabMode] = useState<'INDIVIDUAL' | 'WHOLESALE'>('WHOLESALE');
  const [slabMin, setSlabMin] = useState('1');
  const [slabMax, setSlabMax] = useState('50');
  const [slabRate, setSlabRate] = useState('');

  // Shop Modal & Profile
  const [shopModalOpen, setShopModalOpen] = useState(false);
  const [shopName, setShopName] = useState('');
  const [shopOwner, setShopOwner] = useState('');
  const [shopMobile, setShopMobile] = useState('');
  const [shopAltMobile, setShopAltMobile] = useState('');
  const [shopAddress, setShopAddress] = useState('');
  const [shopRemarks, setShopRemarks] = useState('');
  const [savingShop, setSavingShop] = useState(false);
  const [shopError, setShopError] = useState<string | null>(null);
  const [shopProfile, setShopProfile] = useState<WholesaleShopProfilePayload | null>(null);

  // Card Type Modal
  const [newCardName, setNewCardName] = useState('');
  const [newCardDesc, setNewCardDesc] = useState('');
  const [savingSlab, setSavingSlab] = useState(false);

  // Collect Payment & Receipt Preview
  const [payOrder, setPayOrder] = useState<PvcOrder | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('Cash');
  const [payRef, setPayRef] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<CscReceiptPayload | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [ctRes, slRes, shRes, ordRes, pmRes] = await Promise.all([
        cscApi.getPvcCardTypes(),
        cscApi.getPvcSlabs(),
        cscApi.getWholesaleShops(),
        cscApi.getPvcOrders(),
        cscApi.getPaymentMethods(),
      ]);
      setCardTypes(ctRes.data);
      setSlabs(slRes.data);
      setShops(shRes.data);
      setOrders(ordRes.data);
      setPaymentMethods(pmRes.data);
      if (ctRes.data.length > 0 && draftLines.length === 1 && !ctRes.data.some((c) => c.id === draftLines[0].cardTypeId)) {
        setDraftLines([{ cardTypeId: ctRes.data[0].id, quantity: 1 }]);
      }
    } catch (err) {
      onShowToast('error', 'Failed to load PVC module', extractFriendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [onShowToast]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Live Quote Preview whenever orderMode or draftLines change
  useEffect(() => {
    const valid = draftLines.filter((l) => l.cardTypeId && l.quantity > 0);
    if (valid.length === 0) {
      setQuoteItems([]);
      setQuoteGrandTotal(0);
      setQuoteError(null);
      return;
    }
    cscApi
      .quotePvc(orderMode, valid)
      .then((res) => {
        setQuoteItems(res.data.items);
        setQuoteGrandTotal(res.data.grandTotal);
        setQuoteError(null);
      })
      .catch((err) => {
        setQuoteItems([]);
        setQuoteGrandTotal(0);
        setQuoteError(err instanceof Error ? err.message : 'No matching slab configured.');
      });
  }, [orderMode, draftLines, slabs]);

  const individualSlabs = useMemo(
    () => slabs.filter((s) => s.mode === 'INDIVIDUAL').sort((a, b) => a.minQty - b.minQty),
    [slabs]
  );
  const wholesaleSlabs = useMemo(
    () => slabs.filter((s) => s.mode === 'WHOLESALE').sort((a, b) => a.minQty - b.minQty),
    [slabs]
  );

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (quoteError) {
      onShowToast('error', 'Pricing Slab Required', quoteError);
      return;
    }
    setSubmittingOrder(true);
    try {
      const res = await cscApi.createPvcOrder({
        orderMode,
        customerName: orderMode === 'INDIVIDUAL' ? custName : undefined,
        mobile: orderMode === 'INDIVIDUAL' ? custMobile : undefined,
        shopId: orderMode === 'WHOLESALE' ? selectedShopId : undefined,
        address: orderAddress,
        items: draftLines.filter((l) => l.quantity > 0),
        advancePayment: Number(advancePayment || 0),
        paymentMethod,
        paymentReference,
        remarks: orderRemarks,
      });
      onShowToast('success', 'PVC Order Created', `${res.data.orderId} · Total ${formatINR(res.data.grandTotal)}`);
      setCustName('');
      setCustMobile('');
      setAdvancePayment('0');
      setPaymentReference('');
      setOrderRemarks('');
      await loadAll();
    } catch (err) {
      onShowToast('error', 'Order Failed', extractFriendlyErrorMessage(err));
    } finally {
      setSubmittingOrder(false);
    }
  };

  const handleSaveSlab = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSlab(true);
    try {
      await cscApi.savePvcSlab({
        mode: slabMode,
        minQty: Number(slabMin),
        maxQty: Number(slabMax),
        ratePerCard: Number(slabRate),
        active: true,
      });
      onShowToast('success', `${slabMode} Slab Saved`);
      setSlabRate('');
      await loadAll();
    } catch (err) {
      onShowToast('error', 'Slab Validation Error', extractFriendlyErrorMessage(err));
    } finally {
      setSavingSlab(false);
    }
  };

  const handleDeleteSlab = async (id: string) => {
    try {
      await cscApi.deletePvcSlab(id);
      onShowToast('info', 'Slab Deleted');
      await loadAll();
    } catch (err) {
      onShowToast('error', 'Delete Failed', extractFriendlyErrorMessage(err));
    }
  };

  const handleCreateShop = async (e: React.FormEvent) => {
    e.preventDefault();
    setShopError(null);
    if (!shopName.trim() || !shopOwner.trim() || shopMobile.trim().length < 10) {
      setShopError('Shop Name, Owner Name, and valid 10-digit Mobile are required.');
      return;
    }
    setSavingShop(true);
    try {
      await cscApi.createWholesaleShop({
        shopName: shopName.trim(),
        ownerName: shopOwner.trim(),
        mobile: shopMobile.trim(),
        altMobile: shopAltMobile.trim(),
        address: shopAddress.trim(),
        remarks: shopRemarks.trim(),
      });
      onShowToast('success', 'Wholesale Shop Registered');
      setShopModalOpen(false);
      setShopName('');
      setShopOwner('');
      setShopMobile('');
      setShopAltMobile('');
      setShopAddress('');
      setShopRemarks('');
      await loadAll();
    } catch (err) {
      const msg = extractFriendlyErrorMessage(err, 'Unable to register wholesale shop.');
      setShopError(msg);
      onShowToast('error', 'Shop Registration Error', msg);
    } finally {
      setSavingShop(false);
    }
  };

  const handleInspectShop = async (id: string) => {
    try {
      const res = await cscApi.getWholesaleShopProfile(id);
      setShopProfile(res.data);
    } catch (err) {
      onShowToast('error', 'Failed to load Shop Profile', extractFriendlyErrorMessage(err));
    }
  };

  const handleCollectPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payOrder) return;
    setPaymentError(null);
    const amt = Number(payAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setPaymentError('Enter a valid positive payment amount.');
      return;
    }
    setSavingPayment(true);
    try {
      const res = await cscApi.collectPvcPayment(payOrder.orderId, {
        amount: amt,
        paymentMethod: payMethod,
        paymentReference: payRef.trim(),
      });
      onShowToast('success', 'Payment Collected', `Receipt ${res.data.receipt.receiptNumber}`);
      setPayOrder(null);
      await loadAll();
    } catch (err) {
      const msg = extractFriendlyErrorMessage(err, 'Unable to collect payment.');
      setPaymentError(msg);
      onShowToast('error', 'Payment Failed', msg);
    } finally {
      setSavingPayment(false);
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

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-neutral-950 dark:text-white">
            PVC Card Printing Desk (Individual &amp; Wholesale)
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            {cardTypes.length} Card Types · Individual Slabs Pre-configured · Wholesale Slabs:{' '}
            {wholesaleSlabs.length === 0 ? 'None Configured (Starts Blank)' : `${wholesaleSlabs.length} active`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="inline-flex rounded-md border border-neutral-200 dark:border-neutral-700 overflow-hidden bg-neutral-50 dark:bg-neutral-900">
            {(
              [
                { k: 'orders', label: `Orders Desk (${orders.length})` },
                { k: 'slabs', label: `Rate Slabs (${slabs.length})` },
                { k: 'shops', label: `Wholesale Shops (${shops.length})` },
                { k: 'cards', label: `Card Types (${cardTypes.length})` },
              ] as const
            ).map((t) => (
              <button
                key={t.k}
                type="button"
                onClick={() => setTab(t.k)}
                className={`px-3 h-8 text-xs font-medium cursor-pointer whitespace-nowrap ${
                  tab === t.k
                    ? 'bg-neutral-950 text-white dark:bg-white dark:text-neutral-950'
                    : 'text-neutral-600 dark:text-neutral-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={loadAll} loading={loading} icon={<RefreshCw className="h-3.5 w-3.5" />}>
            Refresh
          </Button>
        </div>
      </div>

      {/* TAB 1: ORDERS DESK */}
      {tab === 'orders' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Order Creation Panel */}
          <form
            onSubmit={handleCreateOrder}
            className="lg:col-span-5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 space-y-3.5 text-xs"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-neutral-950 dark:text-white flex items-center gap-1.5">
                <CreditCard className="h-4 w-4 text-blue-800 dark:text-blue-400" />
                New PVC Print Order
              </h3>
              <div className="inline-flex rounded border border-neutral-200 dark:border-neutral-700 overflow-hidden">
                {(['INDIVIDUAL', 'WHOLESALE'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setOrderMode(m)}
                    className={`px-2.5 h-7 text-[11px] font-semibold cursor-pointer ${
                      orderMode === m
                        ? 'bg-neutral-950 text-white dark:bg-white dark:text-neutral-950'
                        : 'text-neutral-600 dark:text-neutral-300'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {orderMode === 'INDIVIDUAL' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-medium mb-1">Customer Name *</label>
                  <input
                    type="text"
                    required
                    value={custName}
                    onChange={(e) => setCustName(e.target.value)}
                    placeholder="Citizen / Walk-in name"
                    className="w-full h-9 px-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
                  />
                </div>
                <div>
                  <label className="block font-medium mb-1">Mobile *</label>
                  <MobileNumberInput
                    required
                    value={custMobile}
                    onChange={setCustMobile}
                    aria-label="Customer mobile number"
                  />
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-medium">Select Wholesale Shop *</label>
                  <button
                    type="button"
                    onClick={() => setShopModalOpen(true)}
                    className="text-blue-800 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    + Register Shop
                  </button>
                </div>
                <select
                  required
                  value={selectedShopId}
                  onChange={(e) => setSelectedShopId(e.target.value)}
                  className="w-full h-9 px-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
                >
                  <option value="">-- Choose Registered Shop --</option>
                  {shops.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.shopName} ({s.ownerName} · {s.mobile})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Multi Card-Type Items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="font-medium">Card Types &amp; Quantities</label>
                <button
                  type="button"
                  onClick={() =>
                    setDraftLines((prev) => [
                      ...prev,
                      { cardTypeId: cardTypes[0]?.id || 'PVC-01', quantity: 1 },
                    ])
                  }
                  className="text-blue-800 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  + Add Card Line
                </button>
              </div>

              {draftLines.map((line, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <select
                    value={line.cardTypeId}
                    onChange={(e) =>
                      setDraftLines((prev) =>
                        prev.map((p, i) => (i === idx ? { ...p, cardTypeId: e.target.value } : p))
                      )
                    }
                    className="flex-1 h-9 px-2 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
                  >
                    {cardTypes.filter((c) => c.active).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="1"
                    value={line.quantity}
                    onChange={(e) =>
                      setDraftLines((prev) =>
                        prev.map((p, i) =>
                          i === idx ? { ...p, quantity: Math.max(1, Number(e.target.value)) } : p
                        )
                      )
                    }
                    className="w-20 h-9 px-2 font-mono text-right bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
                  />
                  {draftLines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setDraftLines((prev) => prev.filter((_, i) => i !== idx))}
                      className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {quoteError ? (
              <div className="p-3 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">Wholesale / Slab Configuration Required</div>
                  <div className="mt-0.5">{quoteError}</div>
                </div>
              </div>
            ) : (
              quoteItems.length > 0 && (
                <div className="p-3 rounded bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 space-y-1.5">
                  {quoteItems.map((q, i) => (
                    <div key={i} className="flex justify-between font-mono tabular-nums">
                      <span className="truncate">
                        {q.cardTypeName} ({q.quantity} × {formatINR(q.ratePerCard)})
                      </span>
                      <span className="font-semibold">{formatINR(q.lineTotal)}</span>
                    </div>
                  ))}
                  <div className="border-t border-neutral-200 dark:border-neutral-800 pt-1.5 flex justify-between font-bold text-sm">
                    <span>Grand Total</span>
                    <span className="font-mono text-emerald-700 dark:text-emerald-400">
                      {formatINR(quoteGrandTotal)}
                    </span>
                  </div>
                </div>
              )
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block font-medium mb-1">Advance / Paid Now (₹)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={advancePayment}
                  onChange={(e) => setAdvancePayment(e.target.value)}
                  className="w-full h-9 px-2.5 font-mono bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
                />
              </div>
              <div>
                <label className="block font-medium mb-1">Payment Method</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full h-9 px-2 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
                >
                  {paymentMethods.map((m) => (
                    <option key={m.id} value={m.name}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input
                type="text"
                value={orderAddress}
                onChange={(e) => setOrderAddress(e.target.value)}
                placeholder="Delivery address (optional)"
                className="h-9 px-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
              />
              <input
                type="text"
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                placeholder="UTR / Reference (optional)"
                className="h-9 px-2.5 font-mono bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
              />
            </div>

            <input
              type="text"
              value={orderRemarks}
              onChange={(e) => setOrderRemarks(e.target.value)}
              placeholder="Remarks..."
              className="w-full h-9 px-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
            />

            <Button type="submit" variant="primary" size="md" loading={submittingOrder} className="w-full" disabled={Boolean(quoteError)}>
              Create PVC Order
            </Button>
          </form>

          {/* PVC Orders List */}
          <div className="lg:col-span-7 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
                Recent PVC Card Orders
              </h3>
              <span className="text-xs font-mono text-neutral-500">{orders.length} total</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-neutral-50 dark:bg-neutral-950 border-b border-neutral-200 dark:border-neutral-800 text-neutral-500">
                  <tr>
                    <th className="px-3 py-2.5">Order / Party</th>
                    <th className="px-3 py-2.5">Mode &amp; Cards</th>
                    <th className="px-3 py-2.5 text-right">Total</th>
                    <th className="px-3 py-2.5 text-right">Due</th>
                    <th className="px-3 py-2.5">Delivery</th>
                    <th className="px-3 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {orders.map((o) => (
                    <tr key={o.orderId}>
                      <td className="px-3 py-2.5">
                        <div className="font-mono font-semibold text-neutral-950 dark:text-white">
                          {o.orderId}
                        </div>
                        <div className="text-neutral-700 dark:text-neutral-300">
                          {o.shopName ? `${o.shopName} (${o.customerName})` : o.customerName}
                        </div>
                        <div className="text-[11px] font-mono text-neutral-500">{o.mobile}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-mono text-[11px] font-semibold">{o.orderMode}</div>
                        <div className="text-neutral-500">
                          {o.totalCards} cards · {o.items.map((it) => it.cardTypeName).join(', ')}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        <div>{formatINR(o.grandTotal)}</div>
                        <div className="text-[11px] text-emerald-700 dark:text-emerald-400">
                          Paid {formatINR(o.totalPaid)}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums font-semibold">
                        <span className={o.remainingDue > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}>
                          {formatINR(o.remainingDue)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        <select
                          value={o.deliveryStatus}
                          onChange={async (e) => {
                            try {
                              await cscApi.updatePvcDelivery(
                                o.orderId,
                                e.target.value as PvcOrder['deliveryStatus']
                              );
                              await loadAll();
                            } catch (err) {
                              onShowToast('error', 'Update Failed', err instanceof Error ? err.message : undefined);
                            }
                          }}
                          className="h-7 px-1.5 text-[11px] bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
                        >
                          {(['Pending', 'Printing', 'Ready for Delivery', 'Delivered', 'Cancelled'] as const).map((st) => (
                            <option key={st} value={st}>
                              {st}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="inline-flex items-center gap-1">
                          {o.remainingDue > 0 && (
                            <Button
                              variant="primary"
                              size="sm"
                              icon={<Wallet className="h-3 w-3" />}
                              onClick={() => {
                                setPayOrder(o);
                                setPayAmount(String(o.remainingDue));
                              }}
                            >
                              Collect
                            </Button>
                          )}
                          {o.payments.length > 0 && (
                            <Button
                              variant="outline"
                              size="sm"
                              icon={<Printer className="h-3 w-3" />}
                              onClick={() => handlePrintReceipt(o.payments[o.payments.length - 1].receiptNumber)}
                            >
                              Receipt
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {orders.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-neutral-500">
                        No PVC card printing orders yet. Create an order on the left.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: RATE SLABS */}
      {tab === 'slabs' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 space-y-3 text-xs">
            <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
              Add PVC Rate Slab (Non-Overlapping)
            </h3>
            <p className="text-neutral-500">
              Wholesale mode intentionally initializes empty so you control exact bulk tiers.
            </p>
            {canEditSlabs ? (
              <form onSubmit={handleSaveSlab} className="space-y-3">
                <div>
                  <label className="block font-medium mb-1">Mode</label>
                  <select
                    value={slabMode}
                    onChange={(e) => setSlabMode(e.target.value as 'INDIVIDUAL' | 'WHOLESALE')}
                    className="w-full h-9 px-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
                  >
                    <option value="WHOLESALE">WHOLESALE</option>
                    <option value="INDIVIDUAL">INDIVIDUAL</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-medium mb-1">Min Qty *</label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={slabMin}
                      onChange={(e) => setSlabMin(e.target.value)}
                      className="w-full h-9 px-2.5 font-mono bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
                    />
                  </div>
                  <div>
                    <label className="block font-medium mb-1">Max Qty *</label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={slabMax}
                      onChange={(e) => setSlabMax(e.target.value)}
                      className="w-full h-9 px-2.5 font-mono bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
                    />
                  </div>
                </div>
                <div>
                  <label className="block font-medium mb-1">Rate Per Card (INR ₹) *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    required
                    value={slabRate}
                    onChange={(e) => setSlabRate(e.target.value)}
                    placeholder="e.g. 45"
                    className="w-full h-9 px-2.5 font-mono bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
                  />
                </div>
                <Button type="submit" variant="primary" size="sm" loading={savingSlab} className="w-full" icon={<Plus className="h-3.5 w-3.5" />}>
                  Save Rate Slab
                </Button>
              </form>
            ) : (
              <div className="p-3 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded text-neutral-500">
                Only ADMIN or Rate-Edit authorized users can modify slabs.
              </div>
            )}
          </div>

          <div className="lg:col-span-8 space-y-4">
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 font-semibold text-xs">
                Individual PVC Slabs (Pre-configured Samples)
              </div>
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50 dark:bg-neutral-950 text-neutral-500 border-b border-neutral-200 dark:border-neutral-800">
                  <tr>
                    <th className="px-4 py-2">Quantity Range</th>
                    <th className="px-4 py-2 text-right">Rate / Card</th>
                    <th className="px-4 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {individualSlabs.map((s) => (
                    <tr key={s.id}>
                      <td className="px-4 py-2 font-mono">{s.minQty} – {s.maxQty} Cards</td>
                      <td className="px-4 py-2 text-right font-mono font-semibold">{formatINR(s.ratePerCard)}</td>
                      <td className="px-4 py-2 text-right">
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => handleDeleteSlab(s.id)}
                            className="text-red-600 hover:underline cursor-pointer"
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 font-semibold text-xs flex justify-between">
                <span>Wholesale PVC Slabs</span>
                <span className="font-mono text-neutral-500">{wholesaleSlabs.length} configured</span>
              </div>
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50 dark:bg-neutral-950 text-neutral-500 border-b border-neutral-200 dark:border-neutral-800">
                  <tr>
                    <th className="px-4 py-2">Quantity Range</th>
                    <th className="px-4 py-2 text-right">Rate / Card</th>
                    <th className="px-4 py-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {wholesaleSlabs.map((s) => (
                    <tr key={s.id}>
                      <td className="px-4 py-2 font-mono">{s.minQty} – {s.maxQty} Cards</td>
                      <td className="px-4 py-2 text-right font-mono font-semibold">{formatINR(s.ratePerCard)}</td>
                      <td className="px-4 py-2 text-right">
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => handleDeleteSlab(s.id)}
                            className="text-red-600 hover:underline cursor-pointer"
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {wholesaleSlabs.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-6 text-center text-amber-700 dark:text-amber-400">
                        No Wholesale PVC Slabs configured yet. Use the form on the left to add non-overlapping Wholesale slabs.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: WHOLESALE SHOPS */}
      {tab === 'shops' && (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Building2 className="h-4 w-4" /> Registered Wholesale Partner Shops
            </h3>
            <Button
              type="button"
              variant="primary"
              size="sm"
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() => {
                setShopError(null);
                setShopModalOpen(true);
              }}
            >
              Add Wholesale Shop
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50 dark:bg-neutral-950 border-b border-neutral-200 dark:border-neutral-800 text-neutral-500">
                <tr>
                  <th className="px-4 py-2.5">Code / Shop</th>
                  <th className="px-4 py-2.5">Owner</th>
                  <th className="px-4 py-2.5">Mobile</th>
                  <th className="px-4 py-2.5">Address</th>
                  <th className="px-4 py-2.5 text-right">Profile</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {shops.map((sh) => (
                  <tr key={sh.id}>
                    <td className="px-4 py-2.5">
                      <div className="font-mono text-[11px] text-neutral-500">{sh.shopCode}</div>
                      <div className="font-semibold text-neutral-950 dark:text-white">{sh.shopName}</div>
                    </td>
                    <td className="px-4 py-2.5">{sh.ownerName}</td>
                    <td className="px-4 py-2.5 font-mono">{sh.mobile}</td>
                    <td className="px-4 py-2.5 text-neutral-600 dark:text-neutral-300">{sh.address}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Button variant="outline" size="sm" onClick={() => handleInspectShop(sh.id)}>
                        View Ledger Profile
                      </Button>
                    </td>
                  </tr>
                ))}
                {shops.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-neutral-500">
                      No wholesale shops registered yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: CARD TYPES */}
      {tab === 'cards' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {isAdmin && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await cscApi.createPvcCardType({ name: newCardName, description: newCardDesc });
                  onShowToast('success', 'Card Type Added');
                  setNewCardName('');
                  setNewCardDesc('');
                  await loadAll();
                } catch (err) {
                  onShowToast('error', 'Failed', err instanceof Error ? err.message : undefined);
                }
              }}
              className="lg:col-span-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 space-y-3 text-xs"
            >
              <h3 className="text-sm font-semibold">Add Custom PVC Card Type</h3>
              <input
                type="text"
                required
                value={newCardName}
                onChange={(e) => setNewCardName(e.target.value)}
                placeholder="Card type name..."
                className="w-full h-9 px-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
              />
              <input
                type="text"
                value={newCardDesc}
                onChange={(e) => setNewCardDesc(e.target.value)}
                placeholder="Description..."
                className="w-full h-9 px-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
              />
              <Button type="submit" variant="primary" size="sm" className="w-full">
                Add Card Type
              </Button>
            </form>
          )}
          <div className={`${isAdmin ? 'lg:col-span-8' : 'lg:col-span-12'} bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden`}>
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-50 dark:bg-neutral-950 border-b border-neutral-200 dark:border-neutral-800 text-neutral-500">
                <tr>
                  <th className="px-4 py-2.5">Code</th>
                  <th className="px-4 py-2.5">Card Name</th>
                  <th className="px-4 py-2.5">Description</th>
                  <th className="px-4 py-2.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {cardTypes.map((ct) => (
                  <tr key={ct.id}>
                    <td className="px-4 py-2.5 font-mono text-neutral-500">{ct.code}</td>
                    <td className="px-4 py-2.5 font-medium text-neutral-950 dark:text-white">{ct.name}</td>
                    <td className="px-4 py-2.5 text-neutral-500">{ct.description}</td>
                    <td className="px-4 py-2.5 text-right font-mono">{ct.active ? 'ACTIVE' : 'INACTIVE'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Register Shop Modal */}
      <Modal
        isOpen={shopModalOpen}
        onClose={() => {
          setShopError(null);
          setShopModalOpen(false);
        }}
        title="Register Wholesale Shop"
      >
        <form onSubmit={handleCreateShop} className="space-y-3 text-xs" noValidate>
          {shopError && (
            <div role="alert" className="px-3 py-2 rounded border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300">
              {shopError}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              required
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              placeholder="Shop Name *"
              className="h-9 px-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
            />
            <input
              type="text"
              required
              value={shopOwner}
              onChange={(e) => setShopOwner(e.target.value)}
              placeholder="Owner Name *"
              className="h-9 px-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
            />
            <div>
              <label className="block font-medium mb-1">Shop Mobile *</label>
              <MobileNumberInput
                required
                value={shopMobile}
                onChange={setShopMobile}
                aria-label="Wholesale shop mobile number"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Alternate Mobile (Optional)</label>
              <MobileNumberInput
                value={shopAltMobile}
                onChange={setShopAltMobile}
                aria-label="Wholesale shop alternate mobile number"
              />
            </div>
          </div>
          <input
            type="text"
            required
            value={shopAddress}
            onChange={(e) => setShopAddress(e.target.value)}
            placeholder="Full Shop Address *"
            className="w-full h-9 px-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
          />
          <input
            type="text"
            value={shopRemarks}
            onChange={(e) => setShopRemarks(e.target.value)}
            placeholder="Remarks (optional)"
            className="w-full h-9 px-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setShopError(null);
                setShopModalOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={savingShop}>
              Register Shop
            </Button>
          </div>
        </form>
      </Modal>

      {/* Shop Profile Modal */}
      <Modal
        isOpen={Boolean(shopProfile)}
        onClose={() => setShopProfile(null)}
        title={`Shop Profile — ${shopProfile?.shop.shopName || ''}`}
      >
        {shopProfile && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <div className="p-2.5 rounded border border-neutral-200 dark:border-neutral-800">
                <div className="text-neutral-500">Orders</div>
                <div className="text-base font-bold font-mono">{shopProfile.metrics.totalOrders}</div>
              </div>
              <div className="p-2.5 rounded border border-neutral-200 dark:border-neutral-800">
                <div className="text-neutral-500">Cards Printed</div>
                <div className="text-base font-bold font-mono">{shopProfile.metrics.totalCardsPrinted}</div>
              </div>
              <div className="p-2.5 rounded border border-neutral-200 dark:border-neutral-800">
                <div className="text-neutral-500">Total Billed</div>
                <div className="text-base font-bold font-mono">{formatINR(shopProfile.metrics.totalBilled)}</div>
              </div>
              <div className="p-2.5 rounded border border-neutral-200 dark:border-neutral-800">
                <div className="text-neutral-500">Total Paid</div>
                <div className="text-base font-bold font-mono text-emerald-700">{formatINR(shopProfile.metrics.totalPaid)}</div>
              </div>
              <div className="p-2.5 rounded border border-neutral-200 dark:border-neutral-800">
                <div className="text-neutral-500">Pending Due</div>
                <div className="text-base font-bold font-mono text-amber-700">{formatINR(shopProfile.metrics.pendingDue)}</div>
              </div>
            </div>
            <div className="max-h-60 overflow-y-auto border border-neutral-200 dark:border-neutral-800 rounded">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50 dark:bg-neutral-950 border-b border-neutral-200 dark:border-neutral-800">
                  <tr>
                    <th className="px-3 py-2">Order</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2 text-right">Cards</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2 text-right">Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                  {shopProfile.orders.map((o) => (
                    <tr key={o.orderId}>
                      <td className="px-3 py-2 font-mono">{o.orderId}</td>
                      <td className="px-3 py-2 font-mono">{formatDateIST(o.orderDate)}</td>
                      <td className="px-3 py-2 text-right font-mono">{o.totalCards}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatINR(o.grandTotal)}</td>
                      <td className="px-3 py-2 text-right font-mono">{formatINR(o.remainingDue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>

      {/* Collect PVC Payment Modal */}
      <Modal
        isOpen={Boolean(payOrder)}
        onClose={() => {
          setPaymentError(null);
          setPayOrder(null);
        }}
        title={`Collect Due — ${payOrder?.orderId || ''}`}
      >
        <form onSubmit={handleCollectPayment} className="space-y-3 text-xs" noValidate>
          {paymentError && (
            <div role="alert" className="px-3 py-2 rounded border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300">
              {paymentError}
            </div>
          )}
          <div>
            Remaining Due: <strong className="font-mono">{formatINR(payOrder?.remainingDue ?? 0)}</strong>
          </div>
          <input
            type="number"
            min="1"
            step="0.01"
            required
            value={payAmount}
            onChange={(e) => setPayAmount(e.target.value)}
            className="w-full h-9 px-3 font-mono bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
          />
          <select
            value={payMethod}
            onChange={(e) => setPayMethod(e.target.value)}
            className="w-full h-9 px-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
          >
            {paymentMethods.map((m) => (
              <option key={m.id} value={m.name}>
                {m.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={payRef}
            onChange={(e) => setPayRef(e.target.value)}
            placeholder="Payment reference (optional)"
            className="w-full h-9 px-3 font-mono bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setPaymentError(null);
                setPayOrder(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" loading={savingPayment}>
              Record Payment
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
