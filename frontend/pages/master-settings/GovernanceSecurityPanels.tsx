import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileUp,
  KeyRound,
  MessageSquareText,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
  Wrench,
  XCircle,
  Smartphone,
} from 'lucide-react';
import {
  ApiIntegrationItem,
  BackupRecord,
  MaintenanceSettingsConfig,
  SecurityPolicyConfig,
  SettingsHistoryEntry,
  SettingsProposalItem,
  UploadedDocumentItem,
} from '../../modules/types';
import { Button } from '../../components/Button';
import { StatusText } from '../../components/StatusText';
import { formatDateTimeIST } from '../../services/formatters';
import { securityRequest } from '../../services/securityApi';
import { GoogleAuthenticatorModal } from '../../components/GoogleAuthenticatorModal';

const inputCls =
  'w-full h-9 px-3 text-xs bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded-md text-neutral-950 dark:text-neutral-100 focus:outline-none focus:border-blue-800';
const labelCls = 'block text-xs font-medium text-neutral-800 dark:text-neutral-200 mb-1';
const cardCls =
  'bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-5 space-y-4';

/* ---------------- 1. Security Settings Panel ---------------- */
export const SecuritySettingsPanel: React.FC<{
  policy: SecurityPolicyConfig;
  currentUserEmail?: string;
  currentUserId?: string;
  currentUserRole?: string;
  onShowToast?: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}> = ({
  policy,
  currentUserEmail = 'mamunreja335@gmail.com',
  currentUserId = 'MC2627110001',
  currentUserRole = 'ADMIN',
  onShowToast,
}) => {
  const [isGAuthOpen, setIsGAuthOpen] = useState(false);
  const [gAuthEnabled, setGAuthEnabled] = useState(false);
  const [gAuthLoading, setGAuthLoading] = useState(true);
  const [totpVerifyCode, setTotpVerifyCode] = useState('');
  const [totpVerifying, setTotpVerifying] = useState(false);
  const [totpCheckMessage, setTotpCheckMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    let active = true;
    setGAuthLoading(true);
    securityRequest<{ totpEnabled: boolean }>('/api/auth/totp/status')
      .then((res) => {
        if (active) setGAuthEnabled(Boolean(res.data?.totpEnabled));
      })
      .catch(() => {
        // Non-blocking if backend/status check unavailable
      })
      .finally(() => {
        if (active) setGAuthLoading(false);
      });
    return () => {
      active = false;
    };
  }, [currentUserId]);

  const handleVerifyTotpCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setTotpCheckMessage(null);
    const clean = totpVerifyCode.trim();
    if (!/^\d{6}$/.test(clean)) {
      setTotpCheckMessage({
        type: 'error',
        text: 'Enter a valid 6-digit code from Google Authenticator.',
      });
      return;
    }

    setTotpVerifying(true);
    try {
      await securityRequest<{ verified: boolean }>('/api/auth/totp/verify-code', {
        method: 'POST',
        body: JSON.stringify({ code: clean }),
      });
      setTotpVerifyCode('');
      setTotpCheckMessage({
        type: 'success',
        text: '6-digit Google Authenticator TOTP code verified for Master Dashboard access.',
      });
      onShowToast?.('success', 'TOTP Code Verified', 'Google Authenticator code is valid.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid 6-digit Google Authenticator code.';
      setTotpCheckMessage({ type: 'error', text: msg });
      onShowToast?.('error', 'TOTP Verification Failed', msg);
    } finally {
      setTotpVerifying(false);
    }
  };

  const handleDisableTotp = async () => {
    try {
      await securityRequest<{ totpEnabled: boolean }>('/api/auth/totp/disable', {
        method: 'POST',
        body: '{}',
      });
      setGAuthEnabled(false);
      setTotpVerifyCode('');
      setTotpCheckMessage(null);
      onShowToast?.('info', 'Google Authenticator Disabled', 'SMS OTP remains active as your default 2FA channel.');
    } catch (err) {
      onShowToast?.(
        'error',
        'Unable to Disable TOTP',
        err instanceof Error ? err.message : 'Request failed.'
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className={cardCls}>
        <div className="flex items-center gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-3">
          <ShieldCheck className="h-4 w-4 text-blue-800 dark:text-blue-400" />
          <div>
            <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
              Security Governance Policy (Enforced Server-Side)
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Hardened authentication, session duration, lockout protection, and strict role isolation.
            </p>
          </div>
        </div>

        <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
          {[
            ['Master Settings Authority', policy.masterSettingsAccess],
            ['User Creation Authority', policy.userCreationAuthority],
            ['Approval Authority', policy.approvalAuthority],
            ['Session Duration', `${policy.sessionDurationMinutes} minutes`],
            ['Inactivity Auto Logout', `${policy.inactivityAutoLogoutMinutes} minutes`],
            ['Password Complexity', `${policy.passwordPolicy} (8+ chars, upper/lower/num/special)`],
            ['Failed Login Attempts Limit', `${policy.failedLoginAttemptsLimit} attempts`],
            ['Account Lockout Duration', `${policy.accountLockoutMinutes} minutes`],
            ['2FA Required Roles', policy.twoFactorRequiredRoles.join(', ')],
          ].map(([k, v]) => (
            <div
              key={k}
              className="p-3 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-md"
            >
              <dt className="text-neutral-500 dark:text-neutral-400">{k}</dt>
              <dd className="font-mono font-semibold text-neutral-950 dark:text-white mt-1 tabular-nums">
                {v}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Two-Factor Authentication Settings: SMS OTP + Google Authenticator (TOTP) */}
      <div className={cardCls}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-100 dark:border-neutral-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-lg">
              <Smartphone className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
                Two-Factor Authentication (SMS &amp; Google Authenticator)
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Active secure 2FA channels for {currentUserRole} ({currentUserId}): SMS OTP and Google Authenticator TOTP.
              </p>
            </div>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium w-fit ${
              gAuthEnabled
                ? 'bg-green-100 dark:bg-green-950/60 text-green-700 dark:text-green-300'
                : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${gAuthEnabled ? 'bg-green-600' : 'bg-amber-500'}`} />
            {gAuthLoading ? 'Checking...' : gAuthEnabled ? 'SMS + Google Auth Active' : 'SMS Active (TOTP Not Linked)'}
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Option 1: SMS OTP Channel (Active Default) */}
          <div className="p-4 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquareText className="h-4 w-4 text-blue-700 dark:text-blue-400" />
                <span className="text-xs font-semibold text-neutral-950 dark:text-white">
                  SMS Verification Channel
                </span>
              </div>
              <span className="text-[11px] font-mono font-semibold text-green-700 dark:text-green-400">
                ACTIVE DEFAULT
              </span>
            </div>
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              Primary 6-digit OTP channel enforced on User ID sign-in after credential and CAPTCHA verification.
            </p>
            <div className="text-[11px] font-mono text-neutral-500 dark:text-neutral-400 pt-1">
              Channel: SMS · 5-minute TTL · Account: {currentUserId}
            </div>
          </div>

          {/* Option 2: Dedicated Google Authenticator / TOTP Code Box */}
          <div className="p-4 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-blue-700 dark:text-blue-400" />
                <span className="text-xs font-semibold text-neutral-950 dark:text-white">
                  Google Authenticator / TOTP Code
                </span>
              </div>
              <span className="text-[11px] font-mono font-semibold text-neutral-700 dark:text-neutral-300">
                {gAuthEnabled ? 'LINKED' : 'NOT LINKED'}
              </span>
            </div>

            {gAuthEnabled ? (
              <form onSubmit={handleVerifyTotpCode} className="space-y-2.5">
                <label htmlFor="settings-totp-code" className="block text-[11px] font-medium text-neutral-700 dark:text-neutral-300">
                  Enter 6-Digit Google Authenticator Code (Test / Verify Admin Access)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="settings-totp-code"
                    type="text"
                    maxLength={6}
                    value={totpVerifyCode}
                    onChange={(e) => setTotpVerifyCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    className="flex-1 h-9 px-3 text-center text-sm tracking-[0.35em] font-mono bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md focus:outline-none focus:border-blue-800"
                  />
                  <Button type="submit" variant="primary" size="sm" loading={totpVerifying}>
                    Verify Code
                  </Button>
                </div>
                {totpCheckMessage && (
                  <p
                    className={`text-[11px] ${
                      totpCheckMessage.type === 'success'
                        ? 'text-green-700 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {totpCheckMessage.text}
                  </p>
                )}
              </form>
            ) : (
              <p className="text-xs text-neutral-600 dark:text-neutral-400">
                Link Google Authenticator to enable 6-digit offline TOTP codes alongside SMS OTP during Step 3 login verification.
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Button
                type="button"
                variant={gAuthEnabled ? 'secondary' : 'primary'}
                size="sm"
                onClick={() => setIsGAuthOpen(true)}
              >
                {gAuthEnabled ? 'Reconfigure TOTP Key' : 'Setup Google Authenticator'}
              </Button>
              {gAuthEnabled && (
                <Button type="button" variant="outline" size="sm" onClick={handleDisableTotp}>
                  Disable TOTP
                </Button>
              )}
            </div>
          </div>
        </div>

        <GoogleAuthenticatorModal
          isOpen={isGAuthOpen}
          onClose={() => setIsGAuthOpen(false)}
          userEmail={currentUserEmail}
          userId={currentUserId}
          onShowToast={onShowToast || (() => {})}
          onSuccess={() => {
            setGAuthEnabled(true);
            setTotpCheckMessage(null);
          }}
        />
      </div>
    </div>
  );
};

/* ---------------- 2. Approval Management (Proposals) Panel ---------------- */
export const SettingsProposalsPanel: React.FC<{
  proposals: SettingsProposalItem[];
  isAdmin: boolean;
  onRefresh: () => void;
  onShowToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}> = ({ proposals, isAdmin, onRefresh, onShowToast }) => {
  const [moduleName, setModuleName] = useState('Notification Settings');
  const [settingName, setSettingName] = useState('WhatsApp Payment Alert Copy');
  const [proposedVal, setProposedVal] = useState('Enable instant receipt WhatsApp link');
  const [reason, setReason] = useState('Customer requested instant confirmation');
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});

  const handleSubmitProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await securityRequest('/api/settings-proposals', {
        method: 'POST',
        body: JSON.stringify({
          settingModule: moduleName,
          settingName,
          oldValue: 'Current setting',
          proposedValue: proposedVal,
          changeReason: reason,
        }),
      });
      onShowToast('info', 'Proposal Submitted', 'Live settings remain unchanged until Admin approval.');
      onRefresh();
    } catch (err) {
      onShowToast('error', 'Proposal Blocked', err instanceof Error ? err.message : undefined);
    }
  };

  const handleApprove = async (proposalId: string) => {
    try {
      await securityRequest(`/api/settings-proposals/${proposalId}/approve`, { method: 'POST', body: '{}' });
      onShowToast('success', 'Proposal Approved', `${proposalId} applied to live settings.`);
      onRefresh();
    } catch (err) {
      onShowToast('error', 'Approval Failed', err instanceof Error ? err.message : undefined);
    }
  };

  const handleReject = async (proposalId: string) => {
    const rejReason = rejectReasons[proposalId]?.trim();
    if (!rejReason) {
      onShowToast('error', 'Reason Required', 'Enter a rejection reason first.');
      return;
    }
    try {
      await securityRequest(`/api/settings-proposals/${proposalId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ rejectionReason: rejReason }),
      });
      onShowToast('info', 'Proposal Rejected', `${proposalId} rejected.`);
      onRefresh();
    } catch (err) {
      onShowToast('error', 'Rejection Failed', err instanceof Error ? err.message : undefined);
    }
  };

  return (
    <div className="space-y-5">
      <form onSubmit={handleSubmitProposal} className={cardCls}>
        <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-3">
          <div>
            <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
              Submit Permitted Settings Change Proposal
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Workflow: MANAGER PROPOSES → ADMIN REVIEWS → APPROVES OR REJECTS. Pending/Rejected never modify live settings.
            </p>
          </div>
          <Button type="submit" variant="primary" size="sm">
            Submit Proposal
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className={labelCls}>Permitted Module</label>
            <select value={moduleName} onChange={(e) => setModuleName(e.target.value)} className={inputCls}>
              <option value="Service Rate Management">Service Rate Management</option>
              <option value="Notification Settings">Notification Settings</option>
              <option value="Print Settings">Print Settings</option>
              <option value="Customer Settings">Customer Settings</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Setting Name</label>
            <input value={settingName} onChange={(e) => setSettingName(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Proposed Value</label>
            <input value={proposedVal} onChange={(e) => setProposedVal(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Change Reason *</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} />
          </div>
        </div>
      </form>

      <div className={cardCls}>
        <h4 className="text-xs font-semibold text-neutral-950 dark:text-white">
          Settings Change Proposals ({proposals.length})
        </h4>
        <div className="divide-y divide-neutral-100 dark:divide-neutral-800 text-xs">
          {proposals.length === 0 ? (
            <div className="py-4 text-neutral-500">No settings proposals submitted yet.</div>
          ) : (
            proposals.map((p) => (
              <div key={p.proposalId} className="py-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-mono font-bold text-neutral-950 dark:text-white">{p.proposalId}</span> ·{' '}
                    <span className="font-semibold">{p.settingModule}</span> ({p.settingName}) · Proposed by{' '}
                    <span className="font-mono">{p.proposedBy}</span>
                  </div>
                  <StatusText status={p.approvalStatus} />
                </div>
                <div className="font-mono text-[11px] text-neutral-600 dark:text-neutral-300">
                  Old: {JSON.stringify(p.oldValue)} → Proposed: {JSON.stringify(p.proposedValue)} | Reason: {p.changeReason}
                </div>
                {p.rejectionReason && (
                  <div className="text-[11px] text-red-600 dark:text-red-400">
                    Rejection Reason: {p.rejectionReason}
                  </div>
                )}
                {isAdmin && p.approvalStatus === 'Pending' && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleApprove(p.proposalId)}
                      icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                    >
                      Approve &amp; Apply
                    </Button>
                    <input
                      value={rejectReasons[p.proposalId] ?? ''}
                      onChange={(e) => setRejectReasons({ ...rejectReasons, [p.proposalId]: e.target.value })}
                      placeholder="Mandatory rejection reason..."
                      className="h-8 px-2.5 text-xs bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded-md w-56"
                    />
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleReject(p.proposalId)}
                      icon={<XCircle className="h-3.5 w-3.5" />}
                    >
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

/* ---------------- 3. Backup & Restore Panel ---------------- */
export const BackupRestorePanel: React.FC<{
  backups: BackupRecord[];
  lastSuccessfulBackup: string | null;
  nextScheduledBackup: string;
  onRequestRestore: (backupCode: string) => void;
  onRefresh: () => void;
  onShowToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}> = ({
  backups,
  lastSuccessfulBackup,
  nextScheduledBackup,
  onRequestRestore,
  onRefresh,
  onShowToast,
}) => {
  const [creating, setCreating] = useState(false);

  const handleCreateBackup = async (storageTarget: 'Hosting Server' | 'Computer Download') => {
    setCreating(true);
    try {
      const res = await securityRequest<BackupRecord>('/api/backups', {
        method: 'POST',
        body: JSON.stringify({ storageTarget }),
      });
      onShowToast('success', 'Encrypted Backup Created', `${res.data.backupCode} (AES-256-GCM)`);
      if (storageTarget === 'Computer Download') {
        window.open(`/api/backups/${res.data.backupCode}/download`, '_blank');
      }
      onRefresh();
    } catch (err) {
      onShowToast('error', 'Backup Failed', err instanceof Error ? err.message : undefined);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className={cardCls}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-100 dark:border-neutral-800 pb-3">
        <div>
          <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
            AES-256-GCM Encrypted Backup &amp; SHA-256 Verified Restore
          </h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Last Backup: <span className="font-mono">{lastSuccessfulBackup ? formatDateTimeIST(lastSuccessfulBackup) : 'None yet'}</span> ·{' '}
            {nextScheduledBackup}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" loading={creating} onClick={() => handleCreateBackup('Hosting Server')}>
            Backup to Hosting Server
          </Button>
          <Button variant="primary" size="sm" loading={creating} onClick={() => handleCreateBackup('Computer Download')} icon={<Download className="h-3.5 w-3.5" />}>
            Create &amp; Download (.munbak.json)
          </Button>
        </div>
      </div>

      <div className="p-3 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded text-xs text-neutral-600 dark:text-neutral-300">
        Automated 2:00 AM daily backups require an external Hostinger/cPanel Cron Job invoking the encrypted backup endpoint. Manual backups are available anytime above.
      </div>

      <div className="divide-y divide-neutral-100 dark:divide-neutral-800 text-xs">
        {backups.map((b) => (
          <div key={b.backupCode} className="py-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-mono font-semibold text-neutral-950 dark:text-white">
                {b.backupCode} · {b.storageTarget} · {b.encryptionAlgo}
              </div>
              <div className="font-mono text-[11px] text-neutral-500 mt-0.5">
                SHA-256: {b.checksumSha256.slice(0, 24)}... · {b.fileSizeBytes} bytes · {formatDateTimeIST(b.createdAt)}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <StatusText status={b.status} />
              <a
                href={`/api/backups/${b.backupCode}/download`}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-neutral-200 dark:border-neutral-700 rounded text-xs hover:bg-neutral-50 dark:hover:bg-neutral-800"
              >
                <Download className="h-3 w-3" />
                <span>Download</span>
              </a>
              <Button variant="danger" size="sm" onClick={() => onRequestRestore(b.backupCode)} icon={<RotateCcw className="h-3 w-3" />}>
                Verify &amp; Restore
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ---------------- 4. Document Upload Controls Panel ---------------- */
export const DocumentsPanel: React.FC<{
  documents: UploadedDocumentItem[];
  isAdmin: boolean;
  onRequestDeleteDoc: (uuid: string) => void;
  onRefresh: () => void;
  onShowToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}> = ({ documents, isAdmin, onRequestDeleteDoc, onRefresh, onShowToast }) => {
  const [category, setCategory] = useState('Customer KYC');

  const handleFileSelect = async (file?: File) => {
    if (!file) return;
    try {
      const res = await securityRequest<UploadedDocumentItem>('/api/documents/validate-upload', {
        method: 'POST',
        body: JSON.stringify({
          originalName: file.name,
          mimeType: file.type || 'application/octet-stream',
          fileSizeBytes: file.size,
          category,
        }),
      });
      onShowToast('success', 'Document Validated', `${res.data.originalName} registered in private storage.`);
      onRefresh();
    } catch (err) {
      onShowToast('error', 'Upload Rejected', err instanceof Error ? err.message : undefined);
    }
  };

  return (
    <div className={cardCls}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 dark:border-neutral-800 pb-3">
        <div>
          <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
            Document Upload Settings (PDF / JPEG / PNG · Max 10 MB)
          </h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Strict MIME + size enforcement. Stored in private server directory; delete restricted to Admin.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input value={category} onChange={(e) => setCategory(e.target.value)} className="h-8 px-2.5 text-xs bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded-md w-36" />
          <label className="h-8 px-3 inline-flex items-center gap-1.5 bg-neutral-950 dark:bg-white text-white dark:text-neutral-950 rounded-md text-xs font-medium cursor-pointer">
            <FileUp className="h-3.5 w-3.5" />
            <span>Validate &amp; Upload File</span>
            <input type="file" className="hidden" onChange={(e) => handleFileSelect(e.target.files?.[0])} />
          </label>
        </div>
      </div>

      <div className="divide-y divide-neutral-100 dark:divide-neutral-800 text-xs">
        {documents.map((doc) => (
          <div key={doc.fileUuid} className="py-2.5 flex items-center justify-between gap-3">
            <div>
              <div className="font-medium text-neutral-950 dark:text-white">{doc.originalName}</div>
              <div className="font-mono text-[11px] text-neutral-500">
                {doc.mimeType} · {Math.round(doc.fileSizeBytes / 1024)} KB · {doc.category} · {doc.uploadedBy}
              </div>
            </div>
            {isAdmin && (
              <Button variant="ghost" size="sm" onClick={() => onRequestDeleteDoc(doc.fileUuid)} icon={<Trash2 className="h-3.5 w-3.5 text-red-600" />}>
                Delete
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

/* ---------------- 5. API Integrations, Maintenance & Settings History ---------------- */
export const IntegrationsPanel: React.FC<{
  integrations: ApiIntegrationItem[];
  onRefresh: () => void;
  onShowToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}> = ({ integrations, onRefresh, onShowToast }) => {
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [endpoints, setEndpoints] = useState<Record<string, string>>({});
  const [senders, setSenders] = useState<Record<string, string>>({});

  const handleSave = async (item: ApiIntegrationItem) => {
    try {
      await securityRequest(`/api/integrations/${item.channel}`, {
        method: 'PUT',
        body: JSON.stringify({
          providerName: item.providerName,
          endpointOrHost: endpoints[item.channel] ?? item.endpointOrHost,
          senderOrFrom: senders[item.channel] ?? item.senderOrFrom,
          apiSecret: secrets[item.channel] ?? '',
        }),
      });
      setSecrets((prev) => ({ ...prev, [item.channel]: '' }));
      onShowToast('success', `${item.channel} Updated`, 'Credentials stored encrypted (secret never echoed).');
      onRefresh();
    } catch (err) {
      onShowToast('error', 'Update Failed', err instanceof Error ? err.message : undefined);
    }
  };

  const handleTest = async (channel: string) => {
    try {
      await securityRequest(`/api/integrations/${channel}/test`, { method: 'POST', body: '{}' });
      onShowToast('success', `${channel} Validated`, 'Integration configuration check passed.');
      onRefresh();
    } catch (err) {
      onShowToast('error', `${channel} Check Failed`, err instanceof Error ? err.message : undefined);
      onRefresh();
    }
  };

  return (
    <div className="space-y-4">
      {integrations.map((item) => (
        <div key={item.channel} className={cardCls}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 dark:border-neutral-800 pb-2.5">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-blue-800 dark:text-blue-400" />
              <span className="text-sm font-semibold text-neutral-950 dark:text-white">
                {item.channel} — {item.providerName}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <StatusText status={item.lastTestStatus} />
              <Button variant="outline" size="sm" onClick={() => handleTest(item.channel)}>
                Test Connection
              </Button>
              <Button variant="primary" size="sm" onClick={() => handleSave(item)} icon={<Save className="h-3.5 w-3.5" />}>
                Save Credentials
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Endpoint / SMTP Host</label>
              <input
                value={endpoints[item.channel] ?? item.endpointOrHost}
                onChange={(e) => setEndpoints({ ...endpoints, [item.channel]: e.target.value })}
                placeholder="smtp.hostinger.com or https://..."
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Sender ID / From Email</label>
              <input
                value={senders[item.channel] ?? item.senderOrFrom}
                onChange={(e) => setSenders({ ...senders, [item.channel]: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>API Key / Secret (Write-Only Encrypted)</label>
              <input
                type="password"
                value={secrets[item.channel] ?? ''}
                onChange={(e) => setSecrets({ ...secrets, [item.channel]: e.target.value })}
                placeholder={item.hasSecret ? '•••••••• (Configured)' : 'Enter secret key...'}
                className={inputCls}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export const MaintenancePanel: React.FC<{
  initial: MaintenanceSettingsConfig;
  onRefresh: () => void;
  onShowToast: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}> = ({ initial, onRefresh, onShowToast }) => {
  const [form, setForm] = useState<MaintenanceSettingsConfig>(initial);

  const handleSave = async () => {
    try {
      await securityRequest('/api/master-settings/maintenance', {
        method: 'PUT',
        body: JSON.stringify(form),
      });
      onShowToast(
        'success',
        'Maintenance Config Saved',
        form.maintenanceMode ? 'Non-Admin logins are now blocked (503).' : 'System open to all authorized roles.'
      );
      onRefresh();
    } catch (err) {
      onShowToast('error', 'Save Failed', err instanceof Error ? err.message : undefined);
    }
  };

  return (
    <div className={cardCls}>
      <div className="flex items-center justify-between border-b border-neutral-100 dark:border-neutral-800 pb-3">
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-neutral-700 dark:text-neutral-300" />
          <div>
            <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
              Maintenance Mode &amp; System Health
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Admin can always log in during maintenance; Manager &amp; Staff logins return HTTP 503.
            </p>
          </div>
        </div>
        <Button variant="primary" size="sm" onClick={handleSave} icon={<Save className="h-3.5 w-3.5" />}>
          Save Maintenance Settings
        </Button>
      </div>

      <div className="flex flex-wrap gap-5 text-xs">
        <label className="inline-flex items-center gap-2 cursor-pointer font-medium">
          <input
            type="checkbox"
            checked={form.maintenanceMode}
            onChange={(e) => setForm({ ...form, maintenanceMode: e.target.checked })}
          />
          <span>Enable Maintenance Mode</span>
        </label>
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(form.debugMode)}
            onChange={(e) => setForm({ ...form, debugMode: e.target.checked })}
          />
          <span>Debug Diagnostics Mode</span>
        </label>
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(form.errorAlertAdmin)}
            onChange={(e) => setForm({ ...form, errorAlertAdmin: e.target.checked })}
          />
          <span>Error Alerts to Admin</span>
        </label>
      </div>

      <div>
        <label className={labelCls}>Maintenance Notice Displayed to Blocked Users</label>
        <input
          value={form.maintenanceMessage}
          onChange={(e) => setForm({ ...form, maintenanceMessage: e.target.value })}
          className={inputCls}
        />
      </div>

      <div className="text-xs font-mono text-neutral-500">
        Last System Health Check: {form.lastHealthCheckAt ? formatDateTimeIST(form.lastHealthCheckAt) : 'Active'}
      </div>
    </div>
  );
};

export const SettingsHistoryPanel: React.FC<{ history: SettingsHistoryEntry[] }> = ({ history }) => {
  const [query, setQuery] = useState('');
  const filtered = history.filter((h) => {
    const q = query.trim().toLowerCase();
    return (
      !q ||
      h.settingModule.toLowerCase().includes(q) ||
      h.settingName.toLowerCase().includes(q) ||
      h.changedBy.toLowerCase().includes(q)
    );
  });

  return (
    <div className={cardCls}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 dark:border-neutral-800 pb-3">
        <div>
          <h3 className="text-sm font-semibold text-neutral-950 dark:text-white">
            Immutable Master Settings Change History
          </h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Tracks Old Value, New Value, Reason, Actor, Approver, and IST Timestamp.
          </p>
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter module, setting, actor..."
          className="h-8 px-3 text-xs bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded-md w-60"
        />
      </div>

      <div className="divide-y divide-neutral-100 dark:divide-neutral-800 text-xs">
        {filtered.map((h) => (
          <div key={h.id} className="py-2.5 space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-neutral-950 dark:text-white">
                {h.settingModule} · {h.settingName}
              </span>
              <span className="font-mono text-[11px] text-neutral-500">
                {formatDateTimeIST(h.createdAt)} · Actor {h.changedBy}
                {h.approvedBy ? ` · Approved ${h.approvedBy}` : ''}
              </span>
            </div>
            <div className="font-mono text-[11px] text-neutral-600 dark:text-neutral-300">
              {h.oldValue} → {h.newValue} <span className="text-neutral-400">({h.changeReason})</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
