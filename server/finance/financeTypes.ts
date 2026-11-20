export type AccountType = 'Asset' | 'Liability' | 'Equity' | 'Income' | 'COGS' | 'Expense';

export type VoucherType =
  | 'Receipt'
  | 'Payment'
  | 'Journal'
  | 'Contra'
  | 'Sales'
  | 'Purchase'
  | 'Expense'
  | 'Payroll'
  | 'Depreciation'
  | 'FX_Revaluation'
  | 'Closing'
  | 'Reversal'
  | 'Opening';

export type VoucherStatus =
  | 'Draft'
  | 'Pending_Approval'
  | 'Approved'
  | 'Posted'
  | 'Reversed'
  | 'Cancelled';

export type FiscalPeriodStatus = 'Open' | 'Soft_Locked' | 'Closed' | 'Reopened';
export type FiscalYearStatus = 'Open' | 'Closing_In_Progress' | 'Closed' | 'Locked';

export interface FinanceEntityRecord {
  entityCode: string;
  entityName: string;
  entityType: 'MAIN_BUSINESS' | 'BRANCH' | 'PNB_CSP_SEGREGATED' | 'FRANCHISE_UNIT' | 'SUBSIDIARY';
  baseCurrency: string;
  gstin: string;
  pan: string;
  isIsolatedCsp: boolean;
  intercompanyPayableCode?: string;
  status: 'active' | 'inactive';
}

export interface FiscalPeriodRecord {
  periodCode: string; // e.g., 2026-11
  fyCode: string; // FY 2026-27
  monthLabel: string;
  startDate: string;
  endDate: string;
  status: FiscalPeriodStatus;
  lockReason?: string;
  lockedBy?: string;
  lockedAt?: string;
}

export interface FiscalYearRecord {
  fyCode: string;
  label: string;
  startDate: string;
  endDate: string;
  status: FiscalYearStatus;
  lockedBy?: string;
  lockedAt?: string;
  carryForwardVoucherNo?: string;
}

export interface ChartOfAccount {
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  subType: string;
  parentCode: string | null;
  normalBalance: 'Debit' | 'Credit';
  isGroup: boolean;
  isSystemLocked: boolean;
  entityScope: string; // 'ALL' | 'ENT-MAIN' | ...
  gstApplicable: boolean;
  openingBalance: number;
  openingSide: 'Debit' | 'Credit';
  status: 'active' | 'archived';
}

export interface JournalLineInput {
  accountCode: string;
  partyType?: 'NONE' | 'CUSTOMER' | 'SUPPLIER' | 'EMPLOYEE' | 'BANK' | 'FRANCHISE' | 'PARTNER';
  partyId?: string;
  costCenter?: string;
  debitAmount: number;
  creditAmount: number;
  fxAmount?: number;
  description?: string;
}

export interface JournalLineRecord extends JournalLineInput {
  id: number;
  lineNo: number;
  accountName: string;
  accountType: AccountType;
}

export interface JournalVoucherRecord {
  voucherNo: string;
  idempotencyKey?: string;
  entityCode: string;
  branchCode: string;
  costCenter: string;
  fyCode: string;
  periodCode: string;
  voucherDate: string; // YYYY-MM-DD
  voucherType: VoucherType;
  referenceType?: string;
  referenceId?: string;
  narration: string;
  currencyCode: string;
  exchangeRate: number;
  totalDebit: number;
  totalCredit: number;
  status: VoucherStatus;
  reversedVoucherNo?: string | null;
  reversalOfVoucherNo?: string | null;
  createdBy: string;
  approvedBy?: string | null;
  postedAt?: string | null;
  createdAt: string;
  lines: JournalLineRecord[];
}

export interface CashCounterAccount {
  counterCode: string;
  counterName: string;
  entityCode: string;
  custodianUserId: string;
  coaAccountCode: string;
  openingBalance: number;
  currentBalance: number;
  isCspCounter: boolean;
  status: 'Open' | 'Closed' | 'Locked';
  lastTransferAt?: string;
}

export interface CashCounterTransferRecord {
  transferId: string;
  fromCounterCode: string;
  toTargetType: 'COUNTER' | 'BANK' | 'PETTY_CASH';
  toTargetCode: string;
  amount: number;
  voucherNo: string;
  transferDate: string;
  initiatedBy: string;
  approvedBy: string;
  notes: string;
}

export type PnbCspTxnType =
  | 'Customer Deposit'
  | 'Customer Withdrawal'
  | 'AEPS Cash Out'
  | 'Money Transfer (DMT)'
  | 'Bank Settlement Transfer'
  | 'CSP Commission Earned';

export interface PnbCspLedgerEntry {
  cspTxnId: string;
  cspCounterCode: string;
  txnDate: string;
  txnType: PnbCspTxnType;
  customerRef: string;
  principalAmount: number; // Customer banking money - STRICTLY isolated from business P&L
  commissionIncome: number; // Actual MUN COMPUTER fee/commission
  commissionPostedVoucher?: string | null;
  settlementStatus: 'Pending' | 'Settled' | 'Reconciled';
  recordedBy: string;
  remarks: string;
  createdAt: string;
}

export interface PaymentModeConfigRecord {
  modeKey: string;
  label: string;
  coaAccountCode: string;
  gatewayFeePct: number;
  gatewayFixedFee: number;
  requiresVerification: boolean;
  isGatewayConfigured: boolean;
  enabled: boolean;
}

export interface CustomerCreditProfile {
  customerId: string;
  customerName: string;
  creditLimit: number;
  creditDays: number;
  advanceBalance: number;
  creditBlocked: boolean;
  riskTag: 'Low' | 'Medium' | 'High';
  lastReminderAt?: string | null;
  lastReminderNote?: string;
}

export interface SupplierRecord {
  supplierId: string;
  name: string;
  gstin: string;
  pan: string;
  mobile: string;
  category: string;
  creditLimit: number;
  creditDays: number;
  riskRating: 'Low' | 'Medium' | 'High';
  status: 'active' | 'blocked';
}

export interface SupplierBillRecord {
  billNo: string;
  supplierId: string;
  supplierName: string;
  billDate: string;
  dueDate: string;
  expenseOrAssetAccountCode: string;
  subtotal: number;
  gstAmount: number;
  tdsSection?: string;
  tdsDeducted: number;
  netPayable: number;
  paidAmount: number;
  voucherNo: string;
  status: 'Approved' | 'Partially Paid' | 'Paid' | 'Overdue';
}

export interface BankAccountRecord {
  bankId: string;
  entityCode: string;
  bankName: string;
  accountNumberMasked: string;
  ifscCode: string;
  coaAccountCode: string;
  currencyCode: string;
  openingBalance: number;
  statementBalance: number;
  isCspSettlement: boolean;
  lastReconciledDate?: string | null;
  status: 'active' | 'frozen' | 'closed';
}

export interface BankStatementLine {
  lineId: string;
  bankId: string;
  txnDate: string;
  utrOrRef: string;
  description: string;
  debitAmount: number;
  creditAmount: number;
  matchStatus: 'Unmatched' | 'Auto-Matched' | 'Manually Reconciled' | 'Disputed';
  matchedVoucherNo?: string | null;
}

export interface ChequeRecord {
  chequeNo: string;
  bankId: string;
  direction: 'Issued' | 'Received';
  partyName: string;
  amount: number;
  chequeDate: string;
  status: 'Issued' | 'Deposited' | 'Cleared' | 'Bounced' | 'Cancelled';
  voucherNo?: string | null;
}

export interface EmployeePayrollRecord {
  empId: string;
  userId?: string | null;
  fullName: string;
  designation: string;
  department: string;
  mobile: string;
  joinedDate: string;
  basicSalary: number;
  hra: number;
  allowances: number;
  pfDeduction: number;
  tdsDeduction: number;
  advanceBalance: number;
  status: 'Active' | 'On Leave' | 'Inactive';
}

export interface PayrollRunRecord {
  runId: string;
  monthCode: string; // 2026-11
  runDate: string;
  employeeCount: number;
  grossTotal: number;
  totalDeductions: number;
  netPayableTotal: number;
  voucherNo: string;
  status: 'Posted' | 'Paid';
  processedBy: string;
  slips: Array<{
    empId: string;
    fullName: string;
    gross: number;
    deductions: number;
    netPay: number;
  }>;
}

export interface TaxGstEntryRecord {
  taxEntryId: string;
  entryDate: string;
  returnType: 'GSTR-1 Outward' | 'GSTR-2B Input' | 'TDS-194J' | 'TDS-194C' | 'TCS';
  partyName: string;
  gstinOrPan: string;
  hsnOrSection: string;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  tdsOrTcs: number;
  voucherNo: string;
  filingStatus: 'Ready for Return' | 'Reconciled' | 'Filed';
}

export interface FixedAssetRecord {
  assetCode: string;
  assetName: string;
  category: string;
  coaAssetAccount: string;
  purchaseDate: string;
  costAmount: number;
  salvageValue: number;
  usefulLifeYears: number;
  depreciationMethod: 'SLM' | 'WDV';
  ratePct: number;
  accumulatedDepreciation: number;
  lastDepreciatedDate?: string | null;
  status: 'Active' | 'Disposed' | 'Written Off';
}

export interface BudgetPlanRecord {
  budgetId: string;
  fyCode: string;
  departmentOrCenter: string;
  accountCode: string;
  accountName: string;
  annualBudget: number;
  revisedBudget: number;
  alertThresholdPct: number;
}

export interface RecurringRuleRecord {
  ruleId: string;
  title: string;
  voucherType: VoucherType;
  frequency: 'Monthly' | 'Quarterly' | 'Yearly';
  nextRunDate: string;
  amount: number;
  debitAccountCode: string;
  creditAccountCode: string;
  costCenter: string;
  autoPost: boolean;
  lastRunAt?: string | null;
  runCount: number;
  status: 'Active' | 'Paused';
}

export interface ProductInventoryBatch {
  batchId: string;
  receivedDate: string;
  qtyRemaining: number;
  unitCost: number;
}

export interface ProductInventoryItem {
  sku: string;
  name: string;
  category: string;
  hsnSac: string;
  gstRatePct: number;
  valuationMethod: 'FIFO' | 'WAC';
  sellingPrice: number;
  reorderLevel: number;
  warehouseLocation: string;
  batches: ProductInventoryBatch[];
  status: 'active' | 'discontinued';
}

export interface InventoryMovementRecord {
  movementId: string;
  sku: string;
  productName: string;
  movementType: 'PURCHASE_IN' | 'POS_SALE_OUT' | 'ADJUSTMENT';
  quantity: number;
  unitCost: number;
  cogsTotal: number;
  saleTotal: number;
  gstAmount: number;
  voucherNo: string;
  actorUserId: string;
  recordedAt: string;
  notes: string;
}

export interface LoanRecord {
  loanId: string;
  lenderName: string;
  loanType: 'Term Loan' | 'Equipment Finance' | 'OD Facility';
  principalAmount: number;
  annualRatePct: number;
  tenureMonths: number;
  emiAmount: number;
  outstandingPrincipal: number;
  emisPaid: number;
  nextDueDate: string;
  coaLoanAccount: string;
  status: 'Active' | 'Closed';
}

export interface InvestmentRecord {
  investmentId: string;
  instrumentName: string;
  institution: string;
  kind: 'Fixed Deposit (FD)' | 'Recurring Deposit (RD)' | 'Treasury Surplus';
  principalAmount: number;
  annualYieldPct: number;
  startDate: string;
  maturityDate: string;
  accruedInterest: number;
  coaAccountCode: string;
  status: 'Active' | 'Matured' | 'Redeemed';
}

export interface PartnerEquityAccount {
  partnerId: string;
  partnerName: string;
  ownershipPct: number;
  capitalBalance: number;
  drawingsYtd: number;
  dividendOrProfitShareYtd: number;
}

export interface FranchiseUnitRecord {
  franchiseCode: string;
  partnerName: string;
  location: string;
  royaltyPct: number;
  monthlyGrossRevenue: number;
  royaltyPayableOrReceivable: number;
  settledYtd: number;
  status: 'Active' | 'Pending Settlement';
}

export interface SubscriptionPlanRecord {
  subId: string;
  customerId: string;
  customerName: string;
  planName: string;
  billingCycle: 'Monthly' | 'Annual';
  recurringFee: number;
  deferredRevenueBalance: number;
  recognizedRevenueYtd: number;
  nextBillingDate: string;
  status: 'Active' | 'Paused' | 'Cancelled';
}

export interface CurrencyRateRecord {
  currencyCode: string;
  currencyName: string;
  symbol: string;
  spotRateInr: number;
  previousRateInr: number;
  updatedAt: string;
}

export interface ApprovalMatrixRule {
  ruleId: string;
  transactionCategory: 'Voucher' | 'Expense' | 'Refund' | 'Asset Disposal' | 'Period Reopen' | 'Credit Override';
  minAmount: number;
  maxAmount: number;
  requiredApproverRole: 'MANAGER' | 'ADMIN';
  preventSelfApproval: boolean;
  active: boolean;
}

export interface FraudRiskAlert {
  alertId: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  category: string;
  description: string;
  referenceId: string;
  status: 'Open' | 'Investigating' | 'Resolved' | 'False Positive';
  detectedAt: string;
  resolvedBy?: string | null;
}

export interface CompliancePolicyItem {
  policyCode: string;
  framework: string;
  title: string;
  dueDate: string;
  status: 'Compliant' | 'Pending Review' | 'Action Required';
  ownerRole: string;
  notes: string;
}

export interface FinancialTaskItem {
  taskId: string;
  title: string;
  category: 'Closing' | 'GST Filing' | 'BRS' | 'Payroll' | 'EMI' | 'Audit';
  dueDate: string;
  assignedTo: string;
  priority: 'Normal' | 'High' | 'Urgent';
  status: 'Pending' | 'In Progress' | 'Completed';
}

export interface FinancialDocumentVaultItem {
  vaultId: string;
  title: string;
  docCategory: 'Voucher Support' | 'Tax Challan' | 'Bank Statement' | 'Agreement' | 'OCR Scan';
  linkedVoucherNo?: string | null;
  ocrExtractedVendor?: string;
  ocrExtractedAmount?: number;
  ocrConfidencePct?: number;
  humanVerified: boolean;
  legalHold: boolean;
  retentionUntil: string;
  uploadedBy: string;
  createdAt: string;
}

export interface ImportMigrationBatch {
  batchId: string;
  importType: 'Chart of Accounts' | 'Opening Balances' | 'Bank Statement CSV' | 'Supplier Bills';
  totalRows: number;
  validRows: number;
  failedRows: number;
  status: 'Dry-Run Validated' | 'Committed' | 'Rolled Back';
  importedVoucherNos: string[];
  createdBy: string;
  createdAt: string;
}

export interface AuditObservationItem {
  obsId: string;
  moduleNo: number;
  title: string;
  severity: 'Observation' | 'Minor' | 'Major';
  status: 'Open' | 'Management Responded' | 'Closed';
  raisedBy: string;
  responseNote?: string;
  createdAt: string;
}

export interface VerificationCheckResult {
  checkId: string;
  moduleRange: string;
  title: string;
  passed: boolean;
  detail: string;
  metricValue: string;
}

export interface FinanceAuditCertificate {
  certificateNo: string;
  generatedAt: string;
  generatedBy: string;
  overallVerdict: 'VERIFIED_PASS' | 'ATTENTION_REQUIRED';
  checksPassed: number;
  totalChecks: number;
  checks: VerificationCheckResult[];
  integrationStatuses: Array<{
    area: string;
    status: 'IMPLEMENTED_VERIFIED' | 'PARTIAL_HUMAN_TRIGGERED' | 'NOT_CONFIGURED_EXTERNAL';
    detail: string;
  }>;
  disclaimer: string;
}
