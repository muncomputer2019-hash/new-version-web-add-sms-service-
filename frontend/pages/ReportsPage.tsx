import React, { useEffect, useMemo, useState } from 'react';
import { Download, FileSpreadsheet, Printer, Search } from 'lucide-react';
import {
  ApplicationRecord,
  CustomerRecord,
  DailyCashClosingRecord,
  ErpApplicationItem,
  ErpCustomerItem,
  ErpExpenseItem,
  ErpPaymentItem,
  ServiceRateItem,
  TransactionRecord,
  UserProfile,
} from '../modules/types';
import { Button } from '../components/Button';
import { DataTable, TableColumn } from '../components/DataTable';
import { formatCurrency } from '../services/apiClient';
import { formatDateIST } from '../services/formatters';
import { erpApi } from '../services/erpApi';
import { financeApi, FinanceOverviewPayload } from '../services/financeApi';
import { useLanguage } from '../i18n/translations';

export const REPORT_TYPES = [
  'Daily Collection Report',
  'Monthly Collection Report',
  'Customer Report',
  'Service-wise Report',
  'Service Profit Report',
  'Application Status Report',
  'Pending Applications Report',
  'Completed Applications Report',
  'Rejected & Cancelled Report',
  'Overdue / SLA Breach Report',
  'Staff Workload & Performance',
  'Pending Documents Report',
  'Follow-up & Reminder Report',
  'Delivery & Handover Report',
  'Cancellation & Refund Report',
  'Payment Method Report',
  'Pending Payment Report',
  'Expense Report',
  'Profit & Loss Report',
  'Trial Balance (GL)',
  'Profit & Loss Statement (GL)',
  'Balance Sheet (GL)',
  'Consolidated Group Statement',
  'PNB CSP Segregated Report',
  'GST GSTR-1 & 2B Summary',
  'Inventory FIFO/WAC Valuation',
  'Fixed Assets Register',
  'Supplier Payables & Bills',
  'Financial Engine Audit Certificate',
  'Activity & Export Audit Log',
] as const;

export type ReportTypeName = (typeof REPORT_TYPES)[number];

interface ReportsPageProps {
  currentUser: UserProfile;
  customers: CustomerRecord[];
  applications: ApplicationRecord[];
  transactions: TransactionRecord[];
  serviceRates: ServiceRateItem[];
  dailyCashClosings: DailyCashClosingRecord[];
  onShowToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}

interface ReportRow {
  id: string;
  col1: string;
  col2: string;
  col3: string;
  col4: string;
  amount?: string;
}

export const ReportsPage: React.FC<ReportsPageProps> = ({
  currentUser,
  serviceRates,
  dailyCashClosings,
  onShowToast,
}) => {
  const { t } = useLanguage();
  const isAdmin = currentUser.role === 'ADMIN';
  const canViewFinancials = currentUser.role === 'ADMIN' || currentUser.role === 'AUDITOR' || currentUser.role === 'MANAGER';

  const availableReportTypes = useMemo(
    () =>
      REPORT_TYPES.filter((r) => {
        if (
          !canViewFinancials &&
          [
            'Service Profit Report',
            'Expense Report',
            'Profit & Loss Report',
            'Trial Balance (GL)',
            'Profit & Loss Statement (GL)',
            'Balance Sheet (GL)',
            'Consolidated Group Statement',
            'PNB CSP Segregated Report',
            'GST GSTR-1 & 2B Summary',
            'Inventory FIFO/WAC Valuation',
            'Fixed Assets Register',
            'Supplier Payables & Bills',
            'Financial Engine Audit Certificate',
          ].includes(r)
        ) {
          return false;
        }
        return true;
      }),
    [canViewFinancials]
  );

  const [selectedReport, setSelectedReport] = useState<ReportTypeName>('Daily Collection Report');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const [liveApps, setLiveApps] = useState<ErpApplicationItem[]>([]);
  const [liveCustomers, setLiveCustomers] = useState<ErpCustomerItem[]>([]);
  const [livePayments, setLivePayments] = useState<ErpPaymentItem[]>([]);
  const [liveExpenses, setLiveExpenses] = useState<ErpExpenseItem[]>([]);
  const [liveSummary, setLiveSummary] = useState<Awaited<ReturnType<typeof erpApi.getReportsSummary>>['data'] | null>(null);
  const [financeMain, setFinanceMain] = useState<FinanceOverviewPayload | null>(null);
  const [financeConsolidated, setFinanceConsolidated] = useState<FinanceOverviewPayload | null>(null);

  useEffect(() => {
    Promise.allSettled([
      erpApi.listApplications(),
      erpApi.listCustomers(),
      erpApi.getFinanceLedger(),
      erpApi.getReportsSummary(),
      financeApi.getOverview('ENT-MAIN'),
      financeApi.getOverview('ALL', true),
    ]).then(([aRes, cRes, fRes, sRes, fmRes, fcRes]) => {
      if (aRes.status === 'fulfilled') setLiveApps(aRes.value.data);
      if (cRes.status === 'fulfilled') setLiveCustomers(cRes.value.data);
      if (fRes.status === 'fulfilled') {
        setLivePayments(fRes.value.data.payments);
        setLiveExpenses(fRes.value.data.expenses);
      }
      if (sRes.status === 'fulfilled') setLiveSummary(sRes.value.data);
      if (fmRes.status === 'fulfilled') setFinanceMain(fmRes.value.data);
      if (fcRes.status === 'fulfilled') setFinanceConsolidated(fcRes.value.data);
    });
  }, []);

  const reportPayload = useMemo<{
    headers: [string, string, string, string, string];
    rows: ReportRow[];
    summaryTotal: string;
  }>(() => {
    const todayPrefix = new Date().toISOString().slice(0, 10);
    switch (selectedReport) {
      case 'Daily Collection Report':
      case 'Monthly Collection Report': {
        const list = livePayments.filter((txn) =>
          selectedReport === 'Daily Collection Report'
            ? txn.recordedAt.startsWith('2026-11-16') || txn.recordedAt.startsWith(todayPrefix)
            : true
        );
        const total = list.filter((p) => p.verificationStatus === 'Confirmed').reduce((s, r) => s + r.amount, 0);
        return {
          headers: ['Receipt / App No', 'Customer', 'Method', 'Date (IST)', 'Amount (INR)'],
          rows: list.map((txn) => ({
            id: txn.transactionId,
            col1: `${txn.receiptNo} (${txn.applicationNo})`,
            col2: txn.customerName,
            col3: `${txn.paymentMethod} · ${txn.verificationStatus}`,
            col4: formatDateIST(txn.recordedAt.slice(0, 10)),
            amount: formatCurrency(txn.amount),
          })),
          summaryTotal: formatCurrency(total),
        };
      }

      case 'Customer Report': {
        const total = liveCustomers.reduce((s, c) => s + (c.stats?.totalPaid ?? 0), 0);
        return {
          headers: ['Customer ID', 'Full Name', 'Verification & Village', 'Status', 'Total Paid'],
          rows: liveCustomers.map((c) => ({
            id: c.customerId,
            col1: c.customerId,
            col2: `${c.fullName} (${c.mobile})`,
            col3: `${c.verificationStatus} · ${c.village}`,
            col4: c.status,
            amount: formatCurrency(c.stats?.totalPaid ?? 0),
          })),
          summaryTotal: formatCurrency(total),
        };
      }

      case 'Service-wise Report':
      case 'Service Profit Report': {
        const svcRows = liveSummary?.serviceSummary ?? [];
        const totalProfit = svcRows.reduce((s, r) => s + r.profit, 0);
        return {
          headers: ['Service ID', 'Service Name', 'Applications', 'Revenue Collected', isAdmin ? 'Unit Profit Est.' : 'Rate Catalog'],
          rows:
            svcRows.length > 0
              ? svcRows.map((sr) => ({
                  id: sr.serviceId,
                  col1: sr.serviceId,
                  col2: sr.serviceName,
                  col3: `${sr.count} filings`,
                  col4: formatCurrency(sr.revenue),
                  amount: isAdmin ? formatCurrency(sr.profit) : `${sr.count}`,
                }))
              : serviceRates.map((sr) => ({
                  id: sr.serviceCode,
                  col1: sr.serviceCode,
                  col2: sr.serviceName,
                  col3: formatCurrency(sr.customerCharge),
                  col4: sr.category,
                  amount: isAdmin ? formatCurrency(sr.profitAmount) : `v${sr.currentVersion}`,
                })),
          summaryTotal: isAdmin ? formatCurrency(totalProfit) : `${svcRows.length} services`,
        };
      }

      case 'Application Status Report':
      case 'Pending Applications Report':
      case 'Completed Applications Report':
      case 'Rejected & Cancelled Report':
      case 'Pending Payment Report': {
        const list = liveApps.filter((a) => {
          if (selectedReport === 'Pending Applications Report') {
            return !['Completed', 'Cancelled', 'Rejected'].includes(a.status);
          }
          if (selectedReport === 'Completed Applications Report') return a.status === 'Completed';
          if (selectedReport === 'Rejected & Cancelled Report') {
            return a.status === 'Rejected' || a.status === 'Cancelled';
          }
          if (selectedReport === 'Pending Payment Report') return a.financialSummary.balanceDue > 0;
          return true;
        });
        const balance = list.reduce((s, a) => s + a.financialSummary.balanceDue, 0);
        return {
          headers: ['Application ID', 'Customer & Service', 'Staff / SLA', 'Status', 'Balance Due'],
          rows: list.map((a) => ({
            id: a.applicationNo,
            col1: a.applicationNo,
            col2: `${a.customerSnapshot.fullName} — ${a.serviceSnapshot.name}`,
            col3: `${a.assignedStaffId || 'Unassigned'} · ${a.slaStatus.label}`,
            col4: a.status,
            amount: formatCurrency(a.financialSummary.balanceDue),
          })),
          summaryTotal: formatCurrency(balance),
        };
      }

      case 'Overdue / SLA Breach Report': {
        const list = liveSummary?.overdueSlaApps ?? [];
        return {
          headers: ['Application ID', 'Customer', 'Due Date (IST)', 'SLA Status', 'Assigned'],
          rows: list.map((a) => ({
            id: a.applicationNo,
            col1: a.applicationNo,
            col2: `${a.customerSnapshot.fullName} — ${a.serviceSnapshot.name}`,
            col3: formatDateIST(a.expectedCompletionDate),
            col4: a.slaStatus.label,
            amount: a.assignedStaffId || 'Unassigned',
          })),
          summaryTotal: `${list.length} overdue`,
        };
      }

      case 'Staff Workload & Performance': {
        const list = liveSummary?.staffWorkload ?? [];
        return {
          headers: ['Staff User ID', 'Total Assigned', 'Completed', 'Pending / Active', 'Overdue'],
          rows: list.map((w) => ({
            id: w.staffId,
            col1: w.staffId,
            col2: `${w.total} applications`,
            col3: `${w.completed} completed`,
            col4: `${w.pending} active`,
            amount: `${w.overdue} overdue`,
          })),
          summaryTotal: `${list.length} operators`,
        };
      }

      case 'Pending Documents Report': {
        const list = liveSummary?.pendingDocumentsApps ?? [];
        return {
          headers: ['Application ID', 'Customer', 'Missing Mandatory', 'Pending Verify', 'Status'],
          rows: list.map((a) => ({
            id: a.applicationNo,
            col1: a.applicationNo,
            col2: a.customerSnapshot.fullName,
            col3: `${a.checklistSummary.missingCount} missing`,
            col4: `${a.checklistSummary.pendingVerification} pending review`,
            amount: a.status,
          })),
          summaryTotal: `${list.length} applications`,
        };
      }

      case 'Follow-up & Reminder Report': {
        const list = liveSummary?.followUps ?? [];
        return {
          headers: ['Application ID', 'Reason', 'Assigned Staff', 'Status', 'Due Date'],
          rows: list.map((f) => ({
            id: String(f.id),
            col1: f.applicationNo,
            col2: f.reason,
            col3: f.assignedStaffId,
            col4: f.status,
            amount: f.followUpDate,
          })),
          summaryTotal: `${list.filter((f) => f.status === 'Pending').length} pending`,
        };
      }

      case 'Delivery & Handover Report': {
        const list = liveSummary?.deliveries ?? [];
        return {
          headers: ['Delivery ID', 'Application', 'Method & Receiver', 'Status', 'Date'],
          rows: list.map((d) => ({
            id: d.deliveryId,
            col1: d.deliveryId,
            col2: d.applicationNo ?? '-',
            col3: `${d.deliveryMethod} (${d.receivedBy})`,
            col4: d.status,
            amount: d.deliveryDate,
          })),
          summaryTotal: `${list.length} handovers`,
        };
      }

      case 'Cancellation & Refund Report': {
        const list = liveSummary?.refunds ?? [];
        const totalRef = list.reduce((s, r) => s + r.refundAmount, 0);
        return {
          headers: ['Refund ID', 'Application', 'Original Txn', 'Status', 'Refund Amount'],
          rows: list.map((r) => ({
            id: r.refundId,
            col1: r.refundId,
            col2: `${r.applicationNo} (${r.refundReason})`,
            col3: r.originalTransactionId,
            col4: r.status,
            amount: formatCurrency(r.refundAmount),
          })),
          summaryTotal: formatCurrency(totalRef),
        };
      }

      case 'Payment Method Report': {
        const groups = new Map<string, { count: number; total: number }>();
        livePayments.forEach((txn) => {
          if (txn.verificationStatus !== 'Confirmed') return;
          const prev = groups.get(txn.paymentMethod) ?? { count: 0, total: 0 };
          groups.set(txn.paymentMethod, { count: prev.count + 1, total: prev.total + txn.amount });
        });
        const total = Array.from(groups.values()).reduce((s, g) => s + g.total, 0);
        return {
          headers: ['Method', 'Mode', 'Transactions', 'Share', 'Total Settled'],
          rows: Array.from(groups.entries()).map(([method, info]) => ({
            id: method,
            col1: method,
            col2: method === 'UPI' ? 'Static UPI QR + Manual Verify' : 'Counter Settlement',
            col3: `${info.count} txn(s)`,
            col4: `${Math.round((info.total / Math.max(1, total)) * 100)}%`,
            amount: formatCurrency(info.total),
          })),
          summaryTotal: formatCurrency(total),
        };
      }

      case 'Expense Report': {
        const expTotal = liveExpenses.reduce((s, e) => s + e.amount, 0);
        return {
          headers: ['Voucher No', 'Category & Description', 'Counter / Recorded By', 'Date', 'Amount (INR)'],
          rows:
            liveExpenses.length > 0
              ? liveExpenses.map((e) => ({
                  id: e.voucherNo,
                  col1: e.voucherNo,
                  col2: `${e.category} — ${e.description}`,
                  col3: `${e.counterCode} · ${e.recordedBy}`,
                  col4: formatDateIST(e.expenseDate.slice(0, 10)),
                  amount: formatCurrency(e.amount),
                }))
              : dailyCashClosings.map((d) => ({
                  id: d.closingCode,
                  col1: d.closingCode,
                  col2: `Counter Cash Expenses (${d.counterCode})`,
                  col3: d.counterCode,
                  col4: d.approvalStatus,
                  amount: formatCurrency(d.cashExpenses),
                })),
          summaryTotal: formatCurrency(
            liveExpenses.length > 0 ? expTotal : dailyCashClosings.reduce((s, d) => s + d.cashExpenses, 0)
          ),
        };
      }

      case 'Profit & Loss Report': {
        if (financeMain) {
          const pnl = financeMain.statements.profitAndLoss;
          return {
            headers: ['Account Code', 'Ledger Head', 'Category', 'Entity', 'Amount (INR)'],
            rows: [
              ...pnl.incomeRows.map((r) => ({
                id: `inc-${r.accountCode}`,
                col1: r.accountCode,
                col2: r.accountName,
                col3: 'Income',
                col4: financeMain.selectedEntity,
                amount: formatCurrency(r.amount),
              })),
              ...pnl.cogsRows.map((r) => ({
                id: `cogs-${r.accountCode}`,
                col1: r.accountCode,
                col2: r.accountName,
                col3: 'Cost of Goods Sold',
                col4: financeMain.selectedEntity,
                amount: `(${formatCurrency(r.amount)})`,
              })),
              ...pnl.expenseRows.map((r) => ({
                id: `exp-${r.accountCode}`,
                col1: r.accountCode,
                col2: r.accountName,
                col3: 'Operating Expense',
                col4: financeMain.selectedEntity,
                amount: `(${formatCurrency(r.amount)})`,
              })),
            ],
            summaryTotal: formatCurrency(pnl.netProfit),
          };
        }
        const totalRev = livePayments.filter((p) => p.verificationStatus === 'Confirmed').reduce((s, p) => s + p.amount, 0);
        const totalRef = (liveSummary?.refunds ?? []).filter((r) => r.status === 'Processed').reduce((s, r) => s + r.refundAmount, 0);
        const totalExp = liveExpenses.reduce((s, e) => s + e.amount, 0);
        const net = totalRev - totalRef - totalExp;
        return {
          headers: ['Ledger Head', 'Category', 'FY Period', 'Status', 'Amount (INR)'],
          rows: [
            { id: 'rev', col1: 'Gross Service Collections', col2: 'Income', col3: 'FY 2026-27', col4: 'Confirmed', amount: formatCurrency(totalRev) },
            { id: 'ref', col1: 'Processed Refunds', col2: 'Deduction', col3: 'FY 2026-27', col4: 'Processed', amount: formatCurrency(totalRef) },
            { id: 'exp', col1: 'Recorded Expenses', col2: 'Operating Expense', col3: 'FY 2026-27', col4: 'Recorded', amount: formatCurrency(totalExp) },
          ],
          summaryTotal: formatCurrency(net),
        };
      }

      case 'Trial Balance (GL)': {
        const tb = financeMain?.statements.trialBalance;
        return {
          headers: ['Account', 'Type', 'Opening', 'Period Dr / Cr', 'Closing Balance'],
          rows: (tb?.rows ?? []).map((r) => ({
            id: r.accountCode,
            col1: `${r.accountCode} · ${r.accountName}`,
            col2: r.accountType,
            col3: r.openingDebit > 0 ? `${formatCurrency(r.openingDebit)} Dr` : r.openingCredit > 0 ? `${formatCurrency(r.openingCredit)} Cr` : '—',
            col4: `${formatCurrency(r.periodDebit)} / ${formatCurrency(r.periodCredit)}`,
            amount: r.closingDebit > 0 ? `${formatCurrency(r.closingDebit)} Dr` : `${formatCurrency(r.closingCredit)} Cr`,
          })),
          summaryTotal: tb
            ? `Dr ${formatCurrency(tb.totalClosingDebit)} = Cr ${formatCurrency(tb.totalClosingCredit)} (Diff ₹${tb.difference})`
            : 'Loading...',
        };
      }

      case 'Profit & Loss Statement (GL)': {
        const pnl = financeMain?.statements.profitAndLoss;
        return {
          headers: ['Code', 'Ledger Account', 'Section', 'Period', 'Amount (INR)'],
          rows: [
            ...(pnl?.incomeRows ?? []).map((r) => ({
              id: `gl-inc-${r.accountCode}`,
              col1: r.accountCode,
              col2: r.accountName,
              col3: 'Operating Income',
              col4: 'FY 2026-27',
              amount: formatCurrency(r.amount),
            })),
            ...(pnl?.cogsRows ?? []).map((r) => ({
              id: `gl-cogs-${r.accountCode}`,
              col1: r.accountCode,
              col2: r.accountName,
              col3: 'COGS',
              col4: 'FY 2026-27',
              amount: `(${formatCurrency(r.amount)})`,
            })),
            ...(pnl?.expenseRows ?? []).map((r) => ({
              id: `gl-exp-${r.accountCode}`,
              col1: r.accountCode,
              col2: r.accountName,
              col3: 'Expense',
              col4: 'FY 2026-27',
              amount: `(${formatCurrency(r.amount)})`,
            })),
          ],
          summaryTotal: pnl ? `Net Profit: ${formatCurrency(pnl.netProfit)}` : '—',
        };
      }

      case 'Balance Sheet (GL)': {
        const bs = financeMain?.statements.balanceSheet;
        return {
          headers: ['Code', 'Account Name', 'Sub-Type', 'Classification', 'Balance (INR)'],
          rows: [
            ...(bs?.assetRows ?? []).map((r) => ({
              id: `bs-a-${r.accountCode}`,
              col1: r.accountCode,
              col2: r.accountName,
              col3: r.subType,
              col4: 'Asset',
              amount: formatCurrency(r.amount),
            })),
            ...(bs?.liabilityRows ?? []).map((r) => ({
              id: `bs-l-${r.accountCode}`,
              col1: r.accountCode,
              col2: r.accountName,
              col3: r.subType,
              col4: 'Liability',
              amount: formatCurrency(r.amount),
            })),
            ...(bs?.equityRows ?? []).map((r) => ({
              id: `bs-e-${r.accountCode}`,
              col1: r.accountCode,
              col2: r.accountName,
              col3: r.subType,
              col4: 'Equity',
              amount: formatCurrency(r.amount),
            })),
          ],
          summaryTotal: bs
            ? `Assets ${formatCurrency(bs.totalAssets)} = Liab+Eq ${formatCurrency(bs.totalLiabilities + bs.totalEquityIncludingNetProfit)}`
            : '—',
        };
      }

      case 'Consolidated Group Statement': {
        const tb = financeConsolidated?.statements.trialBalance;
        return {
          headers: ['Account', 'Scope', 'Period Dr', 'Period Cr', 'Closing'],
          rows: (tb?.rows ?? []).map((r) => ({
            id: `con-${r.accountCode}`,
            col1: `${r.accountCode} · ${r.accountName}`,
            col2: 'ALL Business Entities (Excl. PNB CSP & Elim 1190/2190)',
            col3: formatCurrency(r.periodDebit),
            col4: formatCurrency(r.periodCredit),
            amount: r.closingDebit > 0 ? `${formatCurrency(r.closingDebit)} Dr` : `${formatCurrency(r.closingCredit)} Cr`,
          })),
          summaryTotal: financeConsolidated
            ? `Group Net Profit: ${formatCurrency(financeConsolidated.statements.profitAndLoss.netProfit)}`
            : '—',
        };
      }

      case 'PNB CSP Segregated Report': {
        const list = financeMain?.pnbCspLedger ?? [];
        const totalPrincipal = list.reduce((s, e) => s + e.principalAmount, 0);
        const totalComm = list.reduce((s, e) => s + e.commissionIncome, 0);
        return {
          headers: ['CSP Txn ID', 'Type & Customer Ref', 'Date & Staff', 'Isolated Principal', 'Recognized Comm (4105)'],
          rows: list.map((e) => ({
            id: e.cspTxnId,
            col1: e.cspTxnId,
            col2: `${e.txnType} · ${e.customerRef}`,
            col3: `${formatDateIST(e.txnDate)} · ${e.recordedBy}`,
            col4: formatCurrency(e.principalAmount),
            amount: formatCurrency(e.commissionIncome),
          })),
          summaryTotal: `Customer Funds Isolated: ${formatCurrency(totalPrincipal)} | Business Comm (4105): ${formatCurrency(totalComm)}`,
        };
      }

      case 'GST GSTR-1 & 2B Summary': {
        const list = financeMain?.taxEntries ?? [];
        const totalTax = list.reduce((s, t) => s + t.cgst + t.sgst + t.igst, 0);
        return {
          headers: ['Tax ID', 'Return Type & Party', 'GSTIN / HSN', 'Taxable Value', 'GST Amount'],
          rows: list.map((t) => ({
            id: t.taxEntryId,
            col1: t.taxEntryId,
            col2: `${t.returnType} · ${t.partyName}`,
            col3: `${t.gstinOrPan} (${t.hsnOrSection})`,
            col4: formatCurrency(t.taxableValue),
            amount: formatCurrency(t.cgst + t.sgst + t.igst),
          })),
          summaryTotal: formatCurrency(totalTax),
        };
      }

      case 'Inventory FIFO/WAC Valuation': {
        const list = financeMain?.products ?? [];
        const totalVal = list.reduce(
          (s, p) => s + p.batches.reduce((bs: number, b: any) => bs + b.qtyRemaining * b.unitCost, 0),
          0
        );
        return {
          headers: ['SKU', 'Product & Method', 'Qty On Hand', 'Sell Price', 'Stock Value'],
          rows: list.map((p) => {
            const qty = p.batches.reduce((bs: number, b: any) => bs + b.qtyRemaining, 0);
            const val = p.batches.reduce((bs: number, b: any) => bs + b.qtyRemaining * b.unitCost, 0);
            return {
              id: p.sku,
              col1: p.sku,
              col2: `${p.name} (${p.valuationMethod})`,
              col3: `${qty} units`,
              col4: formatCurrency(p.sellingPrice),
              amount: formatCurrency(val),
            };
          }),
          summaryTotal: formatCurrency(totalVal),
        };
      }

      case 'Fixed Assets Register': {
        const list = financeMain?.fixedAssets ?? [];
        const totalNbv = list.reduce((s, a) => s + (a.costAmount - a.accumulatedDepreciation), 0);
        return {
          headers: ['Asset Code', 'Asset Name', 'Method & Rate', 'Cost / Acc Dep', 'Net Book Value'],
          rows: list.map((a) => ({
            id: a.assetCode,
            col1: a.assetCode,
            col2: `${a.assetName} (${a.category})`,
            col3: `${a.depreciationMethod} ${a.ratePct}%`,
            col4: `${formatCurrency(a.costAmount)} / ${formatCurrency(a.accumulatedDepreciation)}`,
            amount: formatCurrency(a.costAmount - a.accumulatedDepreciation),
          })),
          summaryTotal: formatCurrency(totalNbv),
        };
      }

      case 'Supplier Payables & Bills': {
        const list = financeMain?.supplierBills ?? [];
        const outstanding = list.reduce((s, b) => s + Math.max(0, b.netPayable - b.paidAmount), 0);
        return {
          headers: ['Bill No', 'Supplier', 'Net Payable (after TDS)', 'Status', 'Balance Due'],
          rows: list.map((b) => ({
            id: b.billNo,
            col1: b.billNo,
            col2: b.supplierName,
            col3: formatCurrency(b.netPayable),
            col4: b.status,
            amount: formatCurrency(Math.max(0, b.netPayable - b.paidAmount)),
          })),
          summaryTotal: formatCurrency(outstanding),
        };
      }

      case 'Financial Engine Audit Certificate': {
        const cert = financeMain?.latestAuditCertificate;
        return {
          headers: ['Check ID', 'Verification Area', 'Module Range', 'Status', 'Metric'],
          rows: (cert?.checks ?? []).map((c: any) => ({
            id: c.checkId,
            col1: c.checkId,
            col2: `${c.title} — ${c.detail}`,
            col3: c.moduleRange,
            col4: c.passed ? 'PASS' : 'FAIL',
            amount: c.metricValue,
          })),
          summaryTotal: cert ? `${cert.certificateNo} (${cert.overallVerdict})` : 'Run Self-Audit in Financial Engine Hub',
        };
      }

      case 'Activity & Export Audit Log': {
        const acts = liveSummary?.activities ?? [];
        const exps = liveSummary?.exportLogs ?? [];
        return {
          headers: ['Actor', 'Action / Export', 'Target / App', 'Reason / Format', 'Timestamp'],
          rows: [
            ...exps.map((e) => ({
              id: `exp-${e.id}`,
              col1: e.exportedBy,
              col2: `EXPORT (${e.reportName})`,
              col3: `${e.rowCount} rows`,
              col4: e.format,
              amount: e.exportedAt.slice(0, 10),
            })),
            ...acts.map((a) => ({
              id: `act-${a.id}`,
              col1: a.actorUserId,
              col2: a.action,
              col3: a.applicationNo || a.newValue || '-',
              col4: a.reason || '-',
              amount: a.createdAt.slice(0, 10),
            })),
          ],
          summaryTotal: `${exps.length} exports · ${acts.length} events`,
        };
      }
    }
  }, [selectedReport, livePayments, liveExpenses, liveCustomers, liveApps, liveSummary, serviceRates, dailyCashClosings, financeMain, financeConsolidated, isAdmin]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return reportPayload.rows.filter((r) => {
      const matchesStatus =
        statusFilter === 'ALL' || r.col4.toLowerCase().includes(statusFilter.toLowerCase());
      const matchesQ =
        !q ||
        r.col1.toLowerCase().includes(q) ||
        r.col2.toLowerCase().includes(q) ||
        r.col3.toLowerCase().includes(q);
      return matchesStatus && matchesQ;
    });
  }, [reportPayload.rows, searchQuery, statusFilter]);

  const triggerDownload = (filename: string, mimeType: string, content: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportCsv = async () => {
    const escapeCsv = (val: string) => `"${val.replaceAll('"', '""')}"`;
    const lines = [
      reportPayload.headers.map(escapeCsv).join(','),
      ...filteredRows.map((r) =>
        [r.col1, r.col2, r.col3, r.col4, r.amount ?? ''].map(escapeCsv).join(',')
      ),
    ];
    triggerDownload(
      `MUN-${selectedReport.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`,
      'text/csv;charset=utf-8;',
      lines.join('\n')
    );
    await erpApi.logReportExport(selectedReport, 'CSV', filteredRows.length).catch(() => {});
    onShowToast('success', 'CSV Exported & Audit Logged', `${selectedReport} downloaded.`);
  };

  const handleExportExcel = async () => {
    const rowsHtml = filteredRows
      .map(
        (r) =>
          `<tr><td>${r.col1}</td><td>${r.col2}</td><td>${r.col3}</td><td>${r.col4}</td><td>${r.amount ?? ''}</td></tr>`
      )
      .join('');
    const html = `<html><head><meta charset="utf-8"/></head><body><table border="1"><thead><tr>${reportPayload.headers
      .map((h) => `<th>${h}</th>`)
      .join('')}</tr></thead><tbody>${rowsHtml}</tbody></table></body></html>`;
    triggerDownload(
      `MUN-${selectedReport.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.xls`,
      'application/vnd.ms-excel',
      html
    );
    await erpApi.logReportExport(selectedReport, 'Excel', filteredRows.length).catch(() => {});
    onShowToast('success', 'Excel Exported & Audit Logged', `${selectedReport} (.xls) downloaded.`);
  };

  const columns: TableColumn<ReportRow>[] = [
    {
      key: 'col1',
      header: reportPayload.headers[0],
      render: (r) => <span className="font-mono text-xs font-medium">{r.col1}</span>,
    },
    {
      key: 'col2',
      header: reportPayload.headers[1],
      render: (r) => <span className="text-xs font-medium text-neutral-950 dark:text-white">{r.col2}</span>,
    },
    {
      key: 'col3',
      header: reportPayload.headers[2],
      className: 'hidden sm:table-cell',
      render: (r) => <span className="text-xs text-neutral-600 dark:text-neutral-300">{r.col3}</span>,
    },
    {
      key: 'col4',
      header: reportPayload.headers[3],
      render: (r) => <span className="text-xs text-neutral-600 dark:text-neutral-300">{r.col4}</span>,
    },
    {
      key: 'amount',
      header: reportPayload.headers[4],
      align: 'right',
      render: (r) => (
        <span className="font-mono text-xs font-semibold tabular-nums">{r.amount ?? '—'}</span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div>
          <h2 className="text-xl font-bold text-neutral-950 dark:text-white">
            {t.reportsTitle}
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            {availableReportTypes.length} live Enterprise MIS reports · FY 2026–27 (INR ₹ &amp; DD/MM/YYYY IST) · Every export is audit-logged
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await erpApi.logReportExport(selectedReport, 'PDF', filteredRows.length).catch(() => {});
              window.print();
            }}
            icon={<Printer className="h-3.5 w-3.5" />}
          >
            {t.exportPdf}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            icon={<Download className="h-3.5 w-3.5" />}
          >
            {t.exportCsv}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleExportExcel}
            icon={<FileSpreadsheet className="h-3.5 w-3.5" />}
          >
            {t.exportExcel}
          </Button>
        </div>
      </div>

      {/* Report Selector Tabs */}
      <div className="flex flex-wrap gap-1.5 no-print">
        {availableReportTypes.map((rep) => (
          <button
            key={rep}
            type="button"
            onClick={() => {
              setSelectedReport(rep);
              setSearchQuery('');
              setStatusFilter('ALL');
            }}
            className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer ${
              selectedReport === rep
                ? 'bg-neutral-950 text-white border-neutral-950 dark:bg-white dark:text-neutral-950 dark:border-white'
                : 'bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800'
            }`}
          >
            {rep}
          </button>
        ))}
      </div>

      {/* Printable Header & Filters */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
              {selectedReport}
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Summary Total: <span className="font-mono font-semibold text-neutral-950 dark:text-white">{reportPayload.summaryTotal}</span>
            </p>
          </div>

          <div className="flex items-center gap-2 no-print">
            <div className="relative w-52">
              <Search className="h-3.5 w-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter rows..."
                className="w-full h-9 pl-8 pr-3 text-xs bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded-md"
              />
            </div>
            <input
              type="text"
              value={statusFilter === 'ALL' ? '' : statusFilter}
              onChange={(e) => setStatusFilter(e.target.value || 'ALL')}
              placeholder="Status filter..."
              className="w-36 h-9 px-3 text-xs bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded-md"
            />
          </div>
        </div>

        <DataTable columns={columns} data={filteredRows} rowKey={(r) => r.id} />
      </div>
    </div>
  );
};
