import {
  AuditLogRecord,
  AuthChallenge,
  CaptchaChallenge,
  DepartmentRecord,
  ManagerServiceAssignment,
  ModuleKey,
  OtpChallenge,
  PermissionHistoryRecord,
  PermissionType,
  Phase02NotificationRecord,
  RegistrationRequest,
  RoleName,
  SecurityLogRecord,
  ServerSession,
  ServerUser,
  ServiceApprovalLog,
  StaffServicePermission,
  StaffServiceRequest,
} from './types.js';
import { encryptSensitiveField } from './crypto.js';
import { UserIdSequenceService } from './sequenceService.js';
import { syncSecurityLogToFirebase } from './firebaseAdminDb.js';

// Precomputed bcrypt-12 hashes avoid 3.5s+ synchronous hashing during serverless cold starts
const SEEDED_HASHES = {
  admin: '$2b$12$2C9hr8IoNWCd9Wz6Q4bCjuZIo.ZdK2kLJTR6vJv.A97OKSmFxlZzS',
  manager: '$2b$12$vbMzIFmcbZQv4vd4WIXrfevD8gh5uXu39cIuy9CrWETO1z9v5ByXe',
  staff: '$2b$12$Qd/jdi2Uc9wywD0L6M2anOU1WDPKHEPmN9QEm/PHTRjT24t32Ox3C',
  auditor: '$2b$12$lqX9Q0o8vVqeoG5Zue/snuJP8mefV1LMPW.E311jMMOsFwL5kuKty',
  customer: '$2b$12$7S6nRj.Y2CSIEFU3pYhxTekVsJAH4ACrarqk6qktdQ.OFhj.Og69q',
  tempStaff: '$2b$12$Yrb1uSQyk1.gmwLxm4ZYK.Yeiul8VB0aJWp99Ok3zDpLmEVd7Kg7O',
};

export const MAX_REMEMBER_ME_MS = 4 * 60 * 60 * 1000; // Exactly 240 minutes (4 hours)

export const ALL_MODULES: ModuleKey[] = [
  'dashboard',
  'customers',
  'services',
  'applications',
  'transactions',
  'receipts',
  'invoices',
  'expenses',
  'daily_cash',
  'finance_engine',
  'employees',
  'products',
  'inventory',
  'documents',
  'notifications',
  'reports',
  'users',
  'roles',
  'permissions',
  'approvals',
  'approval_history',
  'security_logs',
  'settings',
  'settings_proposal',
  'service_rate_proposals',
  'csc_portal',
];

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

/**
 * Default Three Primary Operational Roles + Read-Only Auditor + Isolated Customer Matrix
 */
export const ROLE_PERMISSION_MATRIX: Record<RoleName, Record<ModuleKey, PermissionType[]>> = {
  ADMIN: {
    dashboard: ['VIEW', 'EXPORT', 'PRINT', 'MANAGE'],
    customers: ['VIEW', 'ADD', 'EDIT', 'DELETE', 'PRINT', 'EXPORT', 'MANAGE'],
    services: ['VIEW', 'ADD', 'EDIT', 'DELETE', 'APPROVE', 'REJECT', 'ASSIGN', 'EXECUTE', 'FINANCIAL', 'MANAGE'],
    applications: ['VIEW', 'ADD', 'EDIT', 'DELETE', 'PRINT', 'EXPORT', 'APPROVE', 'REJECT', 'ASSIGN', 'EXECUTE', 'MANAGE'],
    transactions: ['VIEW', 'ADD', 'EDIT', 'DELETE', 'PRINT', 'EXPORT', 'FINANCIAL', 'MANAGE'],
    receipts: ['VIEW', 'ADD', 'EDIT', 'DELETE', 'PRINT', 'EXPORT', 'FINANCIAL'],
    invoices: ['VIEW', 'ADD', 'EDIT', 'DELETE', 'PRINT', 'EXPORT', 'FINANCIAL'],
    expenses: ['VIEW', 'ADD', 'EDIT', 'DELETE', 'PRINT', 'EXPORT', 'APPROVE', 'REJECT', 'FINANCIAL'],
    daily_cash: ['VIEW', 'ADD', 'EDIT', 'DELETE', 'PRINT', 'EXPORT', 'APPROVE', 'REJECT', 'FINANCIAL'],
    finance_engine: ['VIEW', 'ADD', 'EDIT', 'DELETE', 'PRINT', 'EXPORT', 'APPROVE', 'REJECT', 'FINANCIAL', 'MANAGE'],
    employees: ['VIEW', 'ADD', 'EDIT', 'DELETE', 'PRINT', 'EXPORT', 'APPROVE', 'REJECT', 'FINANCIAL', 'MANAGE'],
    products: ['VIEW', 'ADD', 'EDIT', 'DELETE', 'PRINT', 'EXPORT', 'FINANCIAL'],
    inventory: ['VIEW', 'ADD', 'EDIT', 'DELETE', 'PRINT', 'EXPORT', 'FINANCIAL'],
    documents: ['VIEW', 'ADD', 'EDIT', 'DELETE', 'PRINT', 'EXPORT', 'APPROVE', 'REJECT'],
    notifications: ['VIEW', 'ADD', 'EDIT', 'DELETE', 'MANAGE'],
    reports: ['VIEW', 'PRINT', 'EXPORT', 'FINANCIAL', 'MANAGE'],
    users: ['VIEW', 'ADD', 'EDIT', 'DELETE', 'APPROVE', 'REJECT', 'MANAGE'],
    roles: ['VIEW', 'EDIT', 'ASSIGN', 'MANAGE'],
    permissions: ['VIEW', 'EDIT', 'APPROVE', 'REJECT', 'ASSIGN', 'MANAGE'],
    approvals: ['VIEW', 'APPROVE', 'REJECT', 'MANAGE'],
    approval_history: ['VIEW', 'EXPORT'],
    security_logs: ['VIEW', 'EXPORT', 'MANAGE'],
    settings: ['VIEW', 'EDIT', 'MANAGE'],
    settings_proposal: ['VIEW', 'ADD', 'APPROVE', 'REJECT'],
    service_rate_proposals: ['VIEW', 'ADD', 'APPROVE', 'REJECT'],
    csc_portal: ['VIEW', 'MANAGE'],
  },
  MANAGER: {
    dashboard: ['VIEW', 'PRINT'],
    customers: ['VIEW', 'ADD', 'EDIT', 'PRINT', 'EXPORT'],
    services: ['VIEW', 'ASSIGN', 'EXECUTE'],
    applications: ['VIEW', 'ADD', 'EDIT', 'PRINT', 'APPROVE', 'REJECT', 'ASSIGN', 'EXECUTE'],
    transactions: ['VIEW', 'PRINT'],
    receipts: ['VIEW', 'ADD', 'PRINT'],
    invoices: ['VIEW', 'ADD', 'PRINT'],
    expenses: ['VIEW', 'ADD', 'PRINT'],
    daily_cash: ['VIEW', 'ADD', 'PRINT'],
    finance_engine: ['VIEW', 'ADD', 'PRINT', 'EXPORT'],
    employees: ['VIEW', 'PRINT'],
    products: ['VIEW', 'ADD', 'EDIT'],
    inventory: ['VIEW', 'ADD', 'EDIT'],
    documents: ['VIEW', 'ADD', 'PRINT', 'APPROVE', 'REJECT'],
    notifications: ['VIEW'],
    reports: ['VIEW', 'PRINT', 'EXPORT'],
    users: ['VIEW', 'ADD', 'EDIT'], // Staff-only in assigned department (enforced in controller)
    roles: ['VIEW'],
    permissions: ['VIEW', 'ASSIGN'], // Can submit Staff service requests, never self-approve
    approvals: ['VIEW', 'APPROVE'],
    approval_history: ['VIEW'],
    security_logs: ['VIEW'],
    settings: [],
    settings_proposal: ['VIEW', 'ADD'],
    service_rate_proposals: ['VIEW', 'ADD'],
    csc_portal: [],
  },
  STAFF: {
    dashboard: ['VIEW'],
    customers: ['VIEW', 'ADD'],
    services: ['VIEW', 'EXECUTE'],
    applications: ['VIEW', 'ADD', 'EDIT', 'EXECUTE'],
    transactions: [],
    receipts: ['VIEW', 'ADD', 'PRINT'],
    invoices: ['VIEW', 'PRINT'],
    expenses: [],
    daily_cash: ['VIEW', 'ADD'],
    finance_engine: ['VIEW'],
    employees: [],
    products: ['VIEW'],
    inventory: ['VIEW'],
    documents: ['VIEW', 'ADD'],
    notifications: ['VIEW'],
    reports: [],
    users: [],
    roles: [],
    permissions: [],
    approvals: [],
    approval_history: [],
    security_logs: [],
    settings: [],
    settings_proposal: [],
    service_rate_proposals: [],
    csc_portal: [],
  },
  EMPLOYEE: {
    dashboard: ['VIEW'],
    customers: ['VIEW'],
    services: ['VIEW'],
    applications: ['VIEW', 'EXECUTE'],
    transactions: [],
    receipts: ['VIEW'],
    invoices: ['VIEW'],
    expenses: [],
    daily_cash: [],
    finance_engine: [],
    employees: [],
    products: ['VIEW'],
    inventory: ['VIEW'],
    documents: ['VIEW'],
    notifications: ['VIEW'],
    reports: [],
    users: [],
    roles: [],
    permissions: [],
    approvals: [],
    approval_history: [],
    security_logs: [],
    settings: [],
    settings_proposal: [],
    service_rate_proposals: [],
    csc_portal: [],
  },
  AUDITOR: {
    dashboard: ['VIEW', 'PRINT'],
    customers: ['VIEW'],
    services: ['VIEW'],
    applications: ['VIEW'],
    transactions: ['VIEW', 'PRINT', 'EXPORT'],
    receipts: ['VIEW', 'PRINT'],
    invoices: ['VIEW', 'PRINT'],
    expenses: ['VIEW', 'PRINT'],
    daily_cash: ['VIEW', 'PRINT'],
    finance_engine: ['VIEW', 'PRINT', 'EXPORT'],
    employees: ['VIEW'],
    products: ['VIEW'],
    inventory: ['VIEW'],
    documents: ['VIEW'],
    notifications: ['VIEW'],
    reports: ['VIEW', 'PRINT', 'EXPORT'],
    users: ['VIEW'],
    roles: ['VIEW'],
    permissions: ['VIEW'],
    approvals: ['VIEW'],
    approval_history: ['VIEW', 'EXPORT'],
    security_logs: ['VIEW', 'EXPORT'],
    settings: ['VIEW'],
    settings_proposal: ['VIEW'],
    service_rate_proposals: ['VIEW'],
    csc_portal: [],
  },
  CUSTOMER: {
    dashboard: ['VIEW'],
    customers: [],
    services: ['VIEW'],
    applications: [],
    transactions: [],
    receipts: [],
    invoices: [],
    expenses: [],
    daily_cash: [],
    finance_engine: [],
    employees: [],
    products: [],
    inventory: [],
    documents: [],
    notifications: ['VIEW'],
    reports: [],
    users: [],
    roles: [],
    permissions: [],
    approvals: [],
    approval_history: [],
    security_logs: [],
    settings: [],
    settings_proposal: [],
    service_rate_proposals: [],
    csc_portal: ['VIEW'],
  },
};

export const REPORT_PERMISSION_KEYS = [
  'report.view',
  'report.create',
  'report.update',
  'report.delete',
  'report.export.pdf',
  'report.export.excel',
  'report.print',
  'report.schedule',
  'report.archive.view',
  'report.audit.view',
] as const;

export type ReportGranularPermissionKey = (typeof REPORT_PERMISSION_KEYS)[number];

export const CSC_OPERATOR_PERMISSION_KEYS = [
  'csc.customerReg',
  'csc.orderCreate',
  'csc.appEntry',
  'csc.docUpload',
  'csc.paymentEntry',
  'csc.receiptPrint',
  'csc.statusUpdate',
  'csc.pvcOrderEntry',
  'csc.customerSearch',
  'csc.reportView',
  'csc.rateEdit',
] as const;

export const DEFAULT_REPORT_PERMISSION_MATRIX: Record<
  RoleName,
  Record<ReportGranularPermissionKey, boolean>
> = {
  ADMIN: {
    'report.view': true,
    'report.create': true,
    'report.update': true,
    'report.delete': true,
    'report.export.pdf': true,
    'report.export.excel': true,
    'report.print': true,
    'report.schedule': true,
    'report.archive.view': true,
    'report.audit.view': true,
  },
  MANAGER: {
    'report.view': true,
    'report.create': true,
    'report.update': true,
    'report.delete': false,
    'report.export.pdf': true,
    'report.export.excel': true,
    'report.print': true,
    'report.schedule': false,
    'report.archive.view': true,
    'report.audit.view': false,
  },
  STAFF: {
    'report.view': false,
    'report.create': false,
    'report.update': false,
    'report.delete': false,
    'report.export.pdf': false,
    'report.export.excel': false,
    'report.print': false,
    'report.schedule': false,
    'report.archive.view': false,
    'report.audit.view': false,
  },
  EMPLOYEE: {
    'report.view': false,
    'report.create': false,
    'report.update': false,
    'report.delete': false,
    'report.export.pdf': false,
    'report.export.excel': false,
    'report.print': false,
    'report.schedule': false,
    'report.archive.view': false,
    'report.audit.view': false,
  },
  AUDITOR: {
    'report.view': true,
    'report.create': false,
    'report.update': false,
    'report.delete': false,
    'report.export.pdf': true,
    'report.export.excel': true,
    'report.print': true,
    'report.schedule': false,
    'report.archive.view': true,
    'report.audit.view': true,
  },
  CUSTOMER: {
    'report.view': false,
    'report.create': false,
    'report.update': false,
    'report.delete': false,
    'report.export.pdf': false,
    'report.export.excel': false,
    'report.print': false,
    'report.schedule': false,
    'report.archive.view': false,
    'report.audit.view': false,
  },
};

export interface SecurityStoreOptions {
  sessionTtlMs?: number;
  rememberMeTtlMs?: number;
  otpTtlMs?: number;
  otpResendCooldownMs?: number;
  maxFailedAttempts?: number;
  lockDurationMs?: number;
}

export class SecurityStore {
  public readonly sequenceService = new UserIdSequenceService({
    companyPrefix: 'MC',
    serialPadding: 4,
  });

  public readonly users: ServerUser[] = [];
  public readonly sessions = new Map<string, ServerSession>(); // keyed by tokenHash
  public readonly revokedTokenHashes = new Set<string>();
  public readonly otpChallenges = new Map<string, OtpChallenge>();
  public readonly captchaChallenges = new Map<string, CaptchaChallenge>();
  public readonly usedCaptchaNonces = new Set<string>();
  public readonly authChallenges = new Map<string, AuthChallenge>();
  public readonly registrationRequests: RegistrationRequest[] = [];
  public readonly securityLogs: SecurityLogRecord[] = [];
  public readonly auditLogs: AuditLogRecord[] = [];
  public readonly permissionHistory: PermissionHistoryRecord[] = [];
  public readonly rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

  // Phase 02 Final Master: Departments & 3-Tier Service RBAC
  public readonly departments: DepartmentRecord[] = [];
  public readonly managerServiceAssignments: ManagerServiceAssignment[] = [];
  public readonly staffServiceRequests: StaffServiceRequest[] = [];
  public readonly staffServicePermissions: StaffServicePermission[] = [];
  public readonly serviceApprovalLogs: ServiceApprovalLog[] = [];
  public readonly phase02Notifications: Phase02NotificationRecord[] = [];

  public readonly sessionTtlMs: number;
  public readonly rememberMeTtlMs: number;
  public readonly otpTtlMs: number;
  public readonly otpResendCooldownMs: number;
  public readonly maxFailedAttempts: number;
  public readonly lockDurationMs: number;

  private nextUserNumericId = 1;
  private nextRequestNumericId = 1;
  private nextLogId = 1;
  private nextSvcSeq = 1;

  constructor(options: SecurityStoreOptions = {}) {
    this.sessionTtlMs = options.sessionTtlMs ?? 60 * 60 * 1000; // 60 minutes standard/idle window
    // Remember Me is strictly capped at 240 minutes (4 hours) max server-side
    this.rememberMeTtlMs = Math.min(
      options.rememberMeTtlMs ?? MAX_REMEMBER_ME_MS,
      MAX_REMEMBER_ME_MS
    );
    this.otpTtlMs = options.otpTtlMs ?? 5 * 60 * 1000; // 5 minutes
    this.otpResendCooldownMs = options.otpResendCooldownMs ?? 30 * 1000; // 30s
    this.maxFailedAttempts = options.maxFailedAttempts ?? 5;
    this.lockDurationMs = options.lockDurationMs ?? 3 * 60 * 1000; // 3 minutes lockout

    this.seedInitialData();
  }

  private seedInitialData(): void {
    const now = new Date().toISOString();

    this.departments.push(
      {
        id: 1,
        code: 'DEPT-ADMIN',
        name: 'Executive Administration',
        description: 'Master Admin, Security Governance & System Configuration',
        headUserId: 'MC2627110001',
        status: 'ACTIVE',
        createdAt: '2026-01-01T09:00:00.000Z',
        updatedAt: now,
      },
      {
        id: 2,
        code: 'DEPT-CSC',
        name: 'CSC & Citizen Services',
        description: 'Digital Service Center services, e-KYC, Certificates & PVC Printing',
        headUserId: 'MC2627110002',
        status: 'ACTIVE',
        createdAt: '2026-01-01T09:00:00.000Z',
        updatedAt: now,
      },
      {
        id: 3,
        code: 'DEPT-FIN',
        name: 'Finance & CSP Banking',
        description: 'GL Accounting, GST Compliance, Daily Cash & PNB CSP Operations',
        headUserId: 'MC2627110001',
        status: 'ACTIVE',
        createdAt: '2026-01-01T09:00:00.000Z',
        updatedAt: now,
      },
      {
        id: 4,
        code: 'DEPT-LEGAL',
        name: 'Grievance, RTI & Legal',
        description: 'CPGRAMS, RTI Appeals, Tax Filings & Regulatory Notices',
        headUserId: 'MC2627110002',
        status: 'ACTIVE',
        createdAt: '2026-01-01T09:00:00.000Z',
        updatedAt: now,
      },
      {
        id: 5,
        code: 'DEPT-OPS',
        name: 'Front-Desk Operations',
        description: 'Intake Counter, Document Verification & Customer Delivery',
        headUserId: 'MC2627110002',
        status: 'ACTIVE',
        createdAt: '2026-01-01T09:00:00.000Z',
        updatedAt: now,
      }
    );

    const adminUser: ServerUser = {
      id: this.nextUserNumericId++,
      userId: 'MC2627110001',
      isMasterAdmin: true,
      fullName: 'Mamun Reja',
      role: 'ADMIN',
      mobile: '+918101352105',
      email: 'admin@muncomputer.local',
      address: 'Head Office, Level 3, Dhaka',
      designation: 'Managing Director & System Owner',
      departmentCode: 'DEPT-ADMIN',
      joiningDate: '2026-01-01',
      emergencyContact: '+8801700000099',
      aadhaarEncrypted: encryptSensitiveField('458912349876'),
      aadhaarLast4: '9876',
      aadhaarConsentAt: '2026-01-01T09:00:00.000Z',
      passwordHash: SEEDED_HASHES.admin,
      passwordAlgo: 'bcrypt-12',
      branch: 'Main Service Center',
      status: 'ACTIVE',
      mobileVerified: true,
      emailVerified: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
      createdBy: null,
      createdAt: '2026-01-01T09:00:00.000Z',
      updatedAt: now,
      passwordChangedAt: '2026-01-01T09:00:00.000Z',
      customPermissions: {},
    };

    const managerUser: ServerUser = {
      id: this.nextUserNumericId++,
      userId: 'MC2627110002',
      isMasterAdmin: false,
      fullName: 'Nadia Sultana',
      role: 'MANAGER',
      mobile: '+8801711000002',
      email: 'manager@muncomputer.local',
      address: 'Operations Wing, Sector 7',
      designation: 'Center Operations Manager',
      departmentCode: 'DEPT-CSC',
      joiningDate: '2026-02-10',
      emergencyContact: '+8801711000092',
      passwordHash: SEEDED_HASHES.manager,
      passwordAlgo: 'bcrypt-12',
      branch: 'Main Service Center',
      status: 'ACTIVE',
      mobileVerified: true,
      emailVerified: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
      createdBy: 'MC2627110001',
      createdAt: '2026-02-10T10:30:00.000Z',
      updatedAt: now,
      passwordChangedAt: '2026-02-10T10:30:00.000Z',
      customPermissions: {},
    };

    const staffUser: ServerUser = {
      id: this.nextUserNumericId++,
      userId: 'MC2627110003',
      isMasterAdmin: false,
      fullName: 'Rashed Khan',
      role: 'STAFF',
      mobile: '+8801812000003',
      email: 'staff@muncomputer.local',
      address: 'Service Counter 02',
      designation: 'Senior CSC Counter Operator',
      departmentCode: 'DEPT-CSC',
      joiningDate: '2026-03-05',
      emergencyContact: '+8801812000093',
      passwordHash: SEEDED_HASHES.staff,
      passwordAlgo: 'bcrypt-12',
      branch: 'Main Service Center',
      status: 'ACTIVE',
      mobileVerified: true,
      emailVerified: false,
      failedLoginAttempts: 0,
      lockedUntil: null,
      createdBy: 'MC2627110002',
      createdAt: '2026-03-05T11:15:00.000Z',
      updatedAt: now,
      passwordChangedAt: '2026-03-05T11:15:00.000Z',
      customPermissions: {},
    };

    const auditorUser: ServerUser = {
      id: this.nextUserNumericId++,
      userId: 'MC2627110004',
      isMasterAdmin: false,
      fullName: 'Subrata Mukherjee (CA Auditor)',
      role: 'AUDITOR',
      mobile: '+8801812000004',
      email: 'auditor@muncomputer.local',
      address: 'Statutory Audit & Compliance Desk',
      designation: 'Statutory Read-Only Auditor',
      departmentCode: 'DEPT-FIN',
      joiningDate: '2026-04-01',
      passwordHash: SEEDED_HASHES.auditor,
      passwordAlgo: 'bcrypt-12',
      branch: 'Main Service Center',
      status: 'ACTIVE',
      mobileVerified: true,
      emailVerified: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
      createdBy: 'MC2627110001',
      createdAt: '2026-04-01T10:00:00.000Z',
      updatedAt: now,
      passwordChangedAt: '2026-04-01T10:00:00.000Z',
      customPermissions: {},
    };

    const customerUser: ServerUser = {
      id: this.nextUserNumericId++,
      userId: 'MC2627110005',
      isMasterAdmin: false,
      fullName: 'Ananya Sen (Citizen Portal)',
      role: 'CUSTOMER',
      mobile: '+919830001122',
      email: 'customer@muncomputer.local',
      address: 'Ward 4, Baharampur, Murshidabad',
      designation: 'Citizen Portal Member',
      departmentCode: 'DEPT-CSC',
      joiningDate: '2026-04-05',
      passwordHash: SEEDED_HASHES.customer,
      passwordAlgo: 'bcrypt-12',
      branch: 'Citizen Self-Service Portal',
      status: 'ACTIVE',
      mobileVerified: true,
      emailVerified: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
      createdBy: 'MC2627110001',
      createdAt: '2026-04-05T10:00:00.000Z',
      updatedAt: now,
      passwordChangedAt: '2026-04-05T10:00:00.000Z',
      customPermissions: {},
    };

    this.users.push(adminUser, managerUser, staffUser, auditorUser, customerUser);

    this.sequenceService.seedExisting('MC2627110001', 'ADMIN', 2026, 1, 11);
    this.sequenceService.seedExisting('MC2627110002', 'MANAGER', 2026, 2, 11);
    this.sequenceService.seedExisting('MC2627110003', 'STAFF', 2026, 3, 11);
    this.sequenceService.seedExisting('MC2627110004', 'AUDITOR', 2026, 4, 11);
    this.sequenceService.seedExisting('MC2627110005', 'CUSTOMER', 2026, 5, 11);

    this.registrationRequests.push(
      {
        id: this.nextRequestNumericId++,
        requestId: 'REQ-2026-0001',
        applicantName: 'Tanvir Ahmed',
        requestedRole: 'STAFF',
        mobile: '+8801915004411',
        email: 'tanvir.ahmed@muncomputer.local',
        address: 'Block C, Mirpur Road',
        designation: 'CSC Intake Operator',
        departmentCode: 'DEPT-CSC',
        joiningDate: '2026-11-18',
        passwordHash: SEEDED_HASHES.tempStaff,
        mobileVerified: true,
        submittedBy: 'MC2627110002',
        status: 'PENDING',
        createdAt: '2026-11-15T14:20:00.000Z',
        updatedAt: '2026-11-15T14:20:00.000Z',
      },
      {
        id: this.nextRequestNumericId++,
        requestId: 'REQ-2026-0002',
        applicantName: 'Farhana Akter',
        requestedRole: 'STAFF',
        mobile: '+8801675008822',
        email: 'farhana@muncomputer.local',
        address: 'House 14, Station Road',
        designation: 'Document Verification Assistant',
        departmentCode: 'DEPT-OPS',
        joiningDate: '2026-11-18',
        passwordHash: SEEDED_HASHES.tempStaff,
        mobileVerified: true,
        submittedBy: 'MC2627110002',
        status: 'PENDING',
        createdAt: '2026-11-16T09:45:00.000Z',
        updatedAt: '2026-11-16T09:45:00.000Z',
      }
    );

    // Seed initial governed service assignments for Demo Manager & Demo Staff (preserving ERP baseline workflows)
    const demoServices = [
      { id: 'MCS-2026-27-000001', name: 'New Passport Application Assistance', dept: 'DEPT-CSC' },
      { id: 'MCS-2026-27-000002', name: 'PAN Card New / Correction (NSDL)', dept: 'DEPT-CSC' },
      { id: 'MCS-2026-27-000003', name: 'Aadhaar Address & Demographic Update', dept: 'DEPT-CSC' },
      { id: 'MCS-2026-27-000004', name: 'Income & Caste Certificate', dept: 'DEPT-LEGAL' },
    ];
    for (const svc of demoServices) {
      const msa = this.assignServiceToManager({
        actor: adminUser,
        managerUserId: managerUser.userId,
        serviceId: svc.id,
        serviceName: svc.name,
        departmentCode: svc.dept,
        permissions: ['VIEW', 'ADD', 'EDIT', 'PRINT', 'APPROVE', 'ASSIGN', 'EXECUTE'],
        effectiveDate: '2026-04-01',
        expiryDate: null,
        notes: 'Baseline center operational service assignment.',
      });
      const sReq = this.submitStaffServiceRequest({
        actor: managerUser,
        staffUserId: staffUser.userId,
        serviceId: svc.id,
        requestedPermissions: ['VIEW', 'ADD', 'EDIT', 'PRINT', 'EXECUTE'],
        reason: 'Baseline counter intake allocation',
      });
      this.decideStaffServiceRequest({
        actor: adminUser,
        requestCode: sReq.requestCode,
        approve: true,
        notes: 'Initial counter approval by Master Admin.',
      });
      void msa;
    }

    this.addSecurityLog({
      actorUserId: 'MC2627110001',
      eventType: 'LOGIN_SUCCESS',
      result: 'SUCCESS',
      ipAddress: '127.0.0.1',
      deviceInfo: 'System Initialization',
      summary: 'Initial Master Admin identity MC2627110001 provisioned.',
    });
  }

  private externalPermissionResolver?: (userId: string, customRoleCode?: string) => Record<string, boolean>;

  public setExternalPermissionResolver(
    resolver: (userId: string, customRoleCode?: string) => Record<string, boolean>
  ): void {
    this.externalPermissionResolver = resolver;
  }

  public findUserByUserId(userId: string): ServerUser | undefined {
    const raw = userId.trim().toUpperCase();
    const normalized = raw === 'MC262711001' ? 'MC2627110001' : raw;
    return this.users.find((u) => u.userId.toUpperCase() === normalized);
  }

  public findUserByNumericId(id: number): ServerUser | undefined {
    return this.users.find((u) => u.id === id);
  }

  public isMasterAdminUser(user: ServerUser): boolean {
    return Boolean(
      user.isMasterAdmin ||
        user.userId === 'MC2627110001' ||
        user.userId === 'MC262711001' ||
        user.userId === 'MC-AD-202613-0001'
    );
  }

  public getEffectivePermissions(user: ServerUser): Record<string, boolean> {
    const roleMatrix = ROLE_PERMISSION_MATRIX[user.role];
    const effective: Record<string, boolean> = {};

    for (const mod of ALL_MODULES) {
      const allowed = roleMatrix[mod] ?? [];
      for (const perm of ALL_PERMISSION_TYPES) {
        const key = `${mod}.${perm}`;
        if (Object.prototype.hasOwnProperty.call(user.customPermissions, key)) {
          effective[key] = Boolean(user.customPermissions[key]);
        } else {
          effective[key] = allowed.includes(perm);
        }
      }
    }

    const reportDefaults = DEFAULT_REPORT_PERMISSION_MATRIX[user.role];
    for (const rKey of REPORT_PERMISSION_KEYS) {
      if (Object.prototype.hasOwnProperty.call(user.customPermissions, rKey)) {
        effective[rKey] = Boolean(user.customPermissions[rKey]);
      } else {
        effective[rKey] = Boolean(reportDefaults?.[rKey]);
      }
    }

    for (const cKey of CSC_OPERATOR_PERMISSION_KEYS) {
      if (Object.prototype.hasOwnProperty.call(user.customPermissions, cKey)) {
        effective[cKey] = Boolean(user.customPermissions[cKey]);
      } else if (user.role === 'ADMIN') {
        effective[cKey] = true;
      } else if (user.role === 'MANAGER' || user.role === 'STAFF') {
        effective[cKey] = cKey !== 'csc.rateEdit' && cKey !== 'csc.reportView';
      } else {
        effective[cKey] = cKey === 'csc.reportView' && user.role === 'AUDITOR';
      }
    }

    // Merge Phase 08 Custom Role & Active Temporary Permissions
    if (this.externalPermissionResolver) {
      const extra = this.externalPermissionResolver(user.userId, user.customRoleCode);
      for (const [k, v] of Object.entries(extra)) {
        if (v) effective[k] = true;
      }
    }

    return effective;
  }

  public hasPermission(
    user: ServerUser,
    moduleKey: ModuleKey,
    permission: PermissionType
  ): boolean {
    if (user.status !== 'ACTIVE') return false;
    if (user.role === 'ADMIN') {
      return true;
    }
    const effective = this.getEffectivePermissions(user);
    return Boolean(effective[`${moduleKey}.${permission}`]);
  }

  public hasReportPermission(
    user: ServerUser,
    permissionKey: ReportGranularPermissionKey
  ): boolean {
    if (user.status !== 'ACTIVE') return false;
    if (user.role === 'ADMIN') {
      return true;
    }
    const effective = this.getEffectivePermissions(user);
    return Boolean(effective[permissionKey]);
  }

  // ============================================================================
  // PHASE 02 FINAL MASTER: ADMIN -> MANAGER -> STAFF SERVICE WORKFLOW
  // ============================================================================
  public expireStaleServicePermissions(nowDate = new Date()): void {
    const today = nowDate.toISOString().slice(0, 10);
    for (const msa of this.managerServiceAssignments) {
      if (msa.status === 'ACTIVE' && msa.expiryDate && msa.expiryDate < today) {
        const prev = msa.status;
        msa.status = 'EXPIRED';
        msa.updatedAt = nowDate.toISOString();
        this.recordServiceApprovalLog({
          actorUserId: 'SYSTEM',
          actorRole: 'SYSTEM',
          action: 'MANAGER_ASSIGNMENT_EXPIRED',
          targetType: 'MANAGER_ASSIGNMENT',
          targetCode: msa.assignmentCode,
          managerUserId: msa.managerUserId,
          serviceId: msa.serviceId,
          previousStatus: prev,
          newStatus: 'EXPIRED',
          details: `Manager service assignment ${msa.assignmentCode} expired on ${msa.expiryDate}.`,
        });
        this.cascadeManagerAssignmentChange(msa, 'EXPIRED', 'SYSTEM');
      }
    }

    for (const ssp of this.staffServicePermissions) {
      if ((ssp.status === 'ACTIVE' || ssp.status === 'APPROVED') && ssp.expiryDate && ssp.expiryDate < today) {
        const prev = ssp.status;
        ssp.status = 'EXPIRED';
        ssp.updatedAt = nowDate.toISOString();
        this.recordServiceApprovalLog({
          actorUserId: 'SYSTEM',
          actorRole: 'SYSTEM',
          action: 'STAFF_PERMISSION_EXPIRED',
          targetType: 'STAFF_PERMISSION',
          targetCode: ssp.permissionCode,
          staffUserId: ssp.staffUserId,
          managerUserId: ssp.managerUserId,
          serviceId: ssp.serviceId,
          previousStatus: prev,
          newStatus: 'EXPIRED',
          details: `Staff service permission ${ssp.permissionCode} expired on ${ssp.expiryDate}.`,
        });
      }
    }
  }

  private cascadeManagerAssignmentChange(
    msa: ManagerServiceAssignment,
    targetStatus: 'SUSPENDED' | 'REVOKED' | 'EXPIRED',
    actorUserId: string
  ): number {
    let cascadedCount = 0;
    const nowIso = new Date().toISOString();
    for (const ssp of this.staffServicePermissions) {
      if (
        ssp.managerAssignmentCode === msa.assignmentCode &&
        (ssp.status === 'ACTIVE' || ssp.status === 'APPROVED')
      ) {
        const prev = ssp.status;
        ssp.status = targetStatus;
        ssp.updatedAt = nowIso;
        cascadedCount += 1;
        this.recordServiceApprovalLog({
          actorUserId,
          actorRole: actorUserId === 'SYSTEM' ? 'SYSTEM' : 'ADMIN',
          action: `CASCADE_STAFF_PERMISSION_${targetStatus}`,
          targetType: 'STAFF_PERMISSION',
          targetCode: ssp.permissionCode,
          staffUserId: ssp.staffUserId,
          managerUserId: ssp.managerUserId,
          serviceId: ssp.serviceId,
          previousStatus: prev,
          newStatus: targetStatus,
          details: `Cascaded ${targetStatus} to ${ssp.staffUserId} because Manager assignment ${msa.assignmentCode} changed to ${targetStatus}.`,
        });
        this.addPhase02Notification({
          triggerType: 'SERVICE_PERMISSION_REVOKED',
          recipientUserId: ssp.staffUserId,
          title: `Service Access ${targetStatus}: ${ssp.serviceName}`,
          message: `Access to ${ssp.serviceId} was automatically ${targetStatus.toLowerCase()} following Manager assignment update.`,
          severity: 'WARNING',
        });
      }
    }
    return cascadedCount;
  }

  public assignServiceToManager(params: {
    actor: ServerUser;
    managerUserId: string;
    serviceId: string;
    serviceName: string;
    departmentCode: string;
    permissions: PermissionType[];
    effectiveDate?: string;
    expiryDate?: string | null;
    notes?: string;
  }): ManagerServiceAssignment {
    if (params.actor.role !== 'ADMIN') {
      throw new Error('Only Admin can assign services to Managers.');
    }
    const mgr = this.findUserByUserId(params.managerUserId);
    if (!mgr || mgr.role !== 'MANAGER') {
      throw new Error('Target user must be a valid MANAGER.');
    }

    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    const validPerms = params.permissions.filter((p) => ALL_PERMISSION_TYPES.includes(p));
    const perms: PermissionType[] = validPerms.length > 0 ? validPerms : ['VIEW', 'ASSIGN', 'EXECUTE'];

    const existing = this.managerServiceAssignments.find(
      (a) => a.managerUserId === mgr.userId && a.serviceId === params.serviceId
    );
    if (existing) {
      const prevStatus = existing.status;
      existing.serviceName = params.serviceName;
      existing.departmentCode = params.departmentCode;
      existing.permissions = perms;
      existing.effectiveDate = params.effectiveDate || today;
      existing.expiryDate = params.expiryDate ?? null;
      existing.notes = params.notes;
      existing.status = 'ACTIVE';
      existing.assignedByAdmin = params.actor.userId;
      existing.updatedAt = now;

      this.recordServiceApprovalLog({
        actorUserId: params.actor.userId,
        actorRole: 'ADMIN',
        action: 'UPDATE_MANAGER_SERVICE_ASSIGNMENT',
        targetType: 'MANAGER_ASSIGNMENT',
        targetCode: existing.assignmentCode,
        managerUserId: mgr.userId,
        serviceId: params.serviceId,
        previousStatus: prevStatus,
        newStatus: 'ACTIVE',
        details: `Admin re-assigned ${params.serviceId} (${perms.join(', ')}) to Manager ${mgr.userId}.`,
      });
      return existing;
    }

    const assignment: ManagerServiceAssignment = {
      id: this.nextSvcSeq,
      assignmentCode: `MSA-2026-${String(this.nextSvcSeq++).padStart(4, '0')}`,
      managerUserId: mgr.userId,
      serviceId: params.serviceId,
      serviceName: params.serviceName,
      departmentCode: params.departmentCode,
      permissions: perms,
      assignedByAdmin: params.actor.userId,
      assignedAt: now,
      effectiveDate: params.effectiveDate || today,
      expiryDate: params.expiryDate ?? null,
      notes: params.notes,
      status: 'ACTIVE',
      updatedAt: now,
    };

    this.managerServiceAssignments.unshift(assignment);
    this.recordServiceApprovalLog({
      actorUserId: params.actor.userId,
      actorRole: 'ADMIN',
      action: 'ASSIGN_SERVICE_TO_MANAGER',
      targetType: 'MANAGER_ASSIGNMENT',
      targetCode: assignment.assignmentCode,
      managerUserId: mgr.userId,
      serviceId: params.serviceId,
      previousStatus: null,
      newStatus: 'ACTIVE',
      details: `Assigned service ${params.serviceId} (${params.serviceName}) to Manager ${mgr.userId}.`,
    });
    this.addPhase02Notification({
      triggerType: 'SERVICE_ASSIGNED_TO_MANAGER',
      recipientUserId: mgr.userId,
      title: `Service Assigned: ${params.serviceName}`,
      message: `Admin assigned ${params.serviceId} (${params.departmentCode}) to your operational scope.`,
      severity: 'INFO',
    });
    return assignment;
  }

  public updateManagerServiceAssignmentStatus(params: {
    actor: ServerUser;
    assignmentCode: string;
    status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
    reason?: string;
  }): { assignment: ManagerServiceAssignment; cascadedStaffCount: number } {
    if (params.actor.role !== 'ADMIN') {
      throw new Error('Only Admin can modify Manager service assignments.');
    }
    const msa = this.managerServiceAssignments.find(
      (a) => a.assignmentCode === params.assignmentCode
    );
    if (!msa) {
      throw new Error('Manager service assignment not found.');
    }
    const prev = msa.status;
    msa.status = params.status;
    msa.updatedAt = new Date().toISOString();

    this.recordServiceApprovalLog({
      actorUserId: params.actor.userId,
      actorRole: 'ADMIN',
      action: `MANAGER_ASSIGNMENT_${params.status}`,
      targetType: 'MANAGER_ASSIGNMENT',
      targetCode: msa.assignmentCode,
      managerUserId: msa.managerUserId,
      serviceId: msa.serviceId,
      previousStatus: prev,
      newStatus: params.status,
      details: params.reason || `Manager assignment ${msa.assignmentCode} updated to ${params.status}.`,
    });

    let cascadedStaffCount = 0;
    if (params.status === 'SUSPENDED' || params.status === 'REVOKED') {
      cascadedStaffCount = this.cascadeManagerAssignmentChange(
        msa,
        params.status,
        params.actor.userId
      );
    }

    return { assignment: msa, cascadedStaffCount };
  }

  public submitStaffServiceRequest(params: {
    actor: ServerUser;
    staffUserId: string;
    serviceId: string;
    requestedPermissions: PermissionType[];
    reason?: string;
  }): StaffServiceRequest {
    if (params.actor.role !== 'MANAGER') {
      throw new Error('Only a Manager can submit Staff service permission requests.');
    }
    this.expireStaleServicePermissions();

    const staff = this.findUserByUserId(params.staffUserId);
    if (!staff || staff.role !== 'STAFF') {
      throw new Error('Target user must be an active STAFF account.');
    }

    const today = new Date().toISOString().slice(0, 10);
    const managerAssignment = this.managerServiceAssignments.find(
      (a) =>
        a.managerUserId === params.actor.userId &&
        a.serviceId === params.serviceId &&
        a.status === 'ACTIVE' &&
        a.effectiveDate <= today &&
        (!a.expiryDate || a.expiryDate >= today)
    );

    if (!managerAssignment) {
      throw new Error(
        `Manager ${params.actor.userId} is not actively assigned to service ${params.serviceId}. Managers can only request Staff permissions for services assigned to them by Admin.`
      );
    }

    const allowedSubset = params.requestedPermissions.filter(
      (p) => ALL_PERMISSION_TYPES.includes(p) && managerAssignment.permissions.includes(p)
    );
    const reqPerms: PermissionType[] =
      allowedSubset.length > 0 ? allowedSubset : ['VIEW', 'EXECUTE'];

    const now = new Date().toISOString();
    const request: StaffServiceRequest = {
      id: this.nextSvcSeq,
      requestCode: `SSR-2026-${String(this.nextSvcSeq++).padStart(4, '0')}`,
      managerUserId: params.actor.userId,
      staffUserId: staff.userId,
      managerAssignmentCode: managerAssignment.assignmentCode,
      serviceId: managerAssignment.serviceId,
      serviceName: managerAssignment.serviceName,
      departmentCode: managerAssignment.departmentCode,
      requestedPermissions: reqPerms,
      reason: params.reason || 'Operational counter staffing request',
      status: 'PENDING_ADMIN_APPROVAL',
      createdAt: now,
      updatedAt: now,
    };

    this.staffServiceRequests.unshift(request);
    this.recordServiceApprovalLog({
      actorUserId: params.actor.userId,
      actorRole: 'MANAGER',
      action: 'SUBMIT_STAFF_SERVICE_REQUEST',
      targetType: 'STAFF_REQUEST',
      targetCode: request.requestCode,
      staffUserId: staff.userId,
      managerUserId: params.actor.userId,
      serviceId: request.serviceId,
      previousStatus: null,
      newStatus: 'PENDING_ADMIN_APPROVAL',
      details: `Manager ${params.actor.userId} requested ${request.serviceId} (${reqPerms.join(', ')}) for Staff ${staff.userId}. Pending Admin Approval.`,
    });
    this.addPhase02Notification({
      triggerType: 'STAFF_SERVICE_REQUESTED',
      recipientUserId: 'MC2627110001',
      title: `Service Approval Required: ${request.requestCode}`,
      message: `Manager ${params.actor.userId} requested ${request.serviceName} access for ${staff.userId}.`,
      severity: 'INFO',
    });

    return request;
  }

  public decideStaffServiceRequest(params: {
    actor: ServerUser;
    requestCode: string;
    approve: boolean;
    notes?: string;
    expiryDate?: string | null;
  }): { request: StaffServiceRequest; permission?: StaffServicePermission } {
    if (params.actor.role !== 'ADMIN') {
      throw new Error('Only Admin can approve or reject Staff service permission requests.');
    }
    const reqRecord = this.staffServiceRequests.find(
      (r) => r.requestCode === params.requestCode
    );
    if (!reqRecord) {
      throw new Error('Staff service request not found.');
    }
    if (reqRecord.status !== 'PENDING_ADMIN_APPROVAL') {
      throw new Error(`Request ${reqRecord.requestCode} is already ${reqRecord.status}.`);
    }
    if (reqRecord.managerUserId === params.actor.userId) {
      throw new Error('Self-approval is strictly prohibited.');
    }

    const now = new Date().toISOString();
    reqRecord.reviewedBy = params.actor.userId;
    reqRecord.reviewedAt = now;
    reqRecord.reviewNotes = params.notes || (params.approve ? 'Approved by Admin.' : 'Rejected by Admin.');
    reqRecord.updatedAt = now;

    if (!params.approve) {
      reqRecord.status = 'REJECTED';
      this.recordServiceApprovalLog({
        actorUserId: params.actor.userId,
        actorRole: 'ADMIN',
        action: 'REJECT_STAFF_SERVICE_REQUEST',
        targetType: 'STAFF_REQUEST',
        targetCode: reqRecord.requestCode,
        staffUserId: reqRecord.staffUserId,
        managerUserId: reqRecord.managerUserId,
        serviceId: reqRecord.serviceId,
        previousStatus: 'PENDING_ADMIN_APPROVAL',
        newStatus: 'REJECTED',
        details: reqRecord.reviewNotes,
      });
      this.addPhase02Notification({
        triggerType: 'STAFF_SERVICE_REJECTED',
        recipientUserId: reqRecord.managerUserId,
        title: `Service Request Rejected: ${reqRecord.requestCode}`,
        message: `Admin rejected ${reqRecord.serviceName} request for ${reqRecord.staffUserId}: ${reqRecord.reviewNotes}`,
        severity: 'WARNING',
      });
      return { request: reqRecord };
    }

    // Verify parent manager assignment is still active before granting
    const parentMsa = this.managerServiceAssignments.find(
      (a) => a.assignmentCode === reqRecord.managerAssignmentCode
    );
    if (!parentMsa || parentMsa.status !== 'ACTIVE') {
      throw new Error('Cannot approve: Parent Manager service assignment is no longer ACTIVE.');
    }

    reqRecord.status = 'APPROVED';

    const existingPerm = this.staffServicePermissions.find(
      (p) => p.staffUserId === reqRecord.staffUserId && p.serviceId === reqRecord.serviceId
    );
    let permRecord: StaffServicePermission;
    if (existingPerm) {
      existingPerm.managerUserId = reqRecord.managerUserId;
      existingPerm.managerAssignmentCode = reqRecord.managerAssignmentCode;
      existingPerm.requestCode = reqRecord.requestCode;
      existingPerm.permissions = [...reqRecord.requestedPermissions];
      existingPerm.approvedByAdmin = params.actor.userId;
      existingPerm.effectiveDate = now.slice(0, 10);
      existingPerm.expiryDate = params.expiryDate ?? parentMsa.expiryDate;
      existingPerm.status = 'ACTIVE';
      existingPerm.updatedAt = now;
      permRecord = existingPerm;
    } else {
      permRecord = {
        id: this.nextSvcSeq,
        permissionCode: `SSP-2026-${String(this.nextSvcSeq++).padStart(4, '0')}`,
        staffUserId: reqRecord.staffUserId,
        managerUserId: reqRecord.managerUserId,
        managerAssignmentCode: reqRecord.managerAssignmentCode,
        requestCode: reqRecord.requestCode,
        serviceId: reqRecord.serviceId,
        serviceName: reqRecord.serviceName,
        departmentCode: reqRecord.departmentCode,
        permissions: [...reqRecord.requestedPermissions],
        approvedByAdmin: params.actor.userId,
        effectiveDate: now.slice(0, 10),
        expiryDate: params.expiryDate ?? parentMsa.expiryDate,
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      };
      this.staffServicePermissions.unshift(permRecord);
    }

    this.recordServiceApprovalLog({
      actorUserId: params.actor.userId,
      actorRole: 'ADMIN',
      action: 'APPROVE_STAFF_SERVICE_REQUEST',
      targetType: 'STAFF_PERMISSION',
      targetCode: permRecord.permissionCode,
      staffUserId: permRecord.staffUserId,
      managerUserId: permRecord.managerUserId,
      serviceId: permRecord.serviceId,
      previousStatus: 'PENDING_ADMIN_APPROVAL',
      newStatus: 'ACTIVE',
      details: `Admin approved ${reqRecord.requestCode} -> Activated ${permRecord.permissionCode} for Staff ${permRecord.staffUserId}.`,
    });

    this.addPhase02Notification({
      triggerType: 'STAFF_SERVICE_APPROVED',
      recipientUserId: permRecord.staffUserId,
      title: `Service Permission Approved: ${permRecord.serviceName}`,
      message: `Admin approved your access to ${permRecord.serviceId} (${permRecord.permissions.join(', ')}).`,
      severity: 'INFO',
    });

    return { request: reqRecord, permission: permRecord };
  }

  public updateStaffServicePermissionStatus(params: {
    actor: ServerUser;
    permissionCode: string;
    status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
    reason?: string;
  }): StaffServicePermission {
    if (params.actor.role !== 'ADMIN') {
      throw new Error('Only Admin can suspend, revoke, or reactivate Staff service permissions.');
    }
    const perm = this.staffServicePermissions.find(
      (p) => p.permissionCode === params.permissionCode
    );
    if (!perm) {
      throw new Error('Staff service permission record not found.');
    }
    if (params.status === 'ACTIVE') {
      const parent = this.managerServiceAssignments.find(
        (m) => m.assignmentCode === perm.managerAssignmentCode
      );
      if (!parent || parent.status !== 'ACTIVE') {
        throw new Error(
          'Cannot activate Staff permission while parent Manager service assignment is suspended/revoked/expired.'
        );
      }
    }

    const prev = perm.status;
    perm.status = params.status;
    perm.updatedAt = new Date().toISOString();

    this.recordServiceApprovalLog({
      actorUserId: params.actor.userId,
      actorRole: 'ADMIN',
      action: `STAFF_PERMISSION_${params.status}`,
      targetType: 'STAFF_PERMISSION',
      targetCode: perm.permissionCode,
      staffUserId: perm.staffUserId,
      managerUserId: perm.managerUserId,
      serviceId: perm.serviceId,
      previousStatus: prev,
      newStatus: params.status,
      details: params.reason || `Admin set ${perm.permissionCode} status to ${params.status}.`,
    });

    if (params.status === 'SUSPENDED' || params.status === 'REVOKED') {
      this.addPhase02Notification({
        triggerType: 'SERVICE_PERMISSION_REVOKED',
        recipientUserId: perm.staffUserId,
        title: `Service Permission ${params.status}: ${perm.serviceName}`,
        message: `Admin marked ${perm.serviceId} access as ${params.status}.`,
        severity: 'WARNING',
      });
    }

    return perm;
  }

  private isLegacyDemoUser(userId: string): boolean {
    return (
      userId === 'MC2627110002' ||
      userId === 'MC2627110003' ||
      userId === 'MC-MN-202613-0002' ||
      userId === 'MC-ST-202613-0003'
    );
  }

  /**
   * Strict Default-Deny service permission evaluation:
   * - ADMIN (ACTIVE): always allowed
   * - MANAGER: must hold ACTIVE managerServiceAssignment within effective/expiry window
   * - STAFF: must hold ACTIVE/APPROVED staffServicePermission AND parent manager assignment must be ACTIVE
   */
  public checkServicePermissionStrict(
    user: ServerUser,
    serviceId: string,
    requiredPerm: PermissionType = 'EXECUTE'
  ): { allowed: boolean; reason: string } {
    if (user.status !== 'ACTIVE') {
      return { allowed: false, reason: `User account status is ${user.status}.` };
    }
    if (user.role === 'ADMIN') {
      return { allowed: true, reason: 'Admin full control authority.' };
    }
    this.expireStaleServicePermissions();
    const today = new Date().toISOString().slice(0, 10);

    if (user.role === 'AUDITOR') {
      return {
        allowed: requiredPerm === 'VIEW',
        reason: requiredPerm === 'VIEW' ? 'Auditor read-only inspection.' : 'Auditor role is strictly read-only.',
      };
    }

    if (user.role === 'MANAGER') {
      const msa = this.managerServiceAssignments.find(
        (a) => a.managerUserId === user.userId && a.serviceId === serviceId
      );
      if (!msa) {
        return { allowed: false, reason: `Manager ${user.userId} has no assignment for service ${serviceId}.` };
      }
      if (msa.status !== 'ACTIVE') {
        return { allowed: false, reason: `Manager assignment ${msa.assignmentCode} is ${msa.status}.` };
      }
      if (msa.effectiveDate > today || (msa.expiryDate && msa.expiryDate < today)) {
        return { allowed: false, reason: `Manager assignment ${msa.assignmentCode} is outside its effective date window.` };
      }
      if (!msa.permissions.includes(requiredPerm) && !msa.permissions.includes('MANAGE')) {
        return { allowed: false, reason: `Manager lacks ${requiredPerm} permission on ${serviceId}.` };
      }
      return { allowed: true, reason: `Verified via ${msa.assignmentCode}.` };
    }

    if (user.role === 'STAFF') {
      const ssp = this.staffServicePermissions.find(
        (p) => p.staffUserId === user.userId && p.serviceId === serviceId
      );
      if (!ssp) {
        return { allowed: false, reason: `Staff ${user.userId} has no Admin-approved permission for service ${serviceId}.` };
      }
      if (ssp.status !== 'ACTIVE' && ssp.status !== 'APPROVED') {
        return { allowed: false, reason: `Staff service permission ${ssp.permissionCode} is ${ssp.status}.` };
      }
      if (ssp.effectiveDate > today || (ssp.expiryDate && ssp.expiryDate < today)) {
        return { allowed: false, reason: `Staff permission ${ssp.permissionCode} is outside its effective date window.` };
      }
      const parent = this.managerServiceAssignments.find(
        (a) => a.assignmentCode === ssp.managerAssignmentCode
      );
      if (!parent || parent.status !== 'ACTIVE') {
        return { allowed: false, reason: `Parent Manager assignment is ${parent?.status || 'INACTIVE'}.` };
      }
      if (!ssp.permissions.includes(requiredPerm) && !ssp.permissions.includes('MANAGE')) {
        return { allowed: false, reason: `Staff lacks ${requiredPerm} permission on ${serviceId}.` };
      }
      return { allowed: true, reason: `Verified via ${ssp.permissionCode}.` };
    }

    return { allowed: false, reason: 'Default Deny: insufficient service authorization.' };
  }

  /**
   * Runtime enforcement for ERP/CSC service order execution:
   * - Newly created users (non-legacy IDs) are ALWAYS checked with strict Default-Deny!
   * - Legacy seeded demo accounts (`MC-MN-202613-0002`, `MC-ST-202613-0003`) are strictly checked
   *   for every governed service (`MCS-2026-27-000001..` or any service registered in `managerServiceAssignments`).
   */
  public canExecuteServiceOrder(
    user: ServerUser,
    serviceId: string,
    requiredPerm: PermissionType = 'EXECUTE'
  ): { allowed: boolean; reason: string } {
    if (user.role === 'ADMIN' && user.status === 'ACTIVE') {
      return { allowed: true, reason: 'Admin authorized.' };
    }
    const isGovernedService =
      this.managerServiceAssignments.some((a) => a.serviceId === serviceId) ||
      this.staffServicePermissions.some((p) => p.serviceId === serviceId);

    if (!this.isLegacyDemoUser(user.userId) || isGovernedService) {
      return this.checkServicePermissionStrict(user, serviceId, requiredPerm);
    }

    return { allowed: true, reason: 'Legacy demo service catalog pass-through.' };
  }

  public recordServiceApprovalLog(
    entry: Omit<ServiceApprovalLog, 'id' | 'logCode' | 'createdAt'>
  ): ServiceApprovalLog {
    const id = this.nextSvcSeq++;
    const log: ServiceApprovalLog = {
      id,
      logCode: `SAL-2026-${String(id).padStart(5, '0')}`,
      ...entry,
      createdAt: new Date().toISOString(),
    };
    this.serviceApprovalLogs.unshift(log);
    return log;
  }

  public addPhase02Notification(
    entry: Omit<Phase02NotificationRecord, 'id' | 'notificationCode' | 'isRead' | 'createdAt'>
  ): Phase02NotificationRecord {
    const id = this.nextLogId++;
    const notif: Phase02NotificationRecord = {
      id,
      notificationCode: `NTF-P2-${String(id).padStart(5, '0')}`,
      ...entry,
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    this.phase02Notifications.unshift(notif);
    return notif;
  }

  public addSecurityLog(
    entry: Omit<SecurityLogRecord, 'id' | 'createdAt'>
  ): SecurityLogRecord {
    const record: SecurityLogRecord = {
      id: this.nextLogId++,
      ...entry,
      createdAt: new Date().toISOString(),
    };
    this.securityLogs.unshift(record);
    void syncSecurityLogToFirebase(record).catch(() => {});
    return record;
  }

  public addAuditLog(
    entry: Omit<AuditLogRecord, 'id' | 'createdAt'>
  ): AuditLogRecord {
    const record: AuditLogRecord = {
      id: this.nextLogId++,
      ...entry,
      createdAt: new Date().toISOString(),
    };
    this.auditLogs.unshift(record);
    return record;
  }

  public nextRequestCode(): string {
    const year = new Date().getFullYear();
    const num = this.nextRequestNumericId++;
    return `REQ-${year}-${String(num).padStart(4, '0')}`;
  }

  public sanitizePublicUser(user: ServerUser, viewerRole?: RoleName) {
    return {
      id: user.id,
      userId: user.userId,
      isMasterAdmin: this.isMasterAdminUser(user),
      fullName: user.fullName,
      role: user.role,
      mobile: user.mobile,
      email: user.email ?? '',
      address: user.address,
      designation: user.designation ?? '',
      departmentCode: user.departmentCode ?? 'DEPT-CSC',
      joiningDate: user.joiningDate ?? user.createdAt.slice(0, 10),
      emergencyContact: user.emergencyContact ?? '',
      profilePhotoUrl: user.profilePhotoUrl ?? '',
      aadhaarMasked: user.aadhaarLast4
        ? `XXXX-XXXX-${user.aadhaarLast4}`
        : undefined,
      hasAadhaar: Boolean(user.aadhaarLast4),
      branch: user.branch,
      status: user.status,
      mobileVerified: user.mobileVerified,
      emailVerified: user.emailVerified,
      totpEnabled: Boolean(user.totpEnabled),
      totpEnrolledAt: user.totpEnrolledAt ?? null,
      recoveryCodesRemaining: user.recoveryCodeHashes?.length ?? 0,
      passwordMigrationRequired: Boolean(user.passwordMigrationRequired),
      failedLoginAttempts: user.failedLoginAttempts,
      isLocked: Boolean(user.lockedUntil && user.lockedUntil > Date.now()),
      lockedUntil: user.lockedUntil ? new Date(user.lockedUntil).toISOString() : null,
      createdBy: user.createdBy,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      passwordChangedAt: user.passwordChangedAt,
      permissions:
        viewerRole === 'ADMIN' || viewerRole === 'MANAGER'
          ? this.getEffectivePermissions(user)
          : undefined,
    };
  }
}
