export type QaEnvironmentKey = 'DEVELOPMENT' | 'TESTING' | 'STAGING' | 'PRODUCTION';

export type QaTestType =
  | 'UNIT'
  | 'INTEGRATION'
  | 'SYSTEM'
  | 'UAT'
  | 'SECURITY'
  | 'PERFORMANCE'
  | 'FINANCIAL'
  | 'BACKUP_DRILL'
  | 'REGRESSION'
  | 'COMPATIBILITY';

export type QaTestPolarity = 'POSITIVE' | 'NEGATIVE' | 'BOUNDARY' | 'DESTRUCTIVE_DRILL';
export type QaPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type QaCaseStatus = 'PENDING' | 'PASSED' | 'FAILED' | 'BLOCKED';

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
  testType: QaTestType;
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
  testType: QaTestType;
  polarity: QaTestPolarity;
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

export type BugPriority = 'Critical' | 'High' | 'Medium' | 'Low';
export type BugStatus =
  | 'New'
  | 'Assigned'
  | 'In Progress'
  | 'Fixed'
  | 'Ready for Retest'
  | 'Verified'
  | 'Closed'
  | 'Reopened';

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
  testType: 'LOAD' | 'STRESS' | 'SPIKE' | 'ENDURANCE' | 'SCALABILITY' | 'PDF_EXPORT' | 'EXCEL_EXPORT' | 'DASHBOARD_LOAD';
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

export type ReleaseReadinessStatus =
  | 'NOT_READY'
  | 'TESTING_IN_PROGRESS'
  | 'BLOCKED'
  | 'READY_FOR_ADMIN_APPROVAL'
  | 'APPROVED'
  | 'RELEASED';

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
