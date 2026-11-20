import { Express, NextFunction, Request, RequestHandler, Response } from 'express';
import { sanitizeText } from '../crypto.js';
import { CscStore } from '../cscStore.js';
import { ErpStore } from '../erpStore.js';
import { FinanceStore } from '../finance/financeStore.js';
import { Phase03Store } from '../phase03Store.js';
import { SecurityStore } from '../securityStore.js';
import { ReportPermissionKey, ServerSession, ServerUser } from '../types.js';
import { generateCsvBuffer, generateExcelBuffer, validateDatasetForExport } from './excelExportService.js';
import { generatePdfBuffer } from './pdfExportService.js';
import {
  REPORT_CATALOG,
  ReportDataEngine,
  formatDateTimeISTServer,
} from './reportDataEngine.js';
import { ReportSchedulerService } from './reportScheduler.js';
import { ReportStore } from './reportStore.js';
import {
  CustomReportExecutionRequest,
  ExcelExportOptions,
  PdfExportOptions,
  ReportDataset,
  ReportFilterInput,
  ScheduledReportRecord,
} from './reportTypes.js';

interface AuthedRequest extends Request {
  authUser?: ServerUser;
  authSession?: ServerSession;
}

function getClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || '127.0.0.1';
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

function filterDatasetRowsBySelection(
  dataset: ReportDataset,
  selectedRowIds?: string[]
): ReportDataset {
  if (!selectedRowIds || selectedRowIds.length === 0) return dataset;
  const set = new Set(selectedRowIds.map(String));
  const firstKey = dataset.columns[0]?.key;
  const filteredRows = dataset.rows.filter((r, idx) => {
    const candidateKeys = [
      firstKey ? String(r[firstKey] ?? '') : '',
      String(r.customerId ?? ''),
      String(r.applicationNo ?? ''),
      String(r.receiptNo ?? ''),
      String(r.voucherNo ?? ''),
      String(r.serviceCode ?? ''),
      String(idx + 1),
    ];
    return candidateKeys.some((k) => k && set.has(k));
  });
  return {
    ...dataset,
    rows: filteredRows,
    subtitle: `${dataset.subtitle} · Selected Rows Only (${filteredRows.length})`,
  };
}

export function registerReportRoutes(
  app: Express,
  securityStore: SecurityStore,
  phase03Store: Phase03Store,
  erpStore: ErpStore,
  financeStore: FinanceStore,
  reportStore: ReportStore,
  scheduler: ReportSchedulerService,
  requireAuth: RequestHandler,
  cscStore?: CscStore
): void {
  const dataEngine = new ReportDataEngine(
    securityStore,
    phase03Store,
    erpStore,
    financeStore,
    reportStore,
    cscStore
  );

  const requireReportPerm =
    (perm: ReportPermissionKey, actionLabel = 'UNAUTHORIZED_ACCESS') =>
    (req: AuthedRequest, res: Response, next: NextFunction) => {
      const actor = req.authUser;
      if (!actor) return fail(res, 'Authentication required.', 401);
      if (!securityStore.hasReportPermission(actor, perm)) {
        reportStore.addAuditLog({
          actorUserId: actor.userId,
          actorRole: actor.role,
          action: 'UNAUTHORIZED_ACCESS',
          reportName: sanitizeText(String(req.body?.reportKey || req.params?.archiveCode || req.path)),
          reportCategory: actionLabel,
          filtersSnapshot: {},
          dateRangeLabel: 'N/A',
          exportFormat: 'BLOCKED',
          status: 'BLOCKED',
          ipAddress: getClientIp(req),
        });
        return fail(res, `Forbidden: missing permission '${perm}'.`, 403);
      }
      return next();
    };

  const assertFinancialReportAllowed = (actor: ServerUser, reportKey: string): string | null => {
    const catalogItem = REPORT_CATALOG.find((c) => c.reportKey === reportKey);
    if (catalogItem?.financialRestricted && actor.role === 'STAFF') {
      return 'Forbidden: STAFF users are restricted from accessing Financial & Balance Sheet reports.';
    }
    return null;
  };

  // Helper to register on both /api/v1/reports/* and /api/reports/* for consistent API compatibility
  const mount = (
    method: 'get' | 'post' | 'put' | 'delete',
    subPath: string,
    ...handlers: Array<RequestHandler | ((req: AuthedRequest, res: Response, next: NextFunction) => unknown)>
  ) => {
    app[method](`/api/v1/reports${subPath}`, ...(handlers as RequestHandler[]));
    app[method](`/api/reports${subPath}`, ...(handlers as RequestHandler[]));
  };

  // ============================================================================
  // 1. REPORTING DASHBOARD & CATALOG
  // ============================================================================
  mount(
    'get',
    '/dashboard',
    requireAuth,
    requireReportPerm('report.view'),
    (req: AuthedRequest, res: Response) => {
      const actor = req.authUser!;
      const filters: ReportFilterInput = {
        fromDate: typeof req.query.fromDate === 'string' ? req.query.fromDate : undefined,
        toDate: typeof req.query.toDate === 'string' ? req.query.toDate : undefined,
        financialYear: typeof req.query.financialYear === 'string' ? req.query.financialYear : undefined,
      };
      const dashboard = dataEngine.getReportingDashboard(actor, filters);
      return ok(res, dashboard, 'Reporting dashboard loaded.');
    }
  );

  mount(
    'get',
    '/catalog',
    requireAuth,
    requireReportPerm('report.view'),
    (req: AuthedRequest, res: Response) => {
      const actor = req.authUser!;
      const items = dataEngine.getCatalogForUser(actor);
      return ok(res, items, 'Report catalog loaded.');
    }
  );

  // ============================================================================
  // 2. STANDARD REPORT GENERATION
  // ============================================================================
  mount(
    'post',
    '/generate',
    requireAuth,
    requireReportPerm('report.view'),
    (req: AuthedRequest, res: Response) => {
      const actor = req.authUser!;
      const reportKey = String(req.body?.reportKey || '').trim();
      if (!reportKey) return fail(res, 'reportKey is required.', 422);

      const restrictedMsg = assertFinancialReportAllowed(actor, reportKey);
      if (restrictedMsg) {
        reportStore.addAuditLog({
          actorUserId: actor.userId,
          actorRole: actor.role,
          action: 'UNAUTHORIZED_ACCESS',
          reportName: reportKey,
          reportCategory: 'FINANCIAL_RESTRICTED',
          filtersSnapshot: (req.body?.filters ?? {}) as Record<string, unknown>,
          dateRangeLabel: 'Blocked',
          exportFormat: 'VIEW',
          status: 'BLOCKED',
          ipAddress: getClientIp(req),
        });
        return fail(res, restrictedMsg, 403);
      }

      const filters = (req.body?.filters ?? {}) as ReportFilterInput;
      try {
        const dataset = dataEngine.generateReport(reportKey, actor, filters);
        reportStore.addAuditLog({
          actorUserId: actor.userId,
          actorRole: actor.role,
          action: 'GENERATE_REPORT',
          reportName: dataset.title,
          reportCategory: dataset.category,
          filtersSnapshot: filters as Record<string, unknown>,
          dateRangeLabel: dataset.dateRangeLabel,
          exportFormat: 'VIEW',
          status: 'SUCCESS',
          ipAddress: getClientIp(req),
        });
        return ok(res, dataset, 'Report generated successfully.');
      } catch (err) {
        return fail(res, err instanceof Error ? err.message : 'Unable to generate report.', 400);
      }
    }
  );

  // ============================================================================
  // 3. BUSINESS ANALYTICS (CHARTS & TRENDS)
  // ============================================================================
  mount(
    'get',
    '/analytics',
    requireAuth,
    requireReportPerm('report.view'),
    (req: AuthedRequest, res: Response) => {
      const actor = req.authUser!;
      if (actor.role === 'STAFF') {
        return fail(res, 'Forbidden: Financial & Executive Analytics require Manager/Admin/Auditor access.', 403);
      }
      const granularity =
        req.query.granularity === 'daily' ||
        req.query.granularity === 'quarterly' ||
        req.query.granularity === 'yearly'
          ? req.query.granularity
          : 'monthly';

      const payload = dataEngine.getAnalyticsDashboard(actor, {
        fromDate: typeof req.query.fromDate === 'string' ? req.query.fromDate : undefined,
        toDate: typeof req.query.toDate === 'string' ? req.query.toDate : undefined,
        granularity,
        category: typeof req.query.category === 'string' ? req.query.category : undefined,
        serviceId: typeof req.query.serviceId === 'string' ? req.query.serviceId : undefined,
        staffId: typeof req.query.staffId === 'string' ? req.query.staffId : undefined,
      });
      return ok(res, payload, 'Business analytics computed.');
    }
  );

  // ============================================================================
  // 4. CUSTOM REPORT BUILDER & SAVED TEMPLATES
  // ============================================================================
  mount(
    'get',
    '/builder/schema',
    requireAuth,
    requireReportPerm('report.view'),
    (_req: AuthedRequest, res: Response) => {
      return ok(res, dataEngine.getBuilderSchemas());
    }
  );

  mount(
    'post',
    '/builder/execute',
    requireAuth,
    requireReportPerm('report.view'),
    (req: AuthedRequest, res: Response) => {
      const actor = req.authUser!;
      const body = req.body as CustomReportExecutionRequest;
      if (!body || !body.dataSource) return fail(res, 'dataSource is required.', 422);
      if (
        actor.role === 'STAFF' &&
        (body.dataSource === 'EXPENSES' ||
          body.dataSource === 'JOURNAL_VOUCHERS' ||
          body.dataSource === 'EMPLOYEES_PAYROLL')
      ) {
        return fail(res, 'Forbidden: STAFF cannot query sensitive financial or payroll data sources.', 403);
      }

      try {
        const dataset = dataEngine.executeCustomReport(body, actor);
        reportStore.addAuditLog({
          actorUserId: actor.userId,
          actorRole: actor.role,
          action: 'GENERATE_REPORT',
          reportName: dataset.title,
          reportCategory: 'CUSTOM',
          filtersSnapshot: { dataSource: body.dataSource, filters: body.filters },
          dateRangeLabel: dataset.dateRangeLabel,
          exportFormat: 'VIEW',
          status: 'SUCCESS',
          ipAddress: getClientIp(req),
        });
        return ok(res, dataset, 'Custom report executed.');
      } catch (err) {
        return fail(res, err instanceof Error ? err.message : 'Invalid custom report specification.', 422);
      }
    }
  );

  mount(
    'get',
    '/templates',
    requireAuth,
    requireReportPerm('report.view'),
    (req: AuthedRequest, res: Response) => {
      const actor = req.authUser!;
      const list = reportStore.templates.filter((t) => {
        if (t.deletedAt) return false;
        if (actor.role === 'STAFF' && t.roleScope !== 'ALL_PERMITTED') return false;
        if (actor.role === 'MANAGER' && t.roleScope === 'ADMIN') return false;
        return true;
      });
      return ok(res, list);
    }
  );

  mount(
    'post',
    '/templates',
    requireAuth,
    requireReportPerm('report.create'),
    (req: AuthedRequest, res: Response) => {
      const actor = req.authUser!;
      const b = req.body ?? {};
      if (!b.name || !b.dataSource || !Array.isArray(b.selectedFields) || b.selectedFields.length === 0) {
        return fail(res, 'name, dataSource, and selectedFields are required.', 422);
      }
      // Validate execution once so invalid formulas / unallowlisted fields cannot be saved
      try {
        dataEngine.executeCustomReport(
          {
            dataSource: b.dataSource,
            selectedFields: b.selectedFields,
            filters: b.filters ?? [],
            filterLogic: b.filterLogic === 'OR' ? 'OR' : 'AND',
            calculatedColumns: b.calculatedColumns ?? [],
          },
          actor
        );
      } catch (err) {
        return fail(res, err instanceof Error ? err.message : 'Invalid template rules.', 422);
      }

      const now = new Date().toISOString();
      const created = {
        id: reportStore.templates.length + 1,
        templateCode: reportStore.nextTemplateCode(),
        name: sanitizeText(String(b.name)),
        description: sanitizeText(String(b.description ?? '')),
        category: b.category || 'CUSTOM',
        dataSource: b.dataSource,
        selectedFields: b.selectedFields,
        filters: b.filters ?? [],
        filterLogic: b.filterLogic === 'OR' ? ('OR' as const) : ('AND' as const),
        groupByField: String(b.groupByField ?? ''),
        sortByField: String(b.sortByField ?? ''),
        sortDirection: b.sortDirection === 'asc' ? ('asc' as const) : ('desc' as const),
        calculatedColumns: b.calculatedColumns ?? [],
        includeSubtotals: b.includeSubtotals !== false,
        includeGrandTotal: b.includeGrandTotal !== false,
        roleScope: b.roleScope || 'ALL_PERMITTED',
        versionNo: 1,
        createdBy: actor.userId,
        updatedBy: null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      reportStore.templates.unshift(created);
      reportStore.addAuditLog({
        actorUserId: actor.userId,
        actorRole: actor.role,
        action: 'TEMPLATE_CREATE',
        reportName: created.name,
        reportCategory: 'CUSTOM_TEMPLATE',
        filtersSnapshot: { templateCode: created.templateCode },
        dateRangeLabel: 'Template',
        exportFormat: 'TEMPLATE',
        status: 'SUCCESS',
        afterState: created,
        ipAddress: getClientIp(req),
      });
      return ok(res, created, `Saved custom report template ${created.templateCode}.`, 201);
    }
  );

  mount(
    'put',
    '/templates/:code',
    requireAuth,
    requireReportPerm('report.update'),
    (req: AuthedRequest, res: Response) => {
      const actor = req.authUser!;
      const tpl = reportStore.templates.find(
        (t) => t.templateCode === req.params.code && !t.deletedAt
      );
      if (!tpl) return fail(res, 'Template not found.', 404);
      const before = { ...tpl };
      const b = req.body ?? {};
      if (b.name) tpl.name = sanitizeText(String(b.name));
      if (b.description !== undefined) tpl.description = sanitizeText(String(b.description));
      if (Array.isArray(b.selectedFields) && b.selectedFields.length > 0) tpl.selectedFields = b.selectedFields;
      if (Array.isArray(b.filters)) tpl.filters = b.filters;
      if (b.filterLogic) tpl.filterLogic = b.filterLogic === 'OR' ? 'OR' : 'AND';
      if (b.groupByField !== undefined) tpl.groupByField = String(b.groupByField);
      if (b.sortByField !== undefined) tpl.sortByField = String(b.sortByField);
      if (b.sortDirection) tpl.sortDirection = b.sortDirection === 'asc' ? 'asc' : 'desc';
      if (Array.isArray(b.calculatedColumns)) tpl.calculatedColumns = b.calculatedColumns;
      if (typeof b.includeSubtotals === 'boolean') tpl.includeSubtotals = b.includeSubtotals;
      if (typeof b.includeGrandTotal === 'boolean') tpl.includeGrandTotal = b.includeGrandTotal;
      tpl.versionNo += 1;
      tpl.updatedBy = actor.userId;
      tpl.updatedAt = new Date().toISOString();

      reportStore.addAuditLog({
        actorUserId: actor.userId,
        actorRole: actor.role,
        action: 'TEMPLATE_UPDATE',
        reportName: tpl.name,
        reportCategory: 'CUSTOM_TEMPLATE',
        filtersSnapshot: { templateCode: tpl.templateCode },
        dateRangeLabel: 'Template',
        exportFormat: 'TEMPLATE',
        status: 'SUCCESS',
        beforeState: before,
        afterState: { ...tpl },
        ipAddress: getClientIp(req),
      });
      return ok(res, tpl, `Updated template ${tpl.templateCode}.`);
    }
  );

  mount(
    'post',
    '/templates/:code/duplicate',
    requireAuth,
    requireReportPerm('report.create'),
    (req: AuthedRequest, res: Response) => {
      const actor = req.authUser!;
      const source = reportStore.templates.find(
        (t) => t.templateCode === req.params.code && !t.deletedAt
      );
      if (!source) return fail(res, 'Template not found.', 404);
      const now = new Date().toISOString();
      const copy = {
        ...JSON.parse(JSON.stringify(source)),
        id: reportStore.templates.length + 1,
        templateCode: reportStore.nextTemplateCode(),
        name: `${source.name} (Copy)`,
        versionNo: 1,
        createdBy: actor.userId,
        updatedBy: null,
        createdAt: now,
        updatedAt: now,
      };
      reportStore.templates.unshift(copy);
      reportStore.addAuditLog({
        actorUserId: actor.userId,
        actorRole: actor.role,
        action: 'TEMPLATE_DUPLICATE',
        reportName: copy.name,
        reportCategory: 'CUSTOM_TEMPLATE',
        filtersSnapshot: { sourceCode: source.templateCode, newCode: copy.templateCode },
        dateRangeLabel: 'Template',
        exportFormat: 'TEMPLATE',
        status: 'SUCCESS',
        afterState: copy,
        ipAddress: getClientIp(req),
      });
      return ok(res, copy, `Duplicated as ${copy.templateCode}.`, 201);
    }
  );

  mount(
    'delete',
    '/templates/:code',
    requireAuth,
    requireReportPerm('report.delete'),
    (req: AuthedRequest, res: Response) => {
      const actor = req.authUser!;
      const tpl = reportStore.templates.find(
        (t) => t.templateCode === req.params.code && !t.deletedAt
      );
      if (!tpl) return fail(res, 'Template not found.', 404);
      const before = { ...tpl };
      tpl.deletedAt = new Date().toISOString();
      tpl.updatedBy = actor.userId;

      reportStore.addAuditLog({
        actorUserId: actor.userId,
        actorRole: actor.role,
        action: 'TEMPLATE_DELETE',
        reportName: tpl.name,
        reportCategory: 'CUSTOM_TEMPLATE',
        filtersSnapshot: { templateCode: tpl.templateCode },
        dateRangeLabel: 'Template',
        exportFormat: 'TEMPLATE',
        status: 'SUCCESS',
        beforeState: before,
        afterState: { deletedAt: tpl.deletedAt },
        ipAddress: getClientIp(req),
      });
      return ok(res, { deleted: true, templateCode: tpl.templateCode }, 'Template soft-deleted.');
    }
  );

  // ============================================================================
  // 5. PDF EXPORT (SINGLE, COMBINED, A4/A5/CUSTOM, BENGALI, PASSWORD, ARCHIVE)
  // ============================================================================
  mount(
    'post',
    '/export/pdf',
    requireAuth,
    requireReportPerm('report.export.pdf'),
    async (req: AuthedRequest, res: Response) => {
      const actor = req.authUser!;
      const opts = (req.body ?? {}) as PdfExportOptions;

      try {
        const datasets: ReportDataset[] = [];
        if (opts.customExecution) {
          if (
            actor.role === 'STAFF' &&
            (opts.customExecution.dataSource === 'EXPENSES' ||
              opts.customExecution.dataSource === 'JOURNAL_VOUCHERS' ||
              opts.customExecution.dataSource === 'EMPLOYEES_PAYROLL')
          ) {
            return fail(res, 'Forbidden: STAFF cannot export sensitive financial data.', 403);
          }
          let ds = dataEngine.executeCustomReport(opts.customExecution, actor);
          ds = filterDatasetRowsBySelection(ds, opts.selectedRowIds);
          datasets.push(ds);
        } else {
          const keys =
            Array.isArray(opts.reportKeys) && opts.reportKeys.length > 0
              ? opts.reportKeys
              : opts.reportKey
                ? [opts.reportKey]
                : [];
          if (keys.length === 0) {
            return fail(res, 'reportKey, reportKeys, or customExecution is required.', 422);
          }
          for (const k of keys) {
            const restricted = assertFinancialReportAllowed(actor, k);
            if (restricted) return fail(res, restricted, 403);
            let ds = dataEngine.generateReport(k, actor, opts.filters ?? {});
            if (keys.length === 1) {
              ds = filterDatasetRowsBySelection(ds, opts.selectedRowIds);
            }
            datasets.push(ds);
          }
        }

        const pdfBuffer = await generatePdfBuffer(datasets, phase03Store.companyProfile, opts);
        const primary = datasets[0];
        const isCombined = datasets.length > 1;
        const reportTitle = isCombined
          ? `Combined Business Report (${datasets.length} Sections)`
          : primary.title;

        let archiveCode: string | null = null;
        if (opts.saveToArchive !== false) {
          const archived = reportStore.saveToArchive({
            reportKey: isCombined ? 'COMBINED_BUNDLE' : primary.reportKey,
            reportTitle,
            category: primary.category,
            financialYear: primary.financialYear,
            exportFormat: 'PDF',
            rowCount: datasets.reduce((s, d) => s + d.rows.length, 0),
            filtersSnapshot: (opts.filters ?? {}) as Record<string, unknown>,
            fileBuffer: pdfBuffer,
            passwordProtected: Boolean(opts.password && opts.password.trim()),
            generatedBy: actor.userId,
            generatedRole: actor.role,
          });
          archiveCode = archived.archiveCode;
        }

        reportStore.addAuditLog({
          actorUserId: actor.userId,
          actorRole: actor.role,
          action: isCombined ? 'EXPORT_COMBINED_PDF' : 'EXPORT_PDF',
          reportName: reportTitle,
          reportCategory: primary.category,
          filtersSnapshot: {
            reportKeys: datasets.map((d) => d.reportKey),
            passwordProtected: Boolean(opts.password),
            pageSize: opts.pageSize || 'A4',
            orientation: opts.orientation || 'portrait',
            archiveCode,
          },
          dateRangeLabel: primary.dateRangeLabel,
          exportFormat: 'PDF',
          status: 'SUCCESS',
          ipAddress: getClientIp(req),
        });

        const safeFileName = `${(isCombined ? 'MUN_COMBINED_REPORT' : primary.reportKey).replace(
          /[^A-Za-z0-9_-]/g,
          '_'
        )}_${primary.financialYear}.pdf`;

        if (archiveCode) res.setHeader('X-Archive-Code', archiveCode);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
        return res.status(200).send(pdfBuffer);
      } catch (err) {
        return fail(res, err instanceof Error ? err.message : 'PDF export failed.', 400);
      }
    }
  );

  // ============================================================================
  // 6. EXCEL (.XLSX) & CSV EXPORT
  // ============================================================================
  mount(
    'post',
    '/export/excel',
    requireAuth,
    requireReportPerm('report.export.excel'),
    async (req: AuthedRequest, res: Response) => {
      const actor = req.authUser!;
      const opts = (req.body ?? {}) as ExcelExportOptions;
      const format = opts.format === 'csv' ? 'csv' : 'xlsx';

      try {
        let dataset: ReportDataset;
        if (opts.customExecution) {
          if (
            actor.role === 'STAFF' &&
            (opts.customExecution.dataSource === 'EXPENSES' ||
              opts.customExecution.dataSource === 'JOURNAL_VOUCHERS' ||
              opts.customExecution.dataSource === 'EMPLOYEES_PAYROLL')
          ) {
            return fail(res, 'Forbidden: STAFF cannot export sensitive financial data.', 403);
          }
          dataset = dataEngine.executeCustomReport(opts.customExecution, actor);
        } else {
          if (!opts.reportKey) return fail(res, 'reportKey or customExecution is required.', 422);
          const restricted = assertFinancialReportAllowed(actor, opts.reportKey);
          if (restricted) return fail(res, restricted, 403);
          dataset = dataEngine.generateReport(opts.reportKey, actor, opts.filters ?? {});
        }

        dataset = filterDatasetRowsBySelection(dataset, opts.selectedRowIds);
        validateDatasetForExport(dataset);

        const buffer =
          format === 'csv'
            ? generateCsvBuffer(dataset, opts.language ?? 'en')
            : await generateExcelBuffer(dataset, phase03Store.companyProfile, opts);

        let archiveCode: string | null = null;
        if (opts.saveToArchive !== false) {
          const archived = reportStore.saveToArchive({
            reportKey: dataset.reportKey,
            reportTitle: dataset.title,
            category: dataset.category,
            financialYear: dataset.financialYear,
            exportFormat: format === 'csv' ? 'CSV' : 'XLSX',
            rowCount: dataset.rows.length,
            filtersSnapshot: (opts.filters ?? {}) as Record<string, unknown>,
            fileBuffer: buffer,
            passwordProtected: false,
            generatedBy: actor.userId,
            generatedRole: actor.role,
          });
          archiveCode = archived.archiveCode;
        }

        reportStore.addAuditLog({
          actorUserId: actor.userId,
          actorRole: actor.role,
          action: format === 'csv' ? 'EXPORT_CSV' : 'EXPORT_EXCEL',
          reportName: dataset.title,
          reportCategory: dataset.category,
          filtersSnapshot: { ...(opts.filters ?? {}), archiveCode },
          dateRangeLabel: dataset.dateRangeLabel,
          exportFormat: format.toUpperCase(),
          status: 'SUCCESS',
          ipAddress: getClientIp(req),
        });

        const safeFileName = `${dataset.reportKey.replace(/[^A-Za-z0-9_-]/g, '_')}_${
          dataset.financialYear
        }.${format}`;
        if (archiveCode) res.setHeader('X-Archive-Code', archiveCode);
        res.setHeader(
          'Content-Type',
          format === 'csv'
            ? 'text/csv; charset=utf-8'
            : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
        return res.status(200).send(buffer);
      } catch (err) {
        return fail(res, err instanceof Error ? err.message : 'Excel/CSV export failed.', 400);
      }
    }
  );

  // ============================================================================
  // 7. PRINT AUDIT ENDPOINT (VALIDATES PERMISSION BEFORE BROWSER PRINT)
  // ============================================================================
  mount(
    'post',
    '/print-log',
    requireAuth,
    requireReportPerm('report.print'),
    (req: AuthedRequest, res: Response) => {
      const actor = req.authUser!;
      const reportKey = String(req.body?.reportKey || 'CUSTOM_REPORT');
      const reportName = sanitizeText(String(req.body?.reportName || reportKey));
      const restricted = assertFinancialReportAllowed(actor, reportKey);
      if (restricted) return fail(res, restricted, 403);

      const log = reportStore.addAuditLog({
        actorUserId: actor.userId,
        actorRole: actor.role,
        action: 'PRINT_REPORT',
        reportName,
        reportCategory: String(req.body?.reportCategory || 'REPORT'),
        filtersSnapshot: {
          pageSize: req.body?.pageSize || 'A4',
          orientation: req.body?.orientation || 'portrait',
          copies: Number(req.body?.copies) || 1,
          scope: req.body?.scope || 'ALL_PERMITTED',
          printedAtIst: formatDateTimeISTServer(new Date()),
        },
        dateRangeLabel: String(req.body?.dateRangeLabel || 'Current'),
        exportFormat: 'PRINT',
        status: 'SUCCESS',
        ipAddress: getClientIp(req),
      });
      return ok(res, log, 'Print authorized and audit logged.');
    }
  );

  // ============================================================================
  // 8. AUTOMATED SCHEDULED REPORTS & RETRY
  // ============================================================================
  mount(
    'get',
    '/schedules',
    requireAuth,
    requireReportPerm('report.view'),
    (_req: AuthedRequest, res: Response) => {
      return ok(res, {
        schedules: reportStore.schedules,
        runs: reportStore.scheduleRuns,
      });
    }
  );

  mount(
    'post',
    '/schedules',
    requireAuth,
    requireReportPerm('report.schedule'),
    (req: AuthedRequest, res: Response) => {
      const actor = req.authUser!;
      const b = req.body ?? {};
      if (!b.name || (!b.reportKey && !b.templateCode)) {
        return fail(res, 'name and reportKey/templateCode are required.', 422);
      }
      const now = new Date().toISOString();
      const freq: ScheduledReportRecord['frequency'] = b.frequency || 'DAILY';
      const created: ScheduledReportRecord = {
        id: reportStore.schedules.length + 1,
        scheduleCode: reportStore.nextScheduleCode(),
        name: sanitizeText(String(b.name)),
        reportKey: String(b.reportKey || ''),
        templateCode: b.templateCode ? String(b.templateCode) : undefined,
        frequency: freq,
        exportFormat: b.exportFormat || 'PDF',
        language: b.language === 'bn' ? 'bn' : 'en',
        channels: Array.isArray(b.channels) && b.channels.length > 0 ? b.channels : ['INTERNAL'],
        recipients: Array.isArray(b.recipients) ? b.recipients.map(String) : [],
        filters: (b.filters ?? {}) as ReportFilterInput,
        runTimeIst: String(b.runTimeIst || '21:00'),
        nextRunAt: reportStore.computeNextRunIso(freq),
        lastRunAt: null,
        lastStatus: 'NEVER_RUN',
        retryLimit: Math.min(Math.max(Number(b.retryLimit) || 3, 1), 10),
        enabled: b.enabled !== false,
        createdBy: actor.userId,
        createdAt: now,
        updatedAt: now,
      };
      reportStore.schedules.unshift(created);
      reportStore.addAuditLog({
        actorUserId: actor.userId,
        actorRole: actor.role,
        action: 'SCHEDULE_CREATE',
        reportName: created.name,
        reportCategory: 'SCHEDULER',
        filtersSnapshot: { scheduleCode: created.scheduleCode, frequency: created.frequency },
        dateRangeLabel: created.frequency,
        exportFormat: created.exportFormat,
        status: 'SUCCESS',
        afterState: created,
        ipAddress: getClientIp(req),
      });
      return ok(res, created, `Created scheduled report ${created.scheduleCode}.`, 201);
    }
  );

  mount(
    'put',
    '/schedules/:code',
    requireAuth,
    requireReportPerm('report.schedule'),
    (req: AuthedRequest, res: Response) => {
      const actor = req.authUser!;
      const sched = reportStore.schedules.find((s) => s.scheduleCode === req.params.code);
      if (!sched) return fail(res, 'Schedule not found.', 404);
      const before = { ...sched };
      const b = req.body ?? {};
      if (typeof b.enabled === 'boolean') sched.enabled = b.enabled;
      if (b.name) sched.name = sanitizeText(String(b.name));
      if (b.frequency) {
        sched.frequency = b.frequency;
        sched.nextRunAt = reportStore.computeNextRunIso(sched.frequency);
      }
      if (b.exportFormat) sched.exportFormat = b.exportFormat;
      if (Array.isArray(b.channels)) sched.channels = b.channels;
      if (Array.isArray(b.recipients)) sched.recipients = b.recipients.map(String);
      if (b.runTimeIst) sched.runTimeIst = String(b.runTimeIst);
      sched.updatedAt = new Date().toISOString();

      reportStore.addAuditLog({
        actorUserId: actor.userId,
        actorRole: actor.role,
        action: 'SCHEDULE_UPDATE',
        reportName: sched.name,
        reportCategory: 'SCHEDULER',
        filtersSnapshot: { scheduleCode: sched.scheduleCode },
        dateRangeLabel: sched.frequency,
        exportFormat: sched.exportFormat,
        status: 'SUCCESS',
        beforeState: before,
        afterState: { ...sched },
        ipAddress: getClientIp(req),
      });
      return ok(res, sched, `Updated schedule ${sched.scheduleCode}.`);
    }
  );

  mount(
    'post',
    '/schedules/:code/run',
    requireAuth,
    requireReportPerm('report.schedule'),
    async (req: AuthedRequest, res: Response) => {
      const actor = req.authUser!;
      try {
        const run = await scheduler.executeSchedule(req.params.code, actor.userId, 1);
        reportStore.addAuditLog({
          actorUserId: actor.userId,
          actorRole: actor.role,
          action: 'SCHEDULE_RUN',
          reportName: run.scheduleName,
          reportCategory: 'SCHEDULER',
          filtersSnapshot: { scheduleCode: run.scheduleCode, runCode: run.runCode },
          dateRangeLabel: 'Manual Trigger',
          exportFormat: 'SCHEDULE',
          status: run.status === 'FAILED' ? 'FAILURE' : 'SUCCESS',
          afterState: run,
          ipAddress: getClientIp(req),
        });
        return ok(res, run, `Schedule executed (${run.status}).`);
      } catch (err) {
        return fail(res, err instanceof Error ? err.message : 'Schedule run failed.', 404);
      }
    }
  );

  mount(
    'post',
    '/schedule-runs/:runCode/retry',
    requireAuth,
    requireReportPerm('report.schedule'),
    async (req: AuthedRequest, res: Response) => {
      const actor = req.authUser!;
      const prevRun = reportStore.scheduleRuns.find((r) => r.runCode === req.params.runCode);
      if (!prevRun) return fail(res, 'Schedule run record not found.', 404);
      const sched = reportStore.schedules.find((s) => s.scheduleCode === prevRun.scheduleCode);
      if (!sched) return fail(res, 'Parent schedule not found.', 404);
      if (prevRun.attemptNo >= sched.retryLimit) {
        return fail(res, `Maximum retry limit (${sched.retryLimit}) reached for this schedule run.`, 400);
      }
      const nextRun = await scheduler.executeSchedule(
        sched.scheduleCode,
        actor.userId,
        prevRun.attemptNo + 1
      );
      reportStore.addAuditLog({
        actorUserId: actor.userId,
        actorRole: actor.role,
        action: 'SCHEDULE_RETRY',
        reportName: nextRun.scheduleName,
        reportCategory: 'SCHEDULER',
        filtersSnapshot: { prevRunCode: prevRun.runCode, newRunCode: nextRun.runCode },
        dateRangeLabel: `Attempt #${nextRun.attemptNo}`,
        exportFormat: 'SCHEDULE',
        status: nextRun.status === 'FAILED' ? 'FAILURE' : 'SUCCESS',
        afterState: nextRun,
        ipAddress: getClientIp(req),
      });
      return ok(res, nextRun, `Retry executed (${nextRun.status}).`);
    }
  );

  // ============================================================================
  // 9. REPORT ARCHIVE, VERSION HISTORY, RETENTION & ADMIN DELETE APPROVAL
  // ============================================================================
  mount(
    'get',
    '/archives',
    requireAuth,
    requireReportPerm('report.archive.view'),
    (req: AuthedRequest, res: Response) => {
      const actor = req.authUser!;
      const q = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
      const fy = typeof req.query.financialYear === 'string' ? req.query.financialYear : '';
      const category = typeof req.query.category === 'string' ? req.query.category : '';

      const filtered = reportStore.archives.filter((a) => {
        if (a.deletionStatus === 'DELETED') return false;
        if (actor.role === 'STAFF' && a.generatedBy !== actor.userId) return false;
        if (fy && fy !== 'ALL' && a.financialYear !== fy) return false;
        if (category && category !== 'ALL' && a.category !== category) return false;
        if (
          q &&
          !a.archiveCode.toLowerCase().includes(q) &&
          !a.reportTitle.toLowerCase().includes(q) &&
          !a.reportKey.toLowerCase().includes(q)
        ) {
          return false;
        }
        return true;
      });
      return ok(res, filtered);
    }
  );

  mount(
    'get',
    '/archives/:archiveCode/download',
    requireAuth,
    requireReportPerm('report.archive.view'),
    (req: AuthedRequest, res: Response) => {
      const actor = req.authUser!;
      const arc = reportStore.archives.find(
        (a) => a.archiveCode === req.params.archiveCode && a.deletionStatus !== 'DELETED'
      );
      if (!arc) return fail(res, 'Archived report not found.', 404);
      if (actor.role === 'STAFF' && arc.generatedBy !== actor.userId) {
        return fail(res, 'Forbidden: STAFF can only download archives they generated.', 403);
      }

      try {
        const buffer = reportStore.readArchivedFileBuffer(arc);
        reportStore.addAuditLog({
          actorUserId: actor.userId,
          actorRole: actor.role,
          action: 'ARCHIVE_DOWNLOAD',
          reportName: arc.reportTitle,
          reportCategory: arc.category,
          filtersSnapshot: { archiveCode: arc.archiveCode, versionNo: arc.versionNo },
          dateRangeLabel: arc.financialYear,
          exportFormat: arc.exportFormat,
          status: 'SUCCESS',
          ipAddress: getClientIp(req),
        });

        const ext = arc.exportFormat === 'PDF' ? 'pdf' : arc.exportFormat === 'CSV' ? 'csv' : 'xlsx';
        const mime =
          arc.exportFormat === 'PDF'
            ? 'application/pdf'
            : arc.exportFormat === 'CSV'
              ? 'text/csv; charset=utf-8'
              : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        res.setHeader('Content-Type', mime);
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${arc.archiveCode}_v${arc.versionNo}.${ext}"`
        );
        return res.status(200).send(buffer);
      } catch (err) {
        return fail(res, err instanceof Error ? err.message : 'Unable to decrypt archive file.', 500);
      }
    }
  );

  mount(
    'post',
    '/archives/:archiveCode/reprint',
    requireAuth,
    requireReportPerm('report.archive.view'),
    requireReportPerm('report.print'),
    (req: AuthedRequest, res: Response) => {
      const actor = req.authUser!;
      const arc = reportStore.archives.find(
        (a) => a.archiveCode === req.params.archiveCode && a.deletionStatus !== 'DELETED'
      );
      if (!arc) return fail(res, 'Archived report not found.', 404);
      if (actor.role === 'STAFF' && arc.generatedBy !== actor.userId) {
        return fail(res, 'Forbidden: STAFF can only reprint own archives.', 403);
      }
      const log = reportStore.addAuditLog({
        actorUserId: actor.userId,
        actorRole: actor.role,
        action: 'ARCHIVE_REPRINT',
        reportName: arc.reportTitle,
        reportCategory: arc.category,
        filtersSnapshot: { archiveCode: arc.archiveCode, versionNo: arc.versionNo },
        dateRangeLabel: arc.financialYear,
        exportFormat: arc.exportFormat,
        status: 'SUCCESS',
        ipAddress: getClientIp(req),
      });
      return ok(res, log, `Authorized reprint of ${arc.archiveCode} v${arc.versionNo}.`);
    }
  );

  mount(
    'post',
    '/archives/:archiveCode/delete-request',
    requireAuth,
    (req: AuthedRequest, res: Response) => {
      const actor = req.authUser!;
      if (actor.role !== 'MANAGER' && !securityStore.hasReportPermission(actor, 'report.delete')) {
        reportStore.addAuditLog({
          actorUserId: actor.userId,
          actorRole: actor.role,
          action: 'UNAUTHORIZED_ACCESS',
          reportName: req.params.archiveCode,
          reportCategory: 'ARCHIVE_DELETE_REQUEST',
          filtersSnapshot: {},
          dateRangeLabel: 'Blocked',
          exportFormat: 'ARCHIVE',
          status: 'BLOCKED',
          ipAddress: getClientIp(req),
        });
        return fail(res, 'Forbidden: Missing permission report.delete', 403);
      }
      const arc = reportStore.archives.find(
        (a) => a.archiveCode === req.params.archiveCode && a.deletionStatus !== 'DELETED'
      );
      if (!arc) return fail(res, 'Archived report not found.', 404);
      const reason = sanitizeText(String(req.body?.reason || '')).trim();
      if (reason.length < 5) return fail(res, 'Deletion reason (min 5 chars) is required.', 422);

      const before = { ...arc };
      arc.deletionStatus = 'PENDING_ADMIN_APPROVAL';
      arc.deletionRequestedBy = actor.userId;
      arc.deletionReason = reason;

      reportStore.addAuditLog({
        actorUserId: actor.userId,
        actorRole: actor.role,
        action: 'ARCHIVE_DELETE_REQUEST',
        reportName: arc.reportTitle,
        reportCategory: arc.category,
        filtersSnapshot: { archiveCode: arc.archiveCode, reason },
        dateRangeLabel: arc.financialYear,
        exportFormat: arc.exportFormat,
        status: 'SUCCESS',
        beforeState: before,
        afterState: { ...arc },
        ipAddress: getClientIp(req),
      });
      return ok(res, arc, 'Deletion request submitted for Admin approval.');
    }
  );

  mount(
    'post',
    '/archives/:archiveCode/delete-review',
    requireAuth,
    (req: AuthedRequest, res: Response) => {
      const actor = req.authUser!;
      if (actor.role !== 'ADMIN') {
        reportStore.addAuditLog({
          actorUserId: actor.userId,
          actorRole: actor.role,
          action: 'UNAUTHORIZED_ACCESS',
          reportName: req.params.archiveCode,
          reportCategory: 'ARCHIVE_DELETE_APPROVAL',
          filtersSnapshot: {},
          dateRangeLabel: 'N/A',
          exportFormat: 'ARCHIVE',
          status: 'BLOCKED',
          ipAddress: getClientIp(req),
        });
        return fail(res, 'Forbidden: Only ADMIN can approve or reject archive deletion.', 403);
      }

      const arc = reportStore.archives.find((a) => a.archiveCode === req.params.archiveCode);
      if (!arc) return fail(res, 'Archived report not found.', 404);
      const decision = String(req.body?.decision || '').toUpperCase();
      if (decision !== 'APPROVE' && decision !== 'REJECT') {
        return fail(res, 'decision must be APPROVE or REJECT.', 422);
      }

      const before = { ...arc };
      if (decision === 'APPROVE') {
        arc.deletionStatus = 'DELETED';
        arc.deletionApprovedBy = actor.userId;
      } else {
        arc.deletionStatus = 'ACTIVE';
        arc.deletionApprovedBy = null;
      }

      reportStore.addAuditLog({
        actorUserId: actor.userId,
        actorRole: actor.role,
        action: decision === 'APPROVE' ? 'ARCHIVE_DELETE_APPROVE' : 'ARCHIVE_DELETE_REJECT',
        reportName: arc.reportTitle,
        reportCategory: arc.category,
        filtersSnapshot: { archiveCode: arc.archiveCode, decision },
        dateRangeLabel: arc.financialYear,
        exportFormat: arc.exportFormat,
        status: 'SUCCESS',
        beforeState: before,
        afterState: { ...arc },
        ipAddress: getClientIp(req),
      });
      return ok(res, arc, `Archive deletion ${decision === 'APPROVE' ? 'approved' : 'rejected'}.`);
    }
  );

  // ============================================================================
  // 10. IMMUTABLE REPORT AUDIT LOGS
  // ============================================================================
  mount(
    'get',
    '/audit-logs',
    requireAuth,
    requireReportPerm('report.audit.view'),
    (req: AuthedRequest, res: Response) => {
      const action = typeof req.query.action === 'string' ? req.query.action : '';
      const q = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
      const list = reportStore.auditLogs.filter((l) => {
        if (action && action !== 'ALL' && l.action !== action) return false;
        if (
          q &&
          !l.reportName.toLowerCase().includes(q) &&
          !l.actorUserId.toLowerCase().includes(q) &&
          !l.action.toLowerCase().includes(q)
        ) {
          return false;
        }
        return true;
      });
      return ok(res, list);
    }
  );

  // ============================================================================
  // 11. CSC DIGITAL SERVICE 25 REPORTS (PART 14)
  // ============================================================================
  app.get('/api/csc/reports/catalog', requireAuth, (req: AuthedRequest, res: Response) => {
    const actor = req.authUser!;
    if (actor.role === 'CUSTOMER') {
      return fail(res, 'Forbidden: internal reports are not accessible to customers.', 403);
    }
    const eff = securityStore.getEffectivePermissions(actor);
    if (!securityStore.hasReportPermission(actor, 'report.view') && !eff['csc.reportView']) {
      return fail(res, 'Forbidden: missing report view permission.', 403);
    }
    const items = dataEngine.getCatalogForUser(actor).filter((i) => i.category === 'CSC_OPERATIONS');
    return ok(res, items, 'CSC 25 reports catalog loaded.');
  });

  app.post('/api/csc/reports/generate', requireAuth, (req: AuthedRequest, res: Response) => {
    const actor = req.authUser!;
    if (actor.role === 'CUSTOMER') {
      return fail(res, 'Forbidden: internal reports are not accessible to customers.', 403);
    }
    const eff = securityStore.getEffectivePermissions(actor);
    if (!securityStore.hasReportPermission(actor, 'report.view') && !eff['csc.reportView']) {
      return fail(res, 'Forbidden: missing report view permission.', 403);
    }
    const reportKey = String(req.body?.reportKey || '').trim();
    if (!reportKey.startsWith('CSC_RPT_')) {
      return fail(res, 'Invalid CSC reportKey.', 422);
    }
    const filters = (req.body?.filters ?? {}) as ReportFilterInput;
    try {
      const dataset = dataEngine.generateReport(reportKey, actor, filters);
      reportStore.addAuditLog({
        actorUserId: actor.userId,
        actorRole: actor.role,
        action: 'GENERATE_REPORT',
        reportName: dataset.title,
        reportCategory: dataset.category,
        filtersSnapshot: filters as Record<string, unknown>,
        dateRangeLabel: dataset.dateRangeLabel,
        exportFormat: 'VIEW',
        status: 'SUCCESS',
        ipAddress: getClientIp(req),
      });
      return ok(res, dataset, 'CSC report generated successfully.');
    } catch (err) {
      return fail(res, err instanceof Error ? err.message : 'Unable to generate CSC report.', 400);
    }
  });
}
