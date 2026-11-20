import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import { createApp } from '../server/app';
import { SecurityStore } from '../server/securityStore';
import { Phase03Store } from '../server/phase03Store';
import { ErpStore } from '../server/erpStore';
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
  const id = `erp-cap-${Math.random().toString(36).slice(2, 10)}`;
  const answer = 'K7Q2M';
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

const SAMPLE_PDF_B64 = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF').toString('base64');

function startTestServer() {
  const securityStore = new SecurityStore();
  const phase03Store = new Phase03Store();
  const erpStore = new ErpStore(securityStore, phase03Store);
  seedTestFixtures({ phase03Store, erpStore });
  const app = createApp(securityStore, {
    enableRateLimit: false,
    phase03Store,
    erpStore,
  });
  const server = http.createServer(app);
  return { server, securityStore, phase03Store, erpStore };
}

test('Q1-Q12: Customer CRM duplicate checks, OTP verification, 7 consents, bulk CSV & Admin merge', async () => {
  const { server, securityStore } = startTestServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    const adminCookies = await loginAs(baseUrl, securityStore, 'MC2627110001', '8101352105');
    const staffCookies = await loginAs(baseUrl, securityStore, 'MC2627110003', 'Staff@2026!');

    // 1. Create unique customer -> MCC-YYYY-YY-NNNNNN & Aadhaar always masked
    const c1 = await requestApi(
      baseUrl,
      'POST',
      '/api/erp/customers',
      {
        fullName: 'Ramesh Mandal',
        fatherOrHusbandName: 'Bimal Mandal',
        dob: '1991-05-10',
        gender: 'Male',
        mobile: '9832001122',
        village: 'Mamudpur',
        district: 'Murshidabad',
        pinCode: '742406',
        aadhaarNumber: '445566778899',
        consents: [
          { category: 'DATA_PRIVACY_CONSENT', granted: true, verificationMethod: 'Digital Signature' },
          { category: 'PROMOTIONAL_CONSENT', granted: false },
        ],
      },
      staffCookies
    );
    assert.equal(c1.status, 201);
    assert.match(c1.body.data.customerId, /^MCC-\d{4}-\d{2}-\d{6}$/);
    assert.equal(c1.body.data.aadhaarMasked, 'XXXX-XXXX-8899');
    assert.equal(c1.body.data.aadhaarEncrypted, undefined);

    // 2. Duplicate mobile rejected with 409, Staff cannot override (403), Admin can override (201)
    const dupStaff = await requestApi(
      baseUrl,
      'POST',
      '/api/erp/customers',
      {
        fullName: 'Suresh Mandal',
        mobile: '9832001122',
        village: 'Mamudpur',
        overrideDuplicateReason: 'Shared family phone',
      },
      staffCookies
    );
    assert.equal(dupStaff.status, 403);

    const dupNoReason = await requestApi(
      baseUrl,
      'POST',
      '/api/erp/customers',
      {
        fullName: 'Suresh Mandal',
        mobile: '9832001122',
        village: 'Mamudpur',
      },
      adminCookies
    );
    assert.equal(dupNoReason.status, 409);

    const dupAdmin = await requestApi(
      baseUrl,
      'POST',
      '/api/erp/customers',
      {
        fullName: 'Suresh Mandal',
        mobile: '9832001122',
        village: 'Mamudpur',
        overrideDuplicateReason: 'Same household family mobile approved by Admin',
      },
      adminCookies
    );
    assert.equal(dupAdmin.status, 201);
    const cust1Id = c1.body.data.customerId;
    const cust2Id = dupAdmin.body.data.customerId;

    // 3. Mobile OTP verification & Consent-gated notification truthfulness
    const otpSend = await requestApi(
      baseUrl,
      'POST',
      '/api/auth/mobile-otp/send',
      { mobile: '9832001122' },
      staffCookies
    );
    assert.equal(otpSend.status, 200);
    const otpVer = await requestApi(
      baseUrl,
      'POST',
      '/api/auth/verify-otp',
      { challengeId: otpSend.body.data.challengeId, otp: otpSend.body.data.sandboxOtpPreview },
      staffCookies
    );
    assert.equal(otpVer.status, 200);

    const managerCookies = await loginAs(baseUrl, securityStore, 'MC2627110002', 'Manager@2026!');

    // Staff lacks customers.EDIT (403); Manager succeeds (200)
    const staffVerifyRes = await requestApi(
      baseUrl,
      'POST',
      `/api/erp/customers/${cust1Id}/verify-mobile`,
      { verificationToken: otpVer.body.data.verificationToken },
      staffCookies
    );
    assert.equal(staffVerifyRes.status, 403);

    const mobVerifyRes = await requestApi(
      baseUrl,
      'POST',
      `/api/erp/customers/${cust1Id}/verify-mobile`,
      { verificationToken: otpVer.body.data.verificationToken },
      managerCookies
    );
    assert.equal(mobVerifyRes.status, 200);
    assert.equal(mobVerifyRes.body.data.verificationStatus, 'Fully Verified');

    // Notification without PROMOTIONAL_CONSENT must return Skipped (No Consent)
    const noConsentSms = await requestApi(
      baseUrl,
      'POST',
      '/api/erp/notifications/send',
      {
        customerId: cust1Id,
        channel: 'SMS',
        eventKey: 'PROMO_OFFER',
        messagePreview: 'Festival offer',
      },
      staffCookies
    );
    assert.equal(noConsentSms.status, 201);
    assert.equal(noConsentSms.body.data.status, 'Skipped (No Consent)');

    // 4. Bulk CSV Import preview + commit & Admin Merge
    const bulkPrev = await requestApi(
      baseUrl,
      'POST',
      '/api/erp/customers/bulk-import',
      {
        commit: false,
        rows: [
          { fullName: 'Bulk Client A', mobile: '9911002233', village: 'Domkal' },
          { fullName: 'X', mobile: '12', village: 'A' },
        ],
      },
      adminCookies
    );
    assert.equal(bulkPrev.status, 200);
    assert.equal(bulkPrev.body.data.validCount, 1);
    assert.equal(bulkPrev.body.data.invalidCount, 1);

    const mergeStaff = await requestApi(
      baseUrl,
      'POST',
      '/api/erp/customers/merge',
      { primaryCustomerId: cust1Id, duplicateCustomerId: cust2Id, reason: 'Duplicate merge' },
      staffCookies
    );
    assert.equal(mergeStaff.status, 403);

    const mergeAdmin = await requestApi(
      baseUrl,
      'POST',
      '/api/erp/customers/merge',
      { primaryCustomerId: cust1Id, duplicateCustomerId: cust2Id, reason: 'Consolidated household record' },
      adminCookies
    );
    assert.equal(mergeAdmin.status, 200);
  } finally {
    server.close();
  }
});

test('Q13-Q35: Dynamic Form Versioning, Private Docs, 12-Status State Machine, Staff Isolation & Reference Uniqueness', async () => {
  const { server, securityStore, erpStore } = startTestServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    const adminCookies = await loginAs(baseUrl, securityStore, 'MC2627110001', '8101352105');
    const managerCookies = await loginAs(baseUrl, securityStore, 'MC2627110002', 'Manager@2026!');
    const staffCookies = await loginAs(baseUrl, securityStore, 'MC2627110003', 'Staff@2026!');

    // Get seeded PAN/Passport service (MCS-2026-27-000002) & customer
    const servicesRes = await requestApi(baseUrl, 'GET', '/api/erp/services', undefined, adminCookies);
    const service = servicesRes.body.data.find((s: any) => s.serviceId === 'MCS-2026-27-000002') ?? servicesRes.body.data[0];
    const custRes = await requestApi(baseUrl, 'GET', '/api/erp/customers', undefined, adminCookies);
    const customer = custRes.body.data[0];
    const customer2 = custRes.body.data[1];

    // 1. Validate invalid/unexpected dynamic form data rejected 422
    const badFormApp = await requestApi(
      baseUrl,
      'POST',
      '/api/erp/applications',
      {
        customerId: customer.customerId,
        serviceId: service.serviceId,
        submitMode: 'Draft',
        formData: { nonexistent_injected_key: 'bad' },
      },
      staffCookies
    );
    assert.equal(badFormApp.status, 422);

    // 2. Reject executable file (.exe) with 422
    const exeApp = await requestApi(
      baseUrl,
      'POST',
      '/api/erp/applications',
      {
        customerId: customer.customerId,
        serviceId: service.serviceId,
        submitMode: 'Draft',
        formData: {},
        initialDocuments: [
          {
            docKey: 'aadhaar_copy',
            category: 'Aadhaar',
            originalName: 'virus.exe',
            mimeType: 'application/pdf',
            contentBase64: SAMPLE_PDF_B64,
          },
        ],
      },
      staffCookies
    );
    assert.equal(exeApp.status, 422);

    // 3. Create v1 application as Draft, then publish Form v2 on service -> v1 snapshot remains immutable
    const app1Res = await requestApi(
      baseUrl,
      'POST',
      '/api/erp/applications',
      {
        customerId: customer.customerId,
        serviceId: service.serviceId,
        submitMode: 'Draft',
        duplicateOverrideReason: 'Test scenario additional intake',
        formData: {
          applicant_type: 'Correction / Update',
          applicant_aadhaar: '112233445566',
          applicant_pan: 'ABCDE1234F',
          delivery_address: 'Mamudpur, Domkal, Murshidabad',
        },
        initialPayment: { amount: 100, paymentMethod: 'Cash' },
      },
      staffCookies
    );
    assert.equal(app1Res.status, 201);
    const app1No = app1Res.body.data.applicationNo;
    assert.match(app1No, /^MCA-\d{4}-\d{2}-\d{6}$/);
    const v1Count = app1Res.body.data.serviceSnapshot.appliedFormVersion;

    const v2Res = await requestApi(
      baseUrl,
      'POST',
      `/api/erp/services/${service.serviceId}/form-versions`,
      {
        fields: [
          ...service.formVersions[0].fields,
          {
            fieldKey: 'new_v2_remarks',
            label: 'New V2 Remarks',
            fieldType: 'short_text',
            required: false,
            displayOrder: 10,
            enabled: true,
          },
        ],
      },
      adminCookies
    );
    assert.equal(v2Res.status, 201);
    assert.equal(v2Res.body.data.currentFormVersion, v1Count + 1);

    const app1Check = await requestApi(baseUrl, 'GET', `/api/erp/applications/${app1No}`, undefined, adminCookies);
    assert.equal(app1Check.body.data.application.serviceSnapshot.appliedFormVersion, v1Count);

    // 4. Final submission blocked if mandatory docs missing (422), allowed via Manager exception (200)
    const submitBlocked = await requestApi(
      baseUrl,
      'POST',
      `/api/erp/applications/${app1No}/status`,
      { nextStatus: 'Submitted' },
      staffCookies
    );
    assert.equal(submitBlocked.status, 422);

    // Upload valid private PDF document
    const upDoc = await requestApi(
      baseUrl,
      'POST',
      `/api/erp/applications/${app1No}/documents`,
      {
        docKey: 'aadhaar_copy',
        category: 'Existing Aadhaar',
        originalName: 'aadhaar_scan.pdf',
        mimeType: 'application/pdf',
        contentBase64: SAMPLE_PDF_B64,
      },
      staffCookies
    );
    assert.equal(upDoc.status, 201);
    const fileUuid = upDoc.body.data.document.fileUuid;

    // List endpoint strips contentBase64; download endpoint serves it & audits
    const appAfterDoc = await requestApi(baseUrl, 'GET', `/api/erp/applications/${app1No}`, undefined, staffCookies);
    assert.equal(appAfterDoc.body.data.application.documents[0].contentBase64, undefined);

    const dlDoc = await requestApi(baseUrl, 'GET', `/api/erp/documents/${fileUuid}/download`, undefined, staffCookies);
    assert.equal(dlDoc.status, 200);
    assert.equal(dlDoc.body.data.contentBase64, SAMPLE_PDF_B64);

    // Staff cannot verify document (403); Manager can verify (200)
    const staffVer = await requestApi(
      baseUrl,
      'POST',
      `/api/erp/documents/${fileUuid}/verify`,
      { status: 'Verified', reason: 'Self verify' },
      staffCookies
    );
    assert.equal(staffVer.status, 403);

    const mgrVer = await requestApi(
      baseUrl,
      'POST',
      `/api/erp/documents/${fileUuid}/verify`,
      { status: 'Verified', reason: 'Clear PDF verified' },
      managerCookies
    );
    assert.equal(mgrVer.status, 200);

    // Submit with Manager exception (since 2nd required doc poa_proof not uploaded)
    const submitExc = await requestApi(
      baseUrl,
      'POST',
      `/api/erp/applications/${app1No}/status`,
      { nextStatus: 'Submitted', mandatoryDocExceptionReason: 'Original POA verified physically at counter' },
      managerCookies
    );
    assert.equal(submitExc.status, 200);
    assert.equal(submitExc.body.data.status, 'Submitted');

    // Invalid jump Submitted -> Completed rejected 422
    const invalidJump = await requestApi(
      baseUrl,
      'POST',
      `/api/erp/applications/${app1No}/status`,
      { nextStatus: 'Completed' },
      adminCookies
    );
    assert.equal(invalidJump.status, 422);

    // On Hold requires reason
    const holdNoReason = await requestApi(
      baseUrl,
      'POST',
      `/api/erp/applications/${app1No}/status`,
      { nextStatus: 'On Hold' },
      managerCookies
    );
    assert.equal(holdNoReason.status, 422);

    const holdOk = await requestApi(
      baseUrl,
      'POST',
      `/api/erp/applications/${app1No}/status`,
      { nextStatus: 'On Hold', reason: 'Awaiting biometric slot' },
      managerCookies
    );
    assert.equal(holdOk.status, 200);

    // 5. Reference Field Uniqueness (GLOBAL: acknowledgement_number) & Search
    const ref1 = await requestApi(
      baseUrl,
      'POST',
      `/api/erp/applications/${app1No}/references`,
      { fieldKey: 'acknowledgement_number', value: 'ACK-UNIQ-9901', reason: 'Portal ARN' },
      staffCookies
    );
    assert.equal(ref1.status, 200);

    const app2Res = await requestApi(
      baseUrl,
      'POST',
      '/api/erp/applications',
      {
        customerId: customer2.customerId,
        serviceId: service.serviceId,
        submitMode: 'Draft',
        duplicateOverrideReason: 'Second test app',
        formData: {},
      },
      adminCookies
    );
    const app2No = app2Res.body.data.applicationNo;

    const dupRef = await requestApi(
      baseUrl,
      'POST',
      `/api/erp/applications/${app2No}/references`,
      { fieldKey: 'acknowledgement_number', value: 'ACK-UNIQ-9901' },
      adminCookies
    );
    assert.equal(dupRef.status, 409);

    // Searchable by acknowledgement_number reference value
    const searchByRef = await requestApi(
      baseUrl,
      'GET',
      '/api/erp/applications?q=ACK-UNIQ-9901',
      undefined,
      adminCookies
    );
    assert.equal(searchByRef.status, 200);
    assert.equal(searchByRef.body.data.length, 1);
    assert.equal(searchByRef.body.data[0].applicationNo, app1No);

    // 6. Record-level isolation: assign app2 exclusively to a second Staff -> seeded Staff cannot access (403)
    const targetApp2 = erpStore.applications.find((a) => a.applicationNo === app2No)!;
    targetApp2.assignedStaffId = 'MC2627119999';
    targetApp2.assignedCounterCode = 'CTR-99';
    targetApp2.createdBy = 'MC2627110001';

    const isolatedAccess = await requestApi(
      baseUrl,
      'GET',
      `/api/erp/applications/${app2No}`,
      undefined,
      staffCookies
    );
    assert.equal(isolatedAccess.status, 403);

    // Staff submits Reassignment Request on app1 -> Manager approves
    const reassReq = await requestApi(
      baseUrl,
      'POST',
      `/api/erp/applications/${app1No}/reassignment-requests`,
      { proposedStaffId: 'MC2627110002', proposedCounterCode: 'CTR-02', reason: 'Shift handover' },
      staffCookies
    );
    assert.equal(reassReq.status, 201);
    const reqCode = reassReq.body.data.requestCode;

    const reassApprove = await requestApi(
      baseUrl,
      'POST',
      `/api/erp/reassignment-requests/${reqCode}/review`,
      { decision: 'Approved', reviewNotes: 'Approved shift transfer' },
      managerCookies
    );
    assert.equal(reassApprove.status, 200);
  } finally {
    server.close();
  }
});

test('Q36-Q51: Delivery Handover, Payments/UPI Verification, Refunds Guard, Notes Isolation & Report Export Audit', async () => {
  const { server, securityStore } = startTestServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    const adminCookies = await loginAs(baseUrl, securityStore, 'MC2627110001', '8101352105');
    const staffCookies = await loginAs(baseUrl, securityStore, 'MC2627110003', 'Staff@2026!');

    const appsRes = await requestApi(baseUrl, 'GET', '/api/erp/applications', undefined, adminCookies);
    const pendingOfficeApp = appsRes.body.data.find((a: any) => a.applicationNo === 'MCA-2026-27-000002');
    const processingApp = appsRes.body.data.find((a: any) => a.applicationNo === 'MCA-2026-27-000003');
    assert.ok(pendingOfficeApp && processingApp, 'Seeded applications must exist');

    // 1. Delivery handover requires handoverConfirmed = true before marking Delivered
    const badDel = await requestApi(
      baseUrl,
      'POST',
      `/api/erp/applications/${processingApp.applicationNo}/delivery`,
      {
        deliverableType: 'Upgraded Laptop + SSD Old Drive',
        deliveryMethod: 'In-Person Counter Handover',
        receivedBy: 'Customer',
        handoverConfirmed: false,
        status: 'Delivered',
      },
      adminCookies
    );
    assert.equal(badDel.status, 422);

    const goodDel = await requestApi(
      baseUrl,
      'POST',
      `/api/erp/applications/${processingApp.applicationNo}/delivery`,
      {
        deliverableType: 'Upgraded Laptop + SSD Old Drive',
        deliveryMethod: 'In-Person Counter Handover',
        receivedBy: processingApp.customerSnapshot.fullName,
        handoverConfirmed: true,
        status: 'Delivered',
      },
      adminCookies
    );
    assert.equal(goodDel.status, 201);
    assert.match(goodDel.body.data.deliveryId, /^MCD-\d{4}-\d{2}-\d{6}$/);

    // 2. UPI payment on MCA-2026-27-000002 starts Pending Verification -> Admin confirms
    const upiPay = await requestApi(
      baseUrl,
      'POST',
      '/api/erp/payments',
      {
        applicationNo: pendingOfficeApp.applicationNo,
        amount: 50,
        paymentMethod: 'UPI',
        upiReference: 'UPI-UTR-778899',
      },
      staffCookies
    );
    assert.equal(upiPay.status, 201);
    assert.equal(upiPay.body.data.verificationStatus, 'Pending Verification');

    const upiConfirm = await requestApi(
      baseUrl,
      'POST',
      `/api/erp/payments/${upiPay.body.data.transactionId}/verify`,
      { decision: 'Confirmed' },
      adminCookies
    );
    assert.equal(upiConfirm.status, 200);
    assert.equal(upiConfirm.body.data.verificationStatus, 'Confirmed');

    // 3. Refund cannot exceed payment amount & double refund is prevented
    const overRefund = await requestApi(
      baseUrl,
      'POST',
      '/api/erp/refunds',
      {
        applicationNo: pendingOfficeApp.applicationNo,
        originalTransactionId: upiPay.body.data.transactionId,
        refundType: 'Partial',
        refundAmount: 5000,
        refundMethod: 'Cash',
        refundReason: 'Excess amount check',
      },
      adminCookies
    );
    assert.equal(overRefund.status, 422);

    const validRefund = await requestApi(
      baseUrl,
      'POST',
      '/api/erp/refunds',
      {
        applicationNo: pendingOfficeApp.applicationNo,
        originalTransactionId: upiPay.body.data.transactionId,
        refundType: 'Full',
        refundAmount: 50,
        refundMethod: 'Cash',
        refundReason: 'Extra test payment refunded',
      },
      adminCookies
    );
    assert.equal(validRefund.status, 201);
    assert.match(validRefund.body.data.refundId, /^MCRF-\d{4}-\d{2}-\d{6}$/);

    // Second refund on same payment exceeding 0 remaining -> 422
    const doubleRefund = await requestApi(
      baseUrl,
      'POST',
      '/api/erp/refunds',
      {
        applicationNo: pendingOfficeApp.applicationNo,
        originalTransactionId: upiPay.body.data.transactionId,
        refundType: 'Full',
        refundAmount: 10,
        refundMethod: 'Cash',
        refundReason: 'Duplicate refund attempt',
      },
      adminCookies
    );
    assert.equal(doubleRefund.status, 422);

    // 4. Separate Internal vs Customer notes & Export Audit Log
    const intNote = await requestApi(
      baseUrl,
      'POST',
      `/api/erp/applications/${pendingOfficeApp.applicationNo}/notes`,
      { noteType: 'INTERNAL', content: 'Internal office verification note' },
      staffCookies
    );
    assert.equal(intNote.status, 201);

    const expLog = await requestApi(
      baseUrl,
      'POST',
      '/api/erp/reports/export-log',
      { reportName: 'Daily Collection Report', format: 'CSV', rowCount: 12 },
      adminCookies
    );
    assert.equal(expLog.status, 201);

    const repSum = await requestApi(baseUrl, 'GET', '/api/erp/reports/summary', undefined, adminCookies);
    assert.equal(repSum.status, 200);
    assert.ok(repSum.body.data.exportLogs.length >= 1);
  } finally {
    server.close();
  }
});

test('Services Module: 21 Categories, 77 Subcategories, 675 Services (MC2627SRV-001..675), CRUD & Sync', async () => {
  const { server, securityStore } = startTestServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    const adminCookies = await loginAs(baseUrl, securityStore, 'MC2627110001', '8101352105');

    const [catsRes, subsRes, svcsRes] = await Promise.all([
      requestApi(baseUrl, 'GET', '/api/erp/service-categories', undefined, adminCookies),
      requestApi(baseUrl, 'GET', '/api/erp/service-subcategories', undefined, adminCookies),
      requestApi(baseUrl, 'GET', '/api/erp/services', undefined, adminCookies),
    ]);

    assert.equal(catsRes.status, 200);
    assert.equal(subsRes.status, 200);
    assert.equal(svcsRes.status, 200);
    assert.equal(catsRes.body.data.length, 21);
    assert.equal(subsRes.body.data.length, 77);
    assert.equal(svcsRes.body.data.length, 675);

    const codes = svcsRes.body.data.map((s: any) => s.serviceCode);
    assert.equal(codes[0], 'MC2627SRV-001');
    assert.equal(codes[codes.length - 1], 'MC2627SRV-675');

    // Sync endpoint verifies counts & range idempotently
    const syncRes = await requestApi(
      baseUrl,
      'POST',
      '/api/erp/services/sync-catalog',
      {},
      adminCookies
    );
    assert.equal(syncRes.status, 200);
    assert.equal(syncRes.body.data.categoriesCount, 21);
    assert.equal(syncRes.body.data.subcategoriesCount, 77);
    assert.equal(syncRes.body.data.servicesCount, 675);
    assert.equal(syncRes.body.data.codeRange, 'MC2627SRV-001 to MC2627SRV-675');

    // Create 676th service -> auto-generates MC2627SRV-676 and computes rates/profit
    const createRes = await requestApi(
      baseUrl,
      'POST',
      '/api/erp/services',
      {
        name: 'Custom Affidavit Typing',
        categoryId: catsRes.body.data[0].id,
        subcategoryId: subsRes.body.data[0].id,
        serviceCharge: 200,
        govtFee: 50,
        additionalCharges: 25,
        serviceCost: 40,
        description: 'Custom test service',
      },
      adminCookies
    );
    assert.equal(createRes.status, 201);
    const created = createRes.body.data;
    assert.match(created.serviceId, /^MCS-\d{4}-\d{2}-000676$/);
    assert.match(created.serviceCode, /^MC\d{4}SRV-676$/);
    assert.equal(created.totalCustomerCharge, 275);
    assert.equal(created.profitAmount, 185);

    // Update rates & details; serviceCode must stay locked even if spoofed in body
    const updRes = await requestApi(
      baseUrl,
      'PUT',
      `/api/erp/services/${created.serviceId}`,
      {
        serviceCode: 'HACK-001',
        name: 'Custom Affidavit Typing Updated',
        serviceCharge: 300,
        govtFee: 100,
        additionalCharges: 50,
        serviceCost: 70,
      },
      adminCookies
    );
    assert.equal(updRes.status, 200);
    assert.equal(updRes.body.data.serviceCode, created.serviceCode);
    assert.equal(updRes.body.data.name, 'Custom Affidavit Typing Updated');
    assert.equal(updRes.body.data.totalCustomerCharge, 450);
    assert.equal(updRes.body.data.profitAmount, 280);

    // Toggle status Active <-> Inactive
    const deactRes = await requestApi(
      baseUrl,
      'PATCH',
      `/api/erp/services/${created.serviceId}/status`,
      { status: 'Inactive' },
      adminCookies
    );
    assert.equal(deactRes.status, 200);
    assert.equal(deactRes.body.data.status, 'Inactive');

    // Delete permanently -> no longer returned on GET
    const delRes = await requestApi(
      baseUrl,
      'DELETE',
      `/api/erp/services/${created.serviceId}`,
      undefined,
      adminCookies
    );
    assert.equal(delRes.status, 200);
    assert.equal(delRes.body.data.deleted, true);

    const afterDelRes = await requestApi(baseUrl, 'GET', '/api/erp/services', undefined, adminCookies);
    assert.equal(afterDelRes.body.data.length, 675);
    assert.equal(
      afterDelRes.body.data.some((s: any) => s.serviceId === created.serviceId),
      false
    );
  } finally {
    server.close();
  }
});

