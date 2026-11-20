import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  MessageSquareText,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  User,
} from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { Button } from '../components/Button';
import { BRAND } from '../assets/brand';
import { securityRequest, setAuthToken, setCsrfToken } from '../services/securityApi';
import { UserProfile } from '../modules/types';

type AuthStep =
  | 'credentials'
  | 'captcha'
  | 'sms-otp'
  | 'totp'
  | 'recovery-codes-backup'
  | 'forgot-password'
  | 'reset-password';

interface CaptchaData {
  provider: 'svg' | 'turnstile' | 'recaptcha';
  siteKey?: string;
  challengeId: string;
  svg: string;
  questionHint: string;
}

interface PendingSessionPayload {
  user: UserProfile;
  permissions: Record<string, boolean>;
  csrfToken: string;
  recoveryCodes?: string[];
  session: {
    expiresAt: string;
    rememberMe?: boolean;
  };
}

interface LoginPageProps {
  onLoginSuccess: (
    user: UserProfile,
    permissions: Record<string, boolean>,
    sessionMeta?: { expiresAt?: string; rememberMe?: boolean }
  ) => void;
  onShowToast: (
    type: 'success' | 'error' | 'info',
    title: string,
    description?: string
  ) => void;
}

const STEP_LABELS = [
  { key: 'credentials', num: 1, title: 'Credentials' },
  { key: 'captcha', num: 2, title: 'CAPTCHA' },
  { key: 'sms-otp', num: 3, title: 'OTP' },
  { key: 'totp', num: 4, title: 'Authenticator' },
] as const;

export const LoginPage: React.FC<LoginPageProps> = ({
  onLoginSuccess,
  onShowToast,
}) => {
  const [step, setStep] = useState<AuthStep>('credentials');

  // Layer 1: Credentials
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Challenge token bound across all 4 layers
  const [challengeId, setChallengeId] = useState('');

  // Layer 2: CAPTCHA
  const [captchaData, setCaptchaData] = useState<CaptchaData | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');

  // Layer 3: Fast2SMS OTP
  const [maskedMobile, setMaskedMobile] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpDeliveryDetail, setOtpDeliveryDetail] = useState('');
  const [sandboxOtp, setSandboxOtp] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Layer 4: Google Authenticator (TOTP) & Recovery
  const [requiresTotpSetup, setRequiresTotpSetup] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const [manualSecret, setManualSecret] = useState('');
  const [accountLabel, setAccountLabel] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [useRecoveryMode, setUseRecoveryMode] = useState(false);
  const [recoveryCodeInput, setRecoveryCodeInput] = useState('');
  const [secretCopied, setSecretCopied] = useState(false);
  const [issuedRecoveryCodes, setIssuedRecoveryCodes] = useState<string[]>([]);
  const [pendingFinalSession, setPendingFinalSession] = useState<PendingSessionPayload | null>(null);

  // Forgot & Reset Password State
  const [resetUserId, setResetUserId] = useState('');
  const [resetChallengeId, setResetChallengeId] = useState('');
  const [resetMaskedMobile, setResetMaskedMobile] = useState('');
  const [resetTotpRequired, setResetTotpRequired] = useState(false);
  const [resetOtp, setResetOtp] = useState('');
  const [resetTotpCode, setResetTotpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const stepSubmitLockRef = useRef(false);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const resetToStep1 = () => {
    setErrorBanner(null);
    setChallengeId('');
    setCaptchaData(null);
    setCaptchaAnswer('');
    setOtpCode('');
    setSandboxOtp(null);
    setTotpCode('');
    setRecoveryCodeInput('');
    setUseRecoveryMode(false);
    setRequiresTotpSetup(false);
    setQrCodeDataUrl('');
    setManualSecret('');
    setPendingFinalSession(null);
    setIssuedRecoveryCodes([]);
    setStep('credentials');
  };

  // STEP 1 HANDLER: User ID + Password
  const handleStep1Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (stepSubmitLockRef.current || loading) return;
    setErrorBanner(null);

    const cleanId = userId.trim();
    if (!cleanId) {
      setErrorBanner('Enter your assigned User ID.');
      return;
    }
    if (!password) {
      setErrorBanner('Enter your password.');
      return;
    }

    stepSubmitLockRef.current = true;
    setLoading(true);
    try {
      const res = await securityRequest<{
        challengeId: string;
        nextStep: 'CAPTCHA';
        userId: string;
        captcha: CaptchaData;
      }>('/api/auth/login-credentials', {
        method: 'POST',
        body: JSON.stringify({
          userId: cleanId,
          password,
          rememberMe,
        }),
      });

      setChallengeId(res.data.challengeId);
      setCaptchaData(res.data.captcha);
      setCaptchaAnswer('');
      setStep('captcha');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to verify credentials.';
      setErrorBanner(msg);
      onShowToast('error', 'Step 1 Failed', msg);
    } finally {
      stepSubmitLockRef.current = false;
      setLoading(false);
    }
  };

  const handleRefreshCaptcha = async (preserveError = false) => {
    if (stepSubmitLockRef.current) return;
    if (!preserveError) {
      setErrorBanner(null);
    }
    try {
      const res = await securityRequest<CaptchaData>('/api/auth/captcha');
      setCaptchaData(res.data);
      setCaptchaAnswer('');
    } catch (err) {
      if (!preserveError) {
        setErrorBanner(err instanceof Error ? err.message : 'Unable to refresh CAPTCHA.');
      }
    }
  };

  // STEP 2 HANDLER: CAPTCHA -> Dispatches Fast2SMS OTP
  const handleStep2Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (stepSubmitLockRef.current || loading) return;
    setErrorBanner(null);
    const cleanedAnswer = captchaAnswer.replace(/\s+/g, '').toUpperCase();
    if (!cleanedAnswer) {
      setErrorBanner('Enter the verification characters shown in the CAPTCHA image.');
      return;
    }

    stepSubmitLockRef.current = true;
    setLoading(true);
    try {
      const res = await securityRequest<{
        challengeId: string;
        nextStep: 'SMS_OTP';
        maskedMobile: string;
        resendCooldownSeconds: number;
        deliveryDetail: string;
        sandboxOtpPreview?: string;
      }>('/api/auth/verify-captcha', {
        method: 'POST',
        body: JSON.stringify({
          challengeId,
          captchaId: captchaData?.challengeId,
          captchaAnswer: cleanedAnswer,
        }),
      });

      setMaskedMobile(res.data.maskedMobile);
      setOtpDeliveryDetail(res.data.deliveryDetail);
      setSandboxOtp(res.data.sandboxOtpPreview || null);
      setResendCooldown(res.data.resendCooldownSeconds || 30);
      setOtpCode('');
      setStep('sms-otp');
      onShowToast('info', 'CAPTCHA Passed', `SMS OTP dispatched to ${res.data.maskedMobile}`);
    } catch (err) {
      const eObj = err as Error & { data?: { captcha?: CaptchaData } };
      if (eObj.data?.captcha) {
        setCaptchaData(eObj.data.captcha);
        setCaptchaAnswer('');
      } else {
        stepSubmitLockRef.current = false;
        void handleRefreshCaptcha(true);
      }
      const msg = err instanceof Error ? err.message : 'CAPTCHA verification failed.';
      setErrorBanner(msg);
      onShowToast('error', 'Step 2 Failed', msg);
    } finally {
      stepSubmitLockRef.current = false;
      setLoading(false);
    }
  };

  const handleResendSmsOtp = async () => {
    if (resendCooldown > 0) return;
    setErrorBanner(null);
    setLoading(true);
    try {
      const res = await securityRequest<{
        resendCooldownSeconds: number;
        deliveryDetail: string;
        sandboxOtpPreview?: string;
      }>('/api/auth/resend-otp', {
        method: 'POST',
        body: JSON.stringify({ challengeId }),
      });
      setResendCooldown(res.data.resendCooldownSeconds || 30);
      setOtpDeliveryDetail(res.data.deliveryDetail);
      setSandboxOtp(res.data.sandboxOtpPreview || null);
      onShowToast('info', 'OTP Resent', 'A fresh 6-digit SMS OTP has been dispatched.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to resend OTP.';
      setErrorBanner(msg);
      onShowToast('error', 'Resend Blocked', msg);
    } finally {
      setLoading(false);
    }
  };

  // STEP 3 HANDLER: Fast2SMS OTP Verification -> Advances to Step 4 TOTP
  const handleStep3Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);
    const cleanOtp = otpCode.trim();
    if (!/^\d{6}$/.test(cleanOtp)) {
      setErrorBanner('Enter the 6-digit SMS OTP sent to your registered mobile.');
      return;
    }

    setLoading(true);
    try {
      const res = await securityRequest<{
        challengeId: string;
        nextStep: 'TOTP';
        requiresSetup: boolean;
        totpEnabled: boolean;
        accountLabel: string;
        qrCodeDataUrl?: string;
        manualSecret?: string;
      }>('/api/auth/verify-sms-otp', {
        method: 'POST',
        body: JSON.stringify({ challengeId, otp: cleanOtp }),
      });

      setRequiresTotpSetup(Boolean(res.data.requiresSetup));
      setQrCodeDataUrl(res.data.qrCodeDataUrl || '');
      setManualSecret(res.data.manualSecret || '');
      setAccountLabel(res.data.accountLabel || userId);
      setTotpCode('');
      setRecoveryCodeInput('');
      setUseRecoveryMode(false);
      setStep('totp');
      onShowToast(
        'info',
        'SMS OTP Verified',
        res.data.requiresSetup
          ? 'Scan the QR code in Google Authenticator to complete Step 4 setup.'
          : 'Enter your 6-digit Google Authenticator code.'
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'SMS OTP verification failed.';
      setErrorBanner(msg);
      onShowToast('error', 'Step 3 Failed', msg);
    } finally {
      setLoading(false);
    }
  };

  // STEP 4 HANDLER: Google Authenticator (TOTP) or Single-Use Recovery Code -> Issues Session Cookies
  const handleStep4Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);

    if (useRecoveryMode) {
      if (!recoveryCodeInput.trim()) {
        setErrorBanner('Enter one of your unused 8-character recovery codes.');
        return;
      }
    } else if (!/^\d{6}$/.test(totpCode.trim())) {
      setErrorBanner('Enter the 6-digit verification code from Google Authenticator.');
      return;
    }

    setLoading(true);
    try {
      const res = await securityRequest<{
        user: Omit<UserProfile, 'avatarInitials'>;
        permissions: Record<string, boolean>;
        csrfToken: string;
        accessToken?: string;
        recoveryCodes?: string[];
        session: {
          expiresAt: string;
          rememberMe?: boolean;
        };
      }>('/api/auth/verify-totp', {
        method: 'POST',
        body: JSON.stringify({
          challengeId,
          ...(useRecoveryMode
            ? { recoveryCode: recoveryCodeInput.trim() }
            : { code: totpCode.trim() }),
        }),
      });

      setCsrfToken(res.data.csrfToken);
      if (res.data.accessToken) {
        setAuthToken(res.data.accessToken);
      }
      const initials = res.data.user.fullName
        .split(' ')
        .map((p) => p[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();
      const loadedUser: UserProfile = {
        ...res.data.user,
        avatarInitials: initials || 'MC',
      };

      const sessionPayload: PendingSessionPayload = {
        user: loadedUser,
        permissions: res.data.permissions,
        csrfToken: res.data.csrfToken,
        recoveryCodes: res.data.recoveryCodes,
        session: res.data.session,
      };

      if (res.data.recoveryCodes && res.data.recoveryCodes.length > 0) {
        setIssuedRecoveryCodes(res.data.recoveryCodes);
        setPendingFinalSession(sessionPayload);
        setStep('recovery-codes-backup');
        onShowToast(
          'success',
          'Authenticator Linked',
          'Download or save your 8 backup recovery codes before entering.'
        );
      } else {
        onShowToast('success', 'Welcome Back', `Signed in as ${loadedUser.fullName}`);
        onLoginSuccess(loadedUser, res.data.permissions, res.data.session);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google Authenticator verification failed.';
      setErrorBanner(msg);
      onShowToast('error', 'Step 4 Failed', msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyManualSecret = async () => {
    if (!manualSecret) return;
    try {
      await navigator.clipboard.writeText(manualSecret);
      setSecretCopied(true);
      onShowToast('info', 'Setup Key Copied', 'Paste the Base32 secret into Google Authenticator.');
      setTimeout(() => setSecretCopied(false), 2000);
    } catch {
      onShowToast('info', 'Copy Key', 'Select the manual setup key text to copy.');
    }
  };

  const handleDownloadRecoveryCodes = () => {
    if (!issuedRecoveryCodes.length) return;
    const text = [
      'MUN COMPUTER ERP — SINGLE-USE TOTP RECOVERY CODES',
      `Account: ${pendingFinalSession?.user.userId || userId}`,
      `Generated: ${new Date().toISOString()}`,
      '',
      'Store these codes in a secure password manager or offline safe.',
      'Each code can only be used ONCE if you lose access to Google Authenticator:',
      '',
      ...issuedRecoveryCodes.map((c, idx) => `${idx + 1}. ${c}`),
    ].join('\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MUN_Recovery_Codes_${pendingFinalSession?.user.userId || 'User'}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleFinishRecoveryBackup = () => {
    if (!pendingFinalSession) return;
    onShowToast(
      'success',
      '4-Layer Authentication Complete',
      `Signed in as ${pendingFinalSession.user.fullName}`
    );
    onLoginSuccess(
      pendingFinalSession.user,
      pendingFinalSession.permissions,
      pendingFinalSession.session
    );
  };

  // FORGOT / RESET PASSWORD HANDLERS
  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);
    if (!resetUserId.trim()) {
      setErrorBanner('Enter your MUN COMPUTER User ID.');
      return;
    }
    setLoading(true);
    try {
      const res = await securityRequest<{
        challengeId: string;
        maskedMobile: string;
        totpRequired: boolean;
        sandboxOtpPreview?: string;
      }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ userId: resetUserId.trim() }),
      });
      setResetChallengeId(res.data.challengeId);
      setResetMaskedMobile(res.data.maskedMobile);
      setResetTotpRequired(Boolean(res.data.totpRequired));
      setSandboxOtp(res.data.sandboxOtpPreview || null);
      setStep('reset-password');
      onShowToast('info', 'Reset OTP Sent', `OTP dispatched to ${res.data.maskedMobile}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to start password reset.';
      setErrorBanner(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);
    setLoading(true);
    try {
      await securityRequest('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          challengeId: resetChallengeId,
          otp: resetOtp.trim(),
          ...(resetTotpRequired && resetTotpCode ? { totpCode: resetTotpCode.trim() } : {}),
          newPassword,
          confirmPassword: newPassword === confirmNewPassword ? confirmNewPassword : confirmNewPassword,
        }),
      });
      onShowToast('success', 'Password Reset Complete', 'Sign in using your new password.');
      setUserId(resetUserId.trim());
      setPassword('');
      setResetOtp('');
      setResetTotpCode('');
      setNewPassword('');
      setConfirmNewPassword('');
      setSandboxOtp(null);
      setStep('credentials');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Password reset failed.';
      setErrorBanner(msg);
    } finally {
      setLoading(false);
    }
  };

  const currentStepNum =
    step === 'credentials'
      ? 1
      : step === 'captcha'
        ? 2
        : step === 'sms-otp'
          ? 3
          : step === 'totp' || step === 'recovery-codes-backup'
            ? 4
            : 0;

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <BrandLogo size="lg" className="justify-center" />
        </div>
        <h1 className="mt-5 text-center text-2xl font-bold tracking-tight text-neutral-950 dark:text-white">
          Authenticated Portal
        </h1>

        {currentStepNum > 0 && (
          <div className="mt-6 grid grid-cols-4 gap-1.5" aria-label="4-layer authentication progress">
            {STEP_LABELS.map((item) => {
              const done = currentStepNum > item.num;
              const active = currentStepNum === item.num;
              return (
                <div
                  key={item.key}
                  className={`rounded-lg px-2 py-2 text-center border transition-colors ${
                    active
                      ? 'bg-neutral-950 text-white border-neutral-950 dark:bg-white dark:text-neutral-950 dark:border-white'
                      : done
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                        : 'bg-white text-neutral-400 border-neutral-200 dark:bg-neutral-900 dark:text-neutral-500 dark:border-neutral-800'
                  }`}
                >
                  <div className="text-[10px] font-bold">
                    {done ? '✓' : `0${item.num}`}
                  </div>
                  <div className="text-[10px] font-medium truncate mt-0.5">{item.title}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl shadow-sm p-6 sm:p-8">
          {errorBanner && (
            <div
              role="alert"
              className="mb-5 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300 flex items-start gap-2"
            >
              <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errorBanner}</span>
            </div>
          )}

          {/* STEP 1: USER ID & PASSWORD */}
          {step === 'credentials' && (
            <form onSubmit={handleStep1Submit} className="space-y-4">
              <div>
                <h2 className="text-base font-semibold text-neutral-950 dark:text-white">
                  Step 1: Account Credentials
                </h2>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                  Verify your User ID and bcrypt-protected password to unlock CAPTCHA.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                  User ID or Registered Email
                </label>
                <div className="relative">
                  <User className="h-4 w-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    autoComplete="username"
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    placeholder="e.g. MC2627110001"
                    className="w-full h-10 pl-9 pr-3 text-sm bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:outline-none focus:border-neutral-950 dark:focus:border-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="h-4 w-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full h-10 pl-9 pr-10 text-sm bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:outline-none focus:border-neutral-950 dark:focus:border-white"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <label className="inline-flex items-center gap-2 text-neutral-600 dark:text-neutral-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="rounded border-neutral-300 dark:border-neutral-700"
                  />
                  <span>Remember session (up to 4 hrs)</span>
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setErrorBanner(null);
                    setResetUserId(userId);
                    setStep('forgot-password');
                  }}
                  className="font-medium text-neutral-700 dark:text-neutral-300 hover:underline cursor-pointer"
                >
                  Forgot Password?
                </button>
              </div>

              <Button
                type="submit"
                variant="primary"
                className="w-full justify-center"
                loading={loading}
                iconRight={<ArrowRight className="h-4 w-4" />}
              >
                Verify Credentials &amp; Continue
              </Button>
            </form>
          )}

          {/* STEP 2: SERVER CAPTCHA */}
          {step === 'captcha' && captchaData && (
            <form onSubmit={handleStep2Submit} className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-neutral-950 dark:text-white">
                    Step 2: CAPTCHA
                  </h2>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                    Solve the security challenge to dispatch your SMS OTP.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={resetToStep1}
                  className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white inline-flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back
                </button>
              </div>

              <div className="p-4 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div
                    className="rounded border border-neutral-200 dark:border-neutral-700 overflow-hidden bg-white"
                    dangerouslySetInnerHTML={{ __html: captchaData.svg }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={loading}
                    onClick={() => void handleRefreshCaptcha(false)}
                    icon={<RefreshCw className="h-3.5 w-3.5" />}
                  >
                    New Code
                  </Button>
                </div>
                <input
                  type="text"
                  required
                  autoFocus
                  maxLength={8}
                  value={captchaAnswer}
                  onChange={(e) => setCaptchaAnswer(e.target.value.replace(/\s+/g, '').toUpperCase())}
                  placeholder={captchaData.questionHint || 'Enter CAPTCHA code'}
                  className="w-full h-10 px-3 text-center text-base tracking-[0.25em] font-mono uppercase bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:outline-none focus:border-neutral-950 dark:focus:border-white"
                />
              </div>

              <Button
                type="submit"
                variant="primary"
                className="w-full justify-center"
                loading={loading}
                iconRight={<ArrowRight className="h-4 w-4" />}
              >
                Verify CAPTCHA &amp; Send SMS OTP
              </Button>
            </form>
          )}

          {/* STEP 3: FAST2SMS OTP */}
          {step === 'sms-otp' && (
            <form onSubmit={handleStep3Submit} className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-neutral-950 dark:text-white">
                    Step 3: OTP Verification
                  </h2>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                    Sent to registered mobile <span className="font-mono font-medium">{maskedMobile}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={resetToStep1}
                  className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white inline-flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Restart
                </button>
              </div>

              {otpDeliveryDetail && (
                <div className="p-2.5 rounded-lg bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 text-[11px] text-neutral-600 dark:text-neutral-300 flex items-center gap-2">
                  <MessageSquareText className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span>{otpDeliveryDetail}</span>
                </div>
              )}

              {sandboxOtp && (
                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200">
                  Non-Production Sandbox OTP Preview:{' '}
                  <span className="font-mono font-bold tracking-widest">{sandboxOtp}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                  6-Digit SMS OTP
                </label>
                <div className="relative">
                  <Smartphone className="h-4 w-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    autoFocus
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    className="w-full h-11 pl-9 pr-3 text-center text-lg tracking-[0.4em] font-mono bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:outline-none focus:border-neutral-950 dark:focus:border-white"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-neutral-500">Valid for 5 minutes</span>
                <button
                  type="button"
                  disabled={resendCooldown > 0 || loading}
                  onClick={handleResendSmsOtp}
                  className="font-medium text-neutral-900 dark:text-white disabled:text-neutral-400 hover:underline cursor-pointer disabled:cursor-not-allowed"
                >
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend SMS OTP'}
                </button>
              </div>

              <Button
                type="submit"
                variant="primary"
                className="w-full justify-center"
                loading={loading}
                iconRight={<ArrowRight className="h-4 w-4" />}
              >
                Verify SMS OTP &amp; Proceed to Step 4
              </Button>
            </form>
          )}

          {/* STEP 4: GOOGLE AUTHENTICATOR (TOTP) OR RECOVERY CODE */}
          {step === 'totp' && (
            <form onSubmit={handleStep4Submit} className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-neutral-950 dark:text-white">
                    Step 4: Google Authenticator
                  </h2>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                    {requiresTotpSetup
                      ? 'First-time mandatory authenticator setup'
                      : 'Enter your time-based 6-digit authenticator code'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={resetToStep1}
                  className="text-xs text-neutral-500 hover:text-neutral-900 dark:hover:text-white inline-flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Restart
                </button>
              </div>

              {requiresTotpSetup && (
                <div className="p-4 bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl space-y-3 text-center">
                  <p className="text-xs text-neutral-600 dark:text-neutral-300">
                    Scan with Google Authenticator (<span className="font-mono">{accountLabel}</span>):
                  </p>
                  {qrCodeDataUrl && (
                    <div className="inline-block p-2 bg-white rounded-lg border border-neutral-200">
                      <img
                        src={qrCodeDataUrl}
                        alt="Google Authenticator QR Code"
                        className="w-40 h-40 mx-auto"
                      />
                    </div>
                  )}
                  {manualSecret && (
                    <div className="space-y-1 text-left">
                      <span className="text-[11px] text-neutral-500 block">Manual Setup Key (Base32):</span>
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 font-mono text-[11px] font-bold bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded px-2.5 py-1.5 truncate select-all">
                          {manualSecret}
                        </div>
                        <button
                          type="button"
                          onClick={handleCopyManualSecret}
                          className="h-8 px-2.5 text-xs rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 hover:bg-neutral-100 inline-flex items-center gap-1 cursor-pointer"
                        >
                          {secretCopied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!useRecoveryMode ? (
                <div>
                  <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                    6-Digit Google Authenticator Code
                  </label>
                  <div className="relative">
                    <ShieldCheck className="h-4 w-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      autoFocus
                      maxLength={6}
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="000000"
                      className="w-full h-11 pl-9 pr-3 text-center text-lg tracking-[0.4em] font-mono bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:outline-none focus:border-neutral-950 dark:focus:border-white"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
                    Single-Use Recovery Code
                  </label>
                  <div className="relative">
                    <KeyRound className="h-4 w-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      autoFocus
                      maxLength={12}
                      value={recoveryCodeInput}
                      onChange={(e) => setRecoveryCodeInput(e.target.value.toUpperCase())}
                      placeholder="XXXX-XXXX"
                      className="w-full h-11 pl-9 pr-3 text-center text-base tracking-[0.2em] font-mono uppercase bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded-lg focus:outline-none focus:border-neutral-950 dark:focus:border-white"
                    />
                  </div>
                </div>
              )}

              {!requiresTotpSetup && (
                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => {
                      setErrorBanner(null);
                      setUseRecoveryMode((prev) => !prev);
                    }}
                    className="text-xs font-medium text-neutral-600 dark:text-neutral-300 hover:underline cursor-pointer"
                  >
                    {useRecoveryMode
                      ? 'Use 6-digit Authenticator Code instead'
                      : 'Lost device? Use a Recovery Code'}
                  </button>
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                className="w-full justify-center"
                loading={loading}
                iconRight={<CheckCircle2 className="h-4 w-4" />}
              >
                {requiresTotpSetup ? 'Activate Authenticator & Sign In' : 'Verify & Open Dashboard'}
              </Button>
            </form>
          )}

          {/* STEP 4B: RECOVERY CODES ONE-TIME DOWNLOAD SCREEN */}
          {step === 'recovery-codes-backup' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                <h2 className="text-base font-semibold">Save Your Single-Use Recovery Codes</h2>
              </div>
              <p className="text-xs text-neutral-600 dark:text-neutral-300">
                Google Authenticator is now linked. These 8 recovery codes are shown only once—download them in case you lose your authenticator phone.
              </p>

              <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 font-mono text-xs font-semibold text-center">
                {issuedRecoveryCodes.map((code) => (
                  <div
                    key={code}
                    className="py-1.5 px-2 rounded bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 select-all"
                  >
                    {code}
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 justify-center"
                  onClick={handleDownloadRecoveryCodes}
                  icon={<Download className="h-4 w-4" />}
                >
                  Download .TXT
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  className="flex-1 justify-center"
                  onClick={handleFinishRecoveryBackup}
                  iconRight={<ArrowRight className="h-4 w-4" />}
                >
                  Continue to ERP
                </Button>
              </div>
            </div>
          )}

          {/* FORGOT PASSWORD */}
          {step === 'forgot-password' && (
            <form onSubmit={handleForgotSubmit} className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-neutral-950 dark:text-white">
                  Reset Password
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setErrorBanner(null);
                    setStep('credentials');
                  }}
                  className="text-xs text-neutral-500 hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back
                </button>
              </div>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Receive an SMS OTP on your registered mobile to migrate or reset your password.
              </p>
              <input
                type="text"
                required
                value={resetUserId}
                onChange={(e) => setResetUserId(e.target.value)}
                placeholder="Enter User ID or Email"
                className="w-full h-10 px-3 text-sm bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded-lg"
              />
              <Button type="submit" variant="primary" className="w-full justify-center" loading={loading}>
                Send Password Reset OTP
              </Button>
            </form>
          )}

          {/* RESET PASSWORD */}
          {step === 'reset-password' && (
            <form onSubmit={handleResetPasswordSubmit} className="space-y-3.5">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-neutral-950 dark:text-white">
                  Complete Password Reset
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setErrorBanner(null);
                    setStep('credentials');
                  }}
                  className="text-xs text-neutral-500 hover:underline cursor-pointer"
                >
                  Cancel
                </button>
              </div>
              <p className="text-xs text-neutral-500">
                OTP sent to <span className="font-mono">{resetMaskedMobile}</span>
              </p>
              {sandboxOtp && (
                <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 text-xs text-amber-800 dark:text-amber-200">
                  Sandbox OTP Preview: <span className="font-mono font-bold">{sandboxOtp}</span>
                </div>
              )}
              <input
                type="text"
                required
                maxLength={6}
                value={resetOtp}
                onChange={(e) => setResetOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="6-digit SMS OTP"
                className="w-full h-10 px-3 text-sm font-mono bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded-lg"
              />
              {resetTotpRequired && (
                <input
                  type="text"
                  maxLength={6}
                  value={resetTotpCode}
                  onChange={(e) => setResetTotpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="6-digit Authenticator Code (if enrolled)"
                  className="w-full h-10 px-3 text-sm font-mono bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded-lg"
                />
              )}
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New strong password (12+ chars, A-Z, a-z, 0-9, symbol)"
                className="w-full h-10 px-3 text-sm bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded-lg"
              />
              <input
                type="password"
                required
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                placeholder="Confirm new password"
                className="w-full h-10 px-3 text-sm bg-white dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-700 rounded-lg"
              />
              <Button type="submit" variant="primary" className="w-full justify-center" loading={loading}>
                Save Password &amp; Revoke Old Sessions
              </Button>
            </form>
          )}
        </div>

        <footer className="mt-6 text-center text-[11px] text-neutral-500 dark:text-neutral-400 space-y-1">
          <p>{BRAND.copyright} All rights reserved.</p>
          <p className="font-mono tabular-nums">
            v{BRAND.version} · Updated {BRAND.builtAtLabel}
          </p>
        </footer>
      </div>
    </div>
  );
};
