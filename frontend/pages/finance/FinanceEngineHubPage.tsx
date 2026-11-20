import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bot,
  Building2,
  CheckCircle2,
  FileCheck2,
  FolderLock,
  Layers,
  Plus,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  Sliders,
  Upload,
} from 'lucide-react';
import { PageKey, UserProfile } from '../../modules/types';
import { financeApi, FinanceOverviewPayload } from '../../services/financeApi';
import { formatCurrency } from '../../services/apiClient';
import { Button } from '../../components/Button';
import { Modal } from '../../components/Modal';
import { MobileNumberInput } from '../../components/MobileNumberInput';

interface FinanceEngineHubPageProps {
  currentUser: UserProfile;
  onNavigate: (page: PageKey) => void;
  onShowToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}

const REGISTRY_94_MODULES: Array<{
  no: number;
  part: string;
  title: string;
  status: 'Implemented & Verified' | 'Human-Triggered' | 'Requires External Keys';
}> = [
  { no: 1, part: 'Part A', title: 'Double-Entry Core Accounting Engine', status: 'Implemented & Verified' },
  { no: 2, part: 'Part A', title: 'Chart of Accounts (CoA) & Hierarchy', status: 'Implemented & Verified' },
  { no: 3, part: 'Part A', title: 'Opening Balances & Carry Forward', status: 'Implemented & Verified' },
  { no: 4, part: 'Part A', title: 'Multi-Cash Counter & CSP Isolation', status: 'Implemented & Verified' },
  { no: 5, part: 'Part A', title: 'Payment Modes & Gateway Readiness', status: 'Implemented & Verified' },
  { no: 6, part: 'Part A', title: 'Customer AR, Advances & Credit Notes', status: 'Implemented & Verified' },
  { no: 7, part: 'Part A', title: 'Supplier AP, Bills & Vendor Settlement', status: 'Implemented & Verified' },
  { no: 8, part: 'Part A', title: 'Banking, Cheques & Bank Reconciliation (BRS)', status: 'Implemented & Verified' },
  { no: 9, part: 'Part A', title: 'Employee Master & Monthly Payroll Engine', status: 'Implemented & Verified' },
  { no: 10, part: 'Part A', title: 'GST (GSTR-1/2B) & TDS/TCS Tax Engine', status: 'Implemented & Verified' },
  { no: 11, part: 'Part A', title: 'Fixed Assets & SLM/WDV Depreciation', status: 'Implemented & Verified' },
  { no: 12, part: 'Part A', title: 'Budget & Variance Control', status: 'Implemented & Verified' },
  { no: 13, part: 'Part A', title: 'Profit & Loss and Financial KPI Dashboard', status: 'Implemented & Verified' },
  { no: 14, part: 'Part A', title: 'Maker-Checker Financial Approval Workflow', status: 'Implemented & Verified' },
  { no: 15, part: 'Part A', title: 'Document, Voucher & Audit Trail Vault', status: 'Implemented & Verified' },
  { no: 16, part: 'Part A', title: 'Recurring Voucher Rules (Human-Triggered)', status: 'Human-Triggered' },
  { no: 17, part: 'Part A', title: 'Fiscal Year Closing & Period Lock Control', status: 'Implemented & Verified' },
  { no: 18, part: 'Part A', title: 'Audit Logs & Internal Control Guards', status: 'Implemented & Verified' },
  { no: 19, part: 'Part B', title: 'Financial Statements (TB, P&L, BS, Cash Flow)', status: 'Implemented & Verified' },
  { no: 20, part: 'Part B', title: 'Multi-Branch & Multi-Entity Scoping', status: 'Implemented & Verified' },
  { no: 21, part: 'Part B', title: 'Payment Gateway Adapter & Safe Fallback', status: 'Requires External Keys' },
  { no: 22, part: 'Part B', title: 'Data Import, Dry-Run & Rollback Engine', status: 'Implemented & Verified' },
  { no: 23, part: 'Part B', title: 'Advanced Audit Compliance & Reversal Locks', status: 'Implemented & Verified' },
  { no: 24, part: 'Part B', title: 'Cashflow & Margin Intelligence BI', status: 'Implemented & Verified' },
  { no: 25, part: 'Part B', title: 'Digital Voucher Approval & Audit Signatures', status: 'Implemented & Verified' },
  { no: 26, part: 'Part B', title: 'Multi-Currency FX Spot Rate Engine', status: 'Implemented & Verified' },
  { no: 27, part: 'Part B', title: 'Financial Alert & Notification Rules', status: 'Requires External Keys' },
  { no: 28, part: 'Part B', title: 'AES-256-GCM Encrypted Snapshot & Recovery', status: 'Implemented & Verified' },
  { no: 29, part: 'Part B', title: 'Executive Margin & Solvency Scorecard', status: 'Implemented & Verified' },
  { no: 30, part: 'Part B', title: 'Financial Workflow Policy Rules', status: 'Implemented & Verified' },
  { no: 31, part: 'Part B', title: 'Webhook & External Integration Readiness', status: 'Requires External Keys' },
  { no: 32, part: 'Part B', title: 'White-Label Financial & Voucher Settings', status: 'Implemented & Verified' },
  { no: 33, part: 'Part B', title: 'Automated Self-Audit QA Test Suite', status: 'Implemented & Verified' },
  { no: 34, part: 'Part B', title: 'Ledger Equation Integrity Monitor', status: 'Implemented & Verified' },
  { no: 35, part: 'Part B', title: 'SOP & Operator Financial Guidance', status: 'Implemented & Verified' },
  { no: 36, part: 'Part B', title: 'MySQL 8.0 Phase 05 Indexed Schema', status: 'Implemented & Verified' },
  { no: 37, part: 'Part B', title: 'Enterprise Risk & Governance Registry', status: 'Implemented & Verified' },
  { no: 38, part: 'Part B', title: 'Year-End Statutory Export Package', status: 'Implemented & Verified' },
  { no: 39, part: 'Part C', title: 'Dynamic Multi-Statement Report Builder', status: 'Implemented & Verified' },
  { no: 40, part: 'Part C', title: 'Data Archiving, Retention & Legal Hold', status: 'Implemented & Verified' },
  { no: 41, part: 'Part C', title: 'Auto-Match & Manual BRS Engine', status: 'Implemented & Verified' },
  { no: 42, part: 'Part C', title: 'Global General Ledger Search & Filter', status: 'Implemented & Verified' },
  { no: 43, part: 'Part C', title: 'End-to-End ERP-to-GL Traceability', status: 'Implemented & Verified' },
  { no: 44, part: 'Part C', title: 'Threshold & Backdate Anomaly Alerts', status: 'Implemented & Verified' },
  { no: 45, part: 'Part C', title: 'Delegation of Authority (DoA) Approval Matrix', status: 'Implemented & Verified' },
  { no: 46, part: 'Part C', title: 'Cost Center Contribution Analysis', status: 'Implemented & Verified' },
  { no: 47, part: 'Part C', title: 'Customer Credit Limit & Collections Risk', status: 'Implemented & Verified' },
  { no: 48, part: 'Part C', title: 'Supplier Credit Limit & Risk Tracking', status: 'Implemented & Verified' },
  { no: 49, part: 'Part C', title: 'FD / RD & Treasury Surplus Tracker', status: 'Implemented & Verified' },
  { no: 50, part: 'Part C', title: 'Loans & Principal/Interest EMI Split Engine', status: 'Implemented & Verified' },
  { no: 51, part: 'Part C', title: 'Partner Capital & Owner Drawings Ledger', status: 'Implemented & Verified' },
  { no: 52, part: 'Part C', title: 'Profitability & Liquidity KPI Support', status: 'Implemented & Verified' },
  { no: 53, part: 'Part C', title: 'Scenario What-If Financial Simulator', status: 'Implemented & Verified' },
  { no: 54, part: 'Part C', title: 'Unified ERP + GL BI Summary Feed', status: 'Implemented & Verified' },
  { no: 55, part: 'Part D', title: 'Financial Closing & Audit Tasks Checklist', status: 'Implemented & Verified' },
  { no: 56, part: 'Part D', title: 'Fiscal & Statutory Calendar Overview', status: 'Implemented & Verified' },
  { no: 57, part: 'Part D', title: 'Compact Mobile Finance Workspace Mode', status: 'Implemented & Verified' },
  { no: 58, part: 'Part D', title: 'Scoped Customer Self-Service Lookup Portal', status: 'Implemented & Verified' },
  { no: 59, part: 'Part D', title: 'Central Finance Governance Control Hub', status: 'Implemented & Verified' },
  { no: 60, part: 'Part D', title: 'Fraud & Split-Voucher Monitoring Alerts', status: 'Implemented & Verified' },
  { no: 61, part: 'Part D', title: 'Regulatory & Statutory Policy Tracker', status: 'Implemented & Verified' },
  { no: 62, part: 'Part D', title: 'Encrypted Snapshot Continuity & Backup', status: 'Implemented & Verified' },
  { no: 63, part: 'Part D', title: 'Read-Only AI Financial Analyst (@google/genai)', status: 'Requires External Keys' },
  { no: 64, part: 'Part D', title: 'Human-Verified OCR Document Intake', status: 'Human-Triggered' },
  { no: 65, part: 'Part D', title: 'POS Billing & Inventory COGS Ledger Sync', status: 'Implemented & Verified' },
  { no: 66, part: 'Part D', title: 'Franchise Unit Royalty & Settlement', status: 'Implemented & Verified' },
  { no: 67, part: 'Part D', title: 'Recurring Subscriptions & Deferred Revenue', status: 'Implemented & Verified' },
  { no: 68, part: 'Part D', title: 'Multi-Company Consolidation & Elimination', status: 'Implemented & Verified' },
  { no: 69, part: 'Part E', title: 'Franchise Royalty Receivable Posting', status: 'Implemented & Verified' },
  { no: 70, part: 'Part E', title: 'Departmental Budget vs Actual Matrix', status: 'Implemented & Verified' },
  { no: 71, part: 'Part E', title: 'Internal Control & Self-Approval Prevention', status: 'Implemented & Verified' },
  { no: 72, part: 'Part E', title: 'Month-End Closing & Period Reopen Reason Guard', status: 'Implemented & Verified' },
  { no: 73, part: 'Part E', title: 'GSTR-1 / GSTR-2B & TDS Register', status: 'Implemented & Verified' },
  { no: 74, part: 'Part E', title: 'Internal Audit Observations Log', status: 'Implemented & Verified' },
  { no: 75, part: 'Part E', title: 'Cost Center & Gross Margin Analytics', status: 'Implemented & Verified' },
  { no: 76, part: 'Part E', title: 'Multi-Bank Accounts & UTR Settlement Tracking', status: 'Implemented & Verified' },
  { no: 77, part: 'Part E', title: 'AR/AP Ageing & Vendor Payment Settlement', status: 'Implemented & Verified' },
  { no: 78, part: 'Part E', title: 'FIFO & WAC Inventory Batch Valuation', status: 'Implemented & Verified' },
  { no: 79, part: 'Part E', title: 'Fixed Asset Register & Accumulated Dep', status: 'Implemented & Verified' },
  { no: 80, part: 'Part E', title: 'Debt Service & Amortized EMI Schedule', status: 'Implemented & Verified' },
  { no: 81, part: 'Part E', title: 'Petty Cash & Counter Handover Contra Ledger', status: 'Implemented & Verified' },
  { no: 82, part: 'Part E', title: 'Cheque Register & Bank Adjustment Posting', status: 'Implemented & Verified' },
  { no: 83, part: 'Part E', title: 'Sequential Immutable Voucher Numbering', status: 'Implemented & Verified' },
  { no: 84, part: 'Part E', title: 'Immutable Contra Reversal Journal Policy', status: 'Implemented & Verified' },
  { no: 85, part: 'Part E', title: 'Live Balanced Trial Balance Guarantee', status: 'Implemented & Verified' },
  { no: 86, part: 'Part E', title: 'Balance Sheet Equation Real-Time Proof', status: 'Implemented & Verified' },
  { no: 87, part: 'Part E', title: 'Treasury Cash & Bank Liquidity Pool', status: 'Implemented & Verified' },
  { no: 88, part: 'Part E', title: 'Corporate FD/RD Yield & Maturity Ledger', status: 'Implemented & Verified' },
  { no: 89, part: 'Part E', title: 'Equity Capital Infusion & Drawings Ledger', status: 'Implemented & Verified' },
  { no: 90, part: 'Part E', title: 'Voucher Attachment & Legal Hold Archive', status: 'Implemented & Verified' },
  { no: 91, part: 'Part E', title: 'Batch CSV/Opening Migration with Rollback', status: 'Implemented & Verified' },
  { no: 92, part: 'Part E', title: 'AUDITOR Read-Only RBAC Role Governance', status: 'Implemented & Verified' },
  { no: 93, part: 'Part E', title: 'Workflow & Alert Automation Registry', status: 'Implemented & Verified' },
  { no: 94, part: 'Part E', title: 'Live Self-Audit & Printable Audit Certificate', status: 'Implemented & Verified' },
];

export const FinanceEngineHubPage: React.FC<FinanceEngineHubPageProps> = ({
  currentUser,
  onNavigate,
  onShowToast,
}) => {
  const [entityCode, setEntityCode] = useState('ENT-MAIN');
  const [eliminateIntercompany, setEliminateIntercompany] = useState(true);
  const [data, setData] = useState<FinanceOverviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'statements' | 'ar-ap-tax' | 'treasury' | 'governance-portal' | 'audit-94'>('statements');
  const [mobileCompact, setMobileCompact] = useState(false);

  // What-if simulator
  const [revGrowthPct, setRevGrowthPct] = useState(15);
  const [expDeltaPct, setExpDeltaPct] = useState(5);

  // Modals & local states
  const [supplierModal, setSupplierModal] = useState(false);
  const [supplierForm, setSupplierForm] = useState({ name: '', gstin: '', mobile: '', category: 'Supplies', creditLimit: 50000 });
  const [billModal, setBillModal] = useState(false);
  const [billForm, setBillForm] = useState({ supplierId: '', subtotal: 1000, gstAmount: 180, tdsRatePct: 2, expenseAccountCode: '6030' });
  const [equityModal, setEquityModal] = useState(false);
  const [equityForm, setEquityForm] = useState({ partnerId: '', actionType: 'CAPITAL_INFUSION', amount: 10000, notes: '' });

  // Vault OCR & Migration
  const [ocrTitle, setOcrTitle] = useState('');
  const [ocrVendor, setOcrVendor] = useState('');
  const [ocrAmount, setOcrAmount] = useState(0);
  const [taskTitle, setTaskTitle] = useState('');
  const [importAmount, setImportAmount] = useState(1500);
  const [importNarration, setImportNarration] = useState('Opening adjustment migration entry');

  // Customer Portal & AI
  const [portalCustId, setPortalCustId] = useState('MCC-2026-27-000001');
  const [portalLast4, setPortalLast4] = useState('1001');
  const [portalResult, setPortalResult] = useState<any | null>(null);

  const [aiQuestion, setAiQuestion] = useState('Summarize current net profit, cash balance, and PNB CSP commission.');
  const [aiResult, setAiResult] = useState<{ configured: boolean; provider: string; answer: string } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // 94-Module filter & audit certificate
  const [modSearch, setModSearch] = useState('');
  const [auditRunning, setAuditRunning] = useState(false);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await financeApi.getOverview(entityCode, eliminateIntercompany);
      setData(res.data);
      if (res.data.suppliers.length > 0 && !billForm.supplierId) {
        setBillForm((prev) => ({ ...prev, supplierId: res.data.suppliers[0].supplierId }));
      }
      if (res.data.partners.length > 0 && !equityForm.partnerId) {
        setEquityForm((prev) => ({ ...prev, partnerId: res.data.partners[0].partnerId }));
      }
    } catch (err) {
      onShowToast('error', 'Failed to load Financial Hub', err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [entityCode, eliminateIntercompany, onShowToast, billForm.supplierId, equityForm.partnerId]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const isAdmin = currentUser.role === 'ADMIN';
  const canWrite = currentUser.role === 'ADMIN' || currentUser.role === 'MANAGER';
  const isAuditor = currentUser.role === 'AUDITOR';

  const filteredModules = useMemo(() => {
    const q = modSearch.trim().toLowerCase();
    return REGISTRY_94_MODULES.filter(
      (m) => !q || m.title.toLowerCase().includes(q) || m.part.toLowerCase().includes(q) || String(m.no) === q
    );
  }, [modSearch]);

  if (loading || !data) {
    return <div className="p-6 text-xs text-neutral-500">Loading Phase 05 Enterprise Financial Engine...</div>;
  }

  const { statements, kpis } = data;
  const simIncome = statements.profitAndLoss.totalIncome * (1 + revGrowthPct / 100);
  const simExpense = (statements.profitAndLoss.totalCogs + statements.profitAndLoss.totalExpenses) * (1 + expDeltaPct / 100);
  const simProfit = simIncome - simExpense;

  return (
    <div className={`space-y-5 ${mobileCompact ? 'max-w-md mx-auto border-x border-neutral-200 dark:border-neutral-800 px-3 py-2' : ''}`}>
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 no-print">
        <div>
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-blue-800 dark:text-blue-400" />
            <h2 className="text-xl font-bold text-neutral-950 dark:text-white">
              Enterprise Financial Engine (Modules 01–94)
            </h2>
          </div>
          <p className="text-xs text-neutral-500 mt-1">
            Unified Double-Entry General Ledger · Real-Time Consolidation · Strict PNB CSP Segregation ·{' '}
            {isAuditor ? 'Read-Only AUDITOR Mode Active' : 'Maker-Checker Governed'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={entityCode}
            onChange={(e) => setEntityCode(e.target.value)}
            aria-label="Select Accounting Entity"
            className="h-9 px-3 text-xs font-mono bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-md"
          >
            {data.entities
              .filter((e) => !e.isIsolatedCsp)
              .map((ent) => (
                <option key={ent.entityCode} value={ent.entityCode}>
                  {ent.entityCode} — {ent.entityName}
                </option>
              ))}
            <option value="ALL">ALL — Consolidated Business Group (Excl. PNB CSP)</option>
          </select>

          {entityCode === 'ALL' && (
            <label className="inline-flex items-center gap-1.5 text-xs px-2.5 h-9 border border-neutral-200 dark:border-neutral-800 rounded-md bg-white dark:bg-neutral-900 cursor-pointer">
              <input
                type="checkbox"
                checked={eliminateIntercompany}
                onChange={(e) => setEliminateIntercompany(e.target.checked)}
              />
              <span>Eliminate Intercompany (1190/2190)</span>
            </label>
          )}

          <Button
            size="sm"
            variant="outline"
            icon={<Smartphone className="h-3.5 w-3.5" />}
            onClick={() => setMobileCompact((p) => !p)}
          >
            {mobileCompact ? 'Desktop Full' : 'Mobile View (57)'}
          </Button>
          <Button size="sm" variant="outline" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={loadOverview}>
            Refresh
          </Button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className={`grid gap-3 text-xs ${mobileCompact ? 'grid-cols-1' : 'grid-cols-2 lg:grid-cols-5'}`}>
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-3.5">
          <div className="text-neutral-500">Total Assets ({entityCode})</div>
          <div className="mt-1 text-lg font-bold font-mono tabular-nums">{formatCurrency(kpis.totalAssets)}</div>
          <div className="text-[11px] text-neutral-500 mt-0.5">
            Liab {formatCurrency(kpis.totalLiabilities)} · Eq {formatCurrency(kpis.totalEquity)}
          </div>
        </div>
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-3.5">
          <div className="text-neutral-500">Net Profit (Margin {kpis.netMarginPct}%)</div>
          <div className="mt-1 text-lg font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
            {formatCurrency(kpis.netProfit)}
          </div>
          <div className="text-[11px] text-neutral-500 mt-0.5">
            Income {formatCurrency(kpis.totalIncome)} · Exp {formatCurrency(kpis.totalExpenses + kpis.totalCogs)}
          </div>
        </div>
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-3.5">
          <div className="text-neutral-500">Business Cash &amp; Bank</div>
          <div className="mt-1 text-lg font-bold font-mono tabular-nums">{formatCurrency(kpis.closingCashAndBank)}</div>
          <div className="text-[11px] text-neutral-500 mt-0.5">
            Inventory Valuation: {formatCurrency(kpis.inventoryValuation)}
          </div>
        </div>
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-3.5">
          <div className="text-neutral-500">Payables / Est. Receivables</div>
          <div className="mt-1 text-lg font-bold font-mono tabular-nums">
            {formatCurrency(kpis.supplierPayables)} / {formatCurrency(kpis.customerReceivablesEstimated)}
          </div>
          <div className="text-[11px] text-neutral-500 mt-0.5">
            Pending Vouchers: {kpis.pendingApprovalVouchers} · Alerts: {kpis.openFraudAlerts}
          </div>
        </div>
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-3.5">
          <div className="text-neutral-500">PNB CSP Segregated Trust</div>
          <div className="mt-1 text-lg font-bold font-mono tabular-nums">
            {formatCurrency(kpis.pnbCspIsolated.deposits)}
          </div>
          <div className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-0.5">
            Only {formatCurrency(kpis.pnbCspIsolated.commissionRecognizedToBusiness)} fee in Main P&amp;L
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-neutral-200 dark:border-neutral-800 pb-3 no-print">
        {[
          { id: 'statements', label: '1. Statements, Consolidation & What-If (19–20, 46, 53, 68, 85–86)' },
          { id: 'ar-ap-tax', label: `2. AR/AP Suppliers & GST/TDS (${data.supplierBills.length} bills · ${data.taxEntries.length} tax)` },
          { id: 'treasury', label: '3. Assets, Loans, Equity, Franchises & FX (11–12, 26, 49–51, 66–67)' },
          { id: 'governance-portal', label: '4. Governance, OCR Vault, Import, Portal & AI (22, 55–64)' },
          { id: 'audit-94', label: '5. Complete 94-Module Registry & Audit Certificate (94)' },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id as any)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md border cursor-pointer ${
              tab === item.id
                ? 'bg-neutral-950 text-white border-neutral-950 dark:bg-white dark:text-neutral-950 dark:border-white'
                : 'bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 text-neutral-700 dark:text-neutral-300'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* TAB 1: STATEMENTS, CONSOLIDATION & SCENARIO WHAT-IF */}
      {tab === 'statements' && (
        <div className="space-y-5">
          {/* Equation Verification Strip */}
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span className="font-semibold text-neutral-950 dark:text-white">
                Trial Balance Balanced: {statements.trialBalance.isBalanced ? 'YES' : 'NO'} (Diff {formatCurrency(statements.trialBalance.difference)})
              </span>
              <span className="text-neutral-500">·</span>
              <span className="font-semibold text-neutral-950 dark:text-white">
                Balance Sheet Assets = Liabilities + Equity + Profit: {statements.balanceSheet.isBalanced ? 'YES' : 'NO'} (Diff{' '}
                {formatCurrency(statements.balanceSheet.equationDifference)})
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => onNavigate('chart-of-accounts')}>
                Open CoA &amp; Vouchers
              </Button>
              <Button size="sm" variant="outline" onClick={() => onNavigate('banking-csp')}>
                Open Banking &amp; PNB CSP
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 text-xs">
            {/* P&L */}
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 font-semibold flex justify-between">
                <span>Profit &amp; Loss Statement ({entityCode})</span>
                <span className="font-mono">Net: {formatCurrency(statements.profitAndLoss.netProfit)}</span>
              </div>
              <div className="p-4 space-y-2">
                <div className="font-semibold text-neutral-500">Income</div>
                {statements.profitAndLoss.incomeRows.map((r) => (
                  <div key={r.accountCode} className="flex justify-between">
                    <span>{r.accountCode} · {r.accountName}</span>
                    <span className="font-mono tabular-nums">{formatCurrency(r.amount)}</span>
                  </div>
                ))}
                <div className="font-semibold text-neutral-500 pt-2 border-t border-neutral-100 dark:border-neutral-800">COGS &amp; Expenses</div>
                {[...statements.profitAndLoss.cogsRows, ...statements.profitAndLoss.expenseRows].map((r) => (
                  <div key={r.accountCode} className="flex justify-between">
                    <span>{r.accountCode} · {r.accountName}</span>
                    <span className="font-mono tabular-nums text-neutral-600 dark:text-neutral-300">({formatCurrency(r.amount)})</span>
                  </div>
                ))}
                <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800 flex justify-between font-bold">
                  <span>Gross Profit / Net Operating Profit</span>
                  <span className="font-mono tabular-nums">
                    {formatCurrency(statements.profitAndLoss.grossProfit)} / {formatCurrency(statements.profitAndLoss.netProfit)}
                  </span>
                </div>
              </div>
            </div>

            {/* Balance Sheet */}
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 font-semibold flex justify-between">
                <span>Balance Sheet ({entityCode})</span>
                <span className="font-mono">Assets: {formatCurrency(statements.balanceSheet.totalAssets)}</span>
              </div>
              <div className="p-4 space-y-2">
                <div className="font-semibold text-neutral-500">Assets</div>
                {statements.balanceSheet.assetRows.map((r) => (
                  <div key={r.accountCode} className="flex justify-between">
                    <span>{r.accountCode} · {r.accountName}</span>
                    <span className="font-mono tabular-nums">{formatCurrency(r.amount)}</span>
                  </div>
                ))}
                <div className="font-semibold text-neutral-500 pt-2 border-t border-neutral-100 dark:border-neutral-800">Liabilities &amp; Equity</div>
                {[...statements.balanceSheet.liabilityRows, ...statements.balanceSheet.equityRows].map((r) => (
                  <div key={r.accountCode} className="flex justify-between">
                    <span>{r.accountCode} · {r.accountName}</span>
                    <span className="font-mono tabular-nums">{formatCurrency(r.amount)}</span>
                  </div>
                ))}
                <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800 flex justify-between font-bold">
                  <span>Total Liabilities + Equity (Incl. Current Net Profit)</span>
                  <span className="font-mono tabular-nums">
                    {formatCurrency(statements.balanceSheet.totalLiabilities + statements.balanceSheet.totalEquityIncludingNetProfit)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Cost Centers + Cash Flow + What-If Simulator */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 text-xs">
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 space-y-2">
              <div className="font-semibold">Cost Center Profitability (Mod 46) &amp; Cash Flow (Mod 19)</div>
              <div className="grid grid-cols-3 gap-2 p-2.5 rounded bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 font-mono">
                <div>Operating CF: {formatCurrency(statements.cashFlowStatement.operatingCashFlow)}</div>
                <div>Investing CF: {formatCurrency(statements.cashFlowStatement.investingCashFlow)}</div>
                <div>Financing CF: {formatCurrency(statements.cashFlowStatement.financingCashFlow)}</div>
              </div>
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {statements.costCenterProfitability.map((cc) => (
                  <div key={cc.costCenter} className="py-2 flex justify-between font-mono">
                    <span>{cc.costCenter}</span>
                    <span>
                      Inc {formatCurrency(cc.income)} · Cost {formatCurrency(cc.directAndOperatingCost)} · Net{' '}
                      <strong>{formatCurrency(cc.netContribution)}</strong>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2 font-semibold">
                <Sliders className="h-4 w-4 text-blue-800 dark:text-blue-400" />
                <span>Scenario What-If Simulator (Module 53 — Non-Mutating)</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block mb-1">Revenue Growth Assumption: {revGrowthPct}%</label>
                  <input
                    type="range"
                    min={-30}
                    max={100}
                    value={revGrowthPct}
                    onChange={(e) => setRevGrowthPct(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block mb-1">Expense / COGS Change: {expDeltaPct}%</label>
                  <input
                    type="range"
                    min={-25}
                    max={60}
                    value={expDeltaPct}
                    onChange={(e) => setExpDeltaPct(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
              </div>
              <div className="p-3 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded font-mono flex justify-between">
                <span>Projected Revenue: {formatCurrency(simIncome)}</span>
                <span>Projected Expenses: {formatCurrency(simExpense)}</span>
                <span>Projected Net Profit: <strong>{formatCurrency(simProfit)}</strong></span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: AR/AP, SUPPLIER BILLS & GST/TDS */}
      {tab === 'ar-ap-tax' && (
        <div className="space-y-5 text-xs">
          {canWrite && (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="primary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setBillModal(true)}>
                Record Supplier Bill (AP + GST + TDS)
              </Button>
              <Button size="sm" variant="outline" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setSupplierModal(true)}>
                Register Supplier Vendor
              </Button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Supplier Bills */}
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg divide-y divide-neutral-100 dark:divide-neutral-800">
              <div className="px-4 py-3 font-semibold">Supplier Bills &amp; Payables ({data.supplierBills.length})</div>
              {data.supplierBills.map((b) => (
                <div key={b.billNo} className="p-3.5 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-mono font-bold">{b.billNo} · {b.supplierName}</div>
                    <div className="text-neutral-500">
                      Sub {formatCurrency(b.subtotal)} + GST {formatCurrency(b.gstAmount)} − TDS {formatCurrency(b.tdsDeducted)} = Net {formatCurrency(b.netPayable)} · Paid {formatCurrency(b.paidAmount)} ({b.status})
                    </div>
                  </div>
                  {canWrite && b.status !== 'Paid' && (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={async () => {
                        try {
                          await financeApi.paySupplierBill(b.billNo);
                          onShowToast('success', 'Supplier Bill Settled');
                          loadOverview();
                        } catch (err) {
                          onShowToast('error', 'Settlement Failed', err instanceof Error ? err.message : undefined);
                        }
                      }}
                    >
                      Pay Balance
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {/* Customer Credit Control */}
            <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg divide-y divide-neutral-100 dark:divide-neutral-800">
              <div className="px-4 py-3 font-semibold">Customer Credit Profiles &amp; AR Guard (Mod 06, 47)</div>
              {data.customerCredits.map((c) => (
                <div key={c.customerId} className="p-3.5 flex justify-between">
                  <div>
                    <div className="font-mono font-bold">{c.customerId} · {c.customerName}</div>
                    <div className="text-neutral-500">
                      Limit {formatCurrency(c.creditLimit)} · {c.creditDays} days · Risk: {c.riskTag}
                    </div>
                  </div>
                  <div className="font-mono text-right">
                    <div>Advance: {formatCurrency(c.advanceBalance)}</div>
                    <div className="text-neutral-500">{c.creditBlocked ? 'Blocked' : 'Credit Active'}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* GST & TDS Register */}
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-x-auto">
            <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 font-semibold">
              Taxation Register — GSTR-1 Outward, GSTR-2B Input &amp; TDS (Modules 10, 73)
            </div>
            <table className="w-full text-left">
              <thead className="bg-neutral-50 dark:bg-neutral-950 border-b border-neutral-200 dark:border-neutral-800 text-neutral-500">
                <tr>
                  <th className="px-4 py-2">Entry ID</th>
                  <th className="px-4 py-2">Return Type</th>
                  <th className="px-4 py-2">Party / GSTIN</th>
                  <th className="px-4 py-2 text-right">Taxable Value</th>
                  <th className="px-4 py-2 text-right">CGST + SGST</th>
                  <th className="px-4 py-2 text-right">TDS/TCS</th>
                  <th className="px-4 py-2">Voucher</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {data.taxEntries.map((t) => (
                  <tr key={t.taxEntryId}>
                    <td className="px-4 py-2 font-mono">{t.taxEntryId}</td>
                    <td className="px-4 py-2">{t.returnType}</td>
                    <td className="px-4 py-2">{t.partyName} ({t.gstinOrPan})</td>
                    <td className="px-4 py-2 text-right font-mono">{formatCurrency(t.taxableValue)}</td>
                    <td className="px-4 py-2 text-right font-mono">{formatCurrency(t.cgst + t.sgst + t.igst)}</td>
                    <td className="px-4 py-2 text-right font-mono">{formatCurrency(t.tdsOrTcs)}</td>
                    <td className="px-4 py-2 font-mono">{t.voucherNo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: TREASURY, FIXED ASSETS, LOANS, EQUITY, FRANCHISES, RECURRING & FX */}
      {tab === 'treasury' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 text-xs">
          {/* Fixed Assets */}
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold">Fixed Assets &amp; SLM/WDV Depreciation (Mod 11, 79)</span>
              {isAdmin && (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={async () => {
                    try {
                      const res: any = await financeApi.runDepreciation(1);
                      onShowToast('success', 'Depreciation Posted', res.message);
                      loadOverview();
                    } catch (err) {
                      onShowToast('error', 'Depreciation Failed', err instanceof Error ? err.message : undefined);
                    }
                  }}
                >
                  Run 1-Mo Depreciation
                </Button>
              )}
            </div>
            <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {data.fixedAssets.map((fa) => (
                <div key={fa.assetCode} className="py-2 flex justify-between">
                  <div>
                    <div className="font-mono font-bold">{fa.assetCode} · {fa.assetName}</div>
                    <div className="text-neutral-500">{fa.depreciationMethod} ({fa.ratePct}%) · Cost {formatCurrency(fa.costAmount)}</div>
                  </div>
                  <div className="text-right font-mono">
                    <div>NBV: {formatCurrency(fa.costAmount - fa.accumulatedDepreciation)}</div>
                    <div className="text-neutral-500">Acc Dep: {formatCurrency(fa.accumulatedDepreciation)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Loans & EMI Split */}
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 space-y-3">
            <div className="font-semibold">Loans &amp; EMI Principal/Interest Split (Mod 50, 80)</div>
            <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {data.loans.map((ln) => (
                <div key={ln.loanId} className="py-2 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-mono font-bold">{ln.loanId} · {ln.lenderName} ({ln.annualRatePct}% p.a.)</div>
                    <div className="text-neutral-500">
                      EMI {formatCurrency(ln.emiAmount)} · Outstanding {formatCurrency(ln.outstandingPrincipal)} · Paid {ln.emisPaid}
                    </div>
                  </div>
                  {isAdmin && ln.status === 'Active' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        try {
                          const res: any = await financeApi.payLoanEmi(ln.loanId);
                          onShowToast('success', 'Loan EMI Posted', res.message);
                          loadOverview();
                        } catch (err) {
                          onShowToast('error', 'EMI Error', err instanceof Error ? err.message : undefined);
                        }
                      }}
                    >
                      Pay Next EMI
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800">
              <div className="font-semibold mb-1.5">Investments FD/RD &amp; Treasury (Mod 49, 88)</div>
              {data.investments.map((inv) => (
                <div key={inv.investmentId} className="flex justify-between py-1">
                  <span>{inv.instrumentName} ({inv.institution} · {inv.annualYieldPct}%)</span>
                  <span className="font-mono">{formatCurrency(inv.principalAmount)} (+{formatCurrency(inv.accruedInterest)})</span>
                </div>
              ))}
            </div>
          </div>

          {/* Equity & Franchises */}
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold">Partner Equity &amp; Drawings (Mod 51, 89)</span>
              {isAdmin && (
                <Button size="sm" variant="outline" onClick={() => setEquityModal(true)}>
                  Post Capital / Drawings
                </Button>
              )}
            </div>
            {data.partners.map((pt) => (
              <div key={pt.partnerId} className="flex justify-between py-1.5 border-b border-neutral-100 dark:border-neutral-800">
                <span>{pt.partnerName} ({pt.ownershipPct}%)</span>
                <span className="font-mono">Capital {formatCurrency(pt.capitalBalance)} · Drawings {formatCurrency(pt.drawingsYtd)}</span>
              </div>
            ))}

            <div className="pt-2">
              <div className="font-semibold mb-1.5">Franchise Royalties (Mod 66, 69) &amp; Subscriptions (Mod 67)</div>
              {data.franchises.map((fr) => (
                <div key={fr.franchiseCode} className="flex items-center justify-between py-1.5">
                  <div>
                    <span className="font-mono font-bold">{fr.franchiseCode}</span> · {fr.partnerName} ({fr.royaltyPct}% royalty)
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono">Due: {formatCurrency(fr.royaltyPayableOrReceivable)}</span>
                    {isAdmin && fr.royaltyPayableOrReceivable > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          await financeApi.settleFranchiseRoyalty(fr.franchiseCode);
                          onShowToast('success', 'Royalty Settled');
                          loadOverview();
                        }}
                      >
                        Settle
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              {data.subscriptions.map((sub) => (
                <div key={sub.subId} className="flex justify-between py-1 text-neutral-500">
                  <span>{sub.planName} ({sub.customerName})</span>
                  <span className="font-mono">Deferred {formatCurrency(sub.deferredRevenueBalance)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Budgets, Recurring Rules & FX */}
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 space-y-3">
            <div className="font-semibold">Budgets (Mod 12), Recurring Vouchers (Mod 16) &amp; FX Rates (Mod 26)</div>
            <div className="space-y-1.5">
              {data.budgets.map((b) => (
                <div key={b.budgetId} className="flex justify-between py-1 border-b border-neutral-100 dark:border-neutral-800">
                  <span>{b.departmentOrCenter} · {b.accountName}</span>
                  <span className="font-mono">Budget {formatCurrency(b.annualBudget)}</span>
                </div>
              ))}
            </div>

            <div className="pt-2 space-y-1.5">
              <div className="font-semibold">Recurring Rules (Explicit Human Execution)</div>
              {data.recurringRules.map((rr) => (
                <div key={rr.ruleId} className="flex items-center justify-between py-1">
                  <span>{rr.title} ({rr.frequency} · {formatCurrency(rr.amount)})</span>
                  {canWrite && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        const res: any = await financeApi.executeRecurringRule(rr.ruleId);
                        onShowToast('success', 'Recurring Executed', res.message);
                        loadOverview();
                      }}
                    >
                      Run Now
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800 flex flex-wrap gap-3 font-mono">
              {data.currencyRates.map((fx) => (
                <span key={fx.currencyCode} className="px-2 py-1 rounded border border-neutral-200 dark:border-neutral-800">
                  1 {fx.currencyCode} = ₹{fx.spotRateInr}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: GOVERNANCE, OCR VAULT, IMPORT, CUSTOMER PORTAL & AI ASSISTANT */}
      {tab === 'governance-portal' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 text-xs">
          {/* Fraud Alerts & Tasks */}
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <span>Fraud &amp; Anomaly Alerts (Mod 44, 60) + Compliance Tasks (Mod 55, 61)</span>
            </div>
            <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {data.fraudAlerts.map((al) => (
                <div key={al.alertId} className="py-2 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-mono font-bold">{al.alertId} · [{al.severity}] {al.category}</div>
                    <div className="text-neutral-500">{al.description} ({al.status})</div>
                  </div>
                  {isAdmin && al.status === 'Open' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        await financeApi.resolveFraudAlert(al.alertId, 'Resolved');
                        onShowToast('success', 'Alert Resolved');
                        loadOverview();
                      }}
                    >
                      Resolve
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {!isAuditor && (
              <div className="flex gap-2 pt-2">
                <input
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="New financial audit/closing task..."
                  className="flex-1 h-8 px-2.5 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
                />
                <Button
                  size="sm"
                  variant="primary"
                  onClick={async () => {
                    if (!taskTitle.trim()) return;
                    await financeApi.createTask({ title: taskTitle, category: 'Closing' });
                    setTaskTitle('');
                    loadOverview();
                  }}
                >
                  Add Task
                </Button>
              </div>
            )}
            <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {data.tasks.map((tItem) => (
                <div key={tItem.taskId} className="py-1.5 flex items-center justify-between">
                  <span>{tItem.title} ({tItem.status})</span>
                  {!isAuditor && tItem.status !== 'Completed' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        await financeApi.updateTaskStatus(tItem.taskId, 'Completed');
                        loadOverview();
                      }}
                    >
                      Complete
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Document Vault & Human-Verified OCR + Data Migration */}
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2 font-semibold">
              <FolderLock className="h-4 w-4 text-blue-800 dark:text-blue-400" />
              <span>Document Vault, Legal Hold &amp; Human-Verified OCR (Mod 40, 64, 90)</span>
            </div>
            {!isAuditor && (
              <div className="grid grid-cols-3 gap-2">
                <input
                  value={ocrTitle}
                  onChange={(e) => setOcrTitle(e.target.value)}
                  placeholder="Document title"
                  className="h-8 px-2 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
                />
                <input
                  value={ocrVendor}
                  onChange={(e) => setOcrVendor(e.target.value)}
                  placeholder="Vendor name"
                  className="h-8 px-2 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
                />
                <div className="flex gap-1">
                  <input
                    type="number"
                    value={ocrAmount}
                    onChange={(e) => setOcrAmount(Number(e.target.value))}
                    placeholder="Amt"
                    className="w-20 h-8 px-2 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      if (!ocrTitle) return;
                      await financeApi.createVaultOcrEntry({ title: ocrTitle, extractedVendor: ocrVendor, extractedAmount: ocrAmount });
                      setOcrTitle('');
                      loadOverview();
                    }}
                  >
                    Intake
                  </Button>
                </div>
              </div>
            )}
            <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {data.documentVault.map((doc) => (
                <div key={doc.vaultId} className="py-2 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-mono font-bold">
                      {doc.vaultId} · {doc.title} {doc.legalHold ? '[LEGAL HOLD]' : ''}
                    </div>
                    <div className="text-neutral-500">
                      Human Verified: {doc.humanVerified ? 'Yes' : 'Pending Review'} · Voucher: {doc.linkedVoucherNo || 'Not Posted'}
                    </div>
                  </div>
                  {canWrite && !doc.humanVerified && (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={async () => {
                        await financeApi.verifyAndPostVaultDoc(doc.vaultId, doc.ocrExtractedAmount || 500);
                        onShowToast('success', 'OCR Document Verified & Posted');
                        loadOverview();
                      }}
                    >
                      Verify &amp; Post
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {/* Data Import & Rollback */}
            <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800 space-y-2">
              <div className="flex items-center gap-2 font-semibold">
                <Upload className="h-4 w-4 text-neutral-600" />
                <span>Data Migration Dry-Run, Commit &amp; Rollback (Mod 22, 91)</span>
              </div>
              {isAdmin && (
                <div className="flex flex-wrap gap-2">
                  <input
                    value={importNarration}
                    onChange={(e) => setImportNarration(e.target.value)}
                    className="flex-1 h-8 px-2 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
                  />
                  <input
                    type="number"
                    value={importAmount}
                    onChange={(e) => setImportAmount(Number(e.target.value))}
                    className="w-24 h-8 px-2 font-mono border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      const res: any = await financeApi.runImportBatch({
                        importType: 'Opening Balances',
                        commit: false,
                        rows: [{ debitAccountCode: '1001', creditAccountCode: '4130', amount: importAmount, narration: importNarration }],
                      });
                      onShowToast('info', 'Dry-Run Validated', res.message);
                      loadOverview();
                    }}
                  >
                    Dry-Run
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={async () => {
                      const res: any = await financeApi.runImportBatch({
                        importType: 'Opening Balances',
                        commit: true,
                        rows: [{ debitAccountCode: '1001', creditAccountCode: '4130', amount: importAmount, narration: importNarration }],
                      });
                      onShowToast('success', 'Migration Committed', res.message);
                      loadOverview();
                    }}
                  >
                    Commit Batch
                  </Button>
                </div>
              )}
              {data.importBatches.map((imp) => (
                <div key={imp.batchId} className="flex items-center justify-between py-1">
                  <span className="font-mono">{imp.batchId} · {imp.importType} · {imp.validRows}/{imp.totalRows} · {imp.status}</span>
                  {isAdmin && imp.status === 'Committed' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        await financeApi.rollbackImportBatch(imp.batchId);
                        onShowToast('info', 'Migration Batch Rolled Back');
                        loadOverview();
                      }}
                    >
                      Rollback
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Customer Self-Service Scoped Lookup Portal (Mod 58) */}
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2 font-semibold">
              <Building2 className="h-4 w-4 text-blue-800 dark:text-blue-400" />
              <span>Customer Self-Service Scoped Portal (Module 58 — Own-Record Isolation)</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                value={portalCustId}
                onChange={(e) => setPortalCustId(e.target.value)}
                placeholder="Customer ID (e.g. MCC-2026-27-000001)"
                className="flex-1 h-9 px-3 font-mono border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
              />
              <input
                value={portalLast4}
                onChange={(e) => setPortalLast4(e.target.value)}
                maxLength={4}
                placeholder="Last 4 digits"
                className="w-28 h-9 px-3 font-mono border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
              />
              <Button
                size="sm"
                variant="primary"
                onClick={async () => {
                  try {
                    const res: any = await financeApi.customerPortalLookup(portalCustId, portalLast4);
                    setPortalResult(res.data);
                  } catch (err) {
                    setPortalResult(null);
                    onShowToast('error', 'Portal Verification Failed', err instanceof Error ? err.message : undefined);
                  }
                }}
              >
                Verify &amp; Lookup
              </Button>
            </div>
            {portalResult && (
              <div className="p-3 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded space-y-2">
                <div className="flex justify-between font-semibold">
                  <span>{portalResult.fullName} ({portalResult.maskedMobile})</span>
                  <span className="font-mono">Due: {formatCurrency(portalResult.totalBalanceDue)}</span>
                </div>
                {portalResult.applications.map((a: any) => (
                  <div key={a.applicationNo} className="flex justify-between font-mono text-[11px]">
                    <span>{a.applicationNo} · {a.serviceName} ({a.status})</span>
                    <span>Paid {formatCurrency(a.paid)} / Fee {formatCurrency(a.fee)}</span>
                  </div>
                ))}
                <div className="text-[11px] text-neutral-500">{portalResult.gatewayNote}</div>
              </div>
            )}
          </div>

          {/* Read-Only AI Financial Assistant (Mod 63) */}
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-2 font-semibold">
              <Bot className="h-4 w-4 text-blue-800 dark:text-blue-400" />
              <span>Read-Only AI Financial Assistant (Module 63 — Server-Side @google/genai)</span>
            </div>
            <div className="flex gap-2">
              <input
                value={aiQuestion}
                onChange={(e) => setAiQuestion(e.target.value)}
                placeholder="Ask read-only question about current financials..."
                className="flex-1 h-9 px-3 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
              />
              <Button
                size="sm"
                variant="primary"
                loading={aiLoading}
                onClick={async () => {
                  setAiLoading(true);
                  try {
                    const res = await financeApi.askAiAssistant(aiQuestion);
                    setAiResult(res.data);
                  } finally {
                    setAiLoading(false);
                  }
                }}
              >
                Analyze
              </Button>
            </div>
            {aiResult && (
              <div className="p-3 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded space-y-1">
                <div className="font-semibold">
                  Provider: {aiResult.provider} · Configured: {aiResult.configured ? 'Yes' : 'No'} · Mode: Read-Only (Never Mutates Ledger)
                </div>
                <div className="text-neutral-700 dark:text-neutral-300 leading-relaxed">{aiResult.answer}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: 94-MODULE REGISTRY & PRINTABLE SELF-AUDIT CERTIFICATE */}
      {tab === 'audit-94' && (
        <div className="space-y-5 text-xs">
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 no-print">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
                <div>
                  <h3 className="text-sm font-bold text-neutral-950 dark:text-white">
                    Module 94: Automated Self-Audit &amp; Production Audit Certificate
                  </h3>
                  <p className="text-neutral-500">
                    Runs live cryptographic, Trial Balance, Balance Sheet, PNB CSP Segregation, and RBAC checks directly against memory/DB state.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  loading={auditRunning}
                  icon={<FileCheck2 className="h-3.5 w-3.5" />}
                  onClick={async () => {
                    setAuditRunning(true);
                    try {
                      await financeApi.runAuditVerification();
                      onShowToast('success', 'Self-Audit Completed');
                      loadOverview();
                    } finally {
                      setAuditRunning(false);
                    }
                  }}
                >
                  Run Live Self-Audit
                </Button>
                {data.latestAuditCertificate && (
                  <Button size="sm" variant="outline" icon={<Printer className="h-3.5 w-3.5" />} onClick={() => window.print()}>
                    Print Certificate PDF
                  </Button>
                )}
              </div>
            </div>

            {data.latestAuditCertificate && (
              <div className="p-5 border-2 border-neutral-950 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950 space-y-4">
                <div className="flex flex-wrap justify-between border-b border-neutral-200 dark:border-neutral-800 pb-3">
                  <div>
                    <div className="text-sm font-bold">MUN COMPUTER — PHASE 05 FINANCIAL ENGINE AUDIT CERTIFICATE</div>
                    <div className="text-neutral-500">
                      Certificate: <span className="font-mono font-bold">{data.latestAuditCertificate.certificateNo}</span> · Verdict:{' '}
                      <strong className="text-emerald-700 dark:text-emerald-400">
                        {data.latestAuditCertificate.overallVerdict} ({data.latestAuditCertificate.checksPassed}/{data.latestAuditCertificate.totalChecks})
                      </strong>
                    </div>
                  </div>
                  <div className="font-mono text-right text-neutral-500">
                    <div>Verified By: {data.latestAuditCertificate.generatedBy}</div>
                    <div>{data.latestAuditCertificate.generatedAt.slice(0, 19).replace('T', ' ')}</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  {data.latestAuditCertificate.checks.map((chk: any) => (
                    <div key={chk.checkId} className="p-2.5 rounded border border-neutral-200 dark:border-neutral-800">
                      <div className="font-mono font-bold">
                        {chk.checkId} · {chk.passed ? 'PASS' : 'FAIL'} · {chk.metricValue}
                      </div>
                      <div className="font-medium mt-0.5">{chk.title}</div>
                      <div className="text-[11px] text-neutral-500 mt-0.5">{chk.detail}</div>
                    </div>
                  ))}
                </div>

                <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800">
                  <div className="font-semibold mb-1.5">External Integration Truthfulness Matrix</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                    {data.latestAuditCertificate.integrationStatuses.map((st: any) => (
                      <div key={st.area} className="flex justify-between p-2 rounded bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
                        <span className="font-medium">{st.area}</span>
                        <span className="font-mono text-[11px]">{st.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Searchable 94-Module Registry */}
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden no-print">
            <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-3">
              <span className="font-semibold">Approved 94-Module Directory ({filteredModules.length}/94)</span>
              <div className="relative w-64">
                <Search className="h-3.5 w-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={modSearch}
                  onChange={(e) => setModSearch(e.target.value)}
                  placeholder="Filter modules (1–94)..."
                  className="w-full h-8 pl-8 pr-3 border border-neutral-200 dark:border-neutral-700 rounded bg-white dark:bg-neutral-950"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 divide-y md:divide-y-0 md:gap-px bg-neutral-100 dark:bg-neutral-800">
              {filteredModules.map((m) => (
                <div key={m.no} className="p-3 bg-white dark:bg-neutral-900 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-mono font-bold text-[11px]">
                      MOD {String(m.no).padStart(2, '0')} · {m.part}
                    </div>
                    <div className="font-medium">{m.title}</div>
                  </div>
                  <span className="text-[10px] font-mono text-neutral-500 shrink-0">{m.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Supplier Modal */}
      <Modal isOpen={supplierModal} onClose={() => setSupplierModal(false)} title="Register Supplier Vendor">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await financeApi.createSupplier(supplierForm);
            setSupplierModal(false);
            onShowToast('success', 'Supplier Registered');
            loadOverview();
          }}
          className="space-y-3 text-xs"
        >
          <input required placeholder="Supplier Name" value={supplierForm.name} onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })} className="w-full h-9 px-3 border rounded bg-white dark:bg-neutral-950" />
          <MobileNumberInput
            required
            value={supplierForm.mobile}
            onChange={(val) => setSupplierForm((prev) => ({ ...prev, mobile: val }))}
            aria-label="Supplier mobile number"
          />
          <input placeholder="GSTIN" value={supplierForm.gstin} onChange={(e) => setSupplierForm({ ...supplierForm, gstin: e.target.value })} className="w-full h-9 px-3 border rounded bg-white dark:bg-neutral-950" />
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setSupplierModal(false)}>Cancel</Button>
            <Button type="submit" size="sm" variant="primary">Save Supplier</Button>
          </div>
        </form>
      </Modal>

      {/* Supplier Bill Modal */}
      <Modal isOpen={billModal} onClose={() => setBillModal(false)} title="Record Supplier Bill (AP + Input GST + TDS)">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await financeApi.createSupplierBill(billForm);
            setBillModal(false);
            onShowToast('success', 'Supplier Bill Posted');
            loadOverview();
          }}
          className="space-y-3 text-xs"
        >
          <select value={billForm.supplierId} onChange={(e) => setBillForm({ ...billForm, supplierId: e.target.value })} className="w-full h-9 px-3 border rounded bg-white dark:bg-neutral-950">
            {data.suppliers.map((s) => (
              <option key={s.supplierId} value={s.supplierId}>{s.supplierId} — {s.name}</option>
            ))}
          </select>
          <div className="grid grid-cols-3 gap-2">
            <input type="number" min={1} value={billForm.subtotal} onChange={(e) => setBillForm({ ...billForm, subtotal: Number(e.target.value) })} placeholder="Subtotal" className="h-9 px-2 border rounded bg-white dark:bg-neutral-950" />
            <input type="number" min={0} value={billForm.gstAmount} onChange={(e) => setBillForm({ ...billForm, gstAmount: Number(e.target.value) })} placeholder="GST ₹" className="h-9 px-2 border rounded bg-white dark:bg-neutral-950" />
            <input type="number" min={0} value={billForm.tdsRatePct} onChange={(e) => setBillForm({ ...billForm, tdsRatePct: Number(e.target.value) })} placeholder="TDS %" className="h-9 px-2 border rounded bg-white dark:bg-neutral-950" />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setBillModal(false)}>Cancel</Button>
            <Button type="submit" size="sm" variant="primary">Post Bill &amp; GSTR-2B</Button>
          </div>
        </form>
      </Modal>

      {/* Equity Transaction Modal */}
      <Modal isOpen={equityModal} onClose={() => setEquityModal(false)} title="Partner Capital / Owner Drawings">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await financeApi.postEquityTransaction(equityForm);
            setEquityModal(false);
            onShowToast('success', 'Equity Voucher Posted');
            loadOverview();
          }}
          className="space-y-3 text-xs"
        >
          <select value={equityForm.partnerId} onChange={(e) => setEquityForm({ ...equityForm, partnerId: e.target.value })} className="w-full h-9 px-3 border rounded bg-white dark:bg-neutral-950">
            {data.partners.map((p) => (
              <option key={p.partnerId} value={p.partnerId}>{p.partnerName}</option>
            ))}
          </select>
          <select value={equityForm.actionType} onChange={(e) => setEquityForm({ ...equityForm, actionType: e.target.value })} className="w-full h-9 px-3 border rounded bg-white dark:bg-neutral-950">
            <option value="CAPITAL_INFUSION">Capital Infusion (Dr Bank / Cr 3001)</option>
            <option value="OWNER_DRAWINGS">Owner Drawings (Dr 3010 / Cr Bank)</option>
          </select>
          <input type="number" min={1} value={equityForm.amount} onChange={(e) => setEquityForm({ ...equityForm, amount: Number(e.target.value) })} className="w-full h-9 px-3 border rounded bg-white dark:bg-neutral-950 font-mono" />
          <input placeholder="Notes" value={equityForm.notes} onChange={(e) => setEquityForm({ ...equityForm, notes: e.target.value })} className="w-full h-9 px-3 border rounded bg-white dark:bg-neutral-950" />
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setEquityModal(false)}>Cancel</Button>
            <Button type="submit" size="sm" variant="primary">Post Equity Journal</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
