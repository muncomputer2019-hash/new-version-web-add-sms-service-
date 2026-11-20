import { round2 } from './finance/accountingEngine';
import { sanitizeText } from './crypto';
import {
  ALL_CSC_APPLICATION_STATUSES,
  ALL_GRIEVANCE_STATUSES,
  ALL_UNIT_TYPES,
  CscAdminDashboardKpis,
  CscApplicationStatus,
  CscCategory,
  CscCustomerExtended,
  CscDocumentRecord,
  CscOrderItemSnapshot,
  CscOrderRecord,
  CscPaymentEntry,
  CscPaymentStatus,
  CscRateHistoryEntry,
  CscService,
  CscServiceHistoryEntry,
  GRIEVANCE_SERVICE_TYPES,
  GrievanceRecord,
  GrievanceServiceType,
  GrievanceStatus,
  PvcCardType,
  PvcOrder,
  PvcOrderItem,
  PvcRateSlab,
  UnitType,
  WholesaleShop,
} from '../shared/cscTypes';
import {
  buildInitialCscCategories,
  buildInitialCscServices,
  buildInitialIndividualPvcSlabs,
  buildInitialPvcCardTypes,
} from '../shared/cscCatalogSeed';

const FORBIDDEN_FIELD_REGEX =
  /^(otp|aadhaar_?otp|upi_?pin|atm_?pin|pin|cvv|card_?cvv|bank_?password|netbanking_?password|mpin)$/i;

export function assertNoForbiddenSensitiveFields(payload: unknown, path = 'body'): void {
  if (!payload || typeof payload !== 'object') return;
  if (Array.isArray(payload)) {
    payload.forEach((item, idx) => assertNoForbiddenSensitiveFields(item, `${path}[${idx}]`));
    return;
  }
  for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
    if (FORBIDDEN_FIELD_REGEX.test(k.trim())) {
      throw new Error(
        `Security Policy Violation: Sensitive credential field '${k}' must NEVER be transmitted or stored.`
      );
    }
    if (v && typeof v === 'object') {
      assertNoForbiddenSensitiveFields(v, `${path}.${k}`);
    }
  }
}

export function maskAadhaarString(raw?: string | null): string {
  if (!raw) return '';
  const str = String(raw).trim();
  const masked = str.replace(/\b(\d{4})[-\s]?(\d{4})[-\s]?(\d{4})\b/g, 'XXXX-XXXX-$3');
  if (/^\d{4}$/.test(masked)) return `XXXX-XXXX-${masked}`;
  return masked;
}

export function computePaymentStatus(
  totalAmount: number,
  totalPaid: number,
  refundedAmount = 0,
  explicitDueFlag = false
): CscPaymentStatus {
  if (refundedAmount > 0 && refundedAmount >= totalPaid && totalPaid > 0) {
    return 'Refunded';
  }
  const netPaid = round2(Math.max(0, totalPaid - refundedAmount));
  if (totalAmount <= 0) {
    return netPaid > 0 ? 'Paid' : 'Unpaid';
  }
  if (netPaid >= round2(totalAmount)) return 'Paid';
  if (netPaid > 0) return 'Partial';
  return explicitDueFlag ? 'Due' : 'Unpaid';
}

export class CscStore {
  public categories: CscCategory[] = [];
  public services: CscService[] = [];
  public rateHistory: CscRateHistoryEntry[] = [];
  public serviceHistory: CscServiceHistoryEntry[] = [];

  public pvcCardTypes: PvcCardType[] = [];
  public pvcSlabs: PvcRateSlab[] = [];
  public wholesaleShops: WholesaleShop[] = [];
  public pvcOrders: PvcOrder[] = [];

  public customers: CscCustomerExtended[] = [];
  public orders: CscOrderRecord[] = [];
  public grievances: GrievanceRecord[] = [];
  public documents: CscDocumentRecord[] = [];

  public paymentMethods: Array<{ id: string; name: string; active: boolean }> = [
    { id: 'PM-CASH', name: 'Cash', active: true },
    { id: 'PM-UPI', name: 'UPI', active: true },
    { id: 'PM-BANK', name: 'Bank Transfer', active: true },
    { id: 'PM-CARD', name: 'Debit / Credit Card', active: true },
  ];

  private orderSeq = 1;
  private pvcOrderSeq = 1;
  private grievanceSeq = 1;
  private receiptSeq = 1;
  private docSeq = 1;
  private customSvcSeq = 1000;
  private shopSeq = 1;
  private custSeq = 2;

  constructor() {
    const now = new Date().toISOString();
    this.categories = buildInitialCscCategories(now);
    this.services = buildInitialCscServices(now);
    this.pvcCardTypes = buildInitialPvcCardTypes(now);
    // Wholesale PVC slabs MUST initialize EMPTY — only 6 editable sample Individual slabs loaded
    this.pvcSlabs = buildInitialIndividualPvcSlabs(now);

    // Seed single linked portal customer account (no fake financial data or orders)
    this.customers.push({
      customerId: 'CSC-CUST-0001',
      fullName: 'Ananya Sen',
      mobile: '+919830001122',
      altMobile: '',
      email: 'ananya.sen@customer.local',
      address: 'Ward 08, North 24 Parganas',
      district: 'North 24 Parganas',
      blockOrMunicipality: 'Barasat-I',
      aadhaarMasked: 'XXXX-XXXX-4412',
      registrationDate: now.slice(0, 10),
      remarks: 'Linked Citizen Customer Portal Profile',
      accountStatus: 'Active',
      portalUid: 'MC2627110005',
      createdAt: now,
      updatedAt: now,
    });
  }

  private nextOrderId(): string {
    const yr = new Date().getFullYear();
    return `CSC-ORD-${yr}-${String(this.orderSeq++).padStart(4, '0')}`;
  }

  private nextPvcOrderId(mode: 'INDIVIDUAL' | 'WHOLESALE'): string {
    const yr = new Date().getFullYear();
    const tag = mode === 'WHOLESALE' ? 'WHL' : 'IND';
    return `PVC-${tag}-${yr}-${String(this.pvcOrderSeq++).padStart(4, '0')}`;
  }

  private nextGrievanceId(): string {
    const yr = new Date().getFullYear();
    return `GRV-${yr}-${String(this.grievanceSeq++).padStart(4, '0')}`;
  }

  private nextReceiptNo(): string {
    const yr = new Date().getFullYear();
    return `CSCRCP-${yr}-${String(this.receiptSeq++).padStart(5, '0')}`;
  }

  private nextDocId(): string {
    return `CSCDOC-${String(this.docSeq++).padStart(5, '0')}`;
  }

  private nextShopCode(): string {
    return `WSHP-${String(this.shopSeq++).padStart(4, '0')}`;
  }

  public nextCustomerId(): string {
    return `CSC-CUST-${String(this.custSeq++).padStart(4, '0')}`;
  }

  // ==========================================================================
  // CATEGORIES & SERVICES + RATE ENGINE
  // ==========================================================================
  public createCategory(input: {
    name: string;
    code?: string;
    icon?: string;
    description?: string;
    noticeText?: string;
  }): CscCategory {
    const name = sanitizeText(String(input.name || ''));
    if (name.length < 2) throw new Error('Category name must be at least 2 characters.');
    if (this.categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      throw new Error(`Category '${name}' already exists.`);
    }
    const now = new Date().toISOString();
    const num = this.categories.length + 1;
    const cat: CscCategory = {
      id: `CAT-${String(num).padStart(2, '0')}`,
      code: sanitizeText(input.code || `CAT-${num}`).toUpperCase(),
      name,
      icon: input.icon || 'FolderKanban',
      description: sanitizeText(input.description || `${name} digital center services.`),
      displayOrder: num,
      active: true,
      noticeText: input.noticeText ? sanitizeText(input.noticeText) : undefined,
      moduleTag: 'GENERAL',
      createdAt: now,
      updatedAt: now,
    };
    this.categories.push(cat);
    return cat;
  }

  public updateCategory(
    id: string,
    patch: Partial<Pick<CscCategory, 'name' | 'description' | 'active' | 'displayOrder' | 'noticeText' | 'icon'>>
  ): CscCategory {
    const cat = this.categories.find((c) => c.id === id);
    if (!cat) throw new Error('Category not found.');
    if (patch.name !== undefined) {
      const cleaned = sanitizeText(patch.name);
      if (cleaned.length < 2) throw new Error('Category name must be at least 2 characters.');
      cat.name = cleaned;
      for (const svc of this.services) {
        if (svc.categoryId === cat.id && svc.categoryName !== 'Ayushman Bharat PM-JAY') {
          svc.categoryName = cleaned;
        }
      }
    }
    if (patch.description !== undefined) cat.description = sanitizeText(patch.description);
    if (patch.active !== undefined) cat.active = Boolean(patch.active);
    if (patch.displayOrder !== undefined && Number.isFinite(Number(patch.displayOrder))) {
      cat.displayOrder = Number(patch.displayOrder);
    }
    if (patch.noticeText !== undefined) cat.noticeText = sanitizeText(patch.noticeText);
    if (patch.icon !== undefined) cat.icon = sanitizeText(patch.icon);
    cat.updatedAt = new Date().toISOString();
    return cat;
  }

  public createService(
    input: {
      categoryId: string;
      name: string;
      subGroup?: string;
      description?: string;
      requiredDocuments?: string[];
      moduleTag?: CscService['moduleTag'];
      availability?: 'Available' | 'Unavailable';
    },
    actorId: string
  ): CscService {
    const cat = this.categories.find((c) => c.id === input.categoryId);
    if (!cat) throw new Error('Selected category not found.');
    const name = sanitizeText(String(input.name || ''));
    if (name.length < 2) throw new Error('Service name must be at least 2 characters.');

    const seq = ++this.customSvcSeq;
    const now = new Date().toISOString();
    const svc: CscService = {
      id: `CSRV-C${seq}`,
      code: `${cat.code}-C${seq}`,
      categoryId: cat.id,
      categoryName: input.moduleTag === 'PMJAY' ? 'Ayushman Bharat PM-JAY' : cat.name,
      subGroup: input.subGroup ? sanitizeText(input.subGroup) : undefined,
      name,
      description: sanitizeText(input.description || `${cat.name} — ${name}`),
      // Strictly blank rate on creation until configured via Rate Editor
      serviceCharge: null,
      govtFee: null,
      totalAmount: null,
      unitType: null,
      rateConfigured: false,
      effectiveDate: null,
      requiredDocuments:
        Array.isArray(input.requiredDocuments) && input.requiredDocuments.length > 0
          ? input.requiredDocuments.map((d) => sanitizeText(d)).filter(Boolean)
          : ['Applicant ID Proof'],
      availability: input.availability === 'Unavailable' ? 'Unavailable' : 'Available',
      active: true,
      moduleTag: input.moduleTag ?? cat.moduleTag,
      createdAt: now,
      updatedAt: now,
      updatedBy: actorId,
    };
    this.services.unshift(svc);
    this.serviceHistory.unshift({
      id: `SH-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      serviceId: svc.id,
      action: 'CREATED',
      actorId,
      summary: `Created service '${svc.name}' under ${cat.name} (rate initially blank).`,
      changedAt: now,
    });
    return svc;
  }

  public updateService(
    serviceId: string,
    patch: Partial<{
      name: string;
      categoryId: string;
      subGroup: string;
      description: string;
      requiredDocuments: string[];
      availability: 'Available' | 'Unavailable';
      active: boolean;
    }>,
    actorId: string
  ): CscService {
    const svc = this.services.find((s) => s.id === serviceId);
    if (!svc) throw new Error('Service not found.');
    const now = new Date().toISOString();
    if (patch.name !== undefined) {
      const cleaned = sanitizeText(patch.name);
      if (cleaned.length < 2) throw new Error('Service name cannot be empty.');
      svc.name = cleaned;
    }
    if (patch.categoryId !== undefined && patch.categoryId !== svc.categoryId) {
      const cat = this.categories.find((c) => c.id === patch.categoryId);
      if (!cat) throw new Error('Target category not found.');
      svc.categoryId = cat.id;
      svc.categoryName = cat.name;
    }
    if (patch.subGroup !== undefined) svc.subGroup = sanitizeText(patch.subGroup) || undefined;
    if (patch.description !== undefined) svc.description = sanitizeText(patch.description);
    if (Array.isArray(patch.requiredDocuments)) {
      svc.requiredDocuments = patch.requiredDocuments.map((d) => sanitizeText(d)).filter(Boolean);
    }
    if (patch.availability !== undefined) {
      svc.availability = patch.availability === 'Unavailable' ? 'Unavailable' : 'Available';
    }
    if (patch.active !== undefined) {
      svc.active = Boolean(patch.active);
    }
    svc.updatedAt = now;
    svc.updatedBy = actorId;
    this.serviceHistory.unshift({
      id: `SH-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      serviceId: svc.id,
      action: 'UPDATED',
      actorId,
      summary: `Updated metadata/availability for '${svc.name}'.`,
      changedAt: now,
    });
    return svc;
  }

  public duplicateService(serviceId: string, actorId: string): CscService {
    const src = this.services.find((s) => s.id === serviceId);
    if (!src) throw new Error('Source service not found.');
    const created = this.createService(
      {
        categoryId: src.categoryId,
        name: `${src.name} (Copy)`,
        subGroup: src.subGroup,
        description: src.description,
        requiredDocuments: [...src.requiredDocuments],
        moduleTag: src.moduleTag,
        availability: src.availability,
      },
      actorId
    );
    this.serviceHistory.unshift({
      id: `SH-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      serviceId: created.id,
      action: 'DUPLICATED',
      actorId,
      summary: `Duplicated from ${src.code} (${src.name}).`,
      changedAt: created.createdAt,
    });
    return created;
  }

  public updateServiceRate(
    serviceId: string,
    input: {
      serviceCharge: number;
      govtFee: number;
      unitType: UnitType;
      effectiveDate?: string;
      changeReason?: string;
    },
    actorId: string
  ): { service: CscService; historyEntry: CscRateHistoryEntry } {
    const svc = this.services.find((s) => s.id === serviceId);
    if (!svc) throw new Error('Service not found.');

    const serviceCharge = Number(input.serviceCharge);
    const govtFee = Number(input.govtFee);
    if (!Number.isFinite(serviceCharge) || serviceCharge < 0) {
      throw new Error('Service Charge must be a valid non-negative number.');
    }
    if (!Number.isFinite(govtFee) || govtFee < 0) {
      throw new Error('Government Fee must be a valid non-negative number.');
    }
    if (!ALL_UNIT_TYPES.includes(input.unitType)) {
      throw new Error('Invalid Unit Type selected.');
    }

    const totalAmount = round2(serviceCharge + govtFee);
    const effectiveDate = input.effectiveDate
      ? sanitizeText(input.effectiveDate)
      : new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString();

    const historyEntry: CscRateHistoryEntry = {
      id: `RATEH-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      serviceId: svc.id,
      serviceCode: svc.code,
      serviceName: svc.name,
      categoryName: svc.categoryName,
      adminId: actorId,
      oldServiceCharge: svc.serviceCharge,
      newServiceCharge: round2(serviceCharge),
      oldGovtFee: svc.govtFee,
      newGovtFee: round2(govtFee),
      oldTotalAmount: svc.totalAmount,
      newTotalAmount: totalAmount,
      oldUnitType: svc.unitType,
      newUnitType: input.unitType,
      effectiveDate,
      changeReason: sanitizeText(input.changeReason || 'Rate configuration updated'),
      changedAt: now,
    };

    svc.serviceCharge = round2(serviceCharge);
    svc.govtFee = round2(govtFee);
    svc.totalAmount = totalAmount;
    svc.unitType = input.unitType;
    svc.rateConfigured = true;
    svc.effectiveDate = effectiveDate;
    svc.updatedAt = now;
    svc.updatedBy = actorId;

    this.rateHistory.unshift(historyEntry);
    this.serviceHistory.unshift({
      id: `SH-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      serviceId: svc.id,
      action: 'RATE_UPDATED',
      actorId,
      summary: `Rate set to SC ₹${svc.serviceCharge} + Govt ₹${svc.govtFee} = ₹${svc.totalAmount} (${svc.unitType}).`,
      changedAt: now,
    });

    return { service: svc, historyEntry };
  }

  // ==========================================================================
  // PVC PRINTING ENGINE (PART 5)
  // ==========================================================================
  public createPvcCardType(name: string, description?: string): PvcCardType {
    const cleaned = sanitizeText(name);
    if (cleaned.length < 2) throw new Error('PVC Card Type name is required.');
    if (this.pvcCardTypes.some((t) => t.name.toLowerCase() === cleaned.toLowerCase())) {
      throw new Error(`Card Type '${cleaned}' already exists.`);
    }
    const now = new Date().toISOString();
    const idx = this.pvcCardTypes.length + 1;
    const item: PvcCardType = {
      id: `PVC-TYPE-${String(idx).padStart(2, '0')}`,
      code: `PVC-${String(idx).padStart(2, '0')}`,
      name: cleaned,
      description: sanitizeText(description || `${cleaned} duplex thermal PVC card.`),
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    this.pvcCardTypes.push(item);
    return item;
  }

  public updatePvcCardType(id: string, patch: Partial<Pick<PvcCardType, 'name' | 'description' | 'active'>>): PvcCardType {
    const card = this.pvcCardTypes.find((c) => c.id === id);
    if (!card) throw new Error('PVC Card Type not found.');
    if (patch.name !== undefined) card.name = sanitizeText(patch.name);
    if (patch.description !== undefined) card.description = sanitizeText(patch.description);
    if (patch.active !== undefined) card.active = Boolean(patch.active);
    card.updatedAt = new Date().toISOString();
    return card;
  }

  public savePvcRateSlab(
    input: {
      id?: string;
      mode: 'INDIVIDUAL' | 'WHOLESALE';
      minQty: number;
      maxQty: number;
      ratePerCard: number;
      active?: boolean;
    },
    actorId: string
  ): PvcRateSlab {
    const minQty = Number(input.minQty);
    const maxQty = Number(input.maxQty);
    const ratePerCard = round2(Number(input.ratePerCard));
    const isActive = input.active !== undefined ? Boolean(input.active) : true;

    if (!Number.isInteger(minQty) || minQty < 1) {
      throw new Error('Minimum card quantity must be a whole number >= 1.');
    }
    if (!Number.isInteger(maxQty) || maxQty < minQty) {
      throw new Error('Maximum quantity must be a whole number >= Minimum quantity.');
    }
    if (!Number.isFinite(ratePerCard) || ratePerCard < 0) {
      throw new Error('Rate per card must be >= 0.');
    }

    if (isActive) {
      const conflict = this.pvcSlabs.find(
        (s) =>
          s.id !== input.id &&
          s.mode === input.mode &&
          s.active &&
          minQty <= s.maxQty &&
          maxQty >= s.minQty
      );
      if (conflict) {
        throw new Error(
          `Overlapping ${input.mode} PVC slab range (${minQty}–${maxQty}) conflicts with existing active slab (${conflict.minQty}–${conflict.maxQty}).`
        );
      }
    }

    const now = new Date().toISOString();
    if (input.id) {
      const existing = this.pvcSlabs.find((s) => s.id === input.id);
      if (!existing) throw new Error('PVC Rate Slab not found.');
      existing.minQty = minQty;
      existing.maxQty = maxQty;
      existing.ratePerCard = ratePerCard;
      existing.active = isActive;
      existing.updatedAt = now;
      existing.updatedBy = actorId;
      return existing;
    }

    const created: PvcRateSlab = {
      id: `PVC-${input.mode === 'WHOLESALE' ? 'WHL' : 'IND'}-SLAB-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      mode: input.mode,
      minQty,
      maxQty,
      ratePerCard,
      active: isActive,
      createdAt: now,
      updatedAt: now,
      updatedBy: actorId,
    };
    this.pvcSlabs.push(created);
    return created;
  }

  public deletePvcRateSlab(id: string): void {
    const idx = this.pvcSlabs.findIndex((s) => s.id === id);
    if (idx === -1) throw new Error('PVC Rate Slab not found.');
    this.pvcSlabs.splice(idx, 1);
  }

  public resolvePvcSlab(mode: 'INDIVIDUAL' | 'WHOLESALE', quantity: number): PvcRateSlab {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new Error('Card quantity must be a whole number >= 1.');
    }
    const slab = this.pvcSlabs.find(
      (s) => s.mode === mode && s.active && quantity >= s.minQty && quantity <= s.maxQty
    );
    if (!slab) {
      if (mode === 'WHOLESALE') {
        throw new Error(
          `No matching wholesale PVC rate slab configured for ${quantity} card(s). Admin must manually add a wholesale slab covering ${quantity}.`
        );
      }
      throw new Error(
        `No matching individual PVC rate slab configured for ${quantity} card(s).`
      );
    }
    return slab;
  }

  public createWholesaleShop(input: {
    shopName: string;
    ownerName: string;
    mobile: string;
    altMobile?: string;
    address: string;
    remarks?: string;
  }): WholesaleShop {
    const shopName = sanitizeText(input.shopName || '');
    const ownerName = sanitizeText(input.ownerName || '');
    const mobile = sanitizeText(input.mobile || '');
    const address = sanitizeText(input.address || '');
    if (shopName.length < 2 || ownerName.length < 2 || mobile.length < 8) {
      throw new Error('Shop Name, Owner Name, and valid Mobile number are required.');
    }
    const now = new Date().toISOString();
    const shop: WholesaleShop = {
      id: `WSHOP-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      shopCode: this.nextShopCode(),
      shopName,
      ownerName,
      mobile,
      altMobile: sanitizeText(input.altMobile || ''),
      address,
      registrationDate: now.slice(0, 10),
      remarks: sanitizeText(input.remarks || ''),
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    this.wholesaleShops.unshift(shop);
    return shop;
  }

  public updateWholesaleShop(
    id: string,
    patch: Partial<Pick<WholesaleShop, 'shopName' | 'ownerName' | 'mobile' | 'altMobile' | 'address' | 'remarks' | 'active'>>
  ): WholesaleShop {
    const shop = this.wholesaleShops.find((s) => s.id === id);
    if (!shop) throw new Error('Wholesale shop not found.');
    if (patch.shopName !== undefined) shop.shopName = sanitizeText(patch.shopName);
    if (patch.ownerName !== undefined) shop.ownerName = sanitizeText(patch.ownerName);
    if (patch.mobile !== undefined) shop.mobile = sanitizeText(patch.mobile);
    if (patch.altMobile !== undefined) shop.altMobile = sanitizeText(patch.altMobile);
    if (patch.address !== undefined) shop.address = sanitizeText(patch.address);
    if (patch.remarks !== undefined) shop.remarks = sanitizeText(patch.remarks);
    if (patch.active !== undefined) shop.active = Boolean(patch.active);
    shop.updatedAt = new Date().toISOString();
    return shop;
  }

  public getWholesaleShopProfile(shopId: string) {
    const shop = this.wholesaleShops.find((s) => s.id === shopId);
    if (!shop) throw new Error('Wholesale shop not found.');
    const shopOrders = this.pvcOrders.filter((o) => o.shopId === shopId);
    const totalOrders = shopOrders.length;
    const totalCardsPrinted = shopOrders.reduce((s, o) => s + o.totalCards, 0);
    const totalAmount = round2(shopOrders.reduce((s, o) => s + o.grandTotal, 0));
    const totalPaid = round2(shopOrders.reduce((s, o) => s + o.totalPaid, 0));
    const pendingDue = round2(shopOrders.reduce((s, o) => s + o.remainingDue, 0));
    return {
      shop,
      totalOrders,
      totalCardsPrinted,
      totalAmount,
      totalPaid,
      pendingDue,
      orders: shopOrders,
    };
  }

  public createPvcOrder(
    input: {
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
      orderDate?: string;
    },
    actor: { userId: string; fullName: string }
  ): PvcOrder {
    assertNoForbiddenSensitiveFields(input);
    if (!Array.isArray(input.items) || input.items.length === 0) {
      throw new Error('At least one PVC card item is required.');
    }

    let shop: WholesaleShop | undefined;
    let customerName = sanitizeText(input.customerName || '');
    let mobile = sanitizeText(input.mobile || '');
    let address = sanitizeText(input.address || '');

    if (input.orderMode === 'WHOLESALE') {
      if (!input.shopId) throw new Error('Wholesale shop selection is required for Wholesale PVC orders.');
      shop = this.wholesaleShops.find((s) => s.id === input.shopId);
      if (!shop) throw new Error('Selected Wholesale Shop not found.');
      customerName = customerName || shop.shopName;
      mobile = mobile || shop.mobile;
      address = address || shop.address;
    } else if (input.customerId) {
      const cust = this.customers.find((c) => c.customerId === input.customerId);
      if (cust) {
        customerName = customerName || cust.fullName;
        mobile = mobile || cust.mobile;
        address = address || cust.address;
      }
    }

    if (customerName.length < 2 || mobile.length < 8) {
      throw new Error('Customer / Shop name and valid mobile number are required.');
    }

    const builtItems: PvcOrderItem[] = input.items.map((line, idx) => {
      const cardType = this.pvcCardTypes.find((c) => c.id === line.cardTypeId && c.active);
      if (!cardType) throw new Error(`Invalid or inactive PVC Card Type at line ${idx + 1}.`);
      const qty = Number(line.quantity);
      const slab = this.resolvePvcSlab(input.orderMode, qty);
      return {
        lineId: `PVL-${idx + 1}`,
        cardTypeId: cardType.id,
        cardTypeName: cardType.name,
        quantity: qty,
        ratePerCard: slab.ratePerCard,
        lineTotal: round2(qty * slab.ratePerCard),
        slabId: slab.id,
      };
    });

    const totalCards = builtItems.reduce((s, i) => s + i.quantity, 0);
    const grandTotal = round2(builtItems.reduce((s, i) => s + i.lineTotal, 0));
    const advancePayment = round2(Math.max(0, Number(input.advancePayment ?? 0)));
    if (advancePayment > grandTotal) {
      throw new Error('Advance payment cannot exceed Grand Total.');
    }

    const now = new Date().toISOString();
    const orderId = this.nextPvcOrderId(input.orderMode);
    const orderDate = input.orderDate ? sanitizeText(input.orderDate) : now.slice(0, 10);
    const remainingDue = round2(Math.max(0, grandTotal - advancePayment));

    const payments: CscPaymentEntry[] = [];
    if (advancePayment > 0) {
      payments.push({
        receiptNumber: this.nextReceiptNo(),
        orderId,
        orderType: 'PVC_ORDER',
        customerId: input.customerId,
        customerName,
        mobile,
        amount: advancePayment,
        paymentType: advancePayment >= grandTotal ? 'Full' : 'Advance',
        paymentMethod: sanitizeText(input.paymentMethod || 'Cash'),
        paymentReference: input.paymentReference ? sanitizeText(input.paymentReference) : undefined,
        paymentDate: orderDate,
        operatorId: actor.userId,
        operatorName: actor.fullName,
        remarks: sanitizeText(input.remarks || 'Initial PVC Order Payment'),
        reprintCount: 0,
        createdAt: now,
      });
    }

    const order: PvcOrder = {
      id: orderId,
      orderId,
      orderMode: input.orderMode,
      customerId: input.customerId,
      customerName,
      mobile,
      shopId: shop?.id,
      shopName: shop?.shopName,
      shopOwnerName: shop?.ownerName,
      address,
      items: builtItems,
      totalCards,
      grandTotal,
      advancePayment,
      additionalPayments: 0,
      totalPaid: advancePayment,
      remainingDue,
      paymentStatus: computePaymentStatus(grandTotal, advancePayment),
      deliveryStatus: 'Pending',
      orderDate,
      operatorId: actor.userId,
      operatorName: actor.fullName,
      remarks: sanitizeText(input.remarks || ''),
      payments,
      createdAt: now,
      updatedAt: now,
    };

    this.pvcOrders.unshift(order);
    return order;
  }

  public collectPvcPayment(
    orderId: string,
    input: { amount: number; paymentMethod?: string; paymentReference?: string; remarks?: string },
    actor: { userId: string; fullName: string }
  ): { order: PvcOrder; receipt: CscPaymentEntry } {
    assertNoForbiddenSensitiveFields(input);
    const order = this.pvcOrders.find((o) => o.orderId === orderId || o.id === orderId);
    if (!order) throw new Error('PVC Order not found.');
    const amount = round2(Number(input.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Payment amount must be greater than zero.');
    }
    if (amount > order.remainingDue) {
      throw new Error(`Payment ₹${amount} exceeds remaining due ₹${order.remainingDue}.`);
    }

    const now = new Date().toISOString();
    const receipt: CscPaymentEntry = {
      receiptNumber: this.nextReceiptNo(),
      orderId: order.orderId,
      orderType: 'PVC_ORDER',
      customerId: order.customerId,
      customerName: order.customerName,
      mobile: order.mobile,
      amount,
      paymentType: 'Due Collection',
      paymentMethod: sanitizeText(input.paymentMethod || 'Cash'),
      paymentReference: input.paymentReference ? sanitizeText(input.paymentReference) : undefined,
      paymentDate: now.slice(0, 10),
      operatorId: actor.userId,
      operatorName: actor.fullName,
      remarks: sanitizeText(input.remarks || 'PVC Due Collection'),
      reprintCount: 0,
      createdAt: now,
    };

    order.payments.push(receipt);
    order.additionalPayments = round2(order.additionalPayments + amount);
    order.totalPaid = round2(order.totalPaid + amount);
    order.remainingDue = round2(Math.max(0, order.grandTotal - order.totalPaid));
    order.paymentStatus = computePaymentStatus(order.grandTotal, order.totalPaid);
    order.updatedAt = now;
    return { order, receipt };
  }

  public updatePvcDeliveryStatus(
    orderId: string,
    deliveryStatus: PvcOrder['deliveryStatus']
  ): PvcOrder {
    const order = this.pvcOrders.find((o) => o.orderId === orderId || o.id === orderId);
    if (!order) throw new Error('PVC Order not found.');
    order.deliveryStatus = deliveryStatus;
    order.updatedAt = new Date().toISOString();
    return order;
  }

  // ==========================================================================
  // CUSTOMERS EXTENDED
  // ==========================================================================
  public upsertCustomer(input: {
    customerId?: string;
    fullName: string;
    mobile: string;
    altMobile?: string;
    email?: string;
    address: string;
    district?: string;
    blockOrMunicipality?: string;
    aadhaarRawOrLast4?: string;
    remarks?: string;
    accountStatus?: CscCustomerExtended['accountStatus'];
    portalUid?: string;
  }): CscCustomerExtended {
    assertNoForbiddenSensitiveFields(input);
    const fullName = sanitizeText(input.fullName || '');
    const mobile = sanitizeText(input.mobile || '');
    const address = sanitizeText(input.address || '');
    if (fullName.length < 2 || mobile.length < 8) {
      throw new Error('Customer full name and valid mobile number are required.');
    }

    const now = new Date().toISOString();
    const cleanedAadhaar = input.aadhaarRawOrLast4
      ? String(input.aadhaarRawOrLast4).replace(/[^0-9]/g, '')
      : '';
    const aadhaarMasked =
      cleanedAadhaar.length >= 4 ? `XXXX-XXXX-${cleanedAadhaar.slice(-4)}` : undefined;

    if (input.customerId) {
      const existing = this.customers.find((c) => c.customerId === input.customerId);
      if (existing) {
        existing.fullName = fullName;
        existing.mobile = mobile;
        existing.altMobile = sanitizeText(input.altMobile || '');
        existing.email = sanitizeText(input.email || '');
        existing.address = address;
        existing.district = sanitizeText(input.district || existing.district);
        existing.blockOrMunicipality = sanitizeText(
          input.blockOrMunicipality || existing.blockOrMunicipality
        );
        if (aadhaarMasked) existing.aadhaarMasked = aadhaarMasked;
        if (input.remarks !== undefined) existing.remarks = sanitizeText(input.remarks);
        if (input.accountStatus) existing.accountStatus = input.accountStatus;
        if (input.portalUid) existing.portalUid = input.portalUid;
        existing.updatedAt = now;
        return existing;
      }
    }

    const cust: CscCustomerExtended = {
      customerId: input.customerId || this.nextCustomerId(),
      fullName,
      mobile,
      altMobile: sanitizeText(input.altMobile || ''),
      email: sanitizeText(input.email || ''),
      address: address || 'Local Address',
      district: sanitizeText(input.district || 'North 24 Parganas'),
      blockOrMunicipality: sanitizeText(input.blockOrMunicipality || ''),
      aadhaarMasked,
      registrationDate: now.slice(0, 10),
      remarks: sanitizeText(input.remarks || ''),
      accountStatus: input.accountStatus || 'Active',
      portalUid: input.portalUid,
      createdAt: now,
      updatedAt: now,
    };
    this.customers.unshift(cust);
    return cust;
  }

  // ==========================================================================
  // CSC ORDERS & APPLICATIONS (PARTS 3, 4, 8, 10, 12, 18)
  // ==========================================================================
  public createCscOrder(
    input: {
      customerId?: string;
      customerName?: string;
      mobile?: string;
      address?: string;
      items: Array<{ serviceId: string; quantity?: number }>;
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
      orderDate?: string;
    },
    actor: { userId: string; fullName: string }
  ): CscOrderRecord {
    assertNoForbiddenSensitiveFields(input);
    if (!Array.isArray(input.items) || input.items.length === 0) {
      throw new Error('At least one service must be selected for an order.');
    }

    // Resolve customer (create lightweight record if new customer details provided)
    let customer = input.customerId
      ? this.customers.find((c) => c.customerId === input.customerId)
      : undefined;
    if (!customer && input.customerName && input.mobile) {
      customer = this.customers.find((c) => c.mobile === sanitizeText(input.mobile!));
      if (!customer) {
        customer = this.upsertCustomer({
          fullName: input.customerName,
          mobile: input.mobile,
          address: input.address || 'Walk-in Citizen',
        });
      }
    }
    if (!customer) {
      throw new Error('Customer selection or full name + mobile number is required.');
    }

    // Build immutable rate snapshots and reject any service with BLANK / unconfigured rates!
    const snapshots: CscOrderItemSnapshot[] = input.items.map((line, idx) => {
      const svc = this.services.find((s) => s.id === line.serviceId || s.code === line.serviceId);
      if (!svc) throw new Error(`Service '${line.serviceId}' not found.`);
      if (!svc.active || svc.availability === 'Unavailable') {
        throw new Error(`Service '${svc.name}' is currently inactive or unavailable.`);
      }
      if (
        !svc.rateConfigured ||
        svc.serviceCharge === null ||
        svc.govtFee === null ||
        svc.totalAmount === null ||
        svc.unitType === null
      ) {
        throw new Error(
          `Rate is not configured for '${svc.name}'. Admin must configure Service Charge, Government Fee, and Unit Type before creating an order.`
        );
      }

      const qty = Math.max(1, Math.floor(Number(line.quantity ?? 1)));
      const lineServiceCharge = round2(svc.serviceCharge * qty);
      const lineGovtFee = round2(svc.govtFee * qty);
      const lineTotal = round2(lineServiceCharge + lineGovtFee);

      return {
        lineId: `ORDL-${idx + 1}`,
        categoryId: svc.categoryId,
        categoryName: svc.categoryName,
        serviceId: svc.id,
        serviceCode: svc.code,
        serviceName: svc.name,
        quantity: qty,
        unitType: svc.unitType,
        serviceChargeSnapshot: svc.serviceCharge,
        govtFeeSnapshot: svc.govtFee,
        unitTotalSnapshot: svc.totalAmount,
        lineServiceCharge,
        lineGovtFee,
        lineTotal,
        rateEffectiveDate: svc.effectiveDate,
      };
    });

    const primarySnap = snapshots[0];
    const primarySvc = this.services.find((s) => s.id === primarySnap.serviceId)!;
    const totalServiceCharge = round2(snapshots.reduce((s, i) => s + i.lineServiceCharge, 0));
    const totalGovtFee = round2(snapshots.reduce((s, i) => s + i.lineGovtFee, 0));
    const totalAmount = round2(totalServiceCharge + totalGovtFee);
    const advancePayment = round2(Math.max(0, Number(input.advancePayment ?? 0)));
    if (advancePayment > totalAmount) {
      throw new Error(`Advance payment ₹${advancePayment} cannot exceed order Total Amount ₹${totalAmount}.`);
    }

    const now = new Date().toISOString();
    const orderId = this.nextOrderId();
    const orderDate = input.orderDate ? sanitizeText(input.orderDate) : now.slice(0, 10);
    const remainingDue = round2(Math.max(0, totalAmount - advancePayment));

    // Sanitize and mask any Aadhaar numbers inside free-form application details
    const sanitizedDetails: Record<string, string> = {};
    if (input.applicationDetails && typeof input.applicationDetails === 'object') {
      for (const [k, v] of Object.entries(input.applicationDetails)) {
        sanitizedDetails[sanitizeText(k)] = maskAadhaarString(sanitizeText(String(v ?? '')));
      }
    }

    const payments: CscPaymentEntry[] = [];
    if (advancePayment > 0) {
      payments.push({
        receiptNumber: this.nextReceiptNo(),
        orderId,
        orderType: 'CSC_ORDER',
        customerId: customer.customerId,
        customerName: customer.fullName,
        mobile: customer.mobile,
        amount: advancePayment,
        paymentType: advancePayment >= totalAmount ? 'Full' : 'Advance',
        paymentMethod: sanitizeText(input.paymentMethod || 'Cash'),
        paymentReference: input.paymentReference ? sanitizeText(input.paymentReference) : undefined,
        paymentDate: orderDate,
        operatorId: actor.userId,
        operatorName: actor.fullName,
        remarks: sanitizeText(input.adminRemarks || 'Initial Order Payment'),
        reprintCount: 0,
        createdAt: now,
      });
    }

    const moduleTag = primarySvc.moduleTag;

    const order: CscOrderRecord = {
      id: orderId,
      orderId,
      customerId: customer.customerId,
      customerName: customer.fullName,
      mobile: customer.mobile,
      selectedCategoryId: primarySnap.categoryId,
      selectedCategoryName: primarySnap.categoryName,
      selectedServiceId: primarySnap.serviceId,
      selectedServiceName: primarySnap.serviceName,
      items: snapshots,
      applicationDetails: sanitizedDetails,
      documents: [],
      serviceCharge: totalServiceCharge,
      govtFee: totalGovtFee,
      totalAmount,
      advancePayment,
      additionalPayments: 0,
      refundedAmount: 0,
      totalPaid: advancePayment,
      remainingDue,
      orderDate,
      applicationStatus: 'Pending',
      paymentStatus: computePaymentStatus(totalAmount, advancePayment),
      operatorId: actor.userId,
      operatorName: actor.fullName,
      adminRemarks: sanitizeText(input.adminRemarks || ''),
      moduleTag,
      ekycMethod: input.ekycMethod ?? (moduleTag === 'PMJAY' || moduleTag === 'MMSBY' ? 'Aadhaar OTP' : 'Not Applicable'),
      ekycStatus: input.ekycStatus ?? (moduleTag === 'PMJAY' || moduleTag === 'MMSBY' ? 'Pending' : 'Not Applicable'),
      externalAckNo: input.externalAckNo ? sanitizeText(input.externalAckNo) : undefined,
      pmjayDetails: moduleTag === 'PMJAY' ? input.pmjayDetails : undefined,
      mmsbyDetails:
        moduleTag === 'MMSBY'
          ? {
              beneficiaryName: sanitizeText(input.mmsbyDetails?.beneficiaryName || customer.fullName),
              rationCardNo: input.mmsbyDetails?.rationCardNo
                ? sanitizeText(input.mmsbyDetails.rationCardNo)
                : undefined,
              distinctFromSwasthyaSathiConfirmed: true,
            }
          : undefined,
      npciDetails:
        moduleTag === 'NPCI'
          ? {
              subGroup: primarySvc.subGroup,
              bankName: input.npciDetails?.bankName ? sanitizeText(input.npciDetails.bankName) : undefined,
              pspApp: input.npciDetails?.pspApp ? sanitizeText(input.npciDetails.pspApp) : undefined,
              routedViaBankOrPspConfirmed: true,
            }
          : undefined,
      cyberCrimeDetails:
        moduleTag === 'CYBER_CRIME'
          ? {
              subGroup: primarySvc.subGroup,
              incidentDate: input.cyberCrimeDetails?.incidentDate
                ? sanitizeText(input.cyberCrimeDetails.incidentDate)
                : undefined,
              fraudAmount:
                input.cyberCrimeDetails?.fraudAmount !== undefined
                  ? Number(input.cyberCrimeDetails.fraudAmount)
                  : undefined,
              cyberAcknowledgementNo: input.cyberCrimeDetails?.cyberAcknowledgementNo
                ? sanitizeText(input.cyberCrimeDetails.cyberAcknowledgementNo)
                : undefined,
              helpline1930Advised: true,
              portalUrl: 'https://cybercrime.gov.in/',
            }
          : undefined,
      payments,
      statusHistory: [
        {
          id: `STH-${Date.now()}`,
          previousStatus: null,
          newStatus: 'Pending',
          changedBy: actor.userId,
          remarks: 'Order created with immutable rate snapshot.',
          changedAt: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
    };

    this.orders.unshift(order);
    return order;
  }

  public updateOrderStatus(
    orderId: string,
    nextStatus: CscApplicationStatus,
    actorId: string,
    remarks?: string,
    ekycStatus?: CscOrderRecord['ekycStatus'],
    externalAckNo?: string
  ): CscOrderRecord {
    const order = this.orders.find((o) => o.orderId === orderId || o.id === orderId);
    if (!order) throw new Error('CSC Order not found.');
    if (!ALL_CSC_APPLICATION_STATUSES.includes(nextStatus)) {
      throw new Error(`Invalid CSC application status '${nextStatus}'.`);
    }
    const now = new Date().toISOString();
    const prev = order.applicationStatus;
    order.applicationStatus = nextStatus;
    if (ekycStatus) order.ekycStatus = ekycStatus;
    if (externalAckNo !== undefined) order.externalAckNo = sanitizeText(externalAckNo);
    if (remarks) order.adminRemarks = sanitizeText(remarks);
    order.statusHistory.unshift({
      id: `STH-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      previousStatus: prev,
      newStatus: nextStatus,
      changedBy: actorId,
      remarks: sanitizeText(remarks || `Status changed from ${prev} to ${nextStatus}`),
      changedAt: now,
    });
    order.updatedAt = now;
    return order;
  }

  public collectOrderPayment(
    orderId: string,
    input: {
      amount: number;
      paymentMethod?: string;
      paymentReference?: string;
      remarks?: string;
      isRefund?: boolean;
    },
    actor: { userId: string; fullName: string }
  ): { order: CscOrderRecord; receipt: CscPaymentEntry } {
    assertNoForbiddenSensitiveFields(input);
    const order = this.orders.find((o) => o.orderId === orderId || o.id === orderId);
    if (!order) throw new Error('CSC Order not found.');

    const amount = round2(Number(input.amount));
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('Amount must be greater than zero.');
    }

    const now = new Date().toISOString();

    if (input.isRefund) {
      const netPaid = round2(order.totalPaid - order.refundedAmount);
      if (amount > netPaid) {
        throw new Error(`Refund ₹${amount} exceeds net paid ₹${netPaid}.`);
      }
      const receipt: CscPaymentEntry = {
        receiptNumber: this.nextReceiptNo(),
        orderId: order.orderId,
        orderType: 'CSC_ORDER',
        customerId: order.customerId,
        customerName: order.customerName,
        mobile: order.mobile,
        amount,
        paymentType: 'Refund',
        paymentMethod: sanitizeText(input.paymentMethod || 'Cash'),
        paymentReference: input.paymentReference ? sanitizeText(input.paymentReference) : undefined,
        paymentDate: now.slice(0, 10),
        operatorId: actor.userId,
        operatorName: actor.fullName,
        remarks: sanitizeText(input.remarks || 'Order Refund'),
        reprintCount: 0,
        createdAt: now,
      };
      order.payments.push(receipt);
      order.refundedAmount = round2(order.refundedAmount + amount);
      const effectivePaid = round2(Math.max(0, order.totalPaid - order.refundedAmount));
      order.remainingDue = round2(Math.max(0, order.totalAmount - effectivePaid));
      order.paymentStatus = computePaymentStatus(
        order.totalAmount,
        order.totalPaid,
        order.refundedAmount
      );
      order.updatedAt = now;
      return { order, receipt };
    }

    if (amount > order.remainingDue) {
      throw new Error(`Payment ₹${amount} exceeds remaining due ₹${order.remainingDue}.`);
    }

    const receipt: CscPaymentEntry = {
      receiptNumber: this.nextReceiptNo(),
      orderId: order.orderId,
      orderType: 'CSC_ORDER',
      customerId: order.customerId,
      customerName: order.customerName,
      mobile: order.mobile,
      amount,
      paymentType: 'Due Collection',
      paymentMethod: sanitizeText(input.paymentMethod || 'Cash'),
      paymentReference: input.paymentReference ? sanitizeText(input.paymentReference) : undefined,
      paymentDate: now.slice(0, 10),
      operatorId: actor.userId,
      operatorName: actor.fullName,
      remarks: sanitizeText(input.remarks || 'Due Collection'),
      reprintCount: 0,
      createdAt: now,
    };

    order.payments.push(receipt);
    order.additionalPayments = round2(order.additionalPayments + amount);
    order.totalPaid = round2(order.totalPaid + amount);
    const effectivePaid = round2(Math.max(0, order.totalPaid - order.refundedAmount));
    order.remainingDue = round2(Math.max(0, order.totalAmount - effectivePaid));
    order.paymentStatus = computePaymentStatus(order.totalAmount, order.totalPaid, order.refundedAmount);
    order.updatedAt = now;
    return { order, receipt };
  }

  // ==========================================================================
  // PRIVATE DOCUMENTS VAULT (PART 10)
  // ==========================================================================
  public uploadDocument(
    input: {
      customerId: string;
      orderId?: string;
      grievanceId?: string;
      category: string;
      docName: string;
      mimeType?: string;
      fileSizeBytes?: number;
      contentBase64?: string;
    },
    actorId: string
  ): CscDocumentRecord {
    assertNoForbiddenSensitiveFields(input);
    const docName = maskAadhaarString(sanitizeText(input.docName || ''));
    if (docName.length < 2) throw new Error('Document name is required.');
    const now = new Date().toISOString();
    const doc: CscDocumentRecord = {
      docId: this.nextDocId(),
      customerId: input.customerId,
      orderId: input.orderId,
      grievanceId: input.grievanceId,
      category: sanitizeText(input.category || 'Supporting Proof'),
      docName,
      mimeType: sanitizeText(input.mimeType || 'application/pdf'),
      fileSizeBytes: Number(input.fileSizeBytes ?? 0),
      contentBase64: input.contentBase64,
      verificationStatus: 'Pending',
      uploadedBy: actorId,
      uploadedAt: now,
      auditTrail: [
        {
          id: `DA-${Date.now()}`,
          action: 'UPLOADED',
          actorId,
          note: `Uploaded private document '${docName}'`,
          at: now,
        },
      ],
    };

    this.documents.unshift(doc);
    if (input.orderId) {
      const ord = this.orders.find((o) => o.orderId === input.orderId);
      if (ord) ord.documents.unshift(doc);
    }
    if (input.grievanceId) {
      const grv = this.grievances.find((g) => g.internalTrackingId === input.grievanceId);
      if (grv) grv.uploadedDocuments.unshift(doc);
    }
    return doc;
  }

  public verifyOrRejectDocument(
    docId: string,
    status: 'Verified' | 'Rejected' | 'Re-upload Requested',
    actorId: string,
    reason?: string
  ): CscDocumentRecord {
    const doc = this.documents.find((d) => d.docId === docId);
    if (!doc) throw new Error('Document not found.');
    const now = new Date().toISOString();
    doc.verificationStatus = status;
    doc.verifiedBy = actorId;
    doc.verifiedAt = now;
    if (status !== 'Verified') {
      doc.rejectionReason = sanitizeText(reason || 'Document requires correction.');
    } else {
      doc.rejectionReason = undefined;
    }
    doc.auditTrail.unshift({
      id: `DA-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      action:
        status === 'Verified'
          ? 'VERIFIED'
          : status === 'Re-upload Requested'
          ? 'REUPLOAD_REQUESTED'
          : 'REJECTED',
      actorId,
      note: sanitizeText(reason || `Marked ${status}`),
      at: now,
    });
    return doc;
  }

  // ==========================================================================
  // GRIEVANCE & RTI TRACKING (PART 9)
  // ==========================================================================
  public createGrievance(
    input: {
      customerId?: string;
      customerName: string;
      mobile: string;
      address?: string;
      district?: string;
      blockOrMunicipality?: string;
      complaintCategory: string;
      serviceType: GrievanceServiceType;
      department?: string;
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
    },
    actor: { userId: string; fullName: string }
  ): GrievanceRecord {
    assertNoForbiddenSensitiveFields(input);
    if (!GRIEVANCE_SERVICE_TYPES.includes(input.serviceType)) {
      throw new Error('Invalid Grievance / RTI Service Type selected.');
    }
    const linkedCust = input.customerId
      ? this.customers.find((c) => c.customerId === input.customerId)
      : undefined;
    const customerName = sanitizeText(input.customerName || linkedCust?.fullName || '');
    const mobile = sanitizeText(input.mobile || linkedCust?.mobile || '');
    const complaintSubject = sanitizeText(input.complaintSubject || '');
    if (customerName.length < 2 || mobile.length < 8 || complaintSubject.length < 3) {
      throw new Error('Customer name, mobile, and complaint subject are required.');
    }

    const serviceCharge = round2(Math.max(0, Number(input.serviceCharge ?? 0)));
    const govtFee = round2(Math.max(0, Number(input.govtFee ?? 0)));
    const totalAmount = round2(serviceCharge + govtFee);
    const paidAmount = round2(Math.max(0, Number(input.paidAmount ?? 0)));
    if (paidAmount > totalAmount) {
      throw new Error('Paid amount cannot exceed Total Grievance Fee.');
    }

    const now = new Date().toISOString();
    const trackingId = this.nextGrievanceId();
    const record: GrievanceRecord = {
      id: trackingId,
      internalTrackingId: trackingId,
      externalAckNo: sanitizeText(input.externalAckNo || ''),
      customerId: linkedCust?.customerId ?? input.customerId,
      customerName,
      mobile,
      address: sanitizeText(input.address || linkedCust?.address || ''),
      district: sanitizeText(input.district || 'North 24 Parganas'),
      blockOrMunicipality: sanitizeText(input.blockOrMunicipality || ''),
      complaintCategory: sanitizeText(input.complaintCategory),
      serviceType: input.serviceType,
      department: sanitizeText(input.department || 'General Administration'),
      authority: sanitizeText(input.authority || 'Public Grievance Officer'),
      complaintSubject,
      complaintDetails: maskAadhaarString(sanitizeText(input.complaintDetails || '')),
      uploadedDocuments: [],
      serviceCharge,
      govtFee,
      totalAmount,
      paidAmount,
      remainingDue: round2(Math.max(0, totalAmount - paidAmount)),
      paymentStatus: computePaymentStatus(totalAmount, paidAmount),
      submissionDate: now.slice(0, 10),
      followUpDate: input.followUpDate
        ? sanitizeText(input.followUpDate)
        : new Date(Date.now() + 7 * 86400_000).toISOString().slice(0, 10),
      complaintStatus: 'Submitted',
      isRti: Boolean(input.isRti || input.complaintCategory.toLowerCase().includes('rti')),
      rtiType: input.rtiType,
      pioName: input.pioName ? sanitizeText(input.pioName) : undefined,
      faaName: input.faaName ? sanitizeText(input.faaName) : undefined,
      adminRemarks: sanitizeText(input.adminRemarks || ''),
      operatorId: actor.userId,
      operatorName: actor.fullName,
      followUps: [],
      statusHistory: [
        {
          id: `GSTH-${Date.now()}`,
          previousStatus: null,
          newStatus: 'Submitted',
          changedBy: actor.userId,
          remarks: 'Grievance / RTI dossier registered for tracking.',
          changedAt: now,
        },
      ],
      createdAt: now,
      updatedAt: now,
    };

    this.grievances.unshift(record);
    return record;
  }

  public updateGrievanceStatus(
    trackingId: string,
    input: {
      complaintStatus?: GrievanceStatus;
      status?: GrievanceStatus;
      externalAckNo?: string;
      replySummary?: string;
      followUpDate?: string;
      followUpNotes?: string;
      followUpNote?: string;
      paymentAmount?: number;
      adminRemarks?: string;
    },
    actorId: string
  ): GrievanceRecord {
    const grv = this.grievances.find(
      (g) => g.internalTrackingId === trackingId || g.id === trackingId
    );
    if (!grv) throw new Error('Grievance / RTI record not found.');
    const nextStatus = input.complaintStatus ?? input.status;
    if (!nextStatus || !ALL_GRIEVANCE_STATUSES.includes(nextStatus)) {
      throw new Error(`Invalid grievance status '${nextStatus}'.`);
    }

    const now = new Date().toISOString();
    const prev = grv.complaintStatus;
    grv.complaintStatus = nextStatus;
    if (input.externalAckNo !== undefined) grv.externalAckNo = sanitizeText(input.externalAckNo);
    if (input.replySummary !== undefined) grv.replySummary = sanitizeText(input.replySummary);
    if (input.followUpDate) grv.followUpDate = sanitizeText(input.followUpDate);
    if (input.adminRemarks !== undefined) grv.adminRemarks = sanitizeText(input.adminRemarks);

    if (input.paymentAmount !== undefined && Number(input.paymentAmount) > 0) {
      const addAmt = round2(Number(input.paymentAmount));
      if (addAmt > grv.remainingDue) {
        throw new Error(`Payment ₹${addAmt} exceeds remaining grievance due ₹${grv.remainingDue}.`);
      }
      grv.paidAmount = round2(grv.paidAmount + addAmt);
      grv.remainingDue = round2(Math.max(0, grv.totalAmount - grv.paidAmount));
      grv.paymentStatus = computePaymentStatus(grv.totalAmount, grv.paidAmount);
    }

    const noteText = input.followUpNotes ?? input.followUpNote;
    if (noteText) {
      grv.followUps.unshift({
        id: `GFU-${Date.now()}`,
        followUpDate: now.slice(0, 10),
        notes: sanitizeText(noteText),
        nextActionDate: input.followUpDate,
        recordedBy: actorId,
        createdAt: now,
      });
    }

    grv.statusHistory.unshift({
      id: `GSTH-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      previousStatus: prev,
      newStatus: nextStatus,
      changedBy: actorId,
      remarks: sanitizeText(noteText || input.adminRemarks || `Moved to ${nextStatus}`),
      changedAt: now,
    });
    grv.updatedAt = now;
    return grv;
  }

  // ==========================================================================
  // RECEIPT LOOKUP & REPRINT (PART 12)
  // ==========================================================================
  public getReceiptPayload(receiptNumber: string, incrementReprint = false) {
    for (const ord of this.orders) {
      const p = ord.payments.find((pay) => pay.receiptNumber === receiptNumber);
      if (p) {
        if (incrementReprint) p.reprintCount += 1;
        return {
          receipt: p,
          orderId: ord.orderId,
          orderType: 'CSC_ORDER' as const,
          customerName: ord.customerName,
          mobile: ord.mobile,
          serviceCharge: ord.serviceCharge,
          govtFee: ord.govtFee,
          totalAmount: ord.totalAmount,
          totalPaid: round2(ord.totalPaid - ord.refundedAmount),
          remainingDue: ord.remainingDue,
          orderDate: ord.orderDate,
          items: ord.items.map((it) => ({
            name: it.serviceName,
            quantity: it.quantity,
            unitLabel: it.unitType,
            serviceCharge: it.lineServiceCharge,
            govtFee: it.lineGovtFee,
            lineTotal: it.lineTotal,
          })),
        };
      }
    }
    for (const pvc of this.pvcOrders) {
      const p = pvc.payments.find((pay) => pay.receiptNumber === receiptNumber);
      if (p) {
        if (incrementReprint) p.reprintCount += 1;
        return {
          receipt: p,
          orderId: pvc.orderId,
          orderType: 'PVC_ORDER' as const,
          customerName: pvc.shopName ? `${pvc.shopName} (${pvc.customerName})` : pvc.customerName,
          mobile: pvc.mobile,
          serviceCharge: pvc.grandTotal,
          govtFee: 0,
          totalAmount: pvc.grandTotal,
          totalPaid: pvc.totalPaid,
          remainingDue: pvc.remainingDue,
          orderDate: pvc.orderDate,
          items: pvc.items.map((it) => ({
            name: `${it.cardTypeName} (${pvc.orderMode})`,
            quantity: it.quantity,
            unitLabel: `₹${it.ratePerCard}/card`,
            serviceCharge: it.lineTotal,
            govtFee: 0,
            lineTotal: it.lineTotal,
          })),
        };
      }
    }
    throw new Error(`Receipt '${receiptNumber}' not found.`);
  }

  public listAllReceipts(): CscPaymentEntry[] {
    const list: CscPaymentEntry[] = [];
    for (const o of this.orders) list.push(...o.payments);
    for (const p of this.pvcOrders) list.push(...p.payments);
    return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  // ==========================================================================
  // ADMIN 24-KPI DASHBOARD (PART 13)
  // ==========================================================================
  public getDashboardKpis(filter?: { fromDate?: string; toDate?: string }): CscAdminDashboardKpis {
    const todayIso = new Date().toISOString().slice(0, 10);
    const monthPrefix = todayIso.slice(0, 7);

    const inRange = (dStr: string) => {
      const iso = dStr.slice(0, 10);
      if (filter?.fromDate && iso < filter.fromDate) return false;
      if (filter?.toDate && iso > filter.toDate) return false;
      return true;
    };

    const filteredOrders = this.orders.filter((o) => inRange(o.orderDate));
    const filteredPvc = this.pvcOrders.filter((p) => inRange(p.orderDate));
    const filteredGrievances = this.grievances.filter((g) => inRange(g.submissionDate));

    const pendingStatuses = new Set<CscApplicationStatus>([
      'Draft',
      'Pending',
      'Document Required',
      'e-KYC Pending',
    ]);
    const processingStatuses = new Set<CscApplicationStatus>([
      'Document Verified',
      'Ready to Process',
      'Processing',
      'e-KYC Completed',
      'Submitted',
      'Under Verification',
      'Approved',
      'Card Generated',
      'Card Downloaded',
    ]);
    const completedStatuses = new Set<CscApplicationStatus>(['Delivered', 'Completed']);

    const orderSales = filteredOrders
      .filter((o) => o.applicationStatus !== 'Cancelled')
      .reduce((s, o) => s + o.totalAmount, 0);
    const pvcSales = filteredPvc
      .filter((p) => p.deliveryStatus !== 'Cancelled')
      .reduce((s, p) => s + p.grandTotal, 0);
    const grvSales = filteredGrievances.reduce((s, g) => s + g.totalAmount, 0);
    const totalSales = round2(orderSales + pvcSales + grvSales);

    const orderCollection = filteredOrders.reduce(
      (s, o) => s + Math.max(0, o.totalPaid - o.refundedAmount),
      0
    );
    const pvcCollection = filteredPvc.reduce((s, p) => s + p.totalPaid, 0);
    const grvCollection = filteredGrievances.reduce((s, g) => s + g.paidAmount, 0);
    const totalCollection = round2(orderCollection + pvcCollection + grvCollection);

    const totalDue = round2(
      filteredOrders
        .filter((o) => o.applicationStatus !== 'Cancelled')
        .reduce((s, o) => s + o.remainingDue, 0) +
        filteredPvc
          .filter((p) => p.deliveryStatus !== 'Cancelled')
          .reduce((s, p) => s + p.remainingDue, 0) +
        filteredGrievances.reduce((s, g) => s + g.remainingDue, 0)
    );

    const todaysSales = round2(
      this.orders
        .filter((o) => o.orderDate === todayIso && o.applicationStatus !== 'Cancelled')
        .reduce((s, o) => s + o.totalAmount, 0) +
        this.pvcOrders
          .filter((p) => p.orderDate === todayIso && p.deliveryStatus !== 'Cancelled')
          .reduce((s, p) => s + p.grandTotal, 0)
    );
    const monthlySales = round2(
      this.orders
        .filter((o) => o.orderDate.startsWith(monthPrefix) && o.applicationStatus !== 'Cancelled')
        .reduce((s, o) => s + o.totalAmount, 0) +
        this.pvcOrders
          .filter((p) => p.orderDate.startsWith(monthPrefix) && p.deliveryStatus !== 'Cancelled')
          .reduce((s, p) => s + p.grandTotal, 0)
    );

    const statusBreakdown: Record<string, number> = {};
    for (const o of filteredOrders) {
      statusBreakdown[o.applicationStatus] = (statusBreakdown[o.applicationStatus] ?? 0) + 1;
    }

    const catMap = new Map<string, { categoryName: string; orders: number; sales: number }>();
    for (const o of filteredOrders) {
      const cur = catMap.get(o.selectedCategoryName) ?? {
        categoryName: o.selectedCategoryName,
        orders: 0,
        sales: 0,
      };
      cur.orders += 1;
      cur.sales = round2(cur.sales + o.totalAmount);
      catMap.set(o.selectedCategoryName, cur);
    }

    const dayMap = new Map<string, { date: string; sales: number; collection: number; orders: number }>();
    for (const o of filteredOrders) {
      const cur = dayMap.get(o.orderDate) ?? { date: o.orderDate, sales: 0, collection: 0, orders: 0 };
      cur.sales = round2(cur.sales + o.totalAmount);
      cur.collection = round2(cur.collection + Math.max(0, o.totalPaid - o.refundedAmount));
      cur.orders += 1;
      dayMap.set(o.orderDate, cur);
    }
    for (const p of filteredPvc) {
      const cur = dayMap.get(p.orderDate) ?? { date: p.orderDate, sales: 0, collection: 0, orders: 0 };
      cur.sales = round2(cur.sales + p.grandTotal);
      cur.collection = round2(cur.collection + p.totalPaid);
      cur.orders += 1;
      dayMap.set(p.orderDate, cur);
    }

    return {
      totalCustomers: this.customers.length,
      totalCategories: this.categories.length,
      totalServices: this.services.length,
      activeServices: this.services.filter((s) => s.active).length,
      inactiveServices: this.services.filter((s) => !s.active).length,
      totalOrders: filteredOrders.length + filteredPvc.length,
      pendingApplications: filteredOrders.filter((o) => pendingStatuses.has(o.applicationStatus)).length,
      processingApplications: filteredOrders.filter((o) => processingStatuses.has(o.applicationStatus)).length,
      completedApplications: filteredOrders.filter((o) => completedStatuses.has(o.applicationStatus)).length,
      totalSales,
      totalCollection,
      totalDue,
      todaysSales,
      monthlySales,
      pvcIndividualOrders: filteredPvc.filter((p) => p.orderMode === 'INDIVIDUAL').length,
      pvcWholesaleOrders: filteredPvc.filter((p) => p.orderMode === 'WHOLESALE').length,
      totalPvcCardsPrinted: filteredPvc
        .filter((p) => p.deliveryStatus !== 'Cancelled')
        .reduce((s, p) => s + p.totalCards, 0),
      pvcPendingOrders: filteredPvc.filter(
        (p) => p.deliveryStatus === 'Pending' || p.deliveryStatus === 'Printing'
      ).length,
      totalGrievances: filteredGrievances.length,
      pendingGrievances: filteredGrievances.filter(
        (g) => !['Resolved', 'Rejected', 'Closed'].includes(g.complaintStatus)
      ).length,
      mmsbyOrders: filteredOrders.filter((o) => o.moduleTag === 'MMSBY').length,
      ayushmanBharatOrders: filteredOrders.filter((o) => o.moduleTag === 'PMJAY').length,
      ekycPending: filteredOrders.filter((o) => o.ekycStatus === 'Pending').length,
      ekycCompleted: filteredOrders.filter((o) => o.ekycStatus === 'Completed').length,
      statusBreakdown,
      dailySalesTrend: Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
      categoryBreakdown: Array.from(catMap.values()).sort((a, b) => b.sales - a.sales),
    };
  }
}
