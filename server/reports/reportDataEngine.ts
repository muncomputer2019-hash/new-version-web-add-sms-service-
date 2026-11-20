import { ErpStore } from '../erpStore';
import { FinanceStore } from '../finance/financeStore';
import { computeFinancialStatements, deriveFyCode, round2 } from '../finance/accountingEngine';
import { Phase03Store } from '../phase03Store';
import { CscStore } from '../cscStore';
import { SecurityStore } from '../securityStore';
import { sanitizeText } from '../crypto';
import { ServerUser } from '../types';
import { buildCscReportDataset, CSC_REPORT_CATALOG_ITEMS } from './cscReportBuilders';
import { ReportStore } from './reportStore';
import {
  AnalyticsDashboardPayload,
  AnalyticsQueryInput,
  BuilderDataSourceKey,
  CalculatedColumnRule,
  CustomFilterRule,
  CustomReportExecutionRequest,
  ReportCatalogItem,
  ReportColumnDef,
  ReportDataset,
  ReportFilterInput,
  ReportingDashboardData,
} from './reportTypes';

export function formatINRServer(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safe);
}

export function formatDateISTServer(input?: string | Date | null): string {
  if (!input) return '—';
  if (typeof input === 'string' && /^\d{2}\/\d{2}\/\d{4}$/.test(input.trim())) {
    return input.trim();
  }
  const d = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return String(input);
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(d);
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const year = parts.find((p) => p.type === 'year')?.value ?? '2026';
  return `${day}/${month}/${year}`;
}

export function formatDateTimeISTServer(input?: string | Date | null): string {
  if (!input) return '—';
  const d = typeof input === 'string' ? new Date(input) : input;
  if (Number.isNaN(d.getTime())) return String(input);
  const datePart = formatDateISTServer(d);
  const timePart = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
  return `${datePart} ${timePart} IST`;
}

/** Converts DD/MM/YYYY or ISO string to YYYY-MM-DD in IST for reliable range filtering */
export function normalizeToIsoDate(input?: string | null): string {
  if (!input) return '';
  const raw = input.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const ddmmyyyy = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  if (ddmmyyyy) return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export function getFyFromIsoDate(isoDate: string): string {
  const clean = normalizeToIsoDate(isoDate) || new Date().toISOString().slice(0, 10);
  return deriveFyCode(clean).replace(/^FY\s+/, '');
}

export function inDateRange(
  dateStr: string | null | undefined,
  filters?: ReportFilterInput
): boolean {
  const iso = normalizeToIsoDate(dateStr);
  if (!iso) return !filters?.fromDate && !filters?.toDate && !filters?.financialYear;
  if (filters?.fromDate && iso < filters.fromDate) return false;
  if (filters?.toDate && iso > filters.toDate) return false;
  if (filters?.financialYear && filters.financialYear !== 'ALL') {
    const fy = getFyFromIsoDate(iso);
    if (fy !== filters.financialYear) return false;
  }
  return true;
}

export const REPORT_CATALOG: Omit<ReportCatalogItem, 'enabled'>[] = [
  // Customer Reports (Section 3 - 13 reports)
  { reportKey: 'CUST_COMPLETE_LIST', title: 'Complete Customer List', titleBn: 'সম্পূর্ণ গ্রাহক তালিকা', category: 'CUSTOMER', description: 'All active and archived customer records with verification status and balance.', financialRestricted: false },
  { reportKey: 'CUST_NEW_REGISTRATIONS', title: 'New Customer Registration Report', titleBn: 'নতুন গ্রাহক নিবন্ধন রিপোর্ট', category: 'CUSTOMER', description: 'Customer registrations filtered by date range, FY, and onboarding staff.', financialRestricted: false },
  { reportKey: 'CUST_ACTIVE_INACTIVE', title: 'Active / Inactive Customer Report', titleBn: 'সক্রিয় / নিষ্ক্রিয় গ্রাহক রিপোর্ট', category: 'CUSTOMER', description: 'Customer account lifecycle status breakdown (Active, Inactive, Blocked).', financialRestricted: false },
  { reportKey: 'CUST_TRANSACTIONS', title: 'Customer-wise Transaction Report', titleBn: 'গ্রাহক-ভিত্তিক লেনদেন রিপোর্ট', category: 'CUSTOMER', description: 'Aggregated confirmed receipts, refunds, and net collections per customer.', financialRestricted: false },
  { reportKey: 'CUST_DUE_REPORT', title: 'Customer Due Report', titleBn: 'গ্রাহক বকেয়া রিপোর্ট', category: 'CUSTOMER', description: 'Customers with pending balance due across active non-cancelled applications.', financialRestricted: false },
  { reportKey: 'CUST_PAYMENT_HISTORY', title: 'Customer Payment History', titleBn: 'গ্রাহক পেমেন্ট ইতিহাস', category: 'CUSTOMER', description: 'Detailed chronological payment receipt ledger per customer.', financialRestricted: false },
  { reportKey: 'CUST_SERVICE_HISTORY', title: 'Customer Service History', titleBn: 'গ্রাহক পরিষেবা ইতিহাস', category: 'CUSTOMER', description: 'Every service application availed per customer with SLA & completion status.', financialRestricted: false },
  { reportKey: 'CUST_DUPLICATE_REPORT', title: 'Duplicate Customer Report', titleBn: 'ডুপ্লিকেট গ্রাহক রিপোর্ট', category: 'CUSTOMER', description: 'Automated detection of matching mobile numbers, Aadhaar last-4, or names.', financialRestricted: false },
  { reportKey: 'CUST_MERGE_HISTORY', title: 'Customer Merge History', titleBn: 'গ্রাহক মার্জ ইতিহাস', category: 'CUSTOMER', description: 'Audit history of Admin-merged duplicate customer records and relinked apps.', financialRestricted: false },
  { reportKey: 'CUST_VILLAGE_WISE', title: 'Village-wise Customer Report', titleBn: 'গ্রাম-ভিত্তিক গ্রাহক রিপোর্ট', category: 'CUSTOMER', description: 'Customer distribution, applications, and collections grouped by Village.', financialRestricted: false },
  { reportKey: 'CUST_WARD_WISE', title: 'Ward-wise Customer Report', titleBn: 'ওয়ার্ড-ভিত্তিক গ্রাহক রিপোর্ট', category: 'CUSTOMER', description: 'Customer volume grouped by Ward / Para / Police Station jurisdiction.', financialRestricted: false },
  { reportKey: 'CUST_PINCODE_WISE', title: 'PIN Code-wise Customer Report', titleBn: 'পিন কোড-ভিত্তিক গ্রাহক রিপোর্ট', category: 'CUSTOMER', description: 'Geographic breakdown of customer base and revenue by postal PIN code.', financialRestricted: false },
  { reportKey: 'CUST_REG_GROWTH', title: 'Customer Registration Growth', titleBn: 'গ্রাহক নিবন্ধন বৃদ্ধি', category: 'CUSTOMER', description: 'Monthly customer acquisition volume and cumulative growth trajectory.', financialRestricted: false },

  // Application & Service Reports (Section 4 - 13 reports)
  { reportKey: 'APP_TOTAL_REPORT', title: 'Total Application Report', titleBn: 'মোট আবেদন রিপোর্ট', category: 'APPLICATION_SERVICE', description: 'Complete register of non-archived service applications across all 12 statuses.', financialRestricted: false },
  { reportKey: 'APP_PENDING_REPORT', title: 'Pending Application Report', titleBn: 'অপেক্ষমাণ আবেদন রিপোর্ট', category: 'APPLICATION_SERVICE', description: 'In-progress, Under Review, Pending Customer, Pending Office, and On Hold cases.', financialRestricted: false },
  { reportKey: 'APP_APPROVED_REPORT', title: 'Approved Application Report', titleBn: 'অনুমোদিত আবেদন রিপোর্ট', category: 'APPLICATION_SERVICE', description: 'Applications approved and awaiting final delivery or completed handover.', financialRestricted: false },
  { reportKey: 'APP_REJECTED_REPORT', title: 'Rejected Application Report', titleBn: 'প্রত্যাখ্যাত আবেদন রিপোর্ট', category: 'APPLICATION_SERVICE', description: 'Rejected and Cancelled applications with recorded reasons and refund status.', financialRestricted: false },
  { reportKey: 'APP_COMPLETED_REPORT', title: 'Completed Application Report', titleBn: 'সম্পন্ন আবেদন রিপোর্ট', category: 'APPLICATION_SERVICE', description: 'Successfully completed and delivered customer service applications.', financialRestricted: false },
  { reportKey: 'APP_COLLECTION_REPORT', title: 'Application-wise Collection', titleBn: 'আবেদন-ভিত্তিক আদায়', category: 'APPLICATION_SERVICE', description: 'Fee charged, confirmed payments, processed refunds, and balance due per filing.', financialRestricted: false },
  { reportKey: 'SVC_REVENUE_REPORT', title: 'Service-wise Revenue Report', titleBn: 'পরিষেবা-ভিত্তিক আয়', category: 'APPLICATION_SERVICE', description: 'Filing counts, confirmed revenue, cost, and unit margin by service catalog item.', financialRestricted: true },
  { reportKey: 'SVC_RATE_HISTORY', title: 'Service Rate History', titleBn: 'পরিষেবা রেট ইতিহাস', category: 'APPLICATION_SERVICE', description: 'Versioned fee & cost revision audit trail from Master Settings.', financialRestricted: true },
  { reportKey: 'APP_STAFF_WISE', title: 'Staff-wise Application Report', titleBn: 'কর্মী-ভিত্তিক আবেদন রিপোর্ট', category: 'APPLICATION_SERVICE', description: 'Workload, completion rate, overdue SLA, and collections per staff operator.', financialRestricted: false },
  { reportKey: 'APP_PROCESSING_TIME', title: 'Processing Time Analysis', titleBn: 'প্রক্রিয়াকরণ সময় বিশ্লেষণ', category: 'APPLICATION_SERVICE', description: 'Actual turnaround time vs configured SLA days across completed/active applications.', financialRestricted: false },
  { reportKey: 'APP_STATUS_HISTORY', title: 'Application Status History', titleBn: 'আবেদন স্ট্যাটাস ইতিহাস', category: 'APPLICATION_SERVICE', description: 'Chronological audit trail of status transitions across applications.', financialRestricted: false },
  { reportKey: 'APP_DATE_WISE', title: 'Date-wise Application Report', titleBn: 'তারিখ-ভিত্তিক আবেদন রিপোর্ট', category: 'APPLICATION_SERVICE', description: 'Daily summary of submitted, completed, and collected applications.', financialRestricted: false },
  { reportKey: 'APP_CUSTOMER_WISE', title: 'Customer-wise Application Report', titleBn: 'গ্রাহক-ভিত্তিক আবেদন রিপোর্ট', category: 'APPLICATION_SERVICE', description: 'Grouped summary of application volume and value by customer.', financialRestricted: false },

  // Financial Reports (Section 5 - 19 reports)
  { reportKey: 'FIN_DAILY_CASHBOOK', title: 'Daily Cashbook', titleBn: 'দৈনিক ক্যাশবুক', category: 'FINANCIAL', description: 'Counter opening balances, cash receipts, expenses, and reconciled closing cash.', financialRestricted: true },
  { reportKey: 'FIN_DAYBOOK', title: 'Daybook (All Posted Vouchers)', titleBn: 'ডেবুক (পোস্টেড ভাউচার)', category: 'FINANCIAL', description: 'Chronological daybook of posted double-entry vouchers (excluding cancelled/reversed).', financialRestricted: true },
  { reportKey: 'FIN_INCOME_REPORT', title: 'Income Report', titleBn: 'আয় রিপোর্ট', category: 'FINANCIAL', description: 'Recognized business operating income excluding segregated PNB CSP client funds.', financialRestricted: true },
  { reportKey: 'FIN_EXPENSE_REPORT', title: 'Expense Report', titleBn: 'খরচ রিপোর্ট', category: 'FINANCIAL', description: 'Approved operational expenditure vouchers and GL expense postings.', financialRestricted: true },
  { reportKey: 'FIN_PNL_STATEMENT', title: 'Profit & Loss Statement', titleBn: 'লাভ ও ক্ষতি বিবরণী', category: 'FINANCIAL', description: 'Double-entry Income vs COGS vs Operating Expenses showing Gross & Net Profit.', financialRestricted: true },
  { reportKey: 'FIN_BALANCE_SHEET', title: 'Balance Sheet', titleBn: 'ব্যালেন্স শীট', category: 'FINANCIAL', description: 'Assets, Liabilities, and Equity + Current Net Profit verification equation.', financialRestricted: true },
  { reportKey: 'FIN_CASH_FLOW', title: 'Cash Flow Statement', titleBn: 'নগদ প্রবাহ বিবরণী', category: 'FINANCIAL', description: 'Operating, Investing, and Financing cash movement summary.', financialRestricted: true },
  { reportKey: 'FIN_GENERAL_LEDGER', title: 'General Ledger', titleBn: 'জেনারেল লেজার', category: 'FINANCIAL', description: 'Posted debit/credit ledger lines across active Chart of Accounts.', financialRestricted: true },
  { reportKey: 'FIN_CUSTOMER_LEDGER', title: 'Customer Ledger', titleBn: 'গ্রাহক লেজার', category: 'FINANCIAL', description: 'Service charges billed, confirmed receipts, refunds, and closing receivable per customer.', financialRestricted: true },
  { reportKey: 'FIN_SUPPLIER_LEDGER', title: 'Supplier Ledger', titleBn: 'সরবরাহকারী লেজার', category: 'FINANCIAL', description: 'Supplier purchase bills, TDS deductions, payments, and net payable balances.', financialRestricted: true },
  { reportKey: 'FIN_BANK_BOOK', title: 'Bank Book & BRS Status', titleBn: 'ব্যাংক বুক', category: 'FINANCIAL', description: 'Main business bank accounts, statement lines, and reconciliation status.', financialRestricted: true },
  { reportKey: 'FIN_CASH_ACCOUNT', title: 'Cash Account Report', titleBn: 'নগদ অ্যাকাউন্ট রিপোর্ট', category: 'FINANCIAL', description: 'Cash drawers (CTR-01, CTR-02, Petty Cash) and counter-to-bank transfers.', financialRestricted: true },
  { reportKey: 'FIN_UPI_TRANSACTIONS', title: 'UPI Transaction Report', titleBn: 'ইউপিআই লেনদেন রিপোর্ট', category: 'FINANCIAL', description: 'UPI reference IDs, verification status, and settled collections.', financialRestricted: true },
  { reportKey: 'FIN_PAYMENT_COLLECTION', title: 'Payment Collection Report', titleBn: 'পেমেন্ট আদায় রিপোর্ট', category: 'FINANCIAL', description: 'Confirmed collections across Cash, UPI, Card, and Bank Transfer.', financialRestricted: true },
  { reportKey: 'FIN_OUTSTANDING_DUE', title: 'Outstanding Due Report', titleBn: 'বকেয়া পাওনা রিপোর্ট', category: 'FINANCIAL', description: 'Receivable dues by application and customer (Charge - Net Confirmed Paid).', financialRestricted: true },
  { reportKey: 'FIN_OPENING_BALANCE', title: 'Opening Balance Report', titleBn: 'প্রারম্ভিক জের রিপোর্ট', category: 'FINANCIAL', description: 'FY opening Debit and Credit balances across Chart of Accounts.', financialRestricted: true },
  { reportKey: 'FIN_CLOSING_BALANCE', title: 'Closing Balance Report', titleBn: 'সমাপনী জের রিপোর্ট', category: 'FINANCIAL', description: 'Trial balance reconciled closing Debit/Credit balances across accounts.', financialRestricted: true },
  { reportKey: 'FIN_FY_SUMMARY', title: 'Financial Year Summary (Apr–Mar)', titleBn: 'অর্থবছর সারসংক্ষেপ', category: 'FINANCIAL', description: 'April–March FY summary of income, expenses, profit, collections, and dues.', financialRestricted: true },
  { reportKey: 'FIN_TAX_SUMMARY', title: 'Tax Transaction Summary (GST & TDS)', titleBn: 'কর লেনদেন সারসংক্ষেপ (GST/TDS)', category: 'FINANCIAL', description: 'GSTR-1, GSTR-2B input credit, and TDS statutory entries.', financialRestricted: true },

  // Business & Inventory Reports (Section 6 - filtered dynamically by enabled modules)
  { reportKey: 'BIZ_SALES_REPORT', title: 'Sales Reports (Services & POS)', titleBn: 'বিক্রয় রিপোর্ট', category: 'BUSINESS_INVENTORY', description: 'Combined sales revenue across services and hardware POS postings.', financialRestricted: true, requiresModule: 'SALES' },
  { reportKey: 'BIZ_PURCHASE_REPORT', title: 'Purchase Reports (Supplier Bills)', titleBn: 'ক্রয় রিপোর্ট', category: 'BUSINESS_INVENTORY', description: 'Supplier purchase bills, GST input, TDS, and inventory restocks.', financialRestricted: true, requiresModule: 'PURCHASE' },
  { reportKey: 'BIZ_STOCK_REPORT', title: 'Stock Valuation Report (FIFO/WAC)', titleBn: 'স্টক মূল্যায়ন রিপোর্ট', category: 'BUSINESS_INVENTORY', description: 'Current stock quantities, batch unit costs, and total inventory valuation.', financialRestricted: true, requiresModule: 'INVENTORY' },
  { reportKey: 'BIZ_LOW_STOCK_REPORT', title: 'Low Stock Alert Report', titleBn: 'কম স্টক সতর্কতা রিপোর্ট', category: 'BUSINESS_INVENTORY', description: 'Products at or below configured reorder level requiring replenishment.', financialRestricted: false, requiresModule: 'INVENTORY' },
  { reportKey: 'BIZ_PRODUCT_PROFITABILITY', title: 'Product-wise Profitability', titleBn: 'পণ্য-ভিত্তিক লাভজনকতা', category: 'BUSINESS_INVENTORY', description: 'Unit selling price vs weighted batch cost and realized POS margin.', financialRestricted: true, requiresModule: 'INVENTORY' },
  { reportKey: 'BIZ_SUPPLIER_PERFORMANCE', title: 'Supplier Performance Report', titleBn: 'সরবরাহকারী কর্মক্ষমতা', category: 'BUSINESS_INVENTORY', description: 'Purchase bill count, total spend, and payment compliance by vendor.', financialRestricted: true, requiresModule: 'PURCHASE' },
  { reportKey: 'BIZ_LPG_REPORT', title: 'LPG Business Report', titleBn: 'এলপিজি ব্যবসা রিপোর্ট', category: 'BUSINESS_INVENTORY', description: 'LPG cylinder sales, refill movements, and margin tracking (when LPG SKU/category active).', financialRestricted: true, requiresModule: 'LPG' },
  { reportKey: 'BIZ_DELIVERY_REPORT', title: 'Delivery & Handover Report', titleBn: 'ডেলিভারি ও হস্তান্তর রিপোর্ট', category: 'BUSINESS_INVENTORY', description: 'Completed and pending customer deliveries with handover confirmations.', financialRestricted: false, requiresModule: 'DELIVERY' },
  { reportKey: 'BIZ_EMPLOYEE_SALARY', title: 'Employee Salary & Payroll Report', titleBn: 'কর্মচারী বেতন রিপোর্ট', category: 'BUSINESS_INVENTORY', description: 'Staff salary structure, PF/TDS deductions, and net payroll runs.', financialRestricted: true, requiresModule: 'PAYROLL' },
  { reportKey: 'BIZ_GROWTH_REPORT', title: 'Business Growth Report', titleBn: 'ব্যবসা বৃদ্ধি রিপোর্ট', category: 'BUSINESS_INVENTORY', description: 'Month-over-month customer, application, revenue, and net profit growth.', financialRestricted: true, requiresModule: 'GROWTH' },

  // CSC Digital Service Center Reports (Part 14 - 25 reports)
  ...CSC_REPORT_CATALOG_ITEMS,
];

export interface BuilderFieldSchema {
  key: string;
  label: string;
  type: 'text' | 'number' | 'currency' | 'date' | 'status';
  sensitive?: boolean;
}

export const BUILDER_DATA_SOURCES: Record<
  BuilderDataSourceKey,
  { label: string; restrictedToManagerAdmin: boolean; fields: BuilderFieldSchema[] }
> = {
  CUSTOMERS: {
    label: 'Customers CRM Master',
    restrictedToManagerAdmin: false,
    fields: [
      { key: 'customerId', label: 'Customer ID', type: 'text' },
      { key: 'fullName', label: 'Full Name', type: 'text' },
      { key: 'mobile', label: 'Mobile', type: 'text', sensitive: true },
      { key: 'village', label: 'Village', type: 'text' },
      { key: 'policeStation', label: 'Ward / P.S.', type: 'text' },
      { key: 'pinCode', label: 'PIN Code', type: 'text' },
      { key: 'segment', label: 'Segment', type: 'status' },
      { key: 'status', label: 'Status', type: 'status' },
      { key: 'verificationStatus', label: 'Verification', type: 'status' },
      { key: 'applicationCount', label: 'Applications', type: 'number' },
      { key: 'totalPaid', label: 'Total Paid (₹)', type: 'currency' },
      { key: 'pendingBalance', label: 'Balance Due (₹)', type: 'currency' },
      { key: 'createdAt', label: 'Registered Date', type: 'date' },
    ],
  },
  APPLICATIONS: {
    label: 'Service Applications',
    restrictedToManagerAdmin: false,
    fields: [
      { key: 'applicationNo', label: 'Application No', type: 'text' },
      { key: 'financialYear', label: 'Financial Year', type: 'text' },
      { key: 'customerId', label: 'Customer ID', type: 'text' },
      { key: 'customerName', label: 'Customer Name', type: 'text' },
      { key: 'serviceName', label: 'Service Name', type: 'text' },
      { key: 'assignedStaffId', label: 'Assigned Staff', type: 'text' },
      { key: 'counterCode', label: 'Counter', type: 'text' },
      { key: 'status', label: 'Status', type: 'status' },
      { key: 'serviceCharge', label: 'Service Charge (₹)', type: 'currency' },
      { key: 'serviceCost', label: 'Service Cost (₹)', type: 'currency', sensitive: true },
      { key: 'netCollected', label: 'Net Collected (₹)', type: 'currency' },
      { key: 'balanceDue', label: 'Balance Due (₹)', type: 'currency' },
      { key: 'createdAt', label: 'Created Date', type: 'date' },
    ],
  },
  PAYMENTS: {
    label: 'Payment Receipts',
    restrictedToManagerAdmin: false,
    fields: [
      { key: 'receiptNo', label: 'Receipt No', type: 'text' },
      { key: 'applicationNo', label: 'Application No', type: 'text' },
      { key: 'customerName', label: 'Customer Name', type: 'text' },
      { key: 'serviceName', label: 'Service Name', type: 'text' },
      { key: 'paymentMethod', label: 'Payment Method', type: 'status' },
      { key: 'counterCode', label: 'Counter', type: 'text' },
      { key: 'collectedBy', label: 'Collected By', type: 'text' },
      { key: 'verificationStatus', label: 'Verification Status', type: 'status' },
      { key: 'amount', label: 'Amount (₹)', type: 'currency' },
      { key: 'recordedAt', label: 'Payment Date', type: 'date' },
    ],
  },
  EXPENSES: {
    label: 'Operational Expenses',
    restrictedToManagerAdmin: true,
    fields: [
      { key: 'voucherNo', label: 'Voucher No', type: 'text' },
      { key: 'category', label: 'Expense Category', type: 'text' },
      { key: 'description', label: 'Description', type: 'text' },
      { key: 'counterCode', label: 'Counter', type: 'text' },
      { key: 'recordedBy', label: 'Recorded By', type: 'text' },
      { key: 'status', label: 'Status', type: 'status' },
      { key: 'amount', label: 'Amount (₹)', type: 'currency' },
      { key: 'expenseDate', label: 'Expense Date', type: 'date' },
    ],
  },
  JOURNAL_VOUCHERS: {
    label: 'Posted GL Journal Vouchers',
    restrictedToManagerAdmin: true,
    fields: [
      { key: 'voucherNo', label: 'Voucher No', type: 'text' },
      { key: 'entityCode', label: 'Entity', type: 'text' },
      { key: 'fyCode', label: 'FY Code', type: 'text' },
      { key: 'voucherType', label: 'Voucher Type', type: 'status' },
      { key: 'status', label: 'Status', type: 'status' },
      { key: 'narration', label: 'Narration', type: 'text' },
      { key: 'totalDebit', label: 'Total Debit (₹)', type: 'currency' },
      { key: 'totalCredit', label: 'Total Credit (₹)', type: 'currency' },
      { key: 'voucherDate', label: 'Voucher Date', type: 'date' },
    ],
  },
  SERVICES: {
    label: 'Service Catalog & Pricing',
    restrictedToManagerAdmin: false,
    fields: [
      { key: 'serviceCode', label: 'Service Code', type: 'text' },
      { key: 'name', label: 'Service Name', type: 'text' },
      { key: 'categoryName', label: 'Category', type: 'text' },
      { key: 'customerCharge', label: 'Customer Charge (₹)', type: 'currency' },
      { key: 'serviceCost', label: 'Service Cost (₹)', type: 'currency', sensitive: true },
      { key: 'profitAmount', label: 'Unit Margin (₹)', type: 'currency', sensitive: true },
      { key: 'status', label: 'Status', type: 'status' },
    ],
  },
  PRODUCTS_STOCK: {
    label: 'Products & Inventory Stock',
    restrictedToManagerAdmin: true,
    fields: [
      { key: 'sku', label: 'SKU', type: 'text' },
      { key: 'name', label: 'Product Name', type: 'text' },
      { key: 'category', label: 'Category', type: 'text' },
      { key: 'valuationMethod', label: 'Valuation', type: 'status' },
      { key: 'qtyOnHand', label: 'Qty On Hand', type: 'number' },
      { key: 'reorderLevel', label: 'Reorder Level', type: 'number' },
      { key: 'sellingPrice', label: 'Selling Price (₹)', type: 'currency' },
      { key: 'stockValue', label: 'Stock Value (₹)', type: 'currency' },
    ],
  },
  EMPLOYEES_PAYROLL: {
    label: 'Employees & Payroll Master',
    restrictedToManagerAdmin: true,
    fields: [
      { key: 'empCode', label: 'Emp Code', type: 'text' },
      { key: 'fullName', label: 'Employee Name', type: 'text' },
      { key: 'designation', label: 'Designation', type: 'text' },
      { key: 'department', label: 'Department', type: 'text' },
      { key: 'basicSalary', label: 'Basic Salary (₹)', type: 'currency' },
      { key: 'allowances', label: 'Allowances (₹)', type: 'currency' },
      { key: 'pfDeduction', label: 'PF (₹)', type: 'currency' },
      { key: 'tdsDeduction', label: 'TDS (₹)', type: 'currency' },
      { key: 'netSalary', label: 'Net Salary (₹)', type: 'currency' },
      { key: 'status', label: 'Status', type: 'status' },
    ],
  },
};

/** Safe recursive-descent arithmetic evaluator (ONLY +, -, *, /, parens, field refs, numbers — zero eval/SQL) */
export function evaluateSafeFormula(
  expression: string,
  row: Record<string, unknown>,
  allowedFields: Set<string>
): number {
  const replaced = expression.replace(/\[([a-zA-Z0-9_]+)\]/g, (_m, key) => {
    if (!allowedFields.has(key)) {
      throw new Error(`Invalid field reference [${key}] in calculated formula.`);
    }
    const val = Number(row[key] ?? 0);
    return Number.isFinite(val) ? String(val) : '0';
  });

  if (!/^[0-9+\-*/().\s]+$/.test(replaced)) {
    throw new Error('Calculated formula contains disallowed characters. Use only [field], numbers, and + - * / ( ).');
  }

  let pos = 0;
  const src = replaced.replace(/\s+/g, '');

  const parseExpr = (): number => {
    let left = parseTerm();
    while (pos < src.length && (src[pos] === '+' || src[pos] === '-')) {
      const op = src[pos++];
      const right = parseTerm();
      left = op === '+' ? left + right : left - right;
    }
    return left;
  };

  const parseTerm = (): number => {
    let left = parseFactor();
    while (pos < src.length && (src[pos] === '*' || src[pos] === '/')) {
      const op = src[pos++];
      const right = parseFactor();
      left = op === '*' ? left * right : right === 0 ? 0 : left / right;
    }
    return left;
  };

  const parseFactor = (): number => {
    if (src[pos] === '-') {
      pos++;
      return -parseFactor();
    }
    if (src[pos] === '(') {
      pos++;
      const val = parseExpr();
      if (src[pos] === ')') pos++;
      return val;
    }
    const start = pos;
    while (pos < src.length && /[0-9.]/.test(src[pos])) pos++;
    if (start === pos) throw new Error('Malformed formula expression.');
    return Number(src.slice(start, pos));
  };

  const result = parseExpr();
  return Number.isFinite(result) ? round2(result) : 0;
}

export class ReportDataEngine {
  constructor(
    private readonly securityStore: SecurityStore,
    private readonly p3: Phase03Store,
    private readonly erp: ErpStore,
    private readonly finance: FinanceStore,
    private readonly reportStore: ReportStore,
    private readonly cscStore: CscStore = new CscStore()
  ) {}

  public getEnabledBusinessModules() {
    const hasLpg = this.finance.products.some(
      (p) =>
        p.status === 'active' &&
        (p.category.toLowerCase().includes('lpg') ||
          p.name.toLowerCase().includes('lpg') ||
          p.name.toLowerCase().includes('cylinder'))
    );

    const hasPurchase = this.finance.supplierBills.length > 0 || this.finance.suppliers.length > 0;
    const hasInventory = this.finance.products.length > 0;
    const hasDelivery = this.erp.deliveries.length > 0 || this.erp.applications.length > 0;
    const hasPayroll = this.finance.employees.length > 0;
    const hasSales =
      this.erp.payments.length > 0 ||
      this.finance.vouchers.some((v) => v.voucherType === 'Sales' && v.status === 'Posted');

    return [
      { key: 'SALES', label: 'Sales & POS Billing', enabled: hasSales, reason: hasSales ? 'Active ERP/POS transactions found' : 'No sales recorded' },
      { key: 'PURCHASE', label: 'Purchase & Suppliers', enabled: hasPurchase, reason: hasPurchase ? 'Supplier master & bills active' : 'No suppliers configured' },
      { key: 'INVENTORY', label: 'Stock & Inventory', enabled: hasInventory, reason: hasInventory ? `${this.finance.products.length} product SKUs tracked` : 'No inventory SKUs' },
      { key: 'LPG', label: 'LPG Cylinder Business', enabled: hasLpg, reason: hasLpg ? 'LPG SKUs active' : 'LPG Business module not enabled in catalog' },
      { key: 'DELIVERY', label: 'Application Delivery', enabled: hasDelivery, reason: hasDelivery ? 'Delivery handover module active' : 'No delivery records' },
      { key: 'PAYROLL', label: 'Employee Payroll', enabled: hasPayroll, reason: hasPayroll ? `${this.finance.employees.length} employees in payroll` : 'No payroll employees' },
      { key: 'GROWTH', label: 'Business Growth BI', enabled: true, reason: 'Live operational & GL aggregation active' },
    ];
  }

  public getBuilderSchemas() {
    return Object.entries(BUILDER_DATA_SOURCES).map(([key, schema]) => ({
      key,
      label: schema.label,
      fields: schema.fields,
    }));
  }

  public getCatalogForUser(user: ServerUser): ReportCatalogItem[] {
    if (user.role === 'CUSTOMER') return [];
    const enabledMap = new Map(this.getEnabledBusinessModules().map((m) => [m.key, m.enabled]));
    const isFinAllowed =
      user.role === 'ADMIN' || user.role === 'AUDITOR' || user.role === 'MANAGER';

    return REPORT_CATALOG.map((item) => {
      const modEnabled = item.requiresModule ? Boolean(enabledMap.get(item.requiresModule)) : true;
      return {
        ...item,
        enabled: modEnabled && (!item.financialRestricted || isFinAllowed),
      };
    }).filter((item) => {
      // Only show business/inventory reports whose module actually exists & is enabled
      if (item.requiresModule && !enabledMap.get(item.requiresModule)) return false;
      if (user.role === 'STAFF' && item.financialRestricted) return false;
      if (
        user.role === 'STAFF' &&
        ['CUST_DUPLICATE_REPORT', 'CUST_MERGE_HISTORY'].includes(item.reportKey)
      ) {
        return false;
      }
      return true;
    });
  }

  private getScopedCustomers(user: ServerUser) {
    const active = this.erp.customers.filter((c) => !c.deletedAt);
    if (user.role === 'STAFF') {
      const assignedCustIds = new Set(
        this.erp.applications
          .filter((a) => !a.archivedAt && a.assignedStaffId === user.userId)
          .map((a) => a.customerId)
      );
      return active.filter((c) => assignedCustIds.has(c.customerId));
    }
    return active;
  }

  private getScopedApps(user: ServerUser) {
    const apps = this.erp.applications.filter((a) => !a.archivedAt);
    if (user.role === 'STAFF') {
      return apps.filter((a) => a.assignedStaffId === user.userId);
    }
    return apps;
  }

  private getScopedPayments(user: ServerUser) {
    // Never treat Rejected payments as valid collections
    const valid = this.erp.payments.filter((p) => p.verificationStatus !== 'Rejected');
    if (user.role === 'STAFF') {
      const myApps = new Set(this.getScopedApps(user).map((a) => a.applicationNo));
      return valid.filter((p) => myApps.has(p.applicationNo) || p.collectedBy === user.userId);
    }
    return valid;
  }

  private getCustomerFinancialStats(customerId: string) {
    const apps = this.erp.applications.filter(
      (a) => !a.archivedAt && a.customerId === customerId && a.status !== 'Cancelled' && a.status !== 'Rejected'
    );
    const payments = this.erp.payments.filter(
      (p) => p.customerId === customerId && p.verificationStatus === 'Confirmed'
    );
    const refunds = this.erp.refunds.filter(
      (r) => r.customerId === customerId && r.status === 'Processed'
    );
    const totalBilled = round2(apps.reduce((s, a) => s + a.serviceSnapshot.customerChargeSnapshot, 0));
    const totalPaid = round2(payments.reduce((s, p) => s + p.amount, 0));
    const totalRefunded = round2(refunds.reduce((s, r) => s + r.refundAmount, 0));
    const netCollected = round2(Math.max(0, totalPaid - totalRefunded));
    const due = round2(Math.max(0, totalBilled - netCollected));
    return { appCount: apps.length, totalBilled, totalPaid, totalRefunded, netCollected, due };
  }

  private getPostedVouchers(filters?: ReportFilterInput) {
    return this.finance.vouchers.filter((v) => {
      if (v.status !== 'Posted' && v.status !== 'Approved') return false; // Exclude Cancelled, Reversed, Draft, Pending
      if (v.entityCode === 'ENT-PNB-CSP') return false; // Strictly isolate PNB CSP customer funds
      return inDateRange(v.voucherDate, filters);
    });
  }

  public getReportingDashboard(user: ServerUser, filters?: ReportFilterInput): ReportingDashboardData {
    const customers = this.getScopedCustomers(user);
    const apps = this.getScopedApps(user).filter((a) => inDateRange(a.createdAt, filters));
    const payments = this.getScopedPayments(user).filter(
      (p) => p.verificationStatus === 'Confirmed' && inDateRange(p.recordedAt, filters)
    );
    const refunds = this.erp.refunds.filter(
      (r) => r.status === 'Processed' && inDateRange(r.processedAt ?? r.createdAt, filters)
    );

    const nowMs = Date.now();
    const dayAgo = nowMs - 24 * 60 * 60 * 1000;
    const weekAgo = nowMs - 7 * 24 * 60 * 60 * 1000;
    const monthAgo = nowMs - 30 * 24 * 60 * 60 * 1000;

    const genEvents = this.reportStore.auditLogs.filter((l) =>
      ['GENERATE_REPORT', 'EXPORT_PDF', 'EXPORT_COMBINED_PDF', 'EXPORT_EXCEL', 'EXPORT_CSV', 'PRINT_REPORT'].includes(l.action)
    );
    const totalReportsGenerated = genEvents.length + this.erp.exportLogs.length;
    const dailyReportsCount = genEvents.filter((l) => new Date(l.createdAt).getTime() >= dayAgo).length;
    const weeklyReportsCount = genEvents.filter((l) => new Date(l.createdAt).getTime() >= weekAgo).length;
    const monthlyReportsCount = genEvents.filter((l) => new Date(l.createdAt).getTime() >= monthAgo).length;

    const completedApplications = apps.filter((a) => a.status === 'Completed').length;
    const rejectedOrCancelledApplications = apps.filter(
      (a) => a.status === 'Rejected' || a.status === 'Cancelled'
    ).length;
    const pendingApplications = apps.length - completedApplications - rejectedOrCancelledApplications;
    const resolvedCount = completedApplications + rejectedOrCancelledApplications;
    const applicationSuccessRatePct =
      resolvedCount > 0 ? round2((completedApplications / resolvedCount) * 100) : apps.length > 0 ? round2((completedApplications / apps.length) * 100) : 0;

    // Double-entry financial figures (Income vs Expense vs Profit vs Collections vs Dues)
    const canSeeFinance = user.role !== 'STAFF';
    const statements = computeFinancialStatements({
      accounts: this.finance.chartOfAccounts,
      vouchers: this.finance.vouchers.filter((v) => inDateRange(v.voucherDate, filters)),
      entityCode: 'ENT-MAIN',
      eliminateIntercompany: true,
    });

    const grossCollections = round2(payments.reduce((s, p) => s + p.amount, 0));
    const refundedAmt = round2(refunds.reduce((s, r) => s + r.refundAmount, 0));
    const totalCollections = round2(Math.max(0, grossCollections - refundedAmt));

    const cashCol = round2(payments.filter((p) => p.paymentMethod === 'Cash').reduce((s, p) => s + p.amount, 0));
    const upiCol = round2(payments.filter((p) => p.paymentMethod === 'UPI').reduce((s, p) => s + p.amount, 0));
    const otherCol = round2(
      payments.filter((p) => p.paymentMethod !== 'Cash' && p.paymentMethod !== 'UPI').reduce((s, p) => s + p.amount, 0)
    );

    let outstandingCustomerDues = 0;
    for (const app of apps) {
      if (app.status === 'Cancelled' || app.status === 'Rejected') continue;
      const appPaid = this.erp.payments
        .filter((p) => p.applicationNo === app.applicationNo && p.verificationStatus === 'Confirmed')
        .reduce((s, p) => s + p.amount, 0);
      const appRef = this.erp.refunds
        .filter((r) => r.applicationNo === app.applicationNo && r.status === 'Processed')
        .reduce((s, r) => s + r.refundAmount, 0);
      outstandingCustomerDues = round2(
        outstandingCustomerDues + Math.max(0, app.serviceSnapshot.customerChargeSnapshot - Math.max(0, appPaid - appRef))
      );
    }

    // Staff Performance
    const staffBuckets = new Map<
      string,
      { staffId: string; staffName: string; totalAssigned: number; completed: number; pending: number; overdue: number; collectionsHandled: number }
    >();
    const nowIso = new Date().toISOString().slice(0, 10);
    for (const a of apps) {
      const sid = a.assignedStaffId || 'Unassigned';
      const userObj = this.securityStore.findUserByUserId(sid);
      const b = staffBuckets.get(sid) ?? {
        staffId: sid,
        staffName: userObj?.fullName ?? (sid === 'Unassigned' ? 'Unassigned Queue' : sid),
        totalAssigned: 0,
        completed: 0,
        pending: 0,
        overdue: 0,
        collectionsHandled: 0,
      };
      b.totalAssigned += 1;
      if (a.status === 'Completed') b.completed += 1;
      else if (a.status !== 'Cancelled' && a.status !== 'Rejected') {
        b.pending += 1;
        if (a.expectedCompletionDate && a.expectedCompletionDate < nowIso) b.overdue += 1;
      }
      staffBuckets.set(sid, b);
    }
    for (const p of payments) {
      const b = staffBuckets.get(p.collectedBy);
      if (b) b.collectionsHandled = round2(b.collectionsHandled + p.amount);
    }

    const staffPerformance = Array.from(staffBuckets.values()).map((s) => ({
      ...s,
      completionRatePct: s.totalAssigned > 0 ? round2((s.completed / s.totalAssigned) * 100) : 0,
    }));

    // Live growth comparison (current 30d vs prior 30d)
    const sixtyAgo = nowMs - 60 * 24 * 60 * 60 * 1000;
    const recentCust = customers.filter((c) => new Date(c.createdAt).getTime() >= monthAgo).length;
    const priorCust = customers.filter((c) => {
      const t = new Date(c.createdAt).getTime();
      return t >= sixtyAgo && t < monthAgo;
    }).length;
    const customerGrowthPct = priorCust > 0 ? round2(((recentCust - priorCust) / priorCust) * 100) : recentCust > 0 ? 100 : 0;

    const recentApps = apps.filter((a) => new Date(a.createdAt).getTime() >= monthAgo).length;
    const priorApps = apps.filter((a) => {
      const t = new Date(a.createdAt).getTime();
      return t >= sixtyAgo && t < monthAgo;
    }).length;
    const applicationGrowthPct = priorApps > 0 ? round2(((recentApps - priorApps) / priorApps) * 100) : recentApps > 0 ? 100 : 0;

    const recentCol = payments.filter((p) => new Date(p.recordedAt).getTime() >= monthAgo).reduce((s, p) => s + p.amount, 0);
    const priorCol = payments.filter((p) => {
      const t = new Date(p.recordedAt).getTime();
      return t >= sixtyAgo && t < monthAgo;
    }).reduce((s, p) => s + p.amount, 0);
    const collectionGrowthPct = priorCol > 0 ? round2(((recentCol - priorCol) / priorCol) * 100) : recentCol > 0 ? 100 : 0;

    return {
      kpis: {
        totalReportsGenerated,
        dailyReportsCount,
        weeklyReportsCount,
        monthlyReportsCount,
        totalCustomers: customers.length,
        activeCustomers: customers.filter((c) => c.status === 'Active').length,
        totalApplications: apps.length,
        completedApplications,
        pendingApplications,
        rejectedOrCancelledApplications,
        applicationSuccessRatePct,
        totalIncome: canSeeFinance ? statements.profitAndLoss.totalIncome : 0,
        totalExpenses: canSeeFinance ? round2(statements.profitAndLoss.totalCogs + statements.profitAndLoss.totalExpenses) : 0,
        netProfit: canSeeFinance ? statements.profitAndLoss.netProfit : 0,
        totalCollections,
        outstandingCustomerDues,
        paymentBreakdown: { cash: cashCol, upi: upiCol, other: otherCol },
        growthIndicators: {
          customerGrowthPct,
          applicationGrowthPct,
          collectionGrowthPct,
          methodologyNote: 'Computed from live DB timestamps comparing trailing 30 days vs prior 30-day period.',
        },
      },
      staffPerformance,
      recentReportsActivity: this.reportStore.auditLogs.slice(0, 12),
      enabledBusinessModules: this.getEnabledBusinessModules(),
      financialYear: deriveFyCode(new Date().toISOString().slice(0, 10)).replace(/^FY\s+/, ''),
    };
  }

  public generateReport(
    reportKey: string,
    user: ServerUser,
    filters: ReportFilterInput = {}
  ): ReportDataset {
    const meta = REPORT_CATALOG.find((r) => r.reportKey === reportKey);
    if (!meta) {
      throw new Error(`Unknown report key: ${reportKey}`);
    }
    if (meta.financialRestricted && user.role === 'STAFF') {
      throw new Error('FORBIDDEN_FINANCIAL_REPORT');
    }

    const fy =
      filters.financialYear && filters.financialYear !== 'ALL'
        ? filters.financialYear
        : getFyFromIsoDate(new Date().toISOString().slice(0, 10));
    const dateRangeLabel =
      filters.fromDate || filters.toDate
        ? `${formatDateISTServer(filters.fromDate || '2026-04-01')} – ${formatDateISTServer(filters.toDate || new Date().toISOString().slice(0, 10))}`
        : `FY ${fy} (All Dates)`;

    const base = {
      reportKey: meta.reportKey,
      title: meta.title,
      titleBn: meta.titleBn,
      subtitle: meta.description,
      category: meta.category,
      financialYear: fy,
      dateRangeLabel,
      generatedAt: formatDateTimeISTServer(new Date()),
      generatedBy: user.userId,
    };

    const dataset = this.buildReportBody(meta.reportKey, user, filters, base);

    // Apply universal status, location & text search filters cleanly
    let rows = dataset.rows;
    if (filters.status && filters.status !== 'ALL') {
      const st = filters.status.toLowerCase();
      rows = rows.filter((r) =>
        Object.values(r).some((v) => String(v ?? '').toLowerCase() === st || String(v ?? '').toLowerCase().includes(st))
      );
    }
    if (filters.location && filters.location.trim()) {
      const loc = filters.location.trim().toLowerCase();
      rows = rows.filter((r) =>
        Object.values(r).some((v) => String(v ?? '').toLowerCase().includes(loc))
      );
    }
    if (filters.search && filters.search.trim()) {
      const q = filters.search.trim().toLowerCase();
      rows = rows.filter((r) =>
        Object.values(r).some((v) => String(v ?? '').toLowerCase().includes(q))
      );
    }

    const totalRowsBeforeLimit = rows.length;
    if (filters.limit && filters.limit > 0) {
      rows = rows.slice(0, filters.limit);
    }

    // Mask sensitive columns for STAFF
    const columns = dataset.columns.map((c) => ({ ...c }));
    if (user.role === 'STAFF') {
      const sensitiveKeys = new Set(columns.filter((c) => c.sensitive).map((c) => c.key));
      rows = rows.map((r) => {
        const clone = { ...r };
        for (const k of sensitiveKeys) {
          clone[k] = 'Restricted';
        }
        return clone;
      });
    }

    return {
      ...dataset,
      columns,
      rows,
      totalRowsBeforeLimit,
    };
  }

  private buildReportBody(
    reportKey: string,
    user: ServerUser,
    filters: ReportFilterInput,
    base: Omit<ReportDataset, 'columns' | 'rows' | 'totals' | 'totalRowsBeforeLimit'>
  ): Omit<ReportDataset, 'totalRowsBeforeLimit'> {
    const customers = this.getScopedCustomers(user);
    const apps = this.getScopedApps(user);
    const payments = this.getScopedPayments(user);
    const isStaff = user.role === 'STAFF';

    // ---------------- CSC DIGITAL SERVICE REPORTS (PART 14 - 25 REPORTS) ----------------
    if (reportKey.startsWith('CSC_RPT_')) {
      return buildCscReportDataset(
        this.cscStore,
        this.securityStore,
        reportKey,
        user,
        filters,
        base
      );
    }

    // ---------------- CUSTOMER REPORTS ----------------
    if (reportKey === 'CUST_COMPLETE_LIST' || reportKey === 'CUST_NEW_REGISTRATIONS' || reportKey === 'CUST_ACTIVE_INACTIVE') {
      const list = customers.filter((c) => {
        if (reportKey === 'CUST_NEW_REGISTRATIONS' && !inDateRange(c.createdAt, filters)) return false;
        if (reportKey === 'CUST_ACTIVE_INACTIVE' && filters.status && filters.status !== 'ALL') {
          return c.status.toLowerCase() === filters.status.toLowerCase();
        }
        return inDateRange(c.createdAt, filters);
      });
      let sumPaid = 0;
      let sumDue = 0;
      const rows = list.map((c) => {
        const st = this.getCustomerFinancialStats(c.customerId);
        sumPaid += st.netCollected;
        sumDue += st.due;
        return {
          customerId: c.customerId,
          fullName: c.fullName,
          mobile: isStaff ? `XXXXXX${c.mobile.slice(-4)}` : c.mobile,
          village: c.village,
          pinCode: c.pinCode || '—',
          verificationStatus: c.verificationStatus,
          status: c.status,
          appCount: st.appCount,
          netCollected: st.netCollected,
          due: st.due,
          createdAt: formatDateISTServer(c.createdAt),
        };
      });
      return {
        ...base,
        columns: [
          { key: 'customerId', label: 'Customer ID', labelBn: 'গ্রাহক আইডি', type: 'text' },
          { key: 'fullName', label: 'Customer Name', labelBn: 'গ্রাহকের নাম', type: 'text' },
          { key: 'mobile', label: 'Mobile', labelBn: 'মোবাইল', type: 'text', sensitive: true },
          { key: 'village', label: 'Village', labelBn: 'গ্রাম', type: 'text' },
          { key: 'pinCode', label: 'PIN Code', labelBn: 'পিন কোড', type: 'text' },
          { key: 'verificationStatus', label: 'Verification', type: 'status' },
          { key: 'status', label: 'Status', labelBn: 'স্থিতি', type: 'status' },
          { key: 'appCount', label: 'Apps', type: 'number', align: 'right' },
          { key: 'netCollected', label: 'Paid (₹)', labelBn: 'জমা (₹)', type: 'currency', align: 'right' },
          { key: 'due', label: 'Due (₹)', labelBn: 'বকেয়া (₹)', type: 'currency', align: 'right' },
          { key: 'createdAt', label: 'Registered', type: 'date' },
        ],
        rows,
        totals: { customerCount: rows.length, netCollected: round2(sumPaid), due: round2(sumDue) },
      };
    }

    if (reportKey === 'CUST_TRANSACTIONS' || reportKey === 'CUST_DUE_REPORT') {
      const rows = customers
        .map((c) => {
          const st = this.getCustomerFinancialStats(c.customerId);
          return {
            customerId: c.customerId,
            fullName: c.fullName,
            village: c.village,
            mobile: isStaff ? `XXXXXX${c.mobile.slice(-4)}` : c.mobile,
            appCount: st.appCount,
            totalBilled: st.totalBilled,
            totalPaid: st.totalPaid,
            totalRefunded: st.totalRefunded,
            due: st.due,
          };
        })
        .filter((r) => (reportKey === 'CUST_DUE_REPORT' ? r.due > 0 : true));
      return {
        ...base,
        columns: [
          { key: 'customerId', label: 'Customer ID', type: 'text' },
          { key: 'fullName', label: 'Customer Name', type: 'text' },
          { key: 'village', label: 'Village', type: 'text' },
          { key: 'mobile', label: 'Mobile', type: 'text', sensitive: true },
          { key: 'appCount', label: 'Active Apps', type: 'number', align: 'right' },
          { key: 'totalBilled', label: 'Total Billed (₹)', type: 'currency', align: 'right' },
          { key: 'totalPaid', label: 'Confirmed Paid (₹)', type: 'currency', align: 'right' },
          { key: 'totalRefunded', label: 'Refunded (₹)', type: 'currency', align: 'right' },
          { key: 'due', label: 'Outstanding Due (₹)', type: 'currency', align: 'right' },
        ],
        rows,
        totals: {
          totalBilled: round2(rows.reduce((s, r) => s + r.totalBilled, 0)),
          totalPaid: round2(rows.reduce((s, r) => s + r.totalPaid, 0)),
          due: round2(rows.reduce((s, r) => s + r.due, 0)),
        },
      };
    }

    if (reportKey === 'CUST_PAYMENT_HISTORY') {
      const list = payments.filter((p) => {
        if (filters.customerId && p.customerId !== filters.customerId) return false;
        return inDateRange(p.recordedAt, filters);
      });
      return {
        ...base,
        columns: [
          { key: 'receiptNo', label: 'Receipt No', type: 'text' },
          { key: 'customerId', label: 'Customer ID', type: 'text' },
          { key: 'customerName', label: 'Customer Name', type: 'text' },
          { key: 'applicationNo', label: 'Application No', type: 'text' },
          { key: 'paymentMethod', label: 'Method', type: 'status' },
          { key: 'verificationStatus', label: 'Status', type: 'status' },
          { key: 'amount', label: 'Amount (₹)', type: 'currency', align: 'right' },
          { key: 'recordedAt', label: 'Date (IST)', type: 'date' },
        ],
        rows: list.map((p) => ({
          receiptNo: p.receiptNo,
          customerId: p.customerId,
          customerName: p.customerName,
          applicationNo: p.applicationNo,
          paymentMethod: p.paymentMethod,
          verificationStatus: p.verificationStatus,
          amount: p.amount,
          recordedAt: formatDateISTServer(p.recordedAt),
        })),
        totals: {
          confirmedAmount: round2(
            list.filter((p) => p.verificationStatus === 'Confirmed').reduce((s, p) => s + p.amount, 0)
          ),
        },
      };
    }

    if (reportKey === 'CUST_SERVICE_HISTORY') {
      const list = apps.filter((a) => {
        if (filters.customerId && a.customerId !== filters.customerId) return false;
        return inDateRange(a.createdAt, filters);
      });
      return {
        ...base,
        columns: [
          { key: 'customerId', label: 'Customer ID', type: 'text' },
          { key: 'customerName', label: 'Customer Name', type: 'text' },
          { key: 'applicationNo', label: 'Application No', type: 'text' },
          { key: 'serviceName', label: 'Service', type: 'text' },
          { key: 'status', label: 'Status', type: 'status' },
          { key: 'serviceCharge', label: 'Fee (₹)', type: 'currency', align: 'right' },
          { key: 'submittedDate', label: 'Submitted (IST)', type: 'date' },
        ],
        rows: list.map((a) => ({
          customerId: a.customerId,
          customerName: a.customerSnapshot.fullName,
          applicationNo: a.applicationNo,
          serviceName: a.serviceSnapshot.name,
          status: a.status,
          serviceCharge: a.serviceSnapshot.customerChargeSnapshot,
          submittedDate: formatDateISTServer(a.submissionDate ?? a.createdAt),
        })),
        totals: {
          applicationCount: list.length,
          totalCharges: round2(list.reduce((s, a) => s + a.serviceSnapshot.customerChargeSnapshot, 0)),
        },
      };
    }

    if (reportKey === 'CUST_DUPLICATE_REPORT') {
      const byPhone = new Map<string, typeof customers>();
      for (const c of this.erp.customers.filter((x) => !x.deletedAt)) {
        const digits = c.mobile.replace(/\D/g, '').slice(-10);
        if (!digits) continue;
        const arr = byPhone.get(digits) ?? [];
        arr.push(c);
        byPhone.set(digits, arr);
      }
      const rows: Array<Record<string, string | number | boolean | null>> = [];
      for (const [phone, group] of byPhone.entries()) {
        if (group.length > 1) {
          for (const c of group) {
            rows.push({
              matchKey: `Mobile *${phone.slice(-4)}`,
              customerId: c.customerId,
              fullName: c.fullName,
              village: c.village,
              status: c.status,
              createdAt: formatDateISTServer(c.createdAt),
            });
          }
        }
      }
      return {
        ...base,
        columns: [
          { key: 'matchKey', label: 'Duplicate Signal', type: 'text' },
          { key: 'customerId', label: 'Customer ID', type: 'text' },
          { key: 'fullName', label: 'Full Name', type: 'text' },
          { key: 'village', label: 'Village', type: 'text' },
          { key: 'status', label: 'Status', type: 'status' },
          { key: 'createdAt', label: 'Created Date', type: 'date' },
        ],
        rows,
        totals: { duplicateMatches: rows.length },
        notes: rows.length === 0 ? ['Zero active duplicate customer profiles detected across mobile numbers.'] : undefined,
      };
    }

    if (reportKey === 'CUST_MERGE_HISTORY') {
      const mergeEvents = this.erp.activities.filter((a) => a.action === 'MERGE_CUSTOMERS');
      return {
        ...base,
        columns: [
          { key: 'actorUserId', label: 'Merged By', type: 'text' },
          { key: 'duplicateId', label: 'Duplicate Customer', type: 'text' },
          { key: 'primaryId', label: 'Primary Retained', type: 'text' },
          { key: 'reason', label: 'Reason / Relink Summary', type: 'text' },
          { key: 'createdAt', label: 'Merged At (IST)', type: 'date' },
        ],
        rows: mergeEvents.map((m) => ({
          actorUserId: m.actorUserId,
          duplicateId: m.previousValue ?? '—',
          primaryId: m.newValue ?? '—',
          reason: m.reason ?? '—',
          createdAt: formatDateTimeISTServer(m.createdAt),
        })),
        totals: { mergeCount: mergeEvents.length },
      };
    }

    if (reportKey === 'CUST_VILLAGE_WISE' || reportKey === 'CUST_WARD_WISE' || reportKey === 'CUST_PINCODE_WISE') {
      const groups = new Map<string, { label: string; customers: number; apps: number; paid: number; due: number }>();
      for (const c of customers) {
        const key =
          reportKey === 'CUST_VILLAGE_WISE'
            ? c.village || 'Unspecified Village'
            : reportKey === 'CUST_WARD_WISE'
              ? c.policeStation || c.postOffice || 'Unspecified Ward / P.S.'
              : c.pinCode || 'Unspecified PIN';
        const g = groups.get(key) ?? { label: key, customers: 0, apps: 0, paid: 0, due: 0 };
        const st = this.getCustomerFinancialStats(c.customerId);
        g.customers += 1;
        g.apps += st.appCount;
        g.paid = round2(g.paid + st.netCollected);
        g.due = round2(g.due + st.due);
        groups.set(key, g);
      }
      const rows = Array.from(groups.values()).sort((a, b) => b.customers - a.customers);
      return {
        ...base,
        columns: [
          {
            key: 'label',
            label:
              reportKey === 'CUST_VILLAGE_WISE'
                ? 'Village'
                : reportKey === 'CUST_WARD_WISE'
                  ? 'Ward / Jurisdiction'
                  : 'PIN Code',
            type: 'text',
          },
          { key: 'customers', label: 'Customers', type: 'number', align: 'right' },
          { key: 'apps', label: 'Applications', type: 'number', align: 'right' },
          { key: 'paid', label: 'Net Paid (₹)', type: 'currency', align: 'right' },
          { key: 'due', label: 'Due (₹)', type: 'currency', align: 'right' },
        ],
        rows,
        totals: {
          customers: rows.reduce((s, r) => s + r.customers, 0),
          paid: round2(rows.reduce((s, r) => s + r.paid, 0)),
          due: round2(rows.reduce((s, r) => s + r.due, 0)),
        },
      };
    }

    if (reportKey === 'CUST_REG_GROWTH') {
      const byMonth = new Map<string, number>();
      for (const c of customers) {
        const ym = normalizeToIsoDate(c.createdAt).slice(0, 7) || '2026-11';
        byMonth.set(ym, (byMonth.get(ym) ?? 0) + 1);
      }
      let cumulative = 0;
      const rows = Array.from(byMonth.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, newCount]) => {
          cumulative += newCount;
          return { month, newRegistrations: newCount, cumulativeCustomers: cumulative };
        });
      return {
        ...base,
        columns: [
          { key: 'month', label: 'Month (YYYY-MM)', type: 'text' },
          { key: 'newRegistrations', label: 'New Customers', type: 'number', align: 'right' },
          { key: 'cumulativeCustomers', label: 'Cumulative Base', type: 'number', align: 'right' },
        ],
        rows,
        totals: { totalCustomers: cumulative },
      };
    }

    // ---------------- APPLICATION & SERVICE REPORTS ----------------
    if (
      [
        'APP_TOTAL_REPORT',
        'APP_PENDING_REPORT',
        'APP_APPROVED_REPORT',
        'APP_REJECTED_REPORT',
        'APP_COMPLETED_REPORT',
        'APP_COLLECTION_REPORT',
        'APP_DATE_WISE',
      ].includes(reportKey)
    ) {
      const filtered = apps.filter((a) => {
        if (!inDateRange(a.createdAt, filters)) return false;
        if (reportKey === 'APP_PENDING_REPORT') {
          return !['Completed', 'Approved', 'Rejected', 'Cancelled'].includes(a.status);
        }
        if (reportKey === 'APP_APPROVED_REPORT') return a.status === 'Approved';
        if (reportKey === 'APP_REJECTED_REPORT') return a.status === 'Rejected' || a.status === 'Cancelled';
        if (reportKey === 'APP_COMPLETED_REPORT') return a.status === 'Completed';
        return true;
      });

      let sumFee = 0;
      let sumCol = 0;
      let sumDue = 0;
      const rows = filtered.map((a) => {
        const paid = this.erp.payments
          .filter((p) => p.applicationNo === a.applicationNo && p.verificationStatus === 'Confirmed')
          .reduce((s, p) => s + p.amount, 0);
        const ref = this.erp.refunds
          .filter((r) => r.applicationNo === a.applicationNo && r.status === 'Processed')
          .reduce((s, r) => s + r.refundAmount, 0);
        const netCol = round2(Math.max(0, paid - ref));
        const activeBill = a.status === 'Cancelled' || a.status === 'Rejected' ? 0 : a.serviceSnapshot.customerChargeSnapshot;
        const due = round2(Math.max(0, activeBill - netCol));
        sumFee += activeBill;
        sumCol += netCol;
        sumDue += due;
        return {
          applicationNo: a.applicationNo,
          customerName: a.customerSnapshot.fullName,
          serviceName: a.serviceSnapshot.name,
          assignedStaffId: a.assignedStaffId || 'Unassigned',
          status: a.status,
          serviceCharge: activeBill,
          netCollected: netCol,
          balanceDue: due,
          createdDate: formatDateISTServer(a.submissionDate ?? a.createdAt),
        };
      });

      return {
        ...base,
        columns: [
          { key: 'applicationNo', label: 'Application No', type: 'text' },
          { key: 'customerName', label: 'Customer', type: 'text' },
          { key: 'serviceName', label: 'Service', type: 'text' },
          { key: 'assignedStaffId', label: 'Staff', type: 'text' },
          { key: 'status', label: 'Status', type: 'status' },
          { key: 'serviceCharge', label: 'Fee (₹)', type: 'currency', align: 'right' },
          { key: 'netCollected', label: 'Collected (₹)', type: 'currency', align: 'right' },
          { key: 'balanceDue', label: 'Due (₹)', type: 'currency', align: 'right' },
          { key: 'createdDate', label: 'Date (IST)', type: 'date' },
        ],
        rows,
        totals: { applications: rows.length, serviceCharge: round2(sumFee), netCollected: round2(sumCol), balanceDue: round2(sumDue) },
      };
    }

    if (reportKey === 'SVC_REVENUE_REPORT') {
      const map = new Map<string, { serviceId: string; serviceName: string; count: number; revenue: number; cost: number; profit: number }>();
      for (const a of apps.filter((x) => inDateRange(x.createdAt, filters) && x.status !== 'Cancelled' && x.status !== 'Rejected')) {
        const cur = map.get(a.serviceId) ?? {
          serviceId: a.serviceId,
          serviceName: a.serviceSnapshot.name,
          count: 0,
          revenue: 0,
          cost: 0,
          profit: 0,
        };
        const paid = this.erp.payments
          .filter((p) => p.applicationNo === a.applicationNo && p.verificationStatus === 'Confirmed')
          .reduce((s, p) => s + p.amount, 0);
        cur.count += 1;
        cur.revenue = round2(cur.revenue + paid);
        cur.cost = round2(cur.cost + a.serviceSnapshot.serviceCostSnapshot);
        cur.profit = round2(cur.revenue - cur.cost);
        map.set(a.serviceId, cur);
      }
      const rows = Array.from(map.values());
      return {
        ...base,
        columns: [
          { key: 'serviceId', label: 'Service ID', type: 'text' },
          { key: 'serviceName', label: 'Service Name', type: 'text' },
          { key: 'count', label: 'Filings', type: 'number', align: 'right' },
          { key: 'revenue', label: 'Collected Revenue (₹)', type: 'currency', align: 'right' },
          { key: 'cost', label: 'Direct Cost (₹)', type: 'currency', align: 'right', sensitive: true },
          { key: 'profit', label: 'Net Margin (₹)', type: 'currency', align: 'right', sensitive: true },
        ],
        rows,
        totals: {
          filings: rows.reduce((s, r) => s + r.count, 0),
          revenue: round2(rows.reduce((s, r) => s + r.revenue, 0)),
          profit: round2(rows.reduce((s, r) => s + r.profit, 0)),
        },
      };
    }

    if (reportKey === 'SVC_RATE_HISTORY') {
      const rows: Array<Record<string, string | number | boolean | null>> = [];
      for (const sr of this.p3.serviceRates) {
        for (const v of sr.versions) {
          rows.push({
            serviceCode: sr.serviceCode,
            serviceName: sr.serviceName,
            versionNo: `v${v.versionNo}`,
            customerCharge: v.customerCharge,
            serviceCost: v.serviceCost,
            profitAmount: v.profitAmount,
            effectiveDate: formatDateISTServer(v.effectiveDate),
            approvalStatus: v.approvalStatus,
            approvedBy: v.approvedBy ?? 'Pending',
          });
        }
      }
      return {
        ...base,
        columns: [
          { key: 'serviceCode', label: 'Code', type: 'text' },
          { key: 'serviceName', label: 'Service Name', type: 'text' },
          { key: 'versionNo', label: 'Version', type: 'text' },
          { key: 'customerCharge', label: 'Charge (₹)', type: 'currency', align: 'right' },
          { key: 'serviceCost', label: 'Cost (₹)', type: 'currency', align: 'right', sensitive: true },
          { key: 'profitAmount', label: 'Margin (₹)', type: 'currency', align: 'right', sensitive: true },
          { key: 'effectiveDate', label: 'Effective Date', type: 'date' },
          { key: 'approvalStatus', label: 'Approval', type: 'status' },
          { key: 'approvedBy', label: 'Approved By', type: 'text' },
        ],
        rows,
        totals: { rateVersions: rows.length },
      };
    }

    if (reportKey === 'APP_STAFF_WISE') {
      const dash = this.getReportingDashboard(user, filters);
      return {
        ...base,
        columns: [
          { key: 'staffId', label: 'Staff ID', type: 'text' },
          { key: 'staffName', label: 'Staff Name', type: 'text' },
          { key: 'totalAssigned', label: 'Assigned', type: 'number', align: 'right' },
          { key: 'completed', label: 'Completed', type: 'number', align: 'right' },
          { key: 'pending', label: 'Active / Pending', type: 'number', align: 'right' },
          { key: 'overdue', label: 'Overdue SLA', type: 'number', align: 'right' },
          { key: 'completionRatePct', label: 'Success %', type: 'number', align: 'right' },
          { key: 'collectionsHandled', label: 'Collected (₹)', type: 'currency', align: 'right' },
        ],
        rows: dash.staffPerformance,
        totals: {
          staffCount: dash.staffPerformance.length,
          totalCollections: round2(dash.staffPerformance.reduce((s, r) => s + r.collectionsHandled, 0)),
        },
      };
    }

    if (reportKey === 'APP_PROCESSING_TIME') {
      const rows = apps
        .filter((a) => inDateRange(a.createdAt, filters))
        .map((a) => {
          const start = new Date(a.submissionDate ?? a.createdAt).getTime();
          const end = a.actualCompletionDate ? new Date(a.actualCompletionDate).getTime() : Date.now();
          const daysElapsed = Math.max(0, round2((end - start) / (24 * 60 * 60 * 1000)));
          const svc = this.erp.services.find((s) => s.serviceId === a.serviceId);
          const targetDays = svc?.sla.expectedDays ?? 3;
          return {
            applicationNo: a.applicationNo,
            serviceName: a.serviceSnapshot.name,
            status: a.status,
            targetSlaDays: targetDays,
            actualDays: daysElapsed,
            varianceDays: round2(daysElapsed - targetDays),
            slaState: daysElapsed > targetDays && a.status !== 'Completed' ? 'Overdue' : 'Within SLA',
          };
        });
      return {
        ...base,
        columns: [
          { key: 'applicationNo', label: 'Application No', type: 'text' },
          { key: 'serviceName', label: 'Service', type: 'text' },
          { key: 'status', label: 'Status', type: 'status' },
          { key: 'targetSlaDays', label: 'SLA Target (Days)', type: 'number', align: 'right' },
          { key: 'actualDays', label: 'Elapsed / Actual (Days)', type: 'number', align: 'right' },
          { key: 'varianceDays', label: 'Variance', type: 'number', align: 'right' },
          { key: 'slaState', label: 'SLA Standing', type: 'status' },
        ],
        rows,
        totals: {
          avgProcessingDays: rows.length > 0 ? round2(rows.reduce((s, r) => s + r.actualDays, 0) / rows.length) : 0,
        },
      };
    }

    if (reportKey === 'APP_STATUS_HISTORY') {
      const rows: Array<Record<string, string | number | boolean | null>> = [];
      for (const a of apps.filter((x) => inDateRange(x.createdAt, filters))) {
        for (const evt of a.statusHistory) {
          rows.push({
            applicationNo: a.applicationNo,
            customerName: a.customerSnapshot.fullName,
            previousStatus: evt.previousStatus ?? 'Initial',
            newStatus: evt.newStatus,
            changedBy: `${evt.changedBy} (${evt.changedByRole})`,
            reason: evt.reason || evt.remarks || '—',
            changedAt: formatDateTimeISTServer(evt.changedAt),
          });
        }
      }
      return {
        ...base,
        columns: [
          { key: 'applicationNo', label: 'Application No', type: 'text' },
          { key: 'customerName', label: 'Customer', type: 'text' },
          { key: 'previousStatus', label: 'From Status', type: 'status' },
          { key: 'newStatus', label: 'To Status', type: 'status' },
          { key: 'changedBy', label: 'Changed By', type: 'text' },
          { key: 'reason', label: 'Reason / Remarks', type: 'text' },
          { key: 'changedAt', label: 'Timestamp (IST)', type: 'date' },
        ],
        rows,
        totals: { transitions: rows.length },
      };
    }

    if (reportKey === 'APP_CUSTOMER_WISE') {
      const map = new Map<string, { customerId: string; customerName: string; totalApps: number; completed: number; active: number; totalFee: number; totalPaid: number }>();
      for (const a of apps.filter((x) => inDateRange(x.createdAt, filters))) {
        const cur = map.get(a.customerId) ?? {
          customerId: a.customerId,
          customerName: a.customerSnapshot.fullName,
          totalApps: 0,
          completed: 0,
          active: 0,
          totalFee: 0,
          totalPaid: 0,
        };
        cur.totalApps += 1;
        if (a.status === 'Completed') cur.completed += 1;
        else if (!['Cancelled', 'Rejected'].includes(a.status)) cur.active += 1;
        if (a.status !== 'Cancelled' && a.status !== 'Rejected') {
          cur.totalFee = round2(cur.totalFee + a.serviceSnapshot.customerChargeSnapshot);
        }
        cur.totalPaid = round2(
          cur.totalPaid +
            this.erp.payments
              .filter((p) => p.applicationNo === a.applicationNo && p.verificationStatus === 'Confirmed')
              .reduce((s, p) => s + p.amount, 0)
        );
        map.set(a.customerId, cur);
      }
      const rows = Array.from(map.values());
      return {
        ...base,
        columns: [
          { key: 'customerId', label: 'Customer ID', type: 'text' },
          { key: 'customerName', label: 'Customer Name', type: 'text' },
          { key: 'totalApps', label: 'Total Apps', type: 'number', align: 'right' },
          { key: 'completed', label: 'Completed', type: 'number', align: 'right' },
          { key: 'active', label: 'Active', type: 'number', align: 'right' },
          { key: 'totalFee', label: 'Total Billed (₹)', type: 'currency', align: 'right' },
          { key: 'totalPaid', label: 'Paid (₹)', type: 'currency', align: 'right' },
        ],
        rows,
        totals: { customers: rows.length, totalFee: round2(rows.reduce((s, r) => s + r.totalFee, 0)) },
      };
    }

    // ---------------- FINANCIAL REPORTS (DOUBLE-ENTRY & RECONCILED) ----------------
    if (reportKey === 'FIN_DAILY_CASHBOOK') {
      const rows = this.p3.dailyCashClosings.map((d) => ({
        closingCode: d.closingCode,
        counterCode: d.counterCode,
        closingDate: formatDateISTServer(d.closingDate),
        openingCash: d.openingCash,
        cashReceived: d.cashReceived,
        cashExpenses: d.cashExpenses,
        expectedCash: d.expectedCash,
        actualCashCount: d.actualCashCount,
        variance: d.cashDifference,
        approvalStatus: d.approvalStatus,
      }));
      return {
        ...base,
        columns: [
          { key: 'closingCode', label: 'Closing ID', type: 'text' },
          { key: 'counterCode', label: 'Counter', type: 'text' },
          { key: 'closingDate', label: 'Date (IST)', type: 'date' },
          { key: 'openingCash', label: 'Opening (₹)', type: 'currency', align: 'right' },
          { key: 'cashReceived', label: 'Cash In (₹)', type: 'currency', align: 'right' },
          { key: 'cashExpenses', label: 'Cash Out (₹)', type: 'currency', align: 'right' },
          { key: 'expectedCash', label: 'Expected (₹)', type: 'currency', align: 'right' },
          { key: 'actualCashCount', label: 'Physical (₹)', type: 'currency', align: 'right' },
          { key: 'variance', label: 'Diff (₹)', type: 'currency', align: 'right' },
          { key: 'approvalStatus', label: 'Status', type: 'status' },
        ],
        rows,
        totals: { closingCount: rows.length, totalActualCash: round2(rows.reduce((s, r) => s + r.actualCashCount, 0)) },
      };
    }

    if (reportKey === 'FIN_DAYBOOK') {
      const posted = this.getPostedVouchers(filters);
      return {
        ...base,
        columns: [
          { key: 'voucherNo', label: 'Voucher No', type: 'text' },
          { key: 'voucherDate', label: 'Date (IST)', type: 'date' },
          { key: 'voucherType', label: 'Type', type: 'status' },
          { key: 'entityCode', label: 'Entity', type: 'text' },
          { key: 'narration', label: 'Narration', type: 'text' },
          { key: 'status', label: 'Status', type: 'status' },
          { key: 'totalDebit', label: 'Debit (₹)', type: 'currency', align: 'right' },
          { key: 'totalCredit', label: 'Credit (₹)', type: 'currency', align: 'right' },
        ],
        rows: posted.map((v) => ({
          voucherNo: v.voucherNo,
          voucherDate: formatDateISTServer(v.voucherDate),
          voucherType: v.voucherType,
          entityCode: v.entityCode,
          narration: v.narration,
          status: v.status,
          totalDebit: v.totalDebit,
          totalCredit: v.totalCredit,
        })),
        totals: {
          vouchersCount: posted.length,
          totalDebit: round2(posted.reduce((s, v) => s + v.totalDebit, 0)),
          totalCredit: round2(posted.reduce((s, v) => s + v.totalCredit, 0)),
        },
        notes: ['Strictly excludes Cancelled, Reversed, Draft, and segregated ENT-PNB-CSP client principal vouchers.'],
      };
    }

    if (reportKey === 'FIN_INCOME_REPORT' || reportKey === 'FIN_EXPENSE_REPORT' || reportKey === 'FIN_PNL_STATEMENT') {
      const st = computeFinancialStatements({
        accounts: this.finance.chartOfAccounts,
        vouchers: this.finance.vouchers.filter((v) => inDateRange(v.voucherDate, filters)),
        entityCode: 'ENT-MAIN',
        eliminateIntercompany: true,
      });
      const pnl = st.profitAndLoss;
      const rows = [
        ...(reportKey !== 'FIN_EXPENSE_REPORT'
          ? pnl.incomeRows.map((r) => ({
              accountCode: r.accountCode,
              accountName: r.accountName,
              section: 'Operating Income',
              amount: r.amount,
            }))
          : []),
        ...(reportKey !== 'FIN_INCOME_REPORT'
          ? [
              ...pnl.cogsRows.map((r) => ({
                accountCode: r.accountCode,
                accountName: r.accountName,
                section: 'Direct Cost / COGS',
                amount: r.amount,
              })),
              ...pnl.expenseRows.map((r) => ({
                accountCode: r.accountCode,
                accountName: r.accountName,
                section: 'Operating Expense',
                amount: r.amount,
              })),
            ]
          : []),
      ];
      return {
        ...base,
        columns: [
          { key: 'accountCode', label: 'Account Code', type: 'text' },
          { key: 'accountName', label: 'Ledger Head', type: 'text' },
          { key: 'section', label: 'Classification', type: 'status' },
          { key: 'amount', label: 'Amount (₹)', type: 'currency', align: 'right' },
        ],
        rows,
        totals: {
          totalIncome: pnl.totalIncome,
          totalCogs: pnl.totalCogs,
          grossProfit: pnl.grossProfit,
          totalExpenses: pnl.totalExpenses,
          netProfit: pnl.netProfit,
        },
        summaryCards: [
          { label: 'Total Income', value: formatINRServer(pnl.totalIncome) },
          { label: 'COGS + OpEx', value: formatINRServer(round2(pnl.totalCogs + pnl.totalExpenses)) },
          { label: 'Net Profit', value: formatINRServer(pnl.netProfit) },
        ],
      };
    }

    if (reportKey === 'FIN_BALANCE_SHEET') {
      const st = computeFinancialStatements({
        accounts: this.finance.chartOfAccounts,
        vouchers: this.finance.vouchers.filter((v) => inDateRange(v.voucherDate, filters)),
        entityCode: 'ENT-MAIN',
        eliminateIntercompany: true,
      });
      const bs = st.balanceSheet;
      const rows = [
        ...bs.assetRows.map((r) => ({ accountCode: r.accountCode, accountName: r.accountName, side: 'Asset', subType: r.subType, amount: r.amount })),
        ...bs.liabilityRows.map((r) => ({ accountCode: r.accountCode, accountName: r.accountName, side: 'Liability', subType: r.subType, amount: r.amount })),
        ...bs.equityRows.map((r) => ({ accountCode: r.accountCode, accountName: r.accountName, side: 'Equity', subType: r.subType, amount: r.amount })),
      ];
      return {
        ...base,
        columns: [
          { key: 'accountCode', label: 'Code', type: 'text' },
          { key: 'accountName', label: 'Account Name', type: 'text' },
          { key: 'side', label: 'Classification', type: 'status' },
          { key: 'subType', label: 'Sub-Type', type: 'text' },
          { key: 'amount', label: 'Balance (₹)', type: 'currency', align: 'right' },
        ],
        rows,
        totals: {
          totalAssets: bs.totalAssets,
          totalLiabilitiesAndEquity: round2(bs.totalLiabilities + bs.totalEquityIncludingNetProfit),
          equationDifference: bs.equationDifference,
        },
        notes: [
          'Strictly excludes segregated PNB CSP (ENT-PNB-CSP) client principal trust balances and Cancelled/Reversed/Draft vouchers.',
          'Accounting verification: Total Assets = Total Liabilities + Equity + Current Net Profit.',
        ],
      };
    }

    if (reportKey === 'FIN_CASH_FLOW') {
      const st = computeFinancialStatements({
        accounts: this.finance.chartOfAccounts,
        vouchers: this.finance.vouchers.filter((v) => inDateRange(v.voucherDate, filters)),
        entityCode: 'ENT-MAIN',
        eliminateIntercompany: true,
      });
      const cf = st.cashFlowStatement;
      const rows = [
        { activity: 'Operating Cash Flow', note: 'Collections minus operating payouts', amount: cf.operatingCashFlow },
        { activity: 'Investing Cash Flow', note: 'Fixed asset & treasury FD flows', amount: cf.investingCashFlow },
        { activity: 'Financing Cash Flow', note: 'Loans, partner equity & drawings', amount: cf.financingCashFlow },
        { activity: 'Net Change in Cash & Bank', note: 'Sum of Operating + Investing + Financing', amount: cf.netCashChange },
        { activity: 'Closing Cash & Bank Reserves', note: 'Reconciled closing cash drawers + bank balance', amount: cf.closingCashAndBank },
      ];
      return {
        ...base,
        columns: [
          { key: 'activity', label: 'Cash Flow Activity', type: 'text' },
          { key: 'note', label: 'Basis', type: 'text' },
          { key: 'amount', label: 'Amount (₹)', type: 'currency', align: 'right' },
        ],
        rows,
        totals: { closingCashAndBank: cf.closingCashAndBank },
      };
    }

    if (reportKey === 'FIN_GENERAL_LEDGER') {
      const posted = this.getPostedVouchers(filters);
      const rows: Array<Record<string, string | number | boolean | null>> = [];
      for (const v of posted) {
        for (const l of v.lines) {
          rows.push({
            voucherNo: v.voucherNo,
            voucherDate: formatDateISTServer(v.voucherDate),
            accountCode: l.accountCode,
            accountName: l.accountName,
            narration: l.description || v.narration,
            debitAmount: l.debitAmount,
            creditAmount: l.creditAmount,
          });
        }
      }
      return {
        ...base,
        columns: [
          { key: 'voucherNo', label: 'Voucher No', type: 'text' },
          { key: 'voucherDate', label: 'Date', type: 'date' },
          { key: 'accountCode', label: 'Account Code', type: 'text' },
          { key: 'accountName', label: 'Account Head', type: 'text' },
          { key: 'narration', label: 'Line Description', type: 'text' },
          { key: 'debitAmount', label: 'Debit (₹)', type: 'currency', align: 'right' },
          { key: 'creditAmount', label: 'Credit (₹)', type: 'currency', align: 'right' },
        ],
        rows,
        totals: {
          totalDebit: round2(rows.reduce((s, r) => s + Number(r.debitAmount), 0)),
          totalCredit: round2(rows.reduce((s, r) => s + Number(r.creditAmount), 0)),
        },
      };
    }

    if (reportKey === 'FIN_CUSTOMER_LEDGER') {
      const rows = customers.map((c) => {
        const st = this.getCustomerFinancialStats(c.customerId);
        return {
          customerId: c.customerId,
          customerName: c.fullName,
          creditLimit: this.finance.customerCredits.find((cc) => cc.customerId === c.customerId)?.creditLimit ?? 10000,
          billed: st.totalBilled,
          collected: st.totalPaid,
          refunded: st.totalRefunded,
          closingReceivable: st.due,
        };
      });
      return {
        ...base,
        columns: [
          { key: 'customerId', label: 'Customer ID', type: 'text' },
          { key: 'customerName', label: 'Customer Name', type: 'text' },
          { key: 'creditLimit', label: 'Credit Limit (₹)', type: 'currency', align: 'right' },
          { key: 'billed', label: 'Billed Dr (₹)', type: 'currency', align: 'right' },
          { key: 'collected', label: 'Receipts Cr (₹)', type: 'currency', align: 'right' },
          { key: 'refunded', label: 'Refunds (₹)', type: 'currency', align: 'right' },
          { key: 'closingReceivable', label: 'Closing Due (₹)', type: 'currency', align: 'right' },
        ],
        rows,
        totals: {
          billed: round2(rows.reduce((s, r) => s + r.billed, 0)),
          collected: round2(rows.reduce((s, r) => s + r.collected, 0)),
          closingReceivable: round2(rows.reduce((s, r) => s + r.closingReceivable, 0)),
        },
      };
    }

    if (reportKey === 'FIN_SUPPLIER_LEDGER') {
      const rows = this.finance.suppliers.map((sup) => {
        const bills = this.finance.supplierBills.filter((b) => b.supplierId === sup.supplierId);
        const totalBilled = round2(bills.reduce((s, b) => s + b.netPayable, 0));
        const totalPaid = round2(bills.reduce((s, b) => s + b.paidAmount, 0));
        return {
          supplierCode: sup.supplierId,
          supplierName: sup.name,
          gstin: sup.gstin,
          billCount: bills.length,
          totalBilled,
          totalPaid,
          balancePayable: round2(Math.max(0, totalBilled - totalPaid)),
        };
      });
      return {
        ...base,
        columns: [
          { key: 'supplierCode', label: 'Supplier Code', type: 'text' },
          { key: 'supplierName', label: 'Supplier Name', type: 'text' },
          { key: 'gstin', label: 'GSTIN', type: 'text' },
          { key: 'billCount', label: 'Bills', type: 'number', align: 'right' },
          { key: 'totalBilled', label: 'Net Payable (₹)', type: 'currency', align: 'right' },
          { key: 'totalPaid', label: 'Paid (₹)', type: 'currency', align: 'right' },
          { key: 'balancePayable', label: 'Balance Due (₹)', type: 'currency', align: 'right' },
        ],
        rows,
        totals: { balancePayable: round2(rows.reduce((s, r) => s + r.balancePayable, 0)) },
      };
    }

    if (reportKey === 'FIN_BANK_BOOK') {
      const rows = this.finance.bankStatements.map((s) => ({
        stmtId: s.lineId,
        bankAccountCode: s.bankId,
        txnDate: formatDateISTServer(s.txnDate),
        description: s.description,
        referenceNo: s.utrOrRef,
        debitAmount: s.debitAmount,
        creditAmount: s.creditAmount,
        matchStatus: s.matchStatus,
      }));
      return {
        ...base,
        columns: [
          { key: 'stmtId', label: 'Statement ID', type: 'text' },
          { key: 'bankAccountCode', label: 'Bank Account', type: 'text' },
          { key: 'txnDate', label: 'Date (IST)', type: 'date' },
          { key: 'description', label: 'Narration', type: 'text' },
          { key: 'referenceNo', label: 'Ref / UTR', type: 'text' },
          { key: 'debitAmount', label: 'Withdrawal Dr (₹)', type: 'currency', align: 'right' },
          { key: 'creditAmount', label: 'Deposit Cr (₹)', type: 'currency', align: 'right' },
          { key: 'matchStatus', label: 'BRS Status', type: 'status' },
        ],
        rows,
        totals: {
          statementLines: rows.length,
          totalDeposits: round2(rows.reduce((s, r) => s + r.creditAmount, 0)),
        },
      };
    }

    if (reportKey === 'FIN_CASH_ACCOUNT') {
      const rows = this.finance.cashCounters.map((c) => ({
        counterCode: c.counterCode,
        counterName: c.counterName,
        coaAccountCode: c.coaAccountCode,
        custodianUserId: c.custodianUserId,
        openingBalance: c.openingBalance,
        currentBalance: c.currentBalance,
        status: c.status,
      }));
      return {
        ...base,
        columns: [
          { key: 'counterCode', label: 'Counter Code', type: 'text' },
          { key: 'counterName', label: 'Counter Name', type: 'text' },
          { key: 'coaAccountCode', label: 'GL Account', type: 'text' },
          { key: 'custodianUserId', label: 'Custodian', type: 'text' },
          { key: 'openingBalance', label: 'Opening (₹)', type: 'currency', align: 'right' },
          { key: 'currentBalance', label: 'Current Balance (₹)', type: 'currency', align: 'right' },
          { key: 'status', label: 'Status', type: 'status' },
        ],
        rows,
        totals: { totalCashBalance: round2(rows.reduce((s, r) => s + r.currentBalance, 0)) },
      };
    }

    if (reportKey === 'FIN_UPI_TRANSACTIONS' || reportKey === 'FIN_PAYMENT_COLLECTION') {
      const list = payments.filter((p) => {
        if (reportKey === 'FIN_UPI_TRANSACTIONS' && p.paymentMethod !== 'UPI') return false;
        if (filters.paymentMethod && filters.paymentMethod !== 'ALL' && p.paymentMethod !== filters.paymentMethod) return false;
        return inDateRange(p.recordedAt, filters);
      });
      return {
        ...base,
        columns: [
          { key: 'transactionId', label: 'Txn ID', type: 'text' },
          { key: 'receiptNo', label: 'Receipt No', type: 'text' },
          { key: 'customerName', label: 'Customer', type: 'text' },
          { key: 'paymentMethod', label: 'Method', type: 'status' },
          { key: 'upiReference', label: 'UPI / Ref', type: 'text' },
          { key: 'verificationStatus', label: 'Verification', type: 'status' },
          { key: 'amount', label: 'Amount (₹)', type: 'currency', align: 'right' },
          { key: 'recordedAt', label: 'Date (IST)', type: 'date' },
        ],
        rows: list.map((p) => ({
          transactionId: p.transactionId,
          receiptNo: p.receiptNo,
          customerName: p.customerName,
          paymentMethod: p.paymentMethod,
          upiReference: p.upiReference || '—',
          verificationStatus: p.verificationStatus,
          amount: p.amount,
          recordedAt: formatDateISTServer(p.recordedAt),
        })),
        totals: {
          confirmedTotal: round2(list.filter((p) => p.verificationStatus === 'Confirmed').reduce((s, p) => s + p.amount, 0)),
        },
      };
    }

    if (reportKey === 'FIN_OUTSTANDING_DUE') {
      const rows = apps
        .filter((a) => a.status !== 'Cancelled' && a.status !== 'Rejected')
        .map((a) => {
          const paid = this.erp.payments
            .filter((p) => p.applicationNo === a.applicationNo && p.verificationStatus === 'Confirmed')
            .reduce((s, p) => s + p.amount, 0);
          const due = round2(Math.max(0, a.serviceSnapshot.customerChargeSnapshot - paid));
          return {
            applicationNo: a.applicationNo,
            customerId: a.customerId,
            customerName: a.customerSnapshot.fullName,
            serviceName: a.serviceSnapshot.name,
            totalFee: a.serviceSnapshot.customerChargeSnapshot,
            confirmedPaid: round2(paid),
            dueAmount: due,
            status: a.status,
          };
        })
        .filter((r) => r.dueAmount > 0);
      return {
        ...base,
        columns: [
          { key: 'applicationNo', label: 'Application No', type: 'text' },
          { key: 'customerId', label: 'Customer ID', type: 'text' },
          { key: 'customerName', label: 'Customer Name', type: 'text' },
          { key: 'serviceName', label: 'Service', type: 'text' },
          { key: 'totalFee', label: 'Charge (₹)', type: 'currency', align: 'right' },
          { key: 'confirmedPaid', label: 'Paid (₹)', type: 'currency', align: 'right' },
          { key: 'dueAmount', label: 'Due (₹)', type: 'currency', align: 'right' },
          { key: 'status', label: 'App Status', type: 'status' },
        ],
        rows,
        totals: { totalOutstanding: round2(rows.reduce((s, r) => s + r.dueAmount, 0)) },
      };
    }

    if (reportKey === 'FIN_OPENING_BALANCE' || reportKey === 'FIN_CLOSING_BALANCE') {
      const st = computeFinancialStatements({
        accounts: this.finance.chartOfAccounts,
        vouchers: this.finance.vouchers.filter((v) => inDateRange(v.voucherDate, filters)),
        entityCode: 'ENT-MAIN',
        eliminateIntercompany: true,
      });
      const tb = st.trialBalance;
      const rows = tb.rows.map((r) => ({
        accountCode: r.accountCode,
        accountName: r.accountName,
        accountType: r.accountType,
        openingDebit: r.openingDebit,
        openingCredit: r.openingCredit,
        periodDebit: r.periodDebit,
        periodCredit: r.periodCredit,
        closingDebit: r.closingDebit,
        closingCredit: r.closingCredit,
      }));
      return {
        ...base,
        columns: [
          { key: 'accountCode', label: 'Code', type: 'text' },
          { key: 'accountName', label: 'Account Head', type: 'text' },
          { key: 'accountType', label: 'Type', type: 'status' },
          { key: 'openingDebit', label: 'Open Dr (₹)', type: 'currency', align: 'right' },
          { key: 'openingCredit', label: 'Open Cr (₹)', type: 'currency', align: 'right' },
          { key: 'periodDebit', label: 'Period Dr (₹)', type: 'currency', align: 'right' },
          { key: 'periodCredit', label: 'Period Cr (₹)', type: 'currency', align: 'right' },
          { key: 'closingDebit', label: 'Close Dr (₹)', type: 'currency', align: 'right' },
          { key: 'closingCredit', label: 'Close Cr (₹)', type: 'currency', align: 'right' },
        ],
        rows,
        totals: {
          openingDr: tb.totalOpeningDebit,
          openingCr: tb.totalOpeningCredit,
          closingDr: tb.totalClosingDebit,
          closingCr: tb.totalClosingCredit,
          balanced: tb.isBalanced ? 'YES' : 'NO',
        },
      };
    }

    if (reportKey === 'FIN_FY_SUMMARY') {
      const rows = this.finance.fiscalYears.map((fyRow) => {
        const fyCodeShort = fyRow.fyCode.replace(/^FY\s+/, '');
        const fyVouchers = this.finance.vouchers.filter((v) => v.fyCode === fyRow.fyCode);
        const st = computeFinancialStatements({
          accounts: this.finance.chartOfAccounts,
          vouchers: fyVouchers,
          entityCode: 'ENT-MAIN',
          eliminateIntercompany: true,
        });
        const fyApps = this.erp.applications.filter((a) => !a.archivedAt && a.financialYear === fyCodeShort);
        const fyCollections = this.erp.payments
          .filter((p) => p.verificationStatus === 'Confirmed' && getFyFromIsoDate(p.recordedAt) === fyCodeShort)
          .reduce((s, p) => s + p.amount, 0);
        return {
          fyCode: fyRow.fyCode,
          periodSpan: `${formatDateISTServer(fyRow.startDate)} – ${formatDateISTServer(fyRow.endDate)}`,
          status: fyRow.status,
          applications: fyApps.length,
          collections: round2(fyCollections),
          income: st.profitAndLoss.totalIncome,
          expenses: round2(st.profitAndLoss.totalCogs + st.profitAndLoss.totalExpenses),
          netProfit: st.profitAndLoss.netProfit,
        };
      });
      return {
        ...base,
        columns: [
          { key: 'fyCode', label: 'Financial Year', type: 'text' },
          { key: 'periodSpan', label: 'Apr–Mar Window', type: 'text' },
          { key: 'status', label: 'Books Status', type: 'status' },
          { key: 'applications', label: 'Applications', type: 'number', align: 'right' },
          { key: 'collections', label: 'Collections (₹)', type: 'currency', align: 'right' },
          { key: 'income', label: 'GL Income (₹)', type: 'currency', align: 'right' },
          { key: 'expenses', label: 'COGS + Exp (₹)', type: 'currency', align: 'right' },
          { key: 'netProfit', label: 'Net Profit (₹)', type: 'currency', align: 'right' },
        ],
        rows,
        totals: { financialYears: rows.length },
      };
    }

    if (reportKey === 'FIN_TAX_SUMMARY') {
      const rows = this.finance.taxEntries
        .filter((t) => inDateRange(t.entryDate, filters))
        .map((t) => ({
          taxEntryId: t.taxEntryId,
          returnType: t.returnType,
          partyName: t.partyName,
          gstinOrPan: t.gstinOrPan,
          hsnOrSection: t.hsnOrSection,
          taxableValue: t.taxableValue,
          gstTotal: round2(t.cgst + t.sgst + t.igst),
          tdsAmount: t.tdsOrTcs,
          filingStatus: t.filingStatus,
        }));
      return {
        ...base,
        columns: [
          { key: 'taxEntryId', label: 'Tax Entry ID', type: 'text' },
          { key: 'returnType', label: 'Return', type: 'status' },
          { key: 'partyName', label: 'Party Name', type: 'text' },
          { key: 'gstinOrPan', label: 'GSTIN / PAN', type: 'text' },
          { key: 'hsnOrSection', label: 'HSN / Section', type: 'text' },
          { key: 'taxableValue', label: 'Taxable (₹)', type: 'currency', align: 'right' },
          { key: 'gstTotal', label: 'Total GST (₹)', type: 'currency', align: 'right' },
          { key: 'tdsAmount', label: 'TDS (₹)', type: 'currency', align: 'right' },
          { key: 'filingStatus', label: 'Filing Status', type: 'status' },
        ],
        rows,
        totals: {
          totalGst: round2(rows.reduce((s, r) => s + r.gstTotal, 0)),
          totalTds: round2(rows.reduce((s, r) => s + r.tdsAmount, 0)),
        },
      };
    }

    // ---------------- BUSINESS & INVENTORY REPORTS (SECTION 6) ----------------
    if (reportKey === 'BIZ_SALES_REPORT') {
      const posVouchers = this.finance.vouchers.filter(
        (v) => v.status === 'Posted' && v.voucherType === 'Sales' && inDateRange(v.voucherDate, filters)
      );
      const rows = [
        ...payments
          .filter((p) => p.verificationStatus === 'Confirmed' && inDateRange(p.recordedAt, filters))
          .map((p) => ({
            refNo: p.invoiceNo || p.receiptNo,
            channel: 'Service Counter',
            party: p.customerName,
            item: p.serviceName,
            date: formatDateISTServer(p.recordedAt),
            amount: p.amount,
          })),
        ...posVouchers.map((v) => ({
          refNo: v.voucherNo,
          channel: 'Hardware / POS Sale',
          party: 'POS Customer',
          item: v.narration,
          date: formatDateISTServer(v.voucherDate),
          amount: v.totalDebit,
        })),
      ];
      return {
        ...base,
        columns: [
          { key: 'refNo', label: 'Invoice / Ref', type: 'text' },
          { key: 'channel', label: 'Channel', type: 'status' },
          { key: 'party', label: 'Customer', type: 'text' },
          { key: 'item', label: 'Service / Item', type: 'text' },
          { key: 'date', label: 'Date (IST)', type: 'date' },
          { key: 'amount', label: 'Amount (₹)', type: 'currency', align: 'right' },
        ],
        rows,
        totals: { totalSales: round2(rows.reduce((s, r) => s + r.amount, 0)) },
      };
    }

    if (reportKey === 'BIZ_PURCHASE_REPORT' || reportKey === 'BIZ_SUPPLIER_PERFORMANCE') {
      if (reportKey === 'BIZ_PURCHASE_REPORT') {
        const rows = this.finance.supplierBills
          .filter((b) => inDateRange(b.billDate, filters))
          .map((b) => ({
            billNo: b.billNo,
            supplierName: b.supplierName,
            billDate: formatDateISTServer(b.billDate),
            subtotal: b.subtotal,
            gstAmount: b.gstAmount,
            tdsDeducted: b.tdsDeducted,
            netPayable: b.netPayable,
            paidAmount: b.paidAmount,
            status: b.status,
          }));
        return {
          ...base,
          columns: [
            { key: 'billNo', label: 'Bill No', type: 'text' },
            { key: 'supplierName', label: 'Supplier', type: 'text' },
            { key: 'billDate', label: 'Bill Date (IST)', type: 'date' },
            { key: 'subtotal', label: 'Taxable (₹)', type: 'currency', align: 'right' },
            { key: 'gstAmount', label: 'GST (₹)', type: 'currency', align: 'right' },
            { key: 'tdsDeducted', label: 'TDS (₹)', type: 'currency', align: 'right' },
            { key: 'netPayable', label: 'Net Payable (₹)', type: 'currency', align: 'right' },
            { key: 'paidAmount', label: 'Paid (₹)', type: 'currency', align: 'right' },
            { key: 'status', label: 'Status', type: 'status' },
          ],
          rows,
          totals: { netPayable: round2(rows.reduce((s, r) => s + r.netPayable, 0)) },
        };
      }
      const rows = this.finance.suppliers.map((sup) => {
        const bills = this.finance.supplierBills.filter((b) => b.supplierId === sup.supplierId);
        const spend = round2(bills.reduce((s, b) => s + b.netPayable, 0));
        const paid = round2(bills.reduce((s, b) => s + b.paidAmount, 0));
        return {
          supplierCode: sup.supplierId,
          name: sup.name,
          category: sup.category,
          billsCount: bills.length,
          totalSpend: spend,
          settlementPct: spend > 0 ? round2((paid / spend) * 100) : 100,
          status: sup.status,
        };
      });
      return {
        ...base,
        columns: [
          { key: 'supplierCode', label: 'Code', type: 'text' },
          { key: 'name', label: 'Supplier', type: 'text' },
          { key: 'category', label: 'Category', type: 'text' },
          { key: 'billsCount', label: 'Bills', type: 'number', align: 'right' },
          { key: 'totalSpend', label: 'Total Spend (₹)', type: 'currency', align: 'right' },
          { key: 'settlementPct', label: 'Paid %', type: 'number', align: 'right' },
          { key: 'status', label: 'Status', type: 'status' },
        ],
        rows,
        totals: { totalSpend: round2(rows.reduce((s, r) => s + r.totalSpend, 0)) },
      };
    }

    if (reportKey === 'BIZ_STOCK_REPORT' || reportKey === 'BIZ_LOW_STOCK_REPORT' || reportKey === 'BIZ_PRODUCT_PROFITABILITY' || reportKey === 'BIZ_LPG_REPORT') {
      const products = this.finance.products.filter((p) =>
        reportKey === 'BIZ_LPG_REPORT'
          ? p.category.toLowerCase().includes('lpg') || p.name.toLowerCase().includes('lpg')
          : true
      );
      const rows = products
        .map((p) => {
          const qtyOnHand = p.batches.reduce((s, b) => s + b.qtyRemaining, 0);
          const stockValue = round2(p.batches.reduce((s, b) => s + b.qtyRemaining * b.unitCost, 0));
          const avgCost = qtyOnHand > 0 ? round2(stockValue / qtyOnHand) : 0;
          const unitMargin = round2(p.sellingPrice - avgCost);
          return {
            sku: p.sku,
            name: p.name,
            category: p.category,
            valuationMethod: p.valuationMethod,
            qtyOnHand,
            reorderLevel: p.reorderLevel,
            avgUnitCost: avgCost,
            sellingPrice: p.sellingPrice,
            unitMargin,
            stockValue,
            stockState: qtyOnHand === 0 ? 'Out of Stock' : qtyOnHand <= p.reorderLevel ? 'Low Stock' : 'In Stock',
          };
        })
        .filter((r) => (reportKey === 'BIZ_LOW_STOCK_REPORT' ? r.qtyOnHand <= r.reorderLevel : true));

      return {
        ...base,
        columns: [
          { key: 'sku', label: 'SKU', type: 'text' },
          { key: 'name', label: 'Product Name', type: 'text' },
          { key: 'category', label: 'Category', type: 'text' },
          { key: 'valuationMethod', label: 'Method', type: 'status' },
          { key: 'qtyOnHand', label: 'Qty', type: 'number', align: 'right' },
          { key: 'reorderLevel', label: 'Reorder', type: 'number', align: 'right' },
          { key: 'avgUnitCost', label: 'Avg Cost (₹)', type: 'currency', align: 'right', sensitive: true },
          { key: 'sellingPrice', label: 'Sell Price (₹)', type: 'currency', align: 'right' },
          { key: 'unitMargin', label: 'Unit Margin (₹)', type: 'currency', align: 'right', sensitive: true },
          { key: 'stockValue', label: 'Stock Value (₹)', type: 'currency', align: 'right', sensitive: true },
          { key: 'stockState', label: 'Status', type: 'status' },
        ],
        rows,
        totals: { totalUnits: rows.reduce((s, r) => s + r.qtyOnHand, 0), totalStockValue: round2(rows.reduce((s, r) => s + r.stockValue, 0)) },
      };
    }

    if (reportKey === 'BIZ_DELIVERY_REPORT') {
      const rows = this.erp.deliveries
        .filter((d) => inDateRange(d.createdAt, filters))
        .map((d) => ({
          deliveryId: d.deliveryId,
          applicationNo: d.applicationNo,
          deliverableType: d.deliverableType,
          deliveryMethod: d.deliveryMethod,
          receivedBy: d.receivedBy,
          deliveredBy: d.deliveredBy ?? 'Pending',
          deliveryDate: formatDateISTServer(d.deliveryDate),
          status: d.status,
        }));
      return {
        ...base,
        columns: [
          { key: 'deliveryId', label: 'Delivery ID', type: 'text' },
          { key: 'applicationNo', label: 'Application No', type: 'text' },
          { key: 'deliverableType', label: 'Deliverable', type: 'text' },
          { key: 'deliveryMethod', label: 'Method', type: 'text' },
          { key: 'receivedBy', label: 'Received By', type: 'text' },
          { key: 'deliveredBy', label: 'Delivered By', type: 'text' },
          { key: 'deliveryDate', label: 'Date (IST)', type: 'date' },
          { key: 'status', label: 'Status', type: 'status' },
        ],
        rows,
        totals: { handovers: rows.length },
      };
    }

    if (reportKey === 'BIZ_EMPLOYEE_SALARY') {
      const rows = this.finance.employees.map((e) => {
        const net = round2(e.basicSalary + e.allowances - e.pfDeduction - e.tdsDeduction);
        return {
          empCode: e.empId,
          userId: e.userId ?? '—',
          fullName: e.fullName,
          designation: e.designation,
          basicSalary: e.basicSalary,
          allowances: e.allowances,
          pfDeduction: e.pfDeduction,
          tdsDeduction: e.tdsDeduction,
          netSalary: net,
          status: e.status,
        };
      });
      return {
        ...base,
        columns: [
          { key: 'empCode', label: 'Emp Code', type: 'text' },
          { key: 'userId', label: 'User ID', type: 'text' },
          { key: 'fullName', label: 'Employee Name', type: 'text' },
          { key: 'designation', label: 'Designation', type: 'text' },
          { key: 'basicSalary', label: 'Basic (₹)', type: 'currency', align: 'right' },
          { key: 'allowances', label: 'Allowances (₹)', type: 'currency', align: 'right' },
          { key: 'pfDeduction', label: 'PF (₹)', type: 'currency', align: 'right' },
          { key: 'tdsDeduction', label: 'TDS (₹)', type: 'currency', align: 'right' },
          { key: 'netSalary', label: 'Net Pay (₹)', type: 'currency', align: 'right' },
          { key: 'status', label: 'Status', type: 'status' },
        ],
        rows,
        totals: { totalMonthlyNetPayroll: round2(rows.reduce((s, r) => s + r.netSalary, 0)) },
      };
    }

    // BIZ_GROWTH_REPORT
    const analytics = this.getAnalyticsDashboard(user, { granularity: 'monthly' });
    const rows = analytics.incomeVsExpense.map((pt, i) => ({
      period: pt.label,
      income: pt.value,
      expense: pt.secondaryValue ?? 0,
      netProfit: round2(pt.value - (pt.secondaryValue ?? 0)),
      customerRegistrations: analytics.customerGrowth[i]?.value ?? 0,
    }));
    return {
      ...base,
      columns: [
        { key: 'period', label: 'Period', type: 'text' },
        { key: 'income', label: 'Income (₹)', type: 'currency', align: 'right' },
        { key: 'expense', label: 'Expense + COGS (₹)', type: 'currency', align: 'right' },
        { key: 'netProfit', label: 'Net Profit (₹)', type: 'currency', align: 'right' },
        { key: 'customerRegistrations', label: 'New Customers', type: 'number', align: 'right' },
      ],
      rows,
      totals: {
        totalIncome: round2(rows.reduce((s, r) => s + r.income, 0)),
        totalNetProfit: round2(rows.reduce((s, r) => s + r.netProfit, 0)),
      },
    };
  }

  // ---------------- SECTION 9: LIVE BUSINESS ANALYTICS ENGINE ----------------
  public getAnalyticsDashboard(user: ServerUser, query: AnalyticsQueryInput = {}): AnalyticsDashboardPayload {
    const granularity = query.granularity ?? 'monthly';
    const customers = this.getScopedCustomers(user).filter((c) => inDateRange(c.createdAt, query));
    const apps = this.getScopedApps(user).filter((a) => {
      if (query.serviceId && a.serviceId !== query.serviceId) return false;
      if (query.staffId && a.assignedStaffId !== query.staffId) return false;
      return inDateRange(a.createdAt, query);
    });
    const payments = this.getScopedPayments(user).filter(
      (p) => p.verificationStatus === 'Confirmed' && inDateRange(p.recordedAt, query)
    );
    const vouchers = this.getPostedVouchers(query);

    const bucketOf = (dateStr: string): string => {
      const iso = normalizeToIsoDate(dateStr) || new Date().toISOString().slice(0, 10);
      if (granularity === 'daily') return formatDateISTServer(iso);
      if (granularity === 'yearly') return `FY ${getFyFromIsoDate(iso)}`;
      if (granularity === 'quarterly') {
        const y = Number(iso.slice(0, 4));
        const m = Number(iso.slice(5, 7));
        const fyStart = m >= 4 ? y : y - 1;
        const q = m >= 4 && m <= 6 ? 'Q1' : m >= 7 && m <= 9 ? 'Q2' : m >= 10 && m <= 12 ? 'Q3' : 'Q4';
        return `${q} FY ${fyStart}-${String(fyStart + 1).slice(-2)}`;
      }
      return iso.slice(0, 7); // YYYY-MM
    };

    const revMap = new Map<string, number>();
    const expMap = new Map<string, number>();
    const colMap = new Map<string, number>();
    const custMap = new Map<string, number>();

    for (const v of vouchers) {
      const b = bucketOf(v.voucherDate);
      for (const l of v.lines) {
        if (l.accountCode.startsWith('4') && l.accountCode !== '4090') {
          revMap.set(b, round2((revMap.get(b) ?? 0) + (l.creditAmount - l.debitAmount)));
        } else if (l.accountCode.startsWith('5') || l.accountCode.startsWith('6')) {
          expMap.set(b, round2((expMap.get(b) ?? 0) + (l.debitAmount - l.creditAmount)));
        }
      }
    }
    for (const p of payments) {
      const b = bucketOf(p.recordedAt);
      colMap.set(b, round2((colMap.get(b) ?? 0) + p.amount));
    }
    for (const c of customers) {
      const b = bucketOf(c.createdAt);
      custMap.set(b, (custMap.get(b) ?? 0) + 1);
    }

    const allBuckets = Array.from(
      new Set([...revMap.keys(), ...expMap.keys(), ...colMap.keys(), ...custMap.keys()])
    ).sort();

    const revenueGrowth = allBuckets.map((b) => ({ label: b, value: revMap.get(b) ?? 0 }));
    const incomeVsExpense = allBuckets.map((b) => ({
      label: b,
      value: revMap.get(b) ?? 0,
      secondaryValue: expMap.get(b) ?? 0,
    }));
    const profitTrend = allBuckets.map((b) => ({
      label: b,
      value: round2((revMap.get(b) ?? 0) - (expMap.get(b) ?? 0)),
    }));
    const customerGrowth = allBuckets.map((b) => ({ label: b, value: custMap.get(b) ?? 0 }));
    const monthlyCollectionComparison = allBuckets.map((b) => ({ label: b, value: colMap.get(b) ?? 0 }));

    // Application status distribution
    const stCounts = new Map<string, number>();
    for (const a of apps) stCounts.set(a.status, (stCounts.get(a.status) ?? 0) + 1);
    const totalAppsCount = Math.max(1, apps.length);
    const applicationSuccessRate = Array.from(stCounts.entries()).map(([status, count]) => ({
      status,
      count,
      pct: round2((count / totalAppsCount) * 100),
    }));

    // Service-wise revenue & Top 10 Services
    const svcAgg = new Map<string, { serviceId: string; serviceName: string; revenue: number; profit: number; count: number }>();
    for (const a of apps.filter((x) => x.status !== 'Cancelled' && x.status !== 'Rejected')) {
      const s = svcAgg.get(a.serviceId) ?? {
        serviceId: a.serviceId,
        serviceName: a.serviceSnapshot.name,
        revenue: 0,
        profit: 0,
        count: 0,
      };
      const paid = payments.filter((p) => p.applicationNo === a.applicationNo).reduce((sum, p) => sum + p.amount, 0);
      s.count += 1;
      s.revenue = round2(s.revenue + paid);
      s.profit = round2(s.profit + Math.max(0, paid - a.serviceSnapshot.serviceCostSnapshot));
      svcAgg.set(a.serviceId, s);
    }
    const serviceWiseRevenue = Array.from(svcAgg.values()).sort((a, b) => b.revenue - a.revenue);
    const top10Services = serviceWiseRevenue.slice(0, 10).map((s) => ({
      serviceName: s.serviceName,
      count: s.count,
      revenue: s.revenue,
    }));

    // Top 10 Customers & Outstanding Due Buckets
    const custEntries = customers.map((c) => {
      const st = this.getCustomerFinancialStats(c.customerId);
      return {
        customerId: c.customerId,
        customerName: c.fullName,
        village: c.village,
        paid: st.netCollected,
        due: st.due,
        apps: st.appCount,
      };
    });
    const top10Customers = [...custEntries].sort((a, b) => b.paid - a.paid).slice(0, 10);

    const dueBuckets = [
      { bucket: 'No Due (₹0)', customerCount: 0, amountDue: 0 },
      { bucket: '₹1 – ₹1,000', customerCount: 0, amountDue: 0 },
      { bucket: '₹1,001 – ₹5,000', customerCount: 0, amountDue: 0 },
      { bucket: 'Above ₹5,000', customerCount: 0, amountDue: 0 },
    ];
    for (const c of custEntries) {
      if (c.due <= 0) dueBuckets[0].customerCount += 1;
      else if (c.due <= 1000) {
        dueBuckets[1].customerCount += 1;
        dueBuckets[1].amountDue = round2(dueBuckets[1].amountDue + c.due);
      } else if (c.due <= 5000) {
        dueBuckets[2].customerCount += 1;
        dueBuckets[2].amountDue = round2(dueBuckets[2].amountDue + c.due);
      } else {
        dueBuckets[3].customerCount += 1;
        dueBuckets[3].amountDue = round2(dueBuckets[3].amountDue + c.due);
      }
    }

    const dash = this.getReportingDashboard(user, query);
    const staffPerformanceComparison = dash.staffPerformance.map((s) => ({
      staffId: s.staffId,
      completed: s.completed,
      active: s.pending,
      collections: s.collectionsHandled,
    }));

    // Financial Year Comparison
    const financialYearComparison = this.finance.fiscalYears.map((fyRow) => {
      const fyV = this.finance.vouchers.filter((v) => v.fyCode === fyRow.fyCode);
      const st = computeFinancialStatements({
        accounts: this.finance.chartOfAccounts,
        vouchers: fyV,
        entityCode: 'ENT-MAIN',
        eliminateIntercompany: true,
      });
      return {
        fyCode: fyRow.fyCode,
        income: st.profitAndLoss.totalIncome,
        expense: round2(st.profitAndLoss.totalCogs + st.profitAndLoss.totalExpenses),
        netProfit: st.profitAndLoss.netProfit,
      };
    });

    // Forecast (Strictly marked isEstimate: true)
    const actualVals = revenueGrowth.map((r) => r.value);
    const recentAvg =
      actualVals.length > 0
        ? round2(actualVals.slice(-3).reduce((s, v) => s + v, 0) / Math.min(3, actualVals.length))
        : 0;
    const forecastPoints = [
      ...revenueGrowth.map((p) => ({ label: p.label, value: p.value, isEstimate: false })),
      { label: 'Est. Next +1', value: round2(recentAvg * 1.05), isEstimate: true },
      { label: 'Est. Next +2', value: round2(recentAvg * 1.1), isEstimate: true },
      { label: 'Est. Next +3', value: round2(recentAvg * 1.15), isEstimate: true },
    ];

    return {
      granularity,
      financialYear: dash.financialYear,
      dateRangeLabel:
        query.fromDate || query.toDate
          ? `${formatDateISTServer(query.fromDate || '2026-04-01')} – ${formatDateISTServer(query.toDate || new Date().toISOString().slice(0, 10))}`
          : `FY ${dash.financialYear}`,
      revenueGrowth,
      incomeVsExpense,
      profitTrend,
      customerGrowth,
      applicationSuccessRate,
      serviceWiseRevenue,
      monthlyCollectionComparison,
      staffPerformanceComparison,
      outstandingDueAnalysis: dueBuckets,
      financialYearComparison,
      top10Services,
      top10Customers,
      businessGrowthForecast: {
        disclaimer:
          'ESTIMATE ONLY — Projected from trailing posted ledger revenue average (+5% compounding baseline). Not actual financial results.',
        points: forecastPoints,
      },
    };
  }

  // ---------------- SECTION 10: SAFE CUSTOM REPORT BUILDER EXECUTION ----------------
  public executeCustomReport(
    reqBody: CustomReportExecutionRequest,
    user: ServerUser
  ): ReportDataset {
    const schema = BUILDER_DATA_SOURCES[reqBody.dataSource];
    if (!schema) {
      throw new Error(`Invalid report dataSource: ${reqBody.dataSource}`);
    }
    if (schema.restrictedToManagerAdmin && user.role === 'STAFF') {
      throw new Error('FORBIDDEN_FINANCIAL_REPORT');
    }

    const allowedFieldMap = new Map(schema.fields.map((f) => [f.key, f]));
    const selectedKeys = (reqBody.selectedFields ?? []).filter((k) => allowedFieldMap.has(k));
    if (selectedKeys.length === 0) {
      throw new Error('Select at least one valid database field.');
    }

    // Extract strictly structured rows from live stores (zero dynamic SQL)
    let rawRows: Array<Record<string, string | number | boolean | null>> = [];
    const isStaff = user.role === 'STAFF';

    if (reqBody.dataSource === 'CUSTOMERS') {
      rawRows = this.getScopedCustomers(user).map((c) => {
        const st = this.getCustomerFinancialStats(c.customerId);
        return {
          customerId: c.customerId,
          fullName: c.fullName,
          mobile: isStaff ? `XXXXXX${c.mobile.slice(-4)}` : c.mobile,
          village: c.village,
          policeStation: c.policeStation,
          pinCode: c.pinCode,
          segment: c.segment,
          status: c.status,
          verificationStatus: c.verificationStatus,
          applicationCount: st.appCount,
          totalPaid: st.netCollected,
          pendingBalance: st.due,
          createdAt: normalizeToIsoDate(c.createdAt),
        };
      });
    } else if (reqBody.dataSource === 'APPLICATIONS') {
      rawRows = this.getScopedApps(user).map((a) => {
        const paid = this.erp.payments
          .filter((p) => p.applicationNo === a.applicationNo && p.verificationStatus === 'Confirmed')
          .reduce((s, p) => s + p.amount, 0);
        const charge = a.status === 'Cancelled' || a.status === 'Rejected' ? 0 : a.serviceSnapshot.customerChargeSnapshot;
        return {
          applicationNo: a.applicationNo,
          financialYear: a.financialYear,
          customerId: a.customerId,
          customerName: a.customerSnapshot.fullName,
          serviceName: a.serviceSnapshot.name,
          assignedStaffId: a.assignedStaffId ?? 'Unassigned',
          counterCode: a.assignedCounterCode ?? 'CTR-01',
          status: a.status,
          serviceCharge: charge,
          serviceCost: isStaff ? 0 : a.serviceSnapshot.serviceCostSnapshot,
          netCollected: round2(paid),
          balanceDue: round2(Math.max(0, charge - paid)),
          createdAt: normalizeToIsoDate(a.createdAt),
        };
      });
    } else if (reqBody.dataSource === 'PAYMENTS') {
      rawRows = this.getScopedPayments(user).map((p) => ({
        receiptNo: p.receiptNo,
        applicationNo: p.applicationNo,
        customerName: p.customerName,
        serviceName: p.serviceName,
        paymentMethod: p.paymentMethod,
        counterCode: p.counterCode,
        collectedBy: p.collectedBy,
        verificationStatus: p.verificationStatus,
        amount: p.amount,
        recordedAt: normalizeToIsoDate(p.recordedAt),
      }));
    } else if (reqBody.dataSource === 'EXPENSES') {
      rawRows = this.erp.expenses.map((e) => ({
        voucherNo: e.voucherNo,
        category: e.category,
        description: e.description,
        counterCode: e.counterCode,
        recordedBy: e.recordedBy,
        status: e.status,
        amount: e.amount,
        expenseDate: normalizeToIsoDate(e.expenseDate),
      }));
    } else if (reqBody.dataSource === 'JOURNAL_VOUCHERS') {
      rawRows = this.getPostedVouchers().map((v) => ({
        voucherNo: v.voucherNo,
        entityCode: v.entityCode,
        fyCode: v.fyCode,
        voucherType: v.voucherType,
        status: v.status,
        narration: v.narration,
        totalDebit: v.totalDebit,
        totalCredit: v.totalCredit,
        voucherDate: normalizeToIsoDate(v.voucherDate),
      }));
    } else if (reqBody.dataSource === 'SERVICES') {
      rawRows = this.erp.services
        .filter((s) => !s.deletedAt)
        .map((s) => ({
          serviceCode: s.serviceCode,
          name: s.name,
          categoryName: s.categoryName,
          customerCharge: s.customerCharge,
          serviceCost: isStaff ? 0 : s.serviceCost,
          profitAmount: isStaff ? 0 : s.profitAmount,
          status: s.status,
        }));
    } else if (reqBody.dataSource === 'PRODUCTS_STOCK') {
      rawRows = this.finance.products.map((p) => {
        const qty = p.batches.reduce((s, b) => s + b.qtyRemaining, 0);
        const val = round2(p.batches.reduce((s, b) => s + b.qtyRemaining * b.unitCost, 0));
        return {
          sku: p.sku,
          name: p.name,
          category: p.category,
          valuationMethod: p.valuationMethod,
          qtyOnHand: qty,
          reorderLevel: p.reorderLevel,
          sellingPrice: p.sellingPrice,
          stockValue: val,
        };
      });
    } else if (reqBody.dataSource === 'EMPLOYEES_PAYROLL') {
      rawRows = this.finance.employees.map((e) => ({
        empCode: e.empId,
        fullName: e.fullName,
        designation: e.designation,
        department: e.department,
        basicSalary: e.basicSalary,
        allowances: e.allowances,
        pfDeduction: e.pfDeduction,
        tdsDeduction: e.tdsDeduction,
        netSalary: round2(e.basicSalary + e.allowances - e.pfDeduction - e.tdsDeduction),
        status: e.status,
      }));
    }

    // Validate & apply date range filter
    const dateField = reqBody.dateField && allowedFieldMap.has(reqBody.dateField)
      ? reqBody.dateField
      : schema.fields.find((f) => f.type === 'date')?.key;
    if (dateField && (reqBody.fromDate || reqBody.toDate)) {
      rawRows = rawRows.filter((r) => inDateRange(String(r[dateField] ?? ''), { fromDate: reqBody.fromDate, toDate: reqBody.toDate }));
    }

    // Validate & apply AND / OR filter rules
    const validFilters: CustomFilterRule[] = (reqBody.filters ?? []).filter((f) =>
      allowedFieldMap.has(f.field)
    );
    if (validFilters.length > 0) {
      const logic = reqBody.filterLogic === 'OR' ? 'OR' : 'AND';
      const evalRule = (row: Record<string, unknown>, rule: CustomFilterRule): boolean => {
        const cell = row[rule.field];
        const cellStr = String(cell ?? '').toLowerCase();
        const targetStr = String(rule.value ?? '').toLowerCase();
        const cellNum = Number(cell);
        const targetNum = Number(rule.value);
        switch (rule.operator) {
          case 'eq':
            return cellStr === targetStr;
          case 'neq':
            return cellStr !== targetStr;
          case 'contains':
            return cellStr.includes(targetStr);
          case 'gt':
            return !Number.isNaN(cellNum) && !Number.isNaN(targetNum) ? cellNum > targetNum : cellStr > targetStr;
          case 'gte':
            return !Number.isNaN(cellNum) && !Number.isNaN(targetNum) ? cellNum >= targetNum : cellStr >= targetStr;
          case 'lt':
            return !Number.isNaN(cellNum) && !Number.isNaN(targetNum) ? cellNum < targetNum : cellStr < targetStr;
          case 'lte':
            return !Number.isNaN(cellNum) && !Number.isNaN(targetNum) ? cellNum <= targetNum : cellStr <= targetStr;
          default:
            return true;
        }
      };
      rawRows = rawRows.filter((r) =>
        logic === 'AND' ? validFilters.every((f) => evalRule(r, f)) : validFilters.some((f) => evalRule(r, f))
      );
    }

    // Apply free-text search
    if (reqBody.search && reqBody.search.trim()) {
      const q = reqBody.search.trim().toLowerCase();
      rawRows = rawRows.filter((r) =>
        Object.values(r).some((v) => String(v ?? '').toLowerCase().includes(q))
      );
    }

    // Compute validated Calculated Columns
    const allowedSet = new Set(allowedFieldMap.keys());
    const calcCols: CalculatedColumnRule[] = (reqBody.calculatedColumns ?? []).filter(
      (c) => c.key && c.label && c.expression
    );
    for (const calc of calcCols) {
      for (const row of rawRows) {
        row[calc.key] = evaluateSafeFormula(calc.expression, row, allowedSet);
      }
    }

    // Sorting
    if (reqBody.sortByField && (allowedFieldMap.has(reqBody.sortByField) || calcCols.some((c) => c.key === reqBody.sortByField))) {
      const sf = reqBody.sortByField;
      const dir = reqBody.sortDirection === 'asc' ? 1 : -1;
      rawRows.sort((a, b) => {
        const av = a[sf];
        const bv = b[sf];
        if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
        return String(av ?? '').localeCompare(String(bv ?? '')) * dir;
      });
    }

    // Columns definition
    const columns: ReportColumnDef[] = [
      ...selectedKeys.map((k) => {
        const def = allowedFieldMap.get(k)!;
        return {
          key: def.key,
          label: def.label,
          type: def.type,
          align: def.type === 'currency' || def.type === 'number' ? ('right' as const) : ('left' as const),
          sensitive: def.sensitive,
        };
      }),
      ...calcCols.map((c) => ({
        key: c.key,
        label: c.label,
        type: c.format === 'currency' ? ('currency' as const) : ('number' as const),
        align: 'right' as const,
      })),
    ];

    // Group By Subtotals (if requested)
    let outputRows = rawRows.map((r) => {
      const rowOut: Record<string, string | number | boolean | null> = {};
      for (const col of columns) {
        let val = r[col.key] ?? null;
        if (col.type === 'date' && typeof val === 'string') {
          val = formatDateISTServer(val);
        }
        rowOut[col.key] = val;
      }
      return rowOut;
    });

    if (reqBody.groupByField && allowedFieldMap.has(reqBody.groupByField) && reqBody.includeSubtotals !== false) {
      const gk = reqBody.groupByField;
      const grouped = new Map<string, Array<Record<string, string | number | boolean | null>>>();
      for (const r of rawRows) {
        const gVal = String(r[gk] ?? 'Unspecified');
        const arr = grouped.get(gVal) ?? [];
        arr.push(r);
        grouped.set(gVal, arr);
      }
      const nextOut: Array<Record<string, string | number | boolean | null>> = [];
      for (const [gLabel, gItems] of grouped.entries()) {
        for (const item of gItems) {
          const rowOut: Record<string, string | number | boolean | null> = {};
          for (const col of columns) {
            let val = item[col.key] ?? null;
            if (col.type === 'date' && typeof val === 'string') val = formatDateISTServer(val);
            rowOut[col.key] = val;
          }
          nextOut.push(rowOut);
        }
        // Subtotal row
        const subRow: Record<string, string | number | boolean | null> = {};
        columns.forEach((col, idx) => {
          if (idx === 0) subRow[col.key] = `Subtotal (${gLabel} · ${gItems.length})`;
          else if (col.type === 'currency' || col.type === 'number') {
            subRow[col.key] = round2(gItems.reduce((s, it) => s + Number(it[col.key] ?? 0), 0));
          } else {
            subRow[col.key] = '';
          }
        });
        nextOut.push(subRow);
      }
      outputRows = nextOut;
    }

    // Grand totals
    const totals: Record<string, string | number> = { rowCount: rawRows.length };
    if (reqBody.includeGrandTotal !== false) {
      for (const col of columns) {
        if (col.type === 'currency' || col.type === 'number') {
          totals[col.key] = round2(rawRows.reduce((s, r) => s + Number(r[col.key] ?? 0), 0));
        }
      }
    }

    return {
      reportKey: `CUSTOM_${reqBody.dataSource}`,
      title: sanitizeText(reqBody.title || `Custom ${schema.label} Report`),
      subtitle: `${reqBody.filterLogic} filters (${validFilters.length}) · Group: ${reqBody.groupByField || 'None'}`,
      category: 'CUSTOM',
      financialYear: getFyFromIsoDate(new Date().toISOString().slice(0, 10)),
      dateRangeLabel:
        reqBody.fromDate || reqBody.toDate
          ? `${formatDateISTServer(reqBody.fromDate || '2026-04-01')} – ${formatDateISTServer(reqBody.toDate || new Date().toISOString().slice(0, 10))}`
          : 'All Dates',
      generatedAt: formatDateTimeISTServer(new Date()),
      generatedBy: user.userId,
      columns,
      rows: outputRows,
      totals,
      totalRowsBeforeLimit: rawRows.length,
    };
  }
}
