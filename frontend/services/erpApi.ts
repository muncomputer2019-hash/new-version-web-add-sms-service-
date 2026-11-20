import {
  DynamicFormFieldDef,
  ErpApplicationItem,
  ErpCustomerItem,
  ErpDashboardSummary,
  ErpExpenseItem,
  ErpNotificationDispatchItem,
  ErpPaymentItem,
  ErpRefundItem,
  ErpServiceItem,
  ReferenceFieldDefItem,
  ServiceCategoryItem,
  ServiceSubcategoryItem,
} from '../modules/types';
import { securityRequest } from './securityApi';

export const erpApi = {
  getDashboardSummary: () =>
    securityRequest<ErpDashboardSummary>('/api/erp/dashboard-summary'),

  // Customers CRM
  listCustomers: (params?: { q?: string; status?: string; segment?: string; includeDeleted?: boolean }) => {
    const qs = new URLSearchParams();
    if (params?.q) qs.set('q', params.q);
    if (params?.status) qs.set('status', params.status);
    if (params?.segment) qs.set('segment', params.segment);
    if (params?.includeDeleted) qs.set('includeDeleted', 'true');
    const q = qs.toString();
    return securityRequest<ErpCustomerItem[]>(`/api/erp/customers${q ? `?${q}` : ''}`);
  },

  getCustomerProfile: (customerId: string) =>
    securityRequest<{
      customer: ErpCustomerItem;
      applications: ErpApplicationItem[];
      documents: ErpApplicationItem['documents'];
      payments: ErpPaymentItem[];
      refunds: ErpRefundItem[];
      deliveries: NonNullable<ErpApplicationItem['delivery']>[];
      followUps: ErpApplicationItem['followUps'];
      notifications: ErpNotificationDispatchItem[];
    }>(`/api/erp/customers/${encodeURIComponent(customerId)}`),

  createCustomer: (payload: Record<string, unknown>) =>
    securityRequest<ErpCustomerItem>('/api/erp/customers', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateCustomer: (customerId: string, payload: Record<string, unknown>) =>
    securityRequest<ErpCustomerItem>(`/api/erp/customers/${encodeURIComponent(customerId)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  sendMobileOtp: (mobile: string) =>
    securityRequest<{
      challengeId: string;
      expiresInSeconds: number;
      providerConfigured: boolean;
      sandboxOtpPreview?: string;
    }>('/api/auth/mobile-otp/send', {
      method: 'POST',
      body: JSON.stringify({ mobile }),
    }),

  verifyMobileOtp: (challengeId: string, otp: string) =>
    securityRequest<{ mobileVerified: boolean; verificationToken: string }>(
      '/api/auth/verify-otp',
      {
        method: 'POST',
        body: JSON.stringify({ challengeId, otp }),
      }
    ),

  verifyCustomerContact: (customerId: string, payload: Record<string, unknown>) =>
    securityRequest<ErpCustomerItem>(
      `/api/erp/customers/${encodeURIComponent(customerId)}/verify-mobile`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  updateCustomerConsents: (
    customerId: string,
    payload: {
      updates: Array<{ category: string; granted: boolean }>;
      verificationMethod: string;
      notes?: string;
    }
  ) =>
    securityRequest<ErpCustomerItem>(
      `/api/erp/customers/${encodeURIComponent(customerId)}/consents`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      }
    ),

  addCustomerNote: (customerId: string, payload: Record<string, unknown>) =>
    securityRequest<ErpCustomerItem>(
      `/api/erp/customers/${encodeURIComponent(customerId)}/notes`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  decryptCustomerAadhaar: (customerId: string) =>
    securityRequest<{ customerId: string; aadhaarFormatted: string }>(
      `/api/erp/customers/${encodeURIComponent(customerId)}/aadhaar`
    ),

  softDeleteCustomer: (customerId: string, reason: string) =>
    securityRequest<{ archived: boolean }>(
      `/api/erp/customers/${encodeURIComponent(customerId)}/soft-delete`,
      { method: 'POST', body: JSON.stringify({ reason }) }
    ),

  restoreCustomer: (customerId: string) =>
    securityRequest<ErpCustomerItem>(
      `/api/erp/customers/${encodeURIComponent(customerId)}/restore`,
      { method: 'POST', body: '{}' }
    ),

  mergeCustomers: (payload: {
    primaryCustomerId: string;
    duplicateCustomerId: string;
    reason: string;
  }) =>
    securityRequest<{
      primaryCustomer: ErpCustomerItem;
      mergedDuplicateId: string;
      relinkedApplicationsCount: number;
    }>('/api/erp/customers/merge', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  bulkImportCustomers: (rows: Array<Record<string, unknown>>, commit: boolean) =>
    securityRequest<{
      mode: 'PREVIEW' | 'COMMITTED';
      totalRows: number;
      validCount: number;
      invalidCount: number;
      createdIds: string[];
      preview: Array<{
        rowNumber: number;
        fullName: string;
        mobile: string;
        village: string;
        valid: boolean;
        errors: string[];
      }>;
    }>('/api/erp/customers/bulk-import', {
      method: 'POST',
      body: JSON.stringify({ rows, commit }),
    }),

  // Services, Categories, Subcategories, Dynamic Form Builder
  listServiceCategories: () =>
    securityRequest<ServiceCategoryItem[]>('/api/erp/service-categories'),

  createServiceCategory: (payload: { name: string; description: string; displayOrder?: number }) =>
    securityRequest<ServiceCategoryItem>('/api/erp/service-categories', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateServiceCategory: (
    id: number,
    payload: { name?: string; description?: string; displayOrder?: number; status?: string }
  ) =>
    securityRequest<ServiceCategoryItem>(`/api/erp/service-categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteServiceCategory: (id: number) =>
    securityRequest<{ deleted: boolean; id: number }>(`/api/erp/service-categories/${id}`, {
      method: 'DELETE',
    }),

  approveServiceCategory: (id: number, action: 'APPROVE' | 'ARCHIVE' = 'APPROVE') =>
    securityRequest<ServiceCategoryItem>(`/api/erp/service-categories/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    }),

  listServiceSubcategories: (categoryId?: number) =>
    securityRequest<ServiceSubcategoryItem[]>(
      `/api/erp/service-subcategories${categoryId ? `?categoryId=${categoryId}` : ''}`
    ),

  createServiceSubcategory: (payload: {
    categoryId: number;
    name: string;
    description?: string;
    displayOrder?: number;
  }) =>
    securityRequest<ServiceSubcategoryItem>('/api/erp/service-subcategories', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateServiceSubcategory: (
    id: number,
    payload: {
      categoryId?: number;
      name?: string;
      description?: string;
      displayOrder?: number;
      status?: string;
    }
  ) =>
    securityRequest<ServiceSubcategoryItem>(`/api/erp/service-subcategories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteServiceSubcategory: (id: number) =>
    securityRequest<{ deleted: boolean; id: number }>(`/api/erp/service-subcategories/${id}`, {
      method: 'DELETE',
    }),

  listServices: (includeDeleted = false) =>
    securityRequest<ErpServiceItem[]>(
      `/api/erp/services${includeDeleted ? '?includeDeleted=true' : ''}`
    ),

  createService: (payload: Record<string, unknown>) =>
    securityRequest<ErpServiceItem>('/api/erp/services', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateService: (serviceId: string, payload: Record<string, unknown>) =>
    securityRequest<ErpServiceItem>(`/api/erp/services/${encodeURIComponent(serviceId)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  toggleServiceStatus: (serviceId: string, status: 'Active' | 'Inactive') =>
    securityRequest<ErpServiceItem>(`/api/erp/services/${encodeURIComponent(serviceId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  deleteService: (serviceId: string) =>
    securityRequest<{ deleted: true; serviceId: string; serviceCode?: string }>(
      `/api/erp/services/${encodeURIComponent(serviceId)}`,
      { method: 'DELETE' }
    ),

  syncCatalog675: () =>
    securityRequest<{
      categoriesCount: number;
      subcategoriesCount: number;
      servicesCount: number;
      codeRange: string;
      legacyRemovedCount?: number;
    }>('/api/erp/services/sync-catalog', {
      method: 'POST',
      body: '{}',
    }),

  publishFormVersion: (serviceId: string, fields: DynamicFormFieldDef[]) =>
    securityRequest<ErpServiceItem>(
      `/api/erp/services/${encodeURIComponent(serviceId)}/form-versions`,
      {
        method: 'POST',
        body: JSON.stringify({ fields }),
      }
    ),

  // Reference Fields
  listReferenceFields: () =>
    securityRequest<ReferenceFieldDefItem[]>('/api/erp/reference-fields'),

  createReferenceField: (payload: Record<string, unknown>) =>
    securityRequest<ReferenceFieldDefItem>('/api/erp/reference-fields', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateReferenceField: (id: number, payload: Record<string, unknown>) =>
    securityRequest<ReferenceFieldDefItem>(`/api/erp/reference-fields/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  // Applications Workflow
  listApplications: (params?: {
    q?: string;
    status?: string;
    serviceId?: string;
    customerId?: string;
    scope?: string;
    includeArchived?: boolean;
  }) => {
    const qs = new URLSearchParams();
    if (params?.q) qs.set('q', params.q);
    if (params?.status) qs.set('status', params.status);
    if (params?.serviceId) qs.set('serviceId', params.serviceId);
    if (params?.customerId) qs.set('customerId', params.customerId);
    if (params?.scope) qs.set('scope', params.scope);
    if (params?.includeArchived) qs.set('includeArchived', 'true');
    const q = qs.toString();
    return securityRequest<ErpApplicationItem[]>(`/api/erp/applications${q ? `?${q}` : ''}`);
  },

  getApplicationDetail: (appNo: string) =>
    securityRequest<{
      application: ErpApplicationItem;
      customer: ErpCustomerItem | null;
    }>(`/api/erp/applications/${encodeURIComponent(appNo)}`),

  checkDuplicateApplication: (customerId: string, serviceId: string) =>
    securityRequest<{
      hasDuplicate: boolean;
      matches: Array<{ applicationNo: string; status: string; createdAt: string }>;
    }>('/api/erp/applications/check-duplicate', {
      method: 'POST',
      body: JSON.stringify({ customerId, serviceId }),
    }),

  createApplication: (payload: Record<string, unknown>) =>
    securityRequest<ErpApplicationItem>('/api/erp/applications', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  transitionStatus: (
    appNo: string,
    payload: {
      nextStatus: string;
      reason?: string;
      remarks?: string;
      mandatoryDocExceptionReason?: string;
    }
  ) =>
    securityRequest<ErpApplicationItem>(
      `/api/erp/applications/${encodeURIComponent(appNo)}/status`,
      { method: 'POST', body: JSON.stringify(payload) }
    ),

  updateFormData: (appNo: string, formData: Record<string, unknown>) =>
    securityRequest<ErpApplicationItem>(
      `/api/erp/applications/${encodeURIComponent(appNo)}/form-data`,
      { method: 'PUT', body: JSON.stringify({ formData }) }
    ),

  assignApplication: (appNo: string, payload: Record<string, unknown>) =>
    securityRequest<ErpApplicationItem>(
      `/api/erp/applications/${encodeURIComponent(appNo)}/assign`,
      { method: 'POST', body: JSON.stringify(payload) }
    ),

  listReassignmentRequests: () =>
    securityRequest<ErpApplicationItem['reassignments']>('/api/erp/reassignment-requests'),

  requestReassignment: (appNo: string, payload: Record<string, unknown>) =>
    securityRequest<ErpApplicationItem['reassignments'][0]>(
      `/api/erp/applications/${encodeURIComponent(appNo)}/reassignment-requests`,
      { method: 'POST', body: JSON.stringify(payload) }
    ),

  reviewReassignment: (requestCode: string, decision: 'Approved' | 'Rejected', reviewNotes: string) =>
    securityRequest(`/api/erp/reassignment-requests/${encodeURIComponent(requestCode)}/review`, {
      method: 'POST',
      body: JSON.stringify({ decision, reviewNotes }),
    }),

  upsertReference: (appNo: string, payload: { fieldKey: string; value: string; reason?: string }) =>
    securityRequest<ErpApplicationItem>(
      `/api/erp/applications/${encodeURIComponent(appNo)}/references`,
      { method: 'POST', body: JSON.stringify(payload) }
    ),

  uploadDocument: (appNo: string, payload: Record<string, unknown>) =>
    securityRequest<{
      document: ErpApplicationItem['documents'][0];
      checklistSummary: ErpApplicationItem['checklistSummary'];
    }>(`/api/erp/applications/${encodeURIComponent(appNo)}/documents`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  downloadDocument: (fileUuid: string) =>
    securityRequest<{
      fileUuid: string;
      originalName: string;
      mimeType: string;
      fileSizeBytes: number;
      contentBase64: string;
    }>(`/api/erp/documents/${encodeURIComponent(fileUuid)}/download`),

  verifyDocument: (fileUuid: string, status: 'Verified' | 'Rejected', reason: string) =>
    securityRequest<ErpApplicationItem['documents'][0]>(
      `/api/erp/documents/${encodeURIComponent(fileUuid)}/verify`,
      { method: 'POST', body: JSON.stringify({ status, reason }) }
    ),

  addFollowUp: (appNo: string, payload: Record<string, unknown>) =>
    securityRequest(`/api/erp/applications/${encodeURIComponent(appNo)}/follow-ups`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateFollowUp: (id: number, payload: Record<string, unknown>) =>
    securityRequest(`/api/erp/follow-ups/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  addNote: (appNo: string, noteType: 'INTERNAL' | 'CUSTOMER_REMARK', content: string) =>
    securityRequest(`/api/erp/applications/${encodeURIComponent(appNo)}/notes`, {
      method: 'POST',
      body: JSON.stringify({ noteType, content }),
    }),

  saveDelivery: (appNo: string, payload: Record<string, unknown>) =>
    securityRequest(`/api/erp/applications/${encodeURIComponent(appNo)}/delivery`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  requestCancellation: (appNo: string, reason: string) =>
    securityRequest(
      `/api/erp/applications/${encodeURIComponent(appNo)}/cancellation-requests`,
      { method: 'POST', body: JSON.stringify({ reason }) }
    ),

  reviewCancellation: (requestCode: string, decision: 'Approved' | 'Rejected', reviewRemarks: string) =>
    securityRequest(`/api/erp/cancellation-requests/${encodeURIComponent(requestCode)}/review`, {
      method: 'POST',
      body: JSON.stringify({ decision, reviewRemarks }),
    }),

  archiveApplication: (appNo: string, reason: string) =>
    securityRequest(`/api/erp/applications/${encodeURIComponent(appNo)}/archive`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  // Finance
  getFinanceLedger: () =>
    securityRequest<{
      payments: ErpPaymentItem[];
      refunds: ErpRefundItem[];
      expenses: ErpExpenseItem[];
    }>('/api/erp/payments'),

  recordPayment: (payload: Record<string, unknown>) =>
    securityRequest<ErpPaymentItem>('/api/erp/payments', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  verifyPayment: (transactionId: string, decision: 'Confirmed' | 'Rejected') =>
    securityRequest<ErpPaymentItem>(
      `/api/erp/payments/${encodeURIComponent(transactionId)}/verify`,
      { method: 'POST', body: JSON.stringify({ decision }) }
    ),

  createRefund: (payload: Record<string, unknown>) =>
    securityRequest<ErpRefundItem>('/api/erp/refunds', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  processRefund: (refundId: string, decision: 'Processed' | 'Rejected', remarks?: string) =>
    securityRequest<ErpRefundItem>(`/api/erp/refunds/${encodeURIComponent(refundId)}/process`, {
      method: 'POST',
      body: JSON.stringify({ decision, remarks }),
    }),

  createExpense: (payload: Record<string, unknown>) =>
    securityRequest<ErpExpenseItem>('/api/erp/expenses', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Notifications & MIS Reports
  listNotifications: () =>
    securityRequest<ErpNotificationDispatchItem[]>('/api/erp/notifications'),

  sendNotification: (payload: Record<string, unknown>) =>
    securityRequest<ErpNotificationDispatchItem>('/api/erp/notifications/send', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getReportsSummary: () =>
    securityRequest<{
      totalApplications: number;
      statusSummary: Record<string, number>;
      staffWorkload: Array<{
        staffId: string;
        total: number;
        completed: number;
        pending: number;
        overdue: number;
      }>;
      serviceSummary: Array<{
        serviceId: string;
        serviceName: string;
        count: number;
        revenue: number;
        profit: number;
      }>;
      pendingDocumentsApps: ErpApplicationItem[];
      overdueSlaApps: ErpApplicationItem[];
      followUps: ErpApplicationItem['followUps'];
      deliveries: NonNullable<ErpApplicationItem['delivery']>[];
      cancellations: ErpApplicationItem['cancellations'];
      refunds: ErpRefundItem[];
      exportLogs: Array<{
        id: number;
        reportName: string;
        format: string;
        rowCount: number;
        exportedBy: string;
        exportedRole: string;
        exportedAt: string;
      }>;
      activities: ErpApplicationItem['activities'];
    }>('/api/erp/reports/summary'),

  logReportExport: (reportName: string, format: 'PDF' | 'Excel' | 'CSV', rowCount: number) =>
    securityRequest('/api/erp/reports/export-log', {
      method: 'POST',
      body: JSON.stringify({ reportName, format, rowCount }),
    }),
};

export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result ?? '');
      resolve(res.includes(',') ? res.split(',')[1] : res);
    };
    reader.onerror = () => reject(new Error('Failed to read selected file.'));
    reader.readAsDataURL(file);
  });
}
