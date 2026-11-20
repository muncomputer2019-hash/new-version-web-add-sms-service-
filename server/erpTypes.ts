export type RoleName = 'ADMIN' | 'MANAGER' | 'STAFF' | 'AUDITOR' | 'CUSTOMER' | 'EMPLOYEE';

// 12 Official Application Statuses (Section 7 / Section 24)
export type ErpApplicationStatus =
  | 'Draft'
  | 'Submitted'
  | 'Under Review'
  | 'Processing'
  | 'Pending Customer'
  | 'Pending Office'
  | 'Approved'
  | 'Rejected'
  | 'Completed'
  | 'Cancelled'
  | 'On Hold'
  | 'Reopened';

export type DocumentVerificationStatus = 'Pending' | 'Verified' | 'Rejected';

export type CustomerStatus = 'Active' | 'Inactive' | 'Blocked';

export type CustomerVerificationStatus =
  | 'Unverified'
  | 'Mobile Verified'
  | 'Consent Verified'
  | 'Fully Verified'
  | 'Verification Expired'
  | 'Re-verification Required';

export type ConsentCategoryKey =
  | 'SMS_CONSENT'
  | 'WHATSAPP_CONSENT'
  | 'STATUS_UPDATE_CONSENT'
  | 'PAYMENT_REMINDER_CONSENT'
  | 'SERVICE_NOTIFICATION_CONSENT'
  | 'PROMOTIONAL_CONSENT'
  | 'DATA_PRIVACY_CONSENT';

export interface CustomerConsentState {
  category: ConsentCategoryKey;
  label: string;
  granted: boolean;
  recordedAt: string | null;
  recordedBy: string;
  verificationMethod: 'Digital Signature' | 'Printed Signed Form' | 'OTP Confirmed' | 'Not Set';
}

export interface CustomerConsentHistoryEntry {
  id: number;
  category: ConsentCategoryKey;
  previousGranted: boolean;
  newGranted: boolean;
  actorUserId: string;
  method: string;
  notes: string;
  recordedAt: string;
}

export interface CustomerContactChangeRecord {
  id: number;
  field: 'mobile' | 'whatsapp';
  oldValue: string;
  newValue: string;
  verifiedByOtp: boolean;
  adminOverrideReason?: string;
  changedBy: string;
  changedAt: string;
}

export interface CustomerFollowUpNote {
  id: number;
  type: 'INTERNAL_NOTE' | 'FOLLOW_UP';
  text: string;
  followUpDate?: string;
  status?: 'Pending' | 'Completed' | 'Rescheduled' | 'Cancelled';
  assignedStaffId?: string;
  authorUserId: string;
  createdAt: string;
}

export interface ErpCustomer {
  id: number;
  customerId: string; // MCC-YYYY-YY-NNNNNN
  fullName: string;
  fatherOrHusbandName: string;
  dob: string;
  gender: 'Male' | 'Female' | 'Other';
  mobile: string;
  whatsapp: string;
  email: string;
  aadhaarEncrypted?: string;
  aadhaarLast4?: string;
  panNumber?: string;
  voterId?: string;
  village: string;
  postOffice: string;
  policeStation: string;
  district: string;
  pinCode: string;
  presentAddress: string;
  permanentAddress: string;
  sameAsPresent: boolean;
  photoUrl?: string;
  segment: 'Individual' | 'Corporate' | 'Government';
  crmTag: 'New' | 'Regular' | 'Active' | 'Inactive' | 'Follow-up Required' | 'Pending Payment' | 'Service Completed';
  status: CustomerStatus;
  verificationStatus: CustomerVerificationStatus;
  mobileOtpVerifiedAt: string | null;
  consents: CustomerConsentState[];
  consentHistory: CustomerConsentHistoryEntry[];
  contactHistory: CustomerContactChangeRecord[];
  notesAndFollowUps: CustomerFollowUpNote[];
  statusHistory: Array<{
    previousStatus: CustomerStatus;
    newStatus: CustomerStatus;
    changedBy: string;
    reason: string;
    changedAt: string;
  }>;
  mergedIntoCustomerId?: string | null;
  mergedFromCustomerIds?: string[];
  deletedAt: string | null;
  deletedBy?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceCategory {
  id: number;
  code: string;
  name: string;
  description: string;
  displayOrder?: number;
  status: 'active' | 'pending_approval' | 'archived';
  proposedBy: string;
  approvedBy: string | null;
  createdBy?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface ServiceSubcategory {
  id: number;
  code: string;
  categoryId: number;
  categoryName: string;
  name: string;
  description: string;
  displayOrder: number;
  status: 'active' | 'archived';
  createdBy: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export type DynamicFieldType =
  | 'short_text'
  | 'long_text'
  | 'number'
  | 'date'
  | 'mobile'
  | 'email'
  | 'dropdown'
  | 'radio'
  | 'checkbox'
  | 'multi_select'
  | 'file_upload'
  | 'aadhaar'
  | 'pan'
  | 'address'
  | 'yes_no';

export interface DynamicFormFieldDef {
  fieldKey: string;
  label: string;
  description?: string;
  fieldType: DynamicFieldType;
  required: boolean;
  displayOrder: number;
  defaultValue?: string;
  options?: string[];
  minLength?: number;
  maxLength?: number;
  minValue?: number;
  maxValue?: number;
  enabled: boolean;
}

export interface ServiceFormVersion {
  versionNo: number;
  publishedAt: string;
  publishedBy: string;
  status: 'published' | 'archived';
  fields: DynamicFormFieldDef[];
}

export interface ServiceRequiredDocumentDef {
  docKey: string;
  label: string;
  category: string;
  required: boolean;
  allowMultiple: boolean;
  allowedFormats: Array<'PDF' | 'JPG' | 'JPEG' | 'PNG'>;
  maxSizeMb: number;
  instructions: string;
  enabled: boolean;
}

export interface ServiceSlaConfig {
  processingMode: 'FIXED' | 'RANGE';
  expectedDays: number;
  minDays: number;
  maxDays: number;
  dayType: 'CALENDAR' | 'WORKING';
  excludeHolidays: boolean;
  startEvent: 'ON_SUBMIT' | 'ON_ASSIGN';
  pauseOnStatuses: ErpApplicationStatus[];
  warningThresholdPct: number;
  breachThresholdHours: number;
  escalateToManagerAtWarning: boolean;
  escalateToAdminAtBreach: boolean;
}

export interface ServiceAutomationRule {
  id: string;
  name: string;
  trigger:
    | 'APPLICATION_CREATED'
    | 'APPLICATION_SUBMITTED'
    | 'STATUS_CHANGED'
    | 'DOCUMENT_UPLOADED'
    | 'DOCUMENT_VERIFIED'
    | 'DOCUMENT_REJECTED'
    | 'PAYMENT_RECEIVED'
    | 'PAYMENT_PENDING'
    | 'FOLLOWUP_DUE'
    | 'SLA_WARNING'
    | 'SLA_BREACH'
    | 'APPLICATION_COMPLETED'
    | 'DELIVERY_READY'
    | 'REFUND_PROCESSED';
  conditionStatus?: ErpApplicationStatus | 'ANY';
  actionType:
    | 'ASSIGN_STAFF'
    | 'ASSIGN_COUNTER'
    | 'CREATE_FOLLOWUP'
    | 'CREATE_REMINDER'
    | 'GENERATE_NOTIFICATION'
    | 'ESCALATE_INTERNAL'
    | 'GENERATE_REF_NO';
  actionParam: string;
  enabled: boolean;
  versionNo: number;
  executionCount: number;
  lastRunAt: string | null;
  lastError: string | null;
}

export interface ErpService {
  id: number;
  serviceId: string; // MCS-2026-27-000001
  serviceCode: string; // MC2627SRV-001 (read-only after generation)
  name: string;
  categoryId: number;
  categoryName: string;
  subcategoryId?: number;
  subcategoryName?: string;
  description: string;
  serviceCharge: number;
  serviceCost: number;
  govtFee: number;
  additionalCharges: number;
  totalCustomerCharge: number;
  customerCharge: number; // Mirrored to totalCustomerCharge for compatibility
  profitAmount: number;
  status: 'Active' | 'Inactive' | 'Temporarily Suspended' | 'Archived';
  availability: 'Available' | 'Unavailable';
  serviceInstructions?: string;
  termsAndConditions: string;
  displayOrder?: number;
  sla: ServiceSlaConfig;
  requiredDocuments: ServiceRequiredDocumentDef[];
  currentFormVersion: number;
  formVersions: ServiceFormVersion[];
  automationRules: ServiceAutomationRule[];
  processingTimeHistory: Array<{
    previousSummary: string;
    newSummary: string;
    changedBy: string;
    changedAt: string;
  }>;
  deletedAt: string | null;
  createdBy: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReferenceFieldDefinition {
  id: number;
  fieldKey: string;
  label: string;
  inputType: 'text' | 'number' | 'date';
  serviceId: string | 'ALL';
  required: boolean;
  uniqueScope: 'NONE' | 'GLOBAL' | 'PER_SERVICE';
  enabled: boolean;
  createdBy: string;
  createdAt: string;
}

export interface ApplicationReferenceEntry {
  id: number;
  fieldKey: string;
  label: string;
  value: string;
  addedBy: string;
  addedAt: string;
  updatedBy: string;
  updatedAt: string;
  history: Array<{
    previousValue: string;
    newValue: string;
    changedBy: string;
    changedAt: string;
    reason: string;
  }>;
}

export interface ApplicationDocumentRecord {
  id: number;
  fileUuid: string;
  applicationNo: string;
  customerId: string;
  docKey: string;
  category: string;
  originalName: string;
  mimeType: 'application/pdf' | 'image/jpeg' | 'image/png';
  fileSizeBytes: number;
  contentBase64: string; // Stored strictly in private server memory; stripped from list APIs
  verificationStatus: DocumentVerificationStatus;
  rejectionReason?: string;
  verifiedBy?: string | null;
  verifiedAt?: string | null;
  versionNo: number;
  replacedFileUuid?: string | null;
  expiryDate?: string | null;
  uploadedBy: string;
  uploadedAt: string;
  deletedAt: string | null;
  verificationHistory: Array<{
    status: DocumentVerificationStatus;
    actor: string;
    reason: string;
    at: string;
  }>;
}

export interface ApplicationStatusHistoryEvent {
  id: number;
  previousStatus: ErpApplicationStatus | null;
  newStatus: ErpApplicationStatus;
  changedBy: string;
  changedByRole: RoleName;
  remarks: string;
  reason: string;
  supportingDocUuid?: string;
  changedAt: string;
}

export interface ApplicationAssignmentEvent {
  id: number;
  previousStaffId: string | null;
  newStaffId: string | null;
  previousCounterCode: string | null;
  newCounterCode: string | null;
  assignedBy: string;
  reason: string;
  assignedAt: string;
}

export interface ReassignmentRequest {
  id: number;
  requestCode: string;
  applicationNo: string;
  requestedBy: string;
  currentStaffId: string | null;
  proposedStaffId: string | null;
  proposedCounterCode: string | null;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  reviewedBy: string | null;
  reviewNotes: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface ApplicationFollowUp {
  id: number;
  applicationNo: string;
  followUpDate: string; // DD/MM/YYYY or YYYY-MM-DD
  followUpTime: string;
  reason: string;
  assignedStaffId: string;
  status: 'Pending' | 'Completed' | 'Rescheduled' | 'Cancelled';
  nextFollowUpDate?: string;
  remarks: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationNote {
  id: number;
  applicationNo: string;
  noteType: 'INTERNAL' | 'CUSTOMER_REMARK';
  content: string;
  createdBy: string;
  createdAt: string;
  editHistory: Array<{
    previousContent: string;
    editedBy: string;
    editedAt: string;
  }>;
}

export interface ApplicationDeliveryRecord {
  id: number;
  deliveryId: string; // MCD-YYYY-YY-NNNNNN
  applicationNo: string;
  customerId: string;
  serviceId: string;
  assignedStaffId: string | null;
  counterCode: string | null;
  deliverableType: string;
  deliverableDescription: string;
  deliveryMethod:
    | 'Physical Handover'
    | 'Customer Collection'
    | 'Authorized Representative'
    | 'Digital Delivery'
    | 'Other Configured Method';
  deliveryDate: string;
  deliveryTime: string;
  preparedBy: string;
  deliveredBy: string | null;
  receivedBy: string;
  representativeDetails?: string;
  handoverConfirmed: boolean;
  otpConfirmed: boolean;
  acknowledgementRef: string;
  status:
    | 'Not Ready'
    | 'Ready for Delivery'
    | 'Customer Notified'
    | 'Delivered'
    | 'Partially Delivered'
    | 'Delivery Failed'
    | 'Rescheduled';
  remarks: string;
  createdAt: string;
  updatedAt: string;
}

export interface CancellationRequestRecord {
  id: number;
  requestCode: string;
  applicationNo: string;
  reason: string;
  requestedBy: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  reviewedBy: string | null;
  reviewRemarks: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface ErpPaymentRecord {
  id: number;
  transactionId: string; // TXN-...
  receiptNo: string; // MCR-YYYY-YY-NNNNNN
  invoiceNo?: string; // MCI-YYYY-YY-NNNNNN
  applicationNo: string;
  customerId: string;
  customerName: string;
  serviceId: string;
  serviceName: string;
  counterCode: string;
  collectedBy: string;
  paymentType: 'Advance' | 'Partial' | 'Full';
  paymentMethod: 'Cash' | 'UPI' | 'Card' | 'Bank Transfer' | 'Other';
  upiReference?: string;
  amount: number;
  verificationStatus: 'Confirmed' | 'Pending Verification' | 'Rejected';
  verifiedBy: string | null;
  verifiedAt: string | null;
  recordedAt: string;
  notes: string;
}

export interface ErpRefundRecord {
  id: number;
  refundId: string; // MCRF-YYYY-YY-NNNNNN
  applicationNo: string;
  customerId: string;
  originalTransactionId: string;
  refundType: 'Full' | 'Partial' | 'No Refund';
  refundAmount: number;
  refundMethod: 'Cash' | 'UPI' | 'Bank Transfer';
  refundReason: string;
  status: 'Pending' | 'Approved' | 'Rejected' | 'Processed';
  requestedBy: string;
  approvedBy: string | null;
  processedBy: string | null;
  transactionRef: string;
  remarks: string;
  createdAt: string;
  processedAt: string | null;
}

export interface ErpExpenseRecord {
  id: number;
  voucherNo: string;
  category: string;
  description: string;
  counterCode: string;
  amount: number;
  expenseDate: string;
  recordedBy: string;
  status: 'Approved' | 'Pending';
  createdAt: string;
}

export interface ErpNotificationDispatch {
  id: number;
  applicationNo?: string;
  customerId: string;
  channel: 'DASHBOARD' | 'SMS' | 'EMAIL_SMTP' | 'WHATSAPP';
  eventKey: string;
  recipient: string;
  messagePreview: string;
  consentChecked: boolean;
  consentGranted: boolean;
  status: 'Delivered (Internal)' | 'Pending Provider' | 'Not Configured' | 'Skipped (No Consent)' | 'Failed';
  statusReason: string;
  createdBy: string;
  createdAt: string;
}

export interface ErpActivityEntry {
  id: number;
  actorUserId: string;
  actorRole: RoleName;
  action: string;
  applicationNo?: string;
  previousValue?: string;
  newValue?: string;
  reason?: string;
  ipAddress: string;
  createdAt: string;
}

export interface ErpApplication {
  id: number;
  applicationNo: string; // MCA-2026-27-000001
  financialYear: string;
  customerId: string;
  customerSnapshot: {
    customerId: string;
    fullName: string;
    fatherOrHusbandName: string;
    dob: string;
    gender: string;
    mobile: string;
    whatsapp: string;
    village: string;
    presentAddress: string;
  };
  serviceId: string;
  serviceSnapshot: {
    serviceId: string;
    serviceCode: string;
    name: string;
    categoryName: string;
    appliedFormVersion: number;
    formFieldsSnapshot: DynamicFormFieldDef[];
    requiredDocsSnapshot: ServiceRequiredDocumentDef[];
    customerChargeSnapshot: number;
    serviceCostSnapshot: number;
    profitSnapshot: number;
    termsSnapshot: string;
  };
  formData: Record<string, unknown>;
  status: ErpApplicationStatus;
  assignedStaffId: string | null;
  assignedCounterCode: string | null;
  submissionDate: string | null;
  expectedCompletionDate: string;
  actualCompletionDate: string | null;
  slaPausedMinutes: number;
  slaStatusOverride?: string;
  mandatoryDocExceptionReason?: string | null;
  duplicateOverrideReason?: string | null;
  references: ApplicationReferenceEntry[];
  statusHistory: ApplicationStatusHistoryEvent[];
  assignmentHistory: ApplicationAssignmentEvent[];
  archivedAt: string | null;
  archivedBy: string | null;
  deletionProposalStatus?: 'None' | 'Pending' | 'Rejected';
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ErpExportLog {
  id: number;
  reportName: string;
  format: 'PDF' | 'Excel' | 'CSV';
  rowCount: number;
  exportedBy: string;
  exportedRole: RoleName;
  exportedAt: string;
}
