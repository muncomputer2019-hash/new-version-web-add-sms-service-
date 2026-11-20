import React, { useCallback, useEffect, useState } from 'react';
import { Clock, Play, RotateCcw, Plus, CheckCircle2, AlertCircle } from 'lucide-react';
import {
  ReportCatalogItem,
  ScheduleRunItem,
  ScheduledReportItem,
  reportApi,
} from '../../services/reportApi';
import { Button } from '../../components/Button';

interface ScheduledReportsPageProps {
  onShowToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}

export const ScheduledReportsPage: React.FC<ScheduledReportsPageProps> = ({ onShowToast }) => {
  const [schedules, setSchedules] = useState<ScheduledReportItem[]>([]);
  const [runs, setRuns] = useState<ScheduleRunItem[]>([]);
  const [catalog, setCatalog] = useState<ReportCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyCode, setBusyCode] = useState<string | null>(null);

  // Create form
  const [name, setName] = useState('');
  const [reportKey, setReportKey] = useState('FIN_DAILY_CASHBOOK');
  const [frequency, setFrequency] = useState<ScheduledReportItem['frequency']>('DAILY');
  const [exportFormat, setExportFormat] = useState<'PDF' | 'EXCEL' | 'BOTH'>('PDF');
  const [channels, setChannels] = useState<Array<'INTERNAL' | 'EMAIL_SMTP' | 'WHATSAPP'>>(['INTERNAL']);
  const [recipientsRaw, setRecipientsRaw] = useState('MUNCOMPUTER2019@GMAIL.COM');

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, cRes] = await Promise.all([reportApi.getSchedules(), reportApi.getCatalog()]);
      setSchedules(sRes.data.schedules);
      setRuns(sRes.data.runs);
      setCatalog(cRes.data.filter((c) => c.enabled));
    } catch (err) {
      onShowToast('error', 'Failed to load schedules', err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [onShowToast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusyCode('NEW');
    try {
      await reportApi.createSchedule({
        name: name.trim(),
        reportKey,
        frequency,
        exportFormat,
        channels,
        recipients: recipientsRaw
          .split(',')
          .map((r) => r.trim())
          .filter(Boolean),
        enabled: true,
      });
      setName('');
      onShowToast('success', 'Schedule Created');
      loadAll();
    } catch (err) {
      onShowToast('error', 'Failed to create schedule', err instanceof Error ? err.message : undefined);
    } finally {
      setBusyCode(null);
    }
  };

  const handleToggleEnabled = async (sched: ScheduledReportItem) => {
    setBusyCode(sched.scheduleCode);
    try {
      await reportApi.updateSchedule(sched.scheduleCode, { enabled: !sched.enabled });
      onShowToast('info', `${sched.scheduleCode} ${!sched.enabled ? 'Enabled' : 'Paused'}`);
      loadAll();
    } catch (err) {
      onShowToast('error', 'Update failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusyCode(null);
    }
  };

  const handleRunNow = async (code: string) => {
    setBusyCode(code);
    try {
      const res = await reportApi.runScheduleNow(code);
      onShowToast('success', `Executed ${code}`, `Run status: ${res.data.status}`);
      loadAll();
    } catch (err) {
      onShowToast('error', 'Execution failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusyCode(null);
    }
  };

  const handleRetryRun = async (runCode: string) => {
    setBusyCode(runCode);
    try {
      const res = await reportApi.retryScheduleRun(runCode);
      onShowToast('info', `Retry completed (${res.data.status})`, `Attempt #${res.data.attemptNo}`);
      loadAll();
    } catch (err) {
      onShowToast('error', 'Retry failed', err instanceof Error ? err.message : undefined);
    } finally {
      setBusyCode(null);
    }
  };

  const toggleChannel = (ch: 'INTERNAL' | 'EMAIL_SMTP' | 'WHATSAPP') => {
    setChannels((prev) =>
      prev.includes(ch) ? (prev.length > 1 ? prev.filter((x) => x !== ch) : prev) : [...prev, ch]
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-neutral-950 dark:text-white tracking-tight">
          Automated Scheduled Reports &amp; Delivery Logs
        </h1>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
          Configure Daily, Weekly, Monthly, Quarterly, and Financial Year report jobs stored directly into the private encrypted archive. External Email/WhatsApp delivery reports exact integration status without mocking.
        </p>
      </div>

      {/* Create Schedule Form */}
      <form
        onSubmit={handleCreateSchedule}
        className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 space-y-4 text-xs"
      >
        <div className="font-semibold text-sm text-neutral-950 dark:text-white">Create Automated Schedule</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block font-medium mb-1">Schedule Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Weekly Customer Dues Register"
              className="w-full h-9 px-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
            />
          </div>
          <div>
            <label className="block font-medium mb-1">Report Dataset</label>
            <select
              value={reportKey}
              onChange={(e) => setReportKey(e.target.value)}
              className="w-full h-9 px-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
            >
              {catalog.map((c) => (
                <option key={c.reportKey} value={c.reportKey}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-medium mb-1">Frequency</label>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as ScheduledReportItem['frequency'])}
              className="w-full h-9 px-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
            >
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
              <option value="QUARTERLY">Quarterly</option>
              <option value="FINANCIAL_YEAR">Yearly / Financial Year</option>
            </select>
          </div>
          <div>
            <label className="block font-medium mb-1">Export Format</label>
            <select
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as 'PDF' | 'EXCEL' | 'BOTH')}
              className="w-full h-9 px-2.5 bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
            >
              <option value="PDF">PDF Document</option>
              <option value="EXCEL">Excel Workbook (.xlsx)</option>
              <option value="BOTH">Both PDF &amp; Excel</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-neutral-100 dark:border-neutral-800">
          <div className="flex flex-wrap items-center gap-4">
            <span className="font-medium">Delivery Channels:</span>
            {(['INTERNAL', 'EMAIL_SMTP', 'WHATSAPP'] as const).map((ch) => (
              <label key={ch} className="inline-flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={channels.includes(ch)} onChange={() => toggleChannel(ch)} />
                <span>{ch === 'INTERNAL' ? 'Internal Archive' : ch === 'EMAIL_SMTP' ? 'Email (SMTP)' : 'WhatsApp'}</span>
              </label>
            ))}
            <input
              type="text"
              value={recipientsRaw}
              onChange={(e) => setRecipientsRaw(e.target.value)}
              placeholder="Recipients (comma-separated)"
              className="h-8 px-2.5 min-w-[220px] bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded"
            />
          </div>
          <Button type="submit" variant="primary" size="sm" loading={busyCode === 'NEW'} icon={<Plus className="h-3.5 w-3.5" />}>
            Create Schedule
          </Button>
        </div>
      </form>

      {/* Active & Paused Schedules Table */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Configured Schedules ({schedules.length})</h2>
          {loading && <span className="text-xs text-neutral-500">Refreshing...</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-neutral-50 dark:bg-neutral-950 border-b border-neutral-200 dark:border-neutral-800">
              <tr>
                <th className="px-4 py-2.5">Code / Name</th>
                <th className="px-4 py-2.5">Frequency</th>
                <th className="px-4 py-2.5">Format &amp; Channels</th>
                <th className="px-4 py-2.5">Last Status</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {schedules.map((s) => (
                <tr key={s.scheduleCode}>
                  <td className="px-4 py-2.5">
                    <div className="font-semibold text-neutral-950 dark:text-white">{s.name}</div>
                    <div className="font-mono text-[11px] text-neutral-500">
                      {s.scheduleCode} · {s.reportKey || s.templateCode}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 font-mono">
                    {s.frequency} ({s.runTimeIst} IST)
                  </td>
                  <td className="px-4 py-2.5">
                    <div>{s.exportFormat}</div>
                    <div className="text-[11px] text-neutral-500">{s.channels.join(', ')}</div>
                  </td>
                  <td className="px-4 py-2.5 font-mono">{s.lastStatus}</td>
                  <td className="px-4 py-2.5 text-right space-x-2 whitespace-nowrap">
                    <Button
                      variant="outline"
                      size="sm"
                      loading={busyCode === s.scheduleCode}
                      onClick={() => handleToggleEnabled(s)}
                    >
                      {s.enabled ? 'Pause' : 'Enable'}
                    </Button>
                    <Button
                      variant="primary"
                      size="sm"
                      loading={busyCode === s.scheduleCode}
                      onClick={() => handleRunNow(s.scheduleCode)}
                      icon={<Play className="h-3 w-3" />}
                    >
                      Run Now
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Run History & Failed Delivery Logs with Retry */}
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center gap-2">
          <Clock className="h-4 w-4 text-neutral-500" />
          <h2 className="text-sm font-semibold">Execution Run History &amp; Delivery Logs ({runs.length})</h2>
        </div>
        <div className="divide-y divide-neutral-100 dark:divide-neutral-800 text-xs">
          {runs.map((run) => (
            <div key={run.runCode} className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  {run.status === 'SUCCESS' ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                  )}
                  <span className="font-mono font-bold">{run.runCode}</span>
                  <span className="font-semibold">{run.scheduleName}</span>
                  <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-neutral-800">
                    Attempt #{run.attemptNo} · {run.status}
                  </span>
                </div>
                <div className="text-[11px] text-neutral-500 font-mono">
                  Archive ID(s): {run.archiveCodes.join(', ') || 'None'} · Triggered by: {run.triggeredBy}
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {run.deliveryResults.map((d, idx) => (
                    <span
                      key={idx}
                      className={`text-[11px] px-2 py-0.5 rounded border ${
                        d.status === 'Delivered'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                          : 'border-amber-200 bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-300'
                      }`}
                    >
                      {d.channel}: {d.status} — {d.detail}
                    </span>
                  ))}
                </div>
              </div>

              {run.status !== 'SUCCESS' && (
                <Button
                  variant="outline"
                  size="sm"
                  loading={busyCode === run.runCode}
                  onClick={() => handleRetryRun(run.runCode)}
                  icon={<RotateCcw className="h-3.5 w-3.5" />}
                >
                  Retry Delivery
                </Button>
              )}
            </div>
          ))}
          {runs.length === 0 && (
            <div className="p-6 text-center text-neutral-500">
              No scheduled execution runs recorded yet. Click "Run Now" on any schedule to execute immediately.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
