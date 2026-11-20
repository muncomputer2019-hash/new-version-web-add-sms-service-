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
import { hmacOtp } from '../server/crypto';
import { seedTestFixtures } from '../server/testFixtures';

interface HttpBinaryResult {
  status: number;
  headers: Headers;
  buffer: Buffer;
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
): Promise<HttpBinaryResult> {
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

  const ab = await res.arrayBuffer();
  const buffer = Buffer.from(ab);
  let json: any = null;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json') || ct.includes('text/plain')) {
    try {
      json = JSON.parse(buffer.toString('utf8'));
    } catch {
      json = null;
    }
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
    json,
    cookies: extractSetCookies(setCookies),
  };
}

function issueCaptcha(store: SecurityStore): { id: string; answer: string } {
  const id = `rep-cap-${Math.random().toString(36).slice(2, 10)}`;
  const answer = 'R7M2K';
  store.captchaChallenges.set(id, {
    id,
    answerHash: hmacOtp(answer, id),
    expiresAt: Date.now() + 60_000,
  });
  return { id, answer };
}

async function loginAs(
  baseUrl: string,
  store: SecurityStore,
  userId: string,
  password: string
): Promise<Record<string, string>> {
  const cap = issueCaptcha(store);
  const res = await reqApi(baseUrl, 'POST', '/api/auth/login', {
    userId,
    password,
    captchaId: cap.id,
    captchaAnswer: cap.answer,
  });
  assert.equal(res.status, 200, `Expected login 200 for ${userId}, got ${res.status}`);
  if (res.json?.data?.challengeId && res.json?.data?.sandboxOtpPreview) {
    const verifyRes = await reqApi(baseUrl, 'POST', '/api/auth/verify-otp', {
      challengeId: res.json.data.challengeId,
      otp: res.json.data.sandboxOtpPreview,
    });
    assert.equal(verifyRes.status, 200, `Expected OTP verify 200 for ${userId}`);
    return verifyRes.cookies;
  }
  return res.cookies;
}

async function setupServer() {
  const securityStore = new SecurityStore();
  const phase03Store = new Phase03Store();
  const erpStore = new ErpStore(securityStore, phase03Store);
  const financeStore = new FinanceStore(securityStore, phase03Store, erpStore);
  const reportStore = new ReportStore();
  seedTestFixtures({ phase03Store, erpStore, financeStore });

  const app = createApp(securityStore, {
    enableRateLimit: false,
    phase03Store,
    erpStore,
    financeStore,
    reportStore,
    enableReportScheduler: false,
  });

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    baseUrl,
    securityStore,
    phase03Store,
    erpStore,
    financeStore,
    reportStore,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

test('Phase 07 Reporting, Financial Accuracy, Custom Builder, PDF/Excel/CSV Export, Scheduler, Archive & RBAC', async (t) => {
  const ctx = await setupServer();
  t.after(async () => {
    await ctx.close();
  });

  const adminCookies = await loginAs(ctx.baseUrl, ctx.securityStore, 'MC2627110001', '8101352105');
  const managerCookies = await loginAs(ctx.baseUrl, ctx.securityStore, 'MC2627110002', 'Manager@2026!');
  const staffCookies = await loginAs(ctx.baseUrl, ctx.securityStore, 'MC2627110003', 'Staff@2026!');
  const auditorCookies = await loginAs(ctx.baseUrl, ctx.securityStore, 'MC2627110004', 'Auditor@2026!');

  // --------------------------------------------------------------------------
  // 1. RBAC Enforcement: STAFF blocked by default + Audit log records UNAUTHORIZED_ACCESS
  // --------------------------------------------------------------------------
  const staffDashBlocked = await reqApi(ctx.baseUrl, 'GET', '/api/v1/reports/dashboard', undefined, staffCookies);
  assert.equal(staffDashBlocked.status, 403);

  const staffPdfBlocked = await reqApi(
    ctx.baseUrl,
    'POST',
    '/api/v1/reports/export/pdf',
    { reportKey: 'CUST_COMPLETE_LIST' },
    staffCookies
  );
  assert.equal(staffPdfBlocked.status, 403);

  const staffAuditBlocked = await reqApi(ctx.baseUrl, 'GET', '/api/v1/reports/audit-logs', undefined, staffCookies);
  assert.equal(staffAuditBlocked.status, 403);

  assert.ok(
    ctx.reportStore.auditLogs.some((l) => l.actorUserId === 'MC2627110003' && l.action === 'UNAUTHORIZED_ACCESS'),
    'Unauthorized attempts must be logged cleanly'
  );

  // --------------------------------------------------------------------------
  // 2. Dashboard KPIs & Catalog Availability (Module gating for LPG)
  // --------------------------------------------------------------------------
  const dashRes = await reqApi(ctx.baseUrl, 'GET', '/api/v1/reports/dashboard', undefined, adminCookies);
  assert.equal(dashRes.status, 200);
  const kpis = dashRes.json.data.kpis;
  assert.ok(kpis.totalCustomers >= 3);
  assert.ok(kpis.totalApplications >= 2);
  assert.ok(kpis.totalCollections > 0);
  assert.equal(
    kpis.netProfit,
    Number((kpis.totalIncome - kpis.totalExpenses).toFixed(2)),
    'Net profit must reconcile strictly with Income - Expenses'
  );

  const catalogRes = await reqApi(ctx.baseUrl, 'GET', '/api/v1/reports/catalog', undefined, adminCookies);
  assert.equal(catalogRes.status, 200);
  const catalog = catalogRes.json.data as Array<{ reportKey: string; enabled: boolean }>;
  assert.ok(catalog.length >= 45, 'Full catalog should cover all Customer, App/Service, Financial & active Business reports');
  const lpgReport = catalog.find((c) => c.reportKey === 'BIZ_LPG_REPORT');
  assert.equal(lpgReport, undefined, 'LPG report must stay hidden when LPG module is inactive');
  assert.equal(
    dashRes.json.data.enabledBusinessModules.find((m: any) => m.key === 'LPG')?.enabled,
    false,
    'Dashboard module matrix must mark LPG inactive'
  );

  // --------------------------------------------------------------------------
  // 3. Financial Integrity: Cancelled/Reversed Exclusion & PNB CSP Principal Isolation
  // --------------------------------------------------------------------------
  const custRes = await reqApi(
    ctx.baseUrl,
    'POST',
    '/api/v1/reports/generate',
    { reportKey: 'CUST_COMPLETE_LIST' },
    adminCookies
  );
  assert.equal(custRes.status, 200);
  assert.ok(custRes.json.data.rows.length >= 3);

  const pnlRes = await reqApi(
    ctx.baseUrl,
    'POST',
    '/api/v1/reports/generate',
    { reportKey: 'FIN_PNL_STATEMENT' },
    adminCookies
  );
  assert.equal(pnlRes.status, 200);
  const bsRes = await reqApi(
    ctx.baseUrl,
    'POST',
    '/api/v1/reports/generate',
    { reportKey: 'FIN_BALANCE_SHEET' },
    adminCookies
  );
  assert.equal(bsRes.status, 200);
  assert.ok(bsRes.json.data.notes.some((n: string) => n.includes('PNB CSP')));

  // Verify Balance Sheet includes PNB CSP segregation note and balances Assets = Liabilities + Equity
  const bsTotals = bsRes.json.data.totals;
  assert.ok(typeof bsTotals.totalAssets === 'number');
  assert.equal(bsTotals.equationDifference, 0, 'Balance Sheet equation difference must be 0');

  // Record a new PNB CSP Deposit — ensure Income/P&L stays untouched!
  const beforeIncome = pnlRes.json.data.totals.totalIncome;
  assert.ok(typeof beforeIncome === 'number');
  const cspTxRes = await reqApi(
    ctx.baseUrl,
    'POST',
    '/api/finance/pnb-csp',
    {
      txnType: 'Customer Deposit',
      customerRef: 'Test Beneficiary',
      principalAmount: 25000,
      commissionIncome: 0,
      remarks: 'CSP-REP-901',
    },
    adminCookies
  );
  assert.equal(cspTxRes.status, 201);

  const pnlAfterCsp = await reqApi(
    ctx.baseUrl,
    'POST',
    '/api/v1/reports/generate',
    { reportKey: 'FIN_PNL_STATEMENT' },
    adminCookies
  );
  assert.equal(
    pnlAfterCsp.json.data.totals.totalIncome,
    beforeIncome,
    'PNB CSP customer deposit principal must NEVER inflate MUN COMPUTER P&L income'
  );

  // --------------------------------------------------------------------------
  // 4. Business Analytics (All 13 perspectives + Forecast ESTIMATE disclaimer)
  // --------------------------------------------------------------------------
  const analyticsRes = await reqApi(
    ctx.baseUrl,
    'GET',
    '/api/v1/reports/analytics?granularity=monthly',
    undefined,
    adminCookies
  );
  assert.equal(analyticsRes.status, 200);
  const analytics = analyticsRes.json.data;
  assert.ok(Array.isArray(analytics.revenueGrowth));
  assert.ok(Array.isArray(analytics.top10Services));
  assert.ok(Array.isArray(analytics.top10Customers));
  assert.ok(analytics.businessGrowthForecast.disclaimer.includes('ESTIMATE'));
  assert.ok(analytics.businessGrowthForecast.points.some((p: any) => p.isEstimate === true));

  // --------------------------------------------------------------------------
  // 5. Custom Report Builder: AND/OR rules, Safe Formula, Injection Blocking & Template CRUD
  // --------------------------------------------------------------------------
  const builderRes = await reqApi(
    ctx.baseUrl,
    'POST',
    '/api/v1/reports/builder/execute',
    {
      dataSource: 'APPLICATIONS',
      selectedFields: ['applicationNo', 'customerName', 'serviceCharge', 'serviceCost', 'status'],
      filters: [{ field: 'serviceCharge', operator: 'gte', value: '100' }],
      filterLogic: 'AND',
      groupByField: 'status',
      calculatedColumns: [
        { key: 'calcMargin', label: 'Margin (₹)', expression: '[serviceCharge] - [serviceCost]', format: 'currency' },
      ],
      includeSubtotals: true,
      includeGrandTotal: true,
      title: 'Application Margin Verification',
    },
    adminCookies
  );
  assert.equal(builderRes.status, 200);
  assert.ok(builderRes.json.data.rows.length > 0);
  const firstNonSub = builderRes.json.data.rows.find((r: any) => !String(r.applicationNo).startsWith('Subtotal'));
  assert.equal(
    firstNonSub.calcMargin,
    Number((Number(firstNonSub.serviceCharge) - Number(firstNonSub.serviceCost)).toFixed(2))
  );

  // Reject unsafe formula / injection
  const badFormula = await reqApi(
    ctx.baseUrl,
    'POST',
    '/api/v1/reports/builder/execute',
    {
      dataSource: 'APPLICATIONS',
      selectedFields: ['applicationNo', 'serviceCharge'],
      filters: [],
      filterLogic: 'AND',
      calculatedColumns: [
        { key: 'evil', label: 'Evil', expression: 'process.exit(1)', format: 'number' },
      ],
    },
    adminCookies
  );
  assert.equal(badFormula.status, 422);

  // Template Create -> Duplicate -> Update -> Soft Delete
  const tplCreate = await reqApi(
    ctx.baseUrl,
    'POST',
    '/api/v1/reports/templates',
    {
      name: 'QA Audit Custom Template',
      dataSource: 'CUSTOMERS',
      selectedFields: ['customerId', 'fullName', 'village', 'totalPaid', 'pendingBalance'],
      filters: [],
      filterLogic: 'AND',
    },
    adminCookies
  );
  assert.equal(tplCreate.status, 201);
  const tplCode = tplCreate.json.data.templateCode;

  const tplDup = await reqApi(ctx.baseUrl, 'POST', `/api/v1/reports/templates/${tplCode}/duplicate`, {}, adminCookies);
  assert.equal(tplDup.status, 201);

  const tplUpdate = await reqApi(
    ctx.baseUrl,
    'PUT',
    `/api/v1/reports/templates/${tplCode}`,
    { name: 'QA Audit Custom Template v2' },
    adminCookies
  );
  assert.equal(tplUpdate.status, 200);
  assert.equal(tplUpdate.json.data.versionNo, 2);

  const tplDelete = await reqApi(
    ctx.baseUrl,
    'DELETE',
    `/api/v1/reports/templates/${tplCode}`,
    undefined,
    adminCookies
  );
  assert.equal(tplDelete.status, 200);

  // --------------------------------------------------------------------------
  // 6. Real Binary PDF Exports (Single, Bengali Unicode, Password Encrypted, Combined Multi-Section)
  // --------------------------------------------------------------------------
  const pdfSingle = await reqApi(
    ctx.baseUrl,
    'POST',
    '/api/v1/reports/export/pdf',
    {
      reportKey: 'CUST_COMPLETE_LIST',
      language: 'bn',
      pageSize: 'A4',
      orientation: 'landscape',
      includeWatermark: true,
      watermarkText: 'MUN AUDIT',
      includeLogo: true,
      password: 'MunSecret2026',
      saveToArchive: true,
    },
    adminCookies
  );
  assert.equal(pdfSingle.status, 200);
  assert.ok(pdfSingle.buffer.subarray(0, 5).toString('ascii') === '%PDF-');
  assert.ok(pdfSingle.buffer.toString('latin1').includes('/Encrypt'), 'Password-protected PDF must include /Encrypt dictionary');
  const singleArchiveCode = pdfSingle.headers.get('x-archive-code');
  assert.ok(singleArchiveCode && singleArchiveCode.startsWith('ARC-'));

  const pdfCombined = await reqApi(
    ctx.baseUrl,
    'POST',
    '/api/v1/reports/export/pdf',
    {
      reportKeys: ['CUST_COMPLETE_LIST', 'APP_TOTAL_REPORT', 'FIN_PNL_STATEMENT'],
      pageSize: 'CUSTOM',
      customWidthMm: 220,
      customHeightMm: 310,
      saveToArchive: true,
    },
    adminCookies
  );
  assert.equal(pdfCombined.status, 200);
  assert.ok(pdfCombined.buffer.subarray(0, 5).toString('ascii') === '%PDF-');
  assert.ok(pdfCombined.buffer.length > 3000);

  // --------------------------------------------------------------------------
  // 7. Real Multi-Sheet Excel (.xlsx) & UTF-8 BOM CSV Export Verification
  // --------------------------------------------------------------------------
  const xlsxRes = await reqApi(
    ctx.baseUrl,
    'POST',
    '/api/v1/reports/export/excel',
    {
      reportKey: 'APP_COLLECTION_REPORT',
      format: 'xlsx',
      language: 'en',
      saveToArchive: true,
    },
    adminCookies
  );
  assert.equal(xlsxRes.status, 200);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(xlsxRes.buffer as unknown as ArrayBuffer);
  assert.ok(workbook.getWorksheet('Executive Summary'));
  const dataWs = workbook.getWorksheet('Report Data');
  assert.ok(dataWs);
  assert.ok(workbook.getWorksheet('Pivot Ready Data'));
  assert.ok(workbook.getWorksheet('Charts & Series'));

  // Verify real Excel SUM formula was written
  let foundSumFormula = false;
  dataWs!.eachRow((row) => {
    row.eachCell((cell) => {
      const val = cell.value as { formula?: string } | null;
      if (val && typeof val === 'object' && typeof val.formula === 'string' && val.formula.includes('SUM')) {
        foundSumFormula = true;
      }
    });
  });
  assert.ok(foundSumFormula, 'Report Data worksheet must contain real Excel =SUM(...) formulas');

  const csvRes = await reqApi(
    ctx.baseUrl,
    'POST',
    '/api/v1/reports/export/excel',
    {
      reportKey: 'CUST_VILLAGE_WISE',
      format: 'csv',
      language: 'bn',
      saveToArchive: false,
    },
    adminCookies
  );
  assert.equal(csvRes.status, 200);
  assert.equal(csvRes.buffer[0], 0xef, 'CSV must include UTF-8 BOM for Excel Bengali compatibility');
  assert.ok(csvRes.buffer.toString('utf8').includes('Village'));

  // --------------------------------------------------------------------------
  // 8. Private Encrypted Archive Download, Reprint & Admin Deletion Governance
  // --------------------------------------------------------------------------
  const dlRes = await reqApi(
    ctx.baseUrl,
    'GET',
    `/api/v1/reports/archives/${singleArchiveCode}/download`,
    undefined,
    adminCookies
  );
  assert.equal(dlRes.status, 200);
  assert.deepEqual(dlRes.buffer, pdfSingle.buffer, 'Decrypted archive bytes must match original SHA-256 export');

  // Manager requests deletion, tries to approve (403), then Admin approves
  const delReq = await reqApi(
    ctx.baseUrl,
    'POST',
    `/api/v1/reports/archives/${singleArchiveCode}/delete-request`,
    { reason: 'Duplicate QA test archive cleanup' },
    managerCookies
  );
  assert.equal(delReq.status, 200);
  assert.equal(delReq.json.data.deletionStatus, 'PENDING_ADMIN_APPROVAL');

  const mgrApproveBlocked = await reqApi(
    ctx.baseUrl,
    'POST',
    `/api/v1/reports/archives/${singleArchiveCode}/delete-review`,
    { decision: 'APPROVE' },
    managerCookies
  );
  assert.equal(mgrApproveBlocked.status, 403);

  const admApprove = await reqApi(
    ctx.baseUrl,
    'POST',
    `/api/v1/reports/archives/${singleArchiveCode}/delete-review`,
    { decision: 'APPROVE' },
    adminCookies
  );
  assert.equal(admApprove.status, 200);
  assert.equal(admApprove.json.data.deletionStatus, 'DELETED');

  // --------------------------------------------------------------------------
  // 9. Automated Scheduler Run, Honest Unconfigured SMTP Status & Retry Flow
  // --------------------------------------------------------------------------
  const schedRun = await reqApi(
    ctx.baseUrl,
    'POST',
    '/api/v1/reports/schedules/SCH-2026-001/run',
    {},
    adminCookies
  );
  assert.equal(schedRun.status, 200);
  const runCode = schedRun.json.data.runCode;
  assert.equal(schedRun.json.data.status, 'PARTIAL', 'Internal delivers cleanly while unconfigured SMTP is reported honestly');
  assert.ok(
    schedRun.json.data.deliveryResults.some((d: any) => d.channel === 'EMAIL_SMTP' && d.status === 'Not Configured')
  );
  assert.ok(schedRun.json.data.archiveCodes.length === 1);

  const retryRes = await reqApi(
    ctx.baseUrl,
    'POST',
    `/api/v1/reports/schedule-runs/${runCode}/retry`,
    {},
    adminCookies
  );
  assert.equal(retryRes.status, 200);
  assert.equal(retryRes.json.data.attemptNo, 2);

  // --------------------------------------------------------------------------
  // 10. Role Checks: AUDITOR Read-Only & ADMIN Granting STAFF Partial Access
  // --------------------------------------------------------------------------
  const auditorPdf = await reqApi(
    ctx.baseUrl,
    'POST',
    '/api/v1/reports/export/pdf',
    { reportKey: 'FIN_CLOSING_BALANCE' },
    auditorCookies
  );
  assert.equal(auditorPdf.status, 200);
  const auditorCreateTplBlocked = await reqApi(
    ctx.baseUrl,
    'POST',
    '/api/v1/reports/templates',
    { name: 'Aud', dataSource: 'CUSTOMERS', selectedFields: ['customerId'] },
    auditorCookies
  );
  assert.equal(auditorCreateTplBlocked.status, 403);

  // Admin grants report.view + report.print to STAFF, STAFF still blocked from Financial reports & Analytics
  const grantStaff = await reqApi(
    ctx.baseUrl,
    'PUT',
    '/api/users/MC2627110003/permissions',
    { permissions: { 'report.view': true, 'report.print': true } },
    adminCookies
  );
  assert.equal(grantStaff.status, 200);

  const staffAllowedCust = await reqApi(
    ctx.baseUrl,
    'POST',
    '/api/v1/reports/generate',
    { reportKey: 'CUST_COMPLETE_LIST' },
    staffCookies
  );
  assert.equal(staffAllowedCust.status, 200);

  const staffStillBlockedFin = await reqApi(
    ctx.baseUrl,
    'POST',
    '/api/v1/reports/generate',
    { reportKey: 'FIN_PNL_STATEMENT' },
    staffCookies
  );
  assert.equal(staffStillBlockedFin.status, 403);

  // --------------------------------------------------------------------------
  // 11. Large Dataset Performance Benchmark (1,200 customers -> XLSX & PDF)
  // --------------------------------------------------------------------------
  for (let i = 0; i < 1200; i++) {
    ctx.erpStore.customers.push({
      id: 5000 + i,
      customerId: `CUST-PERF-${String(i).padStart(4, '0')}`,
      fullName: `Benchmark Customer ${i}`,
      fatherOrHusbandName: 'Parent',
      dob: '1995-01-01',
      gender: 'Male',
      mobile: `90000${String(i).padStart(5, '0')}`,
      whatsapp: `90000${String(i).padStart(5, '0')}`,
      email: `perf${i}@example.com`,
      village: i % 2 === 0 ? 'Mamudpur' : 'Juginda',
      postOffice: 'Juginda',
      policeStation: 'Domkal',
      district: 'Murshidabad',
      pinCode: '742406',
      presentAddress: 'Mamudpur',
      permanentAddress: 'Mamudpur',
      sameAsPresent: true,
      segment: 'Individual',
      crmTag: 'Regular',
      status: 'Active',
      verificationStatus: 'Fully Verified',
      mobileOtpVerifiedAt: '2026-04-01T10:00:00Z',
      consents: [],
      consentHistory: [],
      contactHistory: [],
      notesAndFollowUps: [],
      statusHistory: [],
      createdBy: 'MC2627110001',
      deletedAt: null,
      createdAt: '2026-04-10T10:00:00Z',
      updatedAt: '2026-04-10T10:00:00Z',
    });
  }

  const t0 = Date.now();
  const perfXlsx = await reqApi(
    ctx.baseUrl,
    'POST',
    '/api/v1/reports/export/excel',
    { reportKey: 'CUST_COMPLETE_LIST', format: 'xlsx', saveToArchive: false },
    adminCookies
  );
  const elapsedMs = Date.now() - t0;
  assert.equal(perfXlsx.status, 200);
  assert.ok(elapsedMs < 8000, `1,200-row XLSX export took ${elapsedMs}ms (expected < 8000ms)`);
});
