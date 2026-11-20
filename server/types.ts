export type RoleName = 'ADMIN' | 'MANAGER' | 'STAFF' | 'AUDITOR' | 'CUSTOMER' | 'EMPLOYEE';

export type AccountStatus =
  | 'PENDING'
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'DEACTIVATED'
  | 'REJECTED';

export type PermissionType =
  | 'VIEW'
  | 'ADD'
  | 'EDIT'
  | 'DELETE'
  | 'PRINT'
  | 'EXPORT'
  | 'APPROVE'
  | 'REJECT'
  | 'ASSIGN'
  | 'EXECUTE'
  | 'FINANCIAL'
  | 'MANAGE';

export const ALL_PERMISSION_TYPES: PermissionType[] = [
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
];

export type ReportPermissionKey =
  | 'report.view'
  | 'report.create'
  | 'report.update'
  | 'report.delete'
  | 'report.export.pdf'
  | 'report.export.excel'
  | 'report.print'
  | 'report.schedule'
  | 'report.archive.view'
  | 'report.audit.view';

export type ModuleKey =
  | 'dashboard'
  | 'customers'
  | 'services'
  | 'applications'
  | 'transactions'
  | 'receipts'
  | 'invoices'
  | 'expenses'
  | 'daily_cash'
  | 'finance_engine'
  | 'employees'
  | 'products'
  | 'inventory'
  | 'documents'
  | 'notifications'
  | 'reports'
  | 'users'
  | 'roles'
  | 'permissions'
  | 'approvals'
  | 'approval_history'
  | 'security_logs'
  | 'settings'
  | 'settings_proposal'
  | 'service_rate_proposals'
  | 'csc_portal';

export type RegistrationStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CORRECTION_REQUIRED';

export type ServiceAssignmentStatus =
  | 'DRAFT'
  | 'PENDING_ADMIN_APPROVAL'
  | 'APPROVED'
  | 'ACTIVE'
  | 'REJECTED'
  | 'SUSPENDED'
  | 'REVOKED'
  | 'EXPIRED';

export interface ServerUser {
  id: number;
  userId: string; // Legacy seeded MC-AD-202613-0001 or canonical MCYYFFMMSSSS (e.g. MC2627110001)
  isMasterAdmin?: boolean;
  fullName: string;
  role: RoleName;
  mobile: string;
  email?: string;
  address: string;
  designation?: string;
  departmentCode?: string;
  joiningDate?: string;
  emergencyContact?: string;
  aadhaarEncrypted?: string;
  aadhaarLast4?: string;
  aadhaarConsentAt?: string;
  profilePhotoUrl?: string;
  passwordHash: string;
  passwordAlgo?: string;
  branch: string;
  status: AccountStatus;
  mobileVerified: boolean;
  emailVerified: boolean;
  failedLoginAttempts: number;
  lockedUntil: number | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  passwordChangedAt: string;
  /** Individual permission overrides: key = `${module}.${permission}` */
  customPermissions: Record<string, boolean>;
  /** Optional Phase 08 Custom Role definition code */
  customRoleCode?: string;
  /** Encrypted Base32 Google Authenticator (TOTP) secret (AES-256-GCM) */
  totpSecretEncrypted?: string;
  totpEnabled?: boolean;
  totpEnrolledAt?: string;
  lastTotpStepUsed?: number;
  recoveryCodeHashes?: string[];
  passwordMigrationRequired?: boolean;
  firebaseUid?: string;
}

export interface ServerSession {
  id: string;
  tokenHash: string;
  userId: string;
  role: RoleName;
  ipAddress: string;
  deviceInfo: string;
  deviceId?: string;
  lastActiveAt?: string;
  rotatedFromSessionId?: string;
  rememberMe: boolean;
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  createdAt: string;
  expiresAt: number;
  /** Server-side immutable upper bound (240 minutes for Remember Me) */
  maxAllowedExpiresAt: number;
  /** Short-lived window after password/OTP re-authentication for sensitive operations */
  reauthenticatedUntil?: number | null;
}

export interface OtpChallenge {
  id: string;
  target: string; // userId or mobile or email
  purpose: 'LOGIN_OTP' | 'MOBILE_VERIFICATION' | 'PASSWORD_RESET' | 'SENSITIVE_ACTION';
  channel?: 'EMAIL' | 'SMS' | 'WHATSAPP';
  otpHash: string;
  attempts: number;
  maxAttempts: number;
  resendAvailableAt: number;
  expiresAt: number;
  verified: boolean;
  userId?: string;
  rememberMe?: boolean;
}

export interface CaptchaChallenge {
  id: string;
  answerHash: string;
  expiresAt: number;
}

export type AuthChallengeStage = 'CAPTCHA' | 'SMS_OTP' | 'TOTP';

export interface AuthChallenge {
  id: string;
  userId: string;
  stage: AuthChallengeStage;
  rememberMe: boolean;
  ipAddress: string;
  userAgentHash: string;
  captchaVerifiedAt?: number;
  otpHash?: string;
  otpAttempts: number;
  otpMaxAttempts: number;
  otpExpiresAt?: number;
  otpResendAvailableAt?: number;
  otpVerifiedAt?: number;
  otpDeliveryStatus?: 'DELIVERED' | 'SANDBOX' | 'FAILED';
  totpAttempts: number;
  totpMaxAttempts: number;
  createdAt: number;
  expiresAt: number;
}

export interface RegistrationRequest {
  id: number;
  requestId: string;
  applicantName: string;
  requestedRole: RoleName;
  mobile: string;
  email?: string;
  address: string;
  designation?: string;
  departmentCode?: string;
  joiningDate?: string;
  emergencyContact?: string;
  aadhaarEncrypted?: string;
  aadhaarLast4?: string;
  aadhaarConsentAt?: string;
  passwordHash: string;
  mobileVerified: boolean;
  submittedBy: string;
  status: RegistrationStatus;
  reviewedBy?: string;
  approvalDate?: string;
  reviewNotes?: string;
  issuedUserId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DepartmentRecord {
  id: number;
  code: string;
  name: string;
  description: string;
  headUserId?: string;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: string;
  updatedAt: string;
}

export interface ManagerServiceAssignment {
  id: number;
  assignmentCode: string;
  managerUserId: string;
  serviceId: string;
  serviceName: string;
  departmentCode: string;
  permissions: PermissionType[];
  assignedByAdmin: string;
  assignedAt: string;
  effectiveDate: string;
  expiryDate: string | null;
  notes?: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED' | 'EXPIRED';
  updatedAt: string;
}

export interface StaffServiceRequest {
  id: number;
  requestCode: string;
  managerUserId: string;
  staffUserId: string;
  managerAssignmentCode: string;
  serviceId: string;
  serviceName: string;
  departmentCode: string;
  requestedPermissions: PermissionType[];
  reason: string;
  status: 'DRAFT' | 'PENDING_ADMIN_APPROVAL' | 'APPROVED' | 'REJECTED';
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StaffServicePermission {
  id: number;
  permissionCode: string;
  staffUserId: string;
  managerUserId: string;
  managerAssignmentCode: string;
  requestCode: string;
  serviceId: string;
  serviceName: string;
  departmentCode: string;
  permissions: PermissionType[];
  approvedByAdmin: string;
  effectiveDate: string;
  expiryDate: string | null;
  status: ServiceAssignmentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceApprovalLog {
  id: number;
  logCode: string;
  actorUserId: string;
  actorRole: RoleName | 'SYSTEM';
  action: string;
  targetType: 'MANAGER_ASSIGNMENT' | 'STAFF_REQUEST' | 'STAFF_PERMISSION';
  targetCode: string;
  staffUserId?: string;
  managerUserId?: string;
  serviceId: string;
  previousStatus: string | null;
  newStatus: string;
  details: string;
  createdAt: string;
}

export interface Phase02NotificationRecord {
  id: number;
  notificationCode: string;
  triggerType: string;
  recipientUserId: string;
  title: string;
  message: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  isRead: boolean;
  createdAt: string;
}

export interface SecurityLogRecord {
  id: number;
  actorUserId: string;
  targetUserId?: string;
  eventType:
    | 'LOGIN_SUCCESS'
    | 'LOGIN_FAILED'
    | 'LOGOUT'
    | 'OTP_SENT'
    | 'OTP_VERIFIED'
    | 'OTP_FAILED'
    | 'CAPTCHA_FAILED'
    | 'TOTP_ENROLLED'
    | 'TOTP_VERIFIED'
    | 'TOTP_FAILED'
    | 'RECOVERY_USED'
    | 'AUTHENTICATOR_RESET'
    | 'SESSION_CREATED'
    | 'PASSWORD_CHANGED'
    | 'PASSWORD_RESET'
    | 'ACCOUNT_LOCKED'
    | 'ACCOUNT_STATUS_CHANGED'
    | 'USER_CREATED'
    | 'PROFILE_UPDATED'
    | 'PERMISSION_CHANGED'
    | 'SESSION_REVOKED'
    | 'SESSION_EXPIRED'
    | 'REAUTH_SUCCESS'
    | 'REAUTH_FAILED'
    | 'DEVICE_VERIFIED'
    | 'DEVICE_APPROVED'
    | 'DEVICE_REVOKED'
    | 'MANAGER_SERVICE_ASSIGNED'
    | 'STAFF_SERVICE_REQUESTED'
    | 'SERVICE_PERMISSION_APPROVED'
    | 'SERVICE_PERMISSION_REJECTED'
    | 'SERVICE_PERMISSION_REVOKED'
    | 'UNAUTHORIZED_ACCESS';
  result: 'SUCCESS' | 'FAILURE' | 'BLOCKED';
  ipAddress: string;
  deviceInfo: string;
  summary: string;
  createdAt: string;
}

export interface AuditLogRecord {
  id: number;
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  details: string;
  beforeValues?: Record<string, unknown> | null;
  afterValues?: Record<string, unknown> | null;
  ipAddress: string;
  createdAt: string;
}

export interface PermissionHistoryRecord {
  id: number;
  actorUserId: string;
  targetUserId: string;
  permissionKey: string;
  previousValue: boolean;
  newValue: boolean;
  createdAt: string;
}
