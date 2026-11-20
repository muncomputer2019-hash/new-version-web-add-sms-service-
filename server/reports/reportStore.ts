import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { decryptSensitiveField, encryptSensitiveField, sanitizeText, sha256 } from '../crypto';
import { RoleName } from '../types';
import {
  CustomReportTemplate,
  ReportArchiveRecord,
  ReportAuditLogRecord,
  ReportCategoryKey,
  ReportExportFormat,
  ScheduleRunRecord,
  ScheduledReportRecord,
} from './reportTypes';

export class ReportStore {
  public templates: CustomReportTemplate[] = [];
  public schedules: ScheduledReportRecord[] = [];
  public scheduleRuns: ScheduleRunRecord[] = [];
  public archives: ReportArchiveRecord[] = [];
  public auditLogs: ReportAuditLogRecord[] = [];

  private nextTemplateId = 1;
  private nextScheduleId = 1;
  private nextRunId = 1;
  private nextArchiveId = 1;
  private nextAuditId = 1;
  private readonly archiveDir: string;

  constructor(options?: { archiveDir?: string }) {
    this.archiveDir =
      options?.archiveDir ??
      path.resolve(process.cwd(), 'storage', 'documents', 'report-archives');
    this.seedDefaults();
  }

  private ensureArchiveDir(): void {
    try {
      if (!fs.existsSync(this.archiveDir)) {
        fs.mkdirSync(this.archiveDir, { recursive: true });
      }
    } catch {
      // Non-fatal in read-only environments; encrypted payloads remain accessible in archivePayloadMap
    }
  }

  // Fallback encrypted memory store if filesystem is unavailable
  private encryptedArchiveBlobs = new Map<string, string>();

  private seedDefaults(): void {
    const now = new Date().toISOString();

    this.templates.push(
      {
        id: this.nextTemplateId++,
        templateCode: 'TPL-2026-001',
        name: 'Daily Collection & Method Register',
        description: 'Confirmed payment collections with counter, mode, and customer references.',
        category: 'FINANCIAL',
        dataSource: 'PAYMENTS',
        selectedFields: ['receiptNo', 'applicationNo', 'customerName', 'paymentMethod', 'counterCode', 'amount', 'recordedAt'],
        filters: [{ field: 'verificationStatus', operator: 'eq', value: 'Confirmed' }],
        filterLogic: 'AND',
        groupByField: 'paymentMethod',
        sortByField: 'recordedAt',
        sortDirection: 'desc',
        calculatedColumns: [],
        includeSubtotals: true,
        includeGrandTotal: true,
        roleScope: 'ALL_PERMITTED',
        versionNo: 1,
        createdBy: 'MC2627110001',
        updatedBy: null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: this.nextTemplateId++,
        templateCode: 'TPL-2026-002',
        name: 'Murshidabad Customer Balance & Application Summary',
        description: 'Active customers filtered by village/PIN with computed unpaid due ratio.',
        category: 'CUSTOMER',
        dataSource: 'CUSTOMERS',
        selectedFields: ['customerId', 'fullName', 'village', 'pinCode', 'applicationCount', 'totalPaid', 'pendingBalance'],
        filters: [{ field: 'status', operator: 'eq', value: 'Active' }],
        filterLogic: 'AND',
        groupByField: 'village',
        sortByField: 'pendingBalance',
        sortDirection: 'desc',
        calculatedColumns: [
          {
            key: 'totalBilledEst',
            label: 'Total Billed (₹)',
            expression: '[totalPaid] + [pendingBalance]',
            format: 'currency',
          },
        ],
        includeSubtotals: true,
        includeGrandTotal: true,
        roleScope: 'ALL_PERMITTED',
        versionNo: 1,
        createdBy: 'MC2627110001',
        updatedBy: null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: this.nextTemplateId++,
        templateCode: 'TPL-2026-003',
        name: 'Service Margin & SLA Performance Matrix',
        description: 'Live application service charge vs cost margin and status tracking.',
        category: 'APPLICATION_SERVICE',
        dataSource: 'APPLICATIONS',
        selectedFields: ['applicationNo', 'customerName', 'serviceName', 'assignedStaffId', 'status', 'serviceCharge', 'serviceCost', 'balanceDue'],
        filters: [],
        filterLogic: 'AND',
        groupByField: 'serviceName',
        sortByField: 'createdAt',
        sortDirection: 'desc',
        calculatedColumns: [
          {
            key: 'netMargin',
            label: 'Unit Margin (₹)',
            expression: '[serviceCharge] - [serviceCost]',
            format: 'currency',
          },
        ],
        includeSubtotals: true,
        includeGrandTotal: true,
        roleScope: 'MANAGER',
        versionNo: 1,
        createdBy: 'MC2627110001',
        updatedBy: null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      }
    );

    const nextDaily = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const nextMonthly = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    this.schedules.push(
      {
        id: this.nextScheduleId++,
        scheduleCode: 'SCH-2026-001',
        name: 'Daily Counter Closing & Collection Digest',
        reportKey: 'FIN_DAILY_CASHBOOK',
        frequency: 'DAILY',
        exportFormat: 'PDF',
        language: 'en',
        channels: ['INTERNAL', 'EMAIL_SMTP'],
        recipients: ['MUNCOMPUTER2019@GMAIL.COM'],
        filters: {},
        runTimeIst: '21:00',
        nextRunAt: nextDaily,
        lastRunAt: null,
        lastStatus: 'NEVER_RUN',
        retryLimit: 3,
        enabled: false, // Admin enables explicitly when ready
        createdBy: 'MC2627110001',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: this.nextScheduleId++,
        scheduleCode: 'SCH-2026-002',
        name: 'Monthly Financial & Customer Dues Workbook',
        reportKey: 'FIN_PNL_STATEMENT',
        frequency: 'MONTHLY',
        exportFormat: 'EXCEL',
        language: 'en',
        channels: ['INTERNAL'],
        recipients: ['MC2627110001'],
        filters: {},
        runTimeIst: '22:00',
        nextRunAt: nextMonthly,
        lastRunAt: null,
        lastStatus: 'NEVER_RUN',
        retryLimit: 3,
        enabled: false,
        createdBy: 'MC2627110001',
        createdAt: now,
        updatedAt: now,
      }
    );
  }

  public addAuditLog(
    entry: Omit<ReportAuditLogRecord, 'id' | 'createdAt'>
  ): ReportAuditLogRecord {
    const rec: ReportAuditLogRecord = {
      id: this.nextAuditId++,
      ...entry,
      reportName: sanitizeText(entry.reportName),
      reportCategory: sanitizeText(entry.reportCategory),
      createdAt: new Date().toISOString(),
    };
    this.auditLogs.unshift(rec);
    return rec;
  }

  public nextTemplateCode(): string {
    return `TPL-${new Date().getFullYear()}-${String(this.nextTemplateId++).padStart(3, '0')}`;
  }

  public nextScheduleCode(): string {
    return `SCH-${new Date().getFullYear()}-${String(this.nextScheduleId++).padStart(3, '0')}`;
  }

  public nextRunCode(): string {
    return `RUN-${Date.now().toString().slice(-6)}-${String(this.nextRunId++).padStart(3, '0')}`;
  }

  public saveToArchive(params: {
    reportKey: string;
    reportTitle: string;
    category: ReportCategoryKey;
    financialYear: string;
    exportFormat: ReportExportFormat;
    rowCount: number;
    filtersSnapshot: Record<string, unknown>;
    fileBuffer: Buffer;
    passwordProtected: boolean;
    generatedBy: string;
    generatedRole: RoleName;
    retentionDays?: number;
  }): ReportArchiveRecord {
    const existingVersions = this.archives.filter((a) => a.reportKey === params.reportKey);
    const versionNo =
      existingVersions.length > 0
        ? Math.max(...existingVersions.map((v) => v.versionNo)) + 1
        : 1;

    const archiveCode = `ARC-${params.financialYear.replace('-', '')}-${String(
      this.nextArchiveId
    ).padStart(5, '0')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

    const base64Raw = params.fileBuffer.toString('base64');
    const encryptedBlob = encryptSensitiveField(base64Raw);
    const checksumSha256 = sha256(params.fileBuffer.toString('hex'));
    const storageFileName = `${archiveCode}.enc.bin`;

    this.ensureArchiveDir();
    try {
      if (fs.existsSync(this.archiveDir)) {
        fs.writeFileSync(path.join(this.archiveDir, storageFileName), encryptedBlob, 'utf8');
      }
    } catch {
      // Fall back cleanly to encrypted memory cache
    }
    this.encryptedArchiveBlobs.set(storageFileName, encryptedBlob);

    const retentionDays = params.retentionDays ?? 2920; // 8 years statutory Indian retention
    const retentionUntil = new Date(
      Date.now() + retentionDays * 24 * 60 * 60 * 1000
    )
      .toISOString()
      .slice(0, 10);

    const record: ReportArchiveRecord = {
      id: this.nextArchiveId++,
      archiveCode,
      reportKey: params.reportKey,
      reportTitle: sanitizeText(params.reportTitle),
      category: params.category,
      financialYear: params.financialYear,
      exportFormat: params.exportFormat,
      versionNo,
      rowCount: params.rowCount,
      filtersSnapshot: params.filtersSnapshot,
      checksumSha256,
      storageFileName,
      fileSizeBytes: params.fileBuffer.length,
      passwordProtected: params.passwordProtected,
      retentionDays,
      retentionUntil,
      deletionStatus: 'ACTIVE',
      deletionRequestedBy: null,
      deletionReason: null,
      deletionApprovedBy: null,
      generatedBy: params.generatedBy,
      generatedRole: params.generatedRole,
      createdAt: new Date().toISOString(),
    };

    this.archives.unshift(record);
    return record;
  }

  public readArchivedFileBuffer(archive: ReportArchiveRecord): Buffer {
    let encrypted = this.encryptedArchiveBlobs.get(archive.storageFileName);
    if (!encrypted) {
      const fullPath = path.join(this.archiveDir, archive.storageFileName);
      if (fs.existsSync(fullPath)) {
        encrypted = fs.readFileSync(fullPath, 'utf8');
      }
    }
    if (!encrypted) {
      throw new Error('Encrypted archive payload could not be located in private storage.');
    }
    const base64Raw = decryptSensitiveField(encrypted);
    const buffer = Buffer.from(base64Raw, 'base64');
    const actualChecksum = sha256(buffer.toString('hex'));
    if (actualChecksum !== archive.checksumSha256) {
      throw new Error('Archive SHA-256 integrity verification failed.');
    }
    return buffer;
  }

  public computeNextRunIso(
    frequency: ScheduledReportRecord['frequency'],
    fromDate = new Date()
  ): string {
    const next = new Date(fromDate.getTime());
    switch (frequency) {
      case 'DAILY':
        next.setUTCDate(next.getUTCDate() + 1);
        break;
      case 'WEEKLY':
        next.setUTCDate(next.getUTCDate() + 7);
        break;
      case 'MONTHLY':
        next.setUTCMonth(next.getUTCMonth() + 1);
        break;
      case 'QUARTERLY':
        next.setUTCMonth(next.getUTCMonth() + 3);
        break;
      case 'FINANCIAL_YEAR':
        next.setUTCFullYear(next.getUTCFullYear() + 1);
        break;
    }
    return next.toISOString();
  }
}
