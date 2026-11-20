import crypto from 'node:crypto';
import {
  BugPriority,
  BugStatus,
  QaBackupDrillRecord,
  QaBrowserCompatibilityRecord,
  QaBugReport,
  QaDashboardOverview,
  QaEnvironmentConfig,
  QaEnvironmentKey,
  QaFinancialReconciliationRecord,
  QaPerformanceResult,
  QaRegressionRunRecord,
  QaReleaseReadinessSummary,
  QaSecurityFinding,
  QaTestCaseDef,
  QaTestExecutionBatch,
  QaTestResultRecord,
  QaTestSuiteDef,
  QaUatSessionRecord,
  ReleaseReadinessStatus,
} from './qaTypes';
import {
  LiveStoresContext,
  runAutomatedCaseByKey,
  runFinancialReconciliationCheck,
  runIsolatedBackupRestoreDrill,
  runPerformanceBenchmarkSuite,
  runSecurityAuditSuite,
  verifyBuildArtifactsOnDisk,
} from './qaRunner';
import { sanitizeText, sha256 } from '../crypto';
import { ServerUser } from '../types';

export class QaStore {
  public readonly environments: QaEnvironmentConfig[] = [];
  public readonly suites: QaTestSuiteDef[] = [];
  public readonly testCases: QaTestCaseDef[] = [];
  public readonly executions: QaTestExecutionBatch[] = [];
  public readonly results: QaTestResultRecord[] = [];
  public readonly bugs: QaBugReport[] = [];
  public readonly securityFindings: QaSecurityFinding[] = [];
  public readonly performanceResults: QaPerformanceResult[] = [];
  public readonly financialReconciliations: QaFinancialReconciliationRecord[] = [];
  public readonly backupDrills: QaBackupDrillRecord[] = [];
  public readonly regressionRuns: QaRegressionRunRecord[] = [];
  public readonly uatSessions: QaUatSessionRecord[] = [];
  public readonly browserMatrix: QaBrowserCompatibilityRecord[] = [];
  public readonly attachments: Array<{
    attachmentCode: string;
    entityType: 'TEST_RESULT' | 'BUG_REPORT' | 'UAT_SESSION' | 'RELEASE_APPROVAL';
    entityCode: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    sha256Digest: string;
    uploadedBy: string;
    createdAt: string;
  }> = [];

  public latestApproval: QaReleaseReadinessSummary['latestApproval'] = null;
  public readonly releaseHistory: QaReleaseReadinessSummary['releaseHistory'] = [];
  public readonly bugNotifications: Array<{
    id: number;
    bugCode: string;
    message: string;
    recipientUserId: string;
    createdAt: string;
  }> = [];

  private nextSeq = 1;

  constructor() {
    this.seedConfigurationAndRegister();
  }

  public nextCode(prefix: string): string {
    return `${prefix}-${new Date().getFullYear()}-${String(this.nextSeq++).padStart(4, '0')}`;
  }

  private seedConfigurationAndRegister(): void {
    const now = new Date().toISOString();

    // 4 strictly isolated deployment environments
    this.environments.push(
      {
        envKey: 'DEVELOPMENT',
        displayName: 'Local Development Sandbox',
        appUrl: 'http://localhost:3000',
        dbSchemaName: 'mun_computer_dev',
        allowAutomatedTests: true,
        allowDestructiveDrills: true,
        credentialsIsolated: true,
        healthStatus: 'HEALTHY',
        lastCheckedAt: now,
        updatedBy: 'MC2627110001',
      },
      {
        envKey: 'TESTING',
        displayName: 'Isolated QA & Automation Testing',
        appUrl: 'http://127.0.0.1:0/qa-sandbox',
        dbSchemaName: 'mun_computer_qa_test',
        allowAutomatedTests: true,
        allowDestructiveDrills: true,
        credentialsIsolated: true,
        healthStatus: 'HEALTHY',
        lastCheckedAt: now,
        updatedBy: 'MC2627110001',
      },
      {
        envKey: 'STAGING',
        displayName: 'Pre-Production Staging',
        appUrl: process.env.STAGING_URL || 'https://staging.muncomputer.local',
        dbSchemaName: 'mun_computer_staging',
        allowAutomatedTests: true,
        allowDestructiveDrills: false,
        credentialsIsolated: true,
        healthStatus: 'HEALTHY',
        lastCheckedAt: now,
        updatedBy: 'MC2627110001',
      },
      {
        envKey: 'PRODUCTION',
        displayName: 'Live Production (Protected)',
        appUrl: process.env.APP_URL || 'https://muncomputer.local',
        dbSchemaName: 'mun_computer_prod',
        allowAutomatedTests: false,
        allowDestructiveDrills: false,
        credentialsIsolated: true,
        healthStatus: 'HEALTHY',
        lastCheckedAt: now,
        updatedBy: 'MC2627110001',
      }
    );

    // 8 Real Test Suites spanning Unit, Integration, System, Security, Performance, Financial, Backup, Regression
    this.suites.push(
      {
        suiteCode: 'SUITE-UNIT',
        suiteName: 'Unit Testing Suite (Functions, Validations & Exporters)',
        testType: 'UNIT',
        targetPhase: 'Phase 01–08',
        description: 'Positive, negative & boundary unit assertions on crypto, UID generation, RBAC, customers, forms, math, PDF & Excel.',
        isCritical: true,
        createdAt: now,
      },
      {
        suiteCode: 'SUITE-INT',
        suiteName: 'Module Integration Suite (Cross-Module Data Flows)',
        testType: 'INTEGRATION',
        targetPhase: 'Phase 02–08',
        description: 'End-to-end API/store bindings: Customer -> Application -> Payment -> GL -> Reports -> Audit & DB Migrations.',
        isCritical: true,
        createdAt: now,
      },
      {
        suiteCode: 'SUITE-SYS',
        suiteName: 'System & Multi-Role Workflow Suite',
        testType: 'SYSTEM',
        targetPhase: 'Phase 01–08',
        description: 'Admin, Manager, Staff, Customer CRM & Double-Entry Financial end-to-end workflows in isolated sandbox.',
        isCritical: true,
        createdAt: now,
      },
      {
        suiteCode: 'SUITE-SEC',
        suiteName: 'Security Audit & OWASP Penetration Suite',
        testType: 'SECURITY',
        targetPhase: 'Phase 02 & 08',
        description: 'OWASP verification of Authentication, Password Policy, CAPTCHA, XSS, CSRF, RBAC Escalation & AES-256-GCM Encryption.',
        isCritical: true,
        createdAt: now,
      },
      {
        suiteCode: 'SUITE-PERF',
        suiteName: 'Performance, Load & Export Throughput Suite',
        testType: 'PERFORMANCE',
        targetPhase: 'Phase 05–08',
        description: 'Measured latency, p95 response times, memory usage, PDF & Excel export times against SLA thresholds.',
        isCritical: false,
        createdAt: now,
      },
      {
        suiteCode: 'SUITE-FIN',
        suiteName: 'Financial Reconciliation & Accounting Verification Suite',
        testType: 'FINANCIAL',
        targetPhase: 'Phase 05 & 07',
        description: 'Trial Balance, Balance Sheet Equation, Cashbook, Daybook, PNB CSP Segregation & INR Rounding checks.',
        isCritical: true,
        createdAt: now,
      },
      {
        suiteCode: 'SUITE-BKP',
        suiteName: 'Automated Backup & Full Restore Drill Suite',
        testType: 'BACKUP_DRILL',
        targetPhase: 'Phase 08',
        description: 'Isolated encrypted backup creation, key rotation decryption, restore preview & zero-duplicate full restore.',
        isCritical: true,
        createdAt: now,
      }
    );

    // Structured Test Case Register — EVERY test starts PENDING until actually executed!
    const definitions: Array<Omit<QaTestCaseDef, 'lastStatus' | 'lastExecutedAt' | 'lastExecutedBy'>> = [
      {
        caseCode: 'TC-UNIT-001',
        suiteCode: 'SUITE-UNIT',
        moduleName: 'Authentication & Crypto',
        targetPhase: 'Phase 02',
        testType: 'UNIT',
        polarity: 'POSITIVE',
        priority: 'CRITICAL',
        title: 'scrypt password hash/verify, CAPTCHA SVG generation & AES-256-GCM Aadhaar round-trip',
        preconditions: 'Crypto service initialized',
        steps: ['Hash sample password', 'Verify valid + reject invalid password', 'Encrypt/decrypt Aadhaar test string'],
        expectedResult: 'Valid matches true, invalid false, decrypted ciphertext equals original input.',
        automationKey: 'UNIT_AUTH_CRYPTO',
        isAutomated: true,
      },
      {
        caseCode: 'TC-UNIT-002',
        suiteCode: 'SUITE-UNIT',
        moduleName: 'User Management',
        targetPhase: 'Phase 02',
        testType: 'UNIT',
        polarity: 'POSITIVE',
        priority: 'CRITICAL',
        title: 'Sequential User ID format & uniqueness allocation (MC-ROLE-YYYY13-XXXX)',
        preconditions: 'Sequence service initialized',
        steps: ['Allocate two consecutive STAFF IDs'],
        expectedResult: 'IDs conform strictly to regex and never collide.',
        automationKey: 'UNIT_USER_ID_SEQUENCE',
        isAutomated: true,
      },
      {
        caseCode: 'TC-UNIT-003',
        suiteCode: 'SUITE-UNIT',
        moduleName: 'Role Permissions',
        targetPhase: 'Phase 02 & 08',
        testType: 'UNIT',
        polarity: 'NEGATIVE',
        priority: 'CRITICAL',
        title: 'Deny-by-default Role Permission matrix across Admin, Manager & Staff',
        preconditions: 'ROLE_PERMISSION_MATRIX loaded',
        steps: ['Check Admin financial grant', 'Verify Staff blocked on settings & security_logs'],
        expectedResult: 'Staff unauthorized checks return false.',
        automationKey: 'UNIT_ROLE_PERMISSIONS',
        isAutomated: true,
      },
      {
        caseCode: 'TC-UNIT-004',
        suiteCode: 'SUITE-UNIT',
        moduleName: 'Customer CRM',
        targetPhase: 'Phase 04',
        testType: 'UNIT',
        polarity: 'BOUNDARY',
        priority: 'HIGH',
        title: 'Customer validation, Aadhaar masking & 7-consent record structure',
        preconditions: 'Customer store seeded',
        steps: ['Inspect public customer sanitization', 'Assert 7 mandatory consent keys'],
        expectedResult: 'Aadhaar masked XXXX-XXXX-nnnn and all 7 consents present.',
        automationKey: 'UNIT_CUSTOMER_VALIDATION_MERGE',
        isAutomated: true,
      },
      {
        caseCode: 'TC-UNIT-005',
        suiteCode: 'SUITE-UNIT',
        moduleName: 'Applications & Services',
        targetPhase: 'Phase 04',
        testType: 'UNIT',
        polarity: 'POSITIVE',
        priority: 'HIGH',
        title: 'Dynamic Service Form Versioning, SLA status computation & Document checklist',
        preconditions: 'Service catalog & applications present',
        steps: ['Compute SLA status', 'Compute required document readiness checklist'],
        expectedResult: 'Form version ≥1, SLA string non-empty, checklist counts accurate.',
        automationKey: 'UNIT_APPLICATION_FORM_SLA',
        isAutomated: true,
      },
      {
        caseCode: 'TC-UNIT-006',
        suiteCode: 'SUITE-UNIT',
        moduleName: 'Financial Engine',
        targetPhase: 'Phase 05',
        testType: 'UNIT',
        polarity: 'NEGATIVE',
        priority: 'CRITICAL',
        title: '2-decimal rounding, Indian numbering format & unbalanced double-entry rejection',
        preconditions: 'Accounting engine ready',
        steps: ['Verify round2 & INR formatter', 'Submit unbalanced Dr=100 Cr=90 voucher'],
        expectedResult: 'Unbalanced voucher throws error and is rejected.',
        automationKey: 'UNIT_FINANCIAL_CALCULATIONS',
        isAutomated: true,
      },
      {
        caseCode: 'TC-UNIT-007',
        suiteCode: 'SUITE-UNIT',
        moduleName: 'Cashbook & Daybook',
        targetPhase: 'Phase 03 & 05',
        testType: 'UNIT',
        polarity: 'POSITIVE',
        priority: 'CRITICAL',
        title: 'Daily Cashbook closing formula & Daybook posted voucher aggregation',
        preconditions: 'Cash closings and GL vouchers seeded',
        steps: ['Compute Opening + Received - Expenses', 'Generate Daybook dataset'],
        expectedResult: 'Cashbook formula matches exact closing and Daybook lists posted entries.',
        automationKey: 'UNIT_CASHBOOK_DAYBOOK_MATH',
        isAutomated: true,
      },
      {
        caseCode: 'TC-UNIT-008',
        suiteCode: 'SUITE-UNIT',
        moduleName: 'Reports & Exporters',
        targetPhase: 'Phase 07',
        testType: 'UNIT',
        polarity: 'POSITIVE',
        priority: 'HIGH',
        title: 'Report Data Engine + PDFKit (%PDF-) + ExcelJS (PK XLSX) + CSV UTF-8 BOM generation',
        preconditions: 'PDFKit & ExcelJS loaded',
        steps: ['Generate FIN_BALANCE_SHEET', 'Render PDF (EN), Excel (BN), CSV'],
        expectedResult: 'All three binary buffers pass header signatures.',
        automationKey: 'UNIT_REPORTS_PDF_EXCEL',
        isAutomated: true,
      },
      {
        caseCode: 'TC-UNIT-009',
        suiteCode: 'SUITE-UNIT',
        moduleName: 'Backup & Notifications',
        targetPhase: 'Phase 08',
        testType: 'UNIT',
        polarity: 'NEGATIVE',
        priority: 'CRITICAL',
        title: 'Encrypted backup verification & unconsented promotional SMS dispatch block',
        preconditions: 'Isolated Phase08Store sandbox',
        steps: ['Create AES-256-GCM snapshot', 'Verify integrity', 'Attempt promo SMS without consent'],
        expectedResult: 'Backup verifies OK and unconsented SMS is skipped.',
        automationKey: 'UNIT_BACKUP_NOTIFICATION_FUNCS',
        isAutomated: true,
      },
      {
        caseCode: 'TC-INT-001',
        suiteCode: 'SUITE-INT',
        moduleName: 'ERP -> Financial Engine',
        targetPhase: 'Phase 04 & 05',
        testType: 'INTEGRATION',
        polarity: 'POSITIVE',
        priority: 'CRITICAL',
        title: 'Customer -> Application -> Payment -> General Ledger Trial Balance linkage',
        preconditions: 'ERP & Finance stores linked',
        steps: ['Trace customer applications', 'Recompute GL Trial Balance & Balance Sheet'],
        expectedResult: 'Customer applications exist and Trial Balance + Balance Sheet balance.',
        automationKey: 'INT_CUSTOMER_APP_PAYMENT_GL',
        isAutomated: true,
      },
      {
        caseCode: 'TC-INT-002',
        suiteCode: 'SUITE-INT',
        moduleName: 'Reports -> RBAC -> Audit Chain',
        targetPhase: 'Phase 07 & 08',
        testType: 'INTEGRATION',
        polarity: 'NEGATIVE',
        priority: 'CRITICAL',
        title: 'Financial report RBAC isolation + SHA-256 chained audit verification',
        preconditions: 'Report engine & Phase08 audit store active',
        steps: ['Allow Manager income report', 'Block Staff income report', 'Record & verify audit hash chain'],
        expectedResult: 'Staff throws FORBIDDEN_FINANCIAL_REPORT and audit chain validates intact.',
        automationKey: 'INT_REPORTS_EXPORTS_AUDIT',
        isAutomated: true,
      },
      {
        caseCode: 'TC-INT-003',
        suiteCode: 'SUITE-INT',
        moduleName: 'OTP & Gateway Telemetry',
        targetPhase: 'Phase 08',
        testType: 'INTEGRATION',
        polarity: 'POSITIVE',
        priority: 'MEDIUM',
        title: 'Honest SMS/Email/WhatsApp provider status reporting & dependency verification',
        preconditions: 'Environment configuration loaded',
        steps: ['Inspect channel gateway flags', 'Verify package.json persistence drivers'],
        expectedResult: 'Unconfigured external gateways accurately report configured=false.',
        automationKey: 'INT_MESSAGING_GATEWAY_CHECK',
        isAutomated: true,
      },
      {
        caseCode: 'TC-INT-004',
        suiteCode: 'SUITE-INT',
        moduleName: 'Database & Migrations',
        targetPhase: 'Phase 01–09',
        testType: 'INTEGRATION',
        polarity: 'POSITIVE',
        priority: 'CRITICAL',
        title: 'Verify MySQL SQL migration schema completeness (001–008 DDL files)',
        preconditions: 'database/migrations/*.sql on disk',
        steps: ['Inspect 001–008 migration SQL scripts', 'Validate all 17 Phase 09 tables'],
        expectedResult: 'All SQL migration files and Phase 09 DDL table definitions present.',
        automationKey: 'INT_DB_MIGRATION_SCHEMAS',
        isAutomated: true,
      },
      {
        caseCode: 'TC-SYS-001',
        suiteCode: 'SUITE-SYS',
        moduleName: 'End-to-End Business Workflows',
        targetPhase: 'Phase 01–08',
        testType: 'SYSTEM',
        polarity: 'POSITIVE',
        priority: 'CRITICAL',
        title: 'Multi-role E2E transaction posting, approval & real-time Balance Sheet consistency drill',
        preconditions: 'Isolated sandbox provisioned',
        steps: ['Allocate new Staff ID', 'Post balanced double-entry receipt', 'Run Financial Statements'],
        expectedResult: 'New voucher reflected immediately with zero equation difference.',
        automationKey: 'SYS_E2E_WORKFLOWS',
        isAutomated: true,
      },
      {
        caseCode: 'TC-FIN-001',
        suiteCode: 'SUITE-FIN',
        moduleName: 'Financial Reconciliation',
        targetPhase: 'Phase 05',
        testType: 'FINANCIAL',
        polarity: 'POSITIVE',
        priority: 'CRITICAL',
        title: 'Full double-entry GL, Cashbook, PNB CSP segregation & duplicate voucher audit',
        preconditions: 'Live read-only finance store',
        steps: ['Verify TB Dr=Cr', 'Verify Balance Sheet Diff=0', 'Check Cashbook & PNB CSP segregation'],
        expectedResult: 'Zero reconciliation mismatches.',
        automationKey: 'FIN_RECONCILIATION_CHECK',
        isAutomated: true,
      },
      {
        caseCode: 'TC-BKP-001',
        suiteCode: 'SUITE-BKP',
        moduleName: 'Backup & Disaster Recovery',
        targetPhase: 'Phase 08',
        testType: 'BACKUP_DRILL',
        polarity: 'DESTRUCTIVE_DRILL',
        priority: 'CRITICAL',
        title: 'Isolated AES-256-GCM snapshot, key rotation & duplicate-safe FULL restore drill',
        preconditions: 'Temporary isolated vault directory',
        steps: ['Create DAILY backup', 'Rotate KEY-V1->KEY-V2', 'Verify historical bundle', 'Execute FULL restore'],
        expectedResult: 'Restore completes cleanly with zero duplicate vouchers and balanced BS.',
        automationKey: 'BACKUP_RESTORE_DRILL',
        isAutomated: true,
      },
    ];

    for (const def of definitions) {
      this.testCases.push({
        ...def,
        lastStatus: 'PENDING',
        lastExecutedAt: null,
        lastExecutedBy: null,
      });
    }

    // Standard compatibility device/browser rows initialized as PENDING (never pre-faked as passed!)
    const combos: Array<
      Pick<QaBrowserCompatibilityRecord, 'osPlatform' | 'browserName' | 'deviceType' | 'viewport'>
    > = [
      { osPlatform: 'Windows', browserName: 'Google Chrome', deviceType: 'Desktop', viewport: '1440x900' },
      { osPlatform: 'Windows', browserName: 'Microsoft Edge', deviceType: 'Laptop', viewport: '1366x768' },
      { osPlatform: 'Linux', browserName: 'Mozilla Firefox', deviceType: 'Desktop', viewport: '1440x900' },
      { osPlatform: 'macOS', browserName: 'Apple Safari', deviceType: 'Laptop', viewport: '1440x900' },
      { osPlatform: 'Android', browserName: 'Google Chrome', deviceType: 'Android Mobile', viewport: '390x844' },
      { osPlatform: 'iOS', browserName: 'Apple Safari', deviceType: 'iPhone', viewport: '390x844' },
      { osPlatform: 'Android', browserName: 'Google Chrome', deviceType: 'Tablet', viewport: '768x1024' },
    ];
    for (const combo of combos) {
      this.browserMatrix.push({
        matrixCode: this.nextCode('COMPAT'),
        ...combo,
        verifiedItems: ['Responsive Layout', 'Navigation', 'Tables', 'Forms', 'Bengali Fonts', 'PDF Preview'],
        bengaliFontsOk: false,
        pdfPrintOk: false,
        responsiveOk: false,
        verificationMode: 'PENDING_DEVICE_LAB',
        status: 'PENDING',
        notes: 'Awaiting QA browser compatibility execution sign-off.',
        testedBy: 'PENDING',
        testedAt: now,
      });
    }
  }

  public addCustomTestCase(input: {
    suiteCode: string;
    moduleName: string;
    targetPhase: string;
    testType: QaTestCaseDef['testType'];
    polarity: QaTestCaseDef['polarity'];
    priority: QaTestCaseDef['priority'];
    title: string;
    preconditions: string;
    steps: string[];
    expectedResult: string;
  }): QaTestCaseDef {
    const item: QaTestCaseDef = {
      caseCode: this.nextCode('TC-CUSTOM'),
      suiteCode: input.suiteCode,
      moduleName: sanitizeText(input.moduleName),
      targetPhase: sanitizeText(input.targetPhase),
      testType: input.testType,
      polarity: input.polarity,
      priority: input.priority,
      title: sanitizeText(input.title),
      preconditions: sanitizeText(input.preconditions || ''),
      steps: input.steps.map((s) => sanitizeText(s)),
      expectedResult: sanitizeText(input.expectedResult),
      automationKey: null,
      isAutomated: false,
      lastStatus: 'PENDING',
      lastExecutedAt: null,
      lastExecutedBy: null,
    };
    this.testCases.unshift(item);
    return item;
  }

  public async executeSuiteOrCases(params: {
    envKey: QaEnvironmentKey;
    suiteCode?: string;
    caseCodes?: string[];
    triggerSource: QaTestExecutionBatch['triggerSource'];
    actorUserId: string;
    live: LiveStoresContext;
  }): Promise<{
    batch: QaTestExecutionBatch;
    results: QaTestResultRecord[];
    securityFindingsAdded?: number;
    performanceResultsAdded?: number;
    financialReconciliation?: QaFinancialReconciliationRecord;
    backupDrill?: QaBackupDrillRecord;
  }> {
    const env = this.environments.find((e) => e.envKey === params.envKey);
    if (!env) throw new Error('Invalid target QA environment.');
    if (!env.allowAutomatedTests) {
      throw new Error(
        `Safety Policy Blocked: Automated tests cannot be executed against ${env.envKey} environment. Select TESTING or STAGING.`
      );
    }

    const targets = this.testCases.filter((tc) => {
      if (params.caseCodes && params.caseCodes.length > 0) {
        return params.caseCodes.includes(tc.caseCode);
      }
      if (params.suiteCode && params.suiteCode !== 'ALL') {
        return tc.suiteCode === params.suiteCode;
      }
      return true;
    });

    if (targets.length === 0) {
      throw new Error('No matching test cases found to execute.');
    }

    const tBatchStart = performance.now();
    const startedAt = new Date().toISOString();
    const executionCode = this.nextCode('EXEC');
    const batchResults: QaTestResultRecord[] = [];
    let passedCount = 0;
    let failedCount = 0;
    let blockedCount = 0;

    for (const tc of targets) {
      if (tc.polarity === 'DESTRUCTIVE_DRILL' && !env.allowDestructiveDrills) {
        blockedCount += 1;
        tc.lastStatus = 'BLOCKED';
        tc.lastExecutedAt = new Date().toISOString();
        tc.lastExecutedBy = params.actorUserId;
        const r: QaTestResultRecord = {
          resultCode: this.nextCode('RES'),
          executionCode,
          caseCode: tc.caseCode,
          suiteCode: tc.suiteCode,
          moduleName: tc.moduleName,
          targetPhase: tc.targetPhase,
          severity: tc.priority,
          status: 'BLOCKED',
          durationMs: 0,
          actualResult: `Destructive/Restore drill blocked on ${env.envKey} policy (allowDestructiveDrills=false).`,
          evidence: { envKey: env.envKey, policyBlocked: true },
          executedBy: params.actorUserId,
          executedAt: tc.lastExecutedAt,
        };
        this.results.unshift(r);
        batchResults.push(r);
        continue;
      }

      if (!tc.isAutomated || !tc.automationKey) {
        // Manual/UAT/Unwired custom test case stays BLOCKED until manually passed
        blockedCount += 1;
        tc.lastStatus = 'BLOCKED';
        tc.lastExecutedAt = new Date().toISOString();
        tc.lastExecutedBy = params.actorUserId;
        const r: QaTestResultRecord = {
          resultCode: this.nextCode('RES'),
          executionCode,
          caseCode: tc.caseCode,
          suiteCode: tc.suiteCode,
          moduleName: tc.moduleName,
          targetPhase: tc.targetPhase,
          severity: tc.priority,
          status: 'BLOCKED',
          durationMs: 0,
          actualResult: 'Manual test case requires operator execution evidence.',
          evidence: { requiresManualSignoff: true },
          executedBy: params.actorUserId,
          executedAt: tc.lastExecutedAt,
        };
        this.results.unshift(r);
        batchResults.push(r);
        continue;
      }

      const t0 = performance.now();
      const out = await runAutomatedCaseByKey(tc.automationKey, params.live);
      const durMs = Math.max(1, Math.round(performance.now() - t0));
      const status = out.passed ? 'PASSED' : 'FAILED';
      if (out.passed) passedCount += 1;
      else failedCount += 1;

      const execTime = new Date().toISOString();
      tc.lastStatus = status;
      tc.lastExecutedAt = execTime;
      tc.lastExecutedBy = params.actorUserId;

      const r: QaTestResultRecord = {
        resultCode: this.nextCode('RES'),
        executionCode,
        caseCode: tc.caseCode,
        suiteCode: tc.suiteCode,
        moduleName: tc.moduleName,
        targetPhase: tc.targetPhase,
        severity: tc.priority,
        status,
        durationMs: durMs,
        actualResult: out.actualResult,
        evidence: out.evidence,
        executedBy: params.actorUserId,
        executedAt: execTime,
      };
      this.results.unshift(r);
      batchResults.push(r);
    }

    // If full 'ALL' or specific specialized suite is run, also execute & persist deep telemetry records
    let securityFindingsAdded = 0;
    let performanceResultsAdded = 0;
    let financialReconciliation: QaFinancialReconciliationRecord | undefined;
    let backupDrill: QaBackupDrillRecord | undefined;

    if (!params.suiteCode || params.suiteCode === 'ALL' || params.suiteCode === 'SUITE-SEC') {
      const sec = runSecurityAuditSuite(params.actorUserId, params.live);
      this.securityFindings.unshift(...sec);
      securityFindingsAdded = sec.length;
    }
    if (!params.suiteCode || params.suiteCode === 'ALL' || params.suiteCode === 'SUITE-PERF') {
      const perf = await runPerformanceBenchmarkSuite(params.actorUserId, params.live);
      this.performanceResults.unshift(...perf);
      performanceResultsAdded = perf.length;
    }
    if (!params.suiteCode || params.suiteCode === 'ALL' || params.suiteCode === 'SUITE-FIN') {
      financialReconciliation = runFinancialReconciliationCheck(params.live, params.envKey, params.actorUserId);
      this.financialReconciliations.unshift(financialReconciliation);
    }
    if ((!params.suiteCode || params.suiteCode === 'ALL' || params.suiteCode === 'SUITE-BKP') && env.allowDestructiveDrills) {
      backupDrill = await runIsolatedBackupRestoreDrill('FULL', 'DAILY', params.actorUserId);
      this.backupDrills.unshift(backupDrill);
    }

    const completedAt = new Date().toISOString();
    const batch: QaTestExecutionBatch = {
      executionCode,
      envKey: params.envKey,
      triggerSource: params.triggerSource,
      suiteFilter: params.suiteCode || (params.caseCodes ? params.caseCodes.join(',') : 'ALL'),
      executedBy: params.actorUserId,
      totalCases: targets.length,
      passedCount,
      failedCount,
      blockedCount,
      durationMs: Math.max(1, Math.round(performance.now() - tBatchStart)),
      status: 'COMPLETED',
      startedAt,
      completedAt,
    };
    this.executions.unshift(batch);

    return {
      batch,
      results: batchResults,
      securityFindingsAdded,
      performanceResultsAdded,
      financialReconciliation,
      backupDrill,
    };
  }

  public recordManualCaseOutcome(params: {
    caseCode: string;
    status: 'PASSED' | 'FAILED' | 'BLOCKED';
    actualResult: string;
    actorUserId: string;
    envKey: QaEnvironmentKey;
  }): QaTestResultRecord {
    const tc = this.testCases.find((c) => c.caseCode === params.caseCode);
    if (!tc) throw new Error('Test case not found.');
    const now = new Date().toISOString();
    tc.lastStatus = params.status;
    tc.lastExecutedAt = now;
    tc.lastExecutedBy = params.actorUserId;
    const batchCode = this.nextCode('EXEC-MAN');
    this.executions.unshift({
      executionCode: batchCode,
      envKey: params.envKey,
      triggerSource: 'MANUAL_UI',
      suiteFilter: tc.caseCode,
      executedBy: params.actorUserId,
      totalCases: 1,
      passedCount: params.status === 'PASSED' ? 1 : 0,
      failedCount: params.status === 'FAILED' ? 1 : 0,
      blockedCount: params.status === 'BLOCKED' ? 1 : 0,
      durationMs: 1,
      status: 'COMPLETED',
      startedAt: now,
      completedAt: now,
    });
    const rec: QaTestResultRecord = {
      resultCode: this.nextCode('RES'),
      executionCode: batchCode,
      caseCode: tc.caseCode,
      suiteCode: tc.suiteCode,
      moduleName: tc.moduleName,
      targetPhase: tc.targetPhase,
      severity: tc.priority,
      status: params.status,
      durationMs: 1,
      actualResult: sanitizeText(params.actualResult),
      evidence: { manualVerification: true },
      executedBy: params.actorUserId,
      executedAt: now,
    };
    this.results.unshift(rec);
    return rec;
  }

  public createBugReport(input: {
    title: string;
    category: QaBugReport['category'];
    priority: BugPriority;
    moduleName: string;
    relatedCaseCode?: string | null;
    envKey?: QaEnvironmentKey;
    description: string;
    reproductionSteps: string;
    expectedResult: string;
    actualResult: string;
    evidenceRef?: string | null;
    assignedDeveloper?: string | null;
    reportedBy: string;
  }): QaBugReport {
    const now = new Date().toISOString();
    const status: BugStatus = input.assignedDeveloper ? 'Assigned' : 'New';
    const bug: QaBugReport = {
      bugCode: this.nextCode('BUG'),
      title: sanitizeText(input.title),
      category: input.category,
      priority: input.priority,
      status,
      moduleName: sanitizeText(input.moduleName),
      relatedCaseCode: input.relatedCaseCode ? sanitizeText(input.relatedCaseCode) : null,
      envKey: input.envKey ?? 'TESTING',
      description: sanitizeText(input.description),
      reproductionSteps: sanitizeText(input.reproductionSteps),
      expectedResult: sanitizeText(input.expectedResult),
      actualResult: sanitizeText(input.actualResult),
      evidenceRef: input.evidenceRef ? sanitizeText(input.evidenceRef) : null,
      assignedDeveloper: input.assignedDeveloper ? sanitizeText(input.assignedDeveloper) : null,
      reportedBy: input.reportedBy,
      resolutionNotes: null,
      fixedAt: null,
      verifiedAt: null,
      createdAt: now,
      updatedAt: now,
      retestHistory: [],
      history: [
        {
          previousStatus: null,
          newStatus: status,
          actorUserId: input.reportedBy,
          notes: `Bug logged (${input.priority} / ${input.category}).`,
          createdAt: now,
        },
      ],
    };
    this.bugs.unshift(bug);

    if (bug.assignedDeveloper) {
      this.bugNotifications.unshift({
        id: this.nextSeq++,
        bugCode: bug.bugCode,
        message: `Assigned ${bug.priority} bug ${bug.bugCode}: ${bug.title}`,
        recipientUserId: bug.assignedDeveloper,
        createdAt: now,
      });
    }
    return bug;
  }

  public updateBug(params: {
    bugCode: string;
    status?: BugStatus;
    assignedDeveloper?: string | null;
    resolutionNotes?: string | null;
    retestOutcome?: 'PASSED' | 'FAILED';
    actorUserId: string;
  }): QaBugReport {
    const bug = this.bugs.find((b) => b.bugCode === params.bugCode);
    if (!bug) throw new Error('Bug report not found.');
    const now = new Date().toISOString();
    const prevStatus = bug.status;

    if (params.assignedDeveloper !== undefined) {
      bug.assignedDeveloper = params.assignedDeveloper ? sanitizeText(params.assignedDeveloper) : null;
      if (bug.assignedDeveloper && bug.status === 'New' && !params.status) {
        bug.status = 'Assigned';
      }
      if (bug.assignedDeveloper) {
        this.bugNotifications.unshift({
          id: this.nextSeq++,
          bugCode: bug.bugCode,
          message: `Bug ${bug.bugCode} assigned to ${bug.assignedDeveloper}`,
          recipientUserId: bug.assignedDeveloper,
          createdAt: now,
        });
      }
    }

    if (params.resolutionNotes !== undefined) {
      bug.resolutionNotes = params.resolutionNotes ? sanitizeText(params.resolutionNotes) : null;
    }

    if (params.retestOutcome) {
      bug.retestHistory.unshift({
        testedAt: now,
        testedBy: params.actorUserId,
        outcome: params.retestOutcome,
        notes: sanitizeText(params.resolutionNotes || `Retest ${params.retestOutcome}`),
      });
      bug.status = params.retestOutcome === 'PASSED' ? 'Verified' : 'Reopened';
      if (params.retestOutcome === 'PASSED') {
        bug.verifiedAt = now;
      }
    } else if (params.status) {
      bug.status = params.status;
      if (params.status === 'Fixed') bug.fixedAt = now;
      if (params.status === 'Verified' || params.status === 'Closed') bug.verifiedAt = bug.verifiedAt ?? now;
    }

    bug.updatedAt = now;
    bug.history.unshift({
      previousStatus: prevStatus,
      newStatus: bug.status,
      actorUserId: params.actorUserId,
      notes: sanitizeText(params.resolutionNotes || `Transition ${prevStatus} -> ${bug.status}`),
      createdAt: now,
    });
    return bug;
  }

  public async runRegressionSuite(params: {
    triggerReason: string;
    affectedModules: string[];
    envKey: QaEnvironmentKey;
    actorUserId: string;
    live: LiveStoresContext;
  }): Promise<QaRegressionRunRecord> {
    const execOutcome = await this.executeSuiteOrCases({
      envKey: params.envKey,
      suiteCode: 'ALL',
      triggerSource: 'REGRESSION',
      actorUserId: params.actorUserId,
      live: params.live,
    });

    const reg: QaRegressionRunRecord = {
      regressionCode: this.nextCode('REG'),
      triggerReason: sanitizeText(params.triggerReason || 'Post-fix full regression suite'),
      affectedModules: params.affectedModules.length > 0 ? params.affectedModules : ['ALL_MODULES'],
      totalCases: execOutcome.batch.totalCases,
      passedCount: execOutcome.batch.passedCount,
      failedCount: execOutcome.batch.failedCount,
      status: execOutcome.batch.failedCount === 0 && execOutcome.batch.blockedCount === 0 ? 'PASSED' : 'FAILED',
      executedBy: params.actorUserId,
      executedAt: new Date().toISOString(),
    };
    this.regressionRuns.unshift(reg);
    return reg;
  }

  public recordAttachment(params: {
    entityType: 'TEST_RESULT' | 'BUG_REPORT' | 'UAT_SESSION' | 'RELEASE_APPROVAL';
    entityCode: string;
    fileName: string;
    mimeType: string;
    contentBase64?: string;
    uploadedBy: string;
  }) {
    const bytes = params.contentBase64 ? Buffer.from(params.contentBase64, 'base64') : Buffer.from(params.fileName);
    const att = {
      attachmentCode: this.nextCode('ATT'),
      entityType: params.entityType,
      entityCode: params.entityCode,
      fileName: sanitizeText(params.fileName),
      mimeType: sanitizeText(params.mimeType || 'application/octet-stream'),
      sizeBytes: bytes.length,
      sha256Digest: sha256(bytes.toString('base64')),
      uploadedBy: params.uploadedBy,
      createdAt: new Date().toISOString(),
    };
    this.attachments.unshift(att);
    return att;
  }

  public computeReleaseReadiness(): QaReleaseReadinessSummary {
    const blockers: string[] = [];

    const criticalCases = this.testCases.filter((t) => t.priority === 'CRITICAL');
    const pendingCritical = criticalCases.filter((t) => t.lastStatus === 'PENDING' || t.lastStatus === 'BLOCKED');
    const failedCritical = criticalCases.filter((t) => t.lastStatus === 'FAILED');
    const criticalTestsExecutedAndPassed =
      criticalCases.length > 0 && pendingCritical.length === 0 && failedCritical.length === 0;
    if (failedCritical.length > 0) {
      blockers.push(`${failedCritical.length} critical test case(s) failed.`);
    } else if (pendingCritical.length > 0) {
      blockers.push(`${pendingCritical.length} critical test case(s) have not passed yet.`);
    }

    const openStatuses = new Set<BugStatus>(['New', 'Assigned', 'In Progress', 'Reopened', 'Fixed', 'Ready for Retest']);
    const openCritHighBugs = this.bugs.filter(
      (b) => (b.priority === 'Critical' || b.priority === 'High') && openStatuses.has(b.status)
    );
    const noCriticalOrHighOpenBugs = openCritHighBugs.length === 0;
    if (!noCriticalOrHighOpenBugs) {
      blockers.push(`${openCritHighBugs.length} unresolved Critical/High bug(s) open.`);
    }

    const openSecVulns = this.securityFindings.filter(
      (s) => s.status === 'OPEN_VULNERABILITY' && (s.severity === 'Critical' || s.severity === 'High')
    );
    const noUnresolvedHighSecurityVulns =
      this.securityFindings.length > 0 && openSecVulns.length === 0;
    if (this.securityFindings.length === 0) {
      blockers.push('Security audit & OWASP scan has not been executed.');
    } else if (openSecVulns.length > 0) {
      blockers.push(`${openSecVulns.length} unresolved High/Critical security vulnerability(ies).`);
    }

    const latestFin = this.financialReconciliations[0];
    const financialReconciliationPassed = Boolean(
      latestFin && latestFin.status === 'RECONCILED' && latestFin.mismatchCount === 0
    );
    if (!latestFin) {
      blockers.push('Financial accounting reconciliation check has not been executed.');
    } else if (!financialReconciliationPassed) {
      blockers.push(`Financial reconciliation mismatch detected (${latestFin.mismatchCount} issue(s)).`);
    }

    const latestDrill = this.backupDrills[0];
    const backupRestoreDrillPassed = Boolean(latestDrill && latestDrill.status === 'PASSED');
    if (!latestDrill) {
      blockers.push('Isolated Backup & Full Restore drill has not been executed.');
    } else if (!backupRestoreDrillPassed) {
      blockers.push('Latest Backup & Restore drill failed.');
    }

    const latestReg = this.regressionRuns[0];
    const regressionPassed = Boolean(latestReg && latestReg.status === 'PASSED');
    if (!latestReg) {
      blockers.push('Full Regression suite has not been executed.');
    } else if (!regressionPassed) {
      blockers.push(`Regression run failed (${latestReg.failedCount} failures).`);
    }

    const acceptedRoles = new Set(
      this.uatSessions.filter((u) => u.acceptanceStatus === 'ACCEPTED').map((u) => u.testerRole)
    );
    const uatChangesRequested = this.uatSessions.some((u) => u.acceptanceStatus === 'CHANGES_REQUESTED');
    const uatApprovedByRoles =
      !uatChangesRequested &&
      acceptedRoles.has('ADMIN') &&
      acceptedRoles.has('MANAGER') &&
      acceptedRoles.has('STAFF');
    if (!uatApprovedByRoles) {
      blockers.push('Formal UAT acceptance required from all 3 roles (Admin, Manager, and Staff).');
    }

    const buildVerificationRecorded = verifyBuildArtifactsOnDisk();
    if (!buildVerificationRecorded) {
      blockers.push('Production build / CI configuration verification missing.');
    }

    const allGatesGreen = blockers.length === 0;
    let releaseStatus: ReleaseReadinessStatus;
    if (this.latestApproval && this.latestApproval.releaseStatus === 'RELEASED' && allGatesGreen) {
      releaseStatus = 'RELEASED';
    } else if (this.latestApproval && this.latestApproval.releaseStatus === 'APPROVED' && allGatesGreen) {
      releaseStatus = 'APPROVED';
    } else if (allGatesGreen) {
      releaseStatus = 'READY_FOR_ADMIN_APPROVAL';
    } else if (failedCritical.length > 0 || !noCriticalOrHighOpenBugs || openSecVulns.length > 0 || (latestFin && !financialReconciliationPassed) || (latestDrill && !backupRestoreDrillPassed)) {
      releaseStatus = 'BLOCKED';
    } else if (this.executions.length > 0 || this.uatSessions.length > 0) {
      releaseStatus = 'TESTING_IN_PROGRESS';
    } else {
      releaseStatus = 'NOT_READY';
    }

    return {
      releaseVersion: 'v1.9.0-RC1',
      releaseStatus,
      canApprove: allGatesGreen,
      gates: {
        criticalTestsExecutedAndPassed,
        noCriticalOrHighOpenBugs,
        noUnresolvedHighSecurityVulns,
        financialReconciliationPassed,
        backupRestoreDrillPassed,
        regressionPassed,
        uatApprovedByRoles,
        buildVerificationRecorded,
      },
      blockers,
      latestApproval: this.latestApproval,
      releaseHistory: this.releaseHistory,
    };
  }

  public approveRelease(params: {
    actor: ServerUser;
    releaseVersion: string;
    releaseNotes: string;
    markReleased?: boolean;
  }): QaReleaseReadinessSummary {
    if (params.actor.role !== 'ADMIN') {
      throw new Error('Forbidden: Only ADMIN can provide final release approval.');
    }
    const readiness = this.computeReleaseReadiness();
    if (!readiness.canApprove) {
      throw new Error(`Release Blocked: ${readiness.blockers.join(' ')}`);
    }

    const releaseCode = this.nextCode('REL');
    const now = new Date().toISOString();
    const targetStatus: ReleaseReadinessStatus = params.markReleased ? 'RELEASED' : 'APPROVED';
    this.latestApproval = {
      releaseCode,
      releaseVersion: sanitizeText(params.releaseVersion || readiness.releaseVersion),
      releaseStatus: targetStatus,
      releaseNotes: sanitizeText(params.releaseNotes || 'All QA gates verified and approved by Admin.'),
      approvedBy: params.actor.userId,
      approvedAt: now,
    };
    this.releaseHistory.unshift({
      releaseCode,
      releaseVersion: this.latestApproval.releaseVersion,
      action: targetStatus,
      actorUserId: params.actor.userId,
      summary: this.latestApproval.releaseNotes,
      createdAt: now,
    });
    return this.computeReleaseReadiness();
  }

  public getDashboardOverview(filters?: {
    fromDate?: string;
    toDate?: string;
    testerUserId?: string;
    severity?: string;
  }): QaDashboardOverview {
    let cases = [...this.testCases];
    if (filters?.severity && filters.severity !== 'ALL') {
      const sev = filters.severity.toUpperCase();
      cases = cases.filter((c) => c.priority === sev);
    }
    if (filters?.testerUserId && filters.testerUserId.trim()) {
      const term = filters.testerUserId.trim().toLowerCase();
      cases = cases.filter((c) => (c.lastExecutedBy || '').toLowerCase().includes(term));
    }
    if (filters?.fromDate) {
      cases = cases.filter((c) => !c.lastExecutedAt || c.lastExecutedAt >= filters.fromDate!);
    }
    if (filters?.toDate) {
      cases = cases.filter((c) => !c.lastExecutedAt || c.lastExecutedAt <= `${filters.toDate!}T23:59:59.999Z`);
    }

    const totalTestCases = cases.length;
    const passedCases = cases.filter((c) => c.lastStatus === 'PASSED').length;
    const failedCases = cases.filter((c) => c.lastStatus === 'FAILED').length;
    const blockedCases = cases.filter((c) => c.lastStatus === 'BLOCKED').length;
    const pendingCases = cases.filter((c) => c.lastStatus === 'PENDING').length;
    const executedCases = totalTestCases - pendingCases;

    const passPercentage =
      executedCases > 0 ? Number(((passedCases / executedCases) * 100).toFixed(1)) : 0;
    const failedPercentage =
      executedCases > 0 ? Number(((failedCases / executedCases) * 100).toFixed(1)) : 0;

    const openBugs = this.bugs.filter((b) => b.status !== 'Closed' && b.status !== 'Verified');
    const criticalBugs = openBugs.filter((b) => b.priority === 'Critical').length;
    const highBugs = openBugs.filter((b) => b.priority === 'High').length;
    const mediumBugs = openBugs.filter((b) => b.priority === 'Medium').length;
    const lowBugs = openBugs.filter((b) => b.priority === 'Low').length;

    const openVulnerabilities = this.securityFindings.filter((f) => f.status === 'OPEN_VULNERABILITY').length;
    const performanceIssues = this.performanceResults.filter((p) => !p.passed).length;
    const latestReg = this.regressionRuns[0];
    const regressionStatus = !latestReg ? 'NOT_RUN' : latestReg.status;

    const readiness = this.computeReleaseReadiness();
    const uatApprovalStatus: QaDashboardOverview['totals']['uatApprovalStatus'] =
      readiness.gates.uatApprovedByRoles
        ? 'APPROVED'
        : this.uatSessions.some((u) => u.acceptanceStatus === 'ACCEPTED')
          ? 'PARTIAL'
          : 'PENDING';

    // Module-wise breakdown
    const byMod = new Map<string, QaTestCaseDef[]>();
    for (const c of cases) {
      const list = byMod.get(c.moduleName) ?? [];
      list.push(c);
      byMod.set(c.moduleName, list);
    }
    const moduleBreakdown = Array.from(byMod.entries()).map(([moduleName, list]) => {
      const p = list.filter((x) => x.lastStatus === 'PASSED').length;
      const f = list.filter((x) => x.lastStatus === 'FAILED').length;
      const b = list.filter((x) => x.lastStatus === 'BLOCKED').length;
      const pend = list.filter((x) => x.lastStatus === 'PENDING').length;
      const exec = list.length - pend;
      return {
        moduleName,
        total: list.length,
        passed: p,
        failed: f,
        blocked: b,
        pending: pend,
        qualityScorePct: exec > 0 ? Number(((p / exec) * 100).toFixed(1)) : 0,
      };
    });

    // Phase-wise breakdown
    const byPhase = new Map<string, QaTestCaseDef[]>();
    for (const c of cases) {
      const list = byPhase.get(c.targetPhase) ?? [];
      list.push(c);
      byPhase.set(c.targetPhase, list);
    }
    const phaseBreakdown = Array.from(byPhase.entries()).map(([targetPhase, list]) => ({
      targetPhase,
      total: list.length,
      passed: list.filter((x) => x.lastStatus === 'PASSED').length,
      failed: list.filter((x) => x.lastStatus === 'FAILED').length,
      blocked: list.filter((x) => x.lastStatus === 'BLOCKED').length,
      pending: list.filter((x) => x.lastStatus === 'PENDING').length,
    }));

    return {
      totals: {
        totalTestCases,
        executedCases,
        passedCases,
        failedCases,
        blockedCases,
        pendingCases,
        passPercentage,
        failedPercentage,
        criticalBugs,
        highBugs,
        mediumBugs,
        lowBugs,
        openVulnerabilities,
        performanceIssues,
        regressionStatus,
        uatApprovalStatus,
        releaseReadinessStatus: readiness.releaseStatus,
      },
      moduleBreakdown,
      phaseBreakdown,
      recentExecutions: this.executions.slice(0, 12),
      releaseReadiness: readiness,
    };
  }
}
