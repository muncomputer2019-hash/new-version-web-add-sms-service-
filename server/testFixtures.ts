import { Phase03Store } from './phase03Store.js';
import { ErpStore } from './erpStore.js';
import { FinanceStore } from './finance/financeStore.js';
import { ErpApplication, ErpCustomer, ErpPaymentRecord } from './erpTypes.js';

function buildDefaultConsents(actor: string) {
  return [
    {
      category: 'SMS_CONSENT' as const,
      label: 'SMS Message Consent',
      granted: true,
      recordedAt: '2026-11-01T09:00:00.000Z',
      recordedBy: actor,
      verificationMethod: 'Digital Signature' as const,
    },
    {
      category: 'WHATSAPP_CONSENT' as const,
      label: 'WhatsApp Message Consent',
      granted: true,
      recordedAt: '2026-11-01T09:00:00.000Z',
      recordedBy: actor,
      verificationMethod: 'Digital Signature' as const,
    },
    {
      category: 'STATUS_UPDATE_CONSENT' as const,
      label: 'Application Status Update Consent',
      granted: true,
      recordedAt: '2026-11-01T09:00:00.000Z',
      recordedBy: actor,
      verificationMethod: 'Digital Signature' as const,
    },
    {
      category: 'PAYMENT_REMINDER_CONSENT' as const,
      label: 'Payment Reminder Consent',
      granted: true,
      recordedAt: '2026-11-01T09:00:00.000Z',
      recordedBy: actor,
      verificationMethod: 'Digital Signature' as const,
    },
    {
      category: 'SERVICE_NOTIFICATION_CONSENT' as const,
      label: 'Service-related Notification Consent',
      granted: true,
      recordedAt: '2026-11-01T09:00:00.000Z',
      recordedBy: actor,
      verificationMethod: 'Digital Signature' as const,
    },
    {
      category: 'PROMOTIONAL_CONSENT' as const,
      label: 'Promotional / Offer Message Consent',
      granted: false,
      recordedAt: null,
      recordedBy: actor,
      verificationMethod: 'Not Set' as const,
    },
    {
      category: 'DATA_PRIVACY_CONSENT' as const,
      label: 'Personal Data Processing & Privacy Consent',
      granted: true,
      recordedAt: '2026-11-01T09:00:00.000Z',
      recordedBy: actor,
      verificationMethod: 'Digital Signature' as const,
    },
  ];
}

export function seedTestFixtures(stores: {
  phase03Store?: Phase03Store;
  erpStore?: ErpStore;
  financeStore?: FinanceStore;
}): void {
  const { phase03Store, erpStore, financeStore } = stores;
  const now = '2026-11-15T10:00:00.000Z';

  if (phase03Store && phase03Store.completedRateSnapshots.length === 0) {
    phase03Store.completedRateSnapshots.push({
      id: 1,
      receiptNo: 'MCR-2026-27-000001',
      serviceCode: 'MC2627SRV-001',
      serviceName: 'Lakshmir Bhandar Application',
      appliedVersion: 1,
      customerChargeSnapshot: 500,
      serviceCostSnapshot: 150,
      profitSnapshot: 350,
      completedAt: now,
    });
  }

  if (erpStore) {
    const fy = phase03Store ? phase03Store.docSequence.getCurrentFinancialYear() : '2026-27';

    // Ensure MCS-2026-27-000002 supports dynamic form & 2 required docs expected by ERP workflow tests
    const svc2 = erpStore.services.find((s) => s.serviceId === 'MCS-2026-27-000002') ?? erpStore.services[0];
    if (svc2) {
      svc2.customerCharge = 350;
      svc2.serviceCost = 120;
      svc2.profitAmount = 230;
      svc2.requiredDocuments = [
        {
          docKey: 'aadhaar_copy',
          label: 'Aadhaar Card Copy (Masked)',
          category: 'Identity Proof',
          required: true,
          allowMultiple: false,
          allowedFormats: ['PDF', 'JPG', 'JPEG', 'PNG'],
          maxSizeMb: 10,
          instructions: 'Upload masked Aadhaar copy.',
          enabled: true,
        },
        {
          docKey: 'poa_proof',
          label: 'Proof of Address (POA)',
          category: 'Address Proof',
          required: true,
          allowMultiple: false,
          allowedFormats: ['PDF', 'JPG', 'JPEG', 'PNG'],
          maxSizeMb: 10,
          instructions: 'Voter ID or Ration Card copy.',
          enabled: true,
        },
      ];
      svc2.formVersions = [
        {
          versionNo: 1,
          publishedAt: now,
          publishedBy: 'MC2627110001',
          status: 'published',
          fields: [
            {
              fieldKey: 'applicant_type',
              label: 'Application Type',
              fieldType: 'dropdown',
              required: true,
              displayOrder: 1,
              options: ['New Application', 'Correction / Update'],
              enabled: true,
            },
            {
              fieldKey: 'applicant_aadhaar',
              label: 'Applicant Aadhaar Number',
              fieldType: 'aadhaar',
              required: false,
              displayOrder: 2,
              enabled: true,
            },
            {
              fieldKey: 'applicant_pan',
              label: 'Applicant PAN Number',
              fieldType: 'pan',
              required: false,
              displayOrder: 3,
              enabled: true,
            },
            {
              fieldKey: 'delivery_address',
              label: 'Delivery / Correspondence Address',
              fieldType: 'address',
              required: true,
              displayOrder: 4,
              enabled: true,
            },
          ],
        },
      ];
    }

    if (erpStore.customers.length === 0) {
      const fixtureCustomers: Array<{
        customerId: string;
        fullName: string;
        fatherOrHusbandName: string;
        mobile: string;
        village: string;
        district: string;
      }> = [
        {
          customerId: `MCC-${fy}-000001`,
          fullName: 'Anirban Chatterjee',
          fatherOrHusbandName: 'Subrata Chatterjee',
          mobile: '9830100101',
          village: 'Mamudpur',
          district: 'Murshidabad',
        },
        {
          customerId: `MCC-${fy}-000002`,
          fullName: 'Farhana Begum',
          fatherOrHusbandName: 'Karim Sheikh',
          mobile: '9830100102',
          village: 'Juginda',
          district: 'Murshidabad',
        },
        {
          customerId: `MCC-${fy}-000003`,
          fullName: 'Sujoy Mondal',
          fatherOrHusbandName: 'Haripada Mondal',
          mobile: '9830100103',
          village: 'Domkal',
          district: 'Murshidabad',
        },
      ];

      for (const c of fixtureCustomers) {
        const cust: ErpCustomer = {
          id: erpStore.nextNumericId('customer'),
          customerId: c.customerId,
          fullName: c.fullName,
          fatherOrHusbandName: c.fatherOrHusbandName,
          dob: '1992-08-14',
          gender: 'Male',
          mobile: c.mobile,
          whatsapp: c.mobile,
          email: '',
          aadhaarLast4: '4321',
          village: c.village,
          postOffice: 'Juginda',
          policeStation: 'Domkal',
          district: c.district,
          pinCode: '742406',
          presentAddress: `${c.village}, Domkal, ${c.district}`,
          permanentAddress: `${c.village}, Domkal, ${c.district}`,
          sameAsPresent: true,
          segment: 'Individual',
          crmTag: 'Regular',
          status: 'Active',
          verificationStatus: 'Fully Verified',
          mobileOtpVerifiedAt: now,
          consents: buildDefaultConsents('MC2627110001'),
          consentHistory: [],
          contactHistory: [],
          notesAndFollowUps: [],
          statusHistory: [],
          deletedAt: null,
          createdBy: 'MC2627110001',
          createdAt: now,
          updatedAt: now,
        };
        erpStore.customers.push(cust);
      }

      if (phase03Store) {
        phase03Store.docSequence.seed('CUSTOMER', 'MCC', fy, 3);
      }
    }

    if (erpStore.applications.length === 0 && erpStore.customers.length >= 3 && erpStore.services.length > 0) {
      const cust1 = erpStore.customers[0];
      const cust2 = erpStore.customers[1];
      const cust3 = erpStore.customers[2];
      const svc1 = erpStore.services[0];
      const svcAlt = erpStore.services[1] ?? svc1;

      const makeApp = (
        appNo: string,
        cust: ErpCustomer,
        svc: typeof svc1,
        status: ErpApplication['status'],
        charge: number,
        cost: number
      ): ErpApplication => ({
        id: erpStore.nextNumericId('app'),
        applicationNo: appNo,
        financialYear: fy,
        customerId: cust.customerId,
        customerSnapshot: {
          customerId: cust.customerId,
          fullName: cust.fullName,
          fatherOrHusbandName: cust.fatherOrHusbandName,
          dob: cust.dob,
          gender: cust.gender,
          mobile: cust.mobile,
          whatsapp: cust.whatsapp,
          village: cust.village,
          presentAddress: cust.presentAddress,
        },
        serviceId: svc.serviceId,
        serviceSnapshot: {
          serviceId: svc.serviceId,
          serviceCode: svc.serviceCode,
          name: svc.name,
          categoryName: svc.categoryName,
          appliedFormVersion: svc.currentFormVersion,
          formFieldsSnapshot: svc.formVersions[0]?.fields ?? [],
          requiredDocsSnapshot: svc.requiredDocuments,
          customerChargeSnapshot: charge,
          serviceCostSnapshot: cost,
          profitSnapshot: charge - cost,
          termsSnapshot: svc.termsAndConditions,
        },
        formData: {},
        status,
        assignedStaffId: 'MC2627110003',
        assignedCounterCode: 'CTR-01',
        submissionDate: now,
        expectedCompletionDate: '2026-11-25',
        actualCompletionDate: status === 'Completed' ? now : null,
        slaPausedMinutes: 0,
        references: [],
        statusHistory: [
          {
            id: erpStore.nextNumericId('statusEvt'),
            previousStatus: null,
            newStatus: status,
            changedBy: 'MC2627110001',
            changedByRole: 'ADMIN',
            remarks: 'Test fixture seeded',
            reason: 'Initial test state',
            changedAt: now,
          },
        ],
        assignmentHistory: [],
        archivedAt: null,
        archivedBy: null,
        createdBy: 'MC2627110001',
        createdAt: now,
        updatedAt: now,
      });

      const app1 = makeApp(`MCA-${fy}-000001`, cust1, svc1, 'Completed', 500, 150);
      const app2 = makeApp(`MCA-${fy}-000002`, cust2, svcAlt, 'Pending Office', 1200, 400);
      const app3 = makeApp(`MCA-${fy}-000003`, cust3, svc1, 'Processing', 800, 250);
      erpStore.applications.push(app1, app2, app3);

      const pay1: ErpPaymentRecord = {
        id: erpStore.nextNumericId('payment'),
        transactionId: `TXN-${fy}-000001`,
        receiptNo: `MCR-${fy}-000001`,
        applicationNo: app1.applicationNo,
        customerId: cust1.customerId,
        customerName: cust1.fullName,
        serviceId: svc1.serviceId,
        serviceName: svc1.name,
        counterCode: 'CTR-01',
        collectedBy: 'MC2627110003',
        paymentType: 'Full',
        paymentMethod: 'Cash',
        amount: 500,
        verificationStatus: 'Confirmed',
        verifiedBy: 'MC2627110001',
        verifiedAt: now,
        recordedAt: now,
        notes: 'Full counter settlement',
      };
      erpStore.payments.push(pay1);

      if (phase03Store) {
        phase03Store.docSequence.seed('APPLICATION', 'MCA', fy, 3);
        phase03Store.docSequence.seed('RECEIPT', 'MCR', fy, 1);
      }
    }
  }

  if (financeStore) {
    // Sync seeded ERP payment into GL first so P&L and cash drawer match
    for (const p of financeStore.erpStore.payments) {
      if (p.verificationStatus === 'Confirmed') {
        financeStore.syncErpPaymentToGl(p.transactionId, 'MC2627110001');
      }
    }

    const ssd = financeStore.products.find((p) => p.sku === 'PRD-SSD-512');
    const needsOpeningSeed =
      (ssd && ssd.batches.length === 0) ||
      financeStore.fixedAssets.length === 0 ||
      financeStore.loans.length === 0;

    if (needsOpeningSeed) {
      const invTotal = 5 * 2200; // 11000 matches PRD-SSD-512 batch
      const assetCost = 60000;
      const loanPrincipal = 50000;
      const bankOpening = 100000;
      const cashOpening = 25000;
      const capitalEquity = bankOpening + cashOpening + invTotal + assetCost - loanPrincipal;

      financeStore.postSystemVoucher({
        idempotencyKey: 'test-fixture-opening-balance',
        entityCode: 'ENT-MAIN',
        costCenter: 'GENERAL',
        voucherDate: '2026-11-01',
        voucherType: 'Opening',
        referenceType: 'TEST_FIXTURE',
        referenceId: 'OPENING-2026-11',
        narration: 'Test fixture balanced opening capital, cash, stock, fixed asset and term loan',
        createdBy: 'MC2627110001',
        approvedBy: 'MC2627110001',
        lines: [
          { accountCode: '1010', debitAmount: bankOpening, creditAmount: 0, description: 'Opening Bank Liquidity' },
          { accountCode: '1001', debitAmount: cashOpening, creditAmount: 0, description: 'Opening Counter 01 Drawer' },
          { accountCode: '1200', debitAmount: invTotal, creditAmount: 0, description: 'Opening SSD Inventory Batch' },
          { accountCode: '1510', debitAmount: assetCost, creditAmount: 0, description: 'Opening IT Workstation Asset' },
          { accountCode: '2300', debitAmount: 0, creditAmount: loanPrincipal, description: 'Term Loan Opening Liability' },
          { accountCode: '3001', debitAmount: 0, creditAmount: capitalEquity, description: 'Owner Capital Opening' },
        ],
      });

      if (ssd && ssd.batches.length === 0) {
        ssd.batches.push({
          batchId: 'BAT-SEED-01',
          receivedDate: '2026-11-01',
          qtyRemaining: 5,
          unitCost: 2200,
        });
      }

      if (financeStore.fixedAssets.length === 0) {
        financeStore.fixedAssets.push({
          assetCode: 'AST-2026-01',
          assetName: 'Main Service Counter Workstation & Scanner',
          category: 'IT Hardware',
          coaAssetAccount: '1510',
          purchaseDate: '2026-11-01',
          costAmount: assetCost,
          salvageValue: 6000,
          usefulLifeYears: 5,
          depreciationMethod: 'SLM',
          ratePct: 20,
          accumulatedDepreciation: 0,
          lastDepreciatedDate: null,
          status: 'Active',
        });
      }

      if (financeStore.loans.length === 0) {
        financeStore.loans.push({
          loanId: 'LN-2025-01',
          lenderName: 'SBI Mudra Term Loan',
          loanType: 'Term Loan',
          principalAmount: loanPrincipal,
          annualRatePct: 12,
          tenureMonths: 24,
          emiAmount: 2400,
          outstandingPrincipal: loanPrincipal,
          emisPaid: 0,
          nextDueDate: '2026-12-05',
          coaLoanAccount: '2300',
          status: 'Active',
        });
      }

      financeStore.recomputeCounterBalances();
    }
  }
}
