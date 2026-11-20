import { securityRequest } from './securityApi';

export interface FinanceOverviewPayload {
  entities: any[];
  selectedEntity: string;
  statements: {
    entityCode: string;
    generatedAt: string;
    trialBalance: {
      rows: Array<{
        accountCode: string;
        accountName: string;
        accountType: string;
        subType: string;
        openingDebit: number;
        openingCredit: number;
        periodDebit: number;
        periodCredit: number;
        closingDebit: number;
        closingCredit: number;
        netBalance: number;
      }>;
      totalOpeningDebit: number;
      totalOpeningCredit: number;
      totalPeriodDebit: number;
      totalPeriodCredit: number;
      totalClosingDebit: number;
      totalClosingCredit: number;
      isBalanced: boolean;
      difference: number;
    };
    profitAndLoss: {
      incomeRows: Array<{ accountCode: string; accountName: string; amount: number }>;
      cogsRows: Array<{ accountCode: string; accountName: string; amount: number }>;
      expenseRows: Array<{ accountCode: string; accountName: string; amount: number }>;
      totalIncome: number;
      totalCogs: number;
      grossProfit: number;
      totalExpenses: number;
      netProfit: number;
    };
    balanceSheet: {
      assetRows: Array<{ accountCode: string; accountName: string; subType: string; amount: number }>;
      liabilityRows: Array<{ accountCode: string; accountName: string; subType: string; amount: number }>;
      equityRows: Array<{ accountCode: string; accountName: string; subType: string; amount: number }>;
      totalAssets: number;
      totalLiabilities: number;
      totalEquityIncludingNetProfit: number;
      isBalanced: boolean;
      equationDifference: number;
    };
    cashFlowStatement: {
      operatingCashFlow: number;
      investingCashFlow: number;
      financingCashFlow: number;
      netCashChange: number;
      closingCashAndBank: number;
    };
    costCenterProfitability: Array<{
      costCenter: string;
      income: number;
      directAndOperatingCost: number;
      netContribution: number;
    }>;
  };
  kpis: {
    totalAssets: number;
    totalLiabilities: number;
    totalEquity: number;
    totalIncome: number;
    totalCogs: number;
    grossProfit: number;
    totalExpenses: number;
    netProfit: number;
    netMarginPct: number;
    closingCashAndBank: number;
    inventoryValuation: number;
    supplierPayables: number;
    customerReceivablesEstimated: number;
    erpConfirmedRevenue: number;
    pendingApprovalVouchers: number;
    openFraudAlerts: number;
    pnbCspIsolated: {
      deposits: number;
      withdrawals: number;
      commissionRecognizedToBusiness: number;
    };
  };
  fiscalYears: any[];
  fiscalPeriods: any[];
  chartOfAccounts: any[];
  vouchers: any[];
  cashCounters: any[];
  cashTransfers: any[];
  pnbCspLedger: any[];
  paymentModes: any[];
  customerCredits: any[];
  suppliers: any[];
  supplierBills: any[];
  bankAccounts: any[];
  bankStatements: any[];
  cheques: any[];
  employees: any[];
  payrollRuns: any[];
  taxEntries: any[];
  fixedAssets: any[];
  budgets: any[];
  recurringRules: any[];
  products: any[];
  inventoryMovements: any[];
  loans: any[];
  investments: any[];
  partners: any[];
  franchises: any[];
  subscriptions: any[];
  currencyRates: any[];
  approvalMatrix: any[];
  fraudAlerts: any[];
  compliancePolicies: any[];
  tasks: any[];
  documentVault: any[];
  importBatches: any[];
  auditObservations: any[];
  whiteLabelSettings: any;
  workflowRules: any[];
  notificationRules: any[];
  latestAuditCertificate: any | null;
}

export const financeApi = {
  getOverview: (entityCode = 'ENT-MAIN', eliminate = true) =>
    securityRequest<FinanceOverviewPayload>(
      `/api/finance/overview?entityCode=${encodeURIComponent(entityCode)}&eliminate=${eliminate}`
    ),

  createCoaAccount: (payload: Record<string, unknown>) =>
    securityRequest('/api/finance/coa', { method: 'POST', body: JSON.stringify(payload) }),

  archiveCoaAccount: (code: string) =>
    securityRequest(`/api/finance/coa/${encodeURIComponent(code)}`, { method: 'DELETE' }),

  createVoucher: (payload: Record<string, unknown>) =>
    securityRequest('/api/finance/vouchers', { method: 'POST', body: JSON.stringify(payload) }),

  approveVoucher: (voucherNo: string) =>
    securityRequest(`/api/finance/vouchers/${encodeURIComponent(voucherNo)}/approve`, {
      method: 'POST',
      body: '{}',
    }),

  reverseVoucher: (voucherNo: string, reason: string) =>
    securityRequest(`/api/finance/vouchers/${encodeURIComponent(voucherNo)}/reverse`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  setPeriodStatus: (periodCode: string, status: string, reason: string) =>
    securityRequest(`/api/finance/periods/${encodeURIComponent(periodCode)}/status`, {
      method: 'POST',
      body: JSON.stringify({ status, reason }),
    }),

  createCashTransfer: (payload: Record<string, unknown>) =>
    securityRequest('/api/finance/cash-transfers', { method: 'POST', body: JSON.stringify(payload) }),

  recordPnbCsp: (payload: Record<string, unknown>) =>
    securityRequest('/api/finance/pnb-csp', { method: 'POST', body: JSON.stringify(payload) }),

  addBankStatementLine: (payload: Record<string, unknown>) =>
    securityRequest('/api/finance/banking/statements', { method: 'POST', body: JSON.stringify(payload) }),

  autoReconcileBank: () =>
    securityRequest('/api/finance/banking/auto-reconcile', { method: 'POST', body: '{}' }),

  reconcileStatementLine: (lineId: string, voucherNo?: string) =>
    securityRequest(`/api/finance/banking/statements/${encodeURIComponent(lineId)}/reconcile`, {
      method: 'POST',
      body: JSON.stringify({ voucherNo }),
    }),

  createSupplier: (payload: Record<string, unknown>) =>
    securityRequest('/api/finance/suppliers', { method: 'POST', body: JSON.stringify(payload) }),

  createSupplierBill: (payload: Record<string, unknown>) =>
    securityRequest('/api/finance/supplier-bills', { method: 'POST', body: JSON.stringify(payload) }),

  paySupplierBill: (billNo: string, amount?: number, paymentMode = 'Bank') =>
    securityRequest(`/api/finance/supplier-bills/${encodeURIComponent(billNo)}/pay`, {
      method: 'POST',
      body: JSON.stringify({ amount, paymentMode }),
    }),

  getEmployees: () => securityRequest<{ employees: any[]; payrollRuns: any[] }>('/api/v1/employees'),

  createEmployee: (payload: Record<string, unknown>) =>
    securityRequest('/api/v1/employees', { method: 'POST', body: JSON.stringify(payload) }),

  runPayroll: (monthCode: string) =>
    securityRequest('/api/finance/payroll/run', { method: 'POST', body: JSON.stringify({ monthCode }) }),

  getProducts: () => securityRequest<{ products: any[]; movements: any[] }>('/api/v1/products'),

  getInventory: () => securityRequest<{ inventory: any[]; movements: any[] }>('/api/v1/inventory'),

  createProduct: (payload: Record<string, unknown>) =>
    securityRequest('/api/v1/products', { method: 'POST', body: JSON.stringify(payload) }),

  purchaseInventory: (payload: Record<string, unknown>) =>
    securityRequest('/api/v1/inventory/purchase', { method: 'POST', body: JSON.stringify(payload) }),

  posSale: (payload: Record<string, unknown>) =>
    securityRequest('/api/v1/inventory/pos-sale', { method: 'POST', body: JSON.stringify(payload) }),

  runDepreciation: (months = 1) =>
    securityRequest('/api/finance/assets/run-depreciation', {
      method: 'POST',
      body: JSON.stringify({ months }),
    }),

  payLoanEmi: (loanId: string) =>
    securityRequest(`/api/finance/loans/${encodeURIComponent(loanId)}/pay-emi`, {
      method: 'POST',
      body: '{}',
    }),

  postEquityTransaction: (payload: Record<string, unknown>) =>
    securityRequest('/api/finance/equity/transaction', { method: 'POST', body: JSON.stringify(payload) }),

  settleFranchiseRoyalty: (franchiseCode: string, amount?: number) =>
    securityRequest(`/api/finance/franchises/${encodeURIComponent(franchiseCode)}/settle`, {
      method: 'POST',
      body: JSON.stringify({ amount }),
    }),

  executeRecurringRule: (ruleId: string) =>
    securityRequest(`/api/finance/recurring/${encodeURIComponent(ruleId)}/execute`, {
      method: 'POST',
      body: '{}',
    }),

  runImportBatch: (payload: Record<string, unknown>) =>
    securityRequest('/api/finance/import/dry-run-and-commit', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  rollbackImportBatch: (batchId: string) =>
    securityRequest(`/api/finance/import/${encodeURIComponent(batchId)}/rollback`, {
      method: 'POST',
      body: '{}',
    }),

  createVaultOcrEntry: (payload: Record<string, unknown>) =>
    securityRequest('/api/finance/vault/ocr-intake', { method: 'POST', body: JSON.stringify(payload) }),

  verifyAndPostVaultDoc: (vaultId: string, amount?: number) =>
    securityRequest(`/api/finance/vault/${encodeURIComponent(vaultId)}/verify-and-post`, {
      method: 'POST',
      body: JSON.stringify({ amount }),
    }),

  createTask: (payload: Record<string, unknown>) =>
    securityRequest('/api/finance/tasks', { method: 'POST', body: JSON.stringify(payload) }),

  updateTaskStatus: (taskId: string, status: string) =>
    securityRequest(`/api/finance/tasks/${encodeURIComponent(taskId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  resolveFraudAlert: (alertId: string, status: 'Resolved' | 'False Positive') =>
    securityRequest(`/api/finance/fraud-alerts/${encodeURIComponent(alertId)}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    }),

  customerPortalLookup: (customerId: string, mobileLast4: string) =>
    securityRequest('/api/finance/customer-portal/lookup', {
      method: 'POST',
      body: JSON.stringify({ customerId, mobileLast4 }),
    }),

  askAiAssistant: (question: string) =>
    securityRequest<{ configured: boolean; readOnly: boolean; provider: string; answer: string }>(
      '/api/finance/ai-assistant',
      { method: 'POST', body: JSON.stringify({ question }) }
    ),

  runAuditVerification: () =>
    securityRequest('/api/finance/audit/run-verification', { method: 'POST', body: '{}' }),
};
