import ExcelJS from 'exceljs';
import { CompanyProfileSettings } from '../phase03Types';
import { generatePdfBuffer } from '../reports/pdfExportService';
import { deriveFyCode } from '../finance/accountingEngine';
import { formatDateTimeISTServer } from '../reports/reportDataEngine';
import { ReportDataset } from '../reports/reportTypes';
import { QaStore } from './qaStore';

function safeExcelValue(val: unknown): string | number | boolean {
  if (val === null || val === undefined) return '';
  if (typeof val === 'number' || typeof val === 'boolean') return val;
  const raw = String(val);
  return /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
}

export function buildQaReportDatasets(
  qaStore: QaStore,
  actorUserId: string
): ReportDataset[] {
  const overview = qaStore.getDashboardOverview();
  const readiness = overview.releaseReadiness;
  const fy = deriveFyCode(new Date().toISOString().slice(0, 10));
  const generatedAt = new Date().toISOString();
  const dateRangeLabel = `As of ${formatDateTimeISTServer(generatedAt)} IST`;

  const datasets: ReportDataset[] = [];

  // 1. Executive QA Summary & Release Gates
  datasets.push({
    reportKey: 'QA_EXECUTIVE_SUMMARY',
    title: 'Phase 09 QA & Release Readiness Executive Summary',
    titleBn: 'ফেজ ০৯ কিউএ এবং রিলিজ প্রস্তুতি নির্বাহী সারসংক্ষেপ',
    subtitle: `Release ${readiness.releaseVersion} — Status: ${readiness.releaseStatus}`,
    category: 'CUSTOM',
    financialYear: fy,
    dateRangeLabel,
    generatedAt,
    generatedBy: actorUserId,
    columns: [
      { key: 'metric', label: 'QA Metric / Gate', labelBn: 'পরিমাপ / গেট', type: 'text' },
      { key: 'value', label: 'Current Value', labelBn: 'বর্তমান মান', type: 'text' },
      { key: 'status', label: 'Status / Assessment', labelBn: 'অবস্থা', type: 'status' },
      { key: 'notes', label: 'Evidence / Notes', labelBn: 'প্রমাণ / মন্তব্য', type: 'text' },
    ],
    rows: [
      {
        metric: 'Total Registered Test Cases',
        value: String(overview.totals.totalTestCases),
        status: 'ACTIVE',
        notes: `${overview.totals.executedCases} executed, ${overview.totals.pendingCases} pending`,
      },
      {
        metric: 'Test Execution Pass Rate',
        value: `${overview.totals.passedCases} Passed / ${overview.totals.failedCases} Failed / ${overview.totals.blockedCases} Blocked`,
        status: `${overview.totals.passPercentage}% PASS`,
        notes: `Failed Rate: ${overview.totals.failedPercentage}%`,
      },
      {
        metric: 'Open Defect Summary',
        value: `Crit: ${overview.totals.criticalBugs}, High: ${overview.totals.highBugs}, Med: ${overview.totals.mediumBugs}, Low: ${overview.totals.lowBugs}`,
        status: readiness.gates.noCriticalOrHighOpenBugs ? 'CLEAR' : 'BLOCKED',
        notes: `${qaStore.bugs.length} total bugs logged`,
      },
      {
        metric: 'OWASP Security Audit',
        value: `${qaStore.securityFindings.length} controls checked`,
        status: readiness.gates.noUnresolvedHighSecurityVulns ? 'VERIFIED_SECURE' : 'PENDING/VULNERABLE',
        notes: `${overview.totals.openVulnerabilities} open vulnerabilities`,
      },
      {
        metric: 'Performance & Export Benchmarks',
        value: `${qaStore.performanceResults.length} scenarios measured`,
        status: overview.totals.performanceIssues === 0 && qaStore.performanceResults.length > 0 ? 'PASSED' : 'CHECK',
        notes: `${overview.totals.performanceIssues} threshold violations`,
      },
      {
        metric: 'Financial Reconciliation Check',
        value: qaStore.financialReconciliations[0]?.status ?? 'NOT_RUN',
        status: readiness.gates.financialReconciliationPassed ? 'RECONCILED' : 'PENDING/BLOCKED',
        notes: qaStore.financialReconciliations[0]
          ? `TB Dr/Cr = ₹${qaStore.financialReconciliations[0].trialBalanceDebit.toFixed(2)}, Diff = ₹${qaStore.financialReconciliations[0].balanceSheetDiff.toFixed(2)}`
          : 'Not executed yet',
      },
      {
        metric: 'Backup & Disaster Recovery Drill',
        value: qaStore.backupDrills[0]?.status ?? 'NOT_RUN',
        status: readiness.gates.backupRestoreDrillPassed ? 'PASSED' : 'PENDING/FAILED',
        notes: qaStore.backupDrills[0]
          ? `${qaStore.backupDrills[0].drillScope} drill in ${qaStore.backupDrills[0].recoveryTimeMs}ms`
          : 'Isolated drill not executed',
      },
      {
        metric: 'Regression Test Status',
        value: overview.totals.regressionStatus,
        status: readiness.gates.regressionPassed ? 'PASSED' : 'REQUIRED',
        notes: qaStore.regressionRuns[0]?.regressionCode ?? 'Not run',
      },
      {
        metric: 'Multi-Role Formal UAT',
        value: overview.totals.uatApprovalStatus,
        status: readiness.gates.uatApprovedByRoles ? 'APPROVED' : 'PENDING',
        notes: `${qaStore.uatSessions.length} UAT session(s) recorded`,
      },
      {
        metric: 'Release Approval Status',
        value: readiness.releaseStatus,
        status: readiness.canApprove ? 'ELIGIBLE' : 'LOCKED',
        notes: readiness.blockers.length > 0 ? readiness.blockers.join(' | ') : 'All gates satisfied',
      },
    ],
    totals: {},
    summaryCards: [
      { label: 'Pass Rate', value: `${overview.totals.passPercentage}%` },
      { label: 'Release Readiness', value: readiness.releaseStatus },
    ],
    totalRowsBeforeLimit: 10,
  });

  // 2. Module-Wise Breakdown
  datasets.push({
    reportKey: 'QA_MODULE_SUMMARY',
    title: 'Module-Wise Quality & Coverage Breakdown',
    titleBn: 'মডিউল ভিত্তিক গুণমান ও কভারেজ বিশ্লেষণ',
    subtitle: 'Automated and manual verification breakdown across business modules',
    category: 'CUSTOM',
    financialYear: fy,
    dateRangeLabel,
    generatedAt,
    generatedBy: actorUserId,
    columns: [
      { key: 'moduleName', label: 'Module', labelBn: 'মডিউল', type: 'text' },
      { key: 'total', label: 'Total', labelBn: 'মোট', type: 'number', align: 'right' },
      { key: 'passed', label: 'Passed', labelBn: 'উত্তীর্ণ', type: 'number', align: 'right' },
      { key: 'failed', label: 'Failed', labelBn: 'ব্যর্থ', type: 'number', align: 'right' },
      { key: 'blocked', label: 'Blocked', labelBn: 'ব্লকড', type: 'number', align: 'right' },
      { key: 'pending', label: 'Pending', labelBn: 'অপেক্ষমাণ', type: 'number', align: 'right' },
      { key: 'qualityScorePct', label: 'Pass %', labelBn: 'পাশ %', type: 'number', align: 'right' },
    ],
    rows: overview.moduleBreakdown.map((m) => ({
      moduleName: m.moduleName,
      total: m.total,
      passed: m.passed,
      failed: m.failed,
      blocked: m.blocked,
      pending: m.pending,
      qualityScorePct: m.qualityScorePct,
    })),
    totals: {},
    totalRowsBeforeLimit: overview.moduleBreakdown.length,
  });

  // 3. Test Case Register
  datasets.push({
    reportKey: 'QA_TEST_CASE_REGISTER',
    title: 'Test Case Register & Execution State',
    titleBn: 'টেস্ট কেস রেজিস্টার ও ফলাফল',
    subtitle: 'Full Unit, Integration, System, Security, Financial & Backup cases',
    category: 'CUSTOM',
    financialYear: fy,
    dateRangeLabel,
    generatedAt,
    generatedBy: actorUserId,
    columns: [
      { key: 'caseCode', label: 'Case ID', labelBn: 'কেস আইডি', type: 'text' },
      { key: 'moduleName', label: 'Module', labelBn: 'মডিউল', type: 'text' },
      { key: 'testType', label: 'Type', labelBn: 'ধরন', type: 'text' },
      { key: 'priority', label: 'Priority', labelBn: 'অগ্রাধিকার', type: 'text' },
      { key: 'title', label: 'Test Objective', labelBn: 'উদ্দেশ্য', type: 'text' },
      { key: 'lastStatus', label: 'Status', labelBn: 'অবস্থা', type: 'status' },
      { key: 'lastExecutedAt', label: 'Last Run', labelBn: 'শেষ পরীক্ষা', type: 'text' },
    ],
    rows: qaStore.testCases.map((tc) => ({
      caseCode: tc.caseCode,
      moduleName: tc.moduleName,
      testType: tc.testType,
      priority: tc.priority,
      title: tc.title,
      lastStatus: tc.lastStatus,
      lastExecutedAt: tc.lastExecutedAt ? formatDateTimeISTServer(tc.lastExecutedAt) : 'Not Executed',
    })),
    totals: {},
    totalRowsBeforeLimit: qaStore.testCases.length,
  });

  // 4. Bug Register
  datasets.push({
    reportKey: 'QA_BUG_REGISTER',
    title: 'Bug Tracking & Retest Register',
    titleBn: 'বাগ ট্র্যাকিং ও রিটেস্ট রেজিস্টার',
    subtitle: 'Defects tracked across New -> Assigned -> In Progress -> Fixed -> Verified -> Closed',
    category: 'CUSTOM',
    financialYear: fy,
    dateRangeLabel,
    generatedAt,
    generatedBy: actorUserId,
    columns: [
      { key: 'bugCode', label: 'Bug ID', labelBn: 'বাগ আইডি', type: 'text' },
      { key: 'priority', label: 'Priority', labelBn: 'অগ্রাধিকার', type: 'text' },
      { key: 'category', label: 'Category', labelBn: 'বিভাগ', type: 'text' },
      { key: 'moduleName', label: 'Module', labelBn: 'মডিউল', type: 'text' },
      { key: 'status', label: 'Status', labelBn: 'অবস্থা', type: 'status' },
      { key: 'title', label: 'Title', labelBn: 'শিরোনাম', type: 'text' },
      { key: 'assignedDeveloper', label: 'Developer', labelBn: 'ডেভেলপার', type: 'text' },
    ],
    rows:
      qaStore.bugs.length > 0
        ? qaStore.bugs.map((b) => ({
            bugCode: b.bugCode,
            priority: b.priority,
            category: b.category,
            moduleName: b.moduleName,
            status: b.status,
            title: b.title,
            assignedDeveloper: b.assignedDeveloper ?? 'Unassigned',
          }))
        : [
            {
              bugCode: '—',
              priority: 'None',
              category: 'All',
              moduleName: 'System',
              status: 'CLEAR',
              title: 'No bug reports logged in current cycle',
              assignedDeveloper: '—',
            },
          ],
    totals: {},
    totalRowsBeforeLimit: qaStore.bugs.length,
  });

  // 5. Security & Financial & Backup Evidence
  datasets.push({
    reportKey: 'QA_SECURITY_FINDINGS',
    title: 'Security Audit & Penetration Test Evidence',
    titleBn: 'নিরাপত্তা অডিট ও পেনিট্রেশন টেস্ট ফলাফল',
    subtitle: 'OWASP verification & RBAC / Encryption controls',
    category: 'CUSTOM',
    financialYear: fy,
    dateRangeLabel,
    generatedAt,
    generatedBy: actorUserId,
    columns: [
      { key: 'findingCode', label: 'Finding ID', labelBn: 'আইডি', type: 'text' },
      { key: 'owaspCategory', label: 'OWASP Category', labelBn: 'OWASP বিভাগ', type: 'text' },
      { key: 'testArea', label: 'Test Area', labelBn: 'ক্ষেত্র', type: 'text' },
      { key: 'severity', label: 'Severity', labelBn: 'তীব্রতা', type: 'text' },
      { key: 'status', label: 'Status', labelBn: 'অবস্থা', type: 'status' },
      { key: 'evidence', label: 'Verified Evidence', labelBn: 'প্রমাণ', type: 'text' },
    ],
    rows:
      qaStore.securityFindings.length > 0
        ? qaStore.securityFindings.map((s) => ({
            findingCode: s.findingCode,
            owaspCategory: s.owaspCategory,
            testArea: s.testArea,
            severity: s.severity,
            status: s.status,
            evidence: s.evidence,
          }))
        : [
            {
              findingCode: 'PENDING',
              owaspCategory: 'Not Executed',
              testArea: 'Security Audit Pending',
              severity: 'Info',
              status: 'PENDING',
              evidence: 'Run SUITE-SEC or Security Audit to capture OWASP evidence.',
            },
          ],
    totals: {},
    totalRowsBeforeLimit: qaStore.securityFindings.length,
  });

  // 6. Browser & Device Matrix & UAT
  datasets.push({
    reportKey: 'QA_COMPAT_UAT',
    title: 'Browser Compatibility Matrix & Multi-Role UAT',
    titleBn: 'ব্রাউজার সামঞ্জস্য ও UAT স্বাক্ষর তালিকা',
    subtitle: 'Desktop, Tablet, Mobile & Role Sign-off Status',
    category: 'CUSTOM',
    financialYear: fy,
    dateRangeLabel,
    generatedAt,
    generatedBy: actorUserId,
    columns: [
      { key: 'matrixCode', label: 'Matrix ID', labelBn: 'কোড', type: 'text' },
      { key: 'osPlatform', label: 'OS', labelBn: 'ওএস', type: 'text' },
      { key: 'browserName', label: 'Browser', labelBn: 'ব্রাউজার', type: 'text' },
      { key: 'deviceType', label: 'Device', labelBn: 'ডিভাইস', type: 'text' },
      { key: 'viewport', label: 'Viewport', labelBn: 'রেজোলিউশন', type: 'text' },
      { key: 'status', label: 'Status', labelBn: 'অবস্থা', type: 'status' },
      { key: 'notes', label: 'Notes', labelBn: 'নোট', type: 'text' },
    ],
    rows: qaStore.browserMatrix.map((c) => ({
      matrixCode: c.matrixCode,
      osPlatform: c.osPlatform,
      browserName: c.browserName,
      deviceType: c.deviceType,
      viewport: c.viewport,
      status: c.status,
      notes: c.notes,
    })),
    totals: {},
    totalRowsBeforeLimit: qaStore.browserMatrix.length,
  });

  return datasets;
}

export async function generateQaPdfReport(
  qaStore: QaStore,
  company: CompanyProfileSettings,
  actorUserId: string,
  language: 'en' | 'bn' = 'en'
): Promise<Buffer> {
  const datasets = buildQaReportDatasets(qaStore, actorUserId);
  return generatePdfBuffer(datasets, company, {
    language,
    orientation: 'landscape',
    pageSize: 'A4',
    includeLogo: true,
    includeSignature: true,
    includeStamp: true,
  });
}

function addStyledSheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  bannerTitle: string,
  headers: string[],
  rows: Array<Array<string | number | boolean>>
) {
  const ws = wb.addWorksheet(sheetName.slice(0, 31), {
    views: [{ state: 'frozen', ySplit: 2, showGridLines: true }],
  });

  const colCount = Math.max(1, headers.length);
  ws.addRow([bannerTitle]);
  if (colCount > 1) {
    ws.mergeCells(1, 1, 1, colCount);
  }
  const titleCell = ws.getCell(1, 1);
  titleCell.font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.getRow(1).height = 24;

  const headerRow = ws.addRow(headers);
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
  });

  for (const r of rows) {
    const safeRow = r.map((v) => safeExcelValue(v));
    const added = ws.addRow(safeRow);
    added.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 10 };
    });
  }

  ws.columns.forEach((col, i) => {
    let maxLen = headers[i]?.length ?? 14;
    rows.forEach((r) => {
      const len = String(r[i] ?? '').length;
      if (len > maxLen) maxLen = len;
    });
    col.width = Math.min(Math.max(maxLen + 4, 14), 52);
  });
}

export async function generateQaExcelWorkbook(
  qaStore: QaStore,
  company: CompanyProfileSettings,
  actorUserId: string,
  language: 'en' | 'bn' = 'en'
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = company.companyName || 'MUN COMPUTER BUSINESS MANAGER';
  wb.created = new Date();
  wb.modified = new Date();

  const isBn = language === 'bn';
  const overview = qaStore.getDashboardOverview();
  const readiness = overview.releaseReadiness;
  const generatedIst = formatDateTimeISTServer(new Date().toISOString());

  // 1. Executive Summary
  addStyledSheet(
    wb,
    'Executive Summary',
    `${company.companyName} — ${isBn ? 'ফেজ ০৯ কিউএ ও রিলিজ সারসংক্ষেপ' : 'Phase 09 QA & Release Summary'} (${generatedIst})`,
    [isBn ? 'বিভাগ / পরিমাপ' : 'Metric / Gate', isBn ? 'মান' : 'Value', isBn ? 'অবস্থা' : 'Status', isBn ? 'মন্তব্য' : 'Notes'],
    [
      ['Company', company.companyName, 'Verified', company.addressLine],
      ['Release Version', readiness.releaseVersion, readiness.releaseStatus, readiness.canApprove ? 'Ready for Admin Sign-off' : 'Blocked / Pending'],
      ['Total Test Cases', overview.totals.totalTestCases, `${overview.totals.executedCases} Executed`, `${overview.totals.pendingCases} Pending`],
      ['Passed / Failed / Blocked', `${overview.totals.passedCases} / ${overview.totals.failedCases} / ${overview.totals.blockedCases}`, `${overview.totals.passPercentage}% Pass`, `Failed ${overview.totals.failedPercentage}%`],
      ['Open Bugs (Crit/High/Med/Low)', `${overview.totals.criticalBugs}/${overview.totals.highBugs}/${overview.totals.mediumBugs}/${overview.totals.lowBugs}`, readiness.gates.noCriticalOrHighOpenBugs ? 'CLEAR' : 'BLOCKED', `${qaStore.bugs.length} logged total`],
      ['Open Security Vulns', overview.totals.openVulnerabilities, readiness.gates.noUnresolvedHighSecurityVulns ? 'VERIFIED' : 'OPEN/PENDING', `${qaStore.securityFindings.length} OWASP checks`],
      ['Performance Violations', overview.totals.performanceIssues, overview.totals.performanceIssues === 0 ? 'PASSED' : 'FAILED', `${qaStore.performanceResults.length} benchmarks`],
      ['Financial Reconciliation', qaStore.financialReconciliations[0]?.status ?? 'NOT_RUN', readiness.gates.financialReconciliationPassed ? 'RECONCILED' : 'PENDING', qaStore.financialReconciliations[0]?.reconciliationCode ?? 'None'],
      ['Backup & Restore Drill', qaStore.backupDrills[0]?.status ?? 'NOT_RUN', readiness.gates.backupRestoreDrillPassed ? 'PASSED' : 'PENDING', qaStore.backupDrills[0]?.drillCode ?? 'None'],
      ['Regression Suite', overview.totals.regressionStatus, readiness.gates.regressionPassed ? 'PASSED' : 'REQUIRED', qaStore.regressionRuns[0]?.regressionCode ?? 'None'],
      ['Multi-Role UAT', overview.totals.uatApprovalStatus, readiness.gates.uatApprovedByRoles ? 'APPROVED' : 'PENDING', `${qaStore.uatSessions.length} UAT session(s)`],
    ]
  );

  // 2. Test Case Register
  addStyledSheet(
    wb,
    'Test Case Register',
    isBn ? 'টেস্ট কেস রেজিস্টার (ইউনিট / ইন্টিগ্রেশন / সিস্টেম)' : 'Test Case Register',
    ['Case ID', 'Suite', 'Module', 'Phase', 'Type', 'Polarity', 'Priority', 'Title', 'Status', 'Last Executed', 'Executed By'],
    qaStore.testCases.map((tc) => [
      tc.caseCode,
      tc.suiteCode,
      tc.moduleName,
      tc.targetPhase,
      tc.testType,
      tc.polarity,
      tc.priority,
      tc.title,
      tc.lastStatus,
      tc.lastExecutedAt ? formatDateTimeISTServer(tc.lastExecutedAt) : 'Not Executed',
      tc.lastExecutedBy ?? '—',
    ])
  );

  // 3. Test Execution History
  addStyledSheet(
    wb,
    'Test Execution History',
    isBn ? 'টেস্ট এক্সিকিউশন ইতিহাস ও প্রমাণ' : 'Test Execution Results History',
    ['Result ID', 'Execution Batch', 'Case ID', 'Module', 'Severity', 'Status', 'Duration (ms)', 'Actual Result', 'Executed By', 'Executed At'],
    qaStore.results.map((r) => [
      r.resultCode,
      r.executionCode,
      r.caseCode,
      r.moduleName,
      r.severity,
      r.status,
      r.durationMs,
      r.actualResult,
      r.executedBy,
      formatDateTimeISTServer(r.executedAt),
    ])
  );

  // 4. Bug Register
  addStyledSheet(
    wb,
    'Bug Register',
    isBn ? 'বাগ ট্র্যাকিং ও সমাধান রেজিস্টার' : 'Bug Tracking & Lifecycle Register',
    ['Bug ID', 'Priority', 'Category', 'Status', 'Module', 'Env', 'Title', 'Assigned Developer', 'Reported By', 'Retests', 'Updated At'],
    qaStore.bugs.map((b) => [
      b.bugCode,
      b.priority,
      b.category,
      b.status,
      b.moduleName,
      b.envKey,
      b.title,
      b.assignedDeveloper ?? 'Unassigned',
      b.reportedBy,
      b.retestHistory.length,
      formatDateTimeISTServer(b.updatedAt),
    ])
  );

  // 5. Security Findings
  addStyledSheet(
    wb,
    'Security Findings',
    isBn ? 'নিরাপত্তা অডিট ও OWASP পরীক্ষা' : 'OWASP Security Audit & Penetration Findings',
    ['Finding ID', 'OWASP Category', 'Test Area', 'Severity', 'Status', 'Risk Assessment', 'Evidence', 'Tested By', 'Tested At'],
    qaStore.securityFindings.map((s) => [
      s.findingCode,
      s.owaspCategory,
      s.testArea,
      s.severity,
      s.status,
      s.riskAssessment,
      s.evidence,
      s.testedBy,
      formatDateTimeISTServer(s.testedAt),
    ])
  );

  // 6. Performance Results
  addStyledSheet(
    wb,
    'Performance Results',
    isBn ? 'পারফরম্যান্স ও লোড বেঞ্চমার্ক ফলাফল' : 'Load, Stress & Export Performance Results',
    ['Benchmark ID', 'Scenario', 'Type', 'Concurrency', 'Requests', 'Target SLA (ms)', 'Avg (ms)', 'P95 (ms)', 'RPS', 'Error %', 'RSS (MB)', 'Passed'],
    qaStore.performanceResults.map((p) => [
      p.benchmarkCode,
      p.scenarioName,
      p.testType,
      p.concurrentUsers,
      p.totalRequests,
      p.targetThresholdMs,
      p.avgResponseMs,
      p.p95ResponseMs,
      p.throughputRps,
      p.errorRatePct,
      p.memoryRssMb,
      p.passed ? 'PASSED' : 'FAILED',
    ])
  );

  // 7. Financial Reconciliation
  const finRows: Array<Array<string | number | boolean>> = [];
  for (const rec of qaStore.financialReconciliations) {
    for (const chk of rec.checks) {
      finRows.push([
        rec.reconciliationCode,
        rec.financialYear,
        rec.envKey,
        chk.checkName,
        chk.expected,
        chk.actual,
        chk.passed ? 'PASSED' : 'MISMATCH',
        rec.status,
        formatDateTimeISTServer(rec.executedAt),
      ]);
    }
  }
  addStyledSheet(
    wb,
    'Financial Reconciliation',
    isBn ? 'হিসাব ও ট্রায়াল ব্যালেন্স পুনর্মিলন' : 'Financial Accounting Reconciliation Verification',
    ['Reconciliation ID', 'FY', 'Environment', 'Check Name', 'Expected', 'Actual', 'Check Status', 'Overall', 'Executed At'],
    finRows
  );

  // 8. Backup Verification
  addStyledSheet(
    wb,
    'Backup Verification',
    isBn ? 'স্বয়ংক্রিয় ব্যাকআপ ও পুনরুদ্ধার ড্রিল' : 'Automated Backup & Isolated Restore Drills',
    ['Drill ID', 'Scope', 'Schedule', 'Backup Verified', 'Checksum', 'HMAC', 'AES-256-GCM', 'Key Rotation', 'Zero Duplicates', 'Post-Restore BS OK', 'RTO (ms)', 'Status'],
    qaStore.backupDrills.map((d) => [
      d.drillCode,
      d.drillScope,
      d.scheduleTested,
      d.backupCodeVerified,
      d.checksumVerified,
      d.hmacVerified,
      d.encryptionVerified,
      d.keyRotationVerified,
      d.duplicatePreventionVerified,
      d.balanceSheetPostRestoreOk,
      d.recoveryTimeMs,
      d.status,
    ])
  );

  // 9. Regression Results
  addStyledSheet(
    wb,
    'Regression Results',
    isBn ? 'রিগ্রেশন টেস্ট ফলাফল' : 'Regression Suite Execution History',
    ['Regression ID', 'Trigger Reason', 'Affected Modules', 'Total Cases', 'Passed', 'Failed', 'Status', 'Executed By', 'Executed At'],
    qaStore.regressionRuns.map((r) => [
      r.regressionCode,
      r.triggerReason,
      r.affectedModules.join(', '),
      r.totalCases,
      r.passedCount,
      r.failedCount,
      r.status,
      r.executedBy,
      formatDateTimeISTServer(r.executedAt),
    ])
  );

  // 10. UAT & Compatibility
  addStyledSheet(
    wb,
    'UAT Results',
    isBn ? 'UAT স্বাক্ষর ও ব্রাউজার ম্যাট্রিক্স' : 'Formal UAT Sessions & Browser Matrix',
    ['Record ID', 'Role / Platform', 'Workflow / Browser', 'Cases / Viewport', 'Feedback / Notes', 'Status', 'Approved / Tested By', 'Timestamp'],
    [
      ...qaStore.uatSessions.map((u) => [
        u.uatCode,
        u.testerRole,
        u.workflowName,
        u.casesVerified,
        u.feedback,
        u.acceptanceStatus,
        u.approvedBy ?? 'Pending',
        formatDateTimeISTServer(u.createdAt),
      ]),
      ...qaStore.browserMatrix.map((m) => [
        m.matrixCode,
        `${m.osPlatform} (${m.deviceType})`,
        m.browserName,
        m.viewport,
        m.notes,
        m.status,
        m.testedBy,
        formatDateTimeISTServer(m.testedAt),
      ]),
    ]
  );

  const arrBuf = await wb.xlsx.writeBuffer();
  return Buffer.from(arrBuf);
}
