import { getAuthToken, securityRequest } from './securityApi';

export type QaEnvironmentKey = 'DEVELOPMENT' | 'TESTING' | 'STAGING' | 'PRODUCTION';
export type QaCaseStatus = 'PENDING' | 'PASSED' | 'FAILED' | 'BLOCKED';
export type QaPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type BugPriority = 'Critical' | 'High' | 'Medium' | 'Low';
export type BugCategory =
  | 'Functional'
  | 'UI'
  | 'Database'
  | 'API'
  | 'Security'
  | 'Performance'
  | 'Financial Calculation'
  | 'Integration'
  | 'Compatibility';
export type BugStatus =
  | 'New'
  | 'Assigned'
  | 'In Progress'
  | 'Fixed'
  | 'Ready for Retest'
  | 'Verified'
  | 'Closed'
  | 'Reopened';
export type ReleaseReadinessStatus =
  | 'NOT_READY'
  | 'TESTING_IN_PROGRESS'
  | 'BLOCKED'
  | 'READY_FOR_ADMIN_APPROVAL'
  | 'APPROVED'
  | 'RELEASED';

export interface QaEnvironmentConfig {
  envKey: QaEnvironmentKey;
  displayName: string;
  appUrl: string;
  dbSchemaName: string;
  allowAutomatedTests: boolean;
  allowDestructiveDrills: boolean;
  credentialsIsolated: boolean;
  healthStatus: 'HEALTHY' | 'WARNING' | 'DOWN';
  lastCheckedAt: string;
  updatedBy: string;
}

export interface QaTestSuiteDef {
  suiteCode: string;
  suiteName: string;
  testType: string;
  targetPhase: string;
  description: string;
  isCritical: boolean;
  createdAt: string;
}

export interface QaTestCaseDef {
  caseCode: string;
  suiteCode: string;
  moduleName: string;
  targetPhase: string;
  testType: string;
  polarity: string;
  priority: QaPriority;
  title: string;
  preconditions: string;
  steps: string[];
  expectedResult: string;
  automationKey: string | null;
  isAutomated: boolean;
  lastStatus: QaCaseStatus;
  lastExecutedAt: string | null;
  lastExecutedBy: string | null;
}

export interface QaTestExecutionBatch {
  executionCode: string;
  envKey: QaEnvironmentKey;
  triggerSource: 'MANUAL_UI' | 'AUTOMATED_SUITE' | 'REGRESSION' | 'CI_CD_PIPELINE';
  suiteFilter: string;
  executedBy: string;
  totalCases: number;
  passedCount: number;
  failedCount: number;
  blockedCount: number;
  durationMs: number;
  status: 'RUNNING' | 'COMPLETED' | 'ABORTED';
  startedAt: string;
  completedAt: string;
}

export interface QaTestResultRecord {
  resultCode: string;
  executionCode: string;
  caseCode: string;
  suiteCode: string;
  moduleName: string;
  targetPhase: string;
  severity: QaPriority;
  status: 'PASSED' | 'FAILED' | 'BLOCKED';
  durationMs: number;
  actualResult: string;
  evidence: Record<string, unknown>;
  executedBy: string;
  executedAt: string;
}

export interface QaBugReport {
  bugCode: string;
  title: string;
  category: BugCategory;
  priority: BugPriority;
  status: BugStatus;
  moduleName: string;
  relatedCaseCode: string | null;
  envKey: QaEnvironmentKey;
  description: string;
  reproductionSteps: string;
  expectedResult: string;
  actualResult: string;
  evidenceRef: string | null;
  assignedDeveloper: string | null;
  reportedBy: string;
  resolutionNotes: string | null;
  fixedAt: string | null;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  retestHistory: Array<{
    testedAt: string;
    testedBy: string;
    outcome: 'PASSED' | 'FAILED';
    notes: string;
  }>;
  history: Array<{
    previousStatus: BugStatus | null;
    newStatus: BugStatus;
    actorUserId: string;
    notes: string;
    createdAt: string;
  }>;
}

export interface QaSecurityFinding {
  findingCode: string;
  owaspCategory: string;
  testArea: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';
  status: 'VERIFIED_SECURE' | 'OPEN_VULNERABILITY' | 'REMEDIATED' | 'RETESTED_PASS';
  riskAssessment: string;
  evidence: string;
  remediationNotes: string | null;
  testedBy: string;
  testedAt: string;
  retestedAt: string | null;
}

export interface QaPerformanceResult {
  benchmarkCode: string;
  scenarioName: string;
  testType: string;
  concurrentUsers: number;
  totalRequests: number;
  targetThresholdMs: number;
  avgResponseMs: number;
  p95ResponseMs: number;
  throughputRps: number;
  errorRatePct: number;
  memoryRssMb: number;
  passed: boolean;
  executedBy: string;
  executedAt: string;
}

export interface QaFinancialReconciliationRecord {
  reconciliationCode: string;
  envKey: QaEnvironmentKey;
  financialYear: string;
  trialBalanceDebit: number;
  trialBalanceCredit: number;
  balanceSheetDiff: number;
  pnlNetProfit: number;
  cashbookExpected: number;
  cashbookActual: number;
  outstandingDuesTotal: number;
  cspSegregationValid: boolean;
  inrRoundingValid: boolean;
  duplicateVouchersCount: number;
  mismatchCount: number;
  status: 'RECONCILED' | 'MISMATCH_BLOCKED';
  checks: Array<{
    checkName: string;
    expected: string;
    actual: string;
    passed: boolean;
  }>;
  executedBy: string;
  executedAt: string;
}

export interface QaBackupDrillRecord {
  drillCode: string;
  drillScope: 'FULL' | 'CUSTOMERS' | 'FINANCE' | 'CONFIGURATION' | 'DOCUMENTS' | 'REPORT_ARCHIVES';
  scheduleTested: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'FINANCIAL_YEAR';
  backupCodeVerified: string;
  checksumVerified: boolean;
  hmacVerified: boolean;
  encryptionVerified: boolean;
  keyRotationVerified: boolean;
  duplicatePreventionVerified: boolean;
  balanceSheetPostRestoreOk: boolean;
  recoveryTimeMs: number;
  recoveryPointLoss: number;
  status: 'PASSED' | 'FAILED';
  notes: string;
  executedBy: string;
  executedAt: string;
}

export interface QaRegressionRunRecord {
  regressionCode: string;
  triggerReason: string;
  affectedModules: string[];
  totalCases: number;
  passedCount: number;
  failedCount: number;
  status: 'PASSED' | 'FAILED';
  executedBy: string;
  executedAt: string;
}

export interface QaUatSessionRecord {
  uatCode: string;
  testerUserId: string;
  testerRole: 'ADMIN' | 'MANAGER' | 'STAFF';
  workflowName: string;
  casesVerified: number;
  feedback: string;
  acceptanceStatus: 'PENDING' | 'ACCEPTED' | 'CHANGES_REQUESTED';
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
}

export interface QaBrowserCompatibilityRecord {
  matrixCode: string;
  osPlatform: 'Windows' | 'macOS' | 'Linux' | 'Android' | 'iOS';
  browserName: 'Google Chrome' | 'Microsoft Edge' | 'Mozilla Firefox' | 'Apple Safari';
  deviceType: 'Desktop' | 'Laptop' | 'Tablet' | 'Android Mobile' | 'iPhone';
  viewport: string;
  verifiedItems: string[];
  bengaliFontsOk: boolean;
  pdfPrintOk: boolean;
  responsiveOk: boolean;
  verificationMode: 'AUTOMATED_DOM_CHECK' | 'MANUAL_QA_CHECK' | 'PENDING_DEVICE_LAB';
  status: 'PENDING' | 'PASSED' | 'FAILED';
  notes: string;
  testedBy: string;
  testedAt: string;
}

export interface QaReleaseReadinessSummary {
  releaseVersion: string;
  releaseStatus: ReleaseReadinessStatus;
  canApprove: boolean;
  gates: {
    criticalTestsExecutedAndPassed: boolean;
    noCriticalOrHighOpenBugs: boolean;
    noUnresolvedHighSecurityVulns: boolean;
    financialReconciliationPassed: boolean;
    backupRestoreDrillPassed: boolean;
    regressionPassed: boolean;
    uatApprovedByRoles: boolean;
    buildVerificationRecorded: boolean;
  };
  blockers: string[];
  latestApproval: {
    releaseCode: string;
    releaseVersion: string;
    releaseStatus: ReleaseReadinessStatus;
    releaseNotes: string;
    approvedBy: string | null;
    approvedAt: string | null;
  } | null;
  releaseHistory: Array<{
    releaseCode: string;
    releaseVersion: string;
    action: string;
    actorUserId: string;
    summary: string;
    createdAt: string;
  }>;
}

export interface QaDashboardOverview {
  totals: {
    totalTestCases: number;
    executedCases: number;
    passedCases: number;
    failedCases: number;
    blockedCases: number;
    pendingCases: number;
    passPercentage: number;
    failedPercentage: number;
    criticalBugs: number;
    highBugs: number;
    mediumBugs: number;
    lowBugs: number;
    openVulnerabilities: number;
    performanceIssues: number;
    regressionStatus: 'NOT_RUN' | 'PASSED' | 'FAILED';
    uatApprovalStatus: 'PENDING' | 'PARTIAL' | 'APPROVED';
    releaseReadinessStatus: ReleaseReadinessStatus;
  };
  moduleBreakdown: Array<{
    moduleName: string;
    total: number;
    passed: number;
    failed: number;
    blocked: number;
    pending: number;
    qualityScorePct: number;
  }>;
  phaseBreakdown: Array<{
    targetPhase: string;
    total: number;
    passed: number;
    failed: number;
    blocked: number;
    pending: number;
  }>;
  recentExecutions: QaTestExecutionBatch[];
  releaseReadiness: QaReleaseReadinessSummary;
}

function readCsrfCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)mun_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function downloadQaBinary(
  url: string,
  language: 'en' | 'bn',
  fallbackFilename: string
): Promise<string> {
  const csrf = readCsrfCookie();
  const authToken = getAuthToken();
  const res = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
    },
    body: JSON.stringify({ language }),
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
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
  return filename;
}

export const phase09Api = {
  getDashboard(filters?: {
    fromDate?: string;
    toDate?: string;
    testerUserId?: string;
    severity?: string;
  }) {
    const q = new URLSearchParams();
    if (filters?.fromDate) q.set('fromDate', filters.fromDate);
    if (filters?.toDate) q.set('toDate', filters.toDate);
    if (filters?.testerUserId) q.set('testerUserId', filters.testerUserId);
    if (filters?.severity && filters.severity !== 'ALL') q.set('severity', filters.severity);
    const qs = q.toString();
    return securityRequest<QaDashboardOverview>(`/api/v1/qa/dashboard${qs ? `?${qs}` : ''}`);
  },

  getEnvironments() {
    return securityRequest<QaEnvironmentConfig[]>('/api/v1/qa/environments');
  },

  updateEnvironment(
    envKey: QaEnvironmentKey,
    payload: Partial<Pick<QaEnvironmentConfig, 'allowAutomatedTests' | 'allowDestructiveDrills' | 'appUrl'>>
  ) {
    return securityRequest<QaEnvironmentConfig>(`/api/v1/qa/environments/${encodeURIComponent(envKey)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  getSuites() {
    return securityRequest<QaTestSuiteDef[]>('/api/v1/qa/suites');
  },

  getTestCases(params?: { suiteCode?: string; status?: string; priority?: string; search?: string }) {
    const q = new URLSearchParams();
    if (params?.suiteCode) q.set('suiteCode', params.suiteCode);
    if (params?.status) q.set('status', params.status);
    if (params?.priority) q.set('priority', params.priority);
    if (params?.search) q.set('search', params.search);
    const qs = q.toString();
    return securityRequest<QaTestCaseDef[]>(`/api/v1/qa/test-cases${qs ? `?${qs}` : ''}`);
  },

  createTestCase(payload: {
    suiteCode: string;
    moduleName: string;
    targetPhase: string;
    testType: string;
    polarity: string;
    priority: QaPriority;
    title: string;
    preconditions: string;
    steps: string[];
    expectedResult: string;
  }) {
    return securityRequest<QaTestCaseDef>('/api/v1/qa/test-cases', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getExecutions() {
    return securityRequest<{ batches: QaTestExecutionBatch[]; results: QaTestResultRecord[] }>(
      '/api/v1/qa/executions'
    );
  },

  executeSuite(payload: {
    envKey: QaEnvironmentKey;
    suiteCode?: string;
    caseCodes?: string[];
    triggerSource?: 'MANUAL_UI' | 'AUTOMATED_SUITE' | 'REGRESSION' | 'CI_CD_PIPELINE';
  }) {
    return securityRequest<{
      batch: QaTestExecutionBatch;
      results: QaTestResultRecord[];
      securityFindingsAdded?: number;
      performanceResultsAdded?: number;
      financialReconciliation?: QaFinancialReconciliationRecord;
      backupDrill?: QaBackupDrillRecord;
    }>('/api/v1/qa/execute', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  recordManualCaseResult(
    caseCode: string,
    payload: { status: 'PASSED' | 'FAILED' | 'BLOCKED'; actualResult: string; envKey: QaEnvironmentKey }
  ) {
    return securityRequest<QaTestResultRecord>(
      `/api/v1/qa/test-cases/${encodeURIComponent(caseCode)}/manual-result`,
      { method: 'POST', body: JSON.stringify(payload) }
    );
  },

  getBugs(params?: { priority?: string; status?: string; category?: string }) {
    const q = new URLSearchParams();
    if (params?.priority) q.set('priority', params.priority);
    if (params?.status) q.set('status', params.status);
    if (params?.category) q.set('category', params.category);
    const qs = q.toString();
    return securityRequest<{
      bugs: QaBugReport[];
      notifications: Array<{ id: number; bugCode: string; message: string; recipientUserId: string; createdAt: string }>;
    }>(`/api/v1/qa/bugs${qs ? `?${qs}` : ''}`);
  },

  createBug(payload: {
    title: string;
    category: BugCategory;
    priority: BugPriority;
    moduleName: string;
    relatedCaseCode?: string;
    envKey: QaEnvironmentKey;
    description: string;
    reproductionSteps: string;
    expectedResult: string;
    actualResult: string;
    assignedDeveloper?: string;
  }) {
    return securityRequest<QaBugReport>('/api/v1/qa/bugs', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateBug(
    bugCode: string,
    payload: {
      status?: BugStatus;
      assignedDeveloper?: string | null;
      resolutionNotes?: string;
      retestOutcome?: 'PASSED' | 'FAILED';
    }
  ) {
    return securityRequest<QaBugReport>(`/api/v1/qa/bugs/${encodeURIComponent(bugCode)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  getRegressionRuns() {
    return securityRequest<QaRegressionRunRecord[]>('/api/v1/qa/regression');
  },

  runRegression(payload: { triggerReason: string; affectedModules: string[]; envKey: QaEnvironmentKey }) {
    return securityRequest<QaRegressionRunRecord>('/api/v1/qa/regression/run', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getSecurityFindings() {
    return securityRequest<QaSecurityFinding[]>('/api/v1/qa/security-findings');
  },

  runSecurityAudit() {
    return securityRequest<QaSecurityFinding[]>('/api/v1/qa/security-audit/run', {
      method: 'POST',
      body: '{}',
    });
  },

  updateSecurityFinding(
    findingCode: string,
    payload: { status: QaSecurityFinding['status']; remediationNotes?: string }
  ) {
    return securityRequest<QaSecurityFinding>(
      `/api/v1/qa/security-findings/${encodeURIComponent(findingCode)}`,
      { method: 'PATCH', body: JSON.stringify(payload) }
    );
  },

  getPerformanceResults() {
    return securityRequest<QaPerformanceResult[]>('/api/v1/qa/performance');
  },

  runPerformanceBenchmarks() {
    return securityRequest<QaPerformanceResult[]>('/api/v1/qa/performance/run', {
      method: 'POST',
      body: '{}',
    });
  },

  getBrowserMatrix() {
    return securityRequest<QaBrowserCompatibilityRecord[]>('/api/v1/qa/browser-matrix');
  },

  updateBrowserMatrix(
    matrixCode: string,
    payload: Partial<
      Pick<
        QaBrowserCompatibilityRecord,
        'bengaliFontsOk' | 'pdfPrintOk' | 'responsiveOk' | 'status' | 'verificationMode' | 'notes'
      >
    >
  ) {
    return securityRequest<QaBrowserCompatibilityRecord>(
      `/api/v1/qa/browser-matrix/${encodeURIComponent(matrixCode)}`,
      { method: 'PATCH', body: JSON.stringify(payload) }
    );
  },

  getFinancialReconciliations() {
    return securityRequest<QaFinancialReconciliationRecord[]>('/api/v1/qa/financial-reconciliation');
  },

  runFinancialReconciliation(envKey: QaEnvironmentKey) {
    return securityRequest<QaFinancialReconciliationRecord>('/api/v1/qa/financial-reconciliation/run', {
      method: 'POST',
      body: JSON.stringify({ envKey }),
    });
  },

  getBackupDrills() {
    return securityRequest<QaBackupDrillRecord[]>('/api/v1/qa/backup-drills');
  },

  runBackupDrill(payload: {
    envKey: QaEnvironmentKey;
    drillScope: QaBackupDrillRecord['drillScope'];
    scheduleTested: QaBackupDrillRecord['scheduleTested'];
  }) {
    return securityRequest<QaBackupDrillRecord>('/api/v1/qa/backup-drills/run', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getUatSessions() {
    return securityRequest<QaUatSessionRecord[]>('/api/v1/qa/uat');
  },

  submitUatSession(payload: {
    testerRole?: 'ADMIN' | 'MANAGER' | 'STAFF';
    workflowName: string;
    casesVerified: number;
    feedback: string;
    acceptanceStatus?: 'PENDING' | 'ACCEPTED' | 'CHANGES_REQUESTED';
  }) {
    return securityRequest<QaUatSessionRecord>('/api/v1/qa/uat', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  reviewUatSession(
    uatCode: string,
    payload: { acceptanceStatus: 'ACCEPTED' | 'CHANGES_REQUESTED' | 'PENDING'; feedback?: string }
  ) {
    return securityRequest<QaUatSessionRecord>(`/api/v1/qa/uat/${encodeURIComponent(uatCode)}/review`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  getReleaseReadiness() {
    return securityRequest<QaReleaseReadinessSummary>('/api/v1/qa/release/readiness');
  },

  approveRelease(payload: { releaseVersion: string; releaseNotes: string; markReleased?: boolean }) {
    return securityRequest<QaReleaseReadinessSummary>('/api/v1/qa/release/approve', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async downloadPdfReport(language: 'en' | 'bn') {
    return downloadQaBinary(
      '/api/v1/qa/reports/pdf',
      language,
      `MUN_Phase09_QA_Report_${language.toUpperCase()}.pdf`
    );
  },

  async downloadExcelWorkbook(language: 'en' | 'bn') {
    return downloadQaBinary(
      '/api/v1/qa/reports/excel',
      language,
      `MUN_Phase09_QA_Workbook_${language.toUpperCase()}.xlsx`
    );
  },
};
