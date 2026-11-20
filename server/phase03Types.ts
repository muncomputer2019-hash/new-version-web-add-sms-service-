export type LanguageCode = 'en' | 'bn' | 'hi';
export type ThemeMode = 'light' | 'dark';
export type DocumentType =
  | 'RECEIPT'
  | 'INVOICE'
  | 'APPLICATION'
  | 'CUSTOMER'
  | 'SERVICE'
  | 'DELIVERY'
  | 'REFUND';
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
  encryptedPayload?: string;
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
  debugMode: boolean;
  errorAlertAdmin: boolean;
  errorAlertManager: boolean;
  lastHealthCheckAt: string;
}
