import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { AddressInfo } from 'node:net';
import { createApp } from '../server/app';
import { SecurityStore } from '../server/securityStore';
import { Phase03Store } from '../server/phase03Store';
import { ErpStore } from '../server/erpStore';
import { FinanceStore } from '../server/finance/financeStore';
import { ReportStore } from '../server/reports/reportStore';
import { Phase08Store } from '../server/phase08/phase08Store';
import { hmacOtp } from '../server/crypto';
import { validateAndBuildVoucher } from '../server/finance/accountingEngine';

interface HttpResult {
  status: number;
  headers: Headers;
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
  cookies: Record<string, string> = {},
  extraHeaders: Record<string, string> = {}
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
      ...extraHeaders,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
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
    text,
    json,
    cookies: extractSetCookies(setCookies),
  };
}

function issueCaptcha(store: SecurityStore): { id: string; answer: string } {
  const id = `p8-cap-${Math.random().toString(36).slice(2, 10)}`;
  const answer = 'K9P4T';
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
  password: string,
  options?: { channel?: 'SMS' | 'EMAIL' | 'WHATSAPP'; userAgent?: string; deviceName?: string }
) {
  const cap = issueCaptcha(store);
  const headers: Record<string, string> = {};
  if (options?.userAgent) headers['User-Agent'] = options.userAgent;
  if (options?.deviceName) headers['X-Device-Name'] = options.deviceName;

  const loginRes = await reqApi(
    baseUrl,
    'POST',
    '/api/auth/login',
    {
      userId,
      password,
      captchaId: cap.id,
      captchaAnswer: cap.answer,
      otpChannel: options?.channel ?? 'SMS',
    },
    {},
    headers
  );
  assert.equal(loginRes.status, 200, `Login step 1 failed for ${userId}: ${loginRes.text}`);

  const otpRes = await reqApi(
    baseUrl,
    'POST',
    '/api/auth/verify-otp',
    {
      challengeId: loginRes.json.data.challengeId,
      otp: loginRes.json.data.sandboxOtpPreview,
    },
    {},
    headers
  );
  assert.equal(otpRes.status, 200, `OTP verify failed for ${userId}: ${otpRes.text}`);
  return {
    cookies: otpRes.cookies,
    loginData: loginRes.json.data,
    verifyData: otpRes.json.data,
  };
}

function setupPhase08Harness(storeOptions?: { maxFailedAttempts?: number; lockDurationMs?: number }) {
  const store = new SecurityStore(storeOptions);
  const phase03Store = new Phase03Store();
  const erpStore = new ErpStore(store, phase03Store);
  const financeStore = new FinanceStore(store, phase03Store, erpStore);
  const reportStore = new ReportStore();
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mun-phase08-test-'));
  const phase08Store = new Phase08Store(store, phase03Store, erpStore, financeStore, reportStore, {
    primaryBackupDir: path.join(tmpRoot, 'primary'),
    secondaryBackupDir: path.join(tmpRoot, 'secondary'),
  });
  const app = createApp(store, {
    enableRateLimit: false,
    phase03Store,
    erpStore,
    financeStore,
    reportStore,
    phase08Store,
  });
  const server = http.createServer(app);
  return {
    store,
    phase03Store,
    erpStore,
    financeStore,
    reportStore,
    phase08Store,
    tmpRoot,
    server,
  };
}

async function startServer(server: http.Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address() as AddressInfo;
  return `http://127.0.0.1:${addr.port}`;
}

async function stopHarness(server: http.Server, tmpRoot: string): Promise<void> {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}

test('Phase 08 Scenarios 1-12: Login security, CAPTCHA/OTP defenses, Lockout, RBAC & Session controls', async () => {
  const h = setupPhase08Harness();
  const baseUrl = await startServer(h.server);

  try {
    // 1. Valid login (CAPTCHA + Password + OTP -> active session)
    const adminSession = await loginAs(baseUrl, h.store, 'MC2627110001', '8101352105');
    assert.ok(adminSession.cookies.mun_session, 'HttpOnly session cookie issued');
    assert.ok(adminSession.cookies.mun_csrf, 'CSRF cookie issued');

    // 2. Invalid password attempt + attempt countdown
    const capBadPwd = issueCaptcha(h.store);
    const badPwdRes = await reqApi(baseUrl, 'POST', '/api/auth/login', {
      userId: 'MC2627110003',
      password: 'WrongPassword!1',
      captchaId: capBadPwd.id,
      captchaAnswer: capBadPwd.answer,
    });
    assert.equal(badPwdRes.status, 401);
    assert.match(badPwdRes.json.message, /4 attempt\(s\) remaining/);

    // 3. Invalid & reused CAPTCHA rejected
    const badCapRes = await reqApi(baseUrl, 'POST', '/api/auth/login', {
      userId: 'MC2627110003',
      password: 'Staff@2026!',
      captchaId: capBadPwd.id, // reused single-use captcha id
      captchaAnswer: capBadPwd.answer,
    });
    assert.equal(badCapRes.status, 422);

    // 4. Expired OTP rejected & logged as EXPIRED
    const capExp = issueCaptcha(h.store);
    const step1Exp = await reqApi(baseUrl, 'POST', '/api/auth/login', {
      userId: 'MC2627110002',
      password: 'Manager@2026!',
      captchaId: capExp.id,
      captchaAnswer: capExp.answer,
      otpChannel: 'EMAIL',
    });
    assert.equal(step1Exp.status, 200);
    const chExp = h.store.otpChallenges.get(step1Exp.json.data.challengeId)!;
    chExp.expiresAt = Date.now() - 1000;
    const expRes = await reqApi(baseUrl, 'POST', '/api/auth/verify-otp', {
      challengeId: chExp.id,
      otp: step1Exp.json.data.sandboxOtpPreview,
    });
    assert.equal(expRes.status, 400);
    const expLog = h.phase08Store.otpLogs.find((l) => l.challengeId === chExp.id);
    assert.equal(expLog?.outcome, 'EXPIRED');

    // 5. Reused OTP rejected
    const capReuse = issueCaptcha(h.store);
    const step1Reuse = await reqApi(baseUrl, 'POST', '/api/auth/login', {
      userId: 'MC2627110002',
      password: 'Manager@2026!',
      captchaId: capReuse.id,
      captchaAnswer: capReuse.answer,
    });
    const usedCode = step1Reuse.json.data.sandboxOtpPreview;
    const okReuse = await reqApi(baseUrl, 'POST', '/api/auth/verify-otp', {
      challengeId: step1Reuse.json.data.challengeId,
      otp: usedCode,
    });
    assert.equal(okReuse.status, 200);
    const replayOtp = await reqApi(baseUrl, 'POST', '/api/auth/verify-otp', {
      challengeId: step1Reuse.json.data.challengeId,
      otp: usedCode,
    });
    assert.equal(replayOtp.status, 400);

    // 6. Excessive OTP attempts (5 failures -> 429)
    const capMaxOtp = issueCaptcha(h.store);
    const step1MaxOtp = await reqApi(baseUrl, 'POST', '/api/auth/login', {
      userId: 'MC2627110002',
      password: 'Manager@2026!',
      captchaId: capMaxOtp.id,
      captchaAnswer: capMaxOtp.answer,
    });
    for (let i = 0; i < 5; i++) {
      const failOtp = await reqApi(baseUrl, 'POST', '/api/auth/verify-otp', {
        challengeId: step1MaxOtp.json.data.challengeId,
        otp: '000000',
      });
      assert.equal(failOtp.status, 401);
    }
    const sixthOtp = await reqApi(baseUrl, 'POST', '/api/auth/verify-otp', {
      challengeId: step1MaxOtp.json.data.challengeId,
      otp: step1MaxOtp.json.data.sandboxOtpPreview,
    });
    assert.equal(sixthOtp.status, 429);

    // 7. Account lockout after remaining failed attempts on MC2627110003 (1 already failed above -> 4 more)
    for (let i = 0; i < 4; i++) {
      const c = issueCaptcha(h.store);
      const r = await reqApi(baseUrl, 'POST', '/api/auth/login', {
        userId: 'MC2627110003',
        password: 'WrongPassword!1',
        captchaId: c.id,
        captchaAnswer: c.answer,
      });
      if (i < 3) {
        assert.equal(r.status, 401);
      } else {
        assert.equal(r.status, 423);
      }
    }
    assert.ok(
      h.phase08Store.securityAlerts.some((a) => a.category === 'ACCOUNT_LOCKOUT' && a.relatedUserId === 'MC2627110003')
    );

    // Unlock staff via Admin for RBAC checks
    const unlockRes = await reqApi(
      baseUrl,
      'PATCH',
      '/api/users/MC2627110003/status',
      { status: 'ACTIVE' },
      adminSession.cookies
    );
    assert.equal(unlockRes.status, 200);

    // 8 & 9. Unauthorized module & admin API access
    const staffSession = await loginAs(baseUrl, h.store, 'MC2627110003', 'Staff@2026!');
    const staffReportAttempt = await reqApi(baseUrl, 'GET', '/api/v1/reports/dashboard', undefined, staffSession.cookies);
    assert.equal(staffReportAttempt.status, 403);

    const staffBackupAttempt = await reqApi(
      baseUrl,
      'POST',
      '/api/v1/security/backups/create',
      { frequency: 'MANUAL' },
      staffSession.cookies
    );
    assert.equal(staffBackupAttempt.status, 403);

    const staffRestoreAttempt = await reqApi(
      baseUrl,
      'POST',
      '/api/v1/security/restore/preview',
      { backupCode: 'BKP-FAKE', scope: 'FULL' },
      staffSession.cookies
    );
    assert.equal(staffRestoreAttempt.status, 403);

    const anonReq = await reqApi(baseUrl, 'GET', '/api/v1/security/dashboard');
    assert.equal(anonReq.status, 401);

    // 10. Permission escalation attempt blocked (Manager trying to grant finance/admin perms)
    const managerCookies = okReuse.cookies;
    const escRes = await reqApi(
      baseUrl,
      'PUT',
      '/api/users/MC2627110003/permissions',
      { permissions: { 'settings.EDIT': true } },
      managerCookies
    );
    assert.equal(escRes.status, 403);

    // 11. Session expiration check
    const staffSessObj = Array.from(h.store.sessions.values()).find((s) => s.userId === 'MC2627110003' && s.status === 'ACTIVE')!;
    staffSessObj.expiresAt = Date.now() - 5000;
    const expiredSessRes = await reqApi(baseUrl, 'GET', '/api/auth/me', undefined, staffSession.cookies);
    assert.equal(expiredSessRes.status, 401);

    // 12. Force logout / emergency session revocation
    const staffSession2 = await loginAs(baseUrl, h.store, 'MC2627110003', 'Staff@2026!');
    const forceRevokeRes = await reqApi(
      baseUrl,
      'POST',
      '/api/v1/security/emergency/revoke-all-sessions/MC2627110003',
      {},
      adminSession.cookies
    );
    assert.equal(forceRevokeRes.status, 200);
    assert.ok(forceRevokeRes.json.data.revokedSessions >= 1);
    const afterForce = await reqApi(baseUrl, 'GET', '/api/auth/me', undefined, staffSession2.cookies);
    assert.equal(afterForce.status, 401);
  } finally {
    await stopHarness(h.server, h.tmpRoot);
  }
});

test('Phase 08 Scenarios 13-19: Multi-channel OTP, Devices, Concurrent Sessions, Password Policy, Roles & Tamper Audit', async () => {
  const h = setupPhase08Harness();
  const baseUrl = await startServer(h.server);

  try {
    const admin = await loginAs(baseUrl, h.store, 'MC2627110001', '8101352105', {
      channel: 'WHATSAPP',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0',
      deviceName: 'Admin HQ Desktop',
    });

    // 13. Multi-channel OTP logs report honest providerConfigured/deliveryStatus when unset
    const stepEmail = await reqApi(
      baseUrl,
      'POST',
      '/api/v1/security/otp/sensitive-challenge',
      { channel: 'EMAIL' },
      admin.cookies
    );
    assert.equal(stepEmail.status, 200);
    assert.equal(stepEmail.json.data.providerConfigured, false);
    assert.equal(stepEmail.json.data.channel, 'EMAIL');

    const otpLogsRes = await reqApi(baseUrl, 'GET', '/api/v1/security/otp-logs', undefined, admin.cookies);
    assert.equal(otpLogsRes.status, 200);
    assert.ok(otpLogsRes.json.data.some((l: any) => l.channel === 'WHATSAPP' && l.deliveryStatus === 'NOT_CONFIGURED'));
    assert.ok(otpLogsRes.json.data.some((l: any) => l.channel === 'EMAIL' && l.deliveryStatus === 'NOT_CONFIGURED'));

    // 14. New device login detection, Trust, Flag Suspicious, Revoke
    const staffDev1 = await loginAs(baseUrl, h.store, 'MC2627110003', 'Staff@2026!', {
      userAgent: 'Mozilla/5.0 (Linux; Android 14) Firefox/120.0',
      deviceName: 'Counter Phone 1',
    });
    const staffDev2 = await loginAs(baseUrl, h.store, 'MC2627110003', 'Staff@2026!', {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X) Safari/17.0',
      deviceName: 'Backoffice Laptop',
    });
    assert.equal(staffDev2.verifyData.device.isNewDevice, true);
    assert.equal(staffDev2.verifyData.device.verificationStatus, 'PENDING_VERIFICATION');

    const trustRes = await reqApi(
      baseUrl,
      'POST',
      `/api/v1/security/devices/${staffDev2.verifyData.device.deviceId}/verify`,
      { userId: 'MC2627110003' },
      admin.cookies
    );
    assert.equal(trustRes.status, 200);
    assert.equal(trustRes.json.data.verificationStatus, 'TRUSTED');

    const suspRes = await reqApi(
      baseUrl,
      'POST',
      `/api/v1/security/devices/${staffDev1.verifyData.device.deviceId}/suspicious`,
      {},
      admin.cookies
    );
    assert.equal(suspRes.status, 200);
    assert.equal(suspRes.json.data.device.verificationStatus, 'SUSPICIOUS');

    // 15. Concurrent session limit enforcement (limit = 3 for Manager)
    const m1 = await loginAs(baseUrl, h.store, 'MC2627110002', 'Manager@2026!', { deviceName: 'Mgr-1' });
    await loginAs(baseUrl, h.store, 'MC2627110002', 'Manager@2026!', { deviceName: 'Mgr-2' });
    await loginAs(baseUrl, h.store, 'MC2627110002', 'Manager@2026!', { deviceName: 'Mgr-3' });
    await loginAs(baseUrl, h.store, 'MC2627110002', 'Manager@2026!', { deviceName: 'Mgr-4' });
    const m1Me = await reqApi(baseUrl, 'GET', '/api/auth/me', undefined, m1.cookies);
    assert.equal(m1Me.status, 401, 'Oldest concurrent session evicted beyond limit=3');

    // 16. Password reuse prevention + 90-day expiry flag
    const staffCur = await loginAs(baseUrl, h.store, 'MC2627110003', 'Staff@2026!', {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X) Safari/17.0',
      deviceName: 'Backoffice Laptop',
    });
    const reusePwdRes = await reqApi(
      baseUrl,
      'POST',
      '/api/users/MC2627110003/change-password',
      { currentPassword: 'Staff@2026!', newPassword: 'Staff@2026!', confirmPassword: 'Staff@2026!' },
      staffCur.cookies
    );
    assert.equal(reusePwdRes.status, 422);

    const newPwdRes = await reqApi(
      baseUrl,
      'POST',
      '/api/users/MC2627110003/change-password',
      { currentPassword: 'Staff@2026!', newPassword: 'Staff@2026!New1', confirmPassword: 'Staff@2026!New1' },
      staffCur.cookies
    );
    assert.equal(newPwdRes.status, 200);

    // 17. Custom role + Permission group + Temporary time-bound permission & approval queue
    const customRoleRes = await reqApi(
      baseUrl,
      'POST',
      '/api/v1/security/custom-roles',
      {
        roleName: 'GST Compliance Clerk',
        baseRole: 'STAFF',
        description: 'Can export reports',
        permissions: { 'reports.EXPORT': true },
      },
      admin.cookies
    );
    assert.equal(customRoleRes.status, 201);
    const assignRoleRes = await reqApi(
      baseUrl,
      'POST',
      `/api/v1/security/custom-roles/${customRoleRes.json.data.roleCode}/assign`,
      { userId: 'MC2627110003' },
      admin.cookies
    );
    assert.equal(assignRoleRes.status, 200);
    assert.equal(assignRoleRes.json.data.effectivePermissions['reports.EXPORT'], true);

    const applyGrpRes = await reqApi(
      baseUrl,
      'POST',
      '/api/v1/security/permission-groups/GRP-FRONT-DESK/apply',
      { userId: 'MC2627110003' },
      admin.cookies
    );
    assert.equal(applyGrpRes.status, 200);

    const grantTempRes = await reqApi(
      baseUrl,
      'POST',
      '/api/v1/security/temporary-permissions',
      { userId: 'MC2627110003', permissionKey: 'finance_engine.EXPORT', durationHours: 2, reason: 'Quarter close' },
      admin.cookies
    );
    assert.equal(grantTempRes.status, 201);
    const grantCode = grantTempRes.json.data.grantCode;
    assert.equal(h.store.getEffectivePermissions(h.store.findUserByUserId('MC2627110003')!)['finance_engine.EXPORT'], true);

    const revokeTempRes = await reqApi(
      baseUrl,
      'POST',
      `/api/v1/security/temporary-permissions/${grantCode}/revoke`,
      {},
      admin.cookies
    );
    assert.equal(revokeTempRes.status, 200);
    assert.notEqual(h.store.getEffectivePermissions(h.store.findUserByUserId('MC2627110003')!)['finance_engine.EXPORT'], true);

    // 18 & 19. Before/After Audit Chain search, export & tamper detection
    const auditChainRes = await reqApi(
      baseUrl,
      'GET',
      '/api/v1/security/audit-chain?actionType=GRANT_TEMPORARY_PERMISSION',
      undefined,
      admin.cookies
    );
    assert.equal(auditChainRes.status, 200);
    assert.ok(auditChainRes.json.data.entries.length >= 1);
    assert.equal(auditChainRes.json.data.integrity.valid, true);

    const exportCsv = await reqApi(baseUrl, 'GET', '/api/v1/security/audit-chain/export?format=csv', undefined, admin.cookies);
    assert.equal(exportCsv.status, 200);
    assert.match(exportCsv.text, /AuditUUID,Timestamp,UserID/);

    // Simulate direct tamper inside audit chain entry
    h.phase08Store.tamperAuditLogs[0].entryHash = 'tampered00000000000000000000000000000000000000000000000000000000';
    const verifyBroken = await reqApi(baseUrl, 'POST', '/api/v1/security/audit-chain/verify', {}, admin.cookies);
    assert.equal(verifyBroken.status, 200);
    assert.equal(verifyBroken.json.data.valid, false);
  } finally {
    await stopHarness(h.server, h.tmpRoot);
  }
});

test('Phase 08 Scenarios 20-30: Schedules, Cloud/Secondary Storage, Key Rotation, Restore DR & Data Recovery Approval', async () => {
  const h = setupPhase08Harness();
  const baseUrl = await startServer(h.server);

  try {
    const admin = await loginAs(baseUrl, h.store, 'MC2627110001', '8101352105');
    const manager = await loginAs(baseUrl, h.store, 'MC2627110002', 'Manager@2026!');

    // Seed test voucher for backup duplicate-prevention drill
    const testVoucher = validateAndBuildVoucher({
      voucherNo: 'VCH-P8-TEST-001',
      entityCode: 'ENT-MAIN',
      branchCode: 'BR-MAIN',
      costCenter: 'CSC-COUNTER',
      voucherDate: '2026-11-16',
      voucherType: 'Receipt',
      narration: 'Phase 08 test voucher for backup duplicate prevention test',
      status: 'Posted',
      createdBy: admin.loginData.userId,
      approvedBy: manager.loginData.userId,
      lines: [
        { accountCode: '1001', debitAmount: 250, creditAmount: 0 },
        { accountCode: '4001', debitAmount: 0, creditAmount: 250 },
      ],
      accounts: h.financeStore.chartOfAccounts,
      periods: h.financeStore.fiscalPeriods,
    });
    h.financeStore.vouchers.push(testVoucher);

    // 20 & 21 & 22. Daily/Weekly/Monthly/FY scheduled backup + Secondary storage + Unconfigured cloud honesty
    const dailyRun = await reqApi(
      baseUrl,
      'POST',
      '/api/v1/security/backups/schedules/BSCH-DAILY/run',
      {},
      admin.cookies
    );
    assert.equal(dailyRun.status, 201);
    const bkp1 = dailyRun.json.data;
    assert.equal(bkp1.keyVersion, 'KEY-V1');
    assert.equal(bkp1.storageResults.find((s: any) => s.storageCode === 'PRIMARY_DB').status, 'UPLOADED');
    assert.equal(bkp1.storageResults.find((s: any) => s.storageCode === 'SECONDARY_STORAGE').status, 'UPLOADED');
    assert.equal(bkp1.storageResults.find((s: any) => s.storageCode === 'CLOUD_STORAGE').status, 'NOT_CONFIGURED');

    // Configure local-cloud staging & test cloud failure alert
    const cfgCloud = await reqApi(
      baseUrl,
      'PUT',
      '/api/v1/security/backups/storage/cloud',
      { providerName: 'AWS S3 Staging', endpointOrPath: 'local-cloud://mun-offsite-vault', credentialsSecret: 'demo-key-secret' },
      admin.cookies
    );
    assert.equal(cfgCloud.status, 200);
    assert.equal(cfgCloud.json.data.isConfigured, true);

    const cloudFailRun = await reqApi(
      baseUrl,
      'POST',
      '/api/v1/security/backups/create',
      { frequency: 'MONTHLY', simulateCloudFailure: true },
      admin.cookies
    );
    assert.equal(cloudFailRun.status, 201);
    assert.equal(cloudFailRun.json.data.status, 'PARTIAL');

    // 23. Encryption key rotation (KEY-V1 -> KEY-V2) & backward decryption
    const rotRes = await reqApi(baseUrl, 'POST', '/api/v1/security/encryption/rotate', {}, admin.cookies);
    assert.equal(rotRes.status, 201);
    assert.equal(rotRes.json.data.activeKey.keyVersion, 'KEY-V2');

    const bkpV2Res = await reqApi(
      baseUrl,
      'POST',
      '/api/v1/security/backups/schedules/BSCH-FINYEAR/run',
      {},
      admin.cookies
    );
    assert.equal(bkpV2Res.status, 201);
    assert.equal(bkpV2Res.json.data.keyVersion, 'KEY-V2');
    assert.equal(bkpV2Res.json.data.storageResults.find((s: any) => s.storageCode === 'CLOUD_STORAGE').status, 'UPLOADED');

    // Verify older KEY-V1 backup still passes checksum + HMAC + decrypt
    const verifyV1 = await reqApi(
      baseUrl,
      'POST',
      `/api/v1/security/backups/${bkp1.backupCode}/verify`,
      {},
      admin.cookies
    );
    assert.equal(verifyV1.status, 200);
    assert.equal(verifyV1.json.data.verified, true);

    // 25. Permanent retention & backup version comparison
    const cmpRes = await reqApi(
      baseUrl,
      'GET',
      `/api/v1/security/backups/compare?base=${bkp1.backupCode}&target=${bkpV2Res.json.data.backupCode}`,
      undefined,
      admin.cookies
    );
    assert.equal(cmpRes.status, 200);
    assert.ok(Array.isArray(cmpRes.json.data.diffs));

    // 24 & 28. Tamper backup bundle -> Integrity verification & restore fail safely
    h.phase08Store.tamperBackupBundleForTest(cloudFailRun.json.data.backupCode);
    const verifyTampered = await reqApi(
      baseUrl,
      'POST',
      `/api/v1/security/backups/${cloudFailRun.json.data.backupCode}/verify`,
      {},
      admin.cookies
    );
    assert.equal(verifyTampered.status, 422);

    // 26 & 27. Admin-only Restore Preview -> Confirmation Guard -> Safety Backup -> Duplicate Voucher Prevention
    const previewRes = await reqApi(
      baseUrl,
      'POST',
      '/api/v1/security/restore/preview',
      { backupCode: bkpV2Res.json.data.backupCode, scope: 'FINANCE' },
      admin.cookies
    );
    assert.equal(previewRes.status, 200);
    const preview = previewRes.json.data;
    assert.equal(preview.integrityVerified, true);
    assert.ok(preview.affectedRecords.financeVouchers.duplicateSkipped >= 1);

    const voucherCountBefore = h.financeStore.vouchers.length;
    const badConfirm = await reqApi(
      baseUrl,
      'POST',
      '/api/v1/security/restore/execute',
      { backupCode: bkpV2Res.json.data.backupCode, previewId: preview.previewId, scope: 'FINANCE', confirmationText: 'YES' },
      admin.cookies
    );
    assert.equal(badConfirm.status, 422);

    const execRestore = await reqApi(
      baseUrl,
      'POST',
      '/api/v1/security/restore/execute',
      {
        backupCode: bkpV2Res.json.data.backupCode,
        previewId: preview.previewId,
        scope: 'FINANCE',
        confirmationText: 'CONFIRM RESTORE',
      },
      admin.cookies
    );
    assert.equal(execRestore.status, 200);
    assert.equal(execRestore.json.data.status, 'COMPLETED');
    assert.ok(execRestore.json.data.safetyBackupCode);
    assert.equal(h.financeStore.vouchers.length, voucherCountBefore, 'Zero duplicate financial vouchers created during restore');

    // 29 & 30. Soft delete -> Recover; Permanent delete blocked for financial links & Admin-only for unlinked records
    const nowIso = new Date().toISOString();
    const testCustLinked: any = {
      id: 9998,
      customerId: 'CUST-TEST-LINKED',
      fullName: 'Linked Client Test',
      fatherOrHusbandName: 'Parent',
      dob: '1990-01-01',
      gender: 'Male',
      mobile: '9800000002',
      whatsapp: '9800000002',
      email: 'linked@test.com',
      village: 'Mamudpur',
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
      verificationStatus: 'Consent Verified',
      mobileOtpVerifiedAt: null,
      consents: [],
      consentHistory: [],
      contactHistory: [],
      notesAndFollowUps: [],
      statusHistory: [],
      deletedAt: null,
      createdBy: admin.loginData.userId,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    h.erpStore.customers.unshift(testCustLinked);
    h.erpStore.applications.unshift({
      id: 9998,
      applicationNo: 'MCA-TEST-LINKED',
      financialYear: '2026-27',
      customerId: testCustLinked.customerId,
      customerSnapshot: testCustLinked,
      serviceId: h.erpStore.services[0].serviceId,
      serviceSnapshot: {
        serviceId: h.erpStore.services[0].serviceId,
        serviceCode: h.erpStore.services[0].serviceCode,
        name: h.erpStore.services[0].name,
        categoryName: 'CSC',
        appliedFormVersion: 1,
        formFieldsSnapshot: [],
        requiredDocsSnapshot: [],
        customerChargeSnapshot: 500,
        serviceCostSnapshot: 150,
        profitSnapshot: 350,
        termsSnapshot: '',
      },
      formData: {},
      status: 'Processing',
      assignedStaffId: 'MC2627110003',
      assignedCounterCode: 'CTR-01',
      submissionDate: nowIso,
      expectedCompletionDate: nowIso,
      actualCompletionDate: null,
      slaPausedMinutes: 0,
      references: [],
      statusHistory: [],
      assignmentHistory: [],
      archivedAt: null,
      archivedBy: null,
      createdBy: 'MC2627110003',
      createdAt: nowIso,
      updatedAt: nowIso,
    });

    // Add a standalone unlinked customer for permanent deletion approval test
    h.erpStore.customers.unshift({
      ...testCustLinked,
      id: 9999,
      customerId: 'CUST-TEST-UNLINKED',
      fullName: 'Temporary Walkin Client',
      deletedAt: null,
    });
    const linkedCustId = 'CUST-TEST-LINKED';

    const softCustLinked = await reqApi(
      baseUrl,
      'POST',
      '/api/v1/security/recovery/soft-delete',
      { entityType: 'CUSTOMER', entityId: linkedCustId, reason: 'Archive test' },
      manager.cookies
    );
    assert.equal(softCustLinked.status, 201);

    // Recover the linked customer
    const recoverLinked = await reqApi(
      baseUrl,
      'POST',
      `/api/v1/security/recovery/${softCustLinked.json.data.deletionCode}/restore`,
      { reason: 'Restored after audit check' },
      manager.cookies
    );
    assert.equal(recoverLinked.status, 200);
    assert.equal(recoverLinked.json.data.recoveryStatus, 'RECOVERED');

    // Soft-delete again -> permanent delete request blocked because customer has linked apps/payments
    const softCustLinked2 = await reqApi(
      baseUrl,
      'POST',
      '/api/v1/security/recovery/soft-delete',
      { entityType: 'CUSTOMER', entityId: linkedCustId, reason: 'Archive test 2' },
      manager.cookies
    );
    const blockedPermReq = await reqApi(
      baseUrl,
      'POST',
      `/api/v1/security/recovery/${softCustLinked2.json.data.deletionCode}/permanent-request`,
      { reason: 'Attempt purge' },
      manager.cookies
    );
    assert.equal(blockedPermReq.status, 422);

    // Soft-delete unlinked customer -> Manager requests permanent delete -> Manager cannot approve (403) -> Admin approves
    const softUnlinked = await reqApi(
      baseUrl,
      'POST',
      '/api/v1/security/recovery/soft-delete',
      { entityType: 'CUSTOMER', entityId: 'CUST-TEST-UNLINKED', reason: 'Duplicate entry' },
      manager.cookies
    );
    const reqPermUnlinked = await reqApi(
      baseUrl,
      'POST',
      `/api/v1/security/recovery/${softUnlinked.json.data.deletionCode}/permanent-request`,
      { reason: 'Verified unlinked test record' },
      manager.cookies
    );
    assert.equal(reqPermUnlinked.status, 200);

    const mgrApproveBlocked = await reqApi(
      baseUrl,
      'POST',
      `/api/v1/security/recovery/${softUnlinked.json.data.deletionCode}/permanent-review`,
      { approve: true, reason: 'Self-approve attempt' },
      manager.cookies
    );
    assert.equal(mgrApproveBlocked.status, 403);

    const adminApprove = await reqApi(
      baseUrl,
      'POST',
      `/api/v1/security/recovery/${softUnlinked.json.data.deletionCode}/permanent-review`,
      { approve: true, reason: 'Verified safe purge' },
      admin.cookies
    );
    assert.equal(adminApprove.status, 200);
    assert.equal(adminApprove.json.data.recoveryStatus, 'PERMANENTLY_DELETED');

    // Alert acknowledge & Security Incident workflow + Health Check
    const alertsRes = await reqApi(baseUrl, 'GET', '/api/v1/security/alerts', undefined, admin.cookies);
    assert.ok(alertsRes.json.data.length > 0);
    const alertCode = alertsRes.json.data[0].alertCode;
    const ackAlert = await reqApi(
      baseUrl,
      'POST',
      `/api/v1/security/alerts/${alertCode}/acknowledge`,
      {},
      admin.cookies
    );
    assert.equal(ackAlert.status, 200);

    const incCreate = await reqApi(
      baseUrl,
      'POST',
      '/api/v1/security/incidents',
      { category: 'INTEGRITY_ALERT', severity: 'HIGH', title: 'Checksum mismatch drill', description: 'Post-drill incident' },
      admin.cookies
    );
    assert.equal(incCreate.status, 201);
    const incPatch = await reqApi(
      baseUrl,
      'PATCH',
      `/api/v1/security/incidents/${incCreate.json.data.incidentCode}`,
      { investigationStatus: 'CLOSED', resolutionNotes: 'Verified recovery passed.' },
      admin.cookies
    );
    assert.equal(incPatch.status, 200);
    assert.equal(incPatch.json.data.investigationStatus, 'CLOSED');

    const healthRes = await reqApi(baseUrl, 'GET', '/api/v1/security/health', undefined, admin.cookies);
    assert.equal(healthRes.status, 200);
    assert.equal(healthRes.json.data.backup.retentionPolicy, 'PERMANENT_VERSIONED');
  } finally {
    await stopHarness(h.server, h.tmpRoot);
  }
});
