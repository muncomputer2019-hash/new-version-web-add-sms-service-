import { Express, Request, RequestHandler, Response } from 'express';
import { hashPassword, sanitizeText } from './crypto';
import { CscStore, assertNoForbiddenSensitiveFields, maskAadhaarString } from './cscStore';
import { SecurityStore } from './securityStore';
import { OperatorPermissionKey } from '../shared/cscTypes';
import { ServerSession, ServerUser } from './types';

interface AuthedRequest extends Request {
  authUser?: ServerUser;
  authSession?: ServerSession;
}

function ok(res: Response, data: unknown, message = 'OK', status = 200) {
  return res.status(status).json({
    success: true,
    message,
    data,
    meta: { timestamp: new Date().toISOString() },
  });
}

function fail(res: Response, message: string, status = 400) {
  return res.status(status).json({
    success: false,
    message,
    data: null,
    meta: { timestamp: new Date().toISOString() },
  });
}

function getClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || '127.0.0.1';
}

export function registerCscRoutes(
  app: Express,
  securityStore: SecurityStore,
  cscStore: CscStore,
  requireAuth: RequestHandler
): void {
  const resolveCustomerForPortal = (actor: ServerUser) =>
    cscStore.customers.find(
      (c) => c.portalUid === actor.userId || (actor.mobile && c.mobile === actor.mobile)
    );

  const hasOperatorPerm = (actor: ServerUser, perm: OperatorPermissionKey): boolean => {
    if (actor.status !== 'ACTIVE') return false;
    if (actor.role === 'ADMIN') return true;
    if (actor.role === 'CUSTOMER') return false;
    const effective = securityStore.getEffectivePermissions(actor);
    return Boolean(effective[perm]);
  };

  const canEditRates = (actor: ServerUser): boolean => {
    if (actor.status !== 'ACTIVE') return false;
    if (actor.role === 'ADMIN') return true;
    if (actor.role === 'CUSTOMER') return false;
    const effective = securityStore.getEffectivePermissions(actor);
    return Boolean(effective['csc.rateEdit']);
  };

  // Global middleware for /api/csc/* to reject any forbidden sensitive credentials (OTP/PIN/CVV/Password)
  app.use('/api/csc', (req, res, next) => {
    try {
      if (req.body && Object.keys(req.body).length > 0) {
        assertNoForbiddenSensitiveFields(req.body);
      }
      return next();
    } catch (err) {
      return fail(res, err instanceof Error ? err.message : 'Forbidden sensitive field.', 422);
    }
  });

  // ==========================================================================
  // 1. BOOTSTRAP & PUBLIC-SAFE CATALOG METADATA
  // ==========================================================================
  app.get('/api/csc/workspace', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const effective = securityStore.getEffectivePermissions(actor);
    const portalCust = actor.role === 'CUSTOMER' ? resolveCustomerForPortal(actor) : undefined;

    const myOrders =
      actor.role === 'CUSTOMER'
        ? cscStore.orders.filter(
            (o) =>
              o.customerId === portalCust?.customerId ||
              (actor.mobile && o.mobile === actor.mobile)
          )
        : cscStore.orders;

    const myPvcOrders =
      actor.role === 'CUSTOMER'
        ? cscStore.pvcOrders.filter(
            (o) =>
              o.customerId === portalCust?.customerId ||
              (actor.mobile && o.mobile === actor.mobile)
          )
        : cscStore.pvcOrders;

    const myGrievances =
      actor.role === 'CUSTOMER'
        ? cscStore.grievances.filter(
            (g) =>
              g.customerId === portalCust?.customerId ||
              (actor.mobile && g.mobile === actor.mobile)
          )
        : cscStore.grievances;

    const myCustomers =
      actor.role === 'CUSTOMER'
        ? portalCust
          ? [portalCust]
          : []
        : cscStore.customers;

    return ok(res, {
      categories: cscStore.categories,
      servicesCount: cscStore.services.length,
      pvcCardTypes: cscStore.pvcCardTypes,
      pvcSlabs: actor.role === 'CUSTOMER' ? [] : cscStore.pvcSlabs,
      wholesaleShops: actor.role === 'CUSTOMER' ? [] : cscStore.wholesaleShops,
      customers: myCustomers,
      orders: myOrders,
      pvcOrders: myPvcOrders,
      grievances: myGrievances,
      paymentMethods: cscStore.paymentMethods,
      effectivePermissions: effective,
      kpis:
        actor.role === 'CUSTOMER'
          ? null
          : cscStore.getDashboardKpis(),
    });
  });

  app.get('/api/csc/dashboard-kpis', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    if (actor.role === 'CUSTOMER') {
      return fail(res, 'Forbidden: Admin/Operator dashboard KPIs are not available to customers.', 403);
    }
    const fromDate = typeof req.query.fromDate === 'string' ? req.query.fromDate : undefined;
    const toDate = typeof req.query.toDate === 'string' ? req.query.toDate : undefined;
    return ok(res, cscStore.getDashboardKpis({ fromDate, toDate }));
  });

  // ==========================================================================
  // 2. CATEGORIES & SERVICES + DYNAMIC RATE ENGINE (PARTS 1, 2, 3, 4)
  // ==========================================================================
  app.get('/api/csc/categories', requireAuth, (_req, res) => {
    return ok(res, cscStore.categories);
  });

  app.post('/api/csc/categories', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    if (actor.role !== 'ADMIN') return fail(res, 'Only ADMIN can create categories.', 403);
    try {
      const cat = cscStore.createCategory(req.body ?? {});
      securityStore.addAuditLog({
        actorUserId: actor.userId,
        action: 'CSC_CATEGORY_CREATE',
        targetType: 'csc_category',
        targetId: cat.id,
        details: `Created CSC category '${cat.name}'.`,
        ipAddress: getClientIp(req),
      });
      return ok(res, cat, 'Category created.', 201);
    } catch (err) {
      return fail(res, err instanceof Error ? err.message : 'Unable to create category.', 422);
    }
  });

  app.put('/api/csc/categories/:id', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    if (actor.role !== 'ADMIN') return fail(res, 'Only ADMIN can edit categories.', 403);
    try {
      const cat = cscStore.updateCategory(req.params.id, req.body ?? {});
      return ok(res, cat, 'Category updated.');
    } catch (err) {
      return fail(res, err instanceof Error ? err.message : 'Unable to update category.', 422);
    }
  });

  app.get('/api/csc/services', requireAuth, (req: AuthedRequest, res) => {
    const categoryId = typeof req.query.categoryId === 'string' ? req.query.categoryId : '';
    const moduleTag = typeof req.query.moduleTag === 'string' ? req.query.moduleTag : '';
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
    const rateStatus = typeof req.query.rateStatus === 'string' ? req.query.rateStatus : 'ALL';
    const activeOnly = req.query.activeOnly === 'true';

    let list = cscStore.services;
    if (categoryId && categoryId !== 'ALL') {
      list = list.filter((s) => s.categoryId === categoryId);
    }
    if (moduleTag && moduleTag !== 'ALL') {
      list = list.filter((s) => s.moduleTag === moduleTag);
    }
    if (activeOnly) {
      list = list.filter((s) => s.active && s.availability === 'Available');
    }
    if (rateStatus === 'CONFIGURED') {
      list = list.filter((s) => s.rateConfigured);
    } else if (rateStatus === 'BLANK') {
      list = list.filter((s) => !s.rateConfigured);
    }
    if (search) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(search) ||
          s.code.toLowerCase().includes(search) ||
          s.categoryName.toLowerCase().includes(search) ||
          (s.subGroup || '').toLowerCase().includes(search)
      );
    }
    return ok(res, list);
  });

  app.post('/api/csc/services', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    if (actor.role !== 'ADMIN') return fail(res, 'Only ADMIN can create CSC services.', 403);
    try {
      const svc = cscStore.createService(req.body ?? {}, actor.userId);
      securityStore.addAuditLog({
        actorUserId: actor.userId,
        action: 'CSC_SERVICE_CREATE',
        targetType: 'csc_service',
        targetId: svc.id,
        details: `Created CSC service '${svc.name}' with blank initial rates.`,
        ipAddress: getClientIp(req),
      });
      return ok(res, svc, 'Service created with blank initial rate.', 201);
    } catch (err) {
      return fail(res, err instanceof Error ? err.message : 'Unable to create service.', 422);
    }
  });

  app.put('/api/csc/services/:id', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    if (actor.role !== 'ADMIN') return fail(res, 'Only ADMIN can modify services.', 403);
    try {
      const svc = cscStore.updateService(req.params.id, req.body ?? {}, actor.userId);
      return ok(res, svc, 'Service updated.');
    } catch (err) {
      return fail(res, err instanceof Error ? err.message : 'Unable to update service.', 422);
    }
  });

  app.post('/api/csc/services/:id/duplicate', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    if (actor.role !== 'ADMIN') return fail(res, 'Only ADMIN can duplicate services.', 403);
    try {
      const copy = cscStore.duplicateService(req.params.id, actor.userId);
      return ok(res, copy, 'Service duplicated with blank rate.', 201);
    } catch (err) {
      return fail(res, err instanceof Error ? err.message : 'Unable to duplicate service.', 422);
    }
  });

  app.put('/api/csc/services/:id/rate', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    if (!canEditRates(actor)) {
      securityStore.addSecurityLog({
        actorUserId: actor.userId,
        eventType: 'UNAUTHORIZED_ACCESS',
        result: 'BLOCKED',
        ipAddress: getClientIp(req),
        deviceInfo: req.headers['user-agent'] || 'Client',
        summary: `Blocked unauthorized service rate edit attempt by ${actor.userId} (${actor.role}).`,
      });
      return fail(
        res,
        'Forbidden: Only ADMIN (or an Operator explicitly granted Rate Edit permission) can configure service rates.',
        403
      );
    }
    try {
      const result = cscStore.updateServiceRate(req.params.id, req.body ?? {}, actor.userId);
      securityStore.addAuditLog({
        actorUserId: actor.userId,
        action: 'CSC_RATE_UPDATE',
        targetType: 'csc_service',
        targetId: result.service.id,
        details: `Rate updated for '${result.service.name}' -> ₹${result.service.totalAmount} (${result.service.unitType}).`,
        ipAddress: getClientIp(req),
      });
      return ok(res, result, 'Service rate updated and history recorded.');
    } catch (err) {
      return fail(res, err instanceof Error ? err.message : 'Invalid rate update payload.', 422);
    }
  });

  app.get('/api/csc/rate-history', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    if (actor.role === 'CUSTOMER') return fail(res, 'Forbidden.', 403);
    const serviceId = typeof req.query.serviceId === 'string' ? req.query.serviceId : '';
    const rows = serviceId
      ? cscStore.rateHistory.filter((h) => h.serviceId === serviceId)
      : cscStore.rateHistory;
    return ok(res, rows);
  });

  // ==========================================================================
  // 3. PVC CARD PRINTING MODULE (PART 5)
  // ==========================================================================
  app.get('/api/csc/pvc/card-types', requireAuth, (_req, res) => {
    return ok(res, cscStore.pvcCardTypes);
  });

  app.post('/api/csc/pvc/card-types', requireAuth, (req: AuthedRequest, res) => {
    if (req.authUser!.role !== 'ADMIN') return fail(res, 'Only ADMIN can add card types.', 403);
    try {
      const created = cscStore.createPvcCardType(req.body?.name, req.body?.description);
      return ok(res, created, 'PVC Card Type added.', 201);
    } catch (err) {
      return fail(res, err instanceof Error ? err.message : 'Unable to add card type.', 422);
    }
  });

  app.put('/api/csc/pvc/card-types/:id', requireAuth, (req: AuthedRequest, res) => {
    if (req.authUser!.role !== 'ADMIN') return fail(res, 'Only ADMIN can update card types.', 403);
    try {
      return ok(res, cscStore.updatePvcCardType(req.params.id, req.body ?? {}));
    } catch (err) {
      return fail(res, err instanceof Error ? err.message : 'Unable to update card type.', 422);
    }
  });

  app.get('/api/csc/pvc/slabs', requireAuth, (req: AuthedRequest, res) => {
    if (req.authUser!.role === 'CUSTOMER') return fail(res, 'Forbidden.', 403);
    const mode = typeof req.query.mode === 'string' ? req.query.mode.toUpperCase() : '';
    const slabs =
      mode === 'INDIVIDUAL' || mode === 'WHOLESALE'
        ? cscStore.pvcSlabs.filter((s) => s.mode === mode)
        : cscStore.pvcSlabs;
    return ok(res, slabs);
  });

  app.post('/api/csc/pvc/slabs', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    if (!canEditRates(actor)) {
      return fail(res, 'Only ADMIN (or Rate-Edit authorized operator) can configure PVC slabs.', 403);
    }
    try {
      const saved = cscStore.savePvcRateSlab(req.body ?? {}, actor.userId);
      return ok(res, saved, 'PVC rate slab saved.', 201);
    } catch (err) {
      return fail(res, err instanceof Error ? err.message : 'Slab validation error.', 422);
    }
  });

  app.put('/api/csc/pvc/slabs/:id', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    if (!canEditRates(actor)) {
      return fail(res, 'Only ADMIN (or Rate-Edit authorized operator) can edit PVC slabs.', 403);
    }
    try {
      const saved = cscStore.savePvcRateSlab({ ...(req.body ?? {}), id: req.params.id }, actor.userId);
      return ok(res, saved, 'PVC rate slab updated.');
    } catch (err) {
      return fail(res, err instanceof Error ? err.message : 'Slab validation error.', 422);
    }
  });

  app.delete('/api/csc/pvc/slabs/:id', requireAuth, (req: AuthedRequest, res) => {
    if (req.authUser!.role !== 'ADMIN') return fail(res, 'Only ADMIN can delete PVC slabs.', 403);
    try {
      cscStore.deletePvcRateSlab(req.params.id);
      return ok(res, { deleted: true }, 'PVC rate slab deleted.');
    } catch (err) {
      return fail(res, err instanceof Error ? err.message : 'Slab not found.', 404);
    }
  });

  app.post('/api/csc/pvc/quote', requireAuth, (req: AuthedRequest, res) => {
    if (req.authUser!.role === 'CUSTOMER') return fail(res, 'Forbidden.', 403);
    try {
      const mode = req.body?.mode === 'WHOLESALE' ? 'WHOLESALE' : 'INDIVIDUAL';
      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      if (items.length === 0) return fail(res, 'At least one PVC item is required.', 422);
      const quotedLines = items.map((line: { cardTypeId: string; quantity: number }) => {
        const card = cscStore.pvcCardTypes.find((c) => c.id === line.cardTypeId);
        const qty = Number(line.quantity);
        const slab = cscStore.resolvePvcSlab(mode, qty);
        return {
          cardTypeId: line.cardTypeId,
          cardTypeName: card?.name || line.cardTypeId,
          quantity: qty,
          ratePerCard: slab.ratePerCard,
          lineTotal: Number((qty * slab.ratePerCard).toFixed(2)),
          slabId: slab.id,
        };
      });
      return ok(res, {
        mode,
        items: quotedLines,
        totalCards: quotedLines.reduce((s: number, l: { quantity: number }) => s + l.quantity, 0),
        grandTotal: Number(
          quotedLines.reduce((s: number, l: { lineTotal: number }) => s + l.lineTotal, 0).toFixed(2)
        ),
      });
    } catch (err) {
      return fail(res, err instanceof Error ? err.message : 'Unable to quote PVC order.', 422);
    }
  });

  app.get('/api/csc/pvc/shops', requireAuth, (req: AuthedRequest, res) => {
    if (req.authUser!.role === 'CUSTOMER') return fail(res, 'Forbidden.', 403);
    return ok(res, cscStore.wholesaleShops);
  });

  app.post('/api/csc/pvc/shops', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    if (!hasOperatorPerm(actor, 'csc.pvcOrderEntry') && actor.role !== 'ADMIN') {
      return fail(res, 'Forbidden: missing PVC order entry permission.', 403);
    }
    try {
      const shop = cscStore.createWholesaleShop(req.body ?? {});
      return ok(res, shop, 'Wholesale shop registered.', 201);
    } catch (err) {
      return fail(res, err instanceof Error ? err.message : 'Unable to register shop.', 422);
    }
  });

  app.put('/api/csc/pvc/shops/:id', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    if (actor.role === 'CUSTOMER') return fail(res, 'Forbidden.', 403);
    try {
      return ok(res, cscStore.updateWholesaleShop(req.params.id, req.body ?? {}));
    } catch (err) {
      return fail(res, err instanceof Error ? err.message : 'Unable to update shop.', 422);
    }
  });

  app.get('/api/csc/pvc/shops/:id/profile', requireAuth, (req: AuthedRequest, res) => {
    if (req.authUser!.role === 'CUSTOMER') return fail(res, 'Forbidden.', 403);
    try {
      return ok(res, cscStore.getWholesaleShopProfile(req.params.id));
    } catch (err) {
      return fail(res, err instanceof Error ? err.message : 'Shop not found.', 404);
    }
  });

  app.get('/api/csc/pvc/orders', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    if (actor.role === 'CUSTOMER') {
      const cust = resolveCustomerForPortal(actor);
      return ok(
        res,
        cscStore.pvcOrders.filter(
          (o) => o.customerId === cust?.customerId || (actor.mobile && o.mobile === actor.mobile)
        )
      );
    }
    return ok(res, cscStore.pvcOrders);
  });

  app.post('/api/csc/pvc/orders', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    if (!hasOperatorPerm(actor, 'csc.pvcOrderEntry')) {
      return fail(res, 'Forbidden: missing csc.pvcOrderEntry permission.', 403);
    }
    try {
      const order = cscStore.createPvcOrder(req.body ?? {}, actor);
      return ok(res, order, 'PVC order created.', 201);
    } catch (err) {
      return fail(res, err instanceof Error ? err.message : 'Unable to create PVC order.', 422);
    }
  });

  app.post('/api/csc/pvc/orders/:id/payments', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    if (!hasOperatorPerm(actor, 'csc.paymentEntry')) {
      return fail(res, 'Forbidden: missing csc.paymentEntry permission.', 403);
    }
    try {
      const result = cscStore.collectPvcPayment(req.params.id, req.body ?? {}, actor);
      return ok(res, result, 'PVC payment recorded.', 201);
    } catch (err) {
      return fail(res, err instanceof Error ? err.message : 'Payment error.', 422);
    }
  });

  app.patch('/api/csc/pvc/orders/:id/delivery', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    if (!hasOperatorPerm(actor, 'csc.statusUpdate')) {
      return fail(res, 'Forbidden: missing csc.statusUpdate permission.', 403);
    }
    try {
      return ok(
        res,
        cscStore.updatePvcDeliveryStatus(req.params.id, req.body?.deliveryStatus)
      );
    } catch (err) {
      return fail(res, err instanceof Error ? err.message : 'Unable to update delivery.', 422);
    }
  });

  // ==========================================================================
  // 4. CUSTOMERS DIRECTORY + PORTAL REGISTRATION (PART 6 & PART 8)
  // ==========================================================================
  app.get('/api/csc/customers', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    if (actor.role === 'CUSTOMER') {
      const cust = resolveCustomerForPortal(actor);
      return ok(res, cust ? [cust] : []);
    }
    if (!hasOperatorPerm(actor, 'csc.customerSearch') && actor.role !== 'AUDITOR') {
      return fail(res, 'Forbidden: missing customer search permission.', 403);
    }
    return ok(res, cscStore.customers);
  });

  app.post('/api/csc/customers', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    if (!hasOperatorPerm(actor, 'csc.customerReg')) {
      return fail(res, 'Forbidden: missing csc.customerReg permission.', 403);
    }
    try {
      const cust = cscStore.upsertCustomer(req.body ?? {});
      return ok(res, cust, 'Customer profile saved.', 201);
    } catch (err) {
      return fail(res, err instanceof Error ? err.message : 'Customer save error.', 422);
    }
  });

  app.post('/api/csc/customers/:customerId/portal-account', requireAuth, async (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    if (actor.role !== 'ADMIN' && !hasOperatorPerm(actor, 'csc.customerReg')) {
      return fail(res, 'Forbidden.', 403);
    }
    const cust = cscStore.customers.find((c) => c.customerId === req.params.customerId);
    if (!cust) return fail(res, 'Customer not found.', 404);
    const password = String(req.body?.password || '');
    if (password.length < 8) {
      return fail(res, 'Portal password must be at least 8 characters.', 422);
    }
    const existing = securityStore.users.find((u) => u.mobile === cust.mobile || u.userId === cust.portalUid);
    if (existing) {
      return ok(res, { userId: existing.userId, alreadyLinked: true }, 'Customer portal login already linked.');
    }
    const uid = await securityStore.sequenceService.allocateNext('CUSTOMER');
    const now = new Date().toISOString();
    const portalUser: ServerUser = {
      id: securityStore.users.length + 1,
      userId: uid,
      fullName: cust.fullName,
      role: 'CUSTOMER',
      mobile: cust.mobile,
      email: cust.email || undefined,
      address: cust.address,
      passwordHash: hashPassword(password),
      branch: 'Citizen Portal',
      status: 'ACTIVE',
      mobileVerified: true,
      emailVerified: Boolean(cust.email),
      failedLoginAttempts: 0,
      lockedUntil: null,
      createdBy: actor.userId,
      createdAt: now,
      updatedAt: now,
      passwordChangedAt: now,
      customPermissions: {},
    };
    securityStore.users.unshift(portalUser);
    cust.portalUid = uid;
    cust.updatedAt = now;
    return ok(res, { userId: uid, customerId: cust.customerId }, 'Customer portal account provisioned.', 201);
  });

  // ==========================================================================
  // 5. CSC SERVICE ORDERS, 17-STATUS UPDATES, PAYMENTS & RECEIPTS (PART 8, 12)
  // ==========================================================================
  app.get('/api/csc/orders', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    if (actor.role === 'CUSTOMER') {
      const cust = resolveCustomerForPortal(actor);
      return ok(
        res,
        cscStore.orders.filter(
          (o) => o.customerId === cust?.customerId || (actor.mobile && o.mobile === actor.mobile)
        )
      );
    }
    const moduleTag = typeof req.query.moduleTag === 'string' ? req.query.moduleTag : '';
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    let list = cscStore.orders;
    if (moduleTag && moduleTag !== 'ALL') {
      list = list.filter((o) => o.moduleTag === moduleTag);
    }
    if (status && status !== 'ALL') {
      list = list.filter((o) => o.applicationStatus === status);
    }
    return ok(res, list);
  });

  app.post('/api/csc/orders', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    if (!hasOperatorPerm(actor, 'csc.orderCreate') && !hasOperatorPerm(actor, 'csc.appEntry')) {
      return fail(res, 'Forbidden: missing csc.orderCreate / csc.appEntry permission.', 403);
    }
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    for (const item of items) {
      if (item?.serviceId) {
        const svcCheck = securityStore.canExecuteServiceOrder(actor, String(item.serviceId), 'EXECUTE');
        if (!svcCheck.allowed) {
          securityStore.addSecurityLog({
            actorUserId: actor.userId,
            eventType: 'UNAUTHORIZED_ACCESS',
            result: 'BLOCKED',
            ipAddress: getClientIp(req),
            deviceInfo: 'CSC Order Execution',
            summary: `Blocked ${actor.role} ${actor.userId} executing CSC service ${item.serviceId}: ${svcCheck.reason}`,
          });
          return fail(res, `Forbidden: ${svcCheck.reason}`, 403);
        }
      }
    }
    try {
      const order = cscStore.createCscOrder(req.body ?? {}, actor);
      securityStore.addAuditLog({
        actorUserId: actor.userId,
        action: 'CSC_ORDER_CREATE',
        targetType: 'csc_order',
        targetId: order.orderId,
        details: `Created CSC order ${order.orderId} for ${order.customerName} (₹${order.totalAmount}).`,
        ipAddress: getClientIp(req),
      });
      return ok(res, order, 'CSC Order created.', 201);
    } catch (err) {
      return fail(res, err instanceof Error ? err.message : 'Unable to create CSC order.', 422);
    }
  });

  app.patch('/api/csc/orders/:orderId/status', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    if (!hasOperatorPerm(actor, 'csc.statusUpdate')) {
      return fail(res, 'Forbidden: missing csc.statusUpdate permission.', 403);
    }
    try {
      const updated = cscStore.updateOrderStatus(
        req.params.orderId,
        req.body?.status,
        actor.userId,
        req.body?.remarks,
        req.body?.ekycStatus,
        req.body?.externalAckNo
      );
      return ok(res, updated, `Order moved to '${updated.applicationStatus}'.`);
    } catch (err) {
      return fail(res, err instanceof Error ? err.message : 'Unable to update status.', 422);
    }
  });

  app.post('/api/csc/orders/:orderId/payments', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    if (!hasOperatorPerm(actor, 'csc.paymentEntry')) {
      return fail(res, 'Forbidden: missing csc.paymentEntry permission.', 403);
    }
    try {
      const result = cscStore.collectOrderPayment(req.params.orderId, req.body ?? {}, actor);
      return ok(res, result, 'Order payment updated.', 201);
    } catch (err) {
      return fail(res, err instanceof Error ? err.message : 'Payment error.', 422);
    }
  });

  // ==========================================================================
  // 6. PRIVATE DOCUMENTS VAULT (PART 10)
  // ==========================================================================
  app.get('/api/csc/documents', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    if (actor.role === 'CUSTOMER') {
      const cust = resolveCustomerForPortal(actor);
      return ok(
        res,
        cscStore.documents.filter((d) => cust && d.customerId === cust.customerId)
      );
    }
    const customerId = typeof req.query.customerId === 'string' ? req.query.customerId : '';
    const orderId = typeof req.query.orderId === 'string' ? req.query.orderId : '';
    let list = cscStore.documents;
    if (customerId) list = list.filter((d) => d.customerId === customerId);
    if (orderId) list = list.filter((d) => d.orderId === orderId);
    return ok(res, list);
  });

  app.post('/api/csc/documents', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    if (actor.role === 'CUSTOMER') {
      const cust = resolveCustomerForPortal(actor);
      if (!cust || req.body?.customerId !== cust.customerId) {
        return fail(res, 'Forbidden: customers can only upload documents to their own profile.', 403);
      }
    } else if (!hasOperatorPerm(actor, 'csc.docUpload')) {
      return fail(res, 'Forbidden: missing csc.docUpload permission.', 403);
    }
    try {
      const doc = cscStore.uploadDocument(req.body ?? {}, actor.userId);
      return ok(res, doc, 'Private document uploaded.', 201);
    } catch (err) {
      return fail(res, err instanceof Error ? err.message : 'Document upload failed.', 422);
    }
  });

  app.patch('/api/csc/documents/:docId/verify', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    if (actor.role === 'CUSTOMER') {
      return fail(res, 'Forbidden: customers cannot verify documents.', 403);
    }
    try {
      const updated = cscStore.verifyOrRejectDocument(
        req.params.docId,
        req.body?.status,
        actor.userId,
        req.body?.reason
      );
      return ok(res, updated, `Document marked '${updated.verificationStatus}'.`);
    } catch (err) {
      return fail(res, err instanceof Error ? err.message : 'Unable to update document status.', 422);
    }
  });

  // ==========================================================================
  // 7. GRIEVANCE & RTI TRACKING (PART 9)
  // ==========================================================================
  app.get('/api/csc/grievances', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    if (actor.role === 'CUSTOMER') {
      const cust = resolveCustomerForPortal(actor);
      return ok(
        res,
        cscStore.grievances.filter(
          (g) => g.customerId === cust?.customerId || (actor.mobile && g.mobile === actor.mobile)
        )
      );
    }
    return ok(res, cscStore.grievances);
  });

  app.post('/api/csc/grievances', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    if (actor.role === 'CUSTOMER') {
      const cust = resolveCustomerForPortal(actor);
      const created = cscStore.createGrievance(
        {
          ...(req.body ?? {}),
          customerId: cust?.customerId,
          customerName: cust?.fullName || actor.fullName,
          mobile: cust?.mobile || actor.mobile,
        },
        actor
      );
      return ok(res, created, 'Grievance / RTI dossier registered.', 201);
    }
    if (!hasOperatorPerm(actor, 'csc.appEntry') && !hasOperatorPerm(actor, 'csc.orderCreate')) {
      return fail(res, 'Forbidden: missing csc.appEntry permission.', 403);
    }
    try {
      const created = cscStore.createGrievance(req.body ?? {}, actor);
      return ok(res, created, 'Grievance / RTI dossier created.', 201);
    } catch (err) {
      return fail(res, err instanceof Error ? err.message : 'Unable to create grievance.', 422);
    }
  });

  app.patch('/api/csc/grievances/:trackingId/status', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    if (actor.role === 'CUSTOMER') return fail(res, 'Forbidden.', 403);
    if (!hasOperatorPerm(actor, 'csc.statusUpdate')) {
      return fail(res, 'Forbidden: missing csc.statusUpdate permission.', 403);
    }
    try {
      const updated = cscStore.updateGrievanceStatus(req.params.trackingId, req.body ?? {}, actor.userId);
      return ok(res, updated, `Grievance status updated to '${updated.complaintStatus}'.`);
    } catch (err) {
      return fail(res, err instanceof Error ? err.message : 'Unable to update grievance.', 422);
    }
  });

  // ==========================================================================
  // 8. PAYMENT METHODS & A4 RECEIPTS (PARTS 8 & 12)
  // ==========================================================================
  app.get('/api/csc/payment-methods', requireAuth, (_req, res) => {
    return ok(res, cscStore.paymentMethods);
  });

  app.post('/api/csc/payment-methods', requireAuth, (req: AuthedRequest, res) => {
    if (req.authUser!.role !== 'ADMIN') return fail(res, 'Only ADMIN can configure payment methods.', 403);
    const name = sanitizeText(String(req.body?.name || ''));
    if (name.length < 2) return fail(res, 'Payment method name is required.', 422);
    if (cscStore.paymentMethods.some((m) => m.name.toLowerCase() === name.toLowerCase())) {
      return fail(res, 'Payment method already exists.', 409);
    }
    const item = { id: `PM-${Date.now()}`, name, active: true };
    cscStore.paymentMethods.push(item);
    return ok(res, item, 'Payment method added.', 201);
  });

  app.get('/api/csc/receipts', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const all = cscStore.listAllReceipts();
    if (actor.role === 'CUSTOMER') {
      const cust = resolveCustomerForPortal(actor);
      return ok(
        res,
        all.filter((r) => r.customerId === cust?.customerId || (actor.mobile && r.mobile === actor.mobile))
      );
    }
    return ok(res, all);
  });

  app.post('/api/csc/receipts/:receiptNumber/reprint', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    try {
      const payload = cscStore.getReceiptPayload(req.params.receiptNumber, true);
      if (actor.role === 'CUSTOMER') {
        const cust = resolveCustomerForPortal(actor);
        if (
          payload.receipt.customerId !== cust?.customerId &&
          payload.receipt.mobile !== actor.mobile
        ) {
          return fail(res, 'Forbidden: customers can only print their own receipts.', 403);
        }
      } else if (!hasOperatorPerm(actor, 'csc.receiptPrint')) {
        return fail(res, 'Forbidden: missing csc.receiptPrint permission.', 403);
      }
      return ok(res, payload, 'Receipt prepared for print.');
    } catch (err) {
      return fail(res, err instanceof Error ? err.message : 'Receipt not found.', 404);
    }
  });

  // ==========================================================================
  // 9. OPERATOR CONTROL & CUSTOMER PORTAL SELF-SERVICE (PARTS 7 & 15)
  // ==========================================================================
  app.get('/api/csc/operators', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    if (actor.role !== 'ADMIN' && actor.role !== 'MANAGER') {
      return fail(res, 'Forbidden: Admin/Manager access required.', 403);
    }
    const list = securityStore.users
      .filter((u) => u.role === 'STAFF' || u.role === 'MANAGER')
      .map((u) => ({
        userId: u.userId,
        fullName: u.fullName,
        role: u.role,
        status: u.status,
        mobile: u.mobile,
        permissions: securityStore.getEffectivePermissions(u),
      }));
    return ok(res, list);
  });

  app.get('/api/csc/portal/me', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const cust = resolveCustomerForPortal(actor);
    const orders = cscStore.orders.filter(
      (o) => o.customerId === cust?.customerId || (actor.mobile && o.mobile === actor.mobile)
    );
    const pvcOrders = cscStore.pvcOrders.filter(
      (o) => o.customerId === cust?.customerId || (actor.mobile && o.mobile === actor.mobile)
    );
    const grievances = cscStore.grievances.filter(
      (g) => g.customerId === cust?.customerId || (actor.mobile && g.mobile === actor.mobile)
    );
    const documents = cscStore.documents.filter((d) => cust && d.customerId === cust.customerId);
    const receipts = cscStore
      .listAllReceipts()
      .filter((r) => r.customerId === cust?.customerId || (actor.mobile && r.mobile === actor.mobile));

    return ok(res, {
      customer: cust ?? {
        customerId: actor.userId,
        fullName: actor.fullName,
        mobile: actor.mobile,
        address: actor.address,
        aadhaarMasked: actor.aadhaarLast4 ? maskAadhaarString(actor.aadhaarLast4) : undefined,
      },
      orders,
      pvcOrders,
      grievances,
      documents,
      receipts,
    });
  });
}
