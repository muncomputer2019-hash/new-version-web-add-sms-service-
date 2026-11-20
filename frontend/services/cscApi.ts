import {
  CscAdminDashboardKpis,
  CscApplicationStatus,
  CscCategory,
  CscCustomerExtended,
  CscDocumentRecord,
  CscOrderRecord,
  CscPaymentEntry,
  CscRateHistoryEntry,
  CscService,
  GrievanceRecord,
  GrievanceServiceType,
  GrievanceStatus,
  OperatorPermissionKey,
  PvcCardType,
  PvcOrder,
  PvcOrderItem,
  PvcRateSlab,
  UnitType,
  WholesaleShop,
} from '../../shared/cscTypes';
import { securityRequest as apiRequest } from './securityApi';
import { ReportCatalogItem, ReportDataset, ReportFilterInput } from './reportApi';

export interface CscPaymentMethodItem {
  id: string;
  name: string;
  active: boolean;
}

export interface CscOperatorSummary {
  userId: string;
  fullName: string;
  role: 'STAFF' | 'MANAGER';
  status: string;
  mobile: string;
  permissions: Record<string, boolean>;
}

export interface CscWorkspacePayload {
  categories: CscCategory[];
  servicesCount: number;
  pvcCardTypes: PvcCardType[];
  pvcSlabs: PvcRateSlab[];
  wholesaleShops: WholesaleShop[];
  customers: CscCustomerExtended[];
  orders: CscOrderRecord[];
  pvcOrders: PvcOrder[];
  grievances: GrievanceRecord[];
  paymentMethods: CscPaymentMethodItem[];
  effectivePermissions: Record<string, boolean>;
  kpis: CscAdminDashboardKpis | null;
}

export interface CscReceiptPayload {
  receipt: CscPaymentEntry;
  center: {
    name: string;
    address: string;
    mobile: string;
    email: string;
    website: string;
  };
  orderSummary: {
    orderId: string;
    customerName: string;
    mobile: string;
    items: Array<{
      name: string;
      qty: number;
      serviceCharge: number;
      govtFee: number;
      total: number;
    }>;
    totalAmount: number;
    paidAmount: number;
    remainingDue: number;
  };
}

export interface WholesaleShopProfilePayload {
  shop: WholesaleShop;
  metrics: {
    totalOrders: number;
    totalCardsPrinted: number;
    totalBilled: number;
    totalPaid: number;
    pendingDue: number;
  };
  orders: PvcOrder[];
}

export interface CustomerPortalPayload {
  customer: Partial<CscCustomerExtended> & { customerId: string; fullName: string; mobile: string };
  orders: CscOrderRecord[];
  pvcOrders: PvcOrder[];
  grievances: GrievanceRecord[];
  documents: CscDocumentRecord[];
  receipts: CscPaymentEntry[];
}

export const cscApi = {
  getWorkspace() {
    return apiRequest<CscWorkspacePayload>('/api/csc/workspace');
  },

  getDashboardKpis(params?: { fromDate?: string; toDate?: string }) {
    const q = new URLSearchParams();
    if (params?.fromDate) q.set('fromDate', params.fromDate);
    if (params?.toDate) q.set('toDate', params.toDate);
    const qs = q.toString();
    return apiRequest<CscAdminDashboardKpis>(`/api/csc/dashboard-kpis${qs ? `?${qs}` : ''}`);
  },

  // Categories & Services & Rate Manager
  getCategories() {
    return apiRequest<CscCategory[]>('/api/csc/categories');
  },

  createCategory(payload: { name: string; code?: string; description?: string; noticeText?: string }) {
    return apiRequest<CscCategory>('/api/csc/categories', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateCategory(id: string, payload: Partial<CscCategory>) {
    return apiRequest<CscCategory>(`/api/csc/categories/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  getServices(params?: {
    categoryId?: string;
    moduleTag?: string;
    search?: string;
    rateStatus?: 'ALL' | 'CONFIGURED' | 'BLANK';
    activeOnly?: boolean;
  }) {
    const q = new URLSearchParams();
    if (params?.categoryId) q.set('categoryId', params.categoryId);
    if (params?.moduleTag) q.set('moduleTag', params.moduleTag);
    if (params?.search) q.set('search', params.search);
    if (params?.rateStatus) q.set('rateStatus', params.rateStatus);
    if (params?.activeOnly) q.set('activeOnly', 'true');
    const qs = q.toString();
    return apiRequest<CscService[]>(`/api/csc/services${qs ? `?${qs}` : ''}`);
  },

  createService(payload: {
    categoryId: string;
    name: string;
    subGroup?: string;
    description?: string;
    requiredDocuments?: string[];
  }) {
    return apiRequest<CscService>('/api/csc/services', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateService(id: string, payload: Partial<CscService>) {
    return apiRequest<CscService>(`/api/csc/services/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  duplicateService(id: string) {
    return apiRequest<CscService>(`/api/csc/services/${encodeURIComponent(id)}/duplicate`, {
      method: 'POST',
      body: '{}',
    });
  },

  updateServiceRate(
    id: string,
    payload: {
      serviceCharge: number;
      govtFee: number;
      unitType: UnitType;
      effectiveDate?: string;
      changeReason?: string;
    }
  ) {
    return apiRequest<{ service: CscService; historyEntry: CscRateHistoryEntry }>(
      `/api/csc/services/${encodeURIComponent(id)}/rate`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      }
    );
  },

  getRateHistory(serviceId?: string) {
    const qs = serviceId ? `?serviceId=${encodeURIComponent(serviceId)}` : '';
    return apiRequest<CscRateHistoryEntry[]>(`/api/csc/rate-history${qs}`);
  },

  // PVC Card Printing Module
  getPvcCardTypes() {
    return apiRequest<PvcCardType[]>('/api/csc/pvc/card-types');
  },

  createPvcCardType(payload: { name: string; description?: string }) {
    return apiRequest<PvcCardType>('/api/csc/pvc/card-types', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updatePvcCardType(id: string, payload: Partial<PvcCardType>) {
    return apiRequest<PvcCardType>(`/api/csc/pvc/card-types/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  getPvcSlabs(mode?: 'INDIVIDUAL' | 'WHOLESALE') {
    const qs = mode ? `?mode=${mode}` : '';
    return apiRequest<PvcRateSlab[]>(`/api/csc/pvc/slabs${qs}`);
  },

  savePvcSlab(payload: {
    id?: string;
    mode: 'INDIVIDUAL' | 'WHOLESALE';
    minQty: number;
    maxQty: number;
    ratePerCard: number;
    active?: boolean;
  }) {
    if (payload.id) {
      return apiRequest<PvcRateSlab>(`/api/csc/pvc/slabs/${encodeURIComponent(payload.id)}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
    }
    return apiRequest<PvcRateSlab>('/api/csc/pvc/slabs', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  deletePvcSlab(id: string) {
    return apiRequest<{ deleted: boolean }>(`/api/csc/pvc/slabs/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  quotePvc(mode: 'INDIVIDUAL' | 'WHOLESALE', items: Array<{ cardTypeId: string; quantity: number }>) {
    return apiRequest<{
      mode: 'INDIVIDUAL' | 'WHOLESALE';
      items: PvcOrderItem[];
      totalCards: number;
      grandTotal: number;
    }>('/api/csc/pvc/quote', {
      method: 'POST',
      body: JSON.stringify({ mode, items }),
    });
  },

  getWholesaleShops() {
    return apiRequest<WholesaleShop[]>('/api/csc/pvc/shops');
  },

  createWholesaleShop(payload: {
    shopName: string;
    ownerName: string;
    mobile: string;
    altMobile?: string;
    address: string;
    remarks?: string;
  }) {
    return apiRequest<WholesaleShop>('/api/csc/pvc/shops', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateWholesaleShop(id: string, payload: Partial<WholesaleShop>) {
    return apiRequest<WholesaleShop>(`/api/csc/pvc/shops/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  getWholesaleShopProfile(id: string) {
    return apiRequest<WholesaleShopProfilePayload>(`/api/csc/pvc/shops/${encodeURIComponent(id)}/profile`);
  },

  getPvcOrders() {
    return apiRequest<PvcOrder[]>('/api/csc/pvc/orders');
  },

  createPvcOrder(payload: {
    orderMode: 'INDIVIDUAL' | 'WHOLESALE';
    customerId?: string;
    customerName?: string;
    mobile?: string;
    shopId?: string;
    address?: string;
    items: Array<{ cardTypeId: string; quantity: number }>;
    advancePayment?: number;
    paymentMethod?: string;
    paymentReference?: string;
    remarks?: string;
  }) {
    return apiRequest<PvcOrder>('/api/csc/pvc/orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  collectPvcPayment(
    orderId: string,
    payload: { amount: number; paymentMethod: string; paymentReference?: string; remarks?: string }
  ) {
    return apiRequest<{ order: PvcOrder; receipt: CscPaymentEntry }>(
      `/api/csc/pvc/orders/${encodeURIComponent(orderId)}/payments`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  updatePvcDelivery(orderId: string, deliveryStatus: PvcOrder['deliveryStatus']) {
    return apiRequest<PvcOrder>(`/api/csc/pvc/orders/${encodeURIComponent(orderId)}/delivery`, {
      method: 'PATCH',
      body: JSON.stringify({ deliveryStatus }),
    });
  },

  // Customers & CSC Service Orders
  getCscCustomers() {
    return apiRequest<CscCustomerExtended[]>('/api/csc/customers');
  },

  upsertCscCustomer(payload: Partial<CscCustomerExtended> & { aadhaarNumber?: string }) {
    return apiRequest<CscCustomerExtended>('/api/csc/customers', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  provisionCustomerPortal(customerId: string, password: string) {
    return apiRequest<{ userId: string; customerId: string; alreadyLinked?: boolean }>(
      `/api/csc/customers/${encodeURIComponent(customerId)}/portal-account`,
      {
        method: 'POST',
        body: JSON.stringify({ password }),
      }
    );
  },

  getCscOrders(params?: { moduleTag?: string; status?: string }) {
    const q = new URLSearchParams();
    if (params?.moduleTag) q.set('moduleTag', params.moduleTag);
    if (params?.status) q.set('status', params.status);
    const qs = q.toString();
    return apiRequest<CscOrderRecord[]>(`/api/csc/orders${qs ? `?${qs}` : ''}`);
  },

  createCscOrder(payload: {
    customerId?: string;
    customerName: string;
    mobile: string;
    address?: string;
    district?: string;
    blockOrMunicipality?: string;
    items: Array<{ serviceId: string; quantity: number }>;
    applicationDetails?: Record<string, string>;
    advancePayment?: number;
    paymentMethod?: string;
    paymentReference?: string;
    adminRemarks?: string;
    ekycMethod?: CscOrderRecord['ekycMethod'];
    ekycStatus?: CscOrderRecord['ekycStatus'];
    externalAckNo?: string;
    pmjayDetails?: CscOrderRecord['pmjayDetails'];
    mmsbyDetails?: CscOrderRecord['mmsbyDetails'];
    npciDetails?: CscOrderRecord['npciDetails'];
    cyberCrimeDetails?: CscOrderRecord['cyberCrimeDetails'];
  }) {
    return apiRequest<CscOrderRecord>('/api/csc/orders', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateCscOrderStatus(
    orderId: string,
    payload: {
      status: CscApplicationStatus;
      remarks?: string;
      ekycStatus?: CscOrderRecord['ekycStatus'];
      externalAckNo?: string;
    }
  ) {
    return apiRequest<CscOrderRecord>(`/api/csc/orders/${encodeURIComponent(orderId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  collectCscOrderPayment(
    orderId: string,
    payload: {
      amount: number;
      paymentMethod: string;
      paymentType?: CscPaymentEntry['paymentType'];
      paymentReference?: string;
      remarks?: string;
    }
  ) {
    return apiRequest<{ order: CscOrderRecord; receipt: CscPaymentEntry }>(
      `/api/csc/orders/${encodeURIComponent(orderId)}/payments`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  },

  // Private Document Vault
  getCscDocuments(params?: { customerId?: string; orderId?: string }) {
    const q = new URLSearchParams();
    if (params?.customerId) q.set('customerId', params.customerId);
    if (params?.orderId) q.set('orderId', params.orderId);
    const qs = q.toString();
    return apiRequest<CscDocumentRecord[]>(`/api/csc/documents${qs ? `?${qs}` : ''}`);
  },

  uploadCscDocument(payload: {
    customerId: string;
    orderId?: string;
    grievanceId?: string;
    category: string;
    docName: string;
    mimeType?: string;
    fileSizeBytes?: number;
    contentBase64?: string;
  }) {
    return apiRequest<CscDocumentRecord>('/api/csc/documents', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  verifyCscDocument(
    docId: string,
    status: 'Verified' | 'Rejected' | 'Re-upload Requested',
    reason?: string
  ) {
    return apiRequest<CscDocumentRecord>(`/api/csc/documents/${encodeURIComponent(docId)}/verify`, {
      method: 'PATCH',
      body: JSON.stringify({ status, reason }),
    });
  },

  // Grievance & RTI Module
  getGrievances() {
    return apiRequest<GrievanceRecord[]>('/api/csc/grievances');
  },

  createGrievance(payload: {
    customerId?: string;
    customerName: string;
    mobile: string;
    address?: string;
    district?: string;
    blockOrMunicipality?: string;
    complaintCategory: string;
    serviceType: GrievanceServiceType;
    department: string;
    authority?: string;
    complaintSubject: string;
    complaintDetails: string;
    externalAckNo?: string;
    serviceCharge?: number;
    govtFee?: number;
    paidAmount?: number;
    followUpDate?: string;
    isRti?: boolean;
    rtiType?: GrievanceRecord['rtiType'];
    pioName?: string;
    faaName?: string;
    adminRemarks?: string;
  }) {
    return apiRequest<GrievanceRecord>('/api/csc/grievances', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateGrievanceStatus(
    trackingId: string,
    payload: {
      complaintStatus?: GrievanceStatus;
      externalAckNo?: string;
      replySummary?: string;
      followUpNote?: string;
      nextActionDate?: string;
      paymentAmount?: number;
      remarks?: string;
    }
  ) {
    return apiRequest<GrievanceRecord>(
      `/api/csc/grievances/${encodeURIComponent(trackingId)}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    );
  },

  // Payment Methods & Receipts & Operators & Portal
  getPaymentMethods() {
    return apiRequest<CscPaymentMethodItem[]>('/api/csc/payment-methods');
  },

  addPaymentMethod(name: string) {
    return apiRequest<CscPaymentMethodItem>('/api/csc/payment-methods', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  },

  getReceipts() {
    return apiRequest<CscPaymentEntry[]>('/api/csc/receipts');
  },

  reprintReceipt(receiptNumber: string) {
    return apiRequest<CscReceiptPayload>(
      `/api/csc/receipts/${encodeURIComponent(receiptNumber)}/reprint`,
      {
        method: 'POST',
        body: '{}',
      }
    );
  },

  getOperators() {
    return apiRequest<CscOperatorSummary[]>('/api/csc/operators');
  },

  updateOperatorPermissions(userId: string, permissions: Partial<Record<OperatorPermissionKey | string, boolean>>) {
    return apiRequest<{ userId: string; permissions: Record<string, boolean> }>(
      `/api/users/${encodeURIComponent(userId)}/permissions`,
      {
        method: 'PUT',
        body: JSON.stringify({ permissions }),
      }
    );
  },

  getPortalMe() {
    return apiRequest<CustomerPortalPayload>('/api/csc/portal/me');
  },

  // CSC Reports (Part 14 - 25 reports)
  getCscReportsCatalog() {
    return apiRequest<ReportCatalogItem[]>('/api/csc/reports/catalog');
  },

  generateCscReport(reportKey: string, filters: ReportFilterInput = {}) {
    return apiRequest<ReportDataset>('/api/csc/reports/generate', {
      method: 'POST',
      body: JSON.stringify({ reportKey, filters }),
    });
  },
};
