import React, { useCallback, useEffect, useState } from 'react';
import { ArrowDownToLine, Boxes, Plus, ShoppingCart } from 'lucide-react';
import { UserProfile } from '../../modules/types';
import { financeApi } from '../../services/financeApi';
import { formatCurrency } from '../../services/apiClient';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';

interface ProductsInventoryPageProps {
  currentUser: UserProfile;
  mode: 'products' | 'inventory';
  onShowToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}

export const ProductsInventoryPage: React.FC<ProductsInventoryPageProps> = ({
  currentUser,
  mode,
  onShowToast,
}) => {
  const [items, setItems] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [newModal, setNewModal] = useState(false);
  const [posModal, setPosModal] = useState(false);
  const [purchaseModal, setPurchaseModal] = useState(false);

  const [prodForm, setProdForm] = useState({
    sku: '',
    name: '',
    category: 'Storage Hardware',
    hsnSac: '847170',
    gstRatePct: 18,
    valuationMethod: 'FIFO',
    sellingPrice: 1200,
    initialQty: 5,
    initialUnitCost: 850,
  });

  const [posForm, setPosForm] = useState({
    sku: '',
    quantity: 1,
    customerName: 'Walk-in Customer',
    paymentMethod: 'Cash',
  });

  const [purchaseForm, setPurchaseForm] = useState({
    sku: '',
    quantity: 5,
    unitCost: 2750,
    paymentAccount: '1010',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await financeApi.getProducts();
      setItems(res.data.products);
      setMovements(res.data.movements);
      if (res.data.products.length > 0 && !posForm.sku) {
        setPosForm((p) => ({ ...p, sku: res.data.products[0].sku }));
        setPurchaseForm((p) => ({ ...p, sku: res.data.products[0].sku }));
      }
    } catch (err) {
      onShowToast('error', 'Failed to load Inventory', err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [onShowToast, posForm.sku]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const canManage = currentUser.role === 'ADMIN' || currentUser.role === 'MANAGER';
  const canSell = currentUser.role !== 'AUDITOR';

  const totalUnits = items.reduce((s, p) => s + p.qtyOnHand, 0);
  const totalValue = items.reduce((s, p) => s + p.stockValue, 0);
  const lowStockCount = items.filter((p) => p.stockStatus !== 'in_stock').length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-neutral-950 dark:text-white">
            {mode === 'products'
              ? 'Products Catalog & POS Billing (Module 65)'
              : 'FIFO / WAC Inventory Valuation & COGS (Module 78)'}
          </h2>
          <p className="text-xs text-neutral-500 mt-1">
            Automated stock layer tracking, GST output calculation &amp; real-time COGS double-entry GL posting
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canSell && (
            <Button
              size="sm"
              variant="primary"
              icon={<ShoppingCart className="h-3.5 w-3.5" />}
              onClick={() => setPosModal(true)}
            >
              POS Sale + COGS
            </Button>
          )}
          {canManage && (
            <>
              <Button
                size="sm"
                variant="outline"
                icon={<ArrowDownToLine className="h-3.5 w-3.5" />}
                onClick={() => setPurchaseModal(true)}
              >
                Purchase Stock In
              </Button>
              <Button
                size="sm"
                variant="outline"
                icon={<Plus className="h-3.5 w-3.5" />}
                onClick={() => setNewModal(true)}
              >
                New SKU
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4">
          <div className="text-neutral-500 flex items-center justify-between">
            <span>Total Stock Valuation (FIFO / WAC)</span>
            <Boxes className="h-4 w-4 text-neutral-400" />
          </div>
          <div className="mt-2 text-lg font-bold font-mono tabular-nums">{formatCurrency(totalValue)}</div>
        </div>
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4">
          <div className="text-neutral-500">Units on Hand across {items.length} SKUs</div>
          <div className="mt-2 text-lg font-bold font-mono tabular-nums">{totalUnits} units</div>
        </div>
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4">
          <div className="text-neutral-500">Low / Out-of-Stock Alerts</div>
          <div className="mt-2 text-lg font-bold font-mono tabular-nums text-amber-700 dark:text-amber-400">
            {lowStockCount} SKU(s)
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 text-xs font-semibold">
          Hardware &amp; Consumables Catalog + Valuation Layers ({items.length})
        </div>
        {loading ? (
          <div className="p-6 text-xs text-neutral-500">Loading SKU valuation layers...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-neutral-50 dark:bg-neutral-950 border-b border-neutral-200 dark:border-neutral-800 text-neutral-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">SKU</th>
                  <th className="px-4 py-2.5 font-medium">Product &amp; HSN/GST</th>
                  <th className="px-4 py-2.5 font-medium">Method</th>
                  <th className="px-4 py-2.5 font-medium text-right">Qty On Hand</th>
                  <th className="px-4 py-2.5 font-medium text-right">Avg Unit Cost</th>
                  <th className="px-4 py-2.5 font-medium text-right">Selling Price</th>
                  <th className="px-4 py-2.5 font-medium text-right">Stock Asset Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {items.map((p) => (
                  <tr key={p.sku} className="hover:bg-neutral-50 dark:hover:bg-neutral-950/60">
                    <td className="px-4 py-2.5 font-mono font-semibold">{p.sku}</td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-neutral-950 dark:text-white">{p.name}</div>
                      <div className="text-[11px] text-neutral-500">
                        {p.category} · HSN {p.hsnSac} · GST {p.gstRatePct}%
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-mono">{p.valuationMethod}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                      {p.qtyOnHand} ({p.stockStatus})
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatCurrency(p.avgUnitCost)}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatCurrency(p.sellingPrice)}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold tabular-nums">
                      {formatCurrency(p.stockValue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {movements.length > 0 && (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 text-xs font-semibold">
            COGS &amp; Stock Movement Audit Log ({movements.length})
          </div>
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800 text-xs">
            {movements.map((m) => (
              <div key={m.movementId} className="p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-mono font-bold">
                    {m.movementId} · {m.movementType} · {m.sku} ({m.quantity} units) · Voucher {m.voucherNo}
                  </div>
                  <div className="text-neutral-500 mt-0.5">{m.notes}</div>
                </div>
                <div className="text-right font-mono tabular-nums">
                  {m.saleTotal > 0 && (
                    <div className="font-semibold text-emerald-700 dark:text-emerald-400">
                      Sale {formatCurrency(m.saleTotal)} + GST {formatCurrency(m.gstAmount)}
                    </div>
                  )}
                  <div className="text-neutral-600 dark:text-neutral-300">
                    COGS / Cost: {formatCurrency(m.cogsTotal)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal isOpen={posModal} onClose={() => setPosModal(false)} title="Record POS Hardware Sale (Auto COGS & GST Journal)">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const res: any = await financeApi.posSale(posForm);
              onShowToast('success', 'POS Sale Posted', `Voucher ${res.data.voucher.voucherNo} created with FIFO/WAC COGS.`);
              setPosModal(false);
              loadData();
            } catch (err) {
              onShowToast('error', 'POS Sale Failed', err instanceof Error ? err.message : undefined);
            }
          }}
          className="space-y-3 text-xs"
        >
          <div>
            <label className="block font-medium mb-1">Select Product SKU</label>
            <select
              value={posForm.sku}
              onChange={(e) => setPosForm({ ...posForm, sku: e.target.value })}
              className="w-full h-9 px-3 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
            >
              {items.map((p) => (
                <option key={p.sku} value={p.sku}>
                  {p.sku} — {p.name} (Avail: {p.qtyOnHand} @ {formatCurrency(p.sellingPrice)})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium mb-1">Quantity</label>
              <input
                type="number"
                min={1}
                value={posForm.quantity}
                onChange={(e) => setPosForm({ ...posForm, quantity: Number(e.target.value) })}
                className="w-full h-9 px-3 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Settlement Mode</label>
              <select
                value={posForm.paymentMethod}
                onChange={(e) => setPosForm({ ...posForm, paymentMethod: e.target.value })}
                className="w-full h-9 px-3 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
              >
                <option value="Cash">Counter Cash (1001)</option>
                <option value="Bank">Bank / UPI (1010)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block font-medium mb-1">Customer / Party Name</label>
            <input
              value={posForm.customerName}
              onChange={(e) => setPosForm({ ...posForm, customerName: e.target.value })}
              className="w-full h-9 px-3 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setPosModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm">
              Complete Sale &amp; Post GL
            </Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={purchaseModal} onClose={() => setPurchaseModal(false)} title="Purchase Stock In (Adds Cost Layer)">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await financeApi.purchaseInventory(purchaseForm);
              onShowToast('success', 'Stock Layer Added', `Inventory & GL updated.`);
              setPurchaseModal(false);
              loadData();
            } catch (err) {
              onShowToast('error', 'Purchase Failed', err instanceof Error ? err.message : undefined);
            }
          }}
          className="space-y-3 text-xs"
        >
          <div>
            <label className="block font-medium mb-1">SKU</label>
            <select
              value={purchaseForm.sku}
              onChange={(e) => setPurchaseForm({ ...purchaseForm, sku: e.target.value })}
              className="w-full h-9 px-3 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
            >
              {items.map((p) => (
                <option key={p.sku} value={p.sku}>
                  {p.sku} — {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium mb-1">Quantity Purchased</label>
              <input
                type="number"
                min={1}
                value={purchaseForm.quantity}
                onChange={(e) => setPurchaseForm({ ...purchaseForm, quantity: Number(e.target.value) })}
                className="w-full h-9 px-3 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Unit Cost (₹)</label>
              <input
                type="number"
                min={1}
                value={purchaseForm.unitCost}
                onChange={(e) => setPurchaseForm({ ...purchaseForm, unitCost: Number(e.target.value) })}
                className="w-full h-9 px-3 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
              />
            </div>
          </div>
          <div>
            <label className="block font-medium mb-1">Credit Account</label>
            <select
              value={purchaseForm.paymentAccount}
              onChange={(e) => setPurchaseForm({ ...purchaseForm, paymentAccount: e.target.value })}
              className="w-full h-9 px-3 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
            >
              <option value="1010">Main Business Bank (1010)</option>
              <option value="1001">Counter 01 Cash (1001)</option>
              <option value="2001">Supplier Accounts Payable (2001)</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setPurchaseModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm">
              Record Stock Purchase
            </Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={newModal} onClose={() => setNewModal(false)} title="Create Product SKU">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await financeApi.createProduct(prodForm);
              onShowToast('success', 'Product SKU Created', `${prodForm.sku} added.`);
              setNewModal(false);
              loadData();
            } catch (err) {
              onShowToast('error', 'SKU Creation Failed', err instanceof Error ? err.message : undefined);
            }
          }}
          className="space-y-3 text-xs"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium mb-1">SKU Code</label>
              <input
                required
                placeholder="PRD-USB-64"
                value={prodForm.sku}
                onChange={(e) => setProdForm({ ...prodForm, sku: e.target.value })}
                className="w-full h-9 px-3 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Valuation Method</label>
              <select
                value={prodForm.valuationMethod}
                onChange={(e) => setProdForm({ ...prodForm, valuationMethod: e.target.value })}
                className="w-full h-9 px-3 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
              >
                <option value="FIFO">FIFO (First-In First-Out)</option>
                <option value="WAC">WAC (Weighted Average Cost)</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block font-medium mb-1">Product Name</label>
              <input
                required
                value={prodForm.name}
                onChange={(e) => setProdForm({ ...prodForm, name: e.target.value })}
                className="w-full h-9 px-3 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Selling Price (₹)</label>
              <input
                type="number"
                value={prodForm.sellingPrice}
                onChange={(e) => setProdForm({ ...prodForm, sellingPrice: Number(e.target.value) })}
                className="w-full h-9 px-3 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">GST Rate (%)</label>
              <input
                type="number"
                value={prodForm.gstRatePct}
                onChange={(e) => setProdForm({ ...prodForm, gstRatePct: Number(e.target.value) })}
                className="w-full h-9 px-3 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Initial Qty</label>
              <input
                type="number"
                value={prodForm.initialQty}
                onChange={(e) => setProdForm({ ...prodForm, initialQty: Number(e.target.value) })}
                className="w-full h-9 px-3 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Initial Unit Cost (₹)</label>
              <input
                type="number"
                value={prodForm.initialUnitCost}
                onChange={(e) => setProdForm({ ...prodForm, initialUnitCost: Number(e.target.value) })}
                className="w-full h-9 px-3 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setNewModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm">
              Create Product
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
