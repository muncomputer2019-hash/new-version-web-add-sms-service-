import { Express, NextFunction, Request, Response, Router } from 'express';
import { SecurityStore } from '../securityStore';
import { ServerSession, ServerUser } from '../types';
import { generateNumericOtp, generateToken, hmacOtp, sanitizeText } from '../crypto';
import { Phase08Store } from './phase08Store';
import { BackupSchedulerService } from './backupScheduler';
import {
  DeletedRecordItem,
  OtpChannel,
  RestoreScopeKey,
  SecurityIncidentRecord,
} from './phase08Types';
import { parsePrivacyDeviceMetadata } from './phase08Crypto';

interface AuthedRequest extends Request {
  authUser?: ServerUser;
  authSession?: ServerSession;
}

function getClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) {
    return fwd.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || '127.0.0.1';
}

function apiOk(res: Response, data: unknown, message = 'OK', status = 200) {
  return res.status(status).json({
    success: true,
    message,
    data,
    meta: { timestamp: new Date().toISOString() },
  });
}

function apiFail(
  res: Response,
  message: string,
  status = 400,
  errors?: Record<string, string[]>
) {
  return res.status(status).json({
    success: false,
    message,
    data: null,
    meta: { timestamp: new Date().toISOString() },
    ...(errors ? { errors } : {}),
  });
}

export function registerPhase08Routes(
  app: Express,
  securityStore: SecurityStore,
  p8: Phase08Store,
  backupScheduler: BackupSchedulerService,
  requireAuth: (req: AuthedRequest, res: Response, next: NextFunction) => void
) {
  const router = Router();

  const requireAdmin = (req: AuthedRequest, res: Response, next: NextFunction) => {
    const actor = req.authUser;
    if (!actor) return apiFail(res, 'Authentication required.', 401);
    if (actor.role !== 'ADMIN') {
      p8.raiseSecurityAlert({
        category: 'UNAUTHORIZED_ACCESS',
        severity: 'HIGH',
        title: `Unauthorized Admin Security Action by ${actor.userId}`,
        description: `User ${actor.userId} (${actor.role}) attempted ${req.method} ${req.originalUrl}.`,
        relatedUserId: actor.userId,
      });
      p8.recordBeforeAfterAudit({
        userId: actor.userId,
        userRole: actor.role,
        actionType: 'UNAUTHORIZED_SECURITY_ATTEMPT',
        module: 'phase08_security',
        recordId: req.path,
        beforeValues: null,
        afterValues: { blocked: true, method: req.method, path: req.originalUrl },
        ipAddress: getClientIp(req),
        deviceInfo: String(req.headers['user-agent'] || 'Client').slice(0, 120),
        actionResult: 'BLOCKED',
      });
      return apiFail(
        res,
        `Forbidden: Only ADMIN is authorized for ${req.path}.`,
        403
      );
    }
    return next();
  };

  const requireSecurityViewer = (req: AuthedRequest, res: Response, next: NextFunction) => {
    const actor = req.authUser;
    if (!actor) return apiFail(res, 'Authentication required.', 401);
    if (
      actor.role !== 'ADMIN' &&
      actor.role !== 'AUDITOR' &&
      !securityStore.hasPermission(actor, 'security_logs', 'VIEW')
    ) {
      p8.raiseSecurityAlert({
        category: 'UNAUTHORIZED_ACCESS',
        severity: 'MEDIUM',
        title: `Blocked Security Log/Monitor Access (${actor.userId})`,
        description: `${actor.userId} (${actor.role}) lacks security_logs.VIEW permission.`,
        relatedUserId: actor.userId,
      });
      return apiFail(res, 'Forbidden: insufficient permissions to inspect security telemetry.', 403);
    }
    return next();
  };

  // ============================================================================
  // 1. SECURITY DASHBOARD & POLICY SETTINGS
  // ============================================================================
  router.get('/dashboard', requireAuth, requireSecurityViewer, (_req: AuthedRequest, res) => {
    const activeSessions = Array.from(securityStore.sessions.values()).filter(
      (s) => s.status === 'ACTIVE' && s.expiresAt > Date.now()
    );
    const devices = Array.from(p8.registeredDevices.values());
    const openAlerts = p8.securityAlerts.filter((a) => a.status !== 'RESOLVED');
    const chainStatus = p8.verifyAuditChainIntegrity();
    const health = p8.getSystemHealth();

    return apiOk(res, {
      settings: p8.settings,
      kpis: {
        activeUsersCount: securityStore.users.filter((u) => u.status === 'ACTIVE').length,
        lockedUsersCount: securityStore.users.filter((u) => u.lockedUntil && u.lockedUntil > Date.now()).length,
        activeSessionsCount: activeSessions.length,
        registeredDevicesCount: devices.length,
        pendingDevicesCount: devices.filter((d) => d.verificationStatus === 'PENDING_VERIFICATION').length,
        suspiciousDevicesCount: devices.filter((d) => d.verificationStatus === 'SUSPICIOUS').length,
        openAlertsCount: openAlerts.length,
        criticalAlertsCount: openAlerts.filter((a) => a.severity === 'CRITICAL' || a.severity === 'HIGH').length,
        openIncidentsCount: p8.securityIncidents.filter((i) => i.investigationStatus !== 'CLOSED').length,
        totalBackupsCount: p8.backupHistory.length,
        auditEntriesCount: p8.tamperAuditLogs.length,
        auditChainValid: chainStatus.valid,
        softDeletedPendingCount: p8.listUnifiedSoftDeleted().filter((d) => d.recoveryStatus !== 'RECOVERED' && d.recoveryStatus !== 'PERMANENTLY_DELETED').length,
      },
      otpChannels: {
        EMAIL: p8.isOtpChannelConfigured('EMAIL'),
        SMS: p8.isOtpChannelConfigured('SMS'),
        WHATSAPP: p8.isOtpChannelConfigured('WHATSAPP'),
      },
      recentAlerts: p8.securityAlerts.slice(0, 8),
      recentIncidents: p8.securityIncidents.slice(0, 5),
      recentBackups: p8.backupHistory.slice(0, 5),
      health,
      adminNotifications: p8.adminSecurityNotifications.slice(0, 8),
    });
  });

  router.get('/settings', requireAuth, requireSecurityViewer, (_req, res) => {
    return apiOk(res, {
      settings: p8.settings,
      otpChannels: {
        EMAIL: p8.isOtpChannelConfigured('EMAIL'),
        SMS: p8.isOtpChannelConfigured('SMS'),
        WHATSAPP: p8.isOtpChannelConfigured('WHATSAPP'),
      },
    });
  });

  router.put('/settings', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const before = { ...p8.settings };
    const body = req.body ?? {};

    // Enforce the 12 approved baseline guarantees — prevent downgrades
    if (typeof body.passwordExpiryDays === 'number' && body.passwordExpiryDays >= 30 && body.passwordExpiryDays <= 365) {
      p8.settings.passwordExpiryDays = Math.floor(body.passwordExpiryDays);
    }
    if (typeof body.maxConcurrentSessions === 'number' && body.maxConcurrentSessions >= 1 && body.maxConcurrentSessions <= 10) {
      p8.settings.maxConcurrentSessions = Math.floor(body.maxConcurrentSessions);
    }
    if (typeof body.passwordHistoryCount === 'number' && body.passwordHistoryCount >= 3 && body.passwordHistoryCount <= 12) {
      p8.settings.passwordHistoryCount = Math.floor(body.passwordHistoryCount);
    }
    p8.settings.updatedBy = actor.userId;
    p8.settings.updatedAt = new Date().toISOString();

    p8.recordBeforeAfterAudit({
      userId: actor.userId,
      userRole: actor.role,
      actionType: 'UPDATE_PHASE08_SECURITY_SETTINGS',
      module: 'security_settings',
      recordId: 'SEC-POLICY-01',
      beforeValues: before,
      afterValues: { ...p8.settings },
      ipAddress: getClientIp(req),
      deviceInfo: String(req.headers['user-agent'] || 'Client').slice(0, 120),
      actionResult: 'SUCCESS',
    });

    return apiOk(res, p8.settings, 'Security settings updated (approved baselines enforced).');
  });

  // ============================================================================
  // 2. SENSITIVE ACTION STEP-UP OTP & MULTI-CHANNEL OTP LOGS
  // ============================================================================
  router.post('/otp/sensitive-challenge', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const channel = (String(req.body?.channel || 'SMS').toUpperCase() as OtpChannel);
    if (!['EMAIL', 'SMS', 'WHATSAPP'].includes(channel)) {
      return apiFail(res, 'Invalid OTP channel. Choose EMAIL, SMS, or WHATSAPP.', 422);
    }
    const chStatus = p8.isOtpChannelConfigured(channel);
    const challengeId = generateToken(16);
    const otp = generateNumericOtp(6);
    const now = Date.now();
    const targetRaw = channel === 'EMAIL' ? actor.email || actor.mobile : actor.mobile;

    securityStore.otpChallenges.set(challengeId, {
      id: challengeId,
      target: targetRaw,
      purpose: 'SENSITIVE_ACTION',
      channel,
      otpHash: hmacOtp(otp, challengeId),
      attempts: 0,
      maxAttempts: 5,
      resendAvailableAt: now + securityStore.otpResendCooldownMs,
      expiresAt: now + securityStore.otpTtlMs,
      verified: false,
      userId: actor.userId,
    });

    const devMeta = parsePrivacyDeviceMetadata(
      req.headers['user-agent'],
      req.headers['x-device-name'] as string | undefined
    );
    p8.recordOtpLog({
      challengeId,
      userId: actor.userId,
      purpose: 'SENSITIVE_ACTION',
      channel,
      maskedTarget: targetRaw.replace(/.(?=.{4})/g, '*'),
      providerConfigured: chStatus.configured,
      deliveryStatus: chStatus.configured ? 'DELIVERED' : 'NOT_CONFIGURED',
      deliveryDetail: chStatus.detail,
      attemptsUsed: 0,
      outcome: 'PENDING',
      ipAddress: getClientIp(req),
      deviceId: devMeta.deviceId,
      verifiedAt: null,
    });

    return apiOk(res, {
      challengeId,
      channel,
      providerConfigured: chStatus.configured,
      deliveryDetail: chStatus.detail,
      expiresInSeconds: Math.floor(securityStore.otpTtlMs / 1000),
      ...(chStatus.configured ? {} : { sandboxOtpPreview: otp }),
    });
  });

  router.get('/otp-logs', requireAuth, requireSecurityViewer, (_req, res) => {
    return apiOk(res, p8.otpLogs);
  });

  // ============================================================================
  // 3. DEVICE MONITORING & EMERGENCY CONTROLS
  // ============================================================================
  router.get('/devices', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const all = Array.from(p8.registeredDevices.values());
    const visible =
      actor.role === 'ADMIN' || actor.role === 'AUDITOR'
        ? all
        : all.filter((d) => d.userId === actor.userId);
    return apiOk(
      res,
      visible.sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt))
    );
  });

  router.post('/devices/:deviceId/verify', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const targetUserId = String(req.body?.userId || actor.userId);
    if (actor.role !== 'ADMIN' && targetUserId !== actor.userId) {
      return apiFail(res, 'Forbidden: cannot trust device for another user.', 403);
    }
    const device = Array.from(p8.registeredDevices.values()).find(
      (d) => d.deviceId === req.params.deviceId && (actor.role === 'ADMIN' ? d.userId === targetUserId || !req.body?.userId : d.userId === actor.userId)
    );
    if (!device) return apiFail(res, 'Registered device not found.', 404);

    const beforeStatus = device.verificationStatus;
    device.verificationStatus = 'TRUSTED';
    device.verifiedBy = actor.userId;
    device.verifiedAt = new Date().toISOString();

    p8.recordBeforeAfterAudit({
      userId: actor.userId,
      userRole: actor.role,
      actionType: 'TRUST_DEVICE',
      module: 'device_monitoring',
      recordId: `${device.userId}:${device.deviceId}`,
      beforeValues: { verificationStatus: beforeStatus },
      afterValues: { verificationStatus: 'TRUSTED', verifiedBy: actor.userId },
      ipAddress: getClientIp(req),
      deviceInfo: String(req.headers['user-agent'] || 'Client').slice(0, 120),
      actionResult: 'SUCCESS',
    });

    return apiOk(res, device, `Device ${device.deviceId} verified as TRUSTED.`);
  });

  router.post('/devices/:deviceId/suspicious', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const device = Array.from(p8.registeredDevices.values()).find(
      (d) => d.deviceId === req.params.deviceId
    );
    if (!device) return apiFail(res, 'Device not found.', 404);

    const beforeStatus = device.verificationStatus;
    device.verificationStatus = 'SUSPICIOUS';
    // Revoke active sessions associated with that device
    let revokedCount = 0;
    for (const s of securityStore.sessions.values()) {
      if (s.userId === device.userId && s.deviceId === device.deviceId && s.status === 'ACTIVE') {
        s.status = 'REVOKED';
        revokedCount += 1;
      }
    }

    p8.raiseSecurityAlert({
      category: 'NEW_DEVICE_LOGIN',
      severity: 'HIGH',
      title: `Suspicious Device Flagged: ${device.deviceId}`,
      description: `Admin ${actor.userId} flagged ${device.deviceName} for ${device.userId} as SUSPICIOUS (${revokedCount} session(s) revoked).`,
      relatedUserId: device.userId,
    });

    p8.recordBeforeAfterAudit({
      userId: actor.userId,
      userRole: actor.role,
      actionType: 'FLAG_SUSPICIOUS_DEVICE',
      module: 'device_monitoring',
      recordId: `${device.userId}:${device.deviceId}`,
      beforeValues: { verificationStatus: beforeStatus },
      afterValues: { verificationStatus: 'SUSPICIOUS', revokedSessions: revokedCount },
      ipAddress: getClientIp(req),
      deviceInfo: String(req.headers['user-agent'] || 'Client').slice(0, 120),
      actionResult: 'SUCCESS',
    });

    return apiOk(res, { device, revokedSessions: revokedCount }, 'Device flagged suspicious and sessions revoked.');
  });

  router.post('/devices/:deviceId/revoke', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const device = Array.from(p8.registeredDevices.values()).find(
      (d) => d.deviceId === req.params.deviceId && (actor.role === 'ADMIN' || d.userId === actor.userId)
    );
    if (!device) return apiFail(res, 'Device not found or access denied.', 404);

    device.verificationStatus = 'REVOKED';
    let revokedSessions = 0;
    for (const s of securityStore.sessions.values()) {
      if (s.userId === device.userId && s.deviceId === device.deviceId && s.status === 'ACTIVE') {
        s.status = 'REVOKED';
        revokedSessions += 1;
      }
    }

    p8.recordBeforeAfterAudit({
      userId: actor.userId,
      userRole: actor.role,
      actionType: 'REVOKE_DEVICE',
      module: 'device_monitoring',
      recordId: `${device.userId}:${device.deviceId}`,
      beforeValues: { verificationStatus: 'ACTIVE' },
      afterValues: { verificationStatus: 'REVOKED', revokedSessions },
      ipAddress: getClientIp(req),
      deviceInfo: String(req.headers['user-agent'] || 'Client').slice(0, 120),
      actionResult: 'SUCCESS',
    });

    return apiOk(res, { device, revokedSessions }, 'Device revoked.');
  });

  router.post('/emergency/lock-user/:userId', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const target = securityStore.findUserByUserId(req.params.userId);
    if (!target) return apiFail(res, 'Target user not found.', 404);
    if (target.userId === actor.userId) {
      return apiFail(res, 'Cannot emergency-lock your own active Admin account.', 400);
    }
    const reason = sanitizeText(String(req.body?.reason || 'Emergency security lock triggered by Admin'));
    const before = { status: target.status, lockedUntil: target.lockedUntil };

    target.status = 'SUSPENDED';
    target.lockedUntil = Date.now() + 24 * 60 * 60_000;
    let revokedSessions = 0;
    for (const s of securityStore.sessions.values()) {
      if (s.userId === target.userId && s.status === 'ACTIVE') {
        s.status = 'REVOKED';
        revokedSessions += 1;
      }
    }

    p8.raiseSecurityAlert({
      category: 'ACCOUNT_LOCKOUT',
      severity: 'CRITICAL',
      title: `Emergency Account Lock: ${target.userId}`,
      description: `${actor.userId} executed emergency lock on ${target.userId}: ${reason} (${revokedSessions} session(s) terminated).`,
      relatedUserId: target.userId,
    });

    p8.recordBeforeAfterAudit({
      userId: actor.userId,
      userRole: actor.role,
      actionType: 'EMERGENCY_LOCK_USER',
      module: 'users',
      recordId: target.userId,
      beforeValues: before,
      afterValues: { status: target.status, lockedUntil: target.lockedUntil, revokedSessions, reason },
      ipAddress: getClientIp(req),
      deviceInfo: String(req.headers['user-agent'] || 'Client').slice(0, 120),
      actionResult: 'SUCCESS',
    });

    return apiOk(res, { userId: target.userId, status: target.status, revokedSessions }, 'Emergency lock executed.');
  });

  router.post('/emergency/revoke-all-sessions/:userId', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const target = securityStore.findUserByUserId(req.params.userId);
    if (!target) return apiFail(res, 'Target user not found.', 404);

    let revokedSessions = 0;
    for (const s of securityStore.sessions.values()) {
      if (s.userId === target.userId && s.status === 'ACTIVE') {
        s.status = 'REVOKED';
        revokedSessions += 1;
      }
    }

    p8.recordBeforeAfterAudit({
      userId: actor.userId,
      userRole: actor.role,
      actionType: 'FORCE_LOGOUT_ALL_SESSIONS',
      module: 'sessions',
      recordId: target.userId,
      beforeValues: { activeSessionsBefore: revokedSessions },
      afterValues: { revokedSessions },
      ipAddress: getClientIp(req),
      deviceInfo: String(req.headers['user-agent'] || 'Client').slice(0, 120),
      actionResult: 'SUCCESS',
    });

    return apiOk(res, { userId: target.userId, revokedSessions }, `Revoked ${revokedSessions} active session(s).`);
  });

  // ============================================================================
  // 4. TAMPER-EVIDENT BEFORE/AFTER AUDIT CHAIN
  // ============================================================================
  router.get('/audit-chain', requireAuth, requireSecurityViewer, (req: AuthedRequest, res) => {
    const { userId, module, actionType, actionResult, q, fromDate, toDate } = req.query;
    let list = [...p8.tamperAuditLogs];

    if (typeof userId === 'string' && userId.trim()) {
      const uid = userId.trim().toLowerCase();
      list = list.filter((e) => e.userId.toLowerCase().includes(uid));
    }
    if (typeof module === 'string' && module.trim()) {
      const m = module.trim().toLowerCase();
      list = list.filter((e) => e.module.toLowerCase() === m);
    }
    if (typeof actionType === 'string' && actionType.trim()) {
      const a = actionType.trim().toLowerCase();
      list = list.filter((e) => e.actionType.toLowerCase().includes(a));
    }
    if (typeof actionResult === 'string' && actionResult.trim()) {
      list = list.filter((e) => e.actionResult === actionResult.trim().toUpperCase());
    }
    if (typeof fromDate === 'string' && fromDate.trim()) {
      list = list.filter((e) => e.createdAt >= fromDate.trim());
    }
    if (typeof toDate === 'string' && toDate.trim()) {
      list = list.filter((e) => e.createdAt <= `${toDate.trim()}T23:59:59.999Z`);
    }
    if (typeof q === 'string' && q.trim()) {
      const term = q.trim().toLowerCase();
      list = list.filter(
        (e) =>
          e.userId.toLowerCase().includes(term) ||
          e.actionType.toLowerCase().includes(term) ||
          e.module.toLowerCase().includes(term) ||
          e.recordId.toLowerCase().includes(term) ||
          e.auditUuid.toLowerCase().includes(term)
      );
    }

    const integrity = p8.verifyAuditChainIntegrity();
    return apiOk(res, {
      entries: list,
      total: list.length,
      integrity,
    });
  });

  router.post('/audit-chain/verify', requireAuth, requireSecurityViewer, (req: AuthedRequest, res) => {
    const result = p8.verifyAuditChainIntegrity();
    if (!result.valid) {
      p8.raiseSecurityAlert({
        category: 'ENCRYPTION_INTEGRITY',
        severity: 'CRITICAL',
        title: 'Audit Trail Hash Chain Tampering Detected',
        description: `Verification detected hash mismatch at audit entry ${result.brokenEntryUuid}.`,
        relatedUserId: req.authUser?.userId,
      });
    }
    return apiOk(res, result, result.valid ? 'Audit hash chain verified intact.' : 'Audit hash chain broken!');
  });

  router.get('/audit-chain/export', requireAuth, requireSecurityViewer, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const format = String(req.query.format || 'csv').toLowerCase();

    if (actor.role !== 'ADMIN' && actor.role !== 'AUDITOR') {
      return apiFail(res, 'Only ADMIN or AUDITOR can export audit trail packages.', 403);
    }

    p8.recordBeforeAfterAudit({
      userId: actor.userId,
      userRole: actor.role,
      actionType: 'EXPORT_AUDIT_LOGS',
      module: 'audit_logs',
      recordId: `EXPORT-${format.toUpperCase()}`,
      beforeValues: null,
      afterValues: { entriesExported: p8.tamperAuditLogs.length, format },
      ipAddress: getClientIp(req),
      deviceInfo: String(req.headers['user-agent'] || 'Client').slice(0, 120),
      actionResult: 'SUCCESS',
    });

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="mun-audit-chain.json"');
      return res.send(JSON.stringify({ exportedAt: new Date().toISOString(), entries: p8.tamperAuditLogs }, null, 2));
    }

    const header = 'AuditUUID,Timestamp,UserID,Role,ActionType,Module,RecordID,Result,EntryHash';
    const rows = p8.tamperAuditLogs.map((e) =>
      [
        e.auditUuid,
        e.createdAt,
        e.userId,
        e.userRole,
        `"${e.actionType.replace(/"/g, '""')}"`,
        e.module,
        `"${e.recordId.replace(/"/g, '""')}"`,
        e.actionResult,
        e.entryHash,
      ].join(',')
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="mun-audit-chain.csv"');
    return res.send([header, ...rows].join('\n'));
  });

  // ============================================================================
  // 5. CUSTOM ROLES, PERMISSION GROUPS, TEMP PERMISSIONS & APPROVAL REQUESTS
  // ============================================================================
  router.get('/custom-roles', requireAuth, (_req, res) => {
    return apiOk(res, p8.customRoles);
  });

  router.post('/custom-roles', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const { roleName, baseRole, description, permissions } = req.body ?? {};
    if (!roleName || String(roleName).trim().length < 2) {
      return apiFail(res, 'Role name is required.', 422);
    }
    const base = String(baseRole || 'STAFF').toUpperCase() as 'MANAGER' | 'STAFF' | 'AUDITOR';
    if (!['MANAGER', 'STAFF', 'AUDITOR'].includes(base)) {
      return apiFail(res, 'Custom roles must inherit from MANAGER, STAFF, or AUDITOR.', 422);
    }
    const cleanPerms: Record<string, boolean> = {};
    if (permissions && typeof permissions === 'object') {
      for (const [k, v] of Object.entries(permissions)) {
        cleanPerms[k] = Boolean(v);
      }
    }
    const created = {
      roleCode: p8.nextCode('CROLE'),
      roleName: sanitizeText(String(roleName)),
      baseRole: base,
      description: sanitizeText(String(description || '')),
      permissions: cleanPerms,
      status: 'ACTIVE' as const,
      createdBy: actor.userId,
      createdAt: new Date().toISOString(),
    };
    p8.customRoles.unshift(created);
    p8.recordBeforeAfterAudit({
      userId: actor.userId,
      userRole: actor.role,
      actionType: 'CREATE_CUSTOM_ROLE',
      module: 'roles',
      recordId: created.roleCode,
      beforeValues: null,
      afterValues: created,
      ipAddress: getClientIp(req),
      deviceInfo: String(req.headers['user-agent'] || 'Client').slice(0, 120),
      actionResult: 'SUCCESS',
    });
    return apiOk(res, created, 'Custom role created.', 201);
  });

  router.post('/custom-roles/:roleCode/assign', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const roleDef = p8.customRoles.find((r) => r.roleCode === req.params.roleCode);
    if (!roleDef) return apiFail(res, 'Custom role not found.', 404);
    const target = securityStore.findUserByUserId(String(req.body?.userId || ''));
    if (!target) return apiFail(res, 'Target user not found.', 404);
    if (target.role === 'ADMIN') return apiFail(res, 'Cannot reassign ADMIN account to a custom sub-role.', 400);

    const prevCode = target.customRoleCode || null;
    target.customRoleCode = roleDef.roleCode;
    target.updatedAt = new Date().toISOString();

    p8.recordBeforeAfterAudit({
      userId: actor.userId,
      userRole: actor.role,
      actionType: 'ASSIGN_CUSTOM_ROLE',
      module: 'roles',
      recordId: target.userId,
      beforeValues: { customRoleCode: prevCode },
      afterValues: { customRoleCode: roleDef.roleCode },
      ipAddress: getClientIp(req),
      deviceInfo: String(req.headers['user-agent'] || 'Client').slice(0, 120),
      actionResult: 'SUCCESS',
    });

    return apiOk(
      res,
      { userId: target.userId, customRoleCode: target.customRoleCode, effectivePermissions: securityStore.getEffectivePermissions(target) },
      `Assigned custom role ${roleDef.roleName} to ${target.userId}.`
    );
  });

  router.get('/permission-groups', requireAuth, (_req, res) => {
    return apiOk(res, p8.permissionGroups);
  });

  router.post('/permission-groups/:groupCode/apply', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const group = p8.permissionGroups.find((g) => g.groupCode === req.params.groupCode);
    if (!group) return apiFail(res, 'Permission group not found.', 404);
    const target = securityStore.findUserByUserId(String(req.body?.userId || ''));
    if (!target) return apiFail(res, 'Target user not found.', 404);
    if (target.role === 'ADMIN') return apiFail(res, 'Cannot overwrite Admin permissions.', 400);

    const before = { ...target.customPermissions };
    for (const [k, v] of Object.entries(group.permissions)) {
      if (v) {
        target.customPermissions[k] = true;
      }
    }
    target.updatedAt = new Date().toISOString();

    p8.recordBeforeAfterAudit({
      userId: actor.userId,
      userRole: actor.role,
      actionType: 'APPLY_PERMISSION_GROUP',
      module: 'permissions',
      recordId: target.userId,
      beforeValues: before,
      afterValues: { groupCode: group.groupCode, customPermissions: { ...target.customPermissions } },
      ipAddress: getClientIp(req),
      deviceInfo: String(req.headers['user-agent'] || 'Client').slice(0, 120),
      actionResult: 'SUCCESS',
    });

    return apiOk(res, { userId: target.userId, permissions: securityStore.getEffectivePermissions(target) }, `Applied ${group.groupName} to ${target.userId}.`);
  });

  router.get('/temporary-permissions', requireAuth, (_req, res) => {
    // Refresh expiration statuses dynamically
    const now = Date.now();
    for (const g of p8.temporaryPermissions) {
      if (g.status === 'ACTIVE' && Date.parse(g.expiresAt) <= now) {
        g.status = 'EXPIRED';
      }
    }
    return apiOk(res, p8.temporaryPermissions);
  });

  router.post('/temporary-permissions', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const { userId, permissionKey, reason, durationHours, expiresAt } = req.body ?? {};
    const target = securityStore.findUserByUserId(String(userId || ''));
    if (!target) return apiFail(res, 'Target user not found.', 404);
    if (!permissionKey || typeof permissionKey !== 'string') {
      return apiFail(res, 'Permission key is required.', 422);
    }

    const expiryIso =
      typeof expiresAt === 'string' && Number.isFinite(Date.parse(expiresAt))
        ? new Date(expiresAt).toISOString()
        : new Date(Date.now() + Math.max(1, Number(durationHours || 24)) * 3600_000).toISOString();

    const grant = {
      grantCode: p8.nextCode('TPRM'),
      userId: target.userId,
      permissionKey: sanitizeText(permissionKey),
      reason: sanitizeText(String(reason || 'Time-bound operational delegation')),
      grantedBy: actor.userId,
      expiresAt: expiryIso,
      status: 'ACTIVE' as const,
      createdAt: new Date().toISOString(),
    };
    p8.temporaryPermissions.unshift(grant);

    p8.recordBeforeAfterAudit({
      userId: actor.userId,
      userRole: actor.role,
      actionType: 'GRANT_TEMPORARY_PERMISSION',
      module: 'permissions',
      recordId: target.userId,
      beforeValues: null,
      afterValues: grant,
      ipAddress: getClientIp(req),
      deviceInfo: String(req.headers['user-agent'] || 'Client').slice(0, 120),
      actionResult: 'SUCCESS',
    });

    return apiOk(res, grant, `Granted temporary ${grant.permissionKey} until ${grant.expiresAt}.`, 201);
  });

  router.post('/temporary-permissions/:grantCode/revoke', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const grant = p8.temporaryPermissions.find((g) => g.grantCode === req.params.grantCode);
    if (!grant) return apiFail(res, 'Temporary grant not found.', 404);
    grant.status = 'REVOKED';

    p8.recordBeforeAfterAudit({
      userId: actor.userId,
      userRole: actor.role,
      actionType: 'REVOKE_TEMPORARY_PERMISSION',
      module: 'permissions',
      recordId: grant.userId,
      beforeValues: { status: 'ACTIVE', permissionKey: grant.permissionKey },
      afterValues: { status: 'REVOKED' },
      ipAddress: getClientIp(req),
      deviceInfo: String(req.headers['user-agent'] || 'Client').slice(0, 120),
      actionResult: 'SUCCESS',
    });

    return apiOk(res, grant, 'Temporary permission revoked.');
  });

  router.get('/permission-requests', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    if (actor.role !== 'ADMIN' && actor.role !== 'MANAGER' && actor.role !== 'AUDITOR') {
      return apiFail(res, 'Forbidden.', 403);
    }
    return apiOk(res, p8.permissionChangeRequests);
  });

  router.post('/permission-requests', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    if (actor.role !== 'ADMIN' && actor.role !== 'MANAGER') {
      return apiFail(res, 'Only Managers or Admins may propose permission changes.', 403);
    }
    const { targetUserId, proposedPermissions, reason } = req.body ?? {};
    const target = securityStore.findUserByUserId(String(targetUserId || ''));
    if (!target) return apiFail(res, 'Target user not found.', 404);
    if (!proposedPermissions || typeof proposedPermissions !== 'object') {
      return apiFail(res, 'proposedPermissions map is required.', 422);
    }

    const request = {
      requestCode: p8.nextCode('PREQ'),
      targetUserId: target.userId,
      proposedPermissions,
      reason: sanitizeText(String(reason || 'Operational permission adjustment request')),
      proposedBy: actor.userId,
      status: 'PENDING' as const,
      reviewedBy: null,
      reviewNotes: null,
      createdAt: new Date().toISOString(),
      reviewedAt: null,
    };
    p8.permissionChangeRequests.unshift(request);
    return apiOk(res, request, 'Permission change request queued for Admin approval.', 201);
  });

  router.post('/permission-requests/:requestCode/review', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const reqItem = p8.permissionChangeRequests.find((r) => r.requestCode === req.params.requestCode);
    if (!reqItem) return apiFail(res, 'Permission request not found.', 404);
    if (reqItem.status !== 'PENDING') {
      return apiFail(res, `Request is already ${reqItem.status}.`, 400);
    }

    const approve = Boolean(req.body?.approve);
    const notes = sanitizeText(String(req.body?.notes || (approve ? 'Approved' : 'Rejected')));
    const target = securityStore.findUserByUserId(reqItem.targetUserId);
    if (!target) return apiFail(res, 'Target user missing.', 404);

    const beforePerms = { ...target.customPermissions };
    reqItem.status = approve ? 'APPROVED' : 'REJECTED';
    reqItem.reviewedBy = actor.userId;
    reqItem.reviewNotes = notes;
    reqItem.reviewedAt = new Date().toISOString();

    if (approve) {
      for (const [k, v] of Object.entries(reqItem.proposedPermissions)) {
        target.customPermissions[k] = Boolean(v);
      }
      target.updatedAt = reqItem.reviewedAt;
    }

    p8.recordBeforeAfterAudit({
      userId: actor.userId,
      userRole: actor.role,
      actionType: approve ? 'APPROVE_PERMISSION_CHANGE' : 'REJECT_PERMISSION_CHANGE',
      module: 'permissions',
      recordId: reqItem.requestCode,
      beforeValues: beforePerms,
      afterValues: approve ? { ...target.customPermissions } : { status: 'REJECTED', notes },
      ipAddress: getClientIp(req),
      deviceInfo: String(req.headers['user-agent'] || 'Client').slice(0, 120),
      actionResult: 'SUCCESS',
    });

    return apiOk(res, reqItem, `Permission request ${reqItem.status}.`);
  });

  // ============================================================================
  // 6. BACKUP SCHEDULES, 3-TIER STORAGE, ENCRYPTION KEY ROTATION & SNAPSHOTS
  // ============================================================================
  router.get('/backups/schedules', requireAuth, requireSecurityViewer, (_req, res) => {
    return apiOk(res, p8.backupSchedules);
  });

  router.put('/backups/schedules/:scheduleCode', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const sched = p8.backupSchedules.find((s) => s.scheduleCode === req.params.scheduleCode);
    if (!sched) return apiFail(res, 'Schedule not found.', 404);

    const before = { ...sched };
    if (typeof req.body?.enabled === 'boolean') sched.enabled = req.body.enabled;
    if (typeof req.body?.runTimeIst === 'string' && /^\d{2}:\d{2}$/.test(req.body.runTimeIst)) {
      sched.runTimeIst = req.body.runTimeIst;
    }

    p8.recordBeforeAfterAudit({
      userId: actor.userId,
      userRole: actor.role,
      actionType: 'UPDATE_BACKUP_SCHEDULE',
      module: 'backup_schedules',
      recordId: sched.scheduleCode,
      beforeValues: before,
      afterValues: { ...sched },
      ipAddress: getClientIp(req),
      deviceInfo: String(req.headers['user-agent'] || 'Client').slice(0, 120),
      actionResult: 'SUCCESS',
    });

    return apiOk(res, sched, 'Backup schedule updated.');
  });

  router.post('/backups/schedules/:scheduleCode/run', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    try {
      const backup = await backupScheduler.executeSchedule(req.params.scheduleCode, actor.userId, {
        simulateCloudFailure: Boolean(req.body?.simulateCloudFailure),
      });
      return apiOk(res, backup, `Executed scheduled backup ${backup.backupCode}.`, 201);
    } catch (err) {
      return apiFail(res, err instanceof Error ? err.message : 'Scheduled backup failed.', 400);
    }
  });

  router.get('/backups/storage', requireAuth, requireSecurityViewer, (_req, res) => {
    return apiOk(res, p8.storageLocations);
  });

  router.put('/backups/storage/cloud', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const { providerName, endpointOrPath, credentialsSecret, capacityLimitMb } = req.body ?? {};
    const updated = p8.configureCloudStorage({
      providerName: String(providerName || 'Cloud Object Storage'),
      endpointOrPath: String(endpointOrPath || ''),
      credentialsSecret: typeof credentialsSecret === 'string' ? credentialsSecret : undefined,
      capacityLimitMb: typeof capacityLimitMb === 'number' ? capacityLimitMb : undefined,
    });

    p8.recordBeforeAfterAudit({
      userId: actor.userId,
      userRole: actor.role,
      actionType: 'CONFIGURE_CLOUD_BACKUP_STORAGE',
      module: 'backup_storage',
      recordId: 'CLOUD_STORAGE',
      beforeValues: null,
      afterValues: {
        providerName: updated.providerName,
        endpointOrPath: updated.endpointOrPath,
        isConfigured: updated.isConfigured,
        connectionStatus: updated.connectionStatus,
      },
      ipAddress: getClientIp(req),
      deviceInfo: String(req.headers['user-agent'] || 'Client').slice(0, 120),
      actionResult: 'SUCCESS',
    });

    return apiOk(res, updated, updated.isConfigured ? 'Cloud backup storage configured.' : 'Cloud storage saved (missing credentials or endpoint).');
  });

  router.post('/backups/create', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const freq = (String(req.body?.frequency || 'MANUAL').toUpperCase()) as
      | 'MANUAL'
      | 'DAILY'
      | 'WEEKLY'
      | 'MONTHLY'
      | 'FINANCIAL_YEAR';
    const rec = await p8.createFullBackupSnapshot({
      frequency: freq,
      triggeredBy: actor.userId,
      simulateCloudFailure: Boolean(req.body?.simulateCloudFailure),
    });

    p8.recordBeforeAfterAudit({
      userId: actor.userId,
      userRole: actor.role,
      actionType: 'CREATE_ENCRYPTED_BACKUP',
      module: 'backups',
      recordId: rec.backupCode,
      beforeValues: null,
      afterValues: {
        backupCode: rec.backupCode,
        versionNo: rec.versionNo,
        keyVersion: rec.keyVersion,
        checksumSha256: rec.checksumSha256,
        status: rec.status,
      },
      ipAddress: getClientIp(req),
      deviceInfo: String(req.headers['user-agent'] || 'Client').slice(0, 120),
      actionResult: rec.status === 'FAILED' ? 'FAILURE' : 'SUCCESS',
    });

    return apiOk(res, rec, `Encrypted backup ${rec.backupCode} created (${rec.status}).`, 201);
  });

  router.get('/backups/history', requireAuth, requireSecurityViewer, (_req, res) => {
    return apiOk(res, {
      backups: p8.backupHistory,
      integrityLogs: p8.backupIntegrityLogs,
      retentionPolicy: p8.settings.backupRetentionPolicy,
    });
  });

  router.get('/backups/compare', requireAuth, requireSecurityViewer, (req, res) => {
    const baseCode = String(req.query.base || '');
    const targetCode = String(req.query.target || '');
    if (!baseCode || !targetCode) {
      return apiFail(res, 'Query params base and target backup codes are required.', 422);
    }
    try {
      return apiOk(res, p8.compareBackups(baseCode, targetCode));
    } catch (err) {
      return apiFail(res, err instanceof Error ? err.message : 'Comparison failed.', 404);
    }
  });

  router.get('/backups/:backupCode/download', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    try {
      const bundle = p8.getSerializedBackupBundle(req.params.backupCode);
      p8.recordBeforeAfterAudit({
        userId: actor.userId,
        userRole: actor.role,
        actionType: 'DOWNLOAD_ENCRYPTED_BACKUP',
        module: 'backups',
        recordId: req.params.backupCode,
        beforeValues: null,
        afterValues: { downloadedBytes: bundle.length },
        ipAddress: getClientIp(req),
        deviceInfo: String(req.headers['user-agent'] || 'Client').slice(0, 120),
        actionResult: 'SUCCESS',
      });
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${req.params.backupCode}.enc.json"`);
      return res.send(bundle);
    } catch (err) {
      return apiFail(res, err instanceof Error ? err.message : 'Backup not found.', 404);
    }
  });

  router.post('/backups/:backupCode/verify', requireAuth, requireSecurityViewer, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    try {
      const result = p8.verifyBackupRecord(req.params.backupCode, actor.userId, 'MANUAL_VERIFY');
      return apiOk(
        res,
        {
          verified: result.verified,
          log: result.log,
        },
        `Backup ${req.params.backupCode} integrity verified.`
      );
    } catch (err) {
      return apiFail(res, err instanceof Error ? err.message : 'Integrity verification failed.', 422);
    }
  });

  router.get('/encryption/keys', requireAuth, requireSecurityViewer, (_req, res) => {
    return apiOk(res, p8.keyRing);
  });

  router.post('/encryption/rotate', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const beforeVersion = p8.settings.activeEncryptionKeyVersion;
    const rotated = p8.rotateEncryptionKey(actor.userId);
    p8.recordBeforeAfterAudit({
      userId: actor.userId,
      userRole: actor.role,
      actionType: 'ROTATE_BACKUP_ENCRYPTION_KEY',
      module: 'encryption_keys',
      recordId: rotated.keyVersion,
      beforeValues: { activeKeyVersion: beforeVersion },
      afterValues: { activeKeyVersion: rotated.keyVersion },
      ipAddress: getClientIp(req),
      deviceInfo: String(req.headers['user-agent'] || 'Client').slice(0, 120),
      actionResult: 'SUCCESS',
    });
    return apiOk(res, { activeKey: rotated, keyRing: p8.keyRing }, `Encryption key rotated to ${rotated.keyVersion}.`, 201);
  });

  // ============================================================================
  // 7. RESTORE PREVIEW & EXECUTION (ADMIN ONLY)
  // ============================================================================
  router.get('/restore/history', requireAuth, requireSecurityViewer, (_req, res) => {
    return apiOk(res, p8.restoreHistory);
  });

  router.post('/restore/preview', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const backupCode = String(req.body?.backupCode || '');
    const scope = (String(req.body?.scope || 'FULL').toUpperCase()) as RestoreScopeKey;
    if (!backupCode) return apiFail(res, 'backupCode is required.', 422);
    try {
      const preview = p8.previewRestore(backupCode, scope, actor.userId);
      return apiOk(res, preview, 'Restore preview generated and backup integrity verified.');
    } catch (err) {
      return apiFail(res, err instanceof Error ? err.message : 'Restore preview failed.', 422);
    }
  });

  router.post('/restore/execute', requireAuth, requireAdmin, async (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const { backupCode, previewId, scope, confirmationText } = req.body ?? {};
    if (!backupCode || !previewId) {
      return apiFail(res, 'backupCode and previewId are required.', 422);
    }
    try {
      const historyRec = await p8.executeRestore({
        backupCode: String(backupCode),
        previewId: String(previewId),
        scope: (String(scope || 'FULL').toUpperCase()) as RestoreScopeKey,
        confirmationText: String(confirmationText || ''),
        actor,
        ipAddress: getClientIp(req),
        deviceInfo: String(req.headers['user-agent'] || 'Client').slice(0, 120),
      });
      return apiOk(res, historyRec, `Restore ${historyRec.restoreCode} completed.`);
    } catch (err) {
      return apiFail(res, err instanceof Error ? err.message : 'Restore execution failed.', 422);
    }
  });

  // ============================================================================
  // 8. DATA RECOVERY: SOFT DELETE ARCHIVE, RESTORE & PERMANENT DELETE APPROVAL
  // ============================================================================
  router.get('/recovery/deleted', requireAuth, requireSecurityViewer, (_req, res) => {
    return apiOk(res, {
      deletedRecords: p8.listUnifiedSoftDeleted(),
      recoveryLogs: p8.dataRecoveryLogs,
    });
  });

  router.post('/recovery/soft-delete', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    if (actor.role !== 'ADMIN' && actor.role !== 'MANAGER') {
      return apiFail(res, 'Forbidden: Only Admin or Manager can soft-delete protected records here.', 403);
    }
    const { entityType, entityId, reason } = req.body ?? {};
    if (!entityType || !entityId) {
      return apiFail(res, 'entityType and entityId are required.', 422);
    }
    try {
      const item = p8.softDeleteEntity({
        entityType: String(entityType).toUpperCase() as DeletedRecordItem['entityType'],
        entityId: String(entityId),
        reason: String(reason || 'Archived by operator'),
        actor,
        ipAddress: getClientIp(req),
        deviceInfo: String(req.headers['user-agent'] || 'Client').slice(0, 120),
      });
      return apiOk(res, item, `Record ${item.entityId} moved to Soft Delete Archive.`, 201);
    } catch (err) {
      return apiFail(res, err instanceof Error ? err.message : 'Soft delete failed.', 422);
    }
  });

  router.post('/recovery/:deletionCode/restore', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    if (actor.role !== 'ADMIN' && actor.role !== 'MANAGER') {
      return apiFail(res, 'Forbidden: Only Admin or Manager can recover soft-deleted records.', 403);
    }
    try {
      const recovered = p8.recoverDeletedEntity({
        deletionCode: req.params.deletionCode,
        reason: String(req.body?.reason || 'Restored from Data Recovery Center'),
        actor,
        ipAddress: getClientIp(req),
        deviceInfo: String(req.headers['user-agent'] || 'Client').slice(0, 120),
      });
      return apiOk(res, recovered, `Record ${recovered.entityId} recovered.`);
    } catch (err) {
      return apiFail(res, err instanceof Error ? err.message : 'Recovery failed.', 422);
    }
  });

  router.post('/recovery/:deletionCode/permanent-request', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    if (actor.role !== 'ADMIN' && actor.role !== 'MANAGER') {
      return apiFail(res, 'Forbidden.', 403);
    }
    try {
      const updated = p8.requestPermanentDelete({
        deletionCode: req.params.deletionCode,
        reason: String(req.body?.reason || 'Requested permanent cleanup'),
        actor,
      });
      return apiOk(res, updated, 'Permanent deletion request queued for Admin approval.');
    } catch (err) {
      return apiFail(res, err instanceof Error ? err.message : 'Permanent delete request blocked.', 422);
    }
  });

  router.post('/recovery/:deletionCode/permanent-review', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    try {
      const reviewed = p8.reviewPermanentDelete({
        deletionCode: req.params.deletionCode,
        approve: Boolean(req.body?.approve),
        reason: String(req.body?.reason || ''),
        actor,
        ipAddress: getClientIp(req),
        deviceInfo: String(req.headers['user-agent'] || 'Client').slice(0, 120),
      });
      return apiOk(res, reviewed, `Permanent deletion ${reviewed.recoveryStatus}.`);
    } catch (err) {
      return apiFail(res, err instanceof Error ? err.message : 'Permanent delete review blocked.', 422);
    }
  });

  // ============================================================================
  // 9. SECURITY ALERTS, INCIDENTS & SYSTEM HEALTH
  // ============================================================================
  router.get('/alerts', requireAuth, requireSecurityViewer, (_req, res) => {
    return apiOk(res, p8.securityAlerts);
  });

  router.post('/alerts/:alertCode/acknowledge', requireAuth, requireSecurityViewer, (req: AuthedRequest, res) => {
    const alert = p8.securityAlerts.find((a) => a.alertCode === req.params.alertCode);
    if (!alert) return apiFail(res, 'Security alert not found.', 404);
    alert.status = 'ACKNOWLEDGED';
    alert.acknowledgedBy = req.authUser!.userId;
    return apiOk(res, alert, 'Alert acknowledged.');
  });

  router.post('/alerts/:alertCode/resolve', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const alert = p8.securityAlerts.find((a) => a.alertCode === req.params.alertCode);
    if (!alert) return apiFail(res, 'Security alert not found.', 404);
    alert.status = 'RESOLVED';
    alert.resolvedBy = req.authUser!.userId;
    alert.resolutionNotes = sanitizeText(String(req.body?.notes || 'Investigated and resolved by Admin'));
    alert.resolvedAt = new Date().toISOString();
    return apiOk(res, alert, 'Alert resolved.');
  });

  router.get('/incidents', requireAuth, requireSecurityViewer, (_req, res) => {
    return apiOk(res, p8.securityIncidents);
  });

  router.post('/incidents', requireAuth, requireSecurityViewer, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const { category, severity, title, description, assignedTo } = req.body ?? {};
    if (!title || String(title).trim().length < 3) {
      return apiFail(res, 'Incident title is required.', 422);
    }
    const now = new Date().toISOString();
    const incident: SecurityIncidentRecord = {
      incidentCode: p8.nextCode('INC'),
      category: sanitizeText(String(category || 'SECURITY_EVENT')),
      severity: (String(severity || 'HIGH').toUpperCase()) as SecurityIncidentRecord['severity'],
      title: sanitizeText(String(title)),
      description: sanitizeText(String(description || '')),
      reportedBy: actor.userId,
      assignedTo: assignedTo ? sanitizeText(String(assignedTo)) : 'MC2627110001',
      investigationStatus: 'OPEN',
      resolutionNotes: '',
      createdAt: now,
      updatedAt: now,
    };
    p8.securityIncidents.unshift(incident);
    p8.raiseSecurityAlert({
      category: 'SECURITY_INCIDENT',
      severity: incident.severity,
      title: `Security Incident Logged: ${incident.incidentCode}`,
      description: incident.title,
      relatedUserId: actor.userId,
    });
    return apiOk(res, incident, `Incident ${incident.incidentCode} registered.`, 201);
  });

  router.patch('/incidents/:incidentCode', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const inc = p8.securityIncidents.find((i) => i.incidentCode === req.params.incidentCode);
    if (!inc) return apiFail(res, 'Security incident not found.', 404);
    const beforeStatus = inc.investigationStatus;
    if (req.body?.investigationStatus) {
      inc.investigationStatus = String(req.body.investigationStatus).toUpperCase() as SecurityIncidentRecord['investigationStatus'];
    }
    if (typeof req.body?.resolutionNotes === 'string') {
      inc.resolutionNotes = sanitizeText(req.body.resolutionNotes);
    }
    if (typeof req.body?.assignedTo === 'string') {
      inc.assignedTo = sanitizeText(req.body.assignedTo);
    }
    inc.updatedAt = new Date().toISOString();

    p8.recordBeforeAfterAudit({
      userId: actor.userId,
      userRole: actor.role,
      actionType: 'UPDATE_SECURITY_INCIDENT',
      module: 'security_incidents',
      recordId: inc.incidentCode,
      beforeValues: { investigationStatus: beforeStatus },
      afterValues: { investigationStatus: inc.investigationStatus, resolutionNotes: inc.resolutionNotes },
      ipAddress: getClientIp(req),
      deviceInfo: String(req.headers['user-agent'] || 'Client').slice(0, 120),
      actionResult: 'SUCCESS',
    });

    return apiOk(res, inc, `Incident ${inc.incidentCode} updated.`);
  });

  router.get('/health', requireAuth, requireSecurityViewer, (_req, res) => {
    return apiOk(res, p8.getSystemHealth());
  });

  app.use('/api/v1/security', router);
  app.use('/api/security', router);
}
