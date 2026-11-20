import crypto from 'node:crypto';
import {
  ApplicationAssignmentEvent,
  ApplicationDeliveryRecord,
  ApplicationDocumentRecord,
  ApplicationFollowUp,
  ApplicationNote,
  ApplicationReferenceEntry,
  CancellationRequestRecord,
  ConsentCategoryKey,
  CustomerConsentState,
  DynamicFormFieldDef,
  ErpActivityEntry,
  ErpApplication,
  ErpApplicationStatus,
  ErpCustomer,
  ErpExpenseRecord,
  ErpExportLog,
  ErpNotificationDispatch,
  ErpPaymentRecord,
  ErpRefundRecord,
  ErpService,
  ReassignmentRequest,
  ReferenceFieldDefinition,
  RoleName,
  ServiceCategory,
  ServiceRequiredDocumentDef,
  ServiceSubcategory,
} from './erpTypes.js';
import { encryptSensitiveField, maskAadhaar, sanitizeText } from './crypto.js';
import { Phase03Store } from './phase03Store.js';
import { SecurityStore } from './securityStore.js';
import {
  CATALOG_CATEGORIES_21,
  CATALOG_SERVICES_675,
  CATALOG_SUBCATEGORIES,
} from '../shared/servicesCatalog675.js';

export const DEFAULT_CONSENT_DEFINITIONS: Array<{
  category: ConsentCategoryKey;
  label: string;
}> = [
  { category: 'SMS_CONSENT', label: 'SMS Message Consent' },
  { category: 'WHATSAPP_CONSENT', label: 'WhatsApp Message Consent' },
  { category: 'STATUS_UPDATE_CONSENT', label: 'Application Status Update Consent' },
  { category: 'PAYMENT_REMINDER_CONSENT', label: 'Payment Reminder Consent' },
  { category: 'SERVICE_NOTIFICATION_CONSENT', label: 'Service-related Notification Consent' },
  { category: 'PROMOTIONAL_CONSENT', label: 'Promotional / Offer Message Consent' },
  { category: 'DATA_PRIVACY_CONSENT', label: 'Personal Data Processing & Privacy Consent' },
];

export const ALL_APPLICATION_STATUSES: ErpApplicationStatus[] = [
  'Draft',
  'Submitted',
  'Under Review',
  'Processing',
  'Pending Customer',
  'Pending Office',
  'Approved',
  'Rejected',
  'Completed',
  'Cancelled',
  'On Hold',
  'Reopened',
];

export const ALLOWED_STATUS_TRANSITIONS: Record<ErpApplicationStatus, ErpApplicationStatus[]> = {
  Draft: ['Submitted', 'Cancelled'],
  Submitted: ['Under Review', 'Processing', 'Pending Customer', 'On Hold', 'Cancelled', 'Rejected'],
  'Under Review': ['Processing', 'Pending Customer', 'Pending Office', 'Approved', 'Rejected', 'On Hold', 'Cancelled'],
  Processing: ['Pending Customer', 'Pending Office', 'Approved', 'Completed', 'Rejected', 'On Hold', 'Cancelled'],
  'Pending Customer': ['Under Review', 'Processing', 'On Hold', 'Cancelled', 'Rejected'],
  'Pending Office': ['Under Review', 'Processing', 'Approved', 'Rejected', 'Completed', 'On Hold', 'Cancelled'],
  Approved: ['Processing', 'Completed', 'Cancelled', 'On Hold'],
  Rejected: ['Reopened'],
  Completed: ['Reopened'],
  Cancelled: ['Reopened'],
  'On Hold': ['Under Review', 'Processing', 'Pending Customer', 'Pending Office', 'Cancelled', 'Rejected'],
  Reopened: ['Under Review', 'Processing', 'Pending Customer', 'Pending Office', 'Approved', 'Completed', 'Cancelled'],
};

export const REASONS_REQUIRED_STATUSES: ErpApplicationStatus[] = [
  'Rejected',
  'Cancelled',
  'On Hold',
  'Reopened',
];

function createDefaultConsents(actor: string, presetGranted = false): CustomerConsentState[] {
  const now = presetGranted ? new Date().toISOString() : null;
  return DEFAULT_CONSENT_DEFINITIONS.map((def) => ({
    category: def.category,
    label: def.label,
    granted: presetGranted && def.category !== 'PROMOTIONAL_CONSENT',
    recordedAt: presetGranted && def.category !== 'PROMOTIONAL_CONSENT' ? now : null,
    recordedBy: actor,
    verificationMethod: presetGranted && def.category !== 'PROMOTIONAL_CONSENT' ? 'Digital Signature' : 'Not Set',
  }));
}

export function addDaysIso(startIso: string, days: number): string {
  const d = new Date(startIso);
  if (Number.isNaN(d.getTime())) return startIso.slice(0, 10);
  d.setUTCDate(d.getUTCDate() + Math.max(1, days));
  return d.toISOString().slice(0, 10);
}

export class ErpStore {
  public customers: ErpCustomer[] = [];
  public serviceCategories: ServiceCategory[] = [];
  public serviceSubcategories: ServiceSubcategory[] = [];
  public services: ErpService[] = [];
  public referenceFields: ReferenceFieldDefinition[] = [];
  public applications: ErpApplication[] = [];
  public documents: ApplicationDocumentRecord[] = [];
  public reassignmentRequests: ReassignmentRequest[] = [];
  public followUps: ApplicationFollowUp[] = [];
  public notes: ApplicationNote[] = [];
  public deliveries: ApplicationDeliveryRecord[] = [];
  public cancellationRequests: CancellationRequestRecord[] = [];
  public payments: ErpPaymentRecord[] = [];
  public refunds: ErpRefundRecord[] = [];
  public expenses: ErpExpenseRecord[] = [];
  public notifications: ErpNotificationDispatch[] = [];
  public activities: ErpActivityEntry[] = [];
  public exportLogs: ErpExportLog[] = [];

  private serviceCodeSequences: Record<string, number> = {};
  private issuedServiceCodes: Set<string> = new Set();
  private serviceCodeMutex: Promise<void> = Promise.resolve();

  private nextIds = {
    customer: 1,
    category: 1,
    subcategory: 1,
    service: 1,
    refField: 1,
    appRef: 1,
    app: 1,
    doc: 1,
    assign: 1,
    reassignReq: 1,
    statusEvt: 1,
    followUp: 1,
    note: 1,
    delivery: 1,
    cancelReq: 1,
    payment: 1,
    refund: 1,
    expense: 1,
    notif: 1,
    activity: 1,
    exportLog: 1,
  };

  constructor(
    public readonly securityStore: SecurityStore,
    public readonly phase03Store: Phase03Store
  ) {
    this.seedEnterpriseBaseline();
  }

  public nextNumericId(key: keyof typeof this.nextIds): number {
    return this.nextIds[key]++;
  }

  public getIndianFinancialYearCode(date = new Date()): string {
    try {
      const parts = new Intl.DateTimeFormat('en-IN', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: 'numeric',
      }).formatToParts(date);
      const year = Number(parts.find((p) => p.type === 'year')?.value || date.getFullYear());
      const month = Number(parts.find((p) => p.type === 'month')?.value || date.getMonth() + 1);
      const startYear = month >= 4 ? year : year - 1;
      const endYear = startYear + 1;
      return `${String(startYear).slice(-2)}${String(endYear).slice(-2)}`;
    } catch {
      const y = date.getFullYear();
      const m = date.getMonth() + 1;
      const startYear = m >= 4 ? y : y - 1;
      return `${String(startYear).slice(-2)}${String(startYear + 1).slice(-2)}`;
    }
  }

  public async allocateNextServiceCode(
    fyCodeOverride?: string
  ): Promise<{ serviceCode: string; fyCode: string; seqNumber: number }> {
    const prev = this.serviceCodeMutex;
    let release!: () => void;
    this.serviceCodeMutex = new Promise<void>((res) => {
      release = res;
    });
    await prev;
    try {
      const fyCode =
        fyCodeOverride && /^\d{4}$/.test(fyCodeOverride)
          ? fyCodeOverride
          : this.getIndianFinancialYearCode();
      let nextSeq = (this.serviceCodeSequences[fyCode] ?? 0) + 1;
      let candidate = `MC${fyCode}SRV-${String(nextSeq).padStart(3, '0')}`;
      while (
        this.issuedServiceCodes.has(candidate) ||
        this.services.some((s) => s.serviceCode === candidate)
      ) {
        nextSeq += 1;
        candidate = `MC${fyCode}SRV-${String(nextSeq).padStart(3, '0')}`;
      }
      this.serviceCodeSequences[fyCode] = nextSeq;
      this.issuedServiceCodes.add(candidate);
      return { serviceCode: candidate, fyCode, seqNumber: nextSeq };
    } finally {
      release();
    }
  }

  public addActivity(
    entry: Omit<ErpActivityEntry, 'id' | 'createdAt'>
  ): ErpActivityEntry {
    const item: ErpActivityEntry = {
      id: this.nextNumericId('activity'),
      ...entry,
      createdAt: new Date().toISOString(),
    };
    this.activities.unshift(item);
    return item;
  }

  public sanitizePublicCustomer(c: ErpCustomer, includeUnmaskedAadhaar = false) {
    return {
      ...c,
      aadhaarEncrypted: undefined,
      aadhaarMasked: c.aadhaarLast4 ? `XXXX-XXXX-${c.aadhaarLast4}` : undefined,
      aadhaarUnmasked:
        includeUnmaskedAadhaar && c.aadhaarLast4 ? `XXXX-XXXX-${c.aadhaarLast4} (Protected Vault)` : undefined,
    };
  }

  public sanitizePublicDocument(doc: ApplicationDocumentRecord) {
    const { contentBase64: _omit, ...safe } = doc;
    return safe;
  }

  public computeDocumentChecklist(app: ErpApplication) {
    const appDocs = this.documents.filter(
      (d) => d.applicationNo === app.applicationNo && !d.deletedAt
    );
    const reqDefs = app.serviceSnapshot.requiredDocsSnapshot.filter((d) => d.enabled);
    const mandatoryDefs = reqDefs.filter((d) => d.required);
    const optionalDefs = reqDefs.filter((d) => !d.required);

    const missingRequired: string[] = [];
    let uploadedMandatoryCount = 0;
    let verifiedCount = 0;
    let pendingCount = 0;
    let rejectedCount = 0;

    for (const def of mandatoryDefs) {
      const matching = appDocs.filter((d) => d.docKey === def.docKey);
      const validNonRejected = matching.filter((d) => d.verificationStatus !== 'Rejected');
      if (validNonRejected.length === 0) {
        missingRequired.push(def.label);
      } else {
        uploadedMandatoryCount += 1;
      }
    }

    for (const doc of appDocs) {
      if (doc.verificationStatus === 'Verified') verifiedCount += 1;
      else if (doc.verificationStatus === 'Pending') pendingCount += 1;
      else if (doc.verificationStatus === 'Rejected') rejectedCount += 1;
    }

    return {
      requiredDocuments: mandatoryDefs.length,
      optionalDocuments: optionalDefs.length,
      uploadedDocuments: appDocs.length,
      uploadedMandatoryCount,
      verifiedDocuments: verifiedCount,
      pendingVerification: pendingCount,
      rejectedDocuments: rejectedCount,
      missingCount: missingRequired.length,
      missingRequiredLabels: missingRequired,
      isSubmissionReady: missingRequired.length === 0,
    };
  }

  public computeSlaStatus(app: ErpApplication) {
    if (app.status === 'Cancelled' || app.status === 'Rejected') {
      return { label: 'Closed', badge: 'neutral' as const };
    }
    const now = Date.now();
    const dueMs = new Date(`${app.expectedCompletionDate}T23:59:59+05:30`).getTime();

    if (app.status === 'Completed' || app.status === 'Approved') {
      const completedMs = app.actualCompletionDate
        ? new Date(app.actualCompletionDate).getTime()
        : now;
      return completedMs <= dueMs
        ? { label: 'Completed Within SLA', badge: 'success' as const }
        : { label: 'Completed After SLA', badge: 'warning' as const };
    }

    if (app.status === 'Pending Customer' || app.status === 'Pending Office' || app.status === 'On Hold') {
      return { label: 'SLA Paused', badge: 'neutral' as const };
    }

    const hoursLeft = (dueMs - now) / (1000 * 60 * 60);
    if (hoursLeft < 0) return { label: 'Overdue', badge: 'danger' as const };
    if (hoursLeft <= 48) return { label: 'Approaching Deadline', badge: 'warning' as const };
    return { label: 'Within SLA', badge: 'success' as const };
  }

  public validateDynamicFormData(
    fields: DynamicFormFieldDef[],
    submitted: Record<string, unknown>,
    enforceRequired: boolean
  ): { valid: boolean; errors: Record<string, string>; cleaned: Record<string, unknown> } {
    const errors: Record<string, string> = {};
    const cleaned: Record<string, unknown> = {};
    const enabledFields = fields.filter((f) => f.enabled);
    const allowedKeys = new Set(enabledFields.map((f) => f.fieldKey));

    // Reject unexpected manipulated keys
    for (const key of Object.keys(submitted ?? {})) {
      if (!allowedKeys.has(key)) {
        errors[key] = `Unexpected form field "${key}" rejected by server schema validation.`;
      }
    }

    for (const field of enabledFields) {
      const raw = submitted?.[field.fieldKey];
      const strVal = raw === undefined || raw === null ? '' : String(raw).trim();

      if (enforceRequired && field.required) {
        if (field.fieldType === 'checkbox' && raw !== true && strVal !== 'true') {
          errors[field.fieldKey] = `${field.label} must be checked.`;
          continue;
        }
        if (field.fieldType === 'multi_select') {
          if (!Array.isArray(raw) || raw.length === 0) {
            errors[field.fieldKey] = `${field.label} requires at least one selection.`;
            continue;
          }
        } else if (!strVal) {
          errors[field.fieldKey] = `${field.label} is required.`;
          continue;
        }
      }

      if (!strVal && field.fieldType !== 'multi_select' && field.fieldType !== 'checkbox') {
        cleaned[field.fieldKey] = '';
        continue;
      }

      switch (field.fieldType) {
        case 'number': {
          const num = Number(raw);
          if (Number.isNaN(num)) {
            errors[field.fieldKey] = `${field.label} must be a valid number.`;
          } else {
            if (field.minValue !== undefined && num < field.minValue) {
              errors[field.fieldKey] = `${field.label} must be at least ${field.minValue}.`;
            }
            if (field.maxValue !== undefined && num > field.maxValue) {
              errors[field.fieldKey] = `${field.label} must not exceed ${field.maxValue}.`;
            }
            cleaned[field.fieldKey] = num;
          }
          break;
        }
        case 'mobile': {
          const digits = strVal.replace(/[\s+-]/g, '');
          if (!/^(91)?[6-9]\d{9}$|^\d{10,14}$/.test(digits)) {
            errors[field.fieldKey] = `${field.label} must be a valid mobile number.`;
          } else {
            cleaned[field.fieldKey] = sanitizeText(strVal);
          }
          break;
        }
        case 'email': {
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(strVal)) {
            errors[field.fieldKey] = `${field.label} must be a valid email address.`;
          } else {
            cleaned[field.fieldKey] = sanitizeText(strVal);
          }
          break;
        }
        case 'date': {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(strVal) && !/^\d{2}\/\d{2}\/\d{4}$/.test(strVal)) {
            errors[field.fieldKey] = `${field.label} must be a valid date.`;
          } else {
            cleaned[field.fieldKey] = strVal;
          }
          break;
        }
        case 'aadhaar': {
          const digits = strVal.replace(/[\s-]/g, '');
          if (!/^\d{12}$/.test(digits)) {
            errors[field.fieldKey] = `${field.label} must be exactly 12 digits.`;
          } else {
            cleaned[field.fieldKey] = maskAadhaar(digits);
          }
          break;
        }
        case 'pan': {
          const upper = strVal.toUpperCase();
          if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(upper)) {
            errors[field.fieldKey] = `${field.label} must match Indian PAN format (ABCDE1234F).`;
          } else {
            cleaned[field.fieldKey] = upper;
          }
          break;
        }
        case 'dropdown':
        case 'radio': {
          const opts = field.options ?? [];
          if (opts.length > 0 && !opts.includes(strVal)) {
            errors[field.fieldKey] = `${field.label} selection is invalid.`;
          } else {
            cleaned[field.fieldKey] = strVal;
          }
          break;
        }
        case 'yes_no': {
          if (!['Yes', 'No'].includes(strVal)) {
            errors[field.fieldKey] = `${field.label} must be Yes or No.`;
          } else {
            cleaned[field.fieldKey] = strVal;
          }
          break;
        }
        case 'multi_select': {
          const arr = Array.isArray(raw) ? raw.map(String) : [];
          const opts = field.options ?? [];
          const invalidChoice = arr.find((item) => opts.length > 0 && !opts.includes(item));
          if (invalidChoice) {
            errors[field.fieldKey] = `${field.label} contains invalid selection "${invalidChoice}".`;
          } else {
            cleaned[field.fieldKey] = arr;
          }
          break;
        }
        case 'checkbox': {
          cleaned[field.fieldKey] = Boolean(raw === true || strVal === 'true');
          break;
        }
        default: {
          cleaned[field.fieldKey] = sanitizeText(strVal);
          break;
        }
      }
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors,
      cleaned,
    };
  }

  public dispatchNotification(params: {
    customer: ErpCustomer;
    applicationNo?: string;
    channel: 'DASHBOARD' | 'SMS' | 'EMAIL_SMTP' | 'WHATSAPP';
    eventKey: string;
    consentCategory: ConsentCategoryKey;
    messagePreview: string;
    actorUserId: string;
  }): ErpNotificationDispatch {
    const consent = params.customer.consents.find((c) => c.category === params.consentCategory);
    const consentGranted = Boolean(consent?.granted);

    let recipient = params.customer.mobile;
    if (params.channel === 'EMAIL_SMTP') recipient = params.customer.email || 'Not Provided';
    if (params.channel === 'WHATSAPP') recipient = params.customer.whatsapp || params.customer.mobile;
    if (params.channel === 'DASHBOARD') recipient = params.customer.customerId;

    let status: ErpNotificationDispatch['status'] = 'Delivered (Internal)';
    let statusReason = 'Recorded inside MUN COMPUTER dashboard alert queue.';

    if (params.channel !== 'DASHBOARD') {
      if (!consentGranted) {
        status = 'Skipped (No Consent)';
        statusReason = `Blocked: Customer has not granted ${params.consentCategory}.`;
      } else {
        const integration = this.phase03Store.apiIntegrations.find((i) => i.channel === params.channel);
        if (!integration?.isConfigured) {
          status = 'Not Configured';
          statusReason = `${params.channel} gateway credentials are not configured in Master Settings.`;
        } else {
          status = 'Pending Provider';
          statusReason = `Queued for ${integration.providerName}; live delivery webhook confirmation pending.`;
        }
      }
    }

    const record: ErpNotificationDispatch = {
      id: this.nextNumericId('notif'),
      applicationNo: params.applicationNo,
      customerId: params.customer.customerId,
      channel: params.channel,
      eventKey: params.eventKey,
      recipient,
      messagePreview: sanitizeText(params.messagePreview),
      consentChecked: true,
      consentGranted,
      status,
      statusReason,
      createdBy: params.actorUserId,
      createdAt: new Date().toISOString(),
    };
    this.notifications.unshift(record);
    return record;
  }

  public runAutomationsForEvent(params: {
    trigger:
      | 'APPLICATION_CREATED'
      | 'APPLICATION_SUBMITTED'
      | 'STATUS_CHANGED'
      | 'DOCUMENT_UPLOADED'
      | 'DOCUMENT_VERIFIED'
      | 'DOCUMENT_REJECTED'
      | 'PAYMENT_RECEIVED'
      | 'PAYMENT_PENDING'
      | 'APPLICATION_COMPLETED';
    app: ErpApplication;
    actorUserId: string;
    actorRole: RoleName;
  }): void {
    const svc = this.services.find((s) => s.serviceId === params.app.serviceId);
    if (!svc) return;

    for (const rule of svc.automationRules) {
      if (!rule.enabled || rule.trigger !== params.trigger) continue;
      if (rule.conditionStatus && rule.conditionStatus !== 'ANY' && rule.conditionStatus !== params.app.status) {
        continue;
      }

      try {
        if (rule.actionType === 'CREATE_FOLLOWUP') {
          const due = addDaysIso(new Date().toISOString(), Number(rule.actionParam || '2'));
          this.followUps.unshift({
            id: this.nextNumericId('followUp'),
            applicationNo: params.app.applicationNo,
            followUpDate: due,
            followUpTime: '11:00',
            reason: `Automation: ${rule.name}`,
            assignedStaffId: params.app.assignedStaffId || 'MC2627110003',
            status: 'Pending',
            remarks: 'Auto-created by service automation rule.',
            createdBy: 'SYSTEM_AUTOMATION',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        } else if (rule.actionType === 'ASSIGN_COUNTER' && !params.app.assignedCounterCode) {
          params.app.assignedCounterCode = rule.actionParam || 'CTR-01';
        } else if (rule.actionType === 'GENERATE_NOTIFICATION') {
          const customer = this.customers.find((c) => c.customerId === params.app.customerId);
          if (customer) {
            this.dispatchNotification({
              customer,
              applicationNo: params.app.applicationNo,
              channel: 'DASHBOARD',
              eventKey: params.trigger,
              consentCategory: 'STATUS_UPDATE_CONSENT',
              messagePreview: `${params.app.applicationNo} (${params.app.serviceSnapshot.name}): ${params.app.status}`,
              actorUserId: 'SYSTEM_AUTOMATION',
            });
          }
        }
        rule.executionCount += 1;
        rule.lastRunAt = new Date().toISOString();
      } catch (err) {
        rule.lastError = err instanceof Error ? err.message : 'Execution failed';
      }
    }
  }

  private seedEnterpriseBaseline(): void {
    const now = '2026-11-16T09:00:00.000Z';

    // 1. Production Clean State: Customers list starts clean with zero sample records
    this.customers = [];

    // 2. Service Categories (Exact 21 Categories)
    this.serviceCategories = CATALOG_CATEGORIES_21.map((cat) => {
      const id = this.nextNumericId('category');
      return {
        id,
        code: cat.code,
        name: cat.name,
        description: cat.description,
        displayOrder: cat.displayOrder,
        status: 'active' as const,
        proposedBy: 'MC2627110001',
        approvedBy: 'MC2627110001',
        createdBy: 'MC2627110001',
        updatedBy: 'MC2627110001',
        createdAt: now,
        updatedAt: now,
      };
    });

    // 2b. Service Subcategories (All Subcategories linked by unique categoryId)
    this.serviceSubcategories = CATALOG_SUBCATEGORIES.map((sub) => {
      const id = this.nextNumericId('subcategory');
      return {
        id,
        code: sub.code,
        categoryId: sub.categoryId,
        categoryName: sub.categoryName,
        name: sub.name,
        description: sub.description,
        displayOrder: sub.displayOrder,
        status: 'active' as const,
        createdBy: 'MC2627110001',
        updatedBy: 'MC2627110001',
        createdAt: now,
        updatedAt: now,
      };
    });

    // 3. Complete 675 Services Integration (Category -> Subcategory -> Individual Service)
    this.services = CATALOG_SERVICES_675.map((def) => {
      const numId = this.nextNumericId('service');
      this.issuedServiceCodes.add(def.serviceCode);
      return {
        id: numId,
        serviceId: def.serviceId,
        serviceCode: def.serviceCode,
        name: def.name,
        categoryId: def.categoryId,
        categoryName: def.categoryName,
        subcategoryId: def.subcategoryId,
        subcategoryName: def.subcategoryName,
        description: def.description,
        serviceCharge: 0,
        serviceCost: 0,
        govtFee: 0,
        additionalCharges: 0,
        totalCustomerCharge: 0,
        customerCharge: 0,
        profitAmount: 0,
        status: 'Active',
        availability: 'Available',
        serviceInstructions: def.serviceInstructions,
        termsAndConditions: def.serviceInstructions,
        displayOrder: def.displayOrder,
        sla: {
          processingMode: 'FIXED',
          expectedDays: def.expectedDays,
          minDays: 1,
          maxDays: Math.max(def.expectedDays + 2, 3),
          dayType: 'WORKING',
          excludeHolidays: true,
          startEvent: 'ON_SUBMIT',
          pauseOnStatuses: ['Pending Customer', 'Pending Office', 'On Hold'],
          warningThresholdPct: 75,
          breachThresholdHours: 72,
          escalateToManagerAtWarning: true,
          escalateToAdminAtBreach: true,
        },
        requiredDocuments: def.requiredDocuments.map((d) => ({
          docKey: d.docKey,
          label: d.label,
          category: d.category,
          required: d.required,
          allowMultiple: false,
          allowedFormats: ['PDF', 'JPG', 'JPEG', 'PNG'] as Array<'PDF' | 'JPG' | 'JPEG' | 'PNG'>,
          maxSizeMb: 10,
          instructions: 'Valid government identity proof.',
          enabled: true,
        })),
        currentFormVersion: 1,
        formVersions: [
          {
            versionNo: 1,
            publishedAt: now,
            publishedBy: 'MC2627110001',
            status: 'published',
            fields: [
              { fieldKey: 'applicant_name', label: 'Applicant Full Name', fieldType: 'short_text', required: true, displayOrder: 1, enabled: true },
              { fieldKey: 'applicant_mobile', label: 'Mobile Number', fieldType: 'mobile', required: true, displayOrder: 2, enabled: true },
              { fieldKey: 'service_notes', label: 'Service Request Notes / Details', fieldType: 'long_text', required: false, displayOrder: 3, enabled: true },
            ],
          },
        ],
        automationRules: [
          {
            id: 'AUTO-GEN-1',
            name: 'Auto-generate Application Reference Number',
            trigger: 'APPLICATION_SUBMITTED',
            conditionStatus: 'Submitted',
            actionType: 'GENERATE_REF_NO',
            actionParam: 'MCS_PREFIX',
            enabled: true,
            versionNo: 1,
            executionCount: 0,
            lastRunAt: null,
            lastError: null,
          },
        ],
        processingTimeHistory: [],
        deletedAt: null,
        createdBy: 'MC2627110001',
        updatedBy: 'MC2627110001',
        createdAt: now,
        updatedAt: now,
      };
    });
    this.serviceCodeSequences['2627'] = CATALOG_SERVICES_675.length;
    this.phase03Store.docSequence.seed('SERVICE', 'MCS', '2026-27', CATALOG_SERVICES_675.length);

    // 4. Default 7 Dynamic Reference Fields (Section 4 & 36)
    const refDefs: Array<[string, string, 'text' | 'number' | 'date', 'NONE' | 'GLOBAL' | 'PER_SERVICE']> = [
      ['application_number', 'Application Number', 'text', 'PER_SERVICE'],
      ['acknowledgement_number', 'Acknowledgement Number', 'text', 'GLOBAL'],
      ['external_reference_number', 'External Reference Number', 'text', 'NONE'],
      ['tracking_number', 'Tracking Number', 'text', 'NONE'],
      ['transaction_id', 'Transaction ID', 'text', 'GLOBAL'],
      ['receipt_number', 'Receipt Number', 'text', 'NONE'],
      ['department_reference_number', 'Department Reference Number', 'text', 'NONE'],
    ];

    this.referenceFields = refDefs.map(([fieldKey, label, inputType, uniqueScope]) => ({
      id: this.nextNumericId('refField'),
      fieldKey,
      label,
      inputType,
      serviceId: 'ALL',
      required: false,
      uniqueScope,
      enabled: true,
      createdBy: 'MC2627110001',
      createdAt: now,
    }));

    // 5. Production Clean State: Applications, Payments, Deliveries, Documents, Follow-ups & Expenses start empty
    this.applications = [];
    this.payments = [];
    this.deliveries = [];
    this.documents = [];
    this.followUps = [];
    this.expenses = [];
  }

  public syncCatalog675(actorUserId = 'MC2627110001'): void {
    const now = new Date().toISOString();
    for (const cat of CATALOG_CATEGORIES_21) {
      if (!this.serviceCategories.some((c) => c.code === cat.code)) {
        const id = Math.max(this.nextNumericId('category'), cat.id);
        this.serviceCategories.push({
          id,
          code: cat.code,
          name: cat.name,
          description: cat.description,
          displayOrder: cat.displayOrder,
          status: 'active',
          proposedBy: actorUserId,
          approvedBy: actorUserId,
          createdBy: actorUserId,
          updatedBy: actorUserId,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    for (const sub of CATALOG_SUBCATEGORIES) {
      if (!this.serviceSubcategories.some((sc) => sc.code === sub.code)) {
        const id = Math.max(this.nextNumericId('subcategory'), sub.id);
        this.serviceSubcategories.push({
          id,
          code: sub.code,
          categoryId: sub.categoryId,
          categoryName: sub.categoryName,
          name: sub.name,
          description: sub.description,
          displayOrder: sub.displayOrder,
          status: 'active',
          createdBy: actorUserId,
          updatedBy: actorUserId,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    for (const def of CATALOG_SERVICES_675) {
      if (!this.services.some((s) => s.serviceId === def.serviceId || s.serviceCode === def.serviceCode)) {
        const numId = Math.max(this.nextNumericId('service'), def.id);
        this.issuedServiceCodes.add(def.serviceCode);
        this.services.push({
          id: numId,
          serviceId: def.serviceId,
          serviceCode: def.serviceCode,
          name: def.name,
          categoryId: def.categoryId,
          categoryName: def.categoryName,
          subcategoryId: def.subcategoryId,
          subcategoryName: def.subcategoryName,
          description: def.description,
          serviceCharge: 0,
          serviceCost: 0,
          govtFee: 0,
          additionalCharges: 0,
          totalCustomerCharge: 0,
          customerCharge: 0,
          profitAmount: 0,
          status: 'Active',
          availability: 'Available',
          serviceInstructions: def.serviceInstructions,
          termsAndConditions: def.serviceInstructions,
          displayOrder: def.displayOrder,
          sla: {
            processingMode: 'FIXED',
            expectedDays: def.expectedDays,
            minDays: 1,
            maxDays: Math.max(def.expectedDays + 2, 3),
            dayType: 'WORKING',
            excludeHolidays: true,
            startEvent: 'ON_SUBMIT',
            pauseOnStatuses: ['Pending Customer', 'Pending Office', 'On Hold'],
            warningThresholdPct: 75,
            breachThresholdHours: 72,
            escalateToManagerAtWarning: true,
            escalateToAdminAtBreach: true,
          },
          requiredDocuments: def.requiredDocuments.map((d) => ({
            docKey: d.docKey,
            label: d.label,
            category: d.category,
            required: d.required,
            allowMultiple: false,
            allowedFormats: ['PDF', 'JPG', 'JPEG', 'PNG'] as Array<'PDF' | 'JPG' | 'JPEG' | 'PNG'>,
            maxSizeMb: 10,
            instructions: 'Valid government identity proof.',
            enabled: true,
          })),
          currentFormVersion: 1,
          formVersions: [
            {
              versionNo: 1,
              publishedAt: now,
              publishedBy: actorUserId,
              status: 'published',
              fields: [
                { fieldKey: 'applicant_name', label: 'Applicant Full Name', fieldType: 'short_text', required: true, displayOrder: 1, enabled: true },
                { fieldKey: 'applicant_mobile', label: 'Mobile Number', fieldType: 'mobile', required: true, displayOrder: 2, enabled: true },
                { fieldKey: 'service_notes', label: 'Service Request Notes / Details', fieldType: 'long_text', required: false, displayOrder: 3, enabled: true },
              ],
            },
          ],
          automationRules: [
            {
              id: 'AUTO-GEN-1',
              name: 'Auto-generate Application Reference Number',
              trigger: 'APPLICATION_SUBMITTED',
              conditionStatus: 'Submitted',
              actionType: 'GENERATE_REF_NO',
              actionParam: 'MCS_PREFIX',
              enabled: true,
              versionNo: 1,
              executionCount: 0,
              lastRunAt: null,
              lastError: null,
            },
          ],
          processingTimeHistory: [],
          deletedAt: null,
          createdBy: actorUserId,
          updatedBy: actorUserId,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    this.serviceCodeSequences['2627'] = Math.max(
      this.serviceCodeSequences['2627'] ?? 0,
      CATALOG_SERVICES_675.length
    );
    this.phase03Store.docSequence.seed('SERVICE', 'MCS', '2026-27', CATALOG_SERVICES_675.length);
  }
}
