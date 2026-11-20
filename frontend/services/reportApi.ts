import { getAuthToken, securityRequest } from './securityApi';

export type ReportCategoryKey =
  | 'CUSTOMER'
  | 'APPLICATION_SERVICE'
  | 'FINANCIAL'
  | 'BUSINESS_INVENTORY'
  | 'CSC_OPERATIONS'
  | 'CUSTOM';

export interface ReportFilterInput {
  fromDate?: string;
  toDate?: string;
  financialYear?: string;
  status?: string;
  location?: string;
  customerId?: string;
  serviceId?: string;
  staffId?: string;
  paymentMethod?: string;
  search?: string;
  limit?: number;
}

export interface ReportColumnDef {
  key: string;
  label: string;
  labelBn?: string;
  type: 'text' | 'number' | 'currency' | 'date' | 'status';
  align?: 'left' | 'right' | 'center';
  sensitive?: boolean;
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

export interface ReportAuditLogItem {
  id: number;
  actorUserId: string;
  actorRole: string;
  action: string;
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
  recentReportsActivity: ReportAuditLogItem[];
  enabledBusinessModules: Array<{
    key: string;
    label: string;
    enabled: boolean;
    reason: string;
  }>;
  financialYear: string;
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

export type BuilderDataSourceKey =
  | 'CUSTOMERS'
  | 'APPLICATIONS'
  | 'PAYMENTS'
  | 'EXPENSES'
  | 'JOURNAL_VOUCHERS'
  | 'SERVICES'
  | 'PRODUCTS_STOCK'
  | 'EMPLOYEES_PAYROLL';

export interface BuilderFieldSchema {
  key: string;
  label: string;
  type: 'text' | 'number' | 'currency' | 'date' | 'status';
  sensitive?: boolean;
}

export interface BuilderDataSourceSchema {
  key: BuilderDataSourceKey;
  label: string;
  fields: BuilderFieldSchema[];
}

export interface CustomFilterRule {
  field: string;
  operator: 'eq' | 'neq' | 'contains' | 'gt' | 'gte' | 'lt' | 'lte';
  value: string;
}

export interface CalculatedColumnRule {
  key: string;
  label: string;
  expression: string;
  format: 'number' | 'currency' | 'percent';
}

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

export interface ScheduledReportItem {
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
  runTimeIst: string;
  nextRunAt: string;
  lastRunAt: string | null;
  lastStatus: 'NEVER_RUN' | 'SUCCESS' | 'PARTIAL' | 'FAILED';
  retryLimit: number;
  enabled: boolean;
  createdBy: string;
}

export interface ScheduleRunItem {
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

export interface ReportArchiveItem {
  id: number;
  archiveCode: string;
  reportKey: string;
  reportTitle: string;
  category: ReportCategoryKey;
  financialYear: string;
  exportFormat: 'PDF' | 'XLSX' | 'CSV';
  versionNo: number;
  rowCount: number;
  checksumSha256: string;
  fileSizeBytes: number;
  passwordProtected: boolean;
  retentionDays: number;
  retentionUntil: string;
  deletionStatus: 'ACTIVE' | 'PENDING_ADMIN_APPROVAL' | 'DELETED';
  deletionRequestedBy: string | null;
  deletionReason: string | null;
  deletionApprovedBy: string | null;
  generatedBy: string;
  generatedRole: string;
  createdAt: string;
}

function readCsrfCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)mun_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function fetchBinaryDownload(
  url: string,
  method: 'GET' | 'POST',
  body: unknown | undefined,
  fallbackFilename: string
): Promise<{ archiveCode: string | null; blob: Blob; filename: string }> {
  const csrf = readCsrfCookie();
  const authToken = getAuthToken();
  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers: {
      ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(csrf && method !== 'GET' ? { 'X-CSRF-Token': csrf } : {}),
    },
    ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
  });

  if (!res.ok) {
    let msg = `Download failed (${res.status})`;
    try {
      const json = await res.json();
      if (json?.message) msg = json.message;
    } catch {
      // ignore non-json
    }
    throw new Error(msg);
  }

  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = /filename="([^"]+)"/.exec(disposition);
  const filename = match?.[1] || fallbackFilename;
  const archiveCode = res.headers.get('X-Archive-Code');
  triggerBlobDownload(blob, filename);
  return { archiveCode, blob, filename };
}

export const reportApi = {
  getDashboard(filters?: ReportFilterInput) {
    const q = new URLSearchParams();
    if (filters?.fromDate) q.set('fromDate', filters.fromDate);
    if (filters?.toDate) q.set('toDate', filters.toDate);
    if (filters?.financialYear) q.set('financialYear', filters.financialYear);
    const qs = q.toString();
    return securityRequest<ReportingDashboardData>(`/api/v1/reports/dashboard${qs ? `?${qs}` : ''}`);
  },

  getCatalog() {
    return securityRequest<ReportCatalogItem[]>('/api/v1/reports/catalog');
  },

  generateReport(reportKey: string, filters: ReportFilterInput = {}) {
    return securityRequest<ReportDataset>('/api/v1/reports/generate', {
      method: 'POST',
      body: JSON.stringify({ reportKey, filters }),
    });
  },

  getAnalytics(params: {
    fromDate?: string;
    toDate?: string;
    granularity?: 'daily' | 'monthly' | 'quarterly' | 'yearly';
    serviceId?: string;
    staffId?: string;
  }) {
    const q = new URLSearchParams();
    if (params.fromDate) q.set('fromDate', params.fromDate);
    if (params.toDate) q.set('toDate', params.toDate);
    if (params.granularity) q.set('granularity', params.granularity);
    if (params.serviceId) q.set('serviceId', params.serviceId);
    if (params.staffId) q.set('staffId', params.staffId);
    return securityRequest<AnalyticsDashboardPayload>(`/api/v1/reports/analytics?${q.toString()}`);
  },

  getBuilderSchemas() {
    return securityRequest<BuilderDataSourceSchema[]>('/api/v1/reports/builder/schema');
  },

  executeCustomReport(payload: CustomReportExecutionRequest) {
    return securityRequest<ReportDataset>('/api/v1/reports/builder/execute', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  listTemplates() {
    return securityRequest<CustomReportTemplate[]>('/api/v1/reports/templates');
  },

  createTemplate(payload: Partial<CustomReportTemplate>) {
    return securityRequest<CustomReportTemplate>('/api/v1/reports/templates', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateTemplate(code: string, payload: Partial<CustomReportTemplate>) {
    return securityRequest<CustomReportTemplate>(`/api/v1/reports/templates/${encodeURIComponent(code)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  duplicateTemplate(code: string) {
    return securityRequest<CustomReportTemplate>(
      `/api/v1/reports/templates/${encodeURIComponent(code)}/duplicate`,
      { method: 'POST', body: '{}' }
    );
  },

  deleteTemplate(code: string) {
    return securityRequest<{ deleted: boolean }>(
      `/api/v1/reports/templates/${encodeURIComponent(code)}`,
      { method: 'DELETE' }
    );
  },

  async exportPdf(payload: Record<string, unknown>, fallbackFilename = 'MUN_Report.pdf') {
    return fetchBinaryDownload('/api/v1/reports/export/pdf', 'POST', payload, fallbackFilename);
  },

  async exportExcel(payload: Record<string, unknown>, fallbackFilename = 'MUN_Report.xlsx') {
    return fetchBinaryDownload('/api/v1/reports/export/excel', 'POST', payload, fallbackFilename);
  },

  logPrint(payload: {
    reportKey: string;
    reportName: string;
    reportCategory: string;
    pageSize: string;
    orientation: string;
    copies: number;
    scope: string;
    dateRangeLabel: string;
  }) {
    return securityRequest<ReportAuditLogItem>('/api/v1/reports/print-log', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getSchedules() {
    return securityRequest<{ schedules: ScheduledReportItem[]; runs: ScheduleRunItem[] }>(
      '/api/v1/reports/schedules'
    );
  },

  createSchedule(payload: Partial<ScheduledReportItem> & { filters?: ReportFilterInput }) {
    return securityRequest<ScheduledReportItem>('/api/v1/reports/schedules', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateSchedule(code: string, payload: Partial<ScheduledReportItem>) {
    return securityRequest<ScheduledReportItem>(`/api/v1/reports/schedules/${encodeURIComponent(code)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  runScheduleNow(code: string) {
    return securityRequest<ScheduleRunItem>(`/api/v1/reports/schedules/${encodeURIComponent(code)}/run`, {
      method: 'POST',
      body: '{}',
    });
  },

  retryScheduleRun(runCode: string) {
    return securityRequest<ScheduleRunItem>(
      `/api/v1/reports/schedule-runs/${encodeURIComponent(runCode)}/retry`,
      { method: 'POST', body: '{}' }
    );
  },

  listArchives(params?: { search?: string; financialYear?: string; category?: string }) {
    const q = new URLSearchParams();
    if (params?.search) q.set('search', params.search);
    if (params?.financialYear) q.set('financialYear', params.financialYear);
    if (params?.category) q.set('category', params.category);
    const qs = q.toString();
    return securityRequest<ReportArchiveItem[]>(`/api/v1/reports/archives${qs ? `?${qs}` : ''}`);
  },

  async downloadArchive(archiveCode: string, fallbackName: string) {
    return fetchBinaryDownload(
      `/api/v1/reports/archives/${encodeURIComponent(archiveCode)}/download`,
      'GET',
      undefined,
      fallbackName
    );
  },

  reprintArchive(archiveCode: string) {
    return securityRequest<ReportAuditLogItem>(
      `/api/v1/reports/archives/${encodeURIComponent(archiveCode)}/reprint`,
      { method: 'POST', body: '{}' }
    );
  },

  requestArchiveDeletion(archiveCode: string, reason: string) {
    return securityRequest<ReportArchiveItem>(
      `/api/v1/reports/archives/${encodeURIComponent(archiveCode)}/delete-request`,
      { method: 'POST', body: JSON.stringify({ reason }) }
    );
  },

  reviewArchiveDeletion(archiveCode: string, decision: 'APPROVE' | 'REJECT') {
    return securityRequest<ReportArchiveItem>(
      `/api/v1/reports/archives/${encodeURIComponent(archiveCode)}/delete-review`,
      { method: 'POST', body: JSON.stringify({ decision }) }
    );
  },

  listAuditLogs(params?: { action?: string; search?: string }) {
    const q = new URLSearchParams();
    if (params?.action) q.set('action', params.action);
    if (params?.search) q.set('search', params.search);
    const qs = q.toString();
    return securityRequest<ReportAuditLogItem[]>(`/api/v1/reports/audit-logs${qs ? `?${qs}` : ''}`);
  },
};
