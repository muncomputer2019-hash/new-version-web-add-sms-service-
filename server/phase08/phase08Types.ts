import { RoleName } from '../types.js';

export type OtpChannel = 'EMAIL' | 'SMS' | 'WHATSAPP';

export type GranularActionKey =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'approve'
  | 'reject'
  | 'export'
  | 'print'
  | 'download'
  | 'share';

export interface Phase08SecuritySettings {
  loginSecurityMode: 'OTP+PASSWORD+CAPTCHA';
  twoFactorChannels: OtpChannel[];
  passwordPolicyMode: 'Strong';
  passwordMinLength: number;
  passwordExpiryDays: number;
  passwordHistoryCount: number;
  maxFailedLoginAttempts: number;
  accountLockoutMinutes: number;
  otpExpirySeconds: number;
  otpMaxAttempts: number;
  otpResendCooldownSeconds: number;
  otpMaxResendsPerHour: number;
  maxConcurrentSessions: number;
  activeEncryptionKeyVersion: string;
  backupRetentionPolicy: 'PERMANENT_VERSIONED';
  restoreAuthority: 'ADMIN_ONLY';
  updatedBy: string;
  updatedAt: string;
}

export interface OtpVerificationLogRecord {
  id: number;
  challengeId: string;
  userId?: string;
  purpose: 'LOGIN_OTP' | 'MOBILE_VERIFICATION' | 'PASSWORD_RESET' | 'NEW_DEVICE_VERIFY' | 'SENSITIVE_ACTION';
  channel: OtpChannel;
  maskedTarget: string;
  providerConfigured: boolean;
  deliveryStatus: 'DELIVERED' | 'FAILED' | 'NOT_CONFIGURED';
  deliveryDetail: string;
  attemptsUsed: number;
  outcome: 'PENDING' | 'VERIFIED' | 'FAILED' | 'EXPIRED' | 'LOCKED';
  ipAddress: string;
  deviceId: string;
  createdAt: string;
  verifiedAt: string | null;
}

export interface RegisteredDeviceRecord {
  deviceId: string;
  userId: string;
  deviceName: string;
  browserInfo: string;
  osInfo: string;
  lastIp: string;
  verificationStatus: 'TRUSTED' | 'PENDING_VERIFICATION' | 'SUSPICIOUS' | 'REVOKED';
  firstSeenAt: string;
  lastActiveAt: string;
  verifiedBy: string | null;
  verifiedAt: string | null;
}

export interface CustomRoleDefinition {
  roleCode: string;
  roleName: string;
  baseRole: Exclude<RoleName, 'ADMIN'>;
  description: string;
  permissions: Record<string, boolean>;
  status: 'ACTIVE' | 'ARCHIVED';
  createdBy: string;
  createdAt: string;
}

export interface PermissionGroupDefinition {
  groupCode: string;
  groupName: string;
  description: string;
  permissions: Record<string, boolean>;
  createdBy: string;
  createdAt: string;
}

export interface TemporaryPermissionGrant {
  grantCode: string;
  userId: string;
  permissionKey: string;
  reason: string;
  grantedBy: string;
  expiresAt: string;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  createdAt: string;
}

export interface PermissionChangeRequest {
  requestCode: string;
  targetUserId: string;
  proposedPermissions: Record<string, boolean>;
  reason: string;
  proposedBy: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewedBy: string | null;
  reviewNotes: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface TamperEvidentAuditEntry {
  id: number;
  auditUuid: string;
  userId: string;
  userRole: RoleName | 'SYSTEM' | 'GUEST';
  actionType: string;
  module: string;
  recordId: string;
  beforeValues: Record<string, unknown> | null;
  afterValues: Record<string, unknown> | null;
  ipAddress: string;
  deviceInfo: string;
  actionResult: 'SUCCESS' | 'FAILURE' | 'BLOCKED';
  previousHash: string;
  entryHash: string;
  createdAt: string;
}

export type BackupScheduleFrequency = 'MANUAL' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'FINANCIAL_YEAR' | 'PRE_RESTORE_SAFETY';
export type BackupStorageTier = 'PRIMARY_DB' | 'CLOUD_STORAGE' | 'SECONDARY_STORAGE';

export interface BackupScheduleConfig {
  scheduleCode: string;
  frequency: Exclude<BackupScheduleFrequency, 'MANUAL' | 'PRE_RESTORE_SAFETY'>;
  runTimeIst: string;
  includeModules: string[];
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string;
  lastStatus: 'NEVER_RUN' | 'SUCCESS' | 'PARTIAL' | 'FAILED';
  retryCount: number;
}

export interface BackupStorageLocationConfig {
  storageCode: BackupStorageTier;
  providerName: string;
  endpointOrPath: string;
  isConfigured: boolean;
  hasCredentials: boolean;
  connectionStatus: 'CONNECTED' | 'NOT_CONFIGURED' | 'ERROR';
  capacityLimitMb: number;
  usedMb: number;
  lastVerifiedAt: string | null;
}

export interface BackupStorageReplicaResult {
  storageCode: BackupStorageTier;
  locationLabel: string;
  status: 'UPLOADED' | 'NOT_CONFIGURED' | 'FAILED';
  detail: string;
  verifiedAt: string | null;
}

export interface Phase08BackupRecord {
  backupCode: string;
  frequency: BackupScheduleFrequency;
  financialYear: string;
  versionNo: number;
  keyVersion: string;
  encryptionAlgo: 'AES-256-GCM';
  signatureAlgo: 'HMAC-SHA256';
  checksumSha256: string;
  signatureHmac: string;
  fileSizeBytes: number;
  recordCounts: {
    users: number;
    customers: number;
    services: number;
    applications: number;
    payments: number;
    expenses: number;
    journalVouchers: number;
    chartOfAccounts: number;
    uploadedDocuments: number;
    reportArchives: number;
    auditLogs: number;
  };
  storageResults: BackupStorageReplicaResult[];
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'RESTORED';
  integrityStatus: 'VERIFIED' | 'FAILED' | 'PENDING';
  permanentRetention: true;
  failureReason?: string;
  triggeredBy: string;
  startedAt: string;
  completedAt: string;
  primaryPath?: string;
  secondaryPath?: string;
  cloudObjectKey?: string;
}

export interface BackupIntegrityLogRecord {
  id: number;
  backupCode: string;
  checkType: 'CREATION' | 'REPLICATION' | 'SCHEDULED_AUDIT' | 'PRE_RESTORE' | 'MANUAL_VERIFY';
  checksumMatch: boolean;
  signatureMatch: boolean;
  decryptionOk: boolean;
  checkedBy: string;
  notes: string;
  checkedAt: string;
}

export type RestoreScopeKey =
  | 'FULL'
  | 'CUSTOMERS'
  | 'APPLICATIONS'
  | 'FINANCE'
  | 'CONFIGURATION'
  | 'DOCUMENTS'
  | 'REPORT_ARCHIVES';

export interface RestorePreviewPayload {
  previewId: string;
  backupCode: string;
  versionNo: number;
  financialYear: string;
  keyVersion: string;
  integrityVerified: boolean;
  checksumSha256: string;
  signatureVerified: boolean;
  decryptionVerified: boolean;
  scope: RestoreScopeKey;
  affectedRecords: {
    customers: { inBackup: number; currentLive: number; toRestore: number };
    applications: { inBackup: number; currentLive: number; toRestore: number };
    financeVouchers: { inBackup: number; currentLive: number; duplicateSkipped: number; toRestore: number };
    configurationModules: number;
    uploadedDocuments: number;
    reportArchives: number;
  };
  warnings: string[];
  generatedAt: string;
  expiresAt: number;
}

export interface RestoreHistoryRecord {
  restoreCode: string;
  backupCode: string;
  scope: RestoreScopeKey;
  safetyBackupCode: string;
  affectedSummary: Record<string, unknown>;
  status: 'COMPLETED' | 'FAILED';
  failureReason?: string;
  executedBy: string;
  executedAt: string;
}

export interface DeletedRecordItem {
  deletionCode: string;
  entityType: 'CUSTOMER' | 'APPLICATION' | 'SERVICE' | 'DOCUMENT' | 'REPORT_TEMPLATE';
  entityId: string;
  displayLabel: string;
  deletionReason: string;
  deletedBy: string;
  deletedAt: string;
  recoveryStatus: 'SOFT_DELETED' | 'RECOVERED' | 'PENDING_PERMANENT_DELETE' | 'PERMANENTLY_DELETED';
  recoveredBy: string | null;
  recoveredAt: string | null;
  permanentDeleteRequestedBy: string | null;
  permanentDeleteApprovedBy: string | null;
  permanentDeleteApprovedAt: string | null;
}

export interface SecurityAlertRecord {
  alertCode: string;
  category:
    | 'MULTIPLE_FAILED_LOGINS'
    | 'ACCOUNT_LOCKOUT'
    | 'UNAUTHORIZED_ACCESS'
    | 'NEW_DEVICE_LOGIN'
    | 'SUSPICIOUS_EXPORT'
    | 'BACKUP_STATUS'
    | 'ENCRYPTION_INTEGRITY'
    | 'RESTORE_OPERATION'
    | 'SECURITY_INCIDENT';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  description: string;
  relatedUserId?: string;
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
  acknowledgedBy: string | null;
  resolvedBy: string | null;
  resolutionNotes: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface SecurityIncidentRecord {
  incidentCode: string;
  category: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  description: string;
  reportedBy: string;
  assignedTo: string | null;
  investigationStatus: 'OPEN' | 'INVESTIGATING' | 'CONTAINED' | 'RESOLVED' | 'CLOSED';
  resolutionNotes: string;
  createdAt: string;
  updatedAt: string;
}

export interface EncryptionKeyRingEntry {
  keyVersion: string;
  algorithm: 'AES-256-GCM';
  status: 'ACTIVE' | 'RETIRED_DECRYPT_ONLY';
  createdAt: string;
  rotatedAt: string | null;
  createdBy: string;
}

export interface SystemHealthReport {
  checkedAt: string;
  appVersion: string;
  overallStatus: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  database: {
    status: 'HEALTHY' | 'WARNING';
    mysqlConfigured: boolean;
    activeStoresHealthy: boolean;
    totalRecordsProtected: number;
  };
  storage: {
    status: 'HEALTHY' | 'WARNING';
    primaryUsedMb: number;
    secondaryUsedMb: number;
    capacityLimitMb: number;
    usagePct: number;
    cloudConfigured: boolean;
  };
  backup: {
    status: 'HEALTHY' | 'WARNING';
    lastSuccessfulBackupAt: string | null;
    lastFailedBackupAt: string | null;
    totalVersionsRetained: number;
    retentionPolicy: 'PERMANENT_VERSIONED';
  };
  api: {
    status: 'HEALTHY';
    uptimeSeconds: number;
    activeSessionsCount: number;
    openCriticalAlerts: number;
  };
  versionHistory: Array<{
    version: string;
    phase: string;
    date: string;
    notes: string;
  }>;
}
