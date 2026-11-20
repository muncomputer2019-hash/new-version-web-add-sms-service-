import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import { createApp } from '../server/app';
import { SecurityStore, MAX_REMEMBER_ME_MS } from '../server/securityStore';
import { UserIdSequenceService, resolveFinancialYearCode } from '../server/sequenceService';
import { hashPassword, hmacOtp, verifyPassword } from '../server/crypto';
import { ALL_PERMISSION_TYPES } from '../server/types';

interface HttpResult {
  status: number;
  body: any;
  cookies: Record<string, string>;
}

function extractSetCookies(setCookies: string[]): Record<string, string> {
  const jar: Record<string, string> = {};
  for (const entry of setCookies) {
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
  const setCookies =
    typeof (res.headers as any).getSetCookie === 'function'
      ? ((res.headers as any).getSetCookie() as string[])
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
  const id = `p02-cap-${Math.random().toString(36).slice(2, 10)}`;
  const answer = 'Z9Q4W';
  store.captchaChallenges.set(id, {
    id,
    answerHash: hmacOtp(answer, id),
    expiresAt: Date.now() + 60_000,
  });
  return { id, answer };
}

async function loginWithOptions(
  baseUrl: string,
  store: SecurityStore,
  userId: string,
  password: string,
  rememberMe = false
) {
  const cap = issueTestCaptcha(store);
  const loginRes = await requestJson(baseUrl, 'POST', '/api/auth/login', {
    userId,
    password,
    captchaId: cap.id,
    captchaAnswer: cap.answer,
    rememberMe,
  });
  assert.equal(loginRes.status, 200, `Login failed for ${userId}: ${loginRes.body.message}`);
  const otp = loginRes.body.data.sandboxOtpPreview;
  assert.ok(otp, 'Expected sandbox OTP in test mode');

  const otpRes = await requestJson(baseUrl, 'POST', '/api/auth/verify-otp', {
    challengeId: loginRes.body.data.challengeId,
    otp,
  });
  assert.equal(otpRes.status, 200, `OTP failed for ${userId}: ${otpRes.body.message}`);
  return {
    cookies: otpRes.cookies,
    user: otpRes.body.data.user,
    session: otpRes.body.data.session,
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

// ===========================================================================
// 1. UNIT TESTS: Canonical User ID Sequence, Password Policy, Default-Deny
// ===========================================================================
test('UNIT-01: UserIdSequenceService MCYYFFMMSSSS format, zero separators, Apr-Mar FY rollover', async () => {
  assert.equal(resolveFinancialYearCode(2026, 11), '2627');
  assert.equal(resolveFinancialYearCode(2027, 2), '2627');
  assert.equal(resolveFinancialYearCode(2027, 3), '2627');
  assert.equal(resolveFinancialYearCode(2027, 4), '2728');

  const seq = new UserIdSequenceService();
  const id1 = await seq.allocateNext('STAFF', 2026, 11, { actorUserId: 'MC2627110001' });
  const id2 = await seq.allocateNext('MANAGER', 2026, 11, { actorUserId: 'MC2627110001' });
  const id3 = await seq.allocateNext('STAFF', 2027, 2, { actorUserId: 'MC2627110001' });
  const id4 = await seq.allocateNext('STAFF', 2027, 4, { actorUserId: 'MC2627110001' });

  assert.equal(id1, 'MC2627110001');
  assert.equal(id2, 'MC2627110002');
  assert.equal(id3, 'MC2627020001');
  assert.equal(id4, 'MC2728040001');
  assert.ok(!id1.includes('-'), 'Canonical ID must not contain hyphens or separators');
  assert.equal(seq.idGenerationHistory.length, 4);
  assert.equal(seq.idGenerationHistory[0].userId, 'MC2728040001');
});

test('UNIT-02: Strong 12-char password hashing, verification & all 12 PermissionTypes registered', () => {
  assert.equal(ALL_PERMISSION_TYPES.length, 12);
  for (const required of [
    'VIEW',
    'ADD',
    'EDIT',
    'DELETE',
    'PRINT',
    'EXPORT',
    'APPROVE',
    'REJECT',
    'ASSIGN',
    'EXECUTE',
    'FINANCIAL',
    'MANAGE',
  ] as const) {
    assert.ok(ALL_PERMISSION_TYPES.includes(required));
  }

  const secret = 'Master8101352105';
  const storedHash = hashPassword(secret);
  assert.ok(!storedHash.includes(secret), 'Hash must never contain plaintext secret');
  assert.equal(verifyPassword(secret, storedHash), true);
  assert.equal(verifyPassword('WrongPassword@2026!', storedHash), false);
});

// ===========================================================================
// 2. INTEGRATION: Remember Me 240-min Strict Cap & Re-authentication Rotation
// ===========================================================================
test('INT-01: Remember Me session strictly capped at 240 minutes (4 hours) and never silently extended', async () => {
  await withServer(async (baseUrl, store) => {
    assert.equal(MAX_REMEMBER_ME_MS, 240 * 60 * 1000);
    const { cookies, session } = await loginWithOptions(
      baseUrl,
      store,
      'MC2627110002',
      'Manager@2026!',
      true
    );

    const createdMs = new Date(session.createdAt).getTime();
    const expiresMs = new Date(session.expiresAt).getTime();
    const maxAllowedMs = new Date(session.maxAllowedExpiresAt).getTime();

    assert.equal(session.rememberMe, true);
    assert.equal(maxAllowedMs - createdMs, 240 * 60 * 1000);
    assert.equal(expiresMs - createdMs, 240 * 60 * 1000);

    // Wait briefly and call /api/auth/me -> expiresAt must NOT be silently extended past maxAllowedExpiresAt
    await new Promise((r) => setTimeout(r, 25));
    const meRes = await requestJson(baseUrl, 'GET', '/api/auth/me', undefined, cookies);
    assert.equal(meRes.status, 200);
    const serverSess = Array.from(store.sessions.values()).find((s) => s.id === session.id)!;
    assert.ok(serverSess);
    assert.equal(new Date(serverSess.expiresAt).toISOString(), session.expiresAt);
    assert.equal(new Date(serverSess.maxAllowedExpiresAt).toISOString(), session.maxAllowedExpiresAt);

    // Re-authentication checks password & rotates session + CSRF tokens while keeping hard 240-min cap
    const badReauth = await requestJson(
      baseUrl,
      'POST',
      '/api/auth/reauthenticate',
      { password: 'Incorrect@2026!' },
      cookies
    );
    assert.equal(badReauth.status, 401);

    const goodReauth = await requestJson(
      baseUrl,
      'POST',
      '/api/auth/reauthenticate',
      { password: 'Manager@2026!' },
      cookies
    );
    assert.equal(goodReauth.status, 200);
    assert.ok(goodReauth.cookies.mun_session);
    assert.notEqual(goodReauth.cookies.mun_session, cookies.mun_session);
    assert.notEqual(goodReauth.cookies.mun_csrf, cookies.mun_csrf);
    assert.equal(
      goodReauth.body.data.session.maxAllowedExpiresAt,
      session.maxAllowedExpiresAt,
      'Re-authentication must not extend the 240-minute Remember Me cap'
    );

    // Old rotated session token is now invalid
    const oldTokenCheck = await requestJson(baseUrl, 'GET', '/api/auth/me', undefined, cookies);
    assert.equal(oldTokenCheck.status, 401);

    const newTokenCheck = await requestJson(
      baseUrl,
      'GET',
      '/api/auth/me',
      undefined,
      goodReauth.cookies
    );
    assert.equal(newTokenCheck.status, 200);
  });
});

// ===========================================================================
// 3. INTEGRATION: 12-Char Strong Password, Reuse Protection, Master Admin Lock
// ===========================================================================
test('INT-02: 12-char password policy, password reuse protection, and Master Admin immutability', async () => {
  await withServer(async (baseUrl, store) => {
    const admin = await loginWithOptions(baseUrl, store, 'MC2627110001', '8101352105');

    // Weak <12 char password rejected on Admin user creation
    const weakCreate = await requestJson(
      baseUrl,
      'POST',
      '/api/users',
      {
        fullName: 'Short Pass User',
        role: 'STAFF',
        mobile: '+8801712345678',
        address: 'Dhaka',
        password: 'Abc@1234',
        confirmPassword: 'Abc@1234',
      },
      admin.cookies
    );
    assert.equal(weakCreate.status, 422);

    // Strong >=12 char password succeeds & issues canonical MCYYFFMMSSSS ID
    const createOk = await requestJson(
      baseUrl,
      'POST',
      '/api/users',
      {
        fullName: 'Arifur Rahman',
        role: 'STAFF',
        mobile: '+8801712345679',
        email: 'arifur@muncomputer.local',
        address: 'Sector 7, Uttara',
        designation: 'CSC Counter Operator',
        departmentCode: 'DEPT-CSC',
        joiningDate: '2026-11-18',
        password: 'StaffSecure#2026',
        confirmPassword: 'StaffSecure#2026',
      },
      admin.cookies
    );
    assert.equal(createOk.status, 201);
    const newStaffId = createOk.body.data.user.userId;
    assert.match(newStaffId, /^MC\d{6}\d{4}$/);

    // Log in as new staff and verify password reuse check on change-password
    const staffUserSession = await loginWithOptions(baseUrl, store, newStaffId, 'StaffSecure#2026');
    const reusePwd = await requestJson(
      baseUrl,
      'POST',
      `/api/users/${newStaffId}/change-password`,
      {
        currentPassword: 'StaffSecure#2026',
        newPassword: 'StaffSecure#2026',
        confirmPassword: 'StaffSecure#2026',
      },
      staffUserSession.cookies
    );
    assert.equal(reusePwd.status, 422);

    // Master Admin cannot be suspended, deactivated, deleted, or permission-downgraded
    const suspendMaster = await requestJson(
      baseUrl,
      'PATCH',
      '/api/users/MC2627110001/status',
      { status: 'SUSPENDED' },
      admin.cookies
    );
    assert.equal(suspendMaster.status, 403);

    const deleteMaster = await requestJson(
      baseUrl,
      'DELETE',
      '/api/users/MC2627110001',
      undefined,
      admin.cookies
    );
    assert.equal(deleteMaster.status, 403);

    const downgradeMaster = await requestJson(
      baseUrl,
      'PUT',
      '/api/users/MC2627110001/permissions',
      { permissions: { 'users.MANAGE': false } },
      admin.cookies
    );
    assert.equal(downgradeMaster.status, 403);
  });
});

// ===========================================================================
// 4. INTEGRATION: 3-Tier Service RBAC Workflow (Admin -> Manager -> Staff) & Cascade
// ===========================================================================
test('INT-03: 3-Tier Admin -> Manager -> Staff service RBAC, Default-Deny, and automatic cascade suspension', async () => {
  await withServer(async (baseUrl, store) => {
    const admin = await loginWithOptions(baseUrl, store, 'MC2627110001', '8101352105');
    const manager = await loginWithOptions(baseUrl, store, 'MC2627110002', 'Manager@2026!');

    // Create a brand new Staff operator with zero service permissions
    const createStaff = await requestJson(
      baseUrl,
      'POST',
      '/api/users',
      {
        fullName: 'Tanvir Ahmed',
        role: 'STAFF',
        mobile: '+8801722334455',
        address: 'Mirpur 10',
        departmentCode: 'DEPT-CSC',
        password: 'TanvirStrong@2026',
        confirmPassword: 'TanvirStrong@2026',
      },
      admin.cookies
    );
    assert.equal(createStaff.status, 201);
    const staffUserId = createStaff.body.data.user.userId;
    const staff = await loginWithOptions(baseUrl, store, staffUserId, 'TanvirStrong@2026');

    // Provision an active customer so ERP application hits RBAC Default-Deny on service execution
    const custCreate = await requestJson(
      baseUrl,
      'POST',
      '/api/erp/customers',
      {
        fullName: 'Phase02 Test Customer',
        mobile: '+8801811223344',
        village: 'Mamudpur',
        gender: 'Male',
      },
      admin.cookies
    );
    assert.equal(custCreate.status, 201);
    const testCustomerId = custCreate.body.data.customerId;

    const targetServiceId = 'MCS-2026-27-000010';
    const unassignedServiceId = 'MCS-2026-27-000099';

    // Default Deny before any approval: Staff execute is 403 and ERP order creation is 403
    const deniedBefore = await requestJson(
      baseUrl,
      'POST',
      '/api/service-permissions/execute',
      { serviceId: targetServiceId, permission: 'EXECUTE' },
      staff.cookies
    );
    assert.equal(deniedBefore.status, 403);

    const erpDeniedBefore = await requestJson(
      baseUrl,
      'POST',
      '/api/erp/applications',
      {
        customerId: testCustomerId,
        serviceId: 'MCS-2026-27-000001',
        submitMode: 'Draft',
      },
      staff.cookies
    );
    assert.equal(erpDeniedBefore.status, 403);

    // 1. Admin assigns targetServiceId to Manager
    const assignMgr = await requestJson(
      baseUrl,
      'POST',
      '/api/service-permissions/manager-assignments',
      {
        managerUserId: 'MC2627110002',
        serviceId: targetServiceId,
        serviceName: 'e-KYC & Aadhaar Print Assistance',
        departmentCode: 'DEPT-CSC',
        permissions: ['VIEW', 'ADD', 'EDIT', 'ASSIGN', 'EXECUTE'],
      },
      admin.cookies
    );
    assert.equal(assignMgr.status, 201);
    const assignmentCode = assignMgr.body.data.assignmentCode;

    // 2. Manager CANNOT request unassigned service for Staff -> 403
    const badMgrReq = await requestJson(
      baseUrl,
      'POST',
      '/api/service-permissions/staff-requests',
      {
        staffUserId,
        serviceId: unassignedServiceId,
        requestedPermissions: ['VIEW', 'EXECUTE'],
      },
      manager.cookies
    );
    assert.equal(badMgrReq.status, 403);

    // 3. Manager submits Staff service request from active assigned scope -> PENDING_ADMIN_APPROVAL
    const mgrReq = await requestJson(
      baseUrl,
      'POST',
      '/api/service-permissions/staff-requests',
      {
        staffUserId,
        serviceId: targetServiceId,
        requestedPermissions: ['VIEW', 'EXECUTE'],
        reason: 'Assign Desk 2 e-KYC operation',
      },
      manager.cookies
    );
    assert.equal(mgrReq.status, 201);
    assert.equal(mgrReq.body.data.status, 'PENDING_ADMIN_APPROVAL');
    const requestCode = mgrReq.body.data.requestCode;

    // 4. Manager CANNOT self-approve Staff request -> 403
    const mgrSelfApprove = await requestJson(
      baseUrl,
      'POST',
      `/api/service-permissions/staff-requests/${requestCode}/decide`,
      { decision: 'APPROVE' },
      manager.cookies
    );
    assert.equal(mgrSelfApprove.status, 403);

    // Staff still blocked while PENDING_ADMIN_APPROVAL -> 403
    const stillPending = await requestJson(
      baseUrl,
      'POST',
      '/api/service-permissions/execute',
      { serviceId: targetServiceId, permission: 'EXECUTE' },
      staff.cookies
    );
    assert.equal(stillPending.status, 403);

    // 5. Admin approves -> Staff executes successfully -> 200
    const adminApprove = await requestJson(
      baseUrl,
      'POST',
      `/api/service-permissions/staff-requests/${requestCode}/decide`,
      { decision: 'APPROVE', notes: 'Approved by Master Admin' },
      admin.cookies
    );
    assert.equal(adminApprove.status, 200);
    assert.equal(adminApprove.body.data.permission.status, 'ACTIVE');

    const allowedAfter = await requestJson(
      baseUrl,
      'POST',
      '/api/service-permissions/execute',
      { serviceId: targetServiceId, permission: 'EXECUTE' },
      staff.cookies
    );
    assert.equal(allowedAfter.status, 200);
    assert.equal(allowedAfter.body.data.executed, true);

    // 6. Admin suspends Manager's service assignment -> cascades automatically to Staff -> 403 immediately
    const suspendMgrSvc = await requestJson(
      baseUrl,
      'PATCH',
      `/api/service-permissions/manager-assignments/${assignmentCode}/status`,
      { status: 'SUSPENDED', reason: 'Audit review hold' },
      admin.cookies
    );
    assert.equal(suspendMgrSvc.status, 200);
    assert.ok(suspendMgrSvc.body.data.cascadedStaffCount >= 1);

    const cascadedDeny = await requestJson(
      baseUrl,
      'POST',
      '/api/service-permissions/execute',
      { serviceId: targetServiceId, permission: 'EXECUTE' },
      staff.cookies
    );
    assert.equal(cascadedDeny.status, 403);
  });
});

// ===========================================================================
// 5. SECURITY: IDOR, CSRF, XSS Sanitization, Role Boundaries
// ===========================================================================
test('SEC-01: IDOR blocking, CSRF protection, XSS sanitization, and Email cannot replace User ID', async () => {
  await withServer(async (baseUrl, store) => {
    const admin = await loginWithOptions(baseUrl, store, 'MC2627110001', '8101352105');
    const manager = await loginWithOptions(baseUrl, store, 'MC2627110002', 'Manager@2026!');
    const staff = await loginWithOptions(baseUrl, store, 'MC2627110003', 'Staff@2026!');

    // Email login must not replace User ID login system
    const cap = issueTestCaptcha(store);
    const emailLogin = await requestJson(baseUrl, 'POST', '/api/auth/login', {
      userId: 'admin@muncomputer.local',
      password: '8101352105',
      captchaId: cap.id,
      captchaAnswer: cap.answer,
    });
    assert.equal(emailLogin.status, 401);

    // IDOR: Manager cannot inspect Admin user record, Staff cannot inspect Manager
    const mgrGetAdmin = await requestJson(
      baseUrl,
      'GET',
      '/api/users/MC2627110001',
      undefined,
      manager.cookies
    );
    assert.equal(mgrGetAdmin.status, 403);

    const staffGetMgr = await requestJson(
      baseUrl,
      'GET',
      '/api/users/MC2627110002',
      undefined,
      staff.cookies
    );
    assert.equal(staffGetMgr.status, 403);

    // XSS sanitization on user creation
    const xssRes = await requestJson(
      baseUrl,
      'POST',
      '/api/users',
      {
        fullName: '<script>alert("xss")</script>Nadia Islam',
        role: 'STAFF',
        mobile: '+8801799001122',
        address: '<img src=x onerror=alert(1)>Dhaka',
        password: 'SafeUserPass@2026',
        confirmPassword: 'SafeUserPass@2026',
      },
      admin.cookies
    );
    assert.equal(xssRes.status, 201);
    assert.ok(!xssRes.body.data.user.fullName.includes('<script>'));
    assert.ok(!xssRes.body.data.user.address.includes('<img'));

    // CSRF rejection on mutating endpoint
    const noCsrf = await requestJson(
      baseUrl,
      'POST',
      '/api/departments',
      { departmentCode: 'DEPT-NEW', name: 'Test Dept' },
      { mun_session: admin.cookies.mun_session }
    );
    assert.equal(noCsrf.status, 403);
  });
});

// ===========================================================================
// 6. PERFORMANCE: 20 Concurrent Logins & 50 Parallel Atomic User ID Allocations
// ===========================================================================
test('PERF-01: 50 parallel atomic MCYYFFMMSSSS User ID allocations & 20 concurrent OTP logins', async () => {
  await withServer(async (baseUrl, store) => {
    const t0 = Date.now();
    const idPromises = Array.from({ length: 50 }, (_, idx) =>
      store.sequenceService.allocateNext(idx % 2 === 0 ? 'STAFF' : 'MANAGER', 2026, 12, {
        actorUserId: 'MC2627110001',
      })
    );
    const allocated = await Promise.all(idPromises);
    assert.equal(new Set(allocated).size, 50, 'All 50 concurrent allocations must be unique');
    assert.equal(allocated[0], 'MC2627120001');
    assert.equal(allocated[49], 'MC2627120050');

    const loginPromises = Array.from({ length: 20 }, () =>
      loginWithOptions(baseUrl, store, 'MC2627110001', '8101352105', true)
    );
    const sessions = await Promise.all(loginPromises);
    assert.equal(sessions.length, 20);
    const elapsedMs = Date.now() - t0;
    assert.ok(elapsedMs < 5000, `Expected 50 allocations + 20 logins under 5000ms, got ${elapsedMs}ms`);
  });
});
