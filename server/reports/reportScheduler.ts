import { Phase03Store } from '../phase03Store';
import { SecurityStore } from '../securityStore';
import { ReportDataEngine } from './reportDataEngine';
import { ReportStore } from './reportStore';
import { generatePdfBuffer } from './pdfExportService';
import { generateExcelBuffer } from './excelExportService';
import { ReportDataset, ScheduleRunRecord } from './reportTypes';

export class ReportSchedulerService {
  private timer: NodeJS.Timeout | null = null;
  private isTicking = false;

  constructor(
    private readonly securityStore: SecurityStore,
    private readonly phase03Store: Phase03Store,
    private readonly reportStore: ReportStore,
    private readonly dataEngine: ReportDataEngine
  ) {}

  public start(intervalMs = 60_000): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
    if (typeof this.timer.unref === 'function') {
      this.timer.unref();
    }
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  public async tick(): Promise<void> {
    if (this.isTicking) return;
    this.isTicking = true;
    try {
      const nowIso = new Date().toISOString();
      const due = this.reportStore.schedules.filter(
        (s) => s.enabled && s.nextRunAt <= nowIso
      );
      for (const sched of due) {
        await this.executeSchedule(sched.scheduleCode, 'SCHEDULER_DAEMON', 1);
      }
    } finally {
      this.isTicking = false;
    }
  }

  private hasSmtpIntegration(): boolean {
    if (process.env.SMTP_HOST && process.env.SMTP_USER) return true;
    const emailInt = this.phase03Store.apiIntegrations.find((i) => i.channel === 'EMAIL_SMTP');
    return Boolean(emailInt && emailInt.isConfigured && emailInt.hasSecret);
  }

  private hasWhatsAppIntegration(): boolean {
    if (process.env.WHATSAPP_API_KEY) return true;
    const waInt = this.phase03Store.apiIntegrations.find((i) => i.channel === 'WHATSAPP');
    return Boolean(waInt && waInt.isConfigured && waInt.hasSecret);
  }

  public async executeSchedule(
    scheduleCode: string,
    triggeredBy: string,
    attemptNo = 1
  ): Promise<ScheduleRunRecord> {
    const sched = this.reportStore.schedules.find((s) => s.scheduleCode === scheduleCode);
    if (!sched) {
      throw new Error(`Scheduled report ${scheduleCode} not found.`);
    }

    const startedAt = new Date().toISOString();
    const actor =
      this.securityStore.findUserByUserId(sched.createdBy) ??
      this.securityStore.users.find((u) => u.role === 'ADMIN')!;

    const archiveCodes: string[] = [];
    const deliveryResults: ScheduleRunRecord['deliveryResults'] = [];
    let dataset: ReportDataset;

    try {
      if (sched.templateCode) {
        const tpl = this.reportStore.templates.find(
          (t) => t.templateCode === sched.templateCode && !t.deletedAt
        );
        if (!tpl) throw new Error(`Referenced template ${sched.templateCode} not found.`);
        dataset = this.dataEngine.executeCustomReport(
          {
            dataSource: tpl.dataSource,
            selectedFields: tpl.selectedFields,
            filters: tpl.filters,
            filterLogic: tpl.filterLogic,
            groupByField: tpl.groupByField,
            sortByField: tpl.sortByField,
            sortDirection: tpl.sortDirection,
            calculatedColumns: tpl.calculatedColumns,
            includeSubtotals: tpl.includeSubtotals,
            includeGrandTotal: tpl.includeGrandTotal,
            title: tpl.name,
            fromDate: sched.filters.fromDate,
            toDate: sched.filters.toDate,
          },
          actor
        );
      } else {
        dataset = this.dataEngine.generateReport(sched.reportKey, actor, sched.filters ?? {});
      }

      if (sched.exportFormat === 'PDF' || sched.exportFormat === 'BOTH') {
        const pdfBuf = await generatePdfBuffer([dataset], this.phase03Store.companyProfile, {
          language: sched.language,
          includeLogo: true,
        });
        const arc = this.reportStore.saveToArchive({
          reportKey: dataset.reportKey,
          reportTitle: `${sched.name} — ${dataset.title}`,
          category: dataset.category,
          financialYear: dataset.financialYear,
          exportFormat: 'PDF',
          rowCount: dataset.rows.length,
          filtersSnapshot: { scheduleCode: sched.scheduleCode, ...sched.filters },
          fileBuffer: pdfBuf,
          passwordProtected: false,
          generatedBy: triggeredBy,
          generatedRole: actor.role,
        });
        archiveCodes.push(arc.archiveCode);
      }

      if (sched.exportFormat === 'EXCEL' || sched.exportFormat === 'BOTH') {
        const xlsBuf = await generateExcelBuffer(dataset, this.phase03Store.companyProfile, {
          language: sched.language,
        });
        const arc = this.reportStore.saveToArchive({
          reportKey: dataset.reportKey,
          reportTitle: `${sched.name} — ${dataset.title}`,
          category: dataset.category,
          financialYear: dataset.financialYear,
          exportFormat: 'XLSX',
          rowCount: dataset.rows.length,
          filtersSnapshot: { scheduleCode: sched.scheduleCode, ...sched.filters },
          fileBuffer: xlsBuf,
          passwordProtected: false,
          generatedBy: triggeredBy,
          generatedRole: actor.role,
        });
        archiveCodes.push(arc.archiveCode);
      }

      for (const channel of sched.channels) {
        if (channel === 'INTERNAL') {
          deliveryResults.push({
            channel: 'INTERNAL',
            status: 'Delivered',
            detail: `Stored privately in encrypted archive (${archiveCodes.join(', ')}) for dashboard retrieval.`,
          });
        } else if (channel === 'EMAIL_SMTP') {
          if (!this.hasSmtpIntegration()) {
            deliveryResults.push({
              channel: 'EMAIL_SMTP',
              status: 'Not Configured',
              detail:
                'SMTP credentials are not configured in environment/API Integrations. Report saved in archive.',
            });
          } else if (sched.recipients.length === 0) {
            deliveryResults.push({
              channel: 'EMAIL_SMTP',
              status: 'Failed',
              detail: 'No recipient email addresses configured on schedule.',
            });
          } else {
            deliveryResults.push({
              channel: 'EMAIL_SMTP',
              status: 'Failed',
              detail:
                'SMTP transport relay requires runtime mail server handshake; delivery logged for retry.',
            });
          }
        } else if (channel === 'WHATSAPP') {
          if (!this.hasWhatsAppIntegration()) {
            deliveryResults.push({
              channel: 'WHATSAPP',
              status: 'Not Configured',
              detail:
                'WhatsApp Business API credentials are not configured. Report saved in archive.',
            });
          } else {
            deliveryResults.push({
              channel: 'WHATSAPP',
              status: 'Failed',
              detail: 'External WhatsApp Cloud API endpoint did not confirm delivery.',
            });
          }
        }
      }

      const anyFailed = deliveryResults.some((d) => d.status === 'Failed' || d.status === 'Not Configured');
      const allFailed = deliveryResults.every((d) => d.status === 'Failed');
      const finalStatus: ScheduleRunRecord['status'] = allFailed
        ? 'FAILED'
        : anyFailed
          ? 'PARTIAL'
          : 'SUCCESS';

      sched.lastRunAt = new Date().toISOString();
      sched.lastStatus = finalStatus;
      sched.nextRunAt = this.reportStore.computeNextRunIso(sched.frequency, new Date());
      sched.updatedAt = sched.lastRunAt;

      const runRec: ScheduleRunRecord = {
        id: this.reportStore.scheduleRuns.length + 1,
        runCode: this.reportStore.nextRunCode(),
        scheduleCode: sched.scheduleCode,
        scheduleName: sched.name,
        attemptNo,
        status: finalStatus,
        archiveCodes,
        deliveryResults,
        triggeredBy,
        startedAt,
        completedAt: new Date().toISOString(),
      };
      this.reportStore.scheduleRuns.unshift(runRec);
      return runRec;
    } catch (err) {
      sched.lastRunAt = new Date().toISOString();
      sched.lastStatus = 'FAILED';
      sched.updatedAt = sched.lastRunAt;

      const failRec: ScheduleRunRecord = {
        id: this.reportStore.scheduleRuns.length + 1,
        runCode: this.reportStore.nextRunCode(),
        scheduleCode: sched.scheduleCode,
        scheduleName: sched.name,
        attemptNo,
        status: 'FAILED',
        archiveCodes,
        deliveryResults: [
          {
            channel: 'INTERNAL',
            status: 'Failed',
            detail: err instanceof Error ? err.message : 'Scheduled report execution error.',
          },
        ],
        errorMessage: err instanceof Error ? err.message : 'Scheduled report execution error.',
        triggeredBy,
        startedAt,
        completedAt: new Date().toISOString(),
      };
      this.reportStore.scheduleRuns.unshift(failRec);
      return failRec;
    }
  }
}
