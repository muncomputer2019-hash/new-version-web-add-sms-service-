import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Laptop, Mail, MessageSquare, RefreshCw, ShieldAlert, Smartphone, Trash2 } from 'lucide-react';
import { UserProfile } from '../../modules/types';
import { OtpLogItem, phase08Api, RegisteredDeviceItem } from '../../services/phase08Api';
import { Button } from '../../components/Button';
import { DataTable, TableColumn } from '../../components/DataTable';
import { StatusText } from '../../components/StatusText';

interface DeviceMonitoringPageProps {
  currentUser: UserProfile;
  onShowToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}

export const DeviceMonitoringPage: React.FC<DeviceMonitoringPageProps> = ({
  currentUser,
  onShowToast,
}) => {
  const [devices, setDevices] = useState<RegisteredDeviceItem[]>([]);
  const [otpLogs, setOtpLogs] = useState<OtpLogItem[]>([]);
  const [tab, setTab] = useState<'devices' | 'otp'>('devices');
  const [loading, setLoading] = useState(true);

  const canSeeOtpLogs =
    currentUser.role === 'ADMIN' ||
    currentUser.role === 'AUDITOR' ||
    Boolean(currentUser.permissions?.['security_logs.VIEW']);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [devRes, otpRes] = await Promise.all([
        phase08Api.getDevices(),
        canSeeOtpLogs ? phase08Api.getOtpLogs() : Promise.resolve({ data: [] as OtpLogItem[] }),
      ]);
      setDevices(devRes.data);
      setOtpLogs(otpRes.data);
    } catch (err) {
      onShowToast('error', 'Load failed', err instanceof Error ? err.message : undefined);
    } finally {
      setLoading(false);
    }
  }, [canSeeOtpLogs, onShowToast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleVerifyDevice = async (device: RegisteredDeviceItem) => {
    try {
      await phase08Api.verifyDevice(device.deviceId, device.userId);
      onShowToast('success', 'Device Trusted', `${device.deviceName} verified.`);
      loadAll();
    } catch (err) {
      onShowToast('error', 'Verification failed', err instanceof Error ? err.message : undefined);
    }
  };

  const handleFlagSuspicious = async (device: RegisteredDeviceItem) => {
    try {
      await phase08Api.markDeviceSuspicious(device.deviceId);
      onShowToast('info', 'Flagged Suspicious', `Sessions linked to ${device.deviceId} have been terminated.`);
      loadAll();
    } catch (err) {
      onShowToast('error', 'Action failed', err instanceof Error ? err.message : undefined);
    }
  };

  const handleRevokeDevice = async (device: RegisteredDeviceItem) => {
    try {
      await phase08Api.revokeDevice(device.deviceId);
      onShowToast('info', 'Device Revoked', `${device.deviceId} access terminated.`);
      loadAll();
    } catch (err) {
      onShowToast('error', 'Revoke failed', err instanceof Error ? err.message : undefined);
    }
  };

  const deviceCols: TableColumn<RegisteredDeviceItem>[] = [
    {
      key: 'deviceId',
      header: 'Device ID & Label',
      render: (r) => (
        <div>
          <div className="font-mono text-xs font-semibold text-neutral-950 dark:text-white">{r.deviceId}</div>
          <div className="text-xs text-neutral-600 dark:text-neutral-300">{r.deviceName}</div>
        </div>
      ),
    },
    {
      key: 'userId',
      header: 'User ID',
      render: (r) => <span className="font-mono text-xs">{r.userId}</span>,
    },
    {
      key: 'env',
      header: 'Browser / OS / IP',
      render: (r) => (
        <div className="text-xs">
          <div>{r.browserInfo} · {r.osInfo}</div>
          <div className="font-mono text-neutral-500">{r.lastIp}</div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Verification Status',
      render: (r) => <StatusText status={r.verificationStatus} />,
    },
    {
      key: 'lastActive',
      header: 'Last Active (UTC)',
      render: (r) => (
        <span className="font-mono text-xs text-neutral-500">
          {r.lastActiveAt.slice(0, 19).replace('T', ' ')}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1.5">
          {r.verificationStatus !== 'TRUSTED' && r.verificationStatus !== 'REVOKED' && (
            <Button variant="outline" size="sm" onClick={() => handleVerifyDevice(r)} icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}>
              Trust
            </Button>
          )}
          {currentUser.role === 'ADMIN' && r.verificationStatus !== 'SUSPICIOUS' && (
            <Button variant="outline" size="sm" onClick={() => handleFlagSuspicious(r)} icon={<ShieldAlert className="h-3.5 w-3.5 text-amber-600" />}>
              Flag
            </Button>
          )}
          {r.verificationStatus !== 'REVOKED' && (
            <Button variant="outline" size="sm" onClick={() => handleRevokeDevice(r)} icon={<Trash2 className="h-3.5 w-3.5 text-red-600" />}>
              Revoke
            </Button>
          )}
        </div>
      ),
    },
  ];

  const otpCols: TableColumn<OtpLogItem>[] = [
    {
      key: 'createdAt',
      header: 'Timestamp',
      render: (r) => <span className="font-mono text-xs text-neutral-500">{r.createdAt.slice(0, 19).replace('T', ' ')}</span>,
    },
    {
      key: 'userId',
      header: 'User / Target',
      render: (r) => (
        <div className="text-xs font-mono">
          <div className="font-semibold text-neutral-950 dark:text-white">{r.userId || 'Guest'}</div>
          <div className="text-neutral-500">{r.maskedTarget}</div>
        </div>
      ),
    },
    {
      key: 'channel',
      header: '2FA Channel',
      render: (r) => (
        <span className="inline-flex items-center gap-1.5 font-mono text-xs">
          {r.channel === 'EMAIL' && <Mail className="h-3.5 w-3.5" />}
          {r.channel === 'SMS' && <Smartphone className="h-3.5 w-3.5" />}
          {r.channel === 'WHATSAPP' && <MessageSquare className="h-3.5 w-3.5" />}
          {r.channel}
        </span>
      ),
    },
    {
      key: 'delivery',
      header: 'Provider Delivery Status',
      render: (r) => (
        <div className="text-xs">
          <StatusText status={r.deliveryStatus} />
          <div className="text-[11px] text-neutral-500 max-w-[240px] truncate">{r.deliveryDetail}</div>
        </div>
      ),
    },
    {
      key: 'outcome',
      header: 'OTP Outcome',
      render: (r) => <StatusText status={r.outcome} />,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-neutral-950 dark:text-white">
            Device Monitoring &amp; Multi-Channel OTP Logs
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Privacy-conscious device trust verification + SMS OTP &amp; Google Authenticator (TOTP) 2FA verification telemetry
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadAll} icon={<RefreshCw className="h-3.5 w-3.5" />}>
          Refresh
        </Button>
      </div>

      <div className="flex items-center gap-2 border-b border-neutral-200 dark:border-neutral-800 pb-2">
        <button
          type="button"
          onClick={() => setTab('devices')}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
            tab === 'devices'
              ? 'bg-neutral-950 text-white dark:bg-white dark:text-neutral-950'
              : 'text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
          }`}
        >
          <Laptop className="h-3.5 w-3.5" />
          Registered Devices ({devices.length})
        </button>
        {canSeeOtpLogs && (
          <button
            type="button"
            onClick={() => setTab('otp')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
              tab === 'otp'
                ? 'bg-neutral-950 text-white dark:bg-white dark:text-neutral-950'
                : 'text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
            }`}
          >
            <Smartphone className="h-3.5 w-3.5" />
            2FA OTP Verification Logs ({otpLogs.length})
          </button>
        )}
      </div>

      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden">
        {tab === 'devices' ? (
          <DataTable columns={deviceCols} data={devices} rowKey={(d) => `${d.userId}:${d.deviceId}`} loading={loading} />
        ) : (
          <DataTable columns={otpCols} data={otpLogs} rowKey={(l) => l.id} loading={loading} />
        )}
      </div>
    </div>
  );
};
