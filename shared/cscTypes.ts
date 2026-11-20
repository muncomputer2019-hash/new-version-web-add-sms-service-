export type UnitType =
  | 'Per Application'
  | 'Per Page'
  | 'Per Card'
  | 'Per Copy'
  | 'Per Document'
  | 'Per Transaction'
  | 'Per Set'
  | 'Fixed Charge';

export const ALL_UNIT_TYPES: UnitType[] = [
  'Per Application',
  'Per Page',
  'Per Card',
  'Per Copy',
  'Per Document',
  'Per Transaction',
  'Per Set',
  'Fixed Charge',
];

export type CscApplicationStatus =
  | 'Draft'
  | 'Pending'
  | 'Document Required'
  | 'Document Verified'
  | 'Ready to Process'
  | 'Processing'
  | 'e-KYC Pending'
  | 'e-KYC Completed'
  | 'Submitted'
  | 'Under Verification'
  | 'Approved'
  | 'Rejected'
  | 'Card Generated'
  | 'Card Downloaded'
  | 'Delivered'
  | 'Completed'
  | 'Cancelled';

export const ALL_CSC_APPLICATION_STATUSES: CscApplicationStatus[] = [
  'Draft',
  'Pending',
  'Document Required',
  'Document Verified',
  'Ready to Process',
  'Processing',
  'e-KYC Pending',
  'e-KYC Completed',
  'Submitted',
  'Under Verification',
  'Approved',
  'Rejected',
  'Card Generated',
  'Card Downloaded',
  'Delivered',
  'Completed',
  'Cancelled',
];

export type CscPaymentStatus = 'Unpaid' | 'Partial' | 'Paid' | 'Due' | 'Refunded';

export type GrievanceStatus =
  | 'Draft'
  | 'Document Pending'
  | 'Ready to Submit'
  | 'Submitted'
  | 'Acknowledgement Received'
  | 'Under Process'
  | 'Forwarded'
  | 'Reply Received'
  | 'Resolved'
  | 'Rejected'
  | 'Closed';

export const ALL_GRIEVANCE_STATUSES: GrievanceStatus[] = [
  'Draft',
  'Document Pending',
  'Ready to Submit',
  'Submitted',
  'Acknowledgement Received',
  'Under Process',
  'Forwarded',
  'Reply Received',
  'Resolved',
  'Rejected',
  'Closed',
];

export type GrievanceServiceType =
  | 'Application Drafting'
  | 'Online Grievance Filing Assistance'
  | 'RTI & Appeal Assistance'
  | 'Complaint Status Tracking'
  | 'Acknowledgement Download'
  | 'Follow-up Assistance';

export const GRIEVANCE_SERVICE_TYPES: GrievanceServiceType[] = [
  'Application Drafting',
  'Online Grievance Filing Assistance',
  'RTI & Appeal Assistance',
  'Complaint Status Tracking',
  'Acknowledgement Download',
  'Follow-up Assistance',
];

export type CscModuleTag =
  | 'GENERAL'
  | 'PMJAY'
  | 'MMSBY'
  | 'NPCI'
  | 'CYBER_CRIME'
  | 'PVC'
  | 'GRIEVANCE'
  | 'RTI';

export interface CscCategory {
  id: string;
  code: string;
  name: string;
  icon: string;
  description: string;
  displayOrder: number;
  active: boolean;
  noticeText?: string;
  moduleTag: CscModuleTag;
  createdAt: string;
  updatedAt: string;
}

export interface CscService {
  id: string;
  code: string;
  categoryId: string;
  categoryName: string;
  subGroup?: string;
  name: string;
  description: string;
  serviceCharge: number | null;
  govtFee: number | null;
  totalAmount: number | null;
  unitType: UnitType | null;
  rateConfigured: boolean;
  effectiveDate: string | null;
  requiredDocuments: string[];
  availability: 'Available' | 'Unavailable';
  active: boolean;
  moduleTag: CscModuleTag;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

export interface CscRateHistoryEntry {
  id: string;
  serviceId: string;
  serviceCode: string;
  serviceName: string;
  categoryName: string;
  adminId: string;
  oldServiceCharge: number | null;
  newServiceCharge: number;
  oldGovtFee: number | null;
  newGovtFee: number;
  oldTotalAmount: number | null;
  newTotalAmount: number;
  oldUnitType: UnitType | null;
  newUnitType: UnitType;
  effectiveDate: string;
  changeReason: string;
  changedAt: string;
}

export interface CscServiceHistoryEntry {
  id: string;
  serviceId: string;
  action: 'CREATED' | 'UPDATED' | 'DUPLICATED' | 'ACTIVATED' | 'DEACTIVATED' | 'RATE_UPDATED' | 'DELETED';
  actorId: string;
  summary: string;
  changedAt: string;
}

export interface PvcCardType {
  id: string;
  code: string;
  name: string;
  description: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PvcRateSlab {
  id: string;
  mode: 'INDIVIDUAL' | 'WHOLESALE';
  minQty: number;
  maxQty: number;
  ratePerCard: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

export interface WholesaleShop {
  id: string;
  shopCode: string;
  shopName: string;
  ownerName: string;
  mobile: string;
  altMobile: string;
  address: string;
  registrationDate: string;
  remarks: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PvcOrderItem {
  lineId: string;
  cardTypeId: string;
  cardTypeName: string;
  quantity: number;
  ratePerCard: number;
  lineTotal: number;
  slabId: string;
}

export interface CscPaymentEntry {
  receiptNumber: string;
  orderId: string;
  orderType: 'CSC_ORDER' | 'PVC_ORDER' | 'GRIEVANCE';
  customerId?: string;
  customerName: string;
  mobile: string;
  amount: number;
  paymentType: 'Advance' | 'Partial' | 'Full' | 'Due Collection' | 'Refund';
  paymentMethod: string;
  paymentReference?: string;
  paymentDate: string;
  operatorId: string;
  operatorName: string;
  remarks: string;
  reprintCount: number;
  createdAt: string;
}

export interface PvcOrder {
  id: string;
  orderId: string;
  orderMode: 'INDIVIDUAL' | 'WHOLESALE';
  customerId?: string;
  customerName: string;
  mobile: string;
  shopId?: string;
  shopName?: string;
  shopOwnerName?: string;
  address?: string;
  items: PvcOrderItem[];
  totalCards: number;
  grandTotal: number;
  advancePayment: number;
  additionalPayments: number;
  totalPaid: number;
  remainingDue: number;
  paymentStatus: CscPaymentStatus;
  deliveryStatus: 'Pending' | 'Printing' | 'Ready for Delivery' | 'Delivered' | 'Cancelled';
  orderDate: string;
  operatorId: string;
  operatorName: string;
  remarks: string;
  payments: CscPaymentEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface CscOrderItemSnapshot {
  lineId: string;
  categoryId: string;
  categoryName: string;
  serviceId: string;
  serviceCode: string;
  serviceName: string;
  quantity: number;
  unitType: UnitType;
  serviceChargeSnapshot: number;
  govtFeeSnapshot: number;
  unitTotalSnapshot: number;
  lineServiceCharge: number;
  lineGovtFee: number;
  lineTotal: number;
  rateEffectiveDate: string | null;
}

export interface CscDocumentAuditEntry {
  id: string;
  action: 'UPLOADED' | 'VERIFIED' | 'REJECTED' | 'REUPLOAD_REQUESTED' | 'DOWNLOADED';
  actorId: string;
  note: string;
  at: string;
}

export interface CscDocumentRecord {
  docId: string;
  customerId: string;
  orderId?: string;
  grievanceId?: string;
  category: string;
  docName: string;
  mimeType: string;
  fileSizeBytes: number;
  contentBase64?: string;
  verificationStatus: 'Pending' | 'Verified' | 'Rejected' | 'Re-upload Requested';
  rejectionReason?: string;
  uploadedBy: string;
  verifiedBy?: string;
  uploadedAt: string;
  verifiedAt?: string;
  auditTrail: CscDocumentAuditEntry[];
}

export interface CscOrderStatusEvent {
  id: string;
  previousStatus: CscApplicationStatus | null;
  newStatus: CscApplicationStatus;
  changedBy: string;
  remarks: string;
  changedAt: string;
}

export interface CscOrderRecord {
  id: string;
  orderId: string;
  customerId: string;
  customerName: string;
  mobile: string;
  selectedCategoryId: string;
  selectedCategoryName: string;
  selectedServiceId: string;
  selectedServiceName: string;
  items: CscOrderItemSnapshot[];
  applicationDetails: Record<string, string>;
  documents: CscDocumentRecord[];
  serviceCharge: number;
  govtFee: number;
  totalAmount: number;
  advancePayment: number;
  additionalPayments: number;
  refundedAmount: number;
  totalPaid: number;
  remainingDue: number;
  orderDate: string;
  applicationStatus: CscApplicationStatus;
  paymentStatus: CscPaymentStatus;
  operatorId: string;
  operatorName: string;
  adminRemarks: string;
  moduleTag: CscModuleTag;
  ekycMethod?: 'Not Applicable' | 'Aadhaar OTP' | 'Face Auth' | 'Fingerprint Biometric' | 'IRIS Scan';
  ekycStatus?: 'Not Applicable' | 'Pending' | 'Completed' | 'Rejected';
  externalAckNo?: string;
  pmjayDetails?: {
    beneficiaryId?: string;
    familyId?: string;
    authorizedOperatorId?: string;
    hospitalName?: string;
  };
  mmsbyDetails?: {
    beneficiaryName?: string;
    rationCardNo?: string;
    distinctFromSwasthyaSathiConfirmed: true;
  };
  npciDetails?: {
    subGroup?: string;
    bankName?: string;
    pspApp?: string;
    routedViaBankOrPspConfirmed: true;
  };
  cyberCrimeDetails?: {
    subGroup?: string;
    incidentDate?: string;
    fraudAmount?: number;
    cyberAcknowledgementNo?: string;
    helpline1930Advised: true;
    portalUrl: 'https://cybercrime.gov.in/';
  };
  payments: CscPaymentEntry[];
  statusHistory: CscOrderStatusEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface GrievanceFollowUp {
  id: string;
  followUpDate: string;
  notes: string;
  nextActionDate?: string;
  recordedBy: string;
  createdAt: string;
}

export interface GrievanceRecord {
  id: string;
  internalTrackingId: string;
  externalAckNo: string;
  customerId?: string;
  customerName: string;
  mobile: string;
  address: string;
  district: string;
  blockOrMunicipality: string;
  complaintCategory: string;
  serviceType: GrievanceServiceType;
  department: string;
  authority: string;
  complaintSubject: string;
  complaintDetails: string;
  uploadedDocuments: CscDocumentRecord[];
  serviceCharge: number;
  govtFee: number;
  totalAmount: number;
  paidAmount: number;
  remainingDue: number;
  paymentStatus: CscPaymentStatus;
  submissionDate: string;
  followUpDate: string;
  complaintStatus: GrievanceStatus;
  isRti: boolean;
  rtiType?: 'Central RTI' | 'West Bengal RTI' | 'First Appeal' | 'Second Appeal' | 'PIO Application';
  pioName?: string;
  faaName?: string;
  replySummary?: string;
  adminRemarks: string;
  operatorId: string;
  operatorName: string;
  followUps: GrievanceFollowUp[];
  statusHistory: Array<{
    id: string;
    previousStatus: GrievanceStatus | null;
    newStatus: GrievanceStatus;
    changedBy: string;
    remarks: string;
    changedAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface CscCustomerExtended {
  customerId: string;
  fullName: string;
  mobile: string;
  altMobile?: string;
  email?: string;
  address: string;
  district: string;
  blockOrMunicipality: string;
  aadhaarMasked?: string;
  registrationDate: string;
  remarks: string;
  accountStatus: 'Active' | 'Inactive' | 'Blocked';
  portalUid?: string;
  createdAt: string;
  updatedAt: string;
}

export type OperatorPermissionKey =
  | 'csc.customerReg'
  | 'csc.orderCreate'
  | 'csc.appEntry'
  | 'csc.docUpload'
  | 'csc.paymentEntry'
  | 'csc.receiptPrint'
  | 'csc.statusUpdate'
  | 'csc.pvcOrderEntry'
  | 'csc.customerSearch'
  | 'csc.reportView'
  | 'csc.rateEdit';

export const OPERATOR_PERMISSION_DEFS: Array<{
  key: OperatorPermissionKey;
  label: string;
  description: string;
  defaultForStaff: boolean;
}> = [
  { key: 'csc.customerReg', label: 'Customer Registration', description: 'Register and update customer profiles', defaultForStaff: true },
  { key: 'csc.orderCreate', label: 'New Order Creation', description: 'Create multi-service CSC orders', defaultForStaff: true },
  { key: 'csc.appEntry', label: 'Application Entry', description: 'Fill and submit service application forms', defaultForStaff: true },
  { key: 'csc.docUpload', label: 'Document Upload', description: 'Upload and manage customer documents', defaultForStaff: true },
  { key: 'csc.paymentEntry', label: 'Payment Entry', description: 'Collect advance, partial, and due payments', defaultForStaff: true },
  { key: 'csc.receiptPrint', label: 'Receipt Printing', description: 'Print and reprint A4 payment receipts', defaultForStaff: true },
  { key: 'csc.statusUpdate', label: 'Application Status Update', description: 'Progress application workflow statuses', defaultForStaff: true },
  { key: 'csc.pvcOrderEntry', label: 'PVC Order Entry', description: 'Create Individual and Wholesale PVC orders', defaultForStaff: true },
  { key: 'csc.customerSearch', label: 'Customer Search', description: 'Search customer directory and order history', defaultForStaff: true },
  { key: 'csc.reportView', label: 'Report View (If Authorized)', description: 'View operational CSC & service reports', defaultForStaff: false },
  { key: 'csc.rateEdit', label: 'Service Rate Edit (Admin Grant)', description: 'Allow changing service charges/govt fees (default disabled)', defaultForStaff: false },
];

export interface CscAdminDashboardKpis {
  totalCustomers: number;
  totalCategories: number;
  totalServices: number;
  activeServices: number;
  inactiveServices: number;
  totalOrders: number;
  pendingApplications: number;
  processingApplications: number;
  completedApplications: number;
  totalSales: number;
  totalCollection: number;
  totalDue: number;
  todaysSales: number;
  monthlySales: number;
  pvcIndividualOrders: number;
  pvcWholesaleOrders: number;
  totalPvcCardsPrinted: number;
  pvcPendingOrders: number;
  totalGrievances: number;
  pendingGrievances: number;
  mmsbyOrders: number;
  ayushmanBharatOrders: number;
  ekycPending: number;
  ekycCompleted: number;
  statusBreakdown: Record<string, number>;
  dailySalesTrend: Array<{ date: string; sales: number; collection: number; orders: number }>;
  categoryBreakdown: Array<{ categoryName: string; orders: number; sales: number }>;
}
