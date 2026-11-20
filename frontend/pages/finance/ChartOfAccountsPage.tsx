import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Lock, Plus, RotateCcw, Search, Unlock } from 'lucide-react';
import { UserProfile } from '../../modules/types';
import { financeApi, FinanceOverviewPayload } from '../../services/financeApi';
import { formatCurrency } from '../../services/apiClient';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';

interface ChartOfAccountsPageProps {
  currentUser: UserProfile;
  onShowToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}

export const ChartOfAccountsPage: React.FC<ChartOfAccountsPageProps> = ({
  currentUser,
  onShowToast,
}) => {
  const [data, setData] = useState<FinanceOverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'coa' | 'vouchers' | 'ledger' | 'periods'>('vouchers');
  const [search, setSearch] = useState('');

  const [coaModal, setCoaModal] = useState(false);
  const [coaForm, setCoaForm] = useState({
    accountCode: '',
    accountName: '',
    accountType: 'Expense',
    subType: 'Operating Expense',
    entityScope: 'ALL',
  });

  const [voucherModal, setVoucherModal] = useState(false);
  const [voucherForm, setVoucherForm] = useState({
    entityCode: 'ENT-MAIN',
    costCenter: 'GENERAL',
    voucherDate: '2026-11-16',
    voucherType: 'Journal',
    currencyCode: 'INR',
    narration: '',
    debitAccountCode: '6030',
    creditAccountCode: '1001',
    amount: 500,
  });

  const loadFinance = useCallback(async () => {
    setLoading(true);
    try {
      const res = await financeApi.getOverview('ENT-MAIN');
      setData(res.data);
    } catch (err) {
      onShowToast('error', 'Failed to load Accounting Engine', err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [onShowToast]);

  useEffect(() => {
    loadFinance();
  }, [loadFinance]);

  const isAdmin = currentUser.role === 'ADMIN';
  const canCreateVoucher = currentUser.role === 'ADMIN' || currentUser.role === 'MANAGER';

  if (loading || !data) {
    return <div className="p-6 text-xs text-neutral-500">Loading General Ledger &amp; Chart of Accounts...</div>;
  }

  const postableAccounts = data.chartOfAccounts.filter((a) => !a.isGroup && a.status === 'active');
  const tb = data.statements.trialBalance;

  const filteredVouchers = data.vouchers.filter((v) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      v.voucherNo.toLowerCase().includes(q) ||
      v.narration.toLowerCase().includes(q) ||
      (v.referenceId || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-neutral-950 dark:text-white">
            Chart of Accounts, Double-Entry Vouchers &amp; Period Control (Modules 01–03, 17, 42–43, 83–84)
          </h2>
          <p className="text-xs text-neutral-500 mt-1">
            Trial Balance Closing Debit {formatCurrency(tb.totalClosingDebit)} vs Credit{' '}
            {formatCurrency(tb.totalClosingCredit)} · Status: {tb.isBalanced ? 'Balanced (₹0.00 diff)' : 'Variance'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canCreateVoucher && (
            <Button size="sm" variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setVoucherModal(true)}>
              New Double-Entry Voucher
            </Button>
          )}
          {isAdmin && (
            <Button size="sm" variant="outline" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setCoaModal(true)}>
              Add CoA Account
            </Button>
          )}
        </div>
      </div>

      {/* Sub-Tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-neutral-200 dark:border-neutral-800 pb-3">
        {[
          { id: 'vouchers', label: `Journal Vouchers (${data.vouchers.length})` },
          { id: 'coa', label: `Chart of Accounts (${data.chartOfAccounts.length})` },
          { id: 'ledger', label: `Trial Balance & GL (${tb.rows.length})` },
          { id: 'periods', label: `Fiscal Years & Period Locks (${data.fiscalPeriods.length})` },
        ].map((tItem) => (
          <button
            key={tItem.id}
            type="button"
            onClick={() => setTab(tItem.id as any)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md border cursor-pointer ${
              tab === tItem.id
                ? 'bg-neutral-950 text-white border-neutral-950 dark:bg-white dark:text-neutral-950 dark:border-white'
                : 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300'
            }`}
          >
            {tItem.label}
          </button>
        ))}
      </div>

      {tab === 'vouchers' && (
        <div className="space-y-3">
          <div className="relative max-w-sm">
            <Search className="h-3.5 w-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search voucher no, narration, ERP ref..."
              className="w-full h-9 pl-8 pr-3 text-xs bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded-md"
            />
          </div>

          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg divide-y divide-neutral-100 dark:divide-neutral-800 text-xs">
            {filteredVouchers.map((v) => (
              <div key={v.voucherNo} className="p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-mono font-bold text-neutral-950 dark:text-white">{v.voucherNo}</span>
                    <span className="ml-2 text-neutral-500">
                      {v.voucherDate} · {v.voucherType} · {v.entityCode} ({v.costCenter}) · Status: {v.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold">
                      Dr {formatCurrency(v.totalDebit)} / Cr {formatCurrency(v.totalCredit)}
                    </span>
                    {v.status === 'Pending_Approval' && v.createdBy !== currentUser.userId && (isAdmin || currentUser.role === 'MANAGER') && (
                      <Button
                        size="sm"
                        variant="primary"
                        icon={<CheckCircle2 className="h-3 w-3" />}
                        onClick={async () => {
                          try {
                            await financeApi.approveVoucher(v.voucherNo);
                            onShowToast('success', 'Voucher Approved & Posted');
                            loadFinance();
                          } catch (err) {
                            onShowToast('error', 'Approval Blocked', err instanceof Error ? err.message : undefined);
                          }
                        }}
                      >
                        Approve
                      </Button>
                    )}
                    {isAdmin && v.status === 'Posted' && !v.reversedVoucherNo && (
                      <Button
                        size="sm"
                        variant="outline"
                        icon={<RotateCcw className="h-3 w-3" />}
                        onClick={async () => {
                          try {
                            await financeApi.reverseVoucher(v.voucherNo, 'Admin Ledger Audit Reversal');
                            onShowToast('info', 'Voucher Reversed', `Contra voucher posted for ${v.voucherNo}.`);
                            loadFinance();
                          } catch (err) {
                            onShowToast('error', 'Reversal Failed', err instanceof Error ? err.message : undefined);
                          }
                        }}
                      >
                        Reverse
                      </Button>
                    )}
                  </div>
                </div>
                <div className="text-neutral-700 dark:text-neutral-300">{v.narration}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 bg-neutral-50 dark:bg-neutral-950 p-2.5 rounded border border-neutral-200 dark:border-neutral-800">
                  {v.lines.map((l: any) => (
                    <div key={l.lineNo} className="flex items-center justify-between text-[11px]">
                      <span className="font-mono">
                        {l.accountCode} · {l.accountName}
                      </span>
                      <span className="font-mono tabular-nums font-medium">
                        {l.debitAmount > 0 ? `Dr ${formatCurrency(l.debitAmount)}` : `Cr ${formatCurrency(l.creditAmount)}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'coa' && (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-neutral-50 dark:bg-neutral-950 border-b border-neutral-200 dark:border-neutral-800 text-neutral-500">
              <tr>
                <th className="px-4 py-2.5">Code</th>
                <th className="px-4 py-2.5">Account Name</th>
                <th className="px-4 py-2.5">Type / Sub-Type</th>
                <th className="px-4 py-2.5">Normal</th>
                <th className="px-4 py-2.5 text-right">Opening Balance</th>
                <th className="px-4 py-2.5">Control</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {data.chartOfAccounts.map((a) => (
                <tr key={a.accountCode} className={a.isGroup ? 'bg-neutral-50/70 dark:bg-neutral-950/60 font-semibold' : ''}>
                  <td className="px-4 py-2 font-mono">{a.accountCode}</td>
                  <td className="px-4 py-2">{a.accountName}</td>
                  <td className="px-4 py-2 text-neutral-500">
                    {a.accountType} · {a.subType}
                  </td>
                  <td className="px-4 py-2">{a.normalBalance}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">
                    {a.openingBalance > 0 ? `${formatCurrency(a.openingBalance)} (${a.openingSide})` : '—'}
                  </td>
                  <td className="px-4 py-2 text-neutral-500">
                    {a.isSystemLocked ? 'System Locked' : a.isGroup ? 'Group Header' : 'Active'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'ledger' && (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-neutral-50 dark:bg-neutral-950 border-b border-neutral-200 dark:border-neutral-800 text-neutral-500">
              <tr>
                <th className="px-4 py-2.5">Account</th>
                <th className="px-4 py-2.5">Type</th>
                <th className="px-4 py-2.5 text-right">Opening</th>
                <th className="px-4 py-2.5 text-right">Period Debit</th>
                <th className="px-4 py-2.5 text-right">Period Credit</th>
                <th className="px-4 py-2.5 text-right">Closing Debit</th>
                <th className="px-4 py-2.5 text-right">Closing Credit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {tb.rows.map((r) => (
                <tr key={r.accountCode}>
                  <td className="px-4 py-2 font-mono">
                    {r.accountCode} · <span className="font-sans font-medium">{r.accountName}</span>
                  </td>
                  <td className="px-4 py-2 text-neutral-500">{r.accountType}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">
                    {r.openingDebit > 0
                      ? `${formatCurrency(r.openingDebit)} Dr`
                      : r.openingCredit > 0
                        ? `${formatCurrency(r.openingCredit)} Cr`
                        : '—'}
                  </td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">{formatCurrency(r.periodDebit)}</td>
                  <td className="px-4 py-2 text-right font-mono tabular-nums">{formatCurrency(r.periodCredit)}</td>
                  <td className="px-4 py-2 text-right font-mono font-semibold tabular-nums">
                    {r.closingDebit > 0 ? formatCurrency(r.closingDebit) : '—'}
                  </td>
                  <td className="px-4 py-2 text-right font-mono font-semibold tabular-nums">
                    {r.closingCredit > 0 ? formatCurrency(r.closingCredit) : '—'}
                  </td>
                </tr>
              ))}
              <tr className="bg-neutral-50 dark:bg-neutral-950 font-bold">
                <td className="px-4 py-2.5" colSpan={3}>
                  TRIAL BALANCE TOTALS (Balanced Diff: {formatCurrency(tb.difference)})
                </td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatCurrency(tb.totalPeriodDebit)}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatCurrency(tb.totalPeriodCredit)}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatCurrency(tb.totalClosingDebit)}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatCurrency(tb.totalClosingCredit)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {tab === 'periods' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg divide-y divide-neutral-100 dark:divide-neutral-800 text-xs">
            {data.fiscalPeriods.map((p) => (
              <div key={p.periodCode} className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-mono font-bold">
                    {p.periodCode} · {p.monthLabel} ({p.fyCode})
                  </div>
                  <div className="text-neutral-500 mt-0.5">
                    Status: <span className="font-semibold text-neutral-900 dark:text-white">{p.status}</span>
                    {p.lockReason ? ` · Reason: ${p.lockReason}` : ''}
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-2">
                    {p.status !== 'Closed' ? (
                      <Button
                        size="sm"
                        variant="outline"
                        icon={<Lock className="h-3 w-3" />}
                        onClick={async () => {
                          await financeApi.setPeriodStatus(p.periodCode, 'Closed', 'Month-end financial close');
                          onShowToast('success', 'Period Closed', `${p.periodCode} locked against backdated entries.`);
                          loadFinance();
                        }}
                      >
                        Lock Period
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        icon={<Unlock className="h-3 w-3" />}
                        onClick={async () => {
                          await financeApi.setPeriodStatus(p.periodCode, 'Reopened', 'Admin audit adjustment reopen');
                          onShowToast('info', 'Period Reopened', `${p.periodCode} reopened with audit log.`);
                          loadFinance();
                        }}
                      >
                        Reopen with Audit
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal isOpen={voucherModal} onClose={() => setVoucherModal(false)} title="Post Double-Entry Journal Voucher">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const res: any = await financeApi.createVoucher({
                entityCode: voucherForm.entityCode,
                costCenter: voucherForm.costCenter,
                voucherDate: voucherForm.voucherDate,
                voucherType: voucherForm.voucherType,
                currencyCode: voucherForm.currencyCode,
                narration: voucherForm.narration,
                lines: [
                  { accountCode: voucherForm.debitAccountCode, debitAmount: voucherForm.amount, creditAmount: 0 },
                  { accountCode: voucherForm.creditAccountCode, debitAmount: 0, creditAmount: voucherForm.amount },
                ],
              });
              onShowToast('success', 'Voucher Submitted', res.message);
              setVoucherModal(false);
              setVoucherForm({ ...voucherForm, narration: '' });
              loadFinance();
            } catch (err) {
              onShowToast('error', 'Voucher Validation Error', err instanceof Error ? err.message : undefined);
            }
          }}
          className="space-y-3 text-xs"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium mb-1">Entity Scope</label>
              <select
                value={voucherForm.entityCode}
                onChange={(e) => setVoucherForm({ ...voucherForm, entityCode: e.target.value })}
                className="w-full h-9 px-3 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
              >
                {data.entities
                  .filter((ent) => !ent.isIsolatedCsp)
                  .map((ent) => (
                    <option key={ent.entityCode} value={ent.entityCode}>
                      {ent.entityCode} — {ent.entityName}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">Voucher Date (Period Lock Enforced)</label>
              <input
                type="date"
                value={voucherForm.voucherDate}
                onChange={(e) => setVoucherForm({ ...voucherForm, voucherDate: e.target.value })}
                className="w-full h-9 px-3 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Voucher Type</label>
              <select
                value={voucherForm.voucherType}
                onChange={(e) => setVoucherForm({ ...voucherForm, voucherType: e.target.value })}
                className="w-full h-9 px-3 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
              >
                <option value="Journal">Journal (JV)</option>
                <option value="Expense">Expense (EV)</option>
                <option value="Payment">Payment (PV)</option>
                <option value="Receipt">Receipt (RV)</option>
                <option value="Contra">Contra (CV)</option>
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">Currency (FX Auto-Converted to INR)</label>
              <select
                value={voucherForm.currencyCode}
                onChange={(e) => setVoucherForm({ ...voucherForm, currencyCode: e.target.value })}
                className="w-full h-9 px-3 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
              >
                {data.currencyRates.map((c) => (
                  <option key={c.currencyCode} value={c.currencyCode}>
                    {c.currencyCode} (1 = ₹{c.spotRateInr})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">Debit Account (Dr)</label>
              <select
                value={voucherForm.debitAccountCode}
                onChange={(e) => setVoucherForm({ ...voucherForm, debitAccountCode: e.target.value })}
                className="w-full h-9 px-3 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
              >
                {postableAccounts.map((a) => (
                  <option key={a.accountCode} value={a.accountCode}>
                    {a.accountCode} — {a.accountName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">Credit Account (Cr)</label>
              <select
                value={voucherForm.creditAccountCode}
                onChange={(e) => setVoucherForm({ ...voucherForm, creditAccountCode: e.target.value })}
                className="w-full h-9 px-3 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
              >
                {postableAccounts.map((a) => (
                  <option key={a.accountCode} value={a.accountCode}>
                    {a.accountCode} — {a.accountName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">Amount (in selected currency)</label>
              <input
                type="number"
                min={1}
                step="0.01"
                value={voucherForm.amount}
                onChange={(e) => setVoucherForm({ ...voucherForm, amount: Number(e.target.value) })}
                className="w-full h-9 px-3 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Cost Center</label>
              <input
                value={voucherForm.costCenter}
                onChange={(e) => setVoucherForm({ ...voucherForm, costCenter: e.target.value })}
                className="w-full h-9 px-3 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
              />
            </div>
          </div>
          <div>
            <label className="block font-medium mb-1">Narration / Audit Particulars</label>
            <input
              required
              value={voucherForm.narration}
              onChange={(e) => setVoucherForm({ ...voucherForm, narration: e.target.value })}
              placeholder="Explain business purpose for audit trail..."
              className="w-full h-9 px-3 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setVoucherModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm">
              Validate &amp; Post Voucher
            </Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={coaModal} onClose={() => setCoaModal(false)} title="Create Chart of Accounts Ledger">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await financeApi.createCoaAccount(coaForm);
              onShowToast('success', 'Account Created', `${coaForm.accountCode} added to CoA.`);
              setCoaModal(false);
              loadFinance();
            } catch (err) {
              onShowToast('error', 'CoA Error', err instanceof Error ? err.message : undefined);
            }
          }}
          className="space-y-3 text-xs"
        >
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-medium mb-1">Account Code</label>
              <input
                required
                placeholder="6070"
                value={coaForm.accountCode}
                onChange={(e) => setCoaForm({ ...coaForm, accountCode: e.target.value })}
                className="w-full h-9 px-3 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
              />
            </div>
            <div>
              <label className="block font-medium mb-1">Account Type</label>
              <select
                value={coaForm.accountType}
                onChange={(e) => setCoaForm({ ...coaForm, accountType: e.target.value })}
                className="w-full h-9 px-3 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
              >
                <option value="Asset">Asset</option>
                <option value="Liability">Liability</option>
                <option value="Equity">Equity</option>
                <option value="Income">Income</option>
                <option value="COGS">COGS</option>
                <option value="Expense">Expense</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block font-medium mb-1">Account Name</label>
              <input
                required
                value={coaForm.accountName}
                onChange={(e) => setCoaForm({ ...coaForm, accountName: e.target.value })}
                className="w-full h-9 px-3 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setCoaModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm">
              Save CoA Account
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
