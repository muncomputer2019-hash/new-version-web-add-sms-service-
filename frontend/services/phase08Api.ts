import { securityRequest } from './securityApi';

export type OtpChannel = 'EMAIL' | 'SMS' | 'WHATSAPP';

export interface Phase08DashboardPayload {
  settings: {
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
  };
  kpis: {
    activeUsersCount: number;
    lockedUsersCount: number;
    activeSessionsCount: number;
    registeredDevicesCount: number;
    pendingDevicesCount: number;
    suspiciousDevicesCount: number;
    openAlertsCount: number;
    criticalAlertsCount: number;
    openIncidentsCount: number;
    totalBackupsCount: number;
    auditEntriesCount: number;
    auditChainValid: boolean;
    softDeletedPendingCount: number;
  };
  otpChannels: Record<OtpChannel, { configured: boolean; detail: string }>;
  recentAlerts: SecurityAlertItem[];
  recentIncidents: SecurityIncidentItem[];
  recentBackups: Phase08BackupItem[];
  health: SystemHealthData;
  adminNotifications: Array<{
    id: number;
    event: string;
    severity: string;
    title: string;
    message: string;
    channelsAttempted: Array<{ channel: string; status: string }>;
    createdAt: string;
  }>;
}

export interface SecurityAlertItem {
  alertCode: string;
  category: string;
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

export interface SecurityIncidentItem {
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

export interface RegisteredDeviceItem {
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

export interface OtpLogItem {
  id: number;
  challengeId: string;
  userId?: string;
  purpose: string;
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

export interface TamperAuditEntry {
  id: number;
  auditUuid: string;
  userId: string;
  userRole: string;
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

export interface CustomRoleItem {
  roleCode: string;
  roleName: string;
  baseRole: 'MANAGER' | 'STAFF' | 'AUDITOR';
  description: string;
  permissions: Record<string, boolean>;
  status: 'ACTIVE' | 'ARCHIVED';
  createdBy: string;
  createdAt: string;
}

export interface PermissionGroupItem {
  groupCode: string;
  groupName: string;
  description: string;
  permissions: Record<string, boolean>;
  createdBy: string;
  createdAt: string;
}

export interface TemporaryPermissionItem {
  grantCode: string;
  userId: string;
  permissionKey: string;
  reason: string;
  grantedBy: string;
  expiresAt: string;
  status: 'ACTIVE' | 'EXPIRED' | 'REVOKED';
  createdAt: string;
}

export interface PermissionChangeRequestItem {
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

export interface BackupScheduleItem {
  scheduleCode: string;
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'FINANCIAL_YEAR';
  runTimeIst: string;
  includeModules: string[];
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string;
  lastStatus: 'NEVER_RUN' | 'SUCCESS' | 'PARTIAL' | 'FAILED';
  retryCount: number;
}

export interface BackupStorageLocationItem {
  storageCode: 'PRIMARY_DB' | 'CLOUD_STORAGE' | 'SECONDARY_STORAGE';
  providerName: string;
  endpointOrPath: string;
  isConfigured: boolean;
  hasCredentials: boolean;
  connectionStatus: 'CONNECTED' | 'NOT_CONFIGURED' | 'ERROR';
  capacityLimitMb: number;
  usedMb: number;
  lastVerifiedAt: string | null;
}

export interface Phase08BackupItem {
  backupCode: string;
  frequency: string;
  financialYear: string;
  versionNo: number;
  keyVersion: string;
  encryptionAlgo: 'AES-256-GCM';
  signatureAlgo: 'HMAC-SHA256';
  checksumSha256: string;
  signatureHmac: string;
  fileSizeBytes: number;
  recordCounts: Record<string, number>;
  storageResults: Array<{
    storageCode: string;
    locationLabel: string;
    status: 'UPLOADED' | 'NOT_CONFIGURED' | 'FAILED';
    detail: string;
    verifiedAt: string | null;
  }>;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'RESTORED';
  integrityStatus: 'VERIFIED' | 'FAILED' | 'PENDING';
  permanentRetention: true;
  failureReason?: string;
  triggeredBy: string;
  startedAt: string;
  completedAt: string;
}

export interface EncryptionKeyItem {
  keyVersion: string;
  algorithm: 'AES-256-GCM';
  status: 'ACTIVE' | 'RETIRED_DECRYPT_ONLY';
  createdAt: string;
  rotatedAt: string | null;
  createdBy: string;
}

export interface RestorePreviewItem {
  previewId: string;
  backupCode: string;
  versionNo: number;
  financialYear: string;
  keyVersion: string;
  integrityVerified: boolean;
  checksumSha256: string;
  signatureVerified: boolean;
  decryptionVerified: boolean;
  scope: string;
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
}

export interface RestoreHistoryItem {
  restoreCode: string;
  backupCode: string;
  scope: string;
  safetyBackupCode: string;
  status: 'COMPLETED' | 'FAILED';
  failureReason?: string;
  executedBy: string;
  executedAt: string;
}

export interface DeletedRecordEntry {
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

export interface SystemHealthData {
  checkedAt: string;
  appVersion: string;
  overallStatus: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  database: {
    status: string;
    mysqlConfigured: boolean;
    activeStoresHealthy: boolean;
    totalRecordsProtected: number;
  };
  storage: {
    status: string;
    primaryUsedMb: number;
    secondaryUsedMb: number;
    capacityLimitMb: number;
    usagePct: number;
    cloudConfigured: boolean;
  };
  backup: {
    status: string;
    lastSuccessfulBackupAt: string | null;
    lastFailedBackupAt: string | null;
    totalVersionsRetained: number;
    retentionPolicy: string;
  };
  api: {
    status: string;
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

export const phase08Api = {
  getDashboard: () => securityRequest<Phase08DashboardPayload>('/api/v1/security/dashboard'),
  getSettings: () => securityRequest<{ settings: Phase08DashboardPayload['settings']; otpChannels: Phase08DashboardPayload['otpChannels'] }>('/api/v1/security/settings'),
  updateSettings: (payload: Record<string, unknown>) =>
    securityRequest('/api/v1/security/settings', { method: 'PUT', body: JSON.stringify(payload) }),

  getDevices: () => securityRequest<RegisteredDeviceItem[]>('/api/v1/security/devices'),
  verifyDevice: (deviceId: string, userId?: string) =>
    securityRequest(`/api/v1/security/devices/${deviceId}/verify`, { method: 'POST', body: JSON.stringify({ userId }) }),
  markDeviceSuspicious: (deviceId: string) =>
    securityRequest(`/api/v1/security/devices/${deviceId}/suspicious`, { method: 'POST', body: '{}' }),
  revokeDevice: (deviceId: string) =>
    securityRequest(`/api/v1/security/devices/${deviceId}/revoke`, { method: 'POST', body: '{}' }),
  getOtpLogs: () => securityRequest<OtpLogItem[]>('/api/v1/security/otp-logs'),

  emergencyLockUser: (userId: string, reason: string) =>
    securityRequest(`/api/v1/security/emergency/lock-user/${userId}`, { method: 'POST', body: JSON.stringify({ reason }) }),
  emergencyRevokeSessions: (userId: string) =>
    securityRequest(`/api/v1/security/emergency/revoke-all-sessions/${userId}`, { method: 'POST', body: '{}' }),

  getAuditChain: (params?: Record<string, string>) => {
    const qs = params ? new URLSearchParams(Object.entries(params).filter(([, v]) => Boolean(v))).toString() : '';
    return securityRequest<{
      entries: TamperAuditEntry[];
      total: number;
      integrity: { valid: boolean; totalEntriesChecked: number; brokenEntryUuid: string | null };
    }>(`/api/v1/security/audit-chain${qs ? `?${qs}` : ''}`);
  },
  verifyAuditChain: () =>
    securityRequest<{ valid: boolean; totalEntriesChecked: number; brokenEntryUuid: string | null }>(
      '/api/v1/security/audit-chain/verify',
      { method: 'POST', body: '{}' }
    ),

  getCustomRoles: () => securityRequest<CustomRoleItem[]>('/api/v1/security/custom-roles'),
  createCustomRole: (payload: Record<string, unknown>) =>
    securityRequest<CustomRoleItem>('/api/v1/security/custom-roles', { method: 'POST', body: JSON.stringify(payload) }),
  assignCustomRole: (roleCode: string, userId: string) =>
    securityRequest(`/api/v1/security/custom-roles/${roleCode}/assign`, { method: 'POST', body: JSON.stringify({ userId }) }),
  getPermissionGroups: () => securityRequest<PermissionGroupItem[]>('/api/v1/security/permission-groups'),
  applyPermissionGroup: (groupCode: string, userId: string) =>
    securityRequest(`/api/v1/security/permission-groups/${groupCode}/apply`, { method: 'POST', body: JSON.stringify({ userId }) }),
  getTemporaryPermissions: () => securityRequest<TemporaryPermissionItem[]>('/api/v1/security/temporary-permissions'),
  grantTemporaryPermission: (payload: Record<string, unknown>) =>
    securityRequest<TemporaryPermissionItem>('/api/v1/security/temporary-permissions', { method: 'POST', body: JSON.stringify(payload) }),
  revokeTemporaryPermission: (grantCode: string) =>
    securityRequest(`/api/v1/security/temporary-permissions/${grantCode}/revoke`, { method: 'POST', body: '{}' }),
  getPermissionRequests: () => securityRequest<PermissionChangeRequestItem[]>('/api/v1/security/permission-requests'),
  submitPermissionRequest: (payload: Record<string, unknown>) =>
    securityRequest<PermissionChangeRequestItem>('/api/v1/security/permission-requests', { method: 'POST', body: JSON.stringify(payload) }),
  reviewPermissionRequest: (requestCode: string, approve: boolean, notes: string) =>
    securityRequest(`/api/v1/security/permission-requests/${requestCode}/review`, {
      method: 'POST',
      body: JSON.stringify({ approve, notes }),
    }),

  getBackupSchedules: () => securityRequest<BackupScheduleItem[]>('/api/v1/security/backups/schedules'),
  updateBackupSchedule: (scheduleCode: string, payload: Record<string, unknown>) =>
    securityRequest(`/api/v1/security/backups/schedules/${scheduleCode}`, { method: 'PUT', body: JSON.stringify(payload) }),
  runBackupSchedule: (scheduleCode: string) =>
    securityRequest<Phase08BackupItem>(`/api/v1/security/backups/schedules/${scheduleCode}/run`, { method: 'POST', body: '{}' }),
  getBackupStorage: () => securityRequest<BackupStorageLocationItem[]>('/api/v1/security/backups/storage'),
  configureCloudStorage: (payload: Record<string, unknown>) =>
    securityRequest<BackupStorageLocationItem>('/api/v1/security/backups/storage/cloud', { method: 'PUT', body: JSON.stringify(payload) }),
  createBackupSnapshot: (frequency = 'MANUAL') =>
    securityRequest<Phase08BackupItem>('/api/v1/security/backups/create', { method: 'POST', body: JSON.stringify({ frequency }) }),
  getBackupHistory: () =>
    securityRequest<{ backups: Phase08BackupItem[]; integrityLogs: unknown[]; retentionPolicy: string }>('/api/v1/security/backups/history'),
  verifyBackup: (backupCode: string) =>
    securityRequest<{ verified: boolean }>(`/api/v1/security/backups/${backupCode}/verify`, { method: 'POST', body: '{}' }),
  compareBackups: (base: string, target: string) =>
    securityRequest<{
      base: { backupCode: string; versionNo: number; keyVersion: string; completedAt: string };
      target: { backupCode: string; versionNo: number; keyVersion: string; completedAt: string };
      diffs: Array<{ metric: string; baseCount: number; targetCount: number; delta: number }>;
    }>(`/api/v1/security/backups/compare?base=${encodeURIComponent(base)}&target=${encodeURIComponent(target)}`),
  getEncryptionKeys: () => securityRequest<EncryptionKeyItem[]>('/api/v1/security/encryption/keys'),
  rotateEncryptionKey: () =>
    securityRequest<{ activeKey: EncryptionKeyItem; keyRing: EncryptionKeyItem[] }>('/api/v1/security/encryption/rotate', {
      method: 'POST',
      body: '{}',
    }),

  getRestoreHistory: () => securityRequest<RestoreHistoryItem[]>('/api/v1/security/restore/history'),
  previewRestore: (backupCode: string, scope: string) =>
    securityRequest<RestorePreviewItem>('/api/v1/security/restore/preview', {
      method: 'POST',
      body: JSON.stringify({ backupCode, scope }),
    }),
  executeRestore: (payload: { backupCode: string; previewId: string; scope: string; confirmationText: string }) =>
    securityRequest<RestoreHistoryItem>('/api/v1/security/restore/execute', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getDeletedRecords: () =>
    securityRequest<{
      deletedRecords: DeletedRecordEntry[];
      recoveryLogs: Array<{ id: number; deletionCode: string; action: string; actorUserId: string; reason: string; createdAt: string }>;
    }>('/api/v1/security/recovery/deleted'),
  softDeleteRecord: (payload: { entityType: string; entityId: string; reason: string }) =>
    securityRequest<DeletedRecordEntry>('/api/v1/security/recovery/soft-delete', { method: 'POST', body: JSON.stringify(payload) }),
  recoverRecord: (deletionCode: string, reason: string) =>
    securityRequest<DeletedRecordEntry>(`/api/v1/security/recovery/${deletionCode}/restore`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  requestPermanentDelete: (deletionCode: string, reason: string) =>
    securityRequest<DeletedRecordEntry>(`/api/v1/security/recovery/${deletionCode}/permanent-request`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  reviewPermanentDelete: (deletionCode: string, approve: boolean, reason: string) =>
    securityRequest<DeletedRecordEntry>(`/api/v1/security/recovery/${deletionCode}/permanent-review`, {
      method: 'POST',
      body: JSON.stringify({ approve, reason }),
    }),

  getAlerts: () => securityRequest<SecurityAlertItem[]>('/api/v1/security/alerts'),
  acknowledgeAlert: (alertCode: string) =>
    securityRequest<SecurityAlertItem>(`/api/v1/security/alerts/${alertCode}/acknowledge`, { method: 'POST', body: '{}' }),
  resolveAlert: (alertCode: string, notes: string) =>
    securityRequest<SecurityAlertItem>(`/api/v1/security/alerts/${alertCode}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    }),

  getIncidents: () => securityRequest<SecurityIncidentItem[]>('/api/v1/security/incidents'),
  createIncident: (payload: Record<string, unknown>) =>
    securityRequest<SecurityIncidentItem>('/api/v1/security/incidents', { method: 'POST', body: JSON.stringify(payload) }),
  updateIncident: (incidentCode: string, payload: Record<string, unknown>) =>
    securityRequest<SecurityIncidentItem>(`/api/v1/security/incidents/${incidentCode}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
};
