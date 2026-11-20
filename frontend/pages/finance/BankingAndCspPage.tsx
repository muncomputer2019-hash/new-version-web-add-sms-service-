import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeftRight, CheckCircle2, Landmark, Plus, ShieldAlert } from 'lucide-react';
import { UserProfile } from '../../modules/types';
import { financeApi, FinanceOverviewPayload } from '../../services/financeApi';
import { formatCurrency } from '../../services/apiClient';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';

interface BankingAndCspPageProps {
  currentUser: UserProfile;
  onShowToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}

export const BankingAndCspPage: React.FC<BankingAndCspPageProps> = ({
  currentUser,
  onShowToast,
}) => {
  const [data, setData] = useState<FinanceOverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'counters' | 'brs' | 'pnb-csp'>('pnb-csp');

  const [cspModal, setCspModal] = useState(false);
  const [cspForm, setCspForm] = useState({
    txnType: 'Customer Deposit',
    customerRef: '',
    principalAmount: 5000,
    commissionIncome: 25,
    remarks: '',
  });

  const [xferModal, setXferModal] = useState(false);
  const [xferForm, setXferForm] = useState({
    fromCounterCode: 'CTR-01',
    toTargetType: 'BANK',
    toTargetCode: 'BNK-MAIN-01',
    amount: 5000,
    notes: 'Daily counter bank deposit',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await financeApi.getOverview('ENT-MAIN');
      setData(res.data);
    } catch (err) {
      onShowToast('error', 'Load Failed', err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [onShowToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading || !data) {
    return <div className="p-6 text-xs text-neutral-500">Loading Banking, Counters &amp; PNB CSP Desk...</div>;
  }

  const canManage = currentUser.role === 'ADMIN' || currentUser.role === 'MANAGER';
  const canOperate = currentUser.role !== 'AUDITOR';

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-neutral-950 dark:text-white">
            Multi-Cash Counters, Bank Reconciliation &amp; Segregated PNB CSP Desk
          </h2>
          <p className="text-xs text-neutral-500 mt-1">
            Modules 04, 05, 08, 21, 41, 76, 81, 82 · Strict separation between Customer PNB Banking funds and Business P&amp;L
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {canOperate && (
            <Button size="sm" variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setCspModal(true)}>
              Log PNB CSP Transaction
            </Button>
          )}
          {canManage && (
            <Button size="sm" variant="outline" icon={<ArrowLeftRight className="h-3.5 w-3.5" />} onClick={() => setXferModal(true)}>
              Counter Contra Transfer
            </Button>
          )}
        </div>
      </div>

      {/* Mandatory PNB CSP Segregation Notice */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 text-xs flex items-start gap-3">
        <ShieldAlert className="h-4 w-4 text-blue-800 dark:text-blue-400 shrink-0 mt-0.5" />
        <div>
          <div className="font-semibold text-neutral-950 dark:text-white">
            PNB CSP Trust Fund Segregation Enforced (Special Business Rule)
          </div>
          <p className="text-neutral-600 dark:text-neutral-300 mt-0.5">
            Customer Banking Deposits ({formatCurrency(data.kpis.pnbCspIsolated.deposits)}) &amp; Withdrawals (
            {formatCurrency(data.kpis.pnbCspIsolated.withdrawals)}) remain strictly isolated in{' '}
            <span className="font-mono font-semibold">ENT-PNB-CSP</span> and never inflate MUN COMPUTER&apos;s cashbook or revenue.
            Only verified CSP Commission ({formatCurrency(data.kpis.pnbCspIsolated.commissionRecognizedToBusiness)}) is posted to GL 4105.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-neutral-200 dark:border-neutral-800 pb-3">
        {[
          { id: 'pnb-csp', label: `PNB CSP Isolated Ledger (${data.pnbCspLedger.length})` },
          { id: 'counters', label: `Cash Counters & Payment Modes (${data.cashCounters.length})` },
          { id: 'brs', label: `Bank Accounts, Cheques & BRS (${data.bankStatements.length})` },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id as any)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md border cursor-pointer ${
              tab === t.id
                ? 'bg-neutral-950 text-white border-neutral-950 dark:bg-white dark:text-neutral-950 dark:border-white'
                : 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'pnb-csp' && (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-neutral-50 dark:bg-neutral-950 border-b border-neutral-200 dark:border-neutral-800 text-neutral-500">
              <tr>
                <th className="px-4 py-2.5">CSP ID</th>
                <th className="px-4 py-2.5">Type</th>
                <th className="px-4 py-2.5">Customer Banking Ref</th>
                <th className="px-4 py-2.5 text-right">Customer Principal (Isolated)</th>
                <th className="px-4 py-2.5 text-right">MUN Commission (GL 4105)</th>
                <th className="px-4 py-2.5">Voucher</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {data.pnbCspLedger.map((e) => (
                <tr key={e.cspTxnId}>
                  <td className="px-4 py-2.5 font-mono font-semibold">{e.cspTxnId}</td>
                  <td className="px-4 py-2.5">{e.txnType}</td>
                  <td className="px-4 py-2.5">
                    <div>{e.customerRef}</div>
                    <div className="text-[11px] text-neutral-500">{e.remarks}</div>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatCurrency(e.principalAmount)}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                    {formatCurrency(e.commissionIncome)}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-neutral-500">{e.commissionPostedVoucher || 'Commission N/A'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'counters' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            {data.cashCounters.map((c) => (
              <div key={c.counterCode} className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4">
                <div className="font-mono font-bold text-neutral-950 dark:text-white">{c.counterCode}</div>
                <div className="text-neutral-500 mt-0.5">{c.counterName}</div>
                <div className="mt-3 text-lg font-bold font-mono tabular-nums">{formatCurrency(c.currentBalance)}</div>
                <div className="mt-1 text-[11px] text-neutral-500">
                  Entity: {c.entityCode} · Custodian: {c.custodianUserId}
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 text-xs font-semibold">
              Payment Modes &amp; Gateway Readiness (Modules 05, 21)
            </div>
            <div className="divide-y divide-neutral-100 dark:divide-neutral-800 text-xs">
              {data.paymentModes.map((pm) => (
                <div key={pm.modeKey} className="p-3 sm:p-4 flex items-center justify-between">
                  <div>
                    <div className="font-semibold">{pm.label}</div>
                    <div className="text-[11px] text-neutral-500">
                      CoA: {pm.coaAccountCode} · Verification: {pm.requiresVerification ? 'Mandatory Maker/Checker' : 'Instant'}
                    </div>
                  </div>
                  <div className="text-right font-mono text-[11px]">
                    Gateway API: {pm.isGatewayConfigured ? 'Configured' : 'Not Configured (Manual Mode)'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'brs' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {data.bankAccounts.map((b) => (
              <div key={b.bankId} className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm">{b.bankName}</span>
                  <Landmark className="h-4 w-4 text-neutral-400" />
                </div>
                <div className="text-neutral-500 mt-1 font-mono">
                  {b.accountNumberMasked} · IFSC {b.ifscCode} · Entity {b.entityCode}
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span>Last Statement Balance</span>
                  <span className="font-mono font-bold text-base">{formatCurrency(b.statementBalance)}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
              <span className="text-xs font-semibold">Bank Statement Reconciliation Engine (Module 41 &amp; 82)</span>
              {canManage && (
                <Button
                  size="sm"
                  variant="outline"
                  icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                  onClick={async () => {
                    const res: any = await financeApi.autoReconcileBank();
                    onShowToast('success', 'BRS Auto-Match Executed', res.message);
                    loadData();
                  }}
                >
                  Run Auto-Match
                </Button>
              )}
            </div>
            <div className="divide-y divide-neutral-100 dark:divide-neutral-800 text-xs">
              {data.bankStatements.map((s) => (
                <div key={s.lineId} className="p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-mono font-bold">
                      {s.lineId} · {s.utrOrRef} · {s.txnDate}
                    </div>
                    <div className="text-neutral-600 dark:text-neutral-300">{s.description}</div>
                    <div className="text-[11px] text-neutral-500">
                      Status: {s.matchStatus} {s.matchedVoucherNo ? `· Linked Voucher: ${s.matchedVoucherNo}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold">
                      {s.creditAmount > 0 ? `+${formatCurrency(s.creditAmount)}` : `-${formatCurrency(s.debitAmount)}`}
                    </span>
                    {canManage && s.matchStatus === 'Unmatched' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          await financeApi.reconcileStatementLine(s.lineId);
                          onShowToast('success', 'Line Reconciled & Posted to GL');
                          loadData();
                        }}
                      >
                        Post &amp; Reconcile
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <Modal isOpen={cspModal} onClose={() => setCspModal(false)} title="Record Segregated PNB CSP Banking Entry">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const res: any = await financeApi.recordPnbCsp(cspForm);
              onShowToast('success', 'PNB CSP Entry Logged', res.message);
              setCspModal(false);
              setCspForm({ ...cspForm, customerRef: '', remarks: '' });
              loadData();
            } catch (err) {
              onShowToast('error', 'CSP Entry Failed', err instanceof Error ? err.message : undefined);
            }
          }}
          className="space-y-3 text-xs"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium mb-1">CSP Transaction Type</label>
              <select
                value={cspForm.txnType}
                onChange={(e) => setCspForm({ ...cspForm, txnType: e.target.value })}
                className="w-full h-9 px-3 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
              >
                <option value="Customer Deposit">Customer Deposit</option>
                <option value="Customer Withdrawal">Customer Withdrawal</option>
                <option value="AEPS Cash Out">AEPS Cash Out</option>
                <option value="Money Transfer (DMT)">Money Transfer (DMT)</option>
                <option value="Bank Settlement Transfer">Bank Settlement Transfer</option>
                <option value="CSP Commission Earned">CSP Commission Earned</option>
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">Customer PNB / AEPS Reference</label>
              <input
                required
                placeholder="PNB A/C XXXX1234 — Name"
                value={cspForm.customerRef}
                onChange={(e) => setCspForm({ ...cspForm, customerRef: e.target.value })}
                className="w-full h-9 px-3 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Customer Principal (Isolated, ₹)</label>
              <input
                type="number"
                min={0}
                value={cspForm.principalAmount}
                onChange={(e) => setCspForm({ ...cspForm, principalAmount: Number(e.target.value) })}
                className="w-full h-9 px-3 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">MUN COMPUTER Commission Only (₹)</label>
              <input
                type="number"
                min={0}
                value={cspForm.commissionIncome}
                onChange={(e) => setCspForm({ ...cspForm, commissionIncome: Number(e.target.value) })}
                className="w-full h-9 px-3 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
              />
            </div>
          </div>
          <div>
            <label className="block font-medium mb-1">Remarks</label>
            <input
              value={cspForm.remarks}
              onChange={(e) => setCspForm({ ...cspForm, remarks: e.target.value })}
              className="w-full h-9 px-3 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setCspModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm">
              Save Isolated CSP Entry
            </Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={xferModal} onClose={() => setXferModal(false)} title="Counter Cash Contra Transfer">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const res: any = await financeApi.createCashTransfer(xferForm);
              onShowToast('success', 'Contra Transfer Posted', res.message);
              setXferModal(false);
              loadData();
            } catch (err) {
              onShowToast('error', 'Transfer Blocked', err instanceof Error ? err.message : undefined);
            }
          }}
          className="space-y-3 text-xs"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium mb-1">From Counter (Non-CSP)</label>
              <select
                value={xferForm.fromCounterCode}
                onChange={(e) => setXferForm({ ...xferForm, fromCounterCode: e.target.value })}
                className="w-full h-9 px-3 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
              >
                <option value="CTR-01">CTR-01 (Front Desk)</option>
                <option value="CTR-02">CTR-02 (Hardware Desk)</option>
                <option value="PETTY-01">PETTY-01 (Imprest Box)</option>
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">To Business Bank</label>
              <select
                value={xferForm.toTargetCode}
                onChange={(e) => setXferForm({ ...xferForm, toTargetCode: e.target.value })}
                className="w-full h-9 px-3 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
              >
                <option value="BNK-MAIN-01">BNK-MAIN-01 (SBI Current A/C)</option>
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">Amount (₹)</label>
              <input
                type="number"
                min={1}
                value={xferForm.amount}
                onChange={(e) => setXferForm({ ...xferForm, amount: Number(e.target.value) })}
                className="w-full h-9 px-3 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Notes</label>
              <input
                value={xferForm.notes}
                onChange={(e) => setXferForm({ ...xferForm, notes: e.target.value })}
                className="w-full h-9 px-3 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setXferModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm">
              Post Contra Voucher
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
