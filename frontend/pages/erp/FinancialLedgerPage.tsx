import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, CreditCard, Plus, Printer, Receipt, Wallet } from 'lucide-react';
import {
  DailyCashClosingRecord,
  ErpExpenseItem,
  ErpPaymentItem,
  ErpRefundItem,
  PageKey,
  UserProfile,
} from '../../modules/types';
import { erpApi } from '../../services/erpApi';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { formatCurrency } from '../../services/apiClient';
import { formatDateIST } from '../../services/formatters';

interface FinancialLedgerPageProps {
  currentUser: UserProfile;
  mode: 'transactions' | 'cashbook' | 'expenses' | 'income';
  dailyCashClosings: DailyCashClosingRecord[];
  onNavigate?: (page: PageKey) => void;
  onShowToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}

export const FinancialLedgerPage: React.FC<FinancialLedgerPageProps> = ({
  currentUser,
  mode,
  dailyCashClosings,
  onNavigate,
  onShowToast,
}) => {
  const [payments, setPayments] = useState<ErpPaymentItem[]>([]);
  const [refunds, setRefunds] = useState<ErpRefundItem[]>([]);
  const [expenses, setExpenses] = useState<ErpExpenseItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [expModalOpen, setExpModalOpen] = useState(false);
  const [expForm, setExpForm] = useState({
    category: 'Office Utilities',
    description: '',
    counterCode: 'CTR-01',
    amount: 0,
  });

  const [printReceipt, setPrintReceipt] = useState<ErpPaymentItem | null>(null);

  const loadFinance = useCallback(async () => {
    setLoading(true);
    try {
      const res = await erpApi.getFinanceLedger();
      setPayments(res.data.payments);
      setRefunds(res.data.refunds);
      setExpenses(res.data.expenses);
    } catch (err) {
      onShowToast('error', 'Finance Load Failed', err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [onShowToast]);

  useEffect(() => {
    loadFinance();
  }, [loadFinance]);

  const totalCollected = payments
    .filter((p) => p.verificationStatus === 'Confirmed')
    .reduce((s, p) => s + p.amount, 0);
  const totalRefunded = refunds
    .filter((r) => r.status === 'Processed')
    .reduce((s, r) => s + r.refundAmount, 0);
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
  const netCashbook = totalCollected - totalRefunded - totalExpenses;

  const canManage = currentUser.role === 'ADMIN' || currentUser.role === 'MANAGER';
  const isAuditor = currentUser.role === 'AUDITOR';

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-neutral-950 dark:text-white capitalize">
            {mode === 'transactions'
              ? 'Transactions, Receipts & Refunds'
              : mode === 'cashbook'
                ? 'Counter Cashbook & Reconciliation'
                : mode === 'expenses'
                  ? 'Expenses & Disbursement Vouchers'
                  : 'Service Income & Net Revenue'}
          </h2>
          <p className="text-xs text-neutral-500 mt-1">
            Linked strictly to MCA Applications, MCR Receipts, MCI Invoices, MCRF Refund Guards &amp; Double-Entry General Ledger
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onNavigate && (
            <>
              <Button size="sm" variant="outline" onClick={() => onNavigate('chart-of-accounts')}>
                GL Vouchers &amp; CoA
              </Button>
              <Button size="sm" variant="outline" onClick={() => onNavigate('banking-csp')}>
                PNB CSP Isolated Desk
              </Button>
            </>
          )}
          {!isAuditor && (mode === 'expenses' || mode === 'cashbook') && (
            <Button size="sm" variant="primary" onClick={() => setExpModalOpen(true)} icon={<Plus className="h-3.5 w-3.5" />}>
              Log Expense Voucher
            </Button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4">
          <div className="text-neutral-500 flex items-center justify-between">
            <span>Confirmed Collections</span>
            <CreditCard className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-lg font-bold font-mono">{formatCurrency(totalCollected)}</div>
        </div>
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4">
          <div className="text-neutral-500 flex items-center justify-between">
            <span>Processed Refunds</span>
            <Receipt className="h-4 w-4 text-amber-600" />
          </div>
          <div className="mt-2 text-lg font-bold font-mono">{formatCurrency(totalRefunded)}</div>
        </div>
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4">
          <div className="text-neutral-500 flex items-center justify-between">
            <span>Operating Expenses</span>
            <Wallet className="h-4 w-4 text-neutral-500" />
          </div>
          <div className="mt-2 text-lg font-bold font-mono">{formatCurrency(totalExpenses)}</div>
        </div>
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4">
          <div className="text-neutral-500">Net Ledger Balance</div>
          <div className="mt-2 text-lg font-bold font-mono text-neutral-950 dark:text-white">
            {formatCurrency(netCashbook)}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="p-6 text-xs text-neutral-500">Loading financial records...</div>
      ) : (mode === 'transactions' || mode === 'income') ? (
        <div className="space-y-4">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 text-xs font-semibold">
              Payment Receipts &amp; Tax Invoices ({payments.length})
            </div>
            <div className="divide-y divide-neutral-100 dark:divide-neutral-800 text-xs">
              {payments.map((p) => (
                <div key={p.transactionId} className="p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-mono font-bold">
                      {p.receiptNo} {p.invoiceNo ? `· ${p.invoiceNo}` : ''} · {p.applicationNo}
                    </div>
                    <div className="text-neutral-600 dark:text-neutral-300">
                      {p.customerName} — {p.serviceName} ({p.paymentMethod}{p.upiReference ? ` · ${p.upiReference}` : ''})
                    </div>
                    <div className="text-[11px] text-neutral-500">
                      Status: {p.verificationStatus} · Counter {p.counterCode} · {formatDateIST(p.recordedAt.slice(0, 10))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-sm">{formatCurrency(p.amount)}</span>
                    {canManage && p.verificationStatus === 'Pending Verification' && (
                      <Button
                        size="sm"
                        variant="primary"
                        icon={<CheckCircle2 className="h-3 w-3" />}
                        onClick={async () => {
                          await erpApi.verifyPayment(p.transactionId, 'Confirmed');
                          onShowToast('success', 'UPI Settlement Verified');
                          loadFinance();
                        }}
                      >
                        Verify UPI
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      icon={<Printer className="h-3 w-3" />}
                      onClick={() => setPrintReceipt(p)}
                    >
                      A4 Print
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {refunds.length > 0 && (
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 text-xs font-semibold">
                Cancellation Refunds ({refunds.length})
              </div>
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800 text-xs">
                {refunds.map((r) => (
                  <div key={r.refundId} className="p-3 flex items-center justify-between">
                    <div>
                      <span className="font-mono font-bold">{r.refundId}</span> · {r.applicationNo} · {r.refundReason} ({r.status})
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold">{formatCurrency(r.refundAmount)}</span>
                      {currentUser.role === 'ADMIN' && r.status === 'Pending' && (
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={async () => {
                            await erpApi.processRefund(r.refundId, 'Processed');
                            loadFinance();
                          }}
                        >
                          Process Refund
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : mode === 'expenses' ? (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg divide-y divide-neutral-100 dark:divide-neutral-800 text-xs">
          {expenses.map((e) => (
            <div key={e.voucherNo} className="p-4 flex items-center justify-between">
              <div>
                <div className="font-mono font-bold">{e.voucherNo} · {e.category}</div>
                <div className="text-neutral-500">{e.description} · Counter {e.counterCode} · By {e.recordedBy}</div>
              </div>
              <div className="font-mono font-bold text-sm">{formatCurrency(e.amount)}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg divide-y divide-neutral-100 dark:divide-neutral-800 text-xs">
          <div className="p-4 font-semibold">Daily Cash Closing &amp; Counter Reconciliation</div>
          {dailyCashClosings.map((c) => (
            <div key={c.closingCode} className="p-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-mono font-bold">{c.closingCode} · {c.counterCode} ({c.closingDate})</div>
                <div className="text-neutral-500">
                  Opening {formatCurrency(c.openingCash)} + Received {formatCurrency(c.cashReceived)} − Expenses {formatCurrency(c.cashExpenses)} = Expected {formatCurrency(c.expectedCash)}
                </div>
              </div>
              <div className="text-right font-mono">
                <div className="font-bold">Actual: {formatCurrency(c.actualCashCount)}</div>
                <div className="text-neutral-500">{c.approvalStatus}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Expense Modal */}
      <Modal isOpen={expModalOpen} onClose={() => setExpModalOpen(false)} title="Record Expense Voucher">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await erpApi.createExpense(expForm);
            setExpModalOpen(false);
            setExpForm({ category: 'Office Utilities', description: '', counterCode: 'CTR-01', amount: 0 });
            onShowToast('success', 'Expense Voucher Recorded');
            loadFinance();
          }}
          className="space-y-3 text-xs"
        >
          <input
            required
            value={expForm.category}
            onChange={(e) => setExpForm({ ...expForm, category: e.target.value })}
            placeholder="Expense Category"
            className="w-full h-9 px-3 border rounded bg-white dark:bg-neutral-950"
          />
          <input
            required
            value={expForm.description}
            onChange={(e) => setExpForm({ ...expForm, description: e.target.value })}
            placeholder="Description"
            className="w-full h-9 px-3 border rounded bg-white dark:bg-neutral-950"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              required
              min={1}
              value={expForm.amount}
              onChange={(e) => setExpForm({ ...expForm, amount: Number(e.target.value) })}
              placeholder="Amount (₹)"
              className="h-9 px-3 border rounded font-mono bg-white dark:bg-neutral-950"
            />
            <input
              value={expForm.counterCode}
              onChange={(e) => setExpForm({ ...expForm, counterCode: e.target.value })}
              className="h-9 px-3 border rounded font-mono bg-white dark:bg-neutral-950"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setExpModalOpen(false)}>Cancel</Button>
            <Button type="submit" size="sm" variant="primary">Save Voucher</Button>
          </div>
        </form>
      </Modal>

      {/* Receipt Print Preview */}
      <Modal
        isOpen={Boolean(printReceipt)}
        onClose={() => setPrintReceipt(null)}
        title={`A4 Print Preview · ${printReceipt?.receiptNo}`}
      >
        {printReceipt && (
          <div className="space-y-4">
            <div className="p-6 border-2 border-neutral-950 rounded bg-white text-neutral-950 text-xs space-y-3">
              <div className="flex justify-between border-b border-neutral-300 pb-2">
                <div>
                  <div className="font-bold text-sm">MUN COMPUTER — OFFICIAL PAYMENT RECEIPT</div>
                  <div>Mamudpur, Juginda, Domkal, Murshidabad, WB - 742406</div>
                </div>
                <div className="text-right font-mono">
                  <div className="font-bold">{printReceipt.receiptNo}</div>
                  {printReceipt.invoiceNo && <div>Invoice: {printReceipt.invoiceNo}</div>}
                </div>
              </div>
              <div>Customer: <strong>{printReceipt.customerName}</strong> ({printReceipt.customerId})</div>
              <div>Application: <strong className="font-mono">{printReceipt.applicationNo}</strong> — {printReceipt.serviceName}</div>
              <div>Method: {printReceipt.paymentMethod} · Counter {printReceipt.counterCode}</div>
              <div className="text-base font-bold font-mono pt-2 border-t border-neutral-200">
                Amount Settled: {formatCurrency(printReceipt.amount)}
              </div>
            </div>
            <div className="flex justify-end no-print">
              <Button size="sm" variant="primary" onClick={() => window.print()} icon={<Printer className="h-3.5 w-3.5" />}>
                Print A4 Receipt
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
