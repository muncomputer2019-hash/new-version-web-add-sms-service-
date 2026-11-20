import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import { createApp } from '../server/app';
import { SecurityStore } from '../server/securityStore';
import { Phase03Store } from '../server/phase03Store';
import { ErpStore } from '../server/erpStore';
import { FinanceStore } from '../server/finance/financeStore';
import { hmacOtp } from '../server/crypto';
import { seedTestFixtures } from '../server/testFixtures';

interface HttpResult {
  status: number;
  body: any;
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

async function requestApi(
  baseUrl: string,
  method: string,
  path: string,
  body?: unknown,
  cookies: Record<string, string> = {}
): Promise<HttpResult> {
  const cookieHeader = Object.entries(cookies)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('; ');

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      ...(cookies.mun_csrf ? { 'X-CSRF-Token': cookies.mun_csrf } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const rawText = await res.text();
  let parsed: any = null;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    parsed = rawText;
  }

  const setCookies =
    typeof (res.headers as any).getSetCookie === 'function'
      ? (res.headers as any).getSetCookie()
      : res.headers.get('set-cookie')
      ? [res.headers.get('set-cookie')!]
      : [];

  return {
    status: res.status,
    body: parsed,
    cookies: extractSetCookies(setCookies),
  };
}

function issueTestCaptcha(store: SecurityStore): { id: string; answer: string } {
  const id = `fin-cap-${Math.random().toString(36).slice(2, 10)}`;
  const answer = 'F9P4X';
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
) {
  const cap = issueTestCaptcha(store);
  const loginRes = await requestApi(baseUrl, 'POST', '/api/auth/login', {
    userId,
    password,
    captchaId: cap.id,
    captchaAnswer: cap.answer,
    rememberMe: false,
  });
  assert.equal(loginRes.status, 200, `Login failed for ${userId}: ${loginRes.body?.message}`);
  const otp = loginRes.body.data.sandboxOtpPreview;
  const challengeId = loginRes.body.data.challengeId;
  const verifyRes = await requestApi(baseUrl, 'POST', '/api/auth/verify-otp', {
    challengeId,
    otp,
  });
  assert.equal(verifyRes.status, 200, `OTP verify failed for ${userId}`);
  return verifyRes.cookies;
}

function startFinanceTestServer() {
  const securityStore = new SecurityStore();
  const phase03Store = new Phase03Store();
  const erpStore = new ErpStore(securityStore, phase03Store);
  const financeStore = new FinanceStore(securityStore, phase03Store, erpStore);
  seedTestFixtures({ phase03Store, erpStore, financeStore });
  const app = createApp(securityStore, {
    enableRateLimit: false,
    phase03Store,
    erpStore,
    financeStore,
  });
  const server = http.createServer(app);
  return { server, securityStore, erpStore, financeStore };
}

test('Phase 05 Financial Engine: Double-Entry, Period Lock, Maker-Checker, PNB CSP Isolation, ERP Sync & Audit', async () => {
  const { server, securityStore, erpStore } = startFinanceTestServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const adminCookies = await loginAs(baseUrl, securityStore, 'MC2627110001', '8101352105');
    const managerCookies = await loginAs(baseUrl, securityStore, 'MC2627110002', 'Manager@2026!');
    const auditorCookies = await loginAs(baseUrl, securityStore, 'MC2627110004', 'Auditor@2026!');

    // 1. Initial Trial Balance & Balance Sheet Equations
    const ov1 = await requestApi(baseUrl, 'GET', '/api/finance/overview?entityCode=ENT-MAIN', undefined, adminCookies);
    assert.equal(ov1.status, 200);
    assert.equal(ov1.body.data.statements.trialBalance.isBalanced, true);
    assert.equal(ov1.body.data.statements.trialBalance.difference, 0);
    assert.equal(ov1.body.data.statements.balanceSheet.isBalanced, true);
    assert.equal(ov1.body.data.statements.balanceSheet.equationDifference, 0);

    const baselineIncome = ov1.body.data.kpis.totalIncome;
    const baselineAssets = ov1.body.data.kpis.totalAssets;

    // 2. Reject unbalanced voucher, Group Account posting, and Closed Period posting
    const unbalancedRes = await requestApi(
      baseUrl,
      'POST',
      '/api/finance/vouchers',
      {
        voucherDate: '2026-11-16',
        narration: 'Unbalanced entry test',
        lines: [
          { accountCode: '6030', debitAmount: 500, creditAmount: 0 },
          { accountCode: '1001', debitAmount: 0, creditAmount: 450 },
        ],
      },
      adminCookies
    );
    assert.equal(unbalancedRes.status, 422);

    const groupAccRes = await requestApi(
      baseUrl,
      'POST',
      '/api/finance/vouchers',
      {
        voucherDate: '2026-11-16',
        narration: 'Group account rejection test',
        lines: [
          { accountCode: '1000', debitAmount: 100, creditAmount: 0 },
          { accountCode: '4001', debitAmount: 0, creditAmount: 100 },
        ],
      },
      adminCookies
    );
    assert.equal(groupAccRes.status, 422);

    const closedPeriodRes = await requestApi(
      baseUrl,
      'POST',
      '/api/finance/vouchers',
      {
        voucherDate: '2026-10-15',
        narration: 'Backdated into closed October 2026',
        lines: [
          { accountCode: '6030', debitAmount: 100, creditAmount: 0 },
          { accountCode: '1001', debitAmount: 0, creditAmount: 100 },
        ],
      },
      adminCookies
    );
    assert.equal(closedPeriodRes.status, 422);

    // Period Reopen requires audit reason (>=5 chars)
    const badReopen = await requestApi(
      baseUrl,
      'POST',
      '/api/finance/periods/2026-10/status',
      { status: 'Reopened', reason: 'no' },
      adminCookies
    );
    assert.equal(badReopen.status, 422);

    const goodReopen = await requestApi(
      baseUrl,
      'POST',
      '/api/finance/periods/2026-10/status',
      { status: 'Reopened', reason: 'Year-end auditor adjustment check' },
      adminCookies
    );
    assert.equal(goodReopen.status, 200);

    // Close it back
    await requestApi(
      baseUrl,
      'POST',
      '/api/finance/periods/2026-10/status',
      { status: 'Closed', reason: 'Re-locked after test verification' },
      adminCookies
    );

    // 3. CoA protection: unused can be archived, used cannot
    const coaNew = await requestApi(
      baseUrl,
      'POST',
      '/api/finance/coa',
      { accountCode: '6075', accountName: 'Test Courier Charges', accountType: 'Expense' },
      adminCookies
    );
    assert.equal(coaNew.status, 201);
    const delUsed = await requestApi(baseUrl, 'DELETE', '/api/finance/coa/1001', undefined, adminCookies);
    assert.equal(delUsed.status, 400);
    const delUnused = await requestApi(baseUrl, 'DELETE', '/api/finance/coa/6075', undefined, adminCookies);
    assert.equal(delUnused.status, 200);

    // 4. Maker-Checker (>=5000 by Manager -> Pending_Approval; self-approve blocked; Admin approves; Admin reverses)
    const mgrVoucher = await requestApi(
      baseUrl,
      'POST',
      '/api/finance/vouchers',
      {
        voucherDate: '2026-11-16',
        voucherType: 'Expense',
        narration: 'High-value server upgrade expenditure',
        lines: [
          { accountCode: '6030', debitAmount: 6000, creditAmount: 0 },
          { accountCode: '1010', debitAmount: 0, creditAmount: 6000 },
        ],
      },
      managerCookies
    );
    assert.equal(mgrVoucher.status, 201);
    assert.equal(mgrVoucher.body.data.status, 'Pending_Approval');
    const pendingVNo = mgrVoucher.body.data.voucherNo;

    const selfApprove = await requestApi(
      baseUrl,
      'POST',
      `/api/finance/vouchers/${pendingVNo}/approve`,
      {},
      managerCookies
    );
    assert.equal(selfApprove.status, 403);

    const adminApprove = await requestApi(
      baseUrl,
      'POST',
      `/api/finance/vouchers/${pendingVNo}/approve`,
      {},
      adminCookies
    );
    assert.equal(adminApprove.status, 200);
    assert.equal(adminApprove.body.data.status, 'Posted');

    const adminReverse = await requestApi(
      baseUrl,
      'POST',
      `/api/finance/vouchers/${pendingVNo}/reverse`,
      { reason: 'Reversal audit test' },
      adminCookies
    );
    assert.equal(adminReverse.status, 200);
    assert.equal(adminReverse.body.data.original.status, 'Reversed');

    // 5. CRITICAL: PNB CSP Financial Segregation
    const cspRes = await requestApi(
      baseUrl,
      'POST',
      '/api/finance/pnb-csp',
      {
        txnType: 'Customer Deposit',
        customerRef: 'PNB-ACCT-88412',
        principalAmount: 25000,
        commissionIncome: 75,
        remarks: 'Customer cash deposit via CSP portal',
      },
      managerCookies
    );
    assert.equal(cspRes.status, 201);

    const ovAfterCsp = await requestApi(baseUrl, 'GET', '/api/finance/overview?entityCode=ENT-MAIN', undefined, adminCookies);
    assert.equal(ovAfterCsp.status, 200);
    // Business Income increases ONLY by ₹75 commission, NOT ₹25,000 customer banking principal!
    assert.equal(ovAfterCsp.body.data.kpis.totalIncome, baselineIncome + 75);
    assert.ok(
      ovAfterCsp.body.data.kpis.totalAssets < baselineAssets + 1000,
      '₹25,000 customer CSP cash must remain strictly isolated from MUN COMPUTER ENT-MAIN Balance Sheet Assets'
    );

    // 6. ERP -> GL Live Synchronization (Expense & Payment)
    const expRes = await requestApi(
      baseUrl,
      'POST',
      '/api/erp/expenses',
      {
        category: 'Stationery & Toner',
        description: 'Laser printer toner cartridge',
        counterCode: 'CTR-01',
        amount: 350,
      },
      adminCookies
    );
    assert.equal(expRes.status, 201);

    // Record ERP Cash Payment against MCA-20261116-0003 (pending balance)
    const targetApp = erpStore.applications.find((a) => a.applicationNo === 'MCA-20261116-0003');
    if (targetApp) {
      const payRes = await requestApi(
        baseUrl,
        'POST',
        '/api/erp/payments',
        {
          applicationNo: 'MCA-20261116-0003',
          paymentMethod: 'Cash',
          amount: 100,
          counterCode: 'CTR-01',
        },
        adminCookies
      );
      assert.equal(payRes.status, 201);
    }

    // 7. Payroll Run + Duplicate Guard
    const payRun = await requestApi(
      baseUrl,
      'POST',
      '/api/finance/payroll/run',
      { monthCode: '2026-11' },
      adminCookies
    );
    assert.equal(payRun.status, 201);
    const dupPayRun = await requestApi(
      baseUrl,
      'POST',
      '/api/finance/payroll/run',
      { monthCode: '2026-11' },
      adminCookies
    );
    assert.equal(dupPayRun.status, 400);

    // 8. Inventory FIFO POS Sale + COGS + GST
    const posSale = await requestApi(
      baseUrl,
      'POST',
      '/api/v1/inventory/pos-sale',
      { sku: 'PRD-SSD-512', quantity: 2, customerName: 'Walk-in POS Buyer', paymentMethod: 'Cash' },
      managerCookies
    );
    assert.equal(posSale.status, 201);
    assert.ok(posSale.body.data.movement.cogsTotal > 0);

    // 9. Supplier Bill + Pay + Depreciation + Loan EMI + Equity + Franchise + Migration + Vault OCR
    const billRes = await requestApi(
      baseUrl,
      'POST',
      '/api/finance/supplier-bills',
      { supplierId: 'SUP-001', subtotal: 1000, gstAmount: 180, tdsRatePct: 2 },
      adminCookies
    );
    assert.equal(billRes.status, 201);
    const payBill = await requestApi(
      baseUrl,
      'POST',
      `/api/finance/supplier-bills/${billRes.body.data.billNo}/pay`,
      { paymentMode: 'Bank' },
      adminCookies
    );
    assert.equal(payBill.status, 200);

    const depRes = await requestApi(baseUrl, 'POST', '/api/finance/assets/run-depreciation', { months: 1 }, adminCookies);
    assert.equal(depRes.status, 201);

    const emiRes = await requestApi(baseUrl, 'POST', '/api/finance/loans/LN-2025-01/pay-emi', {}, adminCookies);
    assert.equal(emiRes.status, 201);
    assert.ok(emiRes.body.data.principalPart > 0 && emiRes.body.data.interestPart > 0);

    const migDry = await requestApi(
      baseUrl,
      'POST',
      '/api/finance/import/dry-run-and-commit',
      {
        importType: 'Opening Balances',
        commit: true,
        rows: [{ debitAccountCode: '1001', creditAccountCode: '4130', amount: 200, narration: 'Migration batch test' }],
      },
      adminCookies
    );
    assert.equal(migDry.status, 200);
    const rollbackRes = await requestApi(
      baseUrl,
      'POST',
      `/api/finance/import/${migDry.body.data.batch.batchId}/rollback`,
      {},
      adminCookies
    );
    assert.equal(rollbackRes.status, 200);
    assert.equal(rollbackRes.body.data.status, 'Rolled Back');

    const ocrIntake = await requestApi(
      baseUrl,
      'POST',
      '/api/finance/vault/ocr-intake',
      { title: 'Scanned Internet Receipt', extractedVendor: 'BSNL Fiber', extractedAmount: 999 },
      managerCookies
    );
    assert.equal(ocrIntake.status, 201);
    assert.equal(ocrIntake.body.data.humanVerified, false);

    const verifyPost = await requestApi(
      baseUrl,
      'POST',
      `/api/finance/vault/${ocrIntake.body.data.vaultId}/verify-and-post`,
      { amount: 999 },
      adminCookies
    );
    assert.equal(verifyPost.status, 200);
    assert.equal(verifyPost.body.data.doc.humanVerified, true);

    // 10. AUDITOR Role Read-Only Enforcement
    const audRead = await requestApi(baseUrl, 'GET', '/api/finance/overview?entityCode=ALL', undefined, auditorCookies);
    assert.equal(audRead.status, 200);
    assert.equal(audRead.body.data.statements.trialBalance.isBalanced, true);
    assert.equal(audRead.body.data.statements.balanceSheet.isBalanced, true);

    const audWriteVoucher = await requestApi(
      baseUrl,
      'POST',
      '/api/finance/vouchers',
      {
        voucherDate: '2026-11-16',
        narration: 'Auditor should never be allowed to post',
        lines: [
          { accountCode: '6030', debitAmount: 100, creditAmount: 0 },
          { accountCode: '1001', debitAmount: 0, creditAmount: 100 },
        ],
      },
      auditorCookies
    );
    assert.equal(audWriteVoucher.status, 403);

    const audWriteCsp = await requestApi(
      baseUrl,
      'POST',
      '/api/finance/pnb-csp',
      { txnType: 'Customer Deposit', customerRef: 'X', principalAmount: 100, commissionIncome: 1 },
      auditorCookies
    );
    assert.equal(audWriteCsp.status, 403);

    const audWriteErpExp = await requestApi(
      baseUrl,
      'POST',
      '/api/erp/expenses',
      { category: 'Misc', description: 'Blocked write', counterCode: 'CTR-01', amount: 50 },
      auditorCookies
    );
    assert.equal(audWriteErpExp.status, 403);

    // 11. Scoped Customer Self-Service Lookup & Read-Only AI Assistant Fallback
    const badPortal = await requestApi(
      baseUrl,
      'POST',
      '/api/finance/customer-portal/lookup',
      { customerId: 'MCC-2026-27-000001', mobileLast4: '9999' },
      adminCookies
    );
    assert.equal(badPortal.status, 404);

    const cust01 = erpStore.customers.find((c) => c.customerId === 'MCC-2026-27-000001');
    assert.ok(cust01);
    const goodPortal = await requestApi(
      baseUrl,
      'POST',
      '/api/finance/customer-portal/lookup',
      { customerId: 'MCC-2026-27-000001', mobileLast4: cust01!.mobile.slice(-4) },
      adminCookies
    );
    assert.equal(goodPortal.status, 200);
    assert.equal(goodPortal.body.data.customerId, 'MCC-2026-27-000001');

    const aiCheck = await requestApi(
      baseUrl,
      'POST',
      '/api/finance/ai-assistant',
      { question: 'What is the net profit?' },
      auditorCookies
    );
    assert.equal(aiCheck.status, 200);
    assert.equal(aiCheck.body.data.readOnly, true);

    // 12. Live Self-Audit Verification & Certificate (Module 94)
    const auditRun = await requestApi(
      baseUrl,
      'POST',
      '/api/finance/audit/run-verification',
      {},
      auditorCookies
    );
    assert.equal(auditRun.status, 200);
    assert.equal(auditRun.body.data.overallVerdict, 'VERIFIED_PASS');
    assert.equal(auditRun.body.data.checksPassed, auditRun.body.data.totalChecks);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
