import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import ExcelJS from 'exceljs';
import { createApp } from '../server/app';
import { SecurityStore } from '../server/securityStore';
import { Phase03Store } from '../server/phase03Store';
import { ErpStore } from '../server/erpStore';
import { FinanceStore } from '../server/finance/financeStore';
import { ReportStore } from '../server/reports/reportStore';
import { Phase08Store } from '../server/phase08/phase08Store';
import { QaStore } from '../server/phase09/qaStore';
import { hmacOtp } from '../server/crypto';

interface HttpResult {
  status: number;
  headers: Headers;
  buffer: Buffer;
  text: string;
  json: any;
  cookies: Record<string, string>;
}

function extractSetCookies(rawList: string[]): Record<string, string> {
  const jar: Record<string, string> = {};
  for (const entry of rawList) {
    const firstPart = entry.split(';')[0];
    const idx = firstPart.indexOf('=');
    if (idx > -1) {
      jar[firstPart.slice(0, idx).trim()] = decodeURIComponent(firstPart.slice(idx + 1).trim());
    }
  }
  return jar;
}

async function reqApi(
  baseUrl: string,
  method: string,
  urlPath: string,
  body?: unknown,
  cookies: Record<string, string> = {}
): Promise<HttpResult> {
  const cookieHeader = Object.entries(cookies)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('; ');

  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      ...(cookies.mun_csrf ? { 'X-CSRF-Token': cookies.mun_csrf } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const arrayBuf = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuf);
  const text = buffer.toString('utf8');
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  const setCookies =
    typeof (res.headers as any).getSetCookie === 'function'
      ? (res.headers as any).getSetCookie()
      : res.headers.get('set-cookie')
        ? [res.headers.get('set-cookie')!]
        : [];

  return {
    status: res.status,
    headers: res.headers,
    buffer,
    text,
    json,
    cookies: extractSetCookies(setCookies),
  };
}

async function loginAs(
  baseUrl: string,
  store: SecurityStore,
  userId: string,
  password: string
): Promise<Record<string, string>> {
  const capId = `p9-cap-${Math.random().toString(36).slice(2, 10)}`;
  const answer = 'Q9T4M';
  store.captchaChallenges.set(capId, {
    id: capId,
    answerHash: hmacOtp(answer, capId),
    expiresAt: Date.now() + 60_000,
  });

  const loginRes = await reqApi(baseUrl, 'POST', '/api/auth/login', {
    userId,
    password,
    captchaId: capId,
    captchaAnswer: answer,
    otpChannel: 'SMS',
  });
  assert.equal(loginRes.status, 200, `Login failed for ${userId}: ${loginRes.text}`);

  const otpRes = await reqApi(baseUrl, 'POST', '/api/auth/verify-otp', {
    challengeId: loginRes.json.data.challengeId,
    otp: loginRes.json.data.sandboxOtpPreview,
  });
  assert.equal(otpRes.status, 200, `OTP verify failed for ${userId}: ${otpRes.text}`);
  return otpRes.cookies;
}

test('Phase 09 Complete Enterprise QA Lifecycle, RBAC, Safety Guards, Exporters & Strict Release Gate', async () => {
  const store = new SecurityStore();
  const phase03Store = new Phase03Store();
  const erpStore = new ErpStore(store, phase03Store);
  const financeStore = new FinanceStore(store, phase03Store, erpStore);
  const reportStore = new ReportStore();
  const phase08Store = new Phase08Store(store, phase03Store, erpStore, financeStore, reportStore);
  const qaStore = new QaStore();

  const app = createApp(store, {
    enableRateLimit: false,
    phase03Store,
    erpStore,
    financeStore,
    reportStore,
    phase08Store,
    qaStore,
  });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    const adminCookies = await loginAs(baseUrl, store, 'MC2627110001', '8101352105');
    const managerCookies = await loginAs(baseUrl, store, 'MC2627110002', 'Manager@2026!');
    const staffCookies = await loginAs(baseUrl, store, 'MC2627110003', 'Staff@2026!');

    // -------------------------------------------------------------------------
    // 1. Initial Integrity Check: Tests start PENDING (never faked as passed)
    // -------------------------------------------------------------------------
    const initDash = await reqApi(baseUrl, 'GET', '/api/v1/qa/dashboard', undefined, adminCookies);
    assert.equal(initDash.status, 200);
    assert.equal(initDash.json.data.totals.totalTestCases, 16);
    assert.equal(initDash.json.data.totals.executedCases, 0);
    assert.equal(initDash.json.data.totals.pendingCases, 16);
    assert.equal(initDash.json.data.releaseReadiness.releaseStatus, 'NOT_READY');
    assert.equal(initDash.json.data.releaseReadiness.canApprove, false);

    // -------------------------------------------------------------------------
    // 2. Environment Safety Policy: PRODUCTION always rejects automated & drill runs
    // -------------------------------------------------------------------------
    const prodBlocked = await reqApi(
      baseUrl,
      'POST',
      '/api/v1/qa/execute',
      { envKey: 'PRODUCTION', suiteCode: 'ALL' },
      adminCookies
    );
    assert.equal(prodBlocked.status, 422);
    assert.match(prodBlocked.json.message, /Safety Policy Blocked/i);

    const staffBlockedExec = await reqApi(
      baseUrl,
      'POST',
      '/api/v1/qa/execute',
      { envKey: 'TESTING', suiteCode: 'SUITE-UNIT' },
      staffCookies
    );
    assert.equal(staffBlockedExec.status, 403);

    // -------------------------------------------------------------------------
    // 3. Execute Full Real Automated QA Suite inside isolated TESTING sandbox
    // -------------------------------------------------------------------------
    const execAll = await reqApi(
      baseUrl,
      'POST',
      '/api/v1/qa/execute',
      { envKey: 'TESTING', suiteCode: 'ALL', triggerSource: 'AUTOMATED_SUITE' },
      adminCookies
    );
    assert.equal(execAll.status, 200, `Full QA execution failed: ${execAll.text}`);
    assert.equal(execAll.json.data.batch.totalCases, 16);
    assert.equal(execAll.json.data.batch.failedCount, 0);
    assert.equal(execAll.json.data.batch.blockedCount, 0);
    assert.equal(execAll.json.data.batch.passedCount, 16);
    assert.ok((execAll.json.data.securityFindingsAdded ?? 0) >= 8);
    assert.ok((execAll.json.data.performanceResultsAdded ?? 0) >= 5);
    assert.equal(execAll.json.data.financialReconciliation.status, 'RECONCILED');
    assert.equal(execAll.json.data.financialReconciliation.mismatchCount, 0);
    assert.equal(execAll.json.data.backupDrill.status, 'PASSED');
    assert.equal(execAll.json.data.backupDrill.duplicatePreventionVerified, true);

    // Verify all performance benchmarks passed SLA thresholds
    const perfList = await reqApi(baseUrl, 'GET', '/api/v1/qa/performance', undefined, adminCookies);
    assert.equal(perfList.status, 200);
    assert.ok(perfList.json.data.every((p: any) => p.passed === true));

    // -------------------------------------------------------------------------
    // 4. Bug Lifecycle + Release Gate Blocking + Retest + Regression
    // -------------------------------------------------------------------------
    const createBug = await reqApi(
      baseUrl,
      'POST',
      '/api/v1/qa/bugs',
      {
        title: 'Receipt QR preview clipping on A5 thermal margin',
        category: 'Financial Calculation',
        priority: 'Critical',
        moduleName: 'Reports & Exporters',
        envKey: 'TESTING',
        description: 'Sample defect created to test bug lifecycle and release blocking gate.',
        reproductionSteps: '1. Open Report Center\n2. Select A5 orientation',
        expectedResult: 'Full QR fits inside footer margins',
        actualResult: 'Right border clipped by 2mm',
        assignedDeveloper: 'MC2627110002',
      },
      staffCookies
    );
    assert.equal(createBug.status, 201);
    const bugCode = createBug.json.data.bugCode;
    assert.equal(createBug.json.data.status, 'Assigned');

    // Open Critical bug must strictly block release!
    const blockedGate = await reqApi(baseUrl, 'GET', '/api/v1/qa/release/readiness', undefined, adminCookies);
    assert.equal(blockedGate.status, 200);
    assert.equal(blockedGate.json.data.releaseStatus, 'BLOCKED');
    assert.equal(blockedGate.json.data.gates.noCriticalOrHighOpenBugs, false);

    // Developer fixes bug -> QA retests FAIL (Reopened) -> Developer fixes -> QA retests PASS (Verified -> Closed)
    const markFixed = await reqApi(
      baseUrl,
      'PATCH',
      `/api/v1/qa/bugs/${bugCode}`,
      { status: 'Fixed', resolutionNotes: 'Adjusted footer padding.' },
      managerCookies
    );
    assert.equal(markFixed.status, 200);
    assert.equal(markFixed.json.data.status, 'Fixed');

    const failRetest = await reqApi(
      baseUrl,
      'PATCH',
      `/api/v1/qa/bugs/${bugCode}`,
      { retestOutcome: 'FAILED', resolutionNotes: 'Still slightly clipped at 200 DPI.' },
      adminCookies
    );
    assert.equal(failRetest.status, 200);
    assert.equal(failRetest.json.data.status, 'Reopened');

    await reqApi(
      baseUrl,
      'PATCH',
      `/api/v1/qa/bugs/${bugCode}`,
      { status: 'Fixed', resolutionNotes: 'Set explicit QR box max-width.' },
      managerCookies
    );
    const passRetest = await reqApi(
      baseUrl,
      'PATCH',
      `/api/v1/qa/bugs/${bugCode}`,
      { retestOutcome: 'PASSED', resolutionNotes: 'A5 print preview verified clean.' },
      adminCookies
    );
    assert.equal(passRetest.status, 200);
    assert.equal(passRetest.json.data.status, 'Verified');

    const closeBug = await reqApi(
      baseUrl,
      'PATCH',
      `/api/v1/qa/bugs/${bugCode}`,
      { status: 'Closed', resolutionNotes: 'Closed after passing retest.' },
      adminCookies
    );
    assert.equal(closeBug.status, 200);
    assert.equal(closeBug.json.data.status, 'Closed');

    // Run mandatory post-fix Regression Suite
    const regRun = await reqApi(
      baseUrl,
      'POST',
      '/api/v1/qa/regression/run',
      {
        triggerReason: `Post-fix regression for ${bugCode}`,
        affectedModules: ['Reports & Exporters', 'Financial Engine'],
        envKey: 'TESTING',
      },
      managerCookies
    );
    assert.equal(regRun.status, 200);
    assert.equal(regRun.json.data.status, 'PASSED');

    // -------------------------------------------------------------------------
    // 5. Formal Multi-Role UAT (Admin + Manager + Staff) & Compat Update
    // -------------------------------------------------------------------------
    // Attempt approval BEFORE all 3 roles finish UAT -> MUST return 422!
    const prematureApprove = await reqApi(
      baseUrl,
      'POST',
      '/api/v1/qa/release/approve',
      { releaseVersion: 'v1.9.0-RC1', releaseNotes: 'Trying premature release' },
      adminCookies
    );
    assert.equal(prematureApprove.status, 422);
    assert.match(prematureApprove.json.message, /Release Blocked/i);

    const staffUat = await reqApi(
      baseUrl,
      'POST',
      '/api/v1/qa/uat',
      {
        workflowName: 'Daily Counter Operations & Customer Intake',
        casesVerified: 8,
        feedback: 'Fast intake, receipt PDF clean.',
      },
      staffCookies
    );
    assert.equal(staffUat.status, 201);
    assert.equal(staffUat.json.data.testerRole, 'STAFF');
    assert.equal(staffUat.json.data.acceptanceStatus, 'PENDING');

    const mgrUat = await reqApi(
      baseUrl,
      'POST',
      '/api/v1/qa/uat',
      {
        workflowName: 'Approvals, Reports BI & Daily Cash Closings',
        casesVerified: 10,
        feedback: 'All figures match live ledger.',
      },
      managerCookies
    );
    assert.equal(mgrUat.status, 201);

    // Admin accepts Staff & Manager UAT and submits Admin UAT
    await reqApi(
      baseUrl,
      'POST',
      `/api/v1/qa/uat/${staffUat.json.data.uatCode}/review`,
      { acceptanceStatus: 'ACCEPTED' },
      adminCookies
    );
    await reqApi(
      baseUrl,
      'POST',
      `/api/v1/qa/uat/${mgrUat.json.data.uatCode}/review`,
      { acceptanceStatus: 'ACCEPTED' },
      adminCookies
    );
    const adminUat = await reqApi(
      baseUrl,
      'POST',
      '/api/v1/qa/uat',
      {
        testerRole: 'ADMIN',
        workflowName: 'Security Governance, Vault Restore & Master Settings',
        casesVerified: 12,
        feedback: 'Full enterprise governance verified.',
        acceptanceStatus: 'ACCEPTED',
      },
      adminCookies
    );
    assert.equal(adminUat.status, 201);

    // Manager tries final release approval -> MUST return 403 Forbidden
    const mgrApproveAttempt = await reqApi(
      baseUrl,
      'POST',
      '/api/v1/qa/release/approve',
      { releaseVersion: 'v1.9.0-RC1', releaseNotes: 'Manager trying release' },
      managerCookies
    );
    assert.equal(mgrApproveAttempt.status, 403);

    // All 8 gates now green -> READY_FOR_ADMIN_APPROVAL -> Admin approves RELEASED!
    const readyCheck = await reqApi(baseUrl, 'GET', '/api/v1/qa/release/readiness', undefined, adminCookies);
    assert.equal(readyCheck.status, 200);
    assert.equal(readyCheck.json.data.canApprove, true);
    assert.equal(readyCheck.json.data.releaseStatus, 'READY_FOR_ADMIN_APPROVAL');

    const finalApprove = await reqApi(
      baseUrl,
      'POST',
      '/api/v1/qa/release/approve',
      {
        releaseVersion: 'v1.9.0-RC1',
        releaseNotes: 'Verified all Phase 01-09 gates cleanly.',
        markReleased: true,
      },
      adminCookies
    );
    assert.equal(finalApprove.status, 200);
    assert.equal(finalApprove.json.data.releaseStatus, 'RELEASED');

    // -------------------------------------------------------------------------
    // 6. Bilingual QA Report Exports (EN + BN PDFKit & 10-Sheet ExcelJS XLSX)
    // -------------------------------------------------------------------------
    const pdfEn = await reqApi(baseUrl, 'POST', '/api/v1/qa/reports/pdf', { language: 'en' }, adminCookies);
    assert.equal(pdfEn.status, 200);
    assert.equal(pdfEn.buffer.subarray(0, 5).toString('ascii'), '%PDF-');

    const pdfBn = await reqApi(baseUrl, 'POST', '/api/v1/qa/reports/pdf', { language: 'bn' }, adminCookies);
    assert.equal(pdfBn.status, 200);
    assert.equal(pdfBn.buffer.subarray(0, 5).toString('ascii'), '%PDF-');

    const xlsxEn = await reqApi(baseUrl, 'POST', '/api/v1/qa/reports/excel', { language: 'bn' }, adminCookies);
    assert.equal(xlsxEn.status, 200);
    assert.equal(xlsxEn.buffer.subarray(0, 2).toString('ascii'), 'PK');

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(xlsxEn.buffer as any);
    assert.equal(wb.worksheets.length, 10, 'Expected 10 QA Excel worksheets');
    assert.ok(wb.getWorksheet('Executive Summary'));
    assert.ok(wb.getWorksheet('Test Case Register'));
    assert.ok(wb.getWorksheet('Bug Register'));
    assert.ok(wb.getWorksheet('Financial Reconciliation'));
    assert.ok(wb.getWorksheet('Backup Verification'));

    // Verify Phase 08 hash-chained audit trail remained 100% valid across all Phase 09 operations
    const auditChain = phase08Store.verifyAuditChainIntegrity();
    assert.equal(auditChain.valid, true);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
