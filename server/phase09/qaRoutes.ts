import { Express, NextFunction, Request, Response, Router } from 'express';
import { SecurityStore } from '../securityStore.js';
import { Phase03Store } from '../phase03Store.js';
import { ErpStore } from '../erpStore.js';
import { FinanceStore } from '../finance/financeStore.js';
import { ReportStore } from '../reports/reportStore.js';
import { Phase08Store } from '../phase08/phase08Store.js';
import { sanitizeText } from '../crypto.js';
import { ServerSession, ServerUser } from '../types.js';
import { QaStore } from './qaStore.js';
import {
  LiveStoresContext,
  runFinancialReconciliationCheck,
  runIsolatedBackupRestoreDrill,
  runPerformanceBenchmarkSuite,
  runSecurityAuditSuite,
} from './qaRunner.js';
import { generateQaExcelWorkbook, generateQaPdfReport } from './qaReportExporters.js';
import {
  BugCategory,
  BugPriority,
  BugStatus,
  QaBackupDrillRecord,
  QaEnvironmentKey,
  QaSecurityFinding,
  QaTestCaseDef,
} from './qaTypes.js';

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

export function registerQaRoutes(
  app: Express,
  securityStore: SecurityStore,
  phase03Store: Phase03Store,
  erpStore: ErpStore,
  financeStore: FinanceStore,
  reportStore: ReportStore,
  phase08Store: Phase08Store,
  qaStore: QaStore,
  requireAuth: (req: AuthedRequest, res: Response, next: NextFunction) => void
) {
  const router = Router();

  const buildLiveContext = (): LiveStoresContext => ({
    securityStore,
    phase03Store,
    erpStore,
    financeStore,
    reportStore,
    phase08Store,
  });

  const toAuditRecord = (v: unknown): Record<string, unknown> | null => {
    if (v === null || v === undefined) return null;
    if (typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
    return { value: v };
  };

  const auditQa = (
    actor: ServerUser,
    req: Request,
    actionType: string,
    recordId: string,
    beforeValues: unknown,
    afterValues: unknown,
    actionResult: 'SUCCESS' | 'FAILURE' | 'BLOCKED' = 'SUCCESS'
  ) => {
    phase08Store.recordBeforeAfterAudit({
      userId: actor.userId,
      userRole: actor.role,
      actionType,
      module: 'phase09_qa',
      recordId,
      beforeValues: toAuditRecord(beforeValues),
      afterValues: toAuditRecord(afterValues),
      ipAddress: getClientIp(req),
      deviceInfo: String(req.headers['user-agent'] || 'Client').slice(0, 120),
      actionResult,
    });
  };

  const requireQaViewer = (req: AuthedRequest, res: Response, next: NextFunction) => {
    const actor = req.authUser;
    if (!actor) return apiFail(res, 'Authentication required.', 401);
    if (
      actor.role === 'ADMIN' ||
      actor.role === 'MANAGER' ||
      actor.role === 'AUDITOR' ||
      securityStore.hasPermission(actor, 'security_logs', 'VIEW') ||
      securityStore.hasPermission(actor, 'reports', 'VIEW')
    ) {
      return next();
    }
    return apiFail(res, 'Forbidden: QA Workspace view access denied for this role.', 403);
  };

  const requireQaOperator = (req: AuthedRequest, res: Response, next: NextFunction) => {
    const actor = req.authUser;
    if (!actor) return apiFail(res, 'Authentication required.', 401);
    if (actor.role !== 'ADMIN' && actor.role !== 'MANAGER') {
      auditQa(actor, req, 'QA_OPERATOR_FORBIDDEN', req.path, null, { blocked: true }, 'BLOCKED');
      return apiFail(
        res,
        'Forbidden: Only Admin or Manager can execute QA suites and drills.',
        403
      );
    }
    return next();
  };

  const requireAdmin = (req: AuthedRequest, res: Response, next: NextFunction) => {
    const actor = req.authUser;
    if (!actor) return apiFail(res, 'Authentication required.', 401);
    if (actor.role !== 'ADMIN') {
      auditQa(actor, req, 'QA_ADMIN_FORBIDDEN', req.path, null, { blocked: true }, 'BLOCKED');
      return apiFail(res, 'Forbidden: Only ADMIN is authorized for this action.', 403);
    }
    return next();
  };

  // ---------------------------------------------------------------------------
  // 1. QA Executive Dashboard Overview & Environments
  // ---------------------------------------------------------------------------
  router.get('/dashboard', requireAuth, requireQaViewer, (req: AuthedRequest, res: Response) => {
    const overview = qaStore.getDashboardOverview({
      fromDate: typeof req.query.fromDate === 'string' ? req.query.fromDate : undefined,
      toDate: typeof req.query.toDate === 'string' ? req.query.toDate : undefined,
      testerUserId: typeof req.query.testerUserId === 'string' ? req.query.testerUserId : undefined,
      severity: typeof req.query.severity === 'string' ? req.query.severity : undefined,
    });
    return apiOk(res, overview);
  });

  router.get('/environments', requireAuth, requireQaViewer, (_req: AuthedRequest, res: Response) => {
    return apiOk(res, qaStore.environments);
  });

  router.put('/environments/:envKey', requireAuth, requireAdmin, (req: AuthedRequest, res: Response) => {
    const actor = req.authUser!;
    const envKey = String(req.params.envKey).toUpperCase() as QaEnvironmentKey;
    const env = qaStore.environments.find((e) => e.envKey === envKey);
    if (!env) return apiFail(res, 'Environment not found.', 404);
    if (env.envKey === 'PRODUCTION' && (req.body.allowAutomatedTests || req.body.allowDestructiveDrills)) {
      return apiFail(
        res,
        'Safety Policy Violation: PRODUCTION cannot enable automated or destructive QA drills.',
        422
      );
    }
    const before = { ...env };
    if (typeof req.body.allowAutomatedTests === 'boolean') env.allowAutomatedTests = req.body.allowAutomatedTests;
    if (typeof req.body.allowDestructiveDrills === 'boolean') env.allowDestructiveDrills = req.body.allowDestructiveDrills;
    if (typeof req.body.appUrl === 'string' && req.body.appUrl.trim()) env.appUrl = sanitizeText(req.body.appUrl);
    env.lastCheckedAt = new Date().toISOString();
    env.updatedBy = actor.userId;
    auditQa(actor, req, 'QA_ENV_UPDATE', env.envKey, before, env);
    return apiOk(res, env, `Environment ${env.envKey} updated.`);
  });

  // ---------------------------------------------------------------------------
  // 2. Suites, Test Case Register & Live Execution Workbench
  // ---------------------------------------------------------------------------
  router.get('/suites', requireAuth, requireQaViewer, (_req: AuthedRequest, res: Response) => {
    return apiOk(res, qaStore.suites);
  });

  router.get('/test-cases', requireAuth, requireQaViewer, (req: AuthedRequest, res: Response) => {
    let items = [...qaStore.testCases];
    const suiteCode = typeof req.query.suiteCode === 'string' ? req.query.suiteCode : '';
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    const priority = typeof req.query.priority === 'string' ? req.query.priority : '';
    const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
    if (suiteCode && suiteCode !== 'ALL') items = items.filter((c) => c.suiteCode === suiteCode);
    if (status && status !== 'ALL') items = items.filter((c) => c.lastStatus === status);
    if (priority && priority !== 'ALL') items = items.filter((c) => c.priority === priority);
    if (search) {
      items = items.filter(
        (c) =>
          c.caseCode.toLowerCase().includes(search) ||
          c.title.toLowerCase().includes(search) ||
          c.moduleName.toLowerCase().includes(search)
      );
    }
    return apiOk(res, items);
  });

  router.post('/test-cases', requireAuth, requireQaOperator, (req: AuthedRequest, res: Response) => {
    const actor = req.authUser!;
    const title = String(req.body.title || '').trim();
    const expectedResult = String(req.body.expectedResult || '').trim();
    if (!title || !expectedResult) {
      return apiFail(res, 'Test title and expected result are required.', 422);
    }
    const created = qaStore.addCustomTestCase({
      suiteCode: String(req.body.suiteCode || 'SUITE-SYS'),
      moduleName: String(req.body.moduleName || 'Custom Module'),
      targetPhase: String(req.body.targetPhase || 'Phase 09'),
      testType: (req.body.testType || 'SYSTEM') as QaTestCaseDef['testType'],
      polarity: (req.body.polarity || 'POSITIVE') as QaTestCaseDef['polarity'],
      priority: (req.body.priority || 'HIGH') as QaTestCaseDef['priority'],
      title,
      preconditions: String(req.body.preconditions || ''),
      steps: Array.isArray(req.body.steps)
        ? req.body.steps.map(String)
        : String(req.body.steps || 'Verify module behavior')
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
      expectedResult,
    });
    auditQa(actor, req, 'QA_CASE_CREATE', created.caseCode, null, created);
    return apiOk(res, created, `Test case ${created.caseCode} registered as PENDING.`, 201);
  });

  router.get('/executions', requireAuth, requireQaViewer, (_req: AuthedRequest, res: Response) => {
    return apiOk(res, {
      batches: qaStore.executions.slice(0, 50),
      results: qaStore.results.slice(0, 150),
    });
  });

  router.post('/execute', requireAuth, requireQaOperator, async (req: AuthedRequest, res: Response) => {
    const actor = req.authUser!;
    const envKey = String(req.body.envKey || 'TESTING').toUpperCase() as QaEnvironmentKey;
    const suiteCode = typeof req.body.suiteCode === 'string' ? req.body.suiteCode : 'ALL';
    const caseCodes = Array.isArray(req.body.caseCodes) ? req.body.caseCodes.map(String) : undefined;
    const triggerSource = req.body.triggerSource || 'MANUAL_UI';

    try {
      const outcome = await qaStore.executeSuiteOrCases({
        envKey,
        suiteCode,
        caseCodes,
        triggerSource,
        actorUserId: actor.userId,
        live: buildLiveContext(),
      });
      auditQa(actor, req, 'QA_SUITE_EXECUTE', outcome.batch.executionCode, null, outcome.batch);
      return apiOk(
        res,
        outcome,
        `Executed ${outcome.batch.totalCases} test(s): ${outcome.batch.passedCount} Passed, ${outcome.batch.failedCount} Failed, ${outcome.batch.blockedCount} Blocked.`
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Test execution failed.';
      auditQa(actor, req, 'QA_SUITE_EXECUTE_BLOCKED', envKey, null, { error: msg }, 'BLOCKED');
      return apiFail(res, msg, 422);
    }
  });

  router.post(
    '/test-cases/:caseCode/manual-result',
    requireAuth,
    requireQaOperator,
    (req: AuthedRequest, res: Response) => {
      const actor = req.authUser!;
      const status = String(req.body.status || '').toUpperCase();
      if (!['PASSED', 'FAILED', 'BLOCKED'].includes(status)) {
        return apiFail(res, 'Manual outcome status must be PASSED, FAILED, or BLOCKED.', 422);
      }
      const actualResult = String(req.body.actualResult || '').trim();
      if (!actualResult) {
        return apiFail(res, 'Actual observed result notes are required.', 422);
      }
      try {
        const rec = qaStore.recordManualCaseOutcome({
          caseCode: req.params.caseCode,
          status: status as 'PASSED' | 'FAILED' | 'BLOCKED',
          actualResult,
          actorUserId: actor.userId,
          envKey: (req.body.envKey || 'TESTING') as QaEnvironmentKey,
        });
        auditQa(actor, req, 'QA_MANUAL_CASE_OUTCOME', rec.caseCode, null, rec);
        return apiOk(res, rec, `Manual verification recorded as ${rec.status}.`);
      } catch (err) {
        return apiFail(res, err instanceof Error ? err.message : 'Unable to record outcome.', 404);
      }
    }
  );

  // ---------------------------------------------------------------------------
  // 3. Bug Management & Regression Lifecycle
  // ---------------------------------------------------------------------------
  router.get('/bugs', requireAuth, requireQaViewer, (req: AuthedRequest, res: Response) => {
    let items = [...qaStore.bugs];
    const priority = typeof req.query.priority === 'string' ? req.query.priority : '';
    const status = typeof req.query.status === 'string' ? req.query.status : '';
    const category = typeof req.query.category === 'string' ? req.query.category : '';
    if (priority && priority !== 'ALL') items = items.filter((b) => b.priority === priority);
    if (status && status !== 'ALL') items = items.filter((b) => b.status === status);
    if (category && category !== 'ALL') items = items.filter((b) => b.category === category);
    return apiOk(res, {
      bugs: items,
      notifications: qaStore.bugNotifications.slice(0, 40),
    });
  });

  router.post('/bugs', requireAuth, (req: AuthedRequest, res: Response) => {
    const actor = req.authUser!;
    const title = String(req.body.title || '').trim();
    const description = String(req.body.description || '').trim();
    const expectedResult = String(req.body.expectedResult || '').trim();
    const actualResult = String(req.body.actualResult || '').trim();
    if (!title || !description || !expectedResult || !actualResult) {
      return apiFail(
        res,
        'Bug title, description, expected result, and actual result are required.',
        422
      );
    }
    const bug = qaStore.createBugReport({
      title,
      category: (req.body.category || 'Functional') as BugCategory,
      priority: (req.body.priority || 'Medium') as BugPriority,
      moduleName: String(req.body.moduleName || 'General'),
      relatedCaseCode: req.body.relatedCaseCode || null,
      envKey: (req.body.envKey || 'TESTING') as QaEnvironmentKey,
      description,
      reproductionSteps: String(req.body.reproductionSteps || '1. Open module\n2. Reproduce issue'),
      expectedResult,
      actualResult,
      evidenceRef: req.body.evidenceRef || null,
      assignedDeveloper: req.body.assignedDeveloper || null,
      reportedBy: actor.userId,
    });
    auditQa(actor, req, 'QA_BUG_CREATE', bug.bugCode, null, {
      bugCode: bug.bugCode,
      priority: bug.priority,
      status: bug.status,
    });
    return apiOk(res, bug, `Bug ${bug.bugCode} logged (${bug.priority}).`, 201);
  });

  router.patch('/bugs/:bugCode', requireAuth, (req: AuthedRequest, res: Response) => {
    const actor = req.authUser!;
    const before = qaStore.bugs.find((b) => b.bugCode === req.params.bugCode);
    if (!before) return apiFail(res, 'Bug report not found.', 404);
    const prevSnap = { status: before.status, assignedDeveloper: before.assignedDeveloper };
    try {
      const updated = qaStore.updateBug({
        bugCode: req.params.bugCode,
        status: req.body.status as BugStatus | undefined,
        assignedDeveloper: req.body.assignedDeveloper,
        resolutionNotes: req.body.resolutionNotes,
        retestOutcome: req.body.retestOutcome as 'PASSED' | 'FAILED' | undefined,
        actorUserId: actor.userId,
      });
      auditQa(actor, req, 'QA_BUG_UPDATE', updated.bugCode, prevSnap, {
        status: updated.status,
        assignedDeveloper: updated.assignedDeveloper,
        retests: updated.retestHistory.length,
      });
      return apiOk(res, updated, `Bug ${updated.bugCode} updated to ${updated.status}.`);
    } catch (err) {
      return apiFail(res, err instanceof Error ? err.message : 'Bug update failed.', 400);
    }
  });

  router.get('/regression', requireAuth, requireQaViewer, (_req: AuthedRequest, res: Response) => {
    return apiOk(res, qaStore.regressionRuns);
  });

  router.post('/regression/run', requireAuth, requireQaOperator, async (req: AuthedRequest, res: Response) => {
    const actor = req.authUser!;
    const envKey = String(req.body.envKey || 'TESTING').toUpperCase() as QaEnvironmentKey;
    const affectedModules = Array.isArray(req.body.affectedModules)
      ? req.body.affectedModules.map(String)
      : [];
    try {
      const reg = await qaStore.runRegressionSuite({
        triggerReason: String(req.body.triggerReason || 'Manual Regression Run'),
        affectedModules,
        envKey,
        actorUserId: actor.userId,
        live: buildLiveContext(),
      });
      auditQa(actor, req, 'QA_REGRESSION_RUN', reg.regressionCode, null, reg);
      return apiOk(res, reg, `Regression ${reg.regressionCode} completed with status ${reg.status}.`);
    } catch (err) {
      return apiFail(res, err instanceof Error ? err.message : 'Regression run failed.', 422);
    }
  });

  // ---------------------------------------------------------------------------
  // 4. Security Audit & Penetration Testing
  // ---------------------------------------------------------------------------
  router.get('/security-findings', requireAuth, requireQaViewer, (_req: AuthedRequest, res: Response) => {
    return apiOk(res, qaStore.securityFindings);
  });

  router.post('/security-audit/run', requireAuth, requireQaOperator, (req: AuthedRequest, res: Response) => {
    const actor = req.authUser!;
    const findings = runSecurityAuditSuite(actor.userId, buildLiveContext());
    qaStore.securityFindings.unshift(...findings);
    auditQa(actor, req, 'QA_SECURITY_AUDIT_RUN', `SEC-${Date.now()}`, null, {
      findingsCount: findings.length,
    });
    return apiOk(res, findings, `Executed OWASP Security Audit (${findings.length} checks).`);
  });

  router.patch(
    '/security-findings/:findingCode',
    requireAuth,
    requireAdmin,
    (req: AuthedRequest, res: Response) => {
      const actor = req.authUser!;
      const finding = qaStore.securityFindings.find((f) => f.findingCode === req.params.findingCode);
      if (!finding) return apiFail(res, 'Security finding not found.', 404);
      const before = { ...finding };
      if (req.body.status) {
        finding.status = req.body.status as QaSecurityFinding['status'];
      }
      if (req.body.remediationNotes) {
        finding.remediationNotes = sanitizeText(String(req.body.remediationNotes));
      }
      finding.retestedAt = new Date().toISOString();
      auditQa(actor, req, 'QA_SECURITY_FINDING_UPDATE', finding.findingCode, before, finding);
      return apiOk(res, finding, `Security finding ${finding.findingCode} updated.`);
    }
  );

  // ---------------------------------------------------------------------------
  // 5. Performance Benchmarks & Browser Compatibility Matrix
  // ---------------------------------------------------------------------------
  router.get('/performance', requireAuth, requireQaViewer, (_req: AuthedRequest, res: Response) => {
    return apiOk(res, qaStore.performanceResults);
  });

  router.post('/performance/run', requireAuth, requireQaOperator, async (req: AuthedRequest, res: Response) => {
    const actor = req.authUser!;
    const items = await runPerformanceBenchmarkSuite(actor.userId, buildLiveContext());
    qaStore.performanceResults.unshift(...items);
    auditQa(actor, req, 'QA_PERF_BENCHMARK_RUN', `PERF-${Date.now()}`, null, {
      scenarios: items.length,
      failed: items.filter((x) => !x.passed).length,
    });
    return apiOk(res, items, `Completed ${items.length} real performance benchmarks.`);
  });

  router.get('/browser-matrix', requireAuth, requireQaViewer, (_req: AuthedRequest, res: Response) => {
    return apiOk(res, qaStore.browserMatrix);
  });

  router.patch('/browser-matrix/:matrixCode', requireAuth, (req: AuthedRequest, res: Response) => {
    const actor = req.authUser!;
    const item = qaStore.browserMatrix.find((b) => b.matrixCode === req.params.matrixCode);
    if (!item) return apiFail(res, 'Browser compatibility record not found.', 404);
    const before = { ...item };
    if (typeof req.body.bengaliFontsOk === 'boolean') item.bengaliFontsOk = req.body.bengaliFontsOk;
    if (typeof req.body.pdfPrintOk === 'boolean') item.pdfPrintOk = req.body.pdfPrintOk;
    if (typeof req.body.responsiveOk === 'boolean') item.responsiveOk = req.body.responsiveOk;
    if (req.body.status) item.status = req.body.status;
    if (req.body.verificationMode) item.verificationMode = req.body.verificationMode;
    if (typeof req.body.notes === 'string') item.notes = sanitizeText(req.body.notes);
    item.testedBy = actor.userId;
    item.testedAt = new Date().toISOString();
    auditQa(actor, req, 'QA_COMPAT_UPDATE', item.matrixCode, before, item);
    return apiOk(res, item, `Compatibility record ${item.matrixCode} updated to ${item.status}.`);
  });

  // ---------------------------------------------------------------------------
  // 6. Financial Reconciliation & Isolated Backup/Restore Drills
  // ---------------------------------------------------------------------------
  router.get('/financial-reconciliation', requireAuth, requireQaViewer, (_req: AuthedRequest, res: Response) => {
    return apiOk(res, qaStore.financialReconciliations);
  });

  router.post(
    '/financial-reconciliation/run',
    requireAuth,
    requireQaOperator,
    (req: AuthedRequest, res: Response) => {
      const actor = req.authUser!;
      const envKey = String(req.body.envKey || 'TESTING').toUpperCase() as QaEnvironmentKey;
      const rec = runFinancialReconciliationCheck(buildLiveContext(), envKey, actor.userId);
      qaStore.financialReconciliations.unshift(rec);
      auditQa(actor, req, 'QA_FIN_RECONCILIATION', rec.reconciliationCode, null, {
        status: rec.status,
        mismatchCount: rec.mismatchCount,
      });
      return apiOk(res, rec, `Financial reconciliation finished: ${rec.status}.`);
    }
  );

  router.get('/backup-drills', requireAuth, requireQaViewer, (_req: AuthedRequest, res: Response) => {
    return apiOk(res, qaStore.backupDrills);
  });

  router.post('/backup-drills/run', requireAuth, requireQaOperator, async (req: AuthedRequest, res: Response) => {
    const actor = req.authUser!;
    const envKey = String(req.body.envKey || 'TESTING').toUpperCase() as QaEnvironmentKey;
    const env = qaStore.environments.find((e) => e.envKey === envKey);
    if (!env || !env.allowDestructiveDrills) {
      return apiFail(
        res,
        `Safety Policy Blocked: Backup/Restore destructive drill is only allowed on isolated TESTING or DEVELOPMENT sandboxes.`,
        422
      );
    }
    const scope = (req.body.drillScope || 'FULL') as QaBackupDrillRecord['drillScope'];
    const schedule = (req.body.scheduleTested || 'DAILY') as QaBackupDrillRecord['scheduleTested'];
    const drill = await runIsolatedBackupRestoreDrill(scope, schedule, actor.userId);
    qaStore.backupDrills.unshift(drill);
    auditQa(actor, req, 'QA_BACKUP_DRILL', drill.drillCode, null, drill);
    return apiOk(res, drill, `Isolated ${drill.drillScope} backup & restore drill ${drill.status}.`);
  });

  // ---------------------------------------------------------------------------
  // 7. UAT Sessions, Attachments & Strict Admin Final Release Approval
  // ---------------------------------------------------------------------------
  router.get('/uat', requireAuth, requireQaViewer, (_req: AuthedRequest, res: Response) => {
    return apiOk(res, qaStore.uatSessions);
  });

  router.post('/uat', requireAuth, (req: AuthedRequest, res: Response) => {
    const actor = req.authUser!;
    const workflowName = String(req.body.workflowName || '').trim();
    const feedback = String(req.body.feedback || '').trim();
    if (!workflowName) {
      return apiFail(res, 'Workflow name is required for UAT submission.', 422);
    }
    const requestedRole = String(req.body.testerRole || actor.role).toUpperCase();
    if (!['ADMIN', 'MANAGER', 'STAFF'].includes(requestedRole)) {
      return apiFail(res, 'UAT testerRole must be ADMIN, MANAGER, or STAFF.', 422);
    }
    if (actor.role !== 'ADMIN' && requestedRole !== actor.role) {
      return apiFail(res, 'Non-Admin users can only submit UAT for their own role.', 403);
    }

    const reqStatus = req.body.acceptanceStatus || 'PENDING';
    const acceptanceStatus =
      actor.role === 'ADMIN'
        ? reqStatus
        : reqStatus === 'ACCEPTED' || reqStatus === 'CHANGES_REQUESTED'
          ? 'PENDING'
          : 'PENDING';

    const uat = {
      uatCode: qaStore.nextCode('UAT'),
      testerUserId: actor.userId,
      testerRole: requestedRole as 'ADMIN' | 'MANAGER' | 'STAFF',
      workflowName: sanitizeText(workflowName),
      casesVerified: Math.max(1, Number(req.body.casesVerified) || 1),
      feedback: sanitizeText(feedback || 'End-to-end role workflow tested.'),
      acceptanceStatus: acceptanceStatus as 'PENDING' | 'ACCEPTED' | 'CHANGES_REQUESTED',
      approvedBy: acceptanceStatus === 'ACCEPTED' ? actor.userId : null,
      approvedAt: acceptanceStatus === 'ACCEPTED' ? new Date().toISOString() : null,
      createdAt: new Date().toISOString(),
    };
    qaStore.uatSessions.unshift(uat);
    auditQa(actor, req, 'QA_UAT_SUBMIT', uat.uatCode, null, uat);
    return apiOk(res, uat, `UAT session ${uat.uatCode} recorded (${uat.acceptanceStatus}).`, 201);
  });

  router.post('/uat/:uatCode/review', requireAuth, requireAdmin, (req: AuthedRequest, res: Response) => {
    const actor = req.authUser!;
    const uat = qaStore.uatSessions.find((u) => u.uatCode === req.params.uatCode);
    if (!uat) return apiFail(res, 'UAT session not found.', 404);
    const decision = String(req.body.acceptanceStatus || '').toUpperCase();
    if (!['ACCEPTED', 'CHANGES_REQUESTED', 'PENDING'].includes(decision)) {
      return apiFail(res, 'Invalid UAT review decision.', 422);
    }
    const before = { ...uat };
    uat.acceptanceStatus = decision as 'ACCEPTED' | 'CHANGES_REQUESTED' | 'PENDING';
    uat.approvedBy = decision === 'ACCEPTED' ? actor.userId : null;
    uat.approvedAt = decision === 'ACCEPTED' ? new Date().toISOString() : null;
    if (req.body.feedback) uat.feedback = sanitizeText(String(req.body.feedback));
    auditQa(actor, req, 'QA_UAT_REVIEW', uat.uatCode, before, uat);
    return apiOk(res, uat, `UAT ${uat.uatCode} reviewed as ${uat.acceptanceStatus}.`);
  });

  router.post('/attachments', requireAuth, (req: AuthedRequest, res: Response) => {
    const actor = req.authUser!;
    const fileName = String(req.body.fileName || '').trim();
    const entityCode = String(req.body.entityCode || '').trim();
    if (!fileName || !entityCode) {
      return apiFail(res, 'fileName and entityCode are required.', 422);
    }
    const att = qaStore.recordAttachment({
      entityType: req.body.entityType || 'BUG_REPORT',
      entityCode,
      fileName,
      mimeType: String(req.body.mimeType || 'image/png'),
      contentBase64: typeof req.body.contentBase64 === 'string' ? req.body.contentBase64 : undefined,
      uploadedBy: actor.userId,
    });
    return apiOk(res, att, `Evidence attachment ${att.attachmentCode} stored (SHA-256 verified).`, 201);
  });

  router.get('/release/readiness', requireAuth, requireQaViewer, (_req: AuthedRequest, res: Response) => {
    return apiOk(res, qaStore.computeReleaseReadiness());
  });

  router.post('/release/approve', requireAuth, requireAdmin, (req: AuthedRequest, res: Response) => {
    const actor = req.authUser!;
    try {
      const readiness = qaStore.approveRelease({
        actor,
        releaseVersion: String(req.body.releaseVersion || 'v1.9.0-RC1'),
        releaseNotes: String(req.body.releaseNotes || 'Admin Final Release Sign-off'),
        markReleased: Boolean(req.body.markReleased),
      });
      auditQa(actor, req, 'QA_RELEASE_APPROVE', readiness.latestApproval?.releaseCode ?? 'REL', null, readiness);
      return apiOk(res, readiness, `Release ${readiness.releaseStatus} signed off by Admin.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Release approval blocked.';
      auditQa(actor, req, 'QA_RELEASE_APPROVE_BLOCKED', 'RELEASE', null, { error: msg }, 'BLOCKED');
      return apiFail(res, msg, 422);
    }
  });

  // ---------------------------------------------------------------------------
  // 8. QA Reports Export (English & Bengali PDF + 10-Sheet Excel)
  // ---------------------------------------------------------------------------
  router.post('/reports/pdf', requireAuth, requireQaViewer, async (req: AuthedRequest, res: Response) => {
    const actor = req.authUser!;
    const language = req.body?.language === 'bn' ? 'bn' : 'en';
    try {
      const buffer = await generateQaPdfReport(
        qaStore,
        phase03Store.companyProfile,
        actor.userId,
        language
      );
      const filename = `MUN_Phase09_QA_Report_${language.toUpperCase()}_${new Date().toISOString().slice(0, 10)}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', String(buffer.length));
      auditQa(actor, req, 'QA_EXPORT_PDF', filename, null, { language, sizeBytes: buffer.length });
      return res.send(buffer);
    } catch (err) {
      return apiFail(res, err instanceof Error ? err.message : 'PDF export failed.', 500);
    }
  });

  router.post('/reports/excel', requireAuth, requireQaViewer, async (req: AuthedRequest, res: Response) => {
    const actor = req.authUser!;
    const language = req.body?.language === 'bn' ? 'bn' : 'en';
    try {
      const buffer = await generateQaExcelWorkbook(
        qaStore,
        phase03Store.companyProfile,
        actor.userId,
        language
      );
      const filename = `MUN_Phase09_QA_Workbook_${language.toUpperCase()}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', String(buffer.length));
      auditQa(actor, req, 'QA_EXPORT_EXCEL', filename, null, { language, sizeBytes: buffer.length });
      return res.send(buffer);
    } catch (err) {
      return apiFail(res, err instanceof Error ? err.message : 'Excel export failed.', 500);
    }
  });

  app.use('/api/v1/qa', router);
  app.use('/api/qa', router);
}
