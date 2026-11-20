import { LanguageCode, RoleName, ThemeMode } from '../modules/types';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

/**
 * Firebase Client Authentication has been completely removed from MUN COMPUTER ERP.
 * All authentication, session cookies, TOTP, and database reads/writes execute
 * exclusively through the Vercel / Express backend API (/api/*).
 */
export const auth = null;
export const db = null;
export const firebaseInitError: string | null = null;

export function isFirebaseConfigured(): boolean {
  return false;
}

export async function waitForFirebaseAuthReady(): Promise<null> {
  return null;
}

export function resolveFinancialYearCodeIST(date = new Date()): string {
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

export function getIstMonthCode(date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      month: '2-digit',
    }).formatToParts(date);
    return (
      parts.find((p) => p.type === 'month')?.value ||
      String(date.getMonth() + 1).padStart(2, '0')
    );
  } catch {
    return String(date.getMonth() + 1).padStart(2, '0');
  }
}

export function getCurrentUserIdPrefix(date = new Date()): string {
  return `MC${resolveFinancialYearCodeIST(date)}${getIstMonthCode(date)}`;
}

export function extractFriendlyErrorMessage(
  err: unknown,
  fallback = 'An unexpected error occurred. Please check your input and try again.'
): string {
  const raw = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  if (!raw) return fallback;
  const msg = raw;
  try {
    const parsed = JSON.parse(raw) as {
      error?: string;
      message?: string;
      path?: string | null;
    };
    if (parsed && (parsed.error || parsed.message)) {
      const inner = parsed.error || parsed.message || '';
      return `${inner}${parsed.path ? ` (${parsed.path})` : ''}`;
    }
  } catch {
    // Plain string error message
  }
  const lower = msg.toLowerCase();
  if (lower.includes('missing or insufficient permissions') || lower.includes('permission-denied')) {
    return 'Access denied by server security policy. Ensure your session and permissions are active.';
  }
  return msg;
}

export function timestampToIso(value: unknown, fallback = new Date().toISOString()): string {
  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as { toDate: () => Date }).toDate === 'function'
  ) {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  return fallback;
}

const UI_PREFS_CACHE_KEY = 'mun_ui_prefs_v1';

export function getCachedUiPrefs(): { theme?: ThemeMode; language?: LanguageCode } {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(UI_PREFS_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { theme?: string; language?: string };
    return {
      theme: parsed.theme === 'dark' ? 'dark' : parsed.theme === 'light' ? 'light' : undefined,
      language:
        parsed.language === 'bn' || parsed.language === 'hi' || parsed.language === 'en'
          ? parsed.language
          : undefined,
    };
  } catch {
    return {};
  }
}

export function cacheUiPrefs(prefs: { theme?: ThemeMode; language?: LanguageCode }): void {
  if (typeof window === 'undefined') return;
  try {
    const current = getCachedUiPrefs();
    window.localStorage.setItem(UI_PREFS_CACHE_KEY, JSON.stringify({ ...current, ...prefs }));
  } catch {
    // Ignore storage failure
  }
}

const ROLE_PERMISSIONS: Record<RoleName, Record<string, string[]>> = {
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
    users: ['VIEW', 'ADD', 'EDIT'],
    roles: ['VIEW'],
    permissions: ['VIEW', 'ASSIGN'],
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

export function buildPermissionsForRole(role: RoleName): Record<string, boolean> {
  const effective: Record<string, boolean> = {};
  const matrix = ROLE_PERMISSIONS[role];
  for (const [mod, perms] of Object.entries(matrix)) {
    for (const perm of [
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
    ]) {
      effective[`${mod}.${perm}`] = perms.includes(perm);
    }
  }
  const canReport = role !== 'STAFF' && role !== 'CUSTOMER';
  const isAdmin = role === 'ADMIN';
  effective['report.view'] = canReport;
  effective['report.create'] = role === 'ADMIN' || role === 'MANAGER';
  effective['report.update'] = role === 'ADMIN' || role === 'MANAGER';
  effective['report.delete'] = isAdmin;
  effective['report.export.pdf'] = canReport;
  effective['report.export.excel'] = canReport;
  effective['report.print'] = canReport;
  effective['report.schedule'] = isAdmin;
  effective['report.archive.view'] = canReport;
  effective['report.audit.view'] = role === 'ADMIN' || role === 'AUDITOR';

  const isOperator = role === 'ADMIN' || role === 'MANAGER' || role === 'STAFF';
  effective['csc.customerReg'] = isOperator;
  effective['csc.orderCreate'] = isOperator;
  effective['csc.appEntry'] = isOperator;
  effective['csc.docUpload'] = isOperator;
  effective['csc.paymentEntry'] = isOperator;
  effective['csc.receiptPrint'] = isOperator;
  effective['csc.statusUpdate'] = isOperator;
  effective['csc.pvcOrderEntry'] = isOperator;
  effective['csc.customerSearch'] = isOperator;
  effective['csc.reportView'] = isAdmin || role === 'MANAGER';
  effective['csc.rateEdit'] = isAdmin;
  return effective;
}
