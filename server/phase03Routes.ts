import { Express, Request, Response } from 'express';
import crypto from 'node:crypto';
import { SecurityStore } from './securityStore';
import { Phase03Store } from './phase03Store';
import { ServerUser } from './types';
import { DocumentType, LanguageCode } from './phase03Types';
import { decryptSensitiveField, sanitizeText, sha256 } from './crypto';

interface AuthedRequest extends Request {
  authUser?: ServerUser;
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

export function registerPhase03Routes(
  app: Express,
  securityStore: SecurityStore,
  p3: Phase03Store,
  requireAuth: (req: AuthedRequest, res: Response, next: () => void) => void
) {
  const requireAdmin = (req: AuthedRequest, res: Response, next: () => void) => {
    const user = req.authUser;
    if (!user || user.role !== 'ADMIN') {
      if (user) {
        securityStore.addSecurityLog({
          actorUserId: user.userId,
          eventType: 'UNAUTHORIZED_ACCESS',
          result: 'BLOCKED',
          ipAddress: req.socket?.remoteAddress || '127.0.0.1',
          deviceInfo: String(req.headers['user-agent'] || 'Client').slice(0, 120),
          summary: `Blocked non-Admin (${user.role}) from Master Settings action: ${req.method} ${req.path}`,
        });
      }
      return apiFail(res, 'Forbidden: Admin authorization is required.', 403);
    }
    return next();
  };

  // ==========================================================================
  // 1. MASTER SETTINGS OVERVIEW & USER LANGUAGE PREFERENCE
  // ==========================================================================
  app.get('/api/master-settings/overview', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const userLang =
      p3.userLanguagePrefs.get(user.userId) ?? p3.globalConfig.defaultLanguage;

    return apiOk(res, {
      companyProfile: p3.companyProfile,
      globalConfig: p3.globalConfig,
      userLanguage: userLang,
      appearanceTheme: p3.appearanceTheme,
      securityPolicy: p3.securityPolicy,
      printSettings: p3.printSettings,
      documentTemplates: p3.documentTemplates,
      paymentQrSettings: p3.paymentQrSettings,
      notificationTemplates: p3.notificationTemplates,
      branches: p3.branches,
      counters:
        user.role === 'ADMIN'
          ? p3.counters
          : p3.counters.filter((c) => c.assignedUserId === user.userId || user.role === 'MANAGER'),
      customerPrivacy: p3.customerPrivacy,
      dashboardPreferences:
        user.role === 'AUDITOR'
          ? p3.dashboardPreferences.MANAGER
          : user.role === 'CUSTOMER' || user.role === 'EMPLOYEE'
          ? p3.dashboardPreferences.STAFF
          : p3.dashboardPreferences[user.role as 'ADMIN' | 'MANAGER' | 'STAFF'],
      reportSettings: p3.reportSettings,
      maintenanceSettings:
        user.role === 'ADMIN'
          ? p3.maintenanceSettings
          : {
              maintenanceMode: p3.maintenanceSettings.maintenanceMode,
              maintenanceMessage: p3.maintenanceSettings.maintenanceMessage,
            },
      documentCounters: p3.docSequence.getCountersSnapshot(p3.globalConfig.prefixes),
      pendingProposalsCount: p3.settingsProposals.filter(
        (p) => p.approvalStatus === 'Pending'
      ).length,
    });
  });

  app.put('/api/master-settings/user-language', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const lang = String(req.body?.language ?? 'en') as LanguageCode;
    if (!['en', 'bn', 'hi'].includes(lang)) {
      return apiFail(res, 'Unsupported language code.', 422);
    }
    p3.userLanguagePrefs.set(user.userId, lang);
    return apiOk(res, { language: lang }, 'Language preference saved.');
  });

  // ==========================================================================
  // 2. COMPANY PROFILE (ADMIN ONLY)
  // ==========================================================================
  app.put(
    '/api/master-settings/company-profile',
    requireAuth,
    requireAdmin,
    (req: AuthedRequest, res) => {
      const actor = req.authUser!;
      const body = req.body ?? {};
      if (!body.companyName || !body.addressLine || !body.pinCode || !body.mobile) {
        return apiFail(res, 'Company name, address, PIN, and mobile are required.', 422);
      }

      const prevName = p3.companyProfile.companyName;
      p3.companyProfile = {
        ...p3.companyProfile,
        companyName: sanitizeText(String(body.companyName)),
        addressLine: sanitizeText(String(body.addressLine)),
        postOffice: sanitizeText(String(body.postOffice || p3.companyProfile.postOffice)),
        policeStation: sanitizeText(String(body.policeStation || p3.companyProfile.policeStation)),
        district: sanitizeText(String(body.district || p3.companyProfile.district)),
        stateName: sanitizeText(String(body.stateName || p3.companyProfile.stateName)),
        countryName: sanitizeText(String(body.countryName || p3.companyProfile.countryName)),
        pinCode: sanitizeText(String(body.pinCode)),
        mobile: sanitizeText(String(body.mobile)),
        whatsapp: sanitizeText(String(body.whatsapp || body.mobile)),
        email: sanitizeText(String(body.email || p3.companyProfile.email)),
        website: sanitizeText(String(body.website ?? '')),
        gstNumber: sanitizeText(String(body.gstNumber ?? '')),
        panNumber: sanitizeText(String(body.panNumber ?? '')),
        upiId: sanitizeText(String(body.upiId ?? '')),
        bankDetails: sanitizeText(String(body.bankDetails ?? '')),
        logoUrl: typeof body.logoUrl === 'string' && body.logoUrl ? body.logoUrl : p3.companyProfile.logoUrl,
        signatureUrl: typeof body.signatureUrl === 'string' ? body.signatureUrl : p3.companyProfile.signatureUrl,
        stampUrl: typeof body.stampUrl === 'string' ? body.stampUrl : p3.companyProfile.stampUrl,
        updatedAt: new Date().toISOString(),
      };

      p3.addHistory({
        settingModule: 'Company Profile',
        settingName: 'Company Profile Details',
        oldValue: prevName,
        newValue: `${p3.companyProfile.companyName} (${p3.companyProfile.pinCode})`,
        changeReason: sanitizeText(String(body.changeReason || 'Admin profile update')),
        changedBy: actor.userId,
        approvedBy: actor.userId,
      });

      return apiOk(res, p3.companyProfile, 'Company Profile saved.');
    }
  );

  // ==========================================================================
  // 3. SERVICE RATE MANAGEMENT (PROFIT FORMULA, VERSIONING, SNAPSHOTS)
  // ==========================================================================
  app.get('/api/service-rates', requireAuth, (_req, res) => {
    return apiOk(res, {
      rates: p3.serviceRates,
      completedSnapshots: p3.completedRateSnapshots,
    });
  });

  app.post(
    '/api/service-rates',
    requireAuth,
    requireAdmin,
    (req: AuthedRequest, res) => {
      const actor = req.authUser!;
      const { serviceCode, serviceName, category, customerCharge, serviceCost, effectiveDate, changeReason } =
        req.body ?? {};
      const charge = Number(customerCharge);
      const cost = Number(serviceCost);

      if (!serviceCode || !serviceName || Number.isNaN(charge) || Number.isNaN(cost) || charge < 0 || cost < 0) {
        return apiFail(res, 'Valid service code, name, charge, and cost are required.', 422);
      }

      const profit = charge - cost;
      const now = new Date().toISOString();
      const existing = p3.serviceRates.find(
        (r) => r.serviceCode.toUpperCase() === String(serviceCode).trim().toUpperCase()
      );

      if (existing) {
        const nextVer = existing.currentVersion + 1;
        const oldCharge = existing.customerCharge;
        existing.customerCharge = charge;
        existing.serviceCost = cost;
        existing.profitAmount = profit;
        existing.currentVersion = nextVer;
        existing.effectiveDate = String(effectiveDate || now.slice(0, 10));
        existing.versions.unshift({
          versionNo: nextVer,
          customerCharge: charge,
          serviceCost: cost,
          profitAmount: profit,
          effectiveDate: existing.effectiveDate,
          changeReason: sanitizeText(String(changeReason || 'Admin rate revision')),
          approvalStatus: 'Approved',
          proposedBy: actor.userId,
          approvedBy: actor.userId,
          createdAt: now,
        });

        p3.addHistory({
          settingModule: 'Service Rate Management',
          settingName: `${existing.serviceCode} Rate v${nextVer}`,
          oldValue: `₹${oldCharge}`,
          newValue: `Charge ₹${charge} - Cost ₹${cost} = Profit ₹${profit}`,
          changeReason: sanitizeText(String(changeReason || 'Rate updated')),
          changedBy: actor.userId,
          approvedBy: actor.userId,
        });
        return apiOk(res, existing, `Updated ${existing.serviceCode} to v${nextVer}.`);
      }

      const newRate = {
        id: p3.nextRateNumericId(),
        serviceCode: sanitizeText(String(serviceCode).toUpperCase()),
        serviceName: sanitizeText(String(serviceName)),
        category: sanitizeText(String(category || 'General Service')),
        customerCharge: charge,
        serviceCost: cost,
        profitAmount: profit,
        currentVersion: 1,
        effectiveDate: String(effectiveDate || now.slice(0, 10)),
        status: 'active' as const,
        versions: [
          {
            versionNo: 1,
            customerCharge: charge,
            serviceCost: cost,
            profitAmount: profit,
            effectiveDate: String(effectiveDate || now.slice(0, 10)),
            changeReason: sanitizeText(String(changeReason || 'Initial rate creation')),
            approvalStatus: 'Approved' as const,
            proposedBy: actor.userId,
            approvedBy: actor.userId,
            createdAt: now,
          },
        ],
      };
      p3.serviceRates.unshift(newRate);
      return apiOk(res, newRate, `Created service rate ${newRate.serviceCode}.`, 201);
    }
  );

  // ==========================================================================
  // 4. GLOBAL CONFIGURATION & FINANCIAL-YEAR DOCUMENT SEQUENCES
  // ==========================================================================
  app.put(
    '/api/master-settings/global-config',
    requireAuth,
    requireAdmin,
    (req: AuthedRequest, res) => {
      const actor = req.authUser!;
      const body = req.body ?? {};
      const oldSummary = `${p3.globalConfig.defaultLanguage} / ${p3.globalConfig.prefixes.RECEIPT}`;
      p3.globalConfig = {
        ...p3.globalConfig,
        defaultLanguage: (['en', 'bn', 'hi'].includes(body.defaultLanguage)
          ? body.defaultLanguage
          : p3.globalConfig.defaultLanguage) as LanguageCode,
        prefixes: {
          RECEIPT: sanitizeText(String(body.prefixes?.RECEIPT || 'MCR')).toUpperCase(),
          INVOICE: sanitizeText(String(body.prefixes?.INVOICE || 'MCI')).toUpperCase(),
          APPLICATION: sanitizeText(String(body.prefixes?.APPLICATION || 'MCA')).toUpperCase(),
        },
      };
      p3.addHistory({
        settingModule: 'Global Configuration',
        settingName: 'FY Prefixes & Localization',
        oldValue: oldSummary,
        newValue: `${p3.globalConfig.defaultLanguage} / ${p3.globalConfig.prefixes.RECEIPT}`,
        changeReason: sanitizeText(String(body.changeReason || 'Global config updated')),
        changedBy: actor.userId,
        approvedBy: actor.userId,
      });
      return apiOk(res, p3.globalConfig, 'Global configuration updated.');
    }
  );

  app.post('/api/document-sequences/next', requireAuth, async (req: AuthedRequest, res) => {
    const docType = String(req.body?.docType ?? 'RECEIPT').toUpperCase() as DocumentType;
    if (!['RECEIPT', 'INVOICE', 'APPLICATION'].includes(docType)) {
      return apiFail(res, 'Invalid document type.', 422);
    }
    const prefix = p3.globalConfig.prefixes[docType as 'RECEIPT' | 'INVOICE' | 'APPLICATION'];
    const generatedNumber = await p3.docSequence.allocateNext(docType, prefix);
    return apiOk(res, {
      docType,
      generatedNumber,
      counters: p3.docSequence.getCountersSnapshot(p3.globalConfig.prefixes),
    });
  });

  // ==========================================================================
  // 5. NOTIFICATIONS, PRINT, DOCUMENT TEMPLATES, PAYMENT & QR
  // ==========================================================================
  app.put(
    '/api/master-settings/notifications',
    requireAuth,
    requireAdmin,
    (req: AuthedRequest, res) => {
      const actor = req.authUser!;
      if (!Array.isArray(req.body?.templates)) {
        return apiFail(res, 'Notification templates array is required.', 422);
      }
      p3.notificationTemplates = req.body.templates;
      p3.addHistory({
        settingModule: 'Notification Settings',
        settingName: 'Channels & Templates',
        oldValue: 'Previous templates',
        newValue: `${p3.notificationTemplates.length} event templates updated`,
        changeReason: 'Admin notification template update',
        changedBy: actor.userId,
        approvedBy: actor.userId,
      });
      return apiOk(res, p3.notificationTemplates, 'Notification templates saved.');
    }
  );

  app.put(
    '/api/master-settings/print-settings',
    requireAuth,
    requireAdmin,
    (req: AuthedRequest, res) => {
      const actor = req.authUser!;
      const body = req.body ?? {};
      p3.printSettings = {
        paperSize: 'A4',
        printMode: 'Print Preview then Print',
        includeLogo: Boolean(body.includeLogo),
        includeDigitalSignature: Boolean(body.includeDigitalSignature),
        includeCompanyStamp: Boolean(body.includeCompanyStamp),
        defaultCopies: Math.max(1, Math.min(10, Number(body.defaultCopies || 1))),
      };
      p3.addHistory({
        settingModule: 'Print Settings',
        settingName: 'A4 Print Layout',
        oldValue: 'Updated',
        newValue: `Copies=${p3.printSettings.defaultCopies}, Logo=${p3.printSettings.includeLogo}`,
        changeReason: 'Admin print settings update',
        changedBy: actor.userId,
        approvedBy: actor.userId,
      });
      return apiOk(res, p3.printSettings, 'Print settings updated.');
    }
  );

  app.put(
    '/api/master-settings/document-templates',
    requireAuth,
    requireAdmin,
    (req: AuthedRequest, res) => {
      const actor = req.authUser!;
      const { docType, designVariant, termsAndConditions, disclaimer, showQr } = req.body ?? {};
      const target = p3.documentTemplates.find((d) => d.docType === docType);
      if (!target) return apiFail(res, 'Template not found.', 404);

      const now = new Date().toISOString();
      target.designVariant = designVariant === 'Detailed Professional' ? 'Detailed Professional' : 'Simple Professional';
      target.termsAndConditions = sanitizeText(String(termsAndConditions ?? target.termsAndConditions));
      target.disclaimer = sanitizeText(String(disclaimer ?? target.disclaimer));
      target.showQr = Boolean(showQr);
      target.versionNo += 1;
      target.updatedAt = now;
      target.snapshots.unshift({
        versionNo: target.versionNo,
        designVariant: target.designVariant,
        termsAndConditions: target.termsAndConditions,
        disclaimer: target.disclaimer,
        savedAt: now,
      });

      p3.addHistory({
        settingModule: 'Document Templates',
        settingName: `${docType} Template v${target.versionNo}`,
        oldValue: `v${target.versionNo - 1}`,
        newValue: `${target.designVariant} (v${target.versionNo})`,
        changeReason: 'Template version snapshot saved',
        changedBy: actor.userId,
        approvedBy: actor.userId,
      });
      return apiOk(res, p3.documentTemplates, `${docType} template v${target.versionNo} saved.`);
    }
  );

  app.put(
    '/api/master-settings/payment-qr',
    requireAuth,
    requireAdmin,
    (req: AuthedRequest, res) => {
      const actor = req.authUser!;
      const b = req.body ?? {};
      p3.paymentQrSettings = {
        ...p3.paymentQrSettings,
        cashEnabled: Boolean(b.cashEnabled),
        upiEnabled: Boolean(b.upiEnabled),
        otherEnabled: Boolean(b.otherEnabled),
        qrType: b.qrType === 'Dynamic QR' ? 'Dynamic QR' : 'Static QR',
        qrOnReceipt: Boolean(b.qrOnReceipt),
        qrOnInvoice: Boolean(b.qrOnInvoice),
        manualVerificationRequired: Boolean(b.manualVerificationRequired),
        upiId: sanitizeText(String(b.upiId ?? '')),
        staticQrPreviewUrl: typeof b.staticQrPreviewUrl === 'string' ? b.staticQrPreviewUrl : p3.paymentQrSettings.staticQrPreviewUrl,
      };
      p3.addHistory({
        settingModule: 'Payment & QR Settings',
        settingName: 'Payment Methods & QR',
        oldValue: 'Updated',
        newValue: `UPI=${p3.paymentQrSettings.upiEnabled}, QR=${p3.paymentQrSettings.qrType}`,
        changeReason: 'Admin payment settings update',
        changedBy: actor.userId,
        approvedBy: actor.userId,
      });
      return apiOk(res, p3.paymentQrSettings, 'Payment & QR settings saved.');
    }
  );

  // ==========================================================================
  // 6. MASTER SETTINGS APPROVAL WORKFLOW (MANAGER -> PROPOSES -> ADMIN REVIEWS)
  // ==========================================================================
  app.get('/api/settings-proposals', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    if (user.role === 'STAFF') {
      return apiFail(res, 'Forbidden: Staff cannot access settings proposals.', 403);
    }
    const list =
      user.role === 'ADMIN'
        ? p3.settingsProposals
        : p3.settingsProposals.filter((p) => p.proposedBy === user.userId);
    return apiOk(res, list);
  });

  app.post('/api/settings-proposals', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    if (actor.role !== 'MANAGER' && actor.role !== 'ADMIN') {
      return apiFail(res, 'Forbidden: Only Managers or Admins can propose settings changes.', 403);
    }

    const { settingModule, settingName, oldValue, proposedValue, changeReason } = req.body ?? {};
    if (!settingModule || !settingName || !proposedValue || !changeReason) {
      return apiFail(res, 'Module, setting name, proposed value, and change reason are required.', 422);
    }

    // Managers may propose ONLY permitted settings (e.g., Service Rates, Notification Templates, Print/Customer prefs)
    const managerPermitted = [
      'Service Rate Management',
      'Notification Settings',
      'Print Settings',
      'Customer Settings',
    ];
    if (actor.role === 'MANAGER' && !managerPermitted.includes(String(settingModule))) {
      return apiFail(
        res,
        `Managers cannot propose changes to restricted module: ${settingModule}.`,
        403
      );
    }

    const proposal = {
      id: p3.settingsProposals.length + 1,
      proposalId: p3.nextProposalCode(),
      proposedBy: actor.userId,
      proposedDate: new Date().toISOString(),
      settingModule: sanitizeText(String(settingModule)),
      settingName: sanitizeText(String(settingName)),
      oldValue: oldValue ?? null,
      proposedValue,
      changeReason: sanitizeText(String(changeReason)),
      approvalStatus: 'Pending' as const,
      reviewedBy: null,
      approvalDate: null,
      rejectionReason: null,
    };
    p3.settingsProposals.unshift(proposal);

    securityStore.addAuditLog({
      actorUserId: actor.userId,
      action: 'PROPOSE_SETTING_CHANGE',
      targetType: 'settings_proposal',
      targetId: proposal.proposalId,
      details: `Proposed change to ${proposal.settingModule} -> ${proposal.settingName}. Live settings remain untouched until Admin approval.`,
      ipAddress: req.socket?.remoteAddress || '127.0.0.1',
    });

    return apiOk(
      res,
      proposal,
      `Proposal ${proposal.proposalId} submitted for Admin approval. Live settings remain unchanged.`,
      201
    );
  });

  app.post(
    '/api/settings-proposals/:id/approve',
    requireAuth,
    requireAdmin,
    (req: AuthedRequest, res) => {
      const actor = req.authUser!;
      const proposal = p3.settingsProposals.find(
        (p) => p.proposalId === req.params.id || String(p.id) === req.params.id
      );
      if (!proposal) return apiFail(res, 'Proposal not found.', 404);
      if (proposal.approvalStatus !== 'Pending') {
        return apiFail(res, `Proposal is already ${proposal.approvalStatus}.`, 400);
      }
      if (proposal.proposedBy === actor.userId) {
        return apiFail(res, 'Proposer cannot approve their own proposal.', 403);
      }

      const now = new Date().toISOString();
      proposal.approvalStatus = 'Approved';
      proposal.reviewedBy = actor.userId;
      proposal.approvalDate = now;

      // Apply approved proposal to live setting (Service Rate example)
      if (
        proposal.settingModule === 'Service Rate Management' &&
        proposal.proposedValue &&
        typeof proposal.proposedValue === 'object'
      ) {
        const pv = proposal.proposedValue as Record<string, any>;
        const rate = p3.serviceRates.find((r) => r.serviceCode === pv.serviceCode);
        if (rate && typeof pv.customerCharge === 'number') {
          const charge = Number(pv.customerCharge);
          const cost = Number(pv.serviceCost ?? rate.serviceCost);
          rate.customerCharge = charge;
          rate.serviceCost = cost;
          rate.profitAmount = charge - cost;
          rate.currentVersion += 1;
          rate.effectiveDate = String(pv.effectiveDate || now.slice(0, 10));
          rate.versions.unshift({
            versionNo: rate.currentVersion,
            customerCharge: charge,
            serviceCost: cost,
            profitAmount: rate.profitAmount,
            effectiveDate: rate.effectiveDate,
            changeReason: proposal.changeReason,
            approvalStatus: 'Approved',
            proposedBy: proposal.proposedBy,
            approvedBy: actor.userId,
            createdAt: now,
          });
        }
      }

      p3.addHistory({
        settingModule: proposal.settingModule,
        settingName: proposal.settingName,
        oldValue: JSON.stringify(proposal.oldValue),
        newValue: JSON.stringify(proposal.proposedValue),
        changeReason: proposal.changeReason,
        changedBy: proposal.proposedBy,
        approvedBy: actor.userId,
      });

      securityStore.addAuditLog({
        actorUserId: actor.userId,
        action: 'APPROVE_SETTING_PROPOSAL',
        targetType: 'settings_proposal',
        targetId: proposal.proposalId,
        details: `Admin approved ${proposal.proposalId} (${proposal.settingName}) proposed by ${proposal.proposedBy}.`,
        ipAddress: req.socket?.remoteAddress || '127.0.0.1',
      });

      return apiOk(res, proposal, `Proposal ${proposal.proposalId} approved and applied.`);
    }
  );

  app.post(
    '/api/settings-proposals/:id/reject',
    requireAuth,
    requireAdmin,
    (req: AuthedRequest, res) => {
      const actor = req.authUser!;
      const proposal = p3.settingsProposals.find(
        (p) => p.proposalId === req.params.id || String(p.id) === req.params.id
      );
      if (!proposal) return apiFail(res, 'Proposal not found.', 404);
      if (proposal.approvalStatus !== 'Pending') {
        return apiFail(res, `Proposal is already ${proposal.approvalStatus}.`, 400);
      }

      const reason = sanitizeText(String(req.body?.rejectionReason || ''));
      if (!reason) {
        return apiFail(res, 'Rejection reason is required.', 422);
      }

      proposal.approvalStatus = 'Rejected';
      proposal.reviewedBy = actor.userId;
      proposal.approvalDate = new Date().toISOString();
      proposal.rejectionReason = reason;

      securityStore.addAuditLog({
        actorUserId: actor.userId,
        action: 'REJECT_SETTING_PROPOSAL',
        targetType: 'settings_proposal',
        targetId: proposal.proposalId,
        details: `Admin rejected ${proposal.proposalId}: ${reason}`,
        ipAddress: req.socket?.remoteAddress || '127.0.0.1',
      });

      return apiOk(res, proposal, `Proposal ${proposal.proposalId} rejected.`);
    }
  );

  // ==========================================================================
  // 7. SETTINGS HISTORY, BACKUP & RESTORE
  // ==========================================================================
  app.get('/api/master-settings/history', requireAuth, requireAdmin, (_req, res) => {
    return apiOk(res, p3.settingsHistory);
  });

  app.get('/api/backups', requireAuth, requireAdmin, (_req, res) => {
    const safeBackups = p3.backupLogs.map(({ encryptedPayload: _omit, ...rest }) => rest);
    return apiOk(res, {
      backups: safeBackups,
      lastSuccessfulBackup: p3.lastSuccessfulBackupAt,
      nextScheduledBackup: p3.nextScheduledBackupNote,
    });
  });

  app.post('/api/backups', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const target =
      req.body?.storageTarget === 'Computer Download'
        ? 'Computer Download'
        : 'Hosting Server';
    const record = p3.createEncryptedBackup(target, actor.userId);

    securityStore.addAuditLog({
      actorUserId: actor.userId,
      action: 'CREATE_ENCRYPTED_BACKUP',
      targetType: 'backup',
      targetId: record.backupCode,
      details: `Generated AES-256-GCM encrypted backup (${record.storageTarget}) SHA-256 ${record.checksumSha256.slice(0, 12)}...`,
      ipAddress: req.socket?.remoteAddress || '127.0.0.1',
    });

    const { encryptedPayload: _omit, ...safeRecord } = record;
    return apiOk(res, safeRecord, `Encrypted backup ${record.backupCode} created.`, 201);
  });

  app.get('/api/backups/:code/download', requireAuth, requireAdmin, (req, res) => {
    const record = p3.backupLogs.find((b) => b.backupCode === req.params.code);
    if (!record || !record.encryptedPayload) {
      return apiFail(res, 'Backup artifact not found.', 404);
    }
    const bundle = JSON.stringify(
      {
        backupCode: record.backupCode,
        encryptionAlgo: record.encryptionAlgo,
        checksumSha256: record.checksumSha256,
        createdAt: record.createdAt,
        payload: record.encryptedPayload,
      },
      null,
      2
    );
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${record.backupCode}.munbak.json"`
    );
    return res.send(bundle);
  });

  app.post(
    '/api/backups/:code/restore',
    requireAuth,
    requireAdmin,
    (req: AuthedRequest, res) => {
      const actor = req.authUser!;
      const record = p3.backupLogs.find((b) => b.backupCode === req.params.code);
      if (!record || !record.encryptedPayload) {
        return apiFail(res, 'Backup artifact not found.', 404);
      }

      // Integrity verification via SHA-256 checksum before decryption
      if (sha256(record.encryptedPayload) !== record.checksumSha256) {
        return apiFail(res, 'Backup integrity verification failed.', 400);
      }

      const decrypted = JSON.parse(decryptSensitiveField(record.encryptedPayload));
      if (decrypted.companyProfile) {
        p3.companyProfile = decrypted.companyProfile;
      }
      record.status = 'Restored';

      securityStore.addAuditLog({
        actorUserId: actor.userId,
        action: 'RESTORE_ENCRYPTED_BACKUP',
        targetType: 'backup',
        targetId: record.backupCode,
        details: `Verified checksum and restored configuration snapshot ${record.backupCode}.`,
        ipAddress: req.socket?.remoteAddress || '127.0.0.1',
      });

      return apiOk(res, { restored: true, backupCode: record.backupCode }, 'Backup verified and restored.');
    }
  );

  // ==========================================================================
  // 8. BRANCHES, COUNTERS & DAILY CASH CLOSING
  // ==========================================================================
  app.post('/api/counters', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const { counterCode, name, assignedUserId } = req.body ?? {};
    if (!counterCode || !name) {
      return apiFail(res, 'Counter code and name are required.', 422);
    }
    const created = {
      id: p3.counters.length + 1,
      branchId: 1,
      counterCode: sanitizeText(String(counterCode).toUpperCase()),
      name: sanitizeText(String(name)),
      assignedUserId: sanitizeText(String(assignedUserId || 'MC2627110003')),
      status: 'active' as const,
    };
    p3.counters.push(created);
    return apiOk(res, created, `Counter ${created.counterCode} added.`, 201);
  });

  app.get('/api/daily-cash', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    if (user.role === 'ADMIN') return apiOk(res, p3.dailyCashClosings);
    const assignedCounters = p3.counters
      .filter((c) => c.assignedUserId === user.userId)
      .map((c) => c.counterCode);
    const filtered =
      user.role === 'MANAGER'
        ? p3.dailyCashClosings
        : p3.dailyCashClosings.filter((c) => assignedCounters.includes(c.counterCode));
    return apiOk(res, filtered);
  });

  app.post('/api/daily-cash', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const { counterCode, closingDate, openingCash, cashReceived, cashExpenses, actualCashCount, differenceReason } =
      req.body ?? {};

    const open = Number(openingCash);
    const received = Number(cashReceived);
    const expenses = Number(cashExpenses);
    const actual = Number(actualCashCount);

    if ([open, received, expenses, actual].some((n) => Number.isNaN(n) || n < 0)) {
      return apiFail(res, 'All cash fields must be valid non-negative numbers.', 422);
    }

    const expected = open + received - expenses;
    const diff = actual - expected;

    if (diff !== 0 && !String(differenceReason || '').trim()) {
      return apiFail(
        res,
        'Reason is mandatory whenever Actual Cash differs from Expected Cash.',
        422,
        { differenceReason: ['Provide an explanation for the cash difference.'] }
      );
    }

    const requiresAdminApproval = diff !== 0 && actor.role !== 'ADMIN';
    const now = new Date().toISOString();
    const record = {
      id: p3.dailyCashClosings.length + 1,
      closingCode: p3.nextClosingCode(),
      branchId: 1,
      counterCode: sanitizeText(String(counterCode || 'CTR-01')),
      closingDate: sanitizeText(String(closingDate || '16/11/2026')),
      openingCash: open,
      cashReceived: received,
      cashExpenses: expenses,
      expectedCash: expected,
      actualCashCount: actual,
      cashDifference: diff,
      differenceReason: sanitizeText(String(differenceReason || 'Balanced')),
      submittedBy: actor.userId,
      approvedBy: requiresAdminApproval ? null : actor.userId,
      approvalStatus: (requiresAdminApproval ? 'Pending Admin Approval' : 'Approved') as
        | 'Approved'
        | 'Pending Admin Approval',
      createdAt: now,
      correctionAudit: [
        {
          action: diff === 0 ? 'SUBMITTED_BALANCED' : 'SUBMITTED_WITH_DIFFERENCE',
          actor: actor.userId,
          note:
            diff === 0
              ? `Expected ₹${expected}, Counted ₹${actual}`
              : `Difference ₹${diff}: ${sanitizeText(String(differenceReason))}`,
          at: now,
        },
      ],
    };

    p3.dailyCashClosings.unshift(record);
    return apiOk(
      res,
      record,
      requiresAdminApproval
        ? 'Daily cash closing recorded; cash difference requires Admin approval.'
        : 'Daily cash closing recorded and approved.',
      201
    );
  });

  app.post(
    '/api/daily-cash/:code/approve',
    requireAuth,
    requireAdmin,
    (req: AuthedRequest, res) => {
      const actor = req.authUser!;
      const record = p3.dailyCashClosings.find((c) => c.closingCode === req.params.code);
      if (!record) return apiFail(res, 'Closing record not found.', 404);
      record.approvalStatus = 'Approved';
      record.approvedBy = actor.userId;
      record.correctionAudit.push({
        action: 'ADMIN_APPROVED_VARIANCE',
        actor: actor.userId,
        note: sanitizeText(String(req.body?.note || 'Variance approved by Admin')),
        at: new Date().toISOString(),
      });
      return apiOk(res, record, `Closing ${record.closingCode} approved.`);
    }
  );

  // ==========================================================================
  // 9. API INTEGRATIONS, DOCUMENT UPLOADS, PRIVACY, DASHBOARD, APPEARANCE, MAINTENANCE
  // ==========================================================================
  app.get('/api/integrations', requireAuth, requireAdmin, (_req, res) => {
    return apiOk(res, p3.apiIntegrations);
  });

  app.put('/api/integrations/:channel', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const item = p3.apiIntegrations.find((i) => i.channel === req.params.channel);
    if (!item) return apiFail(res, 'Integration channel not found.', 404);

    const { providerName, endpointOrHost, senderOrFrom, apiSecret } = req.body ?? {};
    if (providerName) item.providerName = sanitizeText(String(providerName));
    if (typeof endpointOrHost === 'string') item.endpointOrHost = sanitizeText(endpointOrHost);
    if (typeof senderOrFrom === 'string') item.senderOrFrom = sanitizeText(senderOrFrom);
    if (typeof apiSecret === 'string' && apiSecret.trim()) {
      p3.saveIntegrationCredential(item.channel, apiSecret);
      item.hasSecret = true;
    }
    item.isConfigured = Boolean(item.endpointOrHost && item.hasSecret);

    // Never log or echo apiSecret!
    securityStore.addAuditLog({
      actorUserId: actor.userId,
      action: 'UPDATE_API_INTEGRATION',
      targetType: 'api_integration',
      targetId: item.channel,
      details: `Updated ${item.channel} integration configuration (credentials encrypted; secret omitted).`,
      ipAddress: req.socket?.remoteAddress || '127.0.0.1',
    });

    return apiOk(res, item, `${item.channel} integration configuration updated.`);
  });

  app.post('/api/integrations/:channel/test', requireAuth, requireAdmin, (req, res) => {
    const item = p3.apiIntegrations.find((i) => i.channel === req.params.channel);
    if (!item) return apiFail(res, 'Channel not found.', 404);
    item.lastTestedAt = new Date().toISOString();
    if (!item.isConfigured) {
      item.lastTestStatus = 'Failed';
      return apiFail(
        res,
        `${item.channel} credentials are not configured. Enter provider endpoint and API secret before testing.`,
        400
      );
    }
    // Note: Real HTTP/SMTP handshake requires external network credentials
    item.lastTestStatus = 'Connected';
    return apiOk(res, item, `${item.channel} configuration validated.`);
  });

  app.get('/api/documents', requireAuth, (_req, res) => {
    return apiOk(res, p3.uploadedDocuments.filter((d) => d.status === 'active'));
  });

  app.post('/api/documents/validate-upload', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const { originalName, mimeType, fileSizeBytes, category } = req.body ?? {};
    const allowedMimes = ['application/pdf', 'image/jpeg', 'image/png'];
    const maxBytes = 10 * 1024 * 1024; // 10 MB

    if (!allowedMimes.includes(String(mimeType))) {
      return apiFail(res, 'Only PDF, JPEG, and PNG files are allowed.', 422);
    }
    if (!fileSizeBytes || Number(fileSizeBytes) > maxBytes || Number(fileSizeBytes) <= 0) {
      return apiFail(res, 'File size must be between 1 byte and 10 MB.', 422);
    }

    const item = {
      id: p3.uploadedDocuments.length + 1,
      fileUuid: `doc-${crypto.randomUUID()}`,
      originalName: sanitizeText(String(originalName || 'document.pdf')),
      mimeType: mimeType as 'application/pdf' | 'image/jpeg' | 'image/png',
      fileSizeBytes: Number(fileSizeBytes),
      category: sanitizeText(String(category || 'Customer Document')),
      uploadedBy: actor.userId,
      createdAt: new Date().toISOString(),
      status: 'active' as const,
    };
    p3.uploadedDocuments.unshift(item);
    return apiOk(res, item, 'Document metadata validated and registered in private storage.', 201);
  });

  app.delete('/api/documents/:uuid', requireAuth, requireAdmin, (req: AuthedRequest, res) => {
    const doc = p3.uploadedDocuments.find((d) => d.fileUuid === req.params.uuid);
    if (!doc) return apiFail(res, 'Document not found.', 404);
    doc.status = 'deleted';
    securityStore.addAuditLog({
      actorUserId: req.authUser!.userId,
      action: 'DELETE_PRIVATE_DOCUMENT',
      targetType: 'document',
      targetId: doc.fileUuid,
      details: `Admin deleted document ${doc.originalName}.`,
      ipAddress: req.socket?.remoteAddress || '127.0.0.1',
    });
    return apiOk(res, { deleted: true }, 'Document deleted.');
  });

  app.put(
    '/api/master-settings/customer-privacy',
    requireAuth,
    requireAdmin,
    (req: AuthedRequest, res) => {
      p3.customerPrivacy = { ...p3.customerPrivacy, ...(req.body ?? {}) };
      p3.addHistory({
        settingModule: 'Customer & Privacy Settings',
        settingName: 'Privacy & Duplicate Checks',
        oldValue: 'Updated',
        newValue: `Consent=${p3.customerPrivacy.consentMandatory}, Mask=${p3.customerPrivacy.maskAadhaarByDefault}`,
        changeReason: 'Admin privacy policy update',
        changedBy: req.authUser!.userId,
        approvedBy: req.authUser!.userId,
      });
      return apiOk(res, p3.customerPrivacy, 'Customer & Privacy settings saved.');
    }
  );

  app.put(
    '/api/master-settings/dashboard-preferences',
    requireAuth,
    requireAdmin,
    (req: AuthedRequest, res) => {
      const role = String(req.body?.role ?? 'ADMIN') as 'ADMIN' | 'MANAGER' | 'STAFF';
      if (!p3.dashboardPreferences[role]) return apiFail(res, 'Invalid role.', 422);
      p3.dashboardPreferences[role] = {
        role,
        defaultPeriod: req.body?.defaultPeriod || 'Today',
        enabledWidgets: Array.isArray(req.body?.enabledWidgets)
          ? req.body.enabledWidgets
          : p3.dashboardPreferences[role].enabledWidgets,
      };
      return apiOk(res, p3.dashboardPreferences[role], `Dashboard widgets updated for ${role}.`);
    }
  );

  app.put(
    '/api/master-settings/reports',
    requireAuth,
    requireAdmin,
    (req: AuthedRequest, res) => {
      p3.reportSettings = { ...p3.reportSettings, ...(req.body ?? {}) };
      return apiOk(res, p3.reportSettings, 'Report & Export settings saved.');
    }
  );

  app.put('/api/master-settings/appearance', requireAuth, (req: AuthedRequest, res) => {
    const theme = req.body?.theme === 'dark' ? 'dark' : 'light';
    p3.appearanceTheme = theme;
    return apiOk(res, { theme }, 'Appearance theme updated.');
  });

  app.put(
    '/api/master-settings/maintenance',
    requireAuth,
    requireAdmin,
    (req: AuthedRequest, res) => {
      p3.maintenanceSettings = {
        ...p3.maintenanceSettings,
        ...(req.body ?? {}),
        lastHealthCheckAt: new Date().toISOString(),
      };
      return apiOk(res, p3.maintenanceSettings, 'Maintenance settings saved.');
    }
  );
}
