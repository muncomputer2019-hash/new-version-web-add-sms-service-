import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  X,
  Copy,
  Check,
  Download,
} from 'lucide-react';
import { Button } from './Button';
import { securityRequest } from '../services/securityApi';

interface GoogleAuthenticatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail: string;
  userId: string;
  onShowToast: (
    type: 'success' | 'error' | 'info',
    title: string,
    description?: string
  ) => void;
  onSuccess?: () => void;
}

export const GoogleAuthenticatorModal: React.FC<GoogleAuthenticatorModalProps> = ({
  isOpen,
  onClose,
  userEmail,
  userId,
  onShowToast,
  onSuccess,
}) => {
  const [secret, setSecret] = useState<string>('');
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [verificationCode, setVerificationCode] = useState<string>('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [isVerified, setIsVerified] = useState<boolean>(false);
  const [loadingSetup, setLoadingSetup] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    setLoadingSetup(true);
    setVerificationCode('');
    setRecoveryCodes([]);
    setIsVerified(false);
    setCopied(false);
    setError(null);

    securityRequest<{
      qrCodeDataUrl: string;
      manualSecret: string;
      issuer: string;
      accountLabel: string;
    }>('/api/auth/totp/setup', { method: 'POST', body: '{}' })
      .then((res) => {
        if (!active) return;
        setSecret(res.data.manualSecret);
        setQrCodeDataUrl(res.data.qrCodeDataUrl);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unable to generate authenticator setup.');
      })
      .finally(() => {
        if (active) setLoadingSetup(false);
      });

    return () => {
      active = false;
    };
  }, [isOpen, userEmail, userId]);

  if (!isOpen) return null;

  const handleCopySecret = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      onShowToast('info', 'Setup Key Copied', 'Paste the Base32 key into Google Authenticator.');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onShowToast('info', 'Manual Copy', 'Select the Base32 key text to copy it manually.');
    }
  };

  const handleVerifyAndEnable = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanCode = verificationCode.trim();
    if (!/^\d{6}$/.test(cleanCode)) {
      setError('Please enter a valid 6-digit verification code from Google Authenticator.');
      return;
    }

    setLoading(true);
    try {
      const res = await securityRequest<{
        totpEnabled: boolean;
        recoveryCodes?: string[];
      }>('/api/auth/totp/confirm-setup', {
        method: 'POST',
        body: JSON.stringify({ secret, code: cleanCode }),
      });

      setRecoveryCodes(res.data.recoveryCodes || []);
      setIsVerified(true);
      onShowToast(
        'success',
        'Google Authenticator Enabled',
        'Save your single-use recovery codes in a secure location.'
      );
      if (onSuccess) onSuccess();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Verification error.';
      setError(message);
      onShowToast('error', 'Setup Failed', message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadRecovery = () => {
    if (!recoveryCodes.length) return;
    const content = [
      'MUN COMPUTER ERP — RECOVERY CODES',
      `User: ${userId}`,
      `Date: ${new Date().toISOString()}`,
      '',
      ...recoveryCodes.map((c, idx) => `${idx + 1}. ${c}`),
    ].join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MUN_Recovery_Codes_${userId}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-lg">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-neutral-950 dark:text-white">
                Google Authenticator (TOTP)
              </h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Server-encrypted TOTP setup &amp; recovery codes
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 rounded-lg text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {isVerified ? (
            <div className="space-y-4">
              <div className="text-center space-y-2">
                <div className="inline-flex p-2.5 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-full">
                  <CheckCircle2 className="h-7 w-7" />
                </div>
                <h3 className="text-base font-semibold text-neutral-950 dark:text-white">
                  Google Authenticator Linked
                </h3>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Save these 8 single-use recovery codes now. They will not be shown again.
                </p>
              </div>
              {recoveryCodes.length > 0 && (
                <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 font-mono text-xs font-bold text-center">
                  {recoveryCodes.map((c) => (
                    <div key={c} className="py-1.5 bg-white dark:bg-neutral-900 rounded border border-neutral-200 dark:border-neutral-800 select-all">
                      {c}
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-end gap-2">
                {recoveryCodes.length > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleDownloadRecovery}
                    icon={<Download className="h-4 w-4" />}
                  >
                    Download .TXT
                  </Button>
                )}
                <Button type="button" variant="primary" onClick={onClose}>
                  Done
                </Button>
              </div>
            </div>
          ) : loadingSetup ? (
            <div className="py-10 text-center text-xs text-neutral-500">
              Generating encrypted TOTP secret &amp; QR code...
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <span className="text-xs font-medium text-neutral-800 dark:text-neutral-200 block">
                  Step 1: Scan QR Code in Google Authenticator
                </span>
                <div className="p-4 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl text-center space-y-3">
                  {qrCodeDataUrl && (
                    <div className="inline-block p-2 bg-white rounded-lg border border-neutral-200">
                      <img src={qrCodeDataUrl} alt="TOTP QR Code" className="w-40 h-40 mx-auto" />
                    </div>
                  )}

                  <div className="space-y-1.5 text-left">
                    <span className="text-[11px] text-neutral-500 block">Manual Setup Key (Base32):</span>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 font-mono text-xs font-bold text-blue-800 dark:text-blue-400 bg-white dark:bg-neutral-900 py-1.5 px-3 rounded border border-neutral-200 dark:border-neutral-800 select-all truncate">
                        {secret}
                      </div>
                      <button
                        type="button"
                        onClick={handleCopySecret}
                        className="inline-flex items-center gap-1 h-8 px-2.5 text-xs font-medium rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-200 cursor-pointer shrink-0"
                      >
                        {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                        <span>{copied ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <form onSubmit={handleVerifyAndEnable} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-800 dark:text-neutral-200 mb-1.5">
                    Step 2: Enter 6-digit Code from Authenticator App
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    className="w-full h-11 px-3 text-center text-lg tracking-[0.4em] font-mono bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:outline-none focus:border-blue-600"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <Button type="button" variant="ghost" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary" loading={loading}>
                    Verify &amp; Activate
                  </Button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
