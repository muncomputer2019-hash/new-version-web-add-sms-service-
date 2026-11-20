import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import { createApp } from '../server/app';
import { SecurityStore } from '../server/securityStore';
import { hmacOtp } from '../server/crypto';

interface HttpResult {
  status: number;
  body: any;
  cookies: Record<string, string>;
}

function extractSetCookies(headers: http.IncomingHttpHeaders): Record<string, string> {
  const raw = headers['set-cookie'];
  const jar: Record<string, string> = {};
  if (!raw) return jar;
  const list = Array.isArray(raw) ? raw : [raw];
  for (const entry of list) {
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

async function requestJson(
  baseUrl: string,
  method: string,
  path: string,
  body?: unknown,
  cookies: Record<string, string> = {},
  extraHeaders: Record<string, string> = {}
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
      ...extraHeaders,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const parsed = await res.json();
  const rawHeaders: Record<string, string[]> = {};
  const setCookies =
    typeof (res.headers as any).getSetCookie === 'function'
      ? (res.headers as any).getSetCookie()
      : res.headers.get('set-cookie')
      ? [res.headers.get('set-cookie')!]
      : [];
  rawHeaders['set-cookie'] = setCookies;

  return {
    status: res.status,
    body: parsed,
    cookies: extractSetCookies({ 'set-cookie': setCookies }),
  };
}

function issueTestCaptcha(store: SecurityStore): { id: string; answer: string } {
  const id = `test-cap-${Math.random().toString(36).slice(2, 10)}`;
  const answer = 'K7M2P';
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
): Promise<{ cookies: Record<string, string>; user: any; sessionId: string }> {
  const cap = issueTestCaptcha(store);
  const loginRes = await requestJson(baseUrl, 'POST', '/api/auth/login', {
    userId,
    password,
    captchaId: cap.id,
    captchaAnswer: cap.answer,
    rememberMe: false,
  });
  assert.equal(loginRes.status, 200, `Login failed for ${userId}: ${loginRes.body.message}`);
  assert.equal(loginRes.body.data.otpRequired, true);
  const otp = loginRes.body.data.sandboxOtpPreview;
  assert.ok(otp, 'Expected sandbox OTP preview in test mode');

  const otpRes = await requestJson(baseUrl, 'POST', '/api/auth/verify-otp', {
    challengeId: loginRes.body.data.challengeId,
    otp,
  });
  assert.equal(otpRes.status, 200);
  assert.ok(otpRes.cookies.mun_session, 'Expected HttpOnly mun_session cookie');
  assert.ok(otpRes.cookies.mun_csrf, 'Expected CSRF cookie');

  return {
    cookies: otpRes.cookies,
    user: otpRes.body.data.user,
    sessionId: otpRes.body.data.session.id,
  };
}

async function withServer(
  fn: (baseUrl: string, store: SecurityStore) => Promise<void>,
  storeOptions: ConstructorParameters<typeof SecurityStore>[0] = {}
) {
  const store = new SecurityStore(storeOptions);
  const app = createApp(store, { enableRateLimit: false });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await fn(baseUrl, store);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
  }
}

test('1-3. Admin, Manager, and Staff logins with CAPTCHA and OTP verification', async () => {
  await withServer(async (baseUrl, store) => {
    const capRes = await requestJson(baseUrl, 'GET', '/api/auth/captcha');
    assert.equal(capRes.status, 200);
    assert.ok(capRes.body.data.svg.includes('<svg'));

    const admin = await loginAs(baseUrl, store, 'MC2627110001', '8101352105');
    assert.equal(admin.user.role, 'ADMIN');

    const manager = await loginAs(baseUrl, store, 'MC2627110002', 'Manager@2026!');
    assert.equal(manager.user.role, 'MANAGER');

    const staff = await loginAs(baseUrl, store, 'MC2627110003', 'Staff@2026!');
    assert.equal(staff.user.role, 'STAFF');
  });
});

test('4-5. Invalid password, invalid OTP rejection, and account lockout after 5 attempts', async () => {
  await withServer(async (baseUrl, store) => {
    // 4 consecutive invalid passwords
    for (let i = 0; i < 4; i += 1) {
      const cap = issueTestCaptcha(store);
      const res = await requestJson(baseUrl, 'POST', '/api/auth/login', {
        userId: 'MC2627110003',
        password: 'WrongPassword123',
        captchaId: cap.id,
        captchaAnswer: cap.answer,
      });
      assert.equal(res.status, 401);
    }

    // 5th attempt triggers lock (423)
    const cap5 = issueTestCaptcha(store);
    const lockRes = await requestJson(baseUrl, 'POST', '/api/auth/login', {
      userId: 'MC2627110003',
      password: 'WrongPassword123',
      captchaId: cap5.id,
      captchaAnswer: cap5.answer,
    });
    assert.equal(lockRes.status, 423);

    // Even valid password is blocked while locked
    const cap6 = issueTestCaptcha(store);
    const blockedRes = await requestJson(baseUrl, 'POST', '/api/auth/login', {
      userId: 'MC2627110003',
      password: 'Staff@2026!',
      captchaId: cap6.id,
      captchaAnswer: cap6.answer,
    });
    assert.equal(blockedRes.status, 423);

    // Invalid OTP check on Admin account
    const adminCap = issueTestCaptcha(store);
    const loginRes = await requestJson(baseUrl, 'POST', '/api/auth/login', {
      userId: 'MC2627110001',
      password: '8101352105',
      captchaId: adminCap.id,
      captchaAnswer: adminCap.answer,
    });
    const badOtp = await requestJson(baseUrl, 'POST', '/api/auth/verify-otp', {
      challengeId: loginRes.body.data.challengeId,
      otp: '000000',
    });
    assert.equal(badOtp.status, 401);
  });
});

test('6. Forgot Password & Password Reset OTP invalidates prior sessions', async () => {
  await withServer(async (baseUrl, store) => {
    const oldSession = await loginAs(baseUrl, store, 'MC2627110002', 'Manager@2026!');

    const forgotRes = await requestJson(baseUrl, 'POST', '/api/auth/forgot-password', {
      userId: 'MC2627110002',
    });
    assert.equal(forgotRes.status, 200);
    const resetOtp = forgotRes.body.data.sandboxOtpPreview;

    const resetRes = await requestJson(baseUrl, 'POST', '/api/auth/reset-password', {
      challengeId: forgotRes.body.data.challengeId,
      otp: resetOtp,
      newPassword: 'ManagerNew@2026!',
      confirmPassword: 'ManagerNew@2026!',
    });
    assert.equal(resetRes.status, 200);

    // Prior session must be invalidated
    const staleMe = await requestJson(
      baseUrl,
      'GET',
      '/api/auth/me',
      undefined,
      oldSession.cookies
    );
    assert.equal(staleMe.status, 401);

    // New password must succeed
    const newSession = await loginAs(baseUrl, store, 'MC2627110002', 'ManagerNew@2026!');
    assert.equal(newSession.user.userId, 'MC2627110002');
  });
});

test('7-8. Automatic User ID generation format (MCYYFFMMSSSS) and concurrent duplicate prevention', async () => {
  const store = new SecurityStore();
  const concurrent = await Promise.all([
    store.sequenceService.allocateNext('STAFF', 2026, 11),
    store.sequenceService.allocateNext('STAFF', 2026, 11),
    store.sequenceService.allocateNext('STAFF', 2026, 11),
    store.sequenceService.allocateNext('MANAGER', 2026, 11),
    store.sequenceService.allocateNext('ADMIN', 2026, 11),
  ]);

  assert.equal(new Set(concurrent).size, 5, 'All concurrently issued User IDs must be unique');
  for (const id of concurrent) {
    assert.match(id, /^MC\d{6}\d{4}$/, `Expected canonical MCYYFFMMSSSS ID, got ${id}`);
  }
  assert.equal(concurrent[0], 'MC2627110006');
  assert.equal(concurrent[1], 'MC2627110007');
  assert.equal(concurrent[2], 'MC2627110008');
  assert.equal(concurrent[3], 'MC2627110009');
  assert.equal(concurrent[4], 'MC2627110010');
});

test('9-10. Public registration disabled; Manager onboarding + Admin Approval & Rejection with Audit Log', async () => {
  await withServer(async (baseUrl, store) => {
    // Public unauthenticated registration submission is strictly disabled
    const publicAttempt = await requestJson(baseUrl, 'POST', '/api/registration-requests', {
      applicantName: 'Unauthorized Public',
      mobile: '+8801799887766',
      address: 'Road 12, Uttara',
      password: 'StaffJoin@2026!',
      confirmPassword: 'StaffJoin@2026!',
    });
    assert.equal(publicAttempt.status, 401);

    // Staff cannot initiate registration onboarding either
    const staff = await loginAs(baseUrl, store, 'MC2627110003', 'Staff@2026!');
    const staffAttempt = await requestJson(
      baseUrl,
      'POST',
      '/api/registration-requests',
      {
        applicantName: 'Unauthorized Staff Sub',
        mobile: '+8801799887766',
        address: 'Road 12, Uttara',
        password: 'StaffJoin@2026!',
        confirmPassword: 'StaffJoin@2026!',
      },
      staff.cookies
    );
    assert.equal(staffAttempt.status, 403);

    // Mobile OTP flow + authenticated Manager submits onboarding request
    const manager = await loginAs(baseUrl, store, 'MC2627110002', 'Manager@2026!');
    const sendMobile = await requestJson(baseUrl, 'POST', '/api/auth/mobile-otp/send', {
      mobile: '+8801799887766',
    });
    assert.equal(sendMobile.status, 200);

    const verifyMobile = await requestJson(baseUrl, 'POST', '/api/auth/verify-otp', {
      challengeId: sendMobile.body.data.challengeId,
      otp: sendMobile.body.data.sandboxOtpPreview,
    });
    assert.equal(verifyMobile.status, 200);

    const regRes = await requestJson(
      baseUrl,
      'POST',
      '/api/registration-requests',
      {
        applicantName: 'Kamrul Hasan',
        mobile: '+8801799887766',
        email: 'kamrul@muncomputer.local',
        address: 'Road 12, Uttara',
        password: 'StaffJoin@2026!',
        confirmPassword: 'StaffJoin@2026!',
        mobileVerificationToken: verifyMobile.body.data.verificationToken,
      },
      manager.cookies
    );
    assert.equal(regRes.status, 201);
    assert.equal(regRes.body.data.submittedBy, 'MC2627110002');
    const createdReqId = regRes.body.data.requestId;

    const admin = await loginAs(baseUrl, store, 'MC2627110001', '8101352105');

    // Approve new request -> issues canonical MCYYFFMMSSSS User ID
    const approveRes = await requestJson(
      baseUrl,
      'POST',
      `/api/registration-requests/${createdReqId}/approve`,
      { notes: 'Verified mobile and ID.' },
      admin.cookies
    );
    assert.equal(approveRes.status, 200);
    assert.match(approveRes.body.data.issuedUserId, /^MC\d{6}\d{4}$/);

    // Reject an existing pending request REQ-2026-0001
    const rejectRes = await requestJson(
      baseUrl,
      'POST',
      '/api/registration-requests/REQ-2026-0001/reject',
      { notes: 'Incomplete address proof.' },
      admin.cookies
    );
    assert.equal(rejectRes.status, 200);
    assert.equal(rejectRes.body.data.status, 'REJECTED');

    // Verify audit logs recorded both actions
    const auditRes = await requestJson(baseUrl, 'GET', '/api/audit-logs', undefined, admin.cookies);
    assert.equal(auditRes.status, 200);
    assert.ok(auditRes.body.data.some((l: any) => l.action === 'APPROVE_REGISTRATION'));
    assert.ok(auditRes.body.data.some((l: any) => l.action === 'REJECT_REGISTRATION'));
  });
});

test('11-12. Permission restrictions, RBAC boundaries, and Unauthorized/CSRF checks', async () => {
  await withServer(async (baseUrl, store) => {
    // Unauthenticated API request -> 401
    const unauth = await requestJson(baseUrl, 'GET', '/api/users');
    assert.equal(unauth.status, 401);

    // Staff cannot access user directory, approvals, or security logs
    const staff = await loginAs(baseUrl, store, 'MC2627110003', 'Staff@2026!');
    assert.equal(
      (await requestJson(baseUrl, 'GET', '/api/users', undefined, staff.cookies)).status,
      403
    );
    assert.equal(
      (await requestJson(baseUrl, 'GET', '/api/security-logs', undefined, staff.cookies)).status,
      403
    );
    assert.equal(
      (await requestJson(baseUrl, 'GET', '/api/registration-requests', undefined, staff.cookies)).status,
      403
    );

    // Manager cannot create another Manager or modify Admin permissions
    const manager = await loginAs(baseUrl, store, 'MC2627110002', 'Manager@2026!');
    const mgrCreateMgr = await requestJson(
      baseUrl,
      'POST',
      '/api/users',
      {
        fullName: 'Unauthorized Manager',
        role: 'MANAGER',
        mobile: '+8801711998877',
        address: 'Dhaka',
        password: 'Password@2026!',
        confirmPassword: 'Password@2026!',
      },
      manager.cookies
    );
    assert.equal(mgrCreateMgr.status, 403);

    const mgrEditPerms = await requestJson(
      baseUrl,
      'PUT',
      '/api/users/MC2627110003/permissions',
      { permissions: { 'transactions.FINANCIAL': true } },
      manager.cookies
    );
    assert.equal(mgrEditPerms.status, 403);

    // CSRF rejection when cookie session sent without matching X-CSRF-Token
    const admin = await loginAs(baseUrl, store, 'MC2627110001', '8101352105');
    const noCsrf = await requestJson(
      baseUrl,
      'PATCH',
      '/api/users/MC2627110003/status',
      { status: 'SUSPENDED' },
      { mun_session: admin.cookies.mun_session }
    );
    assert.equal(noCsrf.status, 403);
  });
});

test('13-14. Session expiration and Logout invalidation', async () => {
  await withServer(
    async (baseUrl, store) => {
      const staff = await loginAs(baseUrl, store, 'MC2627110003', 'Staff@2026!');
      // Verify active
      const ok = await requestJson(baseUrl, 'GET', '/api/auth/me', undefined, staff.cookies);
      assert.equal(ok.status, 200);

      // Logout invalidates session immediately
      const out = await requestJson(baseUrl, 'POST', '/api/auth/logout', {}, staff.cookies);
      assert.equal(out.status, 200);

      const afterLogout = await requestJson(
        baseUrl,
        'GET',
        '/api/auth/me',
        undefined,
        staff.cookies
      );
      assert.equal(afterLogout.status, 401);
    },
    { sessionTtlMs: 60_000 }
  );

  // Separate short-TTL session expiration test
  await withServer(
    async (baseUrl, store) => {
      const admin = await loginAs(baseUrl, store, 'MC2627110001', '8101352105');
      await new Promise((r) => setTimeout(r, 40));
      const expired = await requestJson(baseUrl, 'GET', '/api/auth/me', undefined, admin.cookies);
      assert.equal(expired.status, 401);
    },
    { sessionTtlMs: 15 }
  );
});
