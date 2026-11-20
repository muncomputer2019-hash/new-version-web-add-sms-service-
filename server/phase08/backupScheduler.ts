import { Phase08Store } from './phase08Store';
import { BackupScheduleFrequency } from './phase08Types';

export class BackupSchedulerService {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly p8: Phase08Store) {}

  public start(intervalMs = 120_000): void {
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
    const now = Date.now();
    for (const sched of this.p8.backupSchedules) {
      if (!sched.enabled) continue;
      if (Date.parse(sched.nextRunAt) <= now) {
        await this.executeSchedule(sched.scheduleCode, 'SYSTEM_BACKUP_SCHEDULER');
      }
    }
  }

  public async executeSchedule(
    scheduleCode: string,
    actorUserId: string,
    options?: { simulateCloudFailure?: boolean }
  ) {
    const sched = this.p8.backupSchedules.find((s) => s.scheduleCode === scheduleCode);
    if (!sched) throw new Error('Backup schedule not found.');

    const freqMap: Record<typeof sched.frequency, BackupScheduleFrequency> = {
      DAILY: 'DAILY',
      WEEKLY: 'WEEKLY',
      MONTHLY: 'MONTHLY',
      FINANCIAL_YEAR: 'FINANCIAL_YEAR',
    };

    try {
      const backup = await this.p8.createFullBackupSnapshot({
        frequency: freqMap[sched.frequency],
        triggeredBy: actorUserId,
        simulateCloudFailure: options?.simulateCloudFailure,
      });

      sched.lastRunAt = backup.completedAt;
      sched.lastStatus = backup.status === 'RESTORED' ? 'SUCCESS' : backup.status;
      sched.retryCount = backup.status === 'SUCCESS' ? 0 : sched.retryCount + 1;

      const nextOffsetMs =
        sched.frequency === 'DAILY'
          ? 24 * 60 * 60_000
          : sched.frequency === 'WEEKLY'
            ? 7 * 24 * 60 * 60_000
            : sched.frequency === 'MONTHLY'
              ? 30 * 24 * 60 * 60_000
              : 365 * 24 * 60 * 60_000;
      sched.nextRunAt = new Date(Date.now() + nextOffsetMs).toISOString();

      this.p8.recordBeforeAfterAudit({
        userId: actorUserId,
        userRole: actorUserId === 'SYSTEM_BACKUP_SCHEDULER' ? 'SYSTEM' : 'ADMIN',
        actionType: `BACKUP_SCHEDULE_${sched.frequency}`,
        module: 'backup_schedules',
        recordId: backup.backupCode,
        beforeValues: null,
        afterValues: {
          scheduleCode: sched.scheduleCode,
          backupCode: backup.backupCode,
          status: backup.status,
          checksumSha256: backup.checksumSha256,
        },
        ipAddress: '127.0.0.1',
        deviceInfo: 'Server Backup Scheduler',
        actionResult: backup.status === 'FAILED' ? 'FAILURE' : 'SUCCESS',
      });

      return backup;
    } catch (err) {
      sched.lastRunAt = new Date().toISOString();
      sched.lastStatus = 'FAILED';
      sched.retryCount += 1;
      throw err;
    }
  }
}
