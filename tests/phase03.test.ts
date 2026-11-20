import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import { createApp } from '../server/app';
import { SecurityStore } from '../server/securityStore';
import { Phase03Store } from '../server/phase03Store';
import { hmacOtp } from '../server/crypto';
import { seedTestFixtures } from '../server/testFixtures';

interface HttpResult {
  status: number;
  body: any;
  rawText: string;
  cookies: Record<string, string>;
}

function extractSetCookies(rawList: string[]): Record<string, string> {
  const jar: Record<string, string> = {};
  for (const entry of rawList) {
    const firstPart = entry.split(';')[0];
    const idx = firstPart.indexOf('=');
    if (idx > -1) {
      jar[firstPart.slice(0, idx).trim()] = decodeURIComponent(
        firstPart.slice(idx + 1).trim()
      );
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
    rawText,
    cookies: extractSetCookies(setCookies),
  };
}

function issueTestCaptcha(store: SecurityStore): { id: string; answer: string } {
  const id = `p3-cap-${Math.random().toString(36).slice(2, 10)}`;
  const answer = 'M9P4R';
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
  const otpRes = await requestApi(baseUrl, 'POST', '/api/auth/verify-otp', {
    challengeId: loginRes.body.data.challengeId,
    otp,
  });
  assert.equal(otpRes.status, 200);
  return {
    cookies: otpRes.cookies,
    user: otpRes.body.data.user,
  };
}

async function withServer(
  fn: (baseUrl: string, securityStore: SecurityStore, p3Store: Phase03Store) => Promise<void>
) {
  const securityStore = new SecurityStore();
  const p3Store = new Phase03Store();
  seedTestFixtures({ phase03Store: p3Store });
  const app = createApp(securityStore, { enableRateLimit: false, phase03Store: p3Store });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await fn(baseUrl, securityStore, p3Store);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
  }
}

test('P3-1. RBAC protection: non-Admin blocked (403) from Admin Master Settings & Staff blocked from proposals', async () => {
  await withServer(async (baseUrl, store) => {
    const manager = await loginAs(baseUrl, store, 'MC2627110002', 'Manager@2026!');
    const staff = await loginAs(baseUrl, store, 'MC2627110003', 'Staff@2026!');

    // Manager & Staff cannot call Admin-only Master Settings endpoints
    for (const actor of [manager, staff]) {
      const compRes = await requestApi(
        baseUrl,
        'PUT',
        '/api/master-settings/company-profile',
        { companyName: 'Unauthorized', addressLine: 'X', pinCode: '712405', mobile: '+911111111111' },
        actor.cookies
      );
      assert.equal(compRes.status, 403);

      const rateRes = await requestApi(
        baseUrl,
        'POST',
        '/api/service-rates',
        { serviceCode: 'PAN-X', serviceName: 'X', customerCharge: 100, serviceCost: 20 },
        actor.cookies
      );
      assert.equal(rateRes.status, 403);

      const bakRes = await requestApi(
        baseUrl,
        'POST',
        '/api/backups',
        { storageTarget: 'Hosting Server' },
        actor.cookies
      );
      assert.equal(bakRes.status, 403);

      const intRes = await requestApi(
        baseUrl,
        'PUT',
        '/api/integrations/SMS',
        { providerName: 'Test', endpointOrHost: 'https://sms.invalid', apiSecret: 'sec' },
        actor.cookies
      );
      assert.equal(intRes.status, 403);

      const maintRes = await requestApi(
        baseUrl,
        'PUT',
        '/api/master-settings/maintenance',
        { maintenanceMode: true },
        actor.cookies
      );
      assert.equal(maintRes.status, 403);
    }

    // Staff cannot view or submit settings proposals
    assert.equal(
      (await requestApi(baseUrl, 'GET', '/api/settings-proposals', undefined, staff.cookies)).status,
      403
    );
    assert.equal(
      (
        await requestApi(
          baseUrl,
          'POST',
          '/api/settings-proposals',
          {
            settingModule: 'Service Rate Management',
            settingName: 'Test',
            proposedValue: { serviceCode: 'PAN-NEW', customerCharge: 300 },
            changeReason: 'Test',
          },
          staff.cookies
        )
      ).status,
      403
    );
  });
});

test('P3-2. Strong Password Policy enforced across user creation and password reset', async () => {
  await withServer(async (baseUrl, store) => {
    const admin = await loginAs(baseUrl, store, 'MC2627110001', '8101352105');

    const weakCreate = await requestApi(
      baseUrl,
      'POST',
      '/api/users',
      {
        fullName: 'Weak Password Staff',
        role: 'STAFF',
        mobile: '+919876543210',
        address: 'Dhaniakhali',
        password: 'password123',
        confirmPassword: 'password123',
      },
      admin.cookies
    );
    assert.equal(weakCreate.status, 422);

    const strongCreate = await requestApi(
      baseUrl,
      'POST',
      '/api/users',
      {
        fullName: 'Strong Password Staff',
        role: 'STAFF',
        mobile: '+919876543210',
        address: 'Dhaniakhali',
        password: 'StrongPass@2026',
        confirmPassword: 'StrongPass@2026',
      },
      admin.cookies
    );
    assert.equal(strongCreate.status, 201);
  });
});

test('P3-3. Settings Approval Workflow: Manager proposes -> live unchanged -> Admin rejects/approves + no self-approval', async () => {
  await withServer(async (baseUrl, store) => {
    const manager = await loginAs(baseUrl, store, 'MC2627110002', 'Manager@2026!');
    const admin = await loginAs(baseUrl, store, 'MC2627110001', '8101352105');

    // Baseline MC2627SRV-001 rate
    const beforeRates = await requestApi(baseUrl, 'GET', '/api/service-rates', undefined, admin.cookies);
    const baselineSrv = beforeRates.body.data.rates.find((r: any) => r.serviceCode === 'MC2627SRV-001');
    assert.ok(baselineSrv);
    const initialCharge = baselineSrv.customerCharge;

    // 1. Manager submits Proposal 1 (will be rejected)
    const prop1 = await requestApi(
      baseUrl,
      'POST',
      '/api/settings-proposals',
      {
        settingModule: 'Service Rate Management',
        settingName: 'MC2627SRV-001 Fee Test Rejection',
        oldValue: { customerCharge: initialCharge },
        proposedValue: { serviceCode: 'MC2627SRV-001', customerCharge: 999, serviceCost: 150 },
        changeReason: 'Test unapproved fee spike',
      },
      manager.cookies
    );
    assert.equal(prop1.status, 201);

    // Live rate must stay untouched while Pending
    const midRates = await requestApi(baseUrl, 'GET', '/api/service-rates', undefined, admin.cookies);
    assert.equal(
      midRates.body.data.rates.find((r: any) => r.serviceCode === 'MC2627SRV-001').customerCharge,
      initialCharge
    );

    // Reject Proposal 1
    const rejRes = await requestApi(
      baseUrl,
      'POST',
      `/api/settings-proposals/${prop1.body.data.proposalId}/reject`,
      { rejectionReason: 'Exceeds approved tariff schedule' },
      admin.cookies
    );
    assert.equal(rejRes.status, 200);
    assert.equal(rejRes.body.data.approvalStatus, 'Rejected');

    // Live rate still unchanged
    const afterRejRates = await requestApi(baseUrl, 'GET', '/api/service-rates', undefined, admin.cookies);
    assert.equal(
      afterRejRates.body.data.rates.find((r: any) => r.serviceCode === 'MC2627SRV-001').customerCharge,
      initialCharge
    );

    // 2. Manager submits Proposal 2 (will be approved)
    const prop2 = await requestApi(
      baseUrl,
      'POST',
      '/api/settings-proposals',
      {
        settingModule: 'Service Rate Management',
        settingName: 'MC2627SRV-001 Fee Revision',
        oldValue: { customerCharge: initialCharge },
        proposedValue: { serviceCode: 'MC2627SRV-001', customerCharge: 620, serviceCost: 160 },
        changeReason: 'Updated scheme processing charges',
      },
      manager.cookies
    );
    assert.equal(prop2.status, 201);

    const appRes = await requestApi(
      baseUrl,
      'POST',
      `/api/settings-proposals/${prop2.body.data.proposalId}/approve`,
      {},
      admin.cookies
    );
    assert.equal(appRes.status, 200);
    assert.equal(appRes.body.data.approvalStatus, 'Approved');

    const afterAppRates = await requestApi(baseUrl, 'GET', '/api/service-rates', undefined, admin.cookies);
    const updatedSrv = afterAppRates.body.data.rates.find((r: any) => r.serviceCode === 'MC2627SRV-001');
    assert.equal(updatedSrv.customerCharge, 620);
    assert.equal(updatedSrv.serviceCost, 160);
    assert.equal(updatedSrv.profitAmount, 460);
    assert.equal(updatedSrv.currentVersion, baselineSrv.currentVersion + 1);

    // 3. Proposer cannot self-approve
    const adminProp = await requestApi(
      baseUrl,
      'POST',
      '/api/settings-proposals',
      {
        settingModule: 'Service Rate Management',
        settingName: 'Self-approve test',
        proposedValue: { serviceCode: 'MC2627SRV-001', customerCharge: 650 },
        changeReason: 'Self-approval boundary test',
      },
      admin.cookies
    );
    assert.equal(adminProp.status, 201);
    const selfApprove = await requestApi(
      baseUrl,
      'POST',
      `/api/settings-proposals/${adminProp.body.data.proposalId}/approve`,
      {},
      admin.cookies
    );
    assert.equal(selfApprove.status, 403);
  });
});

test('P3-4. Service Rate Profit Formula (Charge - Cost) & Immutable Completed Transaction Snapshots', async () => {
  await withServer(async (baseUrl, store) => {
    const admin = await loginAs(baseUrl, store, 'MC2627110001', '8101352105');

    const before = await requestApi(baseUrl, 'GET', '/api/service-rates', undefined, admin.cookies);
    const snapshotCountBefore = before.body.data.completedSnapshots.length;
    const firstSnapshotBefore = { ...before.body.data.completedSnapshots[0] };

    // Revise existing rate
    const updateRes = await requestApi(
      baseUrl,
      'POST',
      '/api/service-rates',
      {
        serviceCode: firstSnapshotBefore.serviceCode,
        serviceName: firstSnapshotBefore.serviceName,
        customerCharge: 490,
        serviceCost: 140,
        changeReason: 'Annual revision',
      },
      admin.cookies
    );
    assert.equal(updateRes.status, 200);
    assert.equal(updateRes.body.data.profitAmount, 350);

    // Verify existing historical snapshot remained strictly immutable
    const after = await requestApi(baseUrl, 'GET', '/api/service-rates', undefined, admin.cookies);
    assert.equal(after.body.data.completedSnapshots.length, snapshotCountBefore);
    assert.deepEqual(after.body.data.completedSnapshots[0], firstSnapshotBefore);
  });
});

test('P3-5. Atomic Financial-Year Sequential Numbers (MCR/MCI/MCA) under Concurrent Load', async () => {
  await withServer(async (baseUrl, store) => {
    const admin = await loginAs(baseUrl, store, 'MC2627110001', '8101352105');

    const [receipts, invoices, apps] = await Promise.all([
      Promise.all(
        Array.from({ length: 5 }, () =>
          requestApi(baseUrl, 'POST', '/api/document-sequences/next', { docType: 'RECEIPT' }, admin.cookies)
        )
      ),
      Promise.all(
        Array.from({ length: 3 }, () =>
          requestApi(baseUrl, 'POST', '/api/document-sequences/next', { docType: 'INVOICE' }, admin.cookies)
        )
      ),
      Promise.all(
        Array.from({ length: 3 }, () =>
          requestApi(baseUrl, 'POST', '/api/document-sequences/next', { docType: 'APPLICATION' }, admin.cookies)
        )
      ),
    ]);

    const receiptNums = receipts.map((r) => r.body.data.generatedNumber);
    const invoiceNums = invoices.map((r) => r.body.data.generatedNumber);
    const appNums = apps.map((r) => r.body.data.generatedNumber);

    assert.equal(new Set(receiptNums).size, 5);
    assert.equal(new Set(invoiceNums).size, 3);
    assert.equal(new Set(appNums).size, 3);

    receiptNums.forEach((n) => assert.match(n, /^MCR-\d{4}-\d{2}-\d{6}$/));
    invoiceNums.forEach((n) => assert.match(n, /^MCI-\d{4}-\d{2}-\d{6}$/));
    appNums.forEach((n) => assert.match(n, /^MCA-\d{4}-\d{2}-\d{6}$/));
  });
});

test('P3-6. Daily Cash Closing: formula, mandatory difference reason, variance approval & audit trail', async () => {
  await withServer(async (baseUrl, store) => {
    const staff = await loginAs(baseUrl, store, 'MC2627110003', 'Staff@2026!');
    const admin = await loginAs(baseUrl, store, 'MC2627110001', '8101352105');

    // Missing reason when variance != 0 -> 422
    const missingReason = await requestApi(
      baseUrl,
      'POST',
      '/api/daily-cash',
      {
        counterCode: 'CTR-01',
        closingDate: '16/11/2026',
        openingCash: 1000,
        cashReceived: 2500,
        cashExpenses: 300,
        actualCashCount: 3150,
        differenceReason: '',
      },
      staff.cookies
    );
    assert.equal(missingReason.status, 422);

    // Valid variance submission by Staff -> Pending Admin Approval
    const withReason = await requestApi(
      baseUrl,
      'POST',
      '/api/daily-cash',
      {
        counterCode: 'CTR-01',
        closingDate: '16/11/2026',
        openingCash: 1000,
        cashReceived: 2500,
        cashExpenses: 300,
        actualCashCount: 3150,
        differenceReason: 'Coin change shortage in drawer',
      },
      staff.cookies
    );
    assert.equal(withReason.status, 201);
    assert.equal(withReason.body.data.expectedCash, 3200);
    assert.equal(withReason.body.data.cashDifference, -50);
    assert.equal(withReason.body.data.approvalStatus, 'Pending Admin Approval');

    // Admin approves variance and logs audit note
    const approve = await requestApi(
      baseUrl,
      'POST',
      `/api/daily-cash/${withReason.body.data.closingCode}/approve`,
      { note: 'Verified with counter ledger' },
      admin.cookies
    );
    assert.equal(approve.status, 200);
    assert.equal(approve.body.data.approvalStatus, 'Approved');
    assert.ok(
      approve.body.data.correctionAudit.some((e: any) => e.action === 'ADMIN_APPROVED_VARIANCE')
    );
  });
});

test('P3-7. AES-256-GCM Backup Encryption, SHA-256 Restore & API Secret Masking', async () => {
  await withServer(async (baseUrl, store) => {
    const admin = await loginAs(baseUrl, store, 'MC2627110001', '8101352105');

    // Backup before modifying company name
    const bakRes = await requestApi(
      baseUrl,
      'POST',
      '/api/backups',
      { storageTarget: 'Computer Download' },
      admin.cookies
    );
    assert.equal(bakRes.status, 201);
    const code = bakRes.body.data.backupCode;

    // Downloaded backup must NOT expose plaintext company profile
    const dlRes = await requestApi(baseUrl, 'GET', `/api/backups/${code}/download`, undefined, admin.cookies);
    assert.equal(dlRes.status, 200);
    assert.ok(!dlRes.rawText.includes('Murshidabad'), 'Encrypted backup must not contain plaintext fields');
    assert.ok(!dlRes.rawText.includes('Mamudpur'), 'Encrypted backup must not contain plaintext fields');

    // Mutate company profile, then restore snapshot
    const updRes = await requestApi(
      baseUrl,
      'PUT',
      '/api/master-settings/company-profile',
      {
        companyName: 'TEMP MODIFIED NAME',
        addressLine: 'Temp Addr',
        pinCode: '712405',
        mobile: '+919999999999',
      },
      admin.cookies
    );
    assert.equal(updRes.status, 200);

    const restRes = await requestApi(baseUrl, 'POST', `/api/backups/${code}/restore`, {}, admin.cookies);
    assert.equal(restRes.status, 200);

    const ovAfter = await requestApi(baseUrl, 'GET', '/api/master-settings/overview', undefined, admin.cookies);
    assert.equal(ovAfter.body.data.companyProfile.companyName, 'MUN COMPUTER');

    // Save API secret -> never returned in plaintext
    const secretVal = 'LIVE_SMS_SUPER_SECRET_KEY_987654';
    const saveInt = await requestApi(
      baseUrl,
      'PUT',
      '/api/integrations/SMS',
      {
        providerName: 'MSG91 Gateway',
        endpointOrHost: 'https://api.msg91.com/api/v5/flow',
        senderOrFrom: 'MUNCOM',
        apiSecret: secretVal,
      },
      admin.cookies
    );
    assert.equal(saveInt.status, 200);

    const listInt = await requestApi(baseUrl, 'GET', '/api/integrations', undefined, admin.cookies);
    assert.equal(listInt.status, 200);
    assert.ok(!listInt.rawText.includes(secretVal), 'API response must never leak raw secret');
    const sms = listInt.body.data.find((i: any) => i.channel === 'SMS');
    assert.equal(sms.hasSecret, true);
  });
});

test('P3-8. Document Upload Validation (Type/10MB Size) & Maintenance Mode (503 for Non-Admin)', async () => {
  await withServer(async (baseUrl, store) => {
    const admin = await loginAs(baseUrl, store, 'MC2627110001', '8101352105');

    // Reject disallowed MIME and >10MB
    const badMime = await requestApi(
      baseUrl,
      'POST',
      '/api/documents/validate-upload',
      { originalName: 'payload.exe', mimeType: 'application/x-msdownload', fileSizeBytes: 1024 },
      admin.cookies
    );
    assert.equal(badMime.status, 422);

    const tooLarge = await requestApi(
      baseUrl,
      'POST',
      '/api/documents/validate-upload',
      { originalName: 'huge.pdf', mimeType: 'application/pdf', fileSizeBytes: 12 * 1024 * 1024 },
      admin.cookies
    );
    assert.equal(tooLarge.status, 422);

    // Accept valid PDF <= 10MB
    const goodPdf = await requestApi(
      baseUrl,
      'POST',
      '/api/documents/validate-upload',
      { originalName: 'kyc-form.pdf', mimeType: 'application/pdf', fileSizeBytes: 245000, category: 'Customer KYC' },
      admin.cookies
    );
    assert.equal(goodPdf.status, 201);

    // Enable Maintenance Mode -> Manager login returns 503, Admin login still works (200)
    const maintOn = await requestApi(
      baseUrl,
      'PUT',
      '/api/master-settings/maintenance',
      { maintenanceMode: true, maintenanceMessage: 'Scheduled midnight FY backup.' },
      admin.cookies
    );
    assert.equal(maintOn.status, 200);

    const mgrCap = issueTestCaptcha(store);
    const mgrBlocked = await requestApi(baseUrl, 'POST', '/api/auth/login', {
      userId: 'MC2627110002',
      password: 'Manager@2026!',
      captchaId: mgrCap.id,
      captchaAnswer: mgrCap.answer,
    });
    assert.equal(mgrBlocked.status, 503);

    const admSession = await loginAs(baseUrl, store, 'MC2627110001', '8101352105');
    assert.equal(admSession.user.role, 'ADMIN');
  });
});
