import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import { createApp } from '../server/app';
import { SecurityStore } from '../server/securityStore';
import { Phase03Store } from '../server/phase03Store';
import { CscStore } from '../server/cscStore';
import { hmacOtp } from '../server/crypto';
import {
  ALL_CSC_APPLICATION_STATUSES,
  ALL_GRIEVANCE_STATUSES,
  GRIEVANCE_SERVICE_TYPES,
} from '../shared/cscTypes';
import { ReportStore } from '../server/reports/reportStore';

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
  const id = `csc-cap-${Math.random().toString(36).slice(2, 10)}`;
  const answer = 'Z4P9X';
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
  const verifyRes = await requestApi(baseUrl, 'POST', '/api/auth/verify-otp', {
    challengeId: loginRes.body.data.challengeId,
    otp: loginRes.body.data.sandboxOtpPreview,
  });
  assert.equal(verifyRes.status, 200, `OTP verify failed for ${userId}`);
  return verifyRes.cookies;
}

function startCscTestServer() {
  const securityStore = new SecurityStore();
  const phase03Store = new Phase03Store();
  const cscStore = new CscStore();
  const reportStore = new ReportStore();
  const app = createApp(securityStore, {
    enableRateLimit: false,
    phase03Store,
    cscStore,
    reportStore,
  });
  const server = http.createServer(app);
  return { server, securityStore, cscStore };
}

const SAMPLE_DOC_B64 = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF').toString('base64');

test('CSC Parts 1-4: 21 Categories, 550+ Services + 30 PM-JAY initialize with BLANK rates; order blocked until configured; immutable rate snapshot', async () => {
  const { server, securityStore } = startCscTestServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    const adminCookies = await loginAs(baseUrl, securityStore, 'MC2627110001', '8101352105');

    const catRes = await requestApi(baseUrl, 'GET', '/api/csc/categories', undefined, adminCookies);
    assert.equal(catRes.status, 200);
    assert.equal(catRes.body.data.length, 21, 'Must seed all 21 official CSC service categories');

    const svcRes = await requestApi(baseUrl, 'GET', '/api/csc/services', undefined, adminCookies);
    assert.equal(svcRes.status, 200);
    const services = svcRes.body.data as any[];
    assert.ok(services.length >= 550, `Expected >= 550 seeded services, got ${services.length}`);

    const pmjayServices = services.filter((s) => s.moduleTag === 'PMJAY');
    assert.equal(pmjayServices.length, 30, 'Must include 30 dedicated Ayushman Bharat PM-JAY services');

    // Every service must initialize with strictly BLANK rates
    for (const s of services) {
      assert.equal(s.serviceCharge, null);
      assert.equal(s.govtFee, null);
      assert.equal(s.totalAmount, null);
      assert.equal(s.unitType, null);
      assert.equal(s.rateConfigured, false);
    }

    const sampleSvc = services[0];

    // Creating an order while service rate is blank MUST be rejected (422)
    const blockedOrder = await requestApi(
      baseUrl,
      'POST',
      '/api/csc/orders',
      {
        customerName: 'Soumen Das',
        mobile: '9831011223',
        items: [{ serviceId: sampleSvc.id, quantity: 1 }],
      },
      adminCookies
    );
    assert.equal(blockedOrder.status, 422);

    // Admin configures rate: SC ₹120 + Govt ₹50 = ₹170 (Per Application)
    const rateSet = await requestApi(
      baseUrl,
      'PUT',
      `/api/csc/services/${sampleSvc.id}/rate`,
      {
        serviceCharge: 120,
        govtFee: 50,
        unitType: 'Per Application',
        changeReason: 'Initial rate setup',
      },
      adminCookies
    );
    assert.equal(rateSet.status, 200);
    assert.equal(rateSet.body.data.service.totalAmount, 170);
    assert.equal(rateSet.body.data.service.rateConfigured, true);

    // Order succeeds with configured rate
    const ordRes = await requestApi(
      baseUrl,
      'POST',
      '/api/csc/orders',
      {
        customerName: 'Soumen Das',
        mobile: '9831011223',
        items: [{ serviceId: sampleSvc.id, quantity: 2 }],
        advancePayment: 200,
        paymentMethod: 'UPI',
      },
      adminCookies
    );
    assert.equal(ordRes.status, 201);
    const createdOrder = ordRes.body.data;
    assert.equal(createdOrder.totalAmount, 340);
    assert.equal(createdOrder.remainingDue, 140);
    assert.equal(createdOrder.paymentStatus, 'Partial');
    assert.equal(createdOrder.items[0].unitTotalSnapshot, 170);

    // Admin later changes the rate -> old order MUST keep immutable snapshot ₹170 / total ₹340
    const rateUpdate2 = await requestApi(
      baseUrl,
      'PUT',
      `/api/csc/services/${sampleSvc.id}/rate`,
      {
        serviceCharge: 200,
        govtFee: 80,
        unitType: 'Per Application',
        changeReason: 'Revised fee schedule',
      },
      adminCookies
    );
    assert.equal(rateUpdate2.status, 200);
    assert.equal(rateUpdate2.body.data.service.totalAmount, 280);

    const histRes = await requestApi(
      baseUrl,
      'GET',
      `/api/csc/rate-history?serviceId=${sampleSvc.id}`,
      undefined,
      adminCookies
    );
    assert.equal(histRes.status, 200);
    assert.equal(histRes.body.data.length, 2);

    const ordersAfter = await requestApi(baseUrl, 'GET', '/api/csc/orders', undefined, adminCookies);
    const reloadedOrder = ordersAfter.body.data.find((o: any) => o.orderId === createdOrder.orderId);
    assert.equal(reloadedOrder.totalAmount, 340, 'Old order must retain historical total amount');
    assert.equal(reloadedOrder.items[0].unitTotalSnapshot, 170);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('CSC Part 5: PVC Individual slabs preloaded vs Wholesale slabs start EMPTY + overlap guard + shop profile + due collection', async () => {
  const { server, securityStore } = startCscTestServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    const adminCookies = await loginAs(baseUrl, securityStore, 'MC2627110001', '8101352105');

    const cardRes = await requestApi(baseUrl, 'GET', '/api/csc/pvc/card-types', undefined, adminCookies);
    assert.equal(cardRes.status, 200);
    assert.equal(cardRes.body.data.length, 10);
    const cardA = cardRes.body.data[0].id;
    const cardB = cardRes.body.data[1].id;

    const indSlabsRes = await requestApi(baseUrl, 'GET', '/api/csc/pvc/slabs?mode=INDIVIDUAL', undefined, adminCookies);
    assert.equal(indSlabsRes.status, 200);
    assert.equal(indSlabsRes.body.data.length, 6);

    const whSlabsRes = await requestApi(baseUrl, 'GET', '/api/csc/pvc/slabs?mode=WHOLESALE', undefined, adminCookies);
    assert.equal(whSlabsRes.status, 200);
    assert.equal(whSlabsRes.body.data.length, 0, 'Wholesale PVC slabs MUST initialize completely EMPTY');

    // Individual multi-item quote: qty 1 -> 80, qty 5 -> 75 => 80 + 375 = 455
    const indQuote = await requestApi(
      baseUrl,
      'POST',
      '/api/csc/pvc/quote',
      {
        mode: 'INDIVIDUAL',
        items: [
          { cardTypeId: cardA, quantity: 1 },
          { cardTypeId: cardB, quantity: 5 },
        ],
      },
      adminCookies
    );
    assert.equal(indQuote.status, 200);
    assert.equal(indQuote.body.data.grandTotal, 455);

    // Register Wholesale Shop
    const shopRes = await requestApi(
      baseUrl,
      'POST',
      '/api/csc/pvc/shops',
      {
        shopName: 'Maa Tara Cyber Cafe',
        ownerName: 'Subrata Roy',
        mobile: '9732112233',
        address: 'Habra Station Road',
      },
      adminCookies
    );
    assert.equal(shopRes.status, 201);
    const shopId = shopRes.body.data.id;

    // Wholesale order blocked before Admin configures wholesale slab
    const blockedWhOrder = await requestApi(
      baseUrl,
      'POST',
      '/api/csc/pvc/orders',
      {
        orderMode: 'WHOLESALE',
        shopId,
        items: [{ cardTypeId: cardA, quantity: 25 }],
      },
      adminCookies
    );
    assert.equal(blockedWhOrder.status, 422);

    // Admin adds wholesale slab 20..50 -> ₹55/card
    const whSlab1 = await requestApi(
      baseUrl,
      'POST',
      '/api/csc/pvc/slabs',
      { mode: 'WHOLESALE', minQty: 20, maxQty: 50, ratePerCard: 55 },
      adminCookies
    );
    assert.equal(whSlab1.status, 201);

    // Overlapping wholesale slab 40..80 MUST be rejected (422)
    const overlapRes = await requestApi(
      baseUrl,
      'POST',
      '/api/csc/pvc/slabs',
      { mode: 'WHOLESALE', minQty: 40, maxQty: 80, ratePerCard: 50 },
      adminCookies
    );
    assert.equal(overlapRes.status, 422);

    // Create Wholesale PVC order: 25 cards * 55 = 1375; advance 500 -> due 875
    const whOrder = await requestApi(
      baseUrl,
      'POST',
      '/api/csc/pvc/orders',
      {
        orderMode: 'WHOLESALE',
        shopId,
        items: [{ cardTypeId: cardA, quantity: 25 }],
        advancePayment: 500,
        paymentMethod: 'Bank Transfer',
      },
      adminCookies
    );
    assert.equal(whOrder.status, 201);
    assert.equal(whOrder.body.data.grandTotal, 1375);
    assert.equal(whOrder.body.data.remainingDue, 875);

    // Collect remaining due 875 -> Paid
    const payRes = await requestApi(
      baseUrl,
      'POST',
      `/api/csc/pvc/orders/${whOrder.body.data.orderId}/payments`,
      { amount: 875, paymentMethod: 'UPI' },
      adminCookies
    );
    assert.equal(payRes.status, 201);
    assert.equal(payRes.body.data.order.remainingDue, 0);
    assert.equal(payRes.body.data.order.paymentStatus, 'Paid');

    // Verify Wholesale Shop Profile metrics
    const profileRes = await requestApi(
      baseUrl,
      'GET',
      `/api/csc/pvc/shops/${shopId}/profile`,
      undefined,
      adminCookies
    );
    assert.equal(profileRes.status, 200);
    assert.equal(profileRes.body.data.totalOrders, 1);
    assert.equal(profileRes.body.data.totalCardsPrinted, 25);
    assert.equal(profileRes.body.data.totalAmount, 1375);
    assert.equal(profileRes.body.data.totalPaid, 1375);
    assert.equal(profileRes.body.data.pendingDue, 0);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('CSC Parts 8-12 & Compliance: 17 statuses, Grievances/RTI, MMSBY/NPCI/Cyber flags, forbidden sensitive fields, Aadhaar masking & A4 reprint', async () => {
  const { server, securityStore } = startCscTestServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    assert.equal(ALL_CSC_APPLICATION_STATUSES.length, 17);
    assert.equal(ALL_GRIEVANCE_STATUSES.length, 11);
    assert.equal(GRIEVANCE_SERVICE_TYPES.length, 6);

    const adminCookies = await loginAs(baseUrl, securityStore, 'MC2627110001', '8101352105');

    // Reject sensitive credential payloads globally on /api/csc/*
    for (const forbiddenKey of ['otp', 'aadhaarOtp', 'upiPin', 'atmPin', 'cvv', 'bankPassword']) {
      const badRes = await requestApi(
        baseUrl,
        'POST',
        '/api/csc/customers',
        {
          fullName: 'Bad Payload Test',
          mobile: '9830099887',
          address: 'Test',
          [forbiddenKey]: '123456',
        },
        adminCookies
      );
      assert.equal(badRes.status, 422, `Must reject forbidden sensitive key '${forbiddenKey}'`);
    }

    // Customer Aadhaar MUST be masked as XXXX-XXXX-NNNN
    const custRes = await requestApi(
      baseUrl,
      'POST',
      '/api/csc/customers',
      {
        fullName: 'Ratan Biswas',
        mobile: '9830123456',
        address: 'Basirhat Ward 4',
        aadhaarRawOrLast4: '778899004321',
      },
      adminCookies
    );
    assert.equal(custRes.status, 201);
    assert.equal(custRes.body.data.aadhaarMasked, 'XXXX-XXXX-4321');
    const customerId = custRes.body.data.customerId;

    // Upload & verify Private Document
    const docRes = await requestApi(
      baseUrl,
      'POST',
      '/api/csc/documents',
      {
        customerId,
        category: 'Ration Card',
        docName: 'Ration_Scan.pdf',
        mimeType: 'application/pdf',
        fileSizeBytes: 540,
        contentBase64: SAMPLE_DOC_B64,
      },
      adminCookies
    );
    assert.equal(docRes.status, 201);
    const verifyDoc = await requestApi(
      baseUrl,
      'PATCH',
      `/api/csc/documents/${docRes.body.data.docId}/verify`,
      { status: 'Verified' },
      adminCookies
    );
    assert.equal(verifyDoc.status, 200);
    assert.equal(verifyDoc.body.data.verificationStatus, 'Verified');

    // Configure an MMSBY service & create MMSBY order
    const svcs = (await requestApi(baseUrl, 'GET', '/api/csc/services?moduleTag=MMSBY', undefined, adminCookies)).body.data;
    assert.ok(svcs.length >= 25);
    await requestApi(
      baseUrl,
      'PUT',
      `/api/csc/services/${svcs[0].id}/rate`,
      { serviceCharge: 60, govtFee: 0, unitType: 'Per Application' },
      adminCookies
    );
    const mmsbyOrd = await requestApi(
      baseUrl,
      'POST',
      '/api/csc/orders',
      {
        customerId,
        items: [{ serviceId: svcs[0].id, quantity: 1 }],
        advancePayment: 60,
        paymentMethod: 'Cash',
        mmsbyDetails: { beneficiaryName: 'Ratan Biswas', distinctFromSwasthyaSathiConfirmed: true },
        applicationDetails: { aadhaar: '1234-5678-9012' },
      },
      adminCookies
    );
    assert.equal(mmsbyOrd.status, 201);
    assert.equal(mmsbyOrd.body.data.mmsbyDetails.distinctFromSwasthyaSathiConfirmed, true);
    assert.equal(mmsbyOrd.body.data.applicationDetails.aadhaar, 'XXXX-XXXX-9012');

    // Status update + A4 Receipt Reprint count increments
    const stRes = await requestApi(
      baseUrl,
      'PATCH',
      `/api/csc/orders/${mmsbyOrd.body.data.orderId}/status`,
      { status: 'e-KYC Completed', ekycStatus: 'Completed', remarks: 'Biometric auth done' },
      adminCookies
    );
    assert.equal(stRes.status, 200);
    assert.equal(stRes.body.data.applicationStatus, 'e-KYC Completed');

    const rcpNo = mmsbyOrd.body.data.payments[0].receiptNumber;
    const reprint1 = await requestApi(
      baseUrl,
      'POST',
      `/api/csc/receipts/${rcpNo}/reprint`,
      {},
      adminCookies
    );
    assert.equal(reprint1.status, 200);
    assert.equal(reprint1.body.data.receipt.reprintCount, 1);

    // Grievance & RTI record
    const grvRes = await requestApi(
      baseUrl,
      'POST',
      '/api/csc/grievances',
      {
        customerId,
        complaintCategory: 'WB RTI Act Filing',
        serviceType: 'RTI & Appeal Assistance',
        department: 'Land & Land Reforms',
        authority: 'SDO Basirhat',
        complaintSubject: 'Delay in Mutation Certificate',
        complaintDetails: 'Applied 45 days ago.',
        serviceCharge: 100,
        govtFee: 10,
        paidAmount: 110,
        isRti: true,
        rtiType: 'West Bengal RTI',
        pioName: 'BDO PIO Basirhat-I',
      },
      adminCookies
    );
    assert.equal(grvRes.status, 201);
    assert.equal(grvRes.body.data.totalAmount, 110);
    assert.equal(grvRes.body.data.paymentStatus, 'Paid');

    const grvUpd = await requestApi(
      baseUrl,
      'PATCH',
      `/api/csc/grievances/${grvRes.body.data.internalTrackingId}/status`,
      {
        complaintStatus: 'Acknowledgement Received',
        externalAckNo: 'WBRTI-2026-99881',
        followUpNote: 'Ack downloaded and shared with citizen.',
      },
      adminCookies
    );
    assert.equal(grvUpd.status, 200);
    assert.equal(grvUpd.body.data.complaintStatus, 'Acknowledgement Received');
    assert.equal(grvUpd.body.data.followUps.length, 1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('CSC Parts 7, 13, 14, 15: Operator RBAC, Customer Portal isolation, 24 KPIs & 25 Reports', async () => {
  const { server, securityStore } = startCscTestServer();
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    const adminCookies = await loginAs(baseUrl, securityStore, 'MC2627110001', '8101352105');
    const staffCookies = await loginAs(baseUrl, securityStore, 'MC2627110003', 'Staff@2026!');
    const customerCookies = await loginAs(baseUrl, securityStore, 'MC2627110005', 'Customer@2026!');

    const svcs = (await requestApi(baseUrl, 'GET', '/api/csc/services', undefined, adminCookies)).body.data;
    const svcId = svcs[0].id;

    // Staff CANNOT edit rates by default (403)
    const staffDenied = await requestApi(
      baseUrl,
      'PUT',
      `/api/csc/services/${svcId}/rate`,
      { serviceCharge: 90, govtFee: 0, unitType: 'Per Application' },
      staffCookies
    );
    assert.equal(staffDenied.status, 403);

    // Admin grants 'csc.rateEdit' permission to MC2627110003 -> allowed (200)
    const grantRes = await requestApi(
      baseUrl,
      'PUT',
      '/api/users/MC2627110003/permissions',
      { permissions: { 'csc.rateEdit': true } },
      adminCookies
    );
    assert.equal(grantRes.status, 200);

    const staffAllowed = await requestApi(
      baseUrl,
      'PUT',
      `/api/csc/services/${svcId}/rate`,
      { serviceCharge: 90, govtFee: 0, unitType: 'Per Application' },
      staffCookies
    );
    assert.equal(staffAllowed.status, 200);

    // Admin creates an order for linked Customer MC2627110005 (CSC-CUST-0001) and another customer
    const ownOrder = await requestApi(
      baseUrl,
      'POST',
      '/api/csc/orders',
      {
        customerId: 'CSC-CUST-0001',
        items: [{ serviceId: svcId, quantity: 1 }],
        advancePayment: 90,
      },
      adminCookies
    );
    assert.equal(ownOrder.status, 201);

    const otherOrder = await requestApi(
      baseUrl,
      'POST',
      '/api/csc/orders',
      {
        customerName: 'Other Citizen',
        mobile: '9830555444',
        items: [{ serviceId: svcId, quantity: 1 }],
        advancePayment: 90,
      },
      adminCookies
    );
    assert.equal(otherOrder.status, 201);

    // Customer Portal: sees ONLY own orders; CANNOT view admin KPIs, operators, reports, or other citizen receipts
    const portalRes = await requestApi(baseUrl, 'GET', '/api/csc/portal/me', undefined, customerCookies);
    assert.equal(portalRes.status, 200);
    assert.equal(portalRes.body.data.orders.length, 1);
    assert.equal(portalRes.body.data.orders[0].customerId, 'CSC-CUST-0001');

    const custKpiDenied = await requestApi(baseUrl, 'GET', '/api/csc/dashboard-kpis', undefined, customerCookies);
    assert.equal(custKpiDenied.status, 403);

    const custRptDenied = await requestApi(baseUrl, 'GET', '/api/csc/reports/catalog', undefined, customerCookies);
    assert.equal(custRptDenied.status, 403);

    const otherReceipt = otherOrder.body.data.payments[0].receiptNumber;
    const custReprintDenied = await requestApi(
      baseUrl,
      'POST',
      `/api/csc/receipts/${otherReceipt}/reprint`,
      {},
      customerCookies
    );
    assert.equal(custReprintDenied.status, 403);

    // Admin 24-KPI Dashboard & 25 CSC Reports
    const kpiRes = await requestApi(baseUrl, 'GET', '/api/csc/dashboard-kpis', undefined, adminCookies);
    assert.equal(kpiRes.status, 200);
    assert.equal(kpiRes.body.data.totalCategories, 21);
    assert.ok(kpiRes.body.data.totalServices >= 550);
    assert.equal(kpiRes.body.data.totalOrders, 2);
    assert.equal(kpiRes.body.data.totalSales, 180);

    const rptCatalog = await requestApi(baseUrl, 'GET', '/api/csc/reports/catalog', undefined, adminCookies);
    assert.equal(rptCatalog.status, 200);
    assert.equal(rptCatalog.body.data.length, 25, 'Must expose all 25 CSC operational reports');

    for (const meta of rptCatalog.body.data) {
      const genRes = await requestApi(
        baseUrl,
        'POST',
        '/api/csc/reports/generate',
        { reportKey: meta.reportKey },
        adminCookies
      );
      assert.equal(genRes.status, 200, `Report ${meta.reportKey} failed to generate`);
      assert.ok(Array.isArray(genRes.body.data.columns));
      assert.ok(Array.isArray(genRes.body.data.rows));
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
