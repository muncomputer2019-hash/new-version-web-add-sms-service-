export type RoleName = 'ADMIN' | 'MANAGER' | 'STAFF' | 'AUDITOR' | 'CUSTOMER' | 'EMPLOYEE';

export type AccountStatus =
  | 'PENDING'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'DEACTIVATED'
  | 'REJECTED';

export type RegistrationStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CORRECTION_REQUIRED';

export type PageKey =
  | 'dashboard'
  | 'customers'
  | 'services'
  | 'applications'
  | 'transactions'
  | 'cashbook'
  | 'expenses'
  | 'income'
  | 'finance-hub'
  | 'chart-of-accounts'
  | 'banking-csp'
  | 'employees'
  | 'products'
  | 'inventory'
  | 'reports'
  | 'notifications'
  | 'settings'
  | 'feedback'
  // Phase 02 Security & User Management pages
  | 'users'
  | 'add-user'
  | 'user-profile'
  | 'roles'
  | 'permissions'
  | 'registration-requests'
  | 'approvals'
  | 'login-history'
  | 'security-logs'
  | 'sessions'
  // Phase 03 Master Settings & Global Configuration
  | 'master-settings'
  // Phase 07 Advanced Reports, BI, Analytics & Printing
  | 'reports-catalog'
  | 'reports-analytics'
  | 'reports-builder'
  | 'reports-scheduler'
  | 'reports-archive'
  // Phase 08 Security, Backup, Disaster Recovery & Data Protection
  | 'security-dashboard'
  | 'device-monitoring'
  | 'backup-recovery'
  | 'data-recovery'
  // Phase 09 Testing, QA, Bug Management & Release Readiness
  | 'qa-dashboard'
  | 'qa-workbench'
  | 'qa-bugs'
  | 'qa-release'
  | 'customer-portal';

export type ApplicationStatus = 'Completed' | 'Processing' | 'Pending' | 'On Hold';
export type TransactionStatus = 'Paid' | 'Pending' | 'Refunded';
export type CustomerStatus = 'Active' | 'Inactive';

export interface UserProfile {
  id: number;
  userId: string;
  isMasterAdmin?: boolean;
  fullName: string;
  email: string;
  role: RoleName;
  mobile: string;
  address: string;
  designation?: string;
  departmentCode?: string;
  joiningDate?: string;
  emergencyContact?: string;
  profilePhotoUrl?: string;
  aadhaarMasked?: string;
  hasAadhaar?: boolean;
  avatarInitials: string;
  branch: string;
  status: AccountStatus;
  mobileVerified: boolean;
  emailVerified: boolean;
  totpEnabled?: boolean;
  totpEnrolledAt?: string | null;
  recoveryCodesRemaining?: number;
  failedLoginAttempts?: number;
  isLocked?: boolean;
  createdAt?: string;
  passwordChangedAt?: string;
  permissions?: Record<string, boolean>;
}

export interface RegistrationRequestItem {
  id: number;
  requestId: string;
  applicantName: string;
  requestedRole: RoleName;
  mobile: string;
  email: string;
  address: string;
  designation?: string;
  departmentCode?: string;
  joiningDate?: string;
  aadhaarMasked?: string;
  mobileVerified: boolean;
  submittedBy: string;
  status: RegistrationStatus;
  reviewedBy: string | null;
  approvalDate: string | null;
  reviewNotes: string | null;
  issuedUserId: string | null;
  createdAt: string;
}

export interface DepartmentItem {
  id: number;
  code: string;
  name: string;
  description: string;
  headUserId?: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
}

export interface ManagerServiceAssignmentItem {
  id: number;
  assignmentCode: string;
  managerUserId: string;
  serviceId: string;
  serviceName: string;
  departmentCode: string;
  permissions: string[];
  assignedByAdmin: string;
  assignedAt: string;
  effectiveDate: string;
  expiryDate: string | null;
  notes?: string;
  status: string;
  updatedAt: string;
}

export interface StaffServiceRequestItem {
  id: number;
  requestCode: string;
  managerUserId: string;
  staffUserId: string;
  managerAssignmentCode: string;
  serviceId: string;
  serviceName: string;
  departmentCode: string;
  requestedPermissions: string[];
  reason?: string;
  status: string;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  reviewNotes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StaffServicePermissionItem {
  id: number;
  permissionCode: string;
  staffUserId: string;
  managerUserId: string;
  managerAssignmentCode: string;
  requestCode: string;
  serviceId: string;
  serviceName: string;
  departmentCode: string;
  permissions: string[];
  approvedByAdmin: string;
  effectiveDate: string;
  expiryDate: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceApprovalLogItem {
  id: number;
  logCode: string;
  actorUserId: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetCode: string;
  staffUserId?: string;
  managerUserId?: string;
  serviceId?: string;
  previousStatus?: string | null;
  newStatus?: string | null;
  details: string;
  createdAt: string;
}

export interface ServicePermissionsOverviewPayload {
  departments: DepartmentItem[];
  managerAssignments: ManagerServiceAssignmentItem[];
  staffRequests: StaffServiceRequestItem[];
  staffPermissions: StaffServicePermissionItem[];
  approvalLogs: ServiceApprovalLogItem[];
  availableServices: Array<{
    serviceId: string;
    name: string;
    category?: string;
    status?: string;
  }>;
}

export interface IdGenerationHistoryItem {
  id: number;
  generatedUserId: string;
  role: RoleName;
  financialYearLabel: string;
  yearMonthKey: string;
  serialNumber: number;
  actorUserId: string;
  departmentCode?: string;
  createdAt: string;
}

export interface Phase02NotificationItem {
  id: number;
  notificationCode: string;
  triggerType: string;
  recipientUserId: string;
  title: string;
  message: string;
  severity: 'INFO' | 'WARNING' | 'ALERT';
  isRead: boolean;
  createdAt: string;
}

export interface SecurityLogItem {
  id: number;
  actorUserId: string;
  targetUserId?: string;
  eventType: string;
  result: 'SUCCESS' | 'FAILURE' | 'BLOCKED';
  ipAddress: string;
  deviceInfo: string;
  summary: string;
  createdAt: string;
}

export interface AuditLogItem {
  id: number;
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  details: string;
  ipAddress: string;
  createdAt: string;
}

export interface SessionItem {
  id: string;
  userId: string;
  role: RoleName;
  ipAddress: string;
  deviceInfo: string;
  rememberMe: boolean;
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

export interface PermissionHistoryItem {
  id: number;
  actorUserId: string;
  targetUserId: string;
  permissionKey: string;
  previousValue: boolean;
  newValue: boolean;
  createdAt: string;
}

export interface CustomerRecord {
  id: number;
  customerCode: string;
  fullName: string;
  phone: string;
  email: string;
  segment: 'Individual' | 'Corporate' | 'Government';
  totalApplications: number;
  totalSpent: number;
  status: CustomerStatus;
  createdAt: string;
}

export interface ApplicationRecord {
  id: number;
  applicationNo: string;
  customerId: number;
  customerName: string;
  customerPhone: string;
  serviceName: string;
  category: string;
  feeAmount: number;
  paidAmount: number;
  assignedTo: string;
  status: ApplicationStatus;
  submittedAt: string;
  dueDate: string;
  notes?: string;
}

export interface TransactionRecord {
  id: number;
  referenceNo: string;
  applicationNo: string;
  customerName: string;
  paymentMethod: 'Cash' | 'Bank Transfer' | 'Card' | 'Mobile Banking';
  amount: number;
  type: 'Collection' | 'Refund';
  status: TransactionStatus;
  recordedAt: string;
}

export interface NotificationItem {
  id: number;
  title: string;
  message: string;
  category: 'Application' | 'Payment' | 'System';
  isRead: boolean;
  createdAt: string;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  description?: string;
}

export interface PaginationMeta {
  page: number;
  perPage: number;
  totalItems: number;
  totalPages: number;
}

export interface ApiResponseEnvelope<T> {
  success: boolean;
  message: string;
  data: T;
  meta?: {
    pagination?: PaginationMeta;
    timestamp: string;
    requestId?: string;
  };
  errors?: Record<string, string[]>;
}

export interface GlobalSearchResult {
  id: string;
  type: 'Page' | 'Customer' | 'Application' | 'Transaction';
  title: string;
  subtitle: string;
  targetPage: PageKey;
  recordId?: number;
}

// Phase 03 Master Settings Types
export type LanguageCode = 'en' | 'bn' | 'hi';
export type ThemeMode = 'light' | 'dark';
export type DocumentType = 'RECEIPT' | 'INVOICE' | 'APPLICATION';
export type TemplateVariant = 'Simple Professional' | 'Detailed Professional';
export type ProposalStatus = 'Pending' | 'Approved' | 'Rejected';

export interface CompanyProfileSettings {
  companyName: string;
  addressLine: string;
  postOffice: string;
  policeStation: string;
  district: string;
  stateName: string;
  countryName: string;
  pinCode: string;
  mobile: string;
  whatsapp: string;
  email: string;
  website: string;
  gstNumber: string;
  panNumber: string;
  upiId: string;
  bankDetails: string;
  logoUrl: string;
  signatureUrl: string;
  stampUrl: string;
  updatedAt: string;
}

export interface ServiceRateVersion {
  versionNo: number;
  customerCharge: number;
  serviceCost: number;
  profitAmount: number;
  effectiveDate: string;
  changeReason: string;
  approvalStatus: ProposalStatus;
  proposedBy: string;
  approvedBy: string | null;
  createdAt: string;
}

export interface ServiceRateItem {
  id: number;
  serviceCode: string;
  serviceName: string;
  category: string;
  customerCharge: number;
  serviceCost: number;
  profitAmount: number;
  currentVersion: number;
  effectiveDate: string;
  status: 'active' | 'inactive';
  versions: ServiceRateVersion[];
}

export interface HistoricalTransactionSnapshot {
  id: number;
  receiptNo: string;
  serviceCode: string;
  serviceName: string;
  appliedVersion: number;
  customerChargeSnapshot: number;
  serviceCostSnapshot: number;
  profitSnapshot: number;
  completedAt: string;
}

export interface GlobalConfiguration {
  financialYearLabel: string;
  financialYearStartMonth: number;
  financialYearEndMonth: number;
  timezone: string;
  defaultLanguage: LanguageCode;
  dateFormat: 'DD/MM/YYYY';
  currencyCode: 'INR';
  currencySymbol: '₹';
  prefixes: {
    RECEIPT: string;
    INVOICE: string;
    APPLICATION: string;
  };
}

export interface DocumentCounterSnapshot {
  docType: DocumentType;
  prefix: string;
  financialYear: string;
  lastSerial: number;
  nextPreview: string;
}

export interface NotificationTemplateItem {
  eventKey:
    | 'PAYMENT_RECEIVED'
    | 'PAYMENT_PENDING'
    | 'APPLICATION_STATUS_UPDATE'
    | 'SERVICE_COMPLETED'
    | 'SECURE_LOGIN_OTP'
    | 'PASSWORD_RESET_OTP'
    | 'SERVICE_THANK_YOU';
  eventLabel: string;
  smsEnabled: boolean;
  emailEnabled: boolean;
  whatsappEnabled: boolean;
  dashboardEnabled: boolean;
  subject: string;
  body: string;
}

export interface PrintSettingsConfig {
  paperSize: 'A4';
  printMode: 'Print Preview then Print';
  includeLogo: boolean;
  includeDigitalSignature: boolean;
  includeCompanyStamp: boolean;
  defaultCopies: number;
}

export interface DocumentTemplateItem {
  id: number;
  docType: 'RECEIPT' | 'INVOICE';
  designVariant: TemplateVariant;
  termsAndConditions: string;
  disclaimer: string;
  showQr: boolean;
  versionNo: number;
  updatedAt: string;
  snapshots: Array<{
    versionNo: number;
    designVariant: TemplateVariant;
    termsAndConditions: string;
    disclaimer: string;
    savedAt: string;
  }>;
}

export interface PaymentQrSettings {
  cashEnabled: boolean;
  upiEnabled: boolean;
  otherEnabled: boolean;
  qrType: 'Static QR' | 'Dynamic QR';
  qrOnReceipt: boolean;
  qrOnInvoice: boolean;
  manualVerificationRequired: boolean;
  upiId: string;
  staticQrPreviewUrl: string;
  dynamicQrProviderConfigured: boolean;
}

export interface SecurityPolicyConfig {
  masterSettingsAccess: 'ADMIN_ONLY';
  userCreationAuthority: 'ADMIN_ONLY';
  approvalAuthority: 'ADMIN_ONLY';
  sessionDurationMinutes: number;
  inactivityAutoLogoutMinutes: number;
  passwordPolicy: 'Strong';
  failedLoginAttemptsLimit: number;
  accountLockoutMinutes: number;
  twoFactorRequiredRoles: Array<'ADMIN' | 'MANAGER' | 'STAFF'>;
}

export interface SettingsProposalItem {
  id: number;
  proposalId: string;
  proposedBy: string;
  proposedDate: string;
  settingModule: string;
  settingName: string;
  oldValue: unknown;
  proposedValue: unknown;
  changeReason: string;
  approvalStatus: ProposalStatus;
  reviewedBy: string | null;
  approvalDate: string | null;
  rejectionReason: string | null;
}

export interface SettingsHistoryEntry {
  id: number;
  settingModule: string;
  settingName: string;
  oldValue: string;
  newValue: string;
  changeReason: string;
  changedBy: string;
  approvedBy: string | null;
  createdAt: string;
}

export interface BackupRecord {
  id: number;
  backupCode: string;
  storageTarget: 'Hosting Server' | 'Computer Download';
  encryptionAlgo: 'AES-256-GCM';
  checksumSha256: string;
  fileSizeBytes: number;
  triggeredBy: string;
  status: 'Success' | 'Failed' | 'Restored';
  failureReason?: string;
  createdAt: string;
}

export interface BranchItem {
  id: number;
  branchCode: string;
  name: string;
  address: string;
  pinCode: string;
  isDefault: boolean;
  status: 'active' | 'inactive';
}

export interface CounterItem {
  id: number;
  branchId: number;
  counterCode: string;
  name: string;
  assignedUserId: string;
  status: 'active' | 'inactive';
}

export interface DailyCashClosingRecord {
  id: number;
  closingCode: string;
  branchId: number;
  counterCode: string;
  closingDate: string;
  openingCash: number;
  cashReceived: number;
  cashExpenses: number;
  expectedCash: number;
  actualCashCount: number;
  cashDifference: number;
  differenceReason: string;
  submittedBy: string;
  approvedBy: string | null;
  approvalStatus: 'Approved' | 'Pending Admin Approval' | 'Rejected';
  createdAt: string;
  correctionAudit: Array<{
    action: string;
    actor: string;
    note: string;
    at: string;
  }>;
}

export interface CustomerPrivacyConfig {
  duplicateCheckMobile: boolean;
  duplicateCheckAadhaar: boolean;
  consentMandatory: boolean;
  maskAadhaarByDefault: boolean;
  dataExportAdminOnly: boolean;
  retentionPolicy: string;
  declarationModes: Array<'Digital' | 'Printed'>;
  termsEditableByAdmin: string;
}

export interface UploadedDocumentItem {
  id: number;
  fileUuid: string;
  originalName: string;
  mimeType: 'application/pdf' | 'image/jpeg' | 'image/png';
  fileSizeBytes: number;
  category: string;
  uploadedBy: string;
  createdAt: string;
  status: 'active' | 'deleted';
}

export interface ApiIntegrationItem {
  channel: 'SMS' | 'EMAIL_SMTP' | 'WHATSAPP';
  providerName: string;
  endpointOrHost: string;
  senderOrFrom: string;
  isConfigured: boolean;
  hasSecret: boolean;
  lastTestedAt: string | null;
  lastTestStatus: 'Not Tested' | 'Connected' | 'Failed';
}

export interface DashboardPreferenceConfig {
  role: 'ADMIN' | 'MANAGER' | 'STAFF';
  defaultPeriod: 'Today' | 'This Week' | 'This Month';
  enabledWidgets: string[];
}

export interface ReportSettingsConfig {
  defaultExportFormat: 'PDF' | 'Excel' | 'CSV';
  autoDailyReportEnabled: boolean;
  autoReportTime: string;
}

export interface MaintenanceSettingsConfig {
  maintenanceMode: boolean;
  maintenanceMessage: string;
  debugMode?: boolean;
  errorAlertAdmin?: boolean;
  errorAlertManager?: boolean;
  lastHealthCheckAt?: string;
}

export interface MasterSettingsOverview {
  companyProfile: CompanyProfileSettings;
  globalConfig: GlobalConfiguration;
  userLanguage: LanguageCode;
  appearanceTheme: ThemeMode;
  securityPolicy: SecurityPolicyConfig;
  printSettings: PrintSettingsConfig;
  documentTemplates: DocumentTemplateItem[];
  paymentQrSettings: PaymentQrSettings;
  notificationTemplates: NotificationTemplateItem[];
  branches: BranchItem[];
  counters: CounterItem[];
  customerPrivacy: CustomerPrivacyConfig;
  dashboardPreferences: DashboardPreferenceConfig;
  reportSettings: ReportSettingsConfig;
  maintenanceSettings: MaintenanceSettingsConfig;
  documentCounters: DocumentCounterSnapshot[];
  pendingProposalsCount: number;
}

// ============================================================================
// Enterprise ERP Q1-51 Frontend Domain Types
// ============================================================================
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

export interface ErpCustomerItem {
  id: number;
  customerId: string;
  fullName: string;
  fatherOrHusbandName: string;
  dob: string;
  gender: 'Male' | 'Female' | 'Other';
  mobile: string;
  whatsapp: string;
  email: string;
  aadhaarMasked?: string;
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
  segment: 'Individual' | 'Corporate' | 'Government';
  crmTag: string;
  status: 'Active' | 'Inactive' | 'Blocked';
  verificationStatus: string;
  mobileOtpVerifiedAt: string | null;
  consents: CustomerConsentState[];
  consentHistory: Array<{
    id: number;
    category: ConsentCategoryKey;
    previousGranted: boolean;
    newGranted: boolean;
    actorUserId: string;
    method: string;
    notes: string;
    recordedAt: string;
  }>;
  contactHistory: Array<{
    id: number;
    field: 'mobile' | 'whatsapp';
    oldValue: string;
    newValue: string;
    verifiedByOtp: boolean;
    adminOverrideReason?: string;
    changedBy: string;
    changedAt: string;
  }>;
  notesAndFollowUps: Array<{
    id: number;
    type: 'INTERNAL_NOTE' | 'FOLLOW_UP';
    text: string;
    followUpDate?: string;
    status?: string;
    authorUserId: string;
    createdAt: string;
  }>;
  deletedAt: string | null;
  createdAt: string;
  stats?: {
    applicationCount: number;
    activeApplications: number;
    totalPaid: number;
    pendingBalance: number;
  };
}

export interface ServiceCategoryItem {
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
  createdAt?: string;
  updatedAt?: string;
}

export interface ServiceSubcategoryItem {
  id: number;
  code: string;
  categoryId: number;
  categoryName: string;
  name: string;
  description: string;
  displayOrder: number;
  status: 'active' | 'archived';
  createdBy?: string;
  updatedBy?: string;
  createdAt?: string;
  updatedAt?: string;
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
  minValue?: number;
  maxValue?: number;
  enabled: boolean;
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

export interface ErpServiceItem {
  id: number;
  serviceId: string;
  serviceCode: string;
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
  customerCharge: number;
  profitAmount: number;
  status: 'Active' | 'Inactive' | 'Temporarily Suspended' | 'Archived';
  availability: 'Available' | 'Unavailable';
  serviceInstructions?: string;
  termsAndConditions: string;
  displayOrder?: number;
  sla: {
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
  };
  requiredDocuments: ServiceRequiredDocumentDef[];
  currentFormVersion: number;
  formVersions: Array<{
    versionNo: number;
    publishedAt: string;
    publishedBy: string;
    status: 'published' | 'archived';
    fields: DynamicFormFieldDef[];
  }>;
  automationRules: Array<{
    id: string;
    name: string;
    trigger: string;
    conditionStatus?: string;
    actionType: string;
    actionParam: string;
    enabled: boolean;
    executionCount: number;
    lastRunAt: string | null;
  }>;
  applicationCount?: number;
  deletedAt: string | null;
  createdBy?: string;
  updatedBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ReferenceFieldDefItem {
  id: number;
  fieldKey: string;
  label: string;
  inputType: 'text' | 'number' | 'date';
  serviceId: string | 'ALL';
  required: boolean;
  uniqueScope: 'NONE' | 'GLOBAL' | 'PER_SERVICE';
  enabled: boolean;
}

export interface ErpApplicationDocumentItem {
  id: number;
  fileUuid: string;
  applicationNo: string;
  customerId: string;
  docKey: string;
  category: string;
  originalName: string;
  mimeType: 'application/pdf' | 'image/jpeg' | 'image/png';
  fileSizeBytes: number;
  verificationStatus: 'Pending' | 'Verified' | 'Rejected';
  rejectionReason?: string;
  verifiedBy?: string | null;
  verifiedAt?: string | null;
  versionNo: number;
  replacedFileUuid?: string | null;
  uploadedBy: string;
  uploadedAt: string;
}

export interface ErpPaymentItem {
  id: number;
  transactionId: string;
  receiptNo: string;
  invoiceNo?: string;
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
  recordedAt: string;
  notes: string;
}

export interface ErpRefundItem {
  id: number;
  refundId: string;
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
  createdAt: string;
  processedAt: string | null;
}

export interface ErpApplicationItem {
  id: number;
  applicationNo: string;
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
  mandatoryDocExceptionReason?: string | null;
  duplicateOverrideReason?: string | null;
  references: Array<{
    id: number;
    fieldKey: string;
    label: string;
    value: string;
    addedBy: string;
    updatedBy: string;
    updatedAt: string;
    history: Array<{
      previousValue: string;
      newValue: string;
      changedBy: string;
      changedAt: string;
      reason: string;
    }>;
  }>;
  statusHistory: Array<{
    id: number;
    previousStatus: ErpApplicationStatus | null;
    newStatus: ErpApplicationStatus;
    changedBy: string;
    changedByRole: RoleName;
    remarks: string;
    reason: string;
    changedAt: string;
  }>;
  assignmentHistory: Array<{
    id: number;
    previousStaffId: string | null;
    newStaffId: string | null;
    previousCounterCode: string | null;
    newCounterCode: string | null;
    assignedBy: string;
    reason: string;
    assignedAt: string;
  }>;
  checklistSummary: {
    requiredDocuments: number;
    optionalDocuments: number;
    uploadedDocuments: number;
    uploadedMandatoryCount: number;
    verifiedDocuments: number;
    pendingVerification: number;
    rejectedDocuments: number;
    missingCount: number;
    missingRequiredLabels: string[];
    isSubmissionReady: boolean;
  };
  slaStatus: {
    label: string;
    badge: 'success' | 'warning' | 'danger' | 'neutral';
  };
  documents: ErpApplicationDocumentItem[];
  financialSummary: {
    serviceCharge: number;
    serviceCost: number;
    profitAmount: number;
    totalPaid: number;
    totalRefunded: number;
    netCollected: number;
    balanceDue: number;
    paymentStatus: string;
  };
  payments: ErpPaymentItem[];
  refunds: ErpRefundItem[];
  followUps: Array<{
    id: number;
    applicationNo: string;
    followUpDate: string;
    followUpTime: string;
    reason: string;
    assignedStaffId: string;
    status: 'Pending' | 'Completed' | 'Rescheduled' | 'Cancelled';
    remarks: string;
    createdAt: string;
  }>;
  notes: Array<{
    id: number;
    applicationNo: string;
    noteType: 'INTERNAL' | 'CUSTOMER_REMARK';
    content: string;
    createdBy: string;
    createdAt: string;
  }>;
  delivery: {
    deliveryId: string;
    applicationNo?: string;
    deliverableType: string;
    deliverableDescription: string;
    deliveryMethod: string;
    deliveryDate: string;
    receivedBy: string;
    handoverConfirmed: boolean;
    acknowledgementRef: string;
    status: string;
    remarks: string;
  } | null;
  cancellations: Array<{
    requestCode: string;
    reason: string;
    requestedBy: string;
    status: 'Pending' | 'Approved' | 'Rejected';
    reviewedBy: string | null;
    createdAt: string;
  }>;
  reassignments: Array<{
    requestCode: string;
    applicationNo?: string;
    requestedBy: string;
    currentStaffId: string | null;
    proposedStaffId: string | null;
    proposedCounterCode: string | null;
    reason: string;
    status: 'Pending' | 'Approved' | 'Rejected';
    reviewedBy: string | null;
    createdAt: string;
  }>;
  notifications: ErpNotificationDispatchItem[];
  activities: Array<{
    id: number;
    actorUserId: string;
    action: string;
    applicationNo?: string;
    previousValue?: string;
    newValue?: string;
    reason?: string;
    createdAt: string;
  }>;
  archivedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ErpNotificationDispatchItem {
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

export interface ErpExpenseItem {
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

export interface ErpDashboardSummary {
  kpis: {
    totalCustomers: number;
    totalApplications: number;
    activeApplications: number;
    pendingApplications: number;
    completedApplications: number;
    rejectedOrCancelled: number;
    todayCollection: number;
    totalCollection: number;
    totalExpenses: number;
    netCashBalance: number;
  };
  reminders: {
    pendingFollowUps: number;
    missingOrPendingDocs: number;
    unassignedApplications: number;
    overdueSlaApplications: number;
    pendingReassignments: number;
    pendingCancellations: number;
  };
  recentApplications: ErpApplicationItem[];
  recentPayments: ErpPaymentItem[];
  recentNotifications: ErpNotificationDispatchItem[];
  applicationStatusBreakdown: Record<string, number>;
}

