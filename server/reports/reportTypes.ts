import { RoleName } from '../types';

export type ReportCategoryKey =
  | 'CUSTOMER'
  | 'APPLICATION_SERVICE'
  | 'FINANCIAL'
  | 'BUSINESS_INVENTORY'
  | 'CSC_OPERATIONS'
  | 'CUSTOM';

export type ReportExportFormat = 'PDF' | 'XLSX' | 'CSV';

export interface ReportFilterInput {
  fromDate?: string; // YYYY-MM-DD
  toDate?: string; // YYYY-MM-DD
  financialYear?: string; // e.g. '2026-27'
  status?: string;
  location?: string; // village, ward, district, or PIN code
  customerId?: string;
  serviceId?: string;
  staffId?: string;
  paymentMethod?: string;
  search?: string;
  limit?: number;
  page?: number;
  perPage?: number;
}

export interface ReportColumnDef {
  key: string;
  label: string;
  labelBn?: string;
  type: 'text' | 'number' | 'currency' | 'date' | 'status';
  align?: 'left' | 'right' | 'center';
  sensitive?: boolean; // Masked or excluded for restricted roles
}

export interface ReportDataset {
  reportKey: string;
  title: string;
  titleBn?: string;
  subtitle: string;
  category: ReportCategoryKey;
  financialYear: string;
  dateRangeLabel: string;
  generatedAt: string;
  generatedBy: string;
  columns: ReportColumnDef[];
  rows: Array<Record<string, string | number | boolean | null>>;
  totals: Record<string, string | number>;
  summaryCards?: Array<{ label: string; value: string; note?: string }>;
  notes?: string[];
  totalRowsBeforeLimit: number;
}

export interface ReportCatalogItem {
  reportKey: string;
  title: string;
  titleBn: string;
  category: ReportCategoryKey;
  description: string;
  financialRestricted: boolean;
  requiresModule?: string;
  enabled: boolean;
}

export interface ReportingDashboardData {
  kpis: {
    totalReportsGenerated: number;
    dailyReportsCount: number;
    weeklyReportsCount: number;
    monthlyReportsCount: number;
    totalCustomers: number;
    activeCustomers: number;
    totalApplications: number;
    completedApplications: number;
    pendingApplications: number;
    rejectedOrCancelledApplications: number;
    applicationSuccessRatePct: number;
    totalIncome: number;
    totalExpenses: number;
    netProfit: number;
    totalCollections: number;
    outstandingCustomerDues: number;
    paymentBreakdown: {
      cash: number;
      upi: number;
      other: number;
    };
    growthIndicators: {
      customerGrowthPct: number;
      applicationGrowthPct: number;
      collectionGrowthPct: number;
      methodologyNote: string;
    };
  };
  staffPerformance: Array<{
    staffId: string;
    staffName: string;
    totalAssigned: number;
    completed: number;
    pending: number;
    overdue: number;
    completionRatePct: number;
    collectionsHandled: number;
  }>;
  recentReportsActivity: ReportAuditLogRecord[];
  enabledBusinessModules: Array<{
    key: string;
    label: string;
    enabled: boolean;
    reason: string;
  }>;
  financialYear: string;
}

export interface AnalyticsQueryInput {
  fromDate?: string;
  toDate?: string;
  granularity?: 'daily' | 'monthly' | 'quarterly' | 'yearly';
  category?: string;
  serviceId?: string;
  staffId?: string;
}

export interface AnalyticsSeriesPoint {
  label: string;
  value: number;
  secondaryValue?: number;
  tertiaryValue?: number;
  isEstimate?: boolean;
}

export interface AnalyticsDashboardPayload {
  granularity: 'daily' | 'monthly' | 'quarterly' | 'yearly';
  financialYear: string;
  dateRangeLabel: string;
  revenueGrowth: AnalyticsSeriesPoint[];
  incomeVsExpense: AnalyticsSeriesPoint[];
  profitTrend: AnalyticsSeriesPoint[];
  customerGrowth: AnalyticsSeriesPoint[];
  applicationSuccessRate: Array<{ status: string; count: number; pct: number }>;
  serviceWiseRevenue: Array<{ serviceId: string; serviceName: string; revenue: number; profit: number; count: number }>;
  monthlyCollectionComparison: AnalyticsSeriesPoint[];
  staffPerformanceComparison: Array<{ staffId: string; completed: number; active: number; collections: number }>;
  outstandingDueAnalysis: Array<{ bucket: string; customerCount: number; amountDue: number }>;
  financialYearComparison: Array<{ fyCode: string; income: number; expense: number; netProfit: number }>;
  top10Services: Array<{ serviceName: string; count: number; revenue: number }>;
  top10Customers: Array<{ customerId: string; customerName: string; village: string; paid: number; due: number; apps: number }>;
  businessGrowthForecast: {
    disclaimer: string;
    points: AnalyticsSeriesPoint[];
  };
}

export type CustomFilterOperator =
  | 'eq'
  | 'neq'
  | 'contains'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte';

export interface CustomFilterRule {
  field: string;
  operator: CustomFilterOperator;
  value: string;
}

export interface CalculatedColumnRule {
  key: string;
  label: string;
  expression: string; // e.g. "[totalPaid] - [totalDue]" validated strictly against allowlisted fields
  format: 'number' | 'currency' | 'percent';
}

export type BuilderDataSourceKey =
  | 'CUSTOMERS'
  | 'APPLICATIONS'
  | 'PAYMENTS'
  | 'EXPENSES'
  | 'JOURNAL_VOUCHERS'
  | 'SERVICES'
  | 'PRODUCTS_STOCK'
  | 'EMPLOYEES_PAYROLL';

export interface CustomReportTemplate {
  id: number;
  templateCode: string;
  name: string;
  description: string;
  category: ReportCategoryKey;
  dataSource: BuilderDataSourceKey;
  selectedFields: string[];
  filters: CustomFilterRule[];
  filterLogic: 'AND' | 'OR';
  groupByField: string;
  sortByField: string;
  sortDirection: 'asc' | 'desc';
  calculatedColumns: CalculatedColumnRule[];
  includeSubtotals: boolean;
  includeGrandTotal: boolean;
  roleScope: 'ADMIN' | 'MANAGER' | 'ALL_PERMITTED';
  versionNo: number;
  createdBy: string;
  updatedBy: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomReportExecutionRequest {
  dataSource: BuilderDataSourceKey;
  selectedFields: string[];
  filters: CustomFilterRule[];
  filterLogic: 'AND' | 'OR';
  dateField?: string;
  fromDate?: string;
  toDate?: string;
  groupByField?: string;
  sortByField?: string;
  sortDirection?: 'asc' | 'desc';
  search?: string;
  calculatedColumns?: CalculatedColumnRule[];
  includeSubtotals?: boolean;
  includeGrandTotal?: boolean;
  title?: string;
}

export interface ScheduledReportRecord {
  id: number;
  scheduleCode: string;
  name: string;
  reportKey: string;
  templateCode?: string;
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'FINANCIAL_YEAR';
  exportFormat: 'PDF' | 'EXCEL' | 'BOTH';
  language: 'en' | 'bn';
  channels: Array<'INTERNAL' | 'EMAIL_SMTP' | 'WHATSAPP'>;
  recipients: string[];
  filters: ReportFilterInput;
  runTimeIst: string;
  nextRunAt: string;
  lastRunAt: string | null;
  lastStatus: 'NEVER_RUN' | 'SUCCESS' | 'PARTIAL' | 'FAILED';
  retryLimit: number;
  enabled: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleRunRecord {
  id: number;
  runCode: string;
  scheduleCode: string;
  scheduleName: string;
  attemptNo: number;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'RETRYING';
  archiveCodes: string[];
  deliveryResults: Array<{
    channel: 'INTERNAL' | 'EMAIL_SMTP' | 'WHATSAPP';
    status: 'Delivered' | 'Not Configured' | 'Failed' | 'Skipped';
    detail: string;
  }>;
  errorMessage?: string;
  triggeredBy: string;
  startedAt: string;
  completedAt: string;
}

export interface ReportArchiveRecord {
  id: number;
  archiveCode: string;
  reportKey: string;
  reportTitle: string;
  category: ReportCategoryKey;
  financialYear: string;
  exportFormat: ReportExportFormat;
  versionNo: number;
  rowCount: number;
  filtersSnapshot: Record<string, unknown>;
  checksumSha256: string;
  storageFileName: string;
  fileSizeBytes: number;
  passwordProtected: boolean;
  retentionDays: number;
  retentionUntil: string;
  deletionStatus: 'ACTIVE' | 'PENDING_ADMIN_APPROVAL' | 'DELETED';
  deletionRequestedBy: string | null;
  deletionReason: string | null;
  deletionApprovedBy: string | null;
  generatedBy: string;
  generatedRole: RoleName;
  createdAt: string;
}

export interface ReportAuditLogRecord {
  id: number;
  actorUserId: string;
  actorRole: RoleName;
  action:
    | 'GENERATE_REPORT'
    | 'EXPORT_PDF'
    | 'EXPORT_COMBINED_PDF'
    | 'EXPORT_EXCEL'
    | 'EXPORT_CSV'
    | 'PRINT_REPORT'
    | 'ARCHIVE_SAVE'
    | 'ARCHIVE_DOWNLOAD'
    | 'ARCHIVE_REPRINT'
    | 'ARCHIVE_DELETE_REQUEST'
    | 'ARCHIVE_DELETE_APPROVE'
    | 'ARCHIVE_DELETE_REJECT'
    | 'TEMPLATE_CREATE'
    | 'TEMPLATE_UPDATE'
    | 'TEMPLATE_DUPLICATE'
    | 'TEMPLATE_DELETE'
    | 'SCHEDULE_CREATE'
    | 'SCHEDULE_UPDATE'
    | 'SCHEDULE_RUN'
    | 'SCHEDULE_RETRY'
    | 'UNAUTHORIZED_ACCESS';
  reportName: string;
  reportCategory: string;
  filtersSnapshot: Record<string, unknown>;
  dateRangeLabel: string;
  exportFormat: string;
  status: 'SUCCESS' | 'FAILURE' | 'BLOCKED';
  beforeState?: unknown;
  afterState?: unknown;
  ipAddress: string;
  createdAt: string;
}

export interface PdfExportOptions {
  reportKey?: string;
  reportKeys?: string[];
  filters?: ReportFilterInput;
  customExecution?: CustomReportExecutionRequest;
  pageSize?: 'A4' | 'A5' | 'CUSTOM';
  orientation?: 'portrait' | 'landscape';
  customWidthMm?: number;
  customHeightMm?: number;
  includeWatermark?: boolean;
  watermarkText?: string;
  includeLogo?: boolean;
  includeSignature?: boolean;
  includeStamp?: boolean;
  language?: 'en' | 'bn';
  password?: string;
  selectedRowIds?: string[];
  saveToArchive?: boolean;
}

export interface ExcelExportOptions {
  reportKey?: string;
  filters?: ReportFilterInput;
  customExecution?: CustomReportExecutionRequest;
  format?: 'xlsx' | 'csv';
  includeSummarySheet?: boolean;
  includePivotSheet?: boolean;
  includeChartSheet?: boolean;
  language?: 'en' | 'bn';
  selectedRowIds?: string[];
  saveToArchive?: boolean;
}
