import { Express, NextFunction, Request, Response } from 'express';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import {
  decryptSensitiveField,
  decryptTotpSecret,
  encryptSensitiveField,
  encryptTotpSecret,
  generateNumericOtp,
  generateRecoveryCodes,
  generateToken,
  hashPassword,
  hashRecoveryCode,
  hmacOtp,
  sanitizeText,
  sha256,
  verifyPassword,
  verifyTimingSafeHex,
} from './crypto';
import { getCaptchaConfig, issueSvgCaptcha, verifyServerCaptcha } from './captchaService';
import {
  isFast2SmsConfigured,
  isSandboxOtpAllowed,
  sendFast2SmsOtp,
} from './fast2smsService';
import {
  isFirebaseAdminActive,
  removeAuthChallengeFromFirebase,
  syncAuthChallengeToFirebase,
  syncSessionRecordToFirebase,
  syncUserRecordToFirebase,
} from './firebaseAdminDb';
import { MAX_REMEMBER_ME_MS, SecurityStore } from './securityStore';
import { Phase03Store } from './phase03Store';
import { Phase08Store } from './phase08/phase08Store';
import { parsePrivacyDeviceMetadata } from './phase08/phase08Crypto';
import { AuthChallenge, AuthChallengeStage, ModuleKey, PermissionType, ServerSession, ServerUser } from './types';

export interface AuthedRequest extends Request {
  authUser?: ServerUser;
  authSession?: ServerSession;
}

export interface AuthRoutesDeps {
  app: Express;
  store: SecurityStore;
  phase03Store: Phase03Store;
  phase08Store: Phase08Store;
  authRateLimiter: (req: Request, res: Response, next: NextFunction) => void;
  requireAuth: (req: AuthedRequest, res: Response, next: NextFunction) => void;
  requirePermission: (
    mod: ModuleKey,
    perm: PermissionType
  ) => (req: AuthedRequest, res: Response, next: NextFunction) => void;
  setSessionCookies: (res: Response, rawToken: string, csrfToken: string, maxAgeMs: number) => void;
  clearSessionCookies: (res: Response) => void;
  getClientIp: (req: Request) => string;
  getDeviceInfo: (req: Request) => string;
  apiSuccess: (res: Response, data: unknown, message?: string, status?: number) => Response;
  apiError: (
    res: Response,
    message: string,
    status?: number,
    errors?: Record<string, string[]>
  ) => Response;
  validateStrongPassword: (password: unknown) => string | null;
}

const CHALLENGE_TTL_MS = 15 * 60_000;

function createTotpInstance(user: ServerUser, base32Secret: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: 'MUN COMPUTER',
    label: user.email || user.userId,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(base32Secret),
  });
}

export function registerAuthRoutes(deps: AuthRoutesDeps): void {
  const {
    app,
    store,
    phase03Store,
    phase08Store,
    authRateLimiter,
    requireAuth,
    requirePermission,
    setSessionCookies,
    clearSessionCookies,
    getClientIp,
    getDeviceInfo,
    apiSuccess,
    apiError,
    validateStrongPassword,
  } = deps;

  const loadValidChallenge = (
    challengeId: unknown,
    expectedStage: AuthChallengeStage,
    req: Request,
    res: Response
  ): AuthChallenge | null => {
    const id = String(challengeId || '').trim();
    if (!id) {
      apiError(res, 'Authentication challenge ID is required.', 422);
      return null;
    }
    let challenge = store.authChallenges.get(id);
    if (!challenge && expectedStage === 'CAPTCHA' && id.startsWith('ch1.')) {
      try {
        const rawEnc = Buffer.from(id.slice(4), 'base64url').toString('utf8');
        const parsed = JSON.parse(decryptSensitiveField(rawEnc)) as {
          u?: string;
          rm?: boolean;
          ua?: string;
          c?: number;
          e?: number;
        };
        if (parsed.u && parsed.ua && parsed.c && parsed.e && parsed.e > Date.now()) {
          challenge = {
            id,
            userId: parsed.u,
            stage: 'CAPTCHA',
            rememberMe: Boolean(parsed.rm),
            ipAddress: getClientIp(req),
            userAgentHash: parsed.ua,
            otpAttempts: 0,
            otpMaxAttempts: 5,
            totpAttempts: 0,
            totpMaxAttempts: 5,
            createdAt: parsed.c,
            expiresAt: parsed.e,
          };
          store.authChallenges.set(id, challenge);
        }
      } catch {
        challenge = undefined;
      }
    }
    if (!challenge) {
      apiError(res, 'Authentication session expired or invalid. Restart login from Step 1.', 401);
      return null;
    }
    if (challenge.expiresAt <= Date.now()) {
      store.authChallenges.delete(id);
      void removeAuthChallengeFromFirebase(id).catch(() => {});
      apiError(res, 'Authentication challenge timed out. Restart login from Step 1.', 401);
      return null;
    }
    if (challenge.stage !== expectedStage) {
      store.addSecurityLog({
        actorUserId: challenge.userId,
        eventType: 'UNAUTHORIZED_ACCESS',
        result: 'BLOCKED',
        ipAddress: getClientIp(req),
        deviceInfo: getDeviceInfo(req),
        summary: `Blocked out-of-order auth step attempt: expected ${challenge.stage}, tried ${expectedStage}.`,
      });
      apiError(
        res,
        `Sequential security violation: current required step is ${challenge.stage}.`,
        403
      );
      return null;
    }
    const uaHash = sha256(getDeviceInfo(req));
    if (challenge.userAgentHash !== uaHash) {
      store.addSecurityLog({
        actorUserId: challenge.userId,
        eventType: 'UNAUTHORIZED_ACCESS',
        result: 'BLOCKED',
        ipAddress: getClientIp(req),
        deviceInfo: getDeviceInfo(req),
        summary: 'Blocked auth challenge reuse from mismatched browser/client User-Agent.',
      });
      apiError(res, 'Client device signature mismatch. Restart sign-in.', 403);
      return null;
    }
    return challenge;
  };

  // Auth Capabilities Config
  app.get('/api/auth/config', (_req, res) => {
    const captcha = getCaptchaConfig();
    return apiSuccess(res, {
      authMode: '4-layer-backend',
      firebaseAuthRemoved: true,
      captchaProvider: captcha.provider,
      captchaSiteKey: captcha.siteKey,
      fast2smsConfigured: isFast2SmsConfigured(),
      sandboxOtpAllowed: isSandboxOtpAllowed(),
      firebasePersistenceActive: isFirebaseAdminActive(),
    });
  });

  // CAPTCHA Challenge Generator
  app.get('/api/auth/captcha', authRateLimiter, (_req, res) => {
    const captchaConfig = getCaptchaConfig();
    const svgChallenge = issueSvgCaptcha(store);
    return apiSuccess(res, {
      provider: captchaConfig.provider,
      siteKey: captchaConfig.siteKey,
      challengeId: svgChallenge.captchaId,
      svg: svgChallenge.svg,
      questionHint: svgChallenge.questionHint,
    });
  });

  // Disable legacy shortcut login endpoint cleanly so 4 layers can NEVER be bypassed
  app.post('/api/auth/login', authRateLimiter, (_req, res) => {
    return apiError(
      res,
      'Legacy single-step login endpoint is disabled. Use sequential 4-layer authentication starting at POST /api/auth/login-credentials.',
      410
    );
  });

  // =========================================================================
  // LAYER 1: USER ID + PASSWORD VERIFICATION
  // =========================================================================
  app.post('/api/auth/login-credentials', authRateLimiter, (req, res) => {
    const { userId, password, rememberMe } = req.body ?? {};
    const rawIdentifier = typeof userId === 'string' ? sanitizeText(userId) : '';

    if (!rawIdentifier || !password || typeof password !== 'string') {
      return apiError(res, 'User ID and Password are required.', 422, {
        ...(!rawIdentifier ? { userId: ['User ID is required.'] } : {}),
        ...(!password ? { password: ['Password is required.'] } : {}),
      });
    }

    const user =
      store.findUserByUserId(rawIdentifier) ||
      store.users.find(
        (u) => u.email && u.email.toLowerCase() === rawIdentifier.toLowerCase()
      );

    // Prevent User ID enumeration while still applying timing-safe failed checks
    if (!user) {
      store.addSecurityLog({
        actorUserId: rawIdentifier,
        eventType: 'LOGIN_FAILED',
        result: 'FAILURE',
        ipAddress: getClientIp(req),
        deviceInfo: getDeviceInfo(req),
        summary: 'Step 1 credentials failed for unknown User ID.',
      });
      return apiError(res, 'Invalid User ID or password.', 401);
    }

    if (user.lockedUntil && user.lockedUntil > Date.now()) {
      const remainingMin = Math.ceil((user.lockedUntil - Date.now()) / 60_000);
      store.addSecurityLog({
        actorUserId: user.userId,
        eventType: 'LOGIN_FAILED',
        result: 'BLOCKED',
        ipAddress: getClientIp(req),
        deviceInfo: getDeviceInfo(req),
        summary: `Blocked Step 1 attempt while account locked (${remainingMin}m remaining).`,
      });
      return apiError(
        res,
        `Account is temporarily locked due to failed login attempts. Try again in ${remainingMin} minute(s) or use password reset.`,
        423
      );
    }

    if (phase03Store.maintenanceSettings.maintenanceMode && user.role !== 'ADMIN') {
      return apiError(
        res,
        phase03Store.maintenanceSettings.maintenanceMessage ||
          'System is in Maintenance Mode. Only Admin sign-in is permitted.',
        503
      );
    }

    if (user.status !== 'ACTIVE') {
      store.addSecurityLog({
        actorUserId: user.userId,
        eventType: 'LOGIN_FAILED',
        result: 'BLOCKED',
        ipAddress: getClientIp(req),
        deviceInfo: getDeviceInfo(req),
        summary: `Blocked Step 1 login attempt for account status: ${user.status}.`,
      });
      return apiError(
        res,
        'Unable to sign in to this account. Contact an Administrator if assistance is needed.',
        403
      );
    }

    if (!verifyPassword(String(password), user.passwordHash)) {
      user.failedLoginAttempts += 1;
      const shouldLock = user.failedLoginAttempts >= store.maxFailedAttempts;
      if (shouldLock) {
        user.lockedUntil = Date.now() + store.lockDurationMs;
        store.addSecurityLog({
          actorUserId: user.userId,
          eventType: 'ACCOUNT_LOCKED',
          result: 'BLOCKED',
          ipAddress: getClientIp(req),
          deviceInfo: getDeviceInfo(req),
          summary: `Account automatically locked after ${user.failedLoginAttempts} consecutive failed attempts.`,
        });
        phase08Store.raiseSecurityAlert({
          category: 'ACCOUNT_LOCKOUT',
          severity: 'HIGH',
          title: `Account Locked: ${user.userId}`,
          description: `Account ${user.userId} locked automatically after ${user.failedLoginAttempts} failed logins from ${getClientIp(req)}.`,
          relatedUserId: user.userId,
        });
      } else {
        store.addSecurityLog({
          actorUserId: user.userId,
          eventType: 'LOGIN_FAILED',
          result: 'FAILURE',
          ipAddress: getClientIp(req),
          deviceInfo: getDeviceInfo(req),
          summary: `Step 1 invalid password (${user.failedLoginAttempts}/${store.maxFailedAttempts}).`,
        });
        if (user.failedLoginAttempts >= 3) {
          phase08Store.raiseSecurityAlert({
            category: 'MULTIPLE_FAILED_LOGINS',
            severity: 'MEDIUM',
            title: `Multiple Failed Logins (${user.failedLoginAttempts}): ${user.userId}`,
            description: `${user.failedLoginAttempts} failed password attempts detected for ${user.userId} (${getClientIp(req)}).`,
            relatedUserId: user.userId,
          });
        }
      }
      void syncUserRecordToFirebase(user).catch(() => {});
      return apiError(
        res,
        shouldLock
          ? 'Account temporarily locked after repeated failed attempts.'
          : 'Invalid User ID or password.',
        shouldLock ? 423 : 401
      );
    }

    // Valid Step 1 credentials -> upgrade legacy scrypt hash seamlessly to bcrypt-12 if needed
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    if (user.passwordHash.startsWith('scrypt$')) {
      user.passwordHash = hashPassword(String(password));
      user.passwordAlgo = 'bcrypt-12';
      user.updatedAt = new Date().toISOString();
    }
    void syncUserRecordToFirebase(user).catch(() => {});

    const now = Date.now();
    const userAgentHash = sha256(getDeviceInfo(req));
    const sealedStep1 = Buffer.from(
      encryptSensitiveField(
        JSON.stringify({
          r: generateToken(8),
          u: user.userId,
          rm: Boolean(rememberMe),
          ua: userAgentHash,
          c: now,
          e: now + CHALLENGE_TTL_MS,
        })
      )
    ).toString('base64url');
    const challengeId = `ch1.${sealedStep1}`;
    const challenge: AuthChallenge = {
      id: challengeId,
      userId: user.userId,
      stage: 'CAPTCHA',
      rememberMe: Boolean(rememberMe),
      ipAddress: getClientIp(req),
      userAgentHash,
      otpAttempts: 0,
      otpMaxAttempts: 5,
      totpAttempts: 0,
      totpMaxAttempts: 5,
      createdAt: now,
      expiresAt: now + CHALLENGE_TTL_MS,
    };
    store.authChallenges.set(challengeId, challenge);
    void syncAuthChallengeToFirebase(challenge).catch(() => {});

    const captchaCfg = getCaptchaConfig();
    const svgChallenge = issueSvgCaptcha(store);

    return apiSuccess(
      res,
      {
        challengeId,
        nextStep: 'CAPTCHA',
        userId: user.userId,
        captcha: {
          provider: captchaCfg.provider,
          siteKey: captchaCfg.siteKey,
          challengeId: svgChallenge.captchaId,
          svg: svgChallenge.svg,
          questionHint: svgChallenge.questionHint,
        },
      },
      'Step 1 verified. Complete Step 2 CAPTCHA verification.'
    );
  });

  // =========================================================================
  // LAYER 2: CAPTCHA VERIFICATION -> TRIGGERS STEP 3 FAST2SMS OTP
  // =========================================================================
  app.post('/api/auth/verify-captcha', authRateLimiter, async (req, res) => {
    const { challengeId, captchaId, captchaAnswer, captchaToken } = req.body ?? {};
    const challenge = loadValidChallenge(challengeId, 'CAPTCHA', req, res);
    if (!challenge) return;

    const user = store.findUserByUserId(challenge.userId);
    if (!user || user.status !== 'ACTIVE') {
      return apiError(res, 'User account is unavailable.', 403);
    }

    const captchaCheck = await verifyServerCaptcha({
      store,
      captchaId,
      captchaAnswer,
      captchaToken,
      remoteIp: getClientIp(req),
    });

    if (!captchaCheck.valid) {
      store.addSecurityLog({
        actorUserId: user.userId,
        eventType: 'CAPTCHA_FAILED',
        result: 'FAILURE',
        ipAddress: getClientIp(req),
        deviceInfo: getDeviceInfo(req),
        summary: `Step 2 CAPTCHA failed: ${captchaCheck.reason}`,
      });
      const freshCaptcha = issueSvgCaptcha(store);
      return res.status(422).json({
        success: false,
        message: captchaCheck.reason || 'Invalid or expired CAPTCHA.',
        data: {
          captcha: {
            provider: getCaptchaConfig().provider,
            siteKey: getCaptchaConfig().siteKey,
            challengeId: freshCaptcha.captchaId,
            svg: freshCaptcha.svg,
            questionHint: freshCaptcha.questionHint,
          },
        },
        meta: { timestamp: new Date().toISOString() },
      });
    }

    // Hourly OTP send rate enforcement
    const oneHourAgo = Date.now() - 3600_000;
    const recentSends = (phase08Store.otpResendWindows.get(user.userId) ?? []).filter(
      (ts) => ts > oneHourAgo
    );
    if (recentSends.length >= phase08Store.settings.otpMaxResendsPerHour) {
      const freshCaptcha = issueSvgCaptcha(store);
      return res.status(429).json({
        success: false,
        message: 'Hourly OTP dispatch limit reached. Try again later.',
        data: {
          captcha: {
            provider: getCaptchaConfig().provider,
            siteKey: getCaptchaConfig().siteKey,
            challengeId: freshCaptcha.captchaId,
            svg: freshCaptcha.svg,
            questionHint: freshCaptcha.questionHint,
          },
        },
        meta: { timestamp: new Date().toISOString() },
      });
    }

    const otp = generateNumericOtp(6);
    const smsResult = await sendFast2SmsOtp({
      mobile: user.mobile,
      otp,
      userId: user.userId,
    });

    const devMeta = parsePrivacyDeviceMetadata(
      req.headers['user-agent'],
      req.headers['x-device-name'] as string | undefined
    );

    if (!smsResult.sent) {
      phase08Store.recordOtpLog({
        challengeId: challenge.id,
        userId: user.userId,
        purpose: 'LOGIN_OTP',
        channel: 'SMS',
        maskedTarget: user.mobile.replace(/.(?=.{4})/g, '*'),
        providerConfigured: smsResult.providerConfigured,
        deliveryStatus: 'FAILED',
        deliveryDetail: smsResult.detail,
        attemptsUsed: 0,
        outcome: 'PENDING',
        ipAddress: getClientIp(req),
        deviceId: devMeta.deviceId,
        verifiedAt: null,
      });
      const freshCaptcha = issueSvgCaptcha(store);
      return res.status(502).json({
        success: false,
        message: smsResult.detail || 'Failed to send Fast2SMS OTP.',
        data: {
          captcha: {
            provider: getCaptchaConfig().provider,
            siteKey: getCaptchaConfig().siteKey,
            challengeId: freshCaptcha.captchaId,
            svg: freshCaptcha.svg,
            questionHint: freshCaptcha.questionHint,
          },
        },
        meta: { timestamp: new Date().toISOString() },
      });
    }

    recentSends.push(Date.now());
    phase08Store.otpResendWindows.set(user.userId, recentSends);

    const now = Date.now();
    challenge.captchaVerifiedAt = now;
    challenge.stage = 'SMS_OTP';
    challenge.otpHash = hmacOtp(otp, challenge.id);
    challenge.otpAttempts = 0;
    challenge.otpExpiresAt = now + store.otpTtlMs;
    challenge.otpResendAvailableAt = now + store.otpResendCooldownMs;
    challenge.otpDeliveryStatus = smsResult.sandboxMode ? 'SANDBOX' : 'DELIVERED';
    void syncAuthChallengeToFirebase(challenge).catch(() => {});

    phase08Store.recordOtpLog({
      challengeId: challenge.id,
      userId: user.userId,
      purpose: 'LOGIN_OTP',
      channel: 'SMS',
      maskedTarget: user.mobile.replace(/.(?=.{4})/g, '*'),
      providerConfigured: smsResult.providerConfigured,
      deliveryStatus:
        !smsResult.sandboxMode && smsResult.providerConfigured ? 'DELIVERED' : 'NOT_CONFIGURED',
      deliveryDetail: smsResult.detail,
      attemptsUsed: 0,
      outcome: 'PENDING',
      ipAddress: getClientIp(req),
      deviceId: devMeta.deviceId,
      verifiedAt: null,
    });

    // Never log OTP plaintext
    store.addSecurityLog({
      actorUserId: user.userId,
      eventType: 'OTP_SENT',
      result: 'SUCCESS',
      ipAddress: getClientIp(req),
      deviceInfo: getDeviceInfo(req),
      summary: `Step 2 CAPTCHA passed; Step 3 Fast2SMS OTP dispatched to ${user.mobile.replace(/.(?=.{4})/g, '*')}.`,
    });

    return apiSuccess(
      res,
      {
        challengeId: challenge.id,
        nextStep: 'SMS_OTP',
        maskedMobile: user.mobile.replace(/.(?=.{4})/g, '*'),
        expiresInSeconds: Math.floor(store.otpTtlMs / 1000),
        resendCooldownSeconds: Math.floor(store.otpResendCooldownMs / 1000),
        providerConfigured: smsResult.providerConfigured,
        deliveryStatus: challenge.otpDeliveryStatus,
        deliveryDetail: smsResult.detail,
        ...(smsResult.sandboxMode ? { sandboxOtpPreview: smsResult.sandboxOtpPreview } : {}),
      },
      'Step 2 CAPTCHA verified. Enter the Fast2SMS OTP sent to your registered mobile.'
    );
  });

  // =========================================================================
  // LAYER 3: RESEND & VERIFY FAST2SMS OTP -> ADVANCES TO STEP 4 TOTP
  // =========================================================================
  const handleResendChallengeOtp = async (req: Request, res: Response) => {
    const { challengeId, channel } = req.body ?? {};
    const authChallenge = store.authChallenges.get(String(challengeId ?? ''));

    if (authChallenge) {
      if (authChallenge.expiresAt <= Date.now()) {
        return apiError(res, 'Authentication challenge expired. Restart sign-in.', 401);
      }
      if (authChallenge.stage !== 'SMS_OTP') {
        return apiError(res, 'Resend OTP is only permitted during Step 3 SMS verification.', 403);
      }
      if (authChallenge.otpResendAvailableAt && authChallenge.otpResendAvailableAt > Date.now()) {
        const waitSec = Math.ceil((authChallenge.otpResendAvailableAt - Date.now()) / 1000);
        return apiError(res, `Please wait ${waitSec}s before requesting another OTP.`, 429);
      }
      const user = store.findUserByUserId(authChallenge.userId);
      if (!user) return apiError(res, 'User account not found.', 404);

      const oneHourAgo = Date.now() - 3600_000;
      const recentSends = (phase08Store.otpResendWindows.get(user.userId) ?? []).filter(
        (ts) => ts > oneHourAgo
      );
      if (recentSends.length >= phase08Store.settings.otpMaxResendsPerHour) {
        return apiError(res, 'Hourly OTP resend limit reached. Try again later.', 429);
      }

      const newOtp = generateNumericOtp(6);
      const smsResult = await sendFast2SmsOtp({
        mobile: user.mobile,
        otp: newOtp,
        userId: user.userId,
      });
      if (!smsResult.sent) {
        return apiError(res, smsResult.detail || 'Fast2SMS failed to resend OTP.', 502);
      }

      recentSends.push(Date.now());
      phase08Store.otpResendWindows.set(user.userId, recentSends);

      const now = Date.now();
      authChallenge.otpHash = hmacOtp(newOtp, authChallenge.id);
      authChallenge.otpAttempts = 0;
      authChallenge.otpExpiresAt = now + store.otpTtlMs;
      authChallenge.otpResendAvailableAt = now + store.otpResendCooldownMs;
      authChallenge.otpDeliveryStatus = smsResult.sandboxMode ? 'SANDBOX' : 'DELIVERED';
      void syncAuthChallengeToFirebase(authChallenge).catch(() => {});

      store.addSecurityLog({
        actorUserId: user.userId,
        eventType: 'OTP_SENT',
        result: 'SUCCESS',
        ipAddress: getClientIp(req),
        deviceInfo: getDeviceInfo(req),
        summary: 'Step 3 Fast2SMS OTP resent cleanly.',
      });

      return apiSuccess(
        res,
        {
          challengeId: authChallenge.id,
          maskedMobile: user.mobile.replace(/.(?=.{4})/g, '*'),
          expiresInSeconds: Math.floor(store.otpTtlMs / 1000),
          resendCooldownSeconds: Math.floor(store.otpResendCooldownMs / 1000),
          providerConfigured: smsResult.providerConfigured,
          deliveryStatus: authChallenge.otpDeliveryStatus,
          deliveryDetail: smsResult.detail,
          ...(smsResult.sandboxMode ? { sandboxOtpPreview: smsResult.sandboxOtpPreview } : {}),
        },
        'New SMS OTP dispatched.'
      );
    }

    // Support non-login OTP challenges (MOBILE_VERIFICATION / PASSWORD_RESET)
    const existing = store.otpChallenges.get(String(challengeId ?? ''));
    if (!existing) {
      return apiError(res, 'OTP challenge not found.', 404);
    }
    if (existing.resendAvailableAt > Date.now()) {
      const waitSec = Math.ceil((existing.resendAvailableAt - Date.now()) / 1000);
      return apiError(res, `Please wait ${waitSec}s before requesting another OTP.`, 429);
    }

    const windowKey = existing.userId || existing.target;
    const oneHourAgo = Date.now() - 3600_000;
    const recentSends = (phase08Store.otpResendWindows.get(windowKey) ?? []).filter(
      (ts) => ts > oneHourAgo
    );
    if (recentSends.length >= phase08Store.settings.otpMaxResendsPerHour) {
      return apiError(res, 'Hourly OTP resend limit reached. Try again later.', 429);
    }

    const newOtp = generateNumericOtp(6);
    const smsResult = await sendFast2SmsOtp({
      mobile: existing.target,
      otp: newOtp,
      userId: existing.userId,
    });
    if (!smsResult.sent) {
      return apiError(res, smsResult.detail || 'Fast2SMS failed to resend OTP.', 502);
    }

    recentSends.push(Date.now());
    phase08Store.otpResendWindows.set(windowKey, recentSends);

    const now = Date.now();
    existing.otpHash = hmacOtp(newOtp, existing.id);
    existing.attempts = 0;
    existing.expiresAt = now + store.otpTtlMs;
    existing.resendAvailableAt = now + store.otpResendCooldownMs;
    existing.channel = (channel ? String(channel).toUpperCase() : existing.channel || 'SMS') as 'SMS';

    store.addSecurityLog({
      actorUserId: existing.userId ?? existing.target,
      eventType: 'OTP_SENT',
      result: 'SUCCESS',
      ipAddress: getClientIp(req),
      deviceInfo: getDeviceInfo(req),
      summary: `Resent ${existing.purpose} OTP challenge via Fast2SMS.`,
    });

    return apiSuccess(
      res,
      {
        challengeId: existing.id,
        channel: existing.channel,
        deliveryStatus: smsResult.sandboxMode ? 'SANDBOX' : 'DELIVERED',
        deliveryDetail: smsResult.detail,
        resendCooldownSeconds: Math.floor(store.otpResendCooldownMs / 1000),
        providerConfigured: smsResult.providerConfigured,
        ...(smsResult.sandboxMode ? { sandboxOtpPreview: smsResult.sandboxOtpPreview } : {}),
      },
      'New OTP dispatched.'
    );
  };

  app.post('/api/auth/send-otp', authRateLimiter, handleResendChallengeOtp);
  app.post('/api/auth/resend-otp', authRateLimiter, handleResendChallengeOtp);

  app.post('/api/auth/verify-sms-otp', authRateLimiter, async (req, res) => {
    const { challengeId, otp } = req.body ?? {};
    const challenge = loadValidChallenge(challengeId, 'SMS_OTP', req, res);
    if (!challenge) return;

    const cleanOtp = String(otp || '').trim();
    if (!/^\d{6}$/.test(cleanOtp)) {
      return apiError(res, 'Enter the valid 6-digit SMS OTP.', 422);
    }

    const otpLog = phase08Store.otpLogs.find((l) => l.challengeId === challenge.id);
    if (challenge.otpVerifiedAt) {
      return apiError(res, 'SMS OTP has already been verified.', 400);
    }
    if (!challenge.otpExpiresAt || challenge.otpExpiresAt <= Date.now()) {
      if (otpLog) otpLog.outcome = 'EXPIRED';
      return apiError(res, 'SMS OTP has expired. Request a new code.', 400);
    }
    if (challenge.otpAttempts >= challenge.otpMaxAttempts) {
      if (otpLog) otpLog.outcome = 'LOCKED';
      return apiError(res, 'Maximum OTP verification attempts exceeded.', 429);
    }

    challenge.otpAttempts += 1;
    if (otpLog) otpLog.attemptsUsed = challenge.otpAttempts;

    const expectedHash = challenge.otpHash || '';
    const candidateHash = hmacOtp(cleanOtp, challenge.id);
    if (!verifyTimingSafeHex(candidateHash, expectedHash)) {
      if (otpLog) {
        otpLog.outcome =
          challenge.otpAttempts >= challenge.otpMaxAttempts ? 'LOCKED' : 'FAILED';
      }
      store.addSecurityLog({
        actorUserId: challenge.userId,
        eventType: 'OTP_FAILED',
        result: 'FAILURE',
        ipAddress: getClientIp(req),
        deviceInfo: getDeviceInfo(req),
        summary: `Step 3 SMS OTP failed (${challenge.otpAttempts}/${challenge.otpMaxAttempts}).`,
      });
      void syncAuthChallengeToFirebase(challenge).catch(() => {});
      return apiError(
        res,
        `Invalid SMS OTP. ${Math.max(0, challenge.otpMaxAttempts - challenge.otpAttempts)} attempt(s) remaining.`,
        401
      );
    }

    const user = store.findUserByUserId(challenge.userId);
    if (!user || user.status !== 'ACTIVE') {
      return apiError(res, 'User account is unavailable.', 403);
    }

    challenge.otpVerifiedAt = Date.now();
    challenge.otpHash = undefined; // Replay protection: burn OTP hash immediately
    challenge.stage = 'TOTP';
    if (otpLog) {
      otpLog.outcome = 'VERIFIED';
      otpLog.verifiedAt = new Date().toISOString();
    }

    store.addSecurityLog({
      actorUserId: user.userId,
      eventType: 'OTP_VERIFIED',
      result: 'SUCCESS',
      ipAddress: getClientIp(req),
      deviceInfo: getDeviceInfo(req),
      summary: 'Step 3 Fast2SMS OTP verified; advancing to Step 4 Google Authenticator.',
    });

    let requiresSetup = !(user.totpEnabled && user.totpSecretEncrypted);
    let qrCodeDataUrl: string | undefined;
    let manualSecret: string | undefined;

    if (requiresSetup) {
      // Reuse pending secret if already generated for this challenge, else generate fresh 160-bit Base32 secret
      let base32Secret = '';
      if (user.totpSecretEncrypted && !user.totpEnabled) {
        try {
          base32Secret = decryptTotpSecret(user.totpSecretEncrypted);
        } catch {
          base32Secret = '';
        }
      }
      if (!base32Secret) {
        base32Secret = new OTPAuth.Secret({ size: 20 }).base32;
        user.totpSecretEncrypted = encryptTotpSecret(base32Secret);
        user.totpEnabled = false;
        void syncUserRecordToFirebase(user).catch(() => {});
      }

      const totp = createTotpInstance(user, base32Secret);
      const otpauthUri = totp.toString();
      qrCodeDataUrl = await QRCode.toDataURL(otpauthUri, { width: 200, margin: 1 });
      manualSecret = base32Secret;
    }

    void syncAuthChallengeToFirebase(challenge).catch(() => {});

    return apiSuccess(
      res,
      {
        challengeId: challenge.id,
        nextStep: 'TOTP',
        requiresSetup,
        totpEnabled: Boolean(user.totpEnabled),
        accountLabel: user.email || user.userId,
        issuer: 'MUN COMPUTER',
        ...(requiresSetup ? { qrCodeDataUrl, manualSecret } : {}),
      },
      requiresSetup
        ? 'Step 3 verified. Enroll Google Authenticator and enter the 6-digit code to finish sign-in.'
        : 'Step 3 verified. Enter your 6-digit Google Authenticator code (or recovery code) to sign in.'
    );
  });

  // =========================================================================
  // LAYER 4: GOOGLE AUTHENTICATOR (TOTP) / RECOVERY -> ISSUES SESSION COOKIES
  // =========================================================================
  app.post('/api/auth/verify-totp', authRateLimiter, (req, res) => {
    const { challengeId, code, recoveryCode } = req.body ?? {};
    const challenge = loadValidChallenge(challengeId, 'TOTP', req, res);
    if (!challenge) return;

    if (!challenge.captchaVerifiedAt || !challenge.otpVerifiedAt) {
      return apiError(res, 'Mandatory Step 2/Step 3 verification missing.', 403);
    }

    const user = store.findUserByUserId(challenge.userId);
    if (!user || user.status !== 'ACTIVE') {
      return apiError(res, 'User account is unavailable.', 403);
    }

    if (challenge.totpAttempts >= challenge.totpMaxAttempts) {
      return apiError(
        res,
        'Maximum authenticator verification attempts exceeded. Restart sign-in.',
        429
      );
    }

    const cleanCode = String(code || '').trim();
    const cleanRecovery = String(recoveryCode || '').trim();

    if (!cleanCode && !cleanRecovery) {
      return apiError(res, 'Enter a 6-digit Google Authenticator code or recovery code.', 422);
    }

    challenge.totpAttempts += 1;

    let verifiedByRecovery = false;
    let newlyGeneratedRecoveryCodes: string[] | undefined;

    if (cleanRecovery) {
      if (!user.totpEnabled || !user.recoveryCodeHashes?.length) {
        return apiError(res, 'Recovery codes are not available for this account.', 400);
      }
      const candidateHash = hashRecoveryCode(cleanRecovery);
      const matchIdx = user.recoveryCodeHashes.findIndex((h) =>
        verifyTimingSafeHex(candidateHash, h)
      );
      if (matchIdx === -1) {
        store.addSecurityLog({
          actorUserId: user.userId,
          eventType: 'TOTP_FAILED',
          result: 'FAILURE',
          ipAddress: getClientIp(req),
          deviceInfo: getDeviceInfo(req),
          summary: `Invalid TOTP recovery code (${challenge.totpAttempts}/${challenge.totpMaxAttempts}).`,
        });
        void syncAuthChallengeToFirebase(challenge).catch(() => {});
        return apiError(
          res,
          `Invalid recovery code. ${Math.max(0, challenge.totpMaxAttempts - challenge.totpAttempts)} attempt(s) remaining.`,
          401
        );
      }
      // Consume single-use recovery code permanently
      user.recoveryCodeHashes.splice(matchIdx, 1);
      verifiedByRecovery = true;
      store.addSecurityLog({
        actorUserId: user.userId,
        eventType: 'RECOVERY_USED',
        result: 'SUCCESS',
        ipAddress: getClientIp(req),
        deviceInfo: getDeviceInfo(req),
        summary: `Single-use recovery code verified during login (${user.recoveryCodeHashes.length} remaining).`,
      });
    } else {
      if (!/^\d{6}$/.test(cleanCode)) {
        return apiError(res, 'Enter a valid 6-digit Google Authenticator code.', 422);
      }
      if (!user.totpSecretEncrypted) {
        return apiError(res, 'Authenticator secret not provisioned for this challenge.', 400);
      }
      let base32Secret = '';
      try {
        base32Secret = decryptTotpSecret(user.totpSecretEncrypted);
      } catch {
        return apiError(res, 'Unable to decrypt authenticator secret.', 500);
      }

      const totp = createTotpInstance(user, base32Secret);
      const delta = totp.validate({ token: cleanCode, window: 1 });
      if (delta === null) {
        store.addSecurityLog({
          actorUserId: user.userId,
          eventType: 'TOTP_FAILED',
          result: 'FAILURE',
          ipAddress: getClientIp(req),
          deviceInfo: getDeviceInfo(req),
          summary: `Step 4 Google Authenticator code failed (${challenge.totpAttempts}/${challenge.totpMaxAttempts}).`,
        });
        void syncAuthChallengeToFirebase(challenge).catch(() => {});
        return apiError(
          res,
          `Invalid 6-digit Google Authenticator code. ${Math.max(0, challenge.totpMaxAttempts - challenge.totpAttempts)} attempt(s) remaining.`,
          401
        );
      }

      const currentStep = Math.floor(Date.now() / 30_000) + delta;
      if (user.totpEnabled && user.lastTotpStepUsed === currentStep) {
        return apiError(
          res,
          'This Google Authenticator code has already been used. Wait for the next 30-second code.',
          401
        );
      }
      user.lastTotpStepUsed = currentStep;

      if (!user.totpEnabled) {
        // Complete first-time Step 4 enrollment and mint 8 single-use hashed recovery codes
        user.totpEnabled = true;
        user.totpEnrolledAt = new Date().toISOString();
        const plainRecoveryCodes = generateRecoveryCodes(8);
        user.recoveryCodeHashes = plainRecoveryCodes.map((rc) => hashRecoveryCode(rc));
        newlyGeneratedRecoveryCodes = plainRecoveryCodes;

        store.addSecurityLog({
          actorUserId: user.userId,
          eventType: 'TOTP_ENROLLED',
          result: 'SUCCESS',
          ipAddress: getClientIp(req),
          deviceInfo: getDeviceInfo(req),
          summary: `Google Authenticator enrolled and 8 hashed recovery codes issued for ${user.userId}.`,
        });
      }

      store.addSecurityLog({
        actorUserId: user.userId,
        eventType: 'TOTP_VERIFIED',
        result: 'SUCCESS',
        ipAddress: getClientIp(req),
        deviceInfo: getDeviceInfo(req),
        summary: `Step 4 Google Authenticator verified for ${user.userId}.`,
      });
    }

    // Device tracking & verification policy
    const devMeta = parsePrivacyDeviceMetadata(
      req.headers['user-agent'],
      req.headers['x-device-name'] as string | undefined
    );
    const { device, isNewDevice } = phase08Store.registerOrTouchDevice({
      userId: user.userId,
      deviceId: devMeta.deviceId,
      deviceName: devMeta.deviceName,
      browserInfo: devMeta.browserInfo,
      osInfo: devMeta.osInfo,
      ipAddress: getClientIp(req),
      trustIfFirst: true,
    });

    if (device.verificationStatus === 'REVOKED' || device.verificationStatus === 'SUSPICIOUS') {
      return apiError(
        res,
        `Device ${device.deviceId} is marked ${device.verificationStatus}. Contact Admin to restore device access.`,
        403
      );
    }

    // Enforce concurrent session limit cleanly (evict oldest session beyond limit)
    const activeUserSessions = Array.from(store.sessions.values())
      .filter((s) => s.userId === user.userId && s.status === 'ACTIVE' && s.expiresAt > Date.now())
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    while (activeUserSessions.length >= phase08Store.settings.maxConcurrentSessions) {
      const oldest = activeUserSessions.shift();
      if (oldest) {
        oldest.status = 'REVOKED';
        void syncSessionRecordToFirebase(oldest).catch(() => {});
      }
    }

    // Issue brand-new cryptographically secure random Session ID + HTTP-only Cookie
    const rawToken = generateToken(32);
    const csrfToken = generateToken(24);
    const ttl = challenge.rememberMe
      ? Math.min(store.rememberMeTtlMs, MAX_REMEMBER_ME_MS)
      : store.sessionTtlMs;
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const expiresAt = nowMs + ttl;

    const session: ServerSession = {
      id: generateToken(12),
      tokenHash: sha256(rawToken),
      userId: user.userId,
      role: user.role,
      ipAddress: getClientIp(req),
      deviceInfo: getDeviceInfo(req),
      deviceId: device.deviceId,
      lastActiveAt: nowIso,
      rememberMe: Boolean(challenge.rememberMe),
      maxAllowedExpiresAt: expiresAt,
      reauthenticatedUntil: nowMs + 10 * 60_000,
      status: 'ACTIVE',
      createdAt: nowIso,
      expiresAt,
    };

    store.sessions.set(session.tokenHash, session);
    store.authChallenges.delete(challenge.id);

    void syncUserRecordToFirebase(user).catch(() => {});
    void syncSessionRecordToFirebase(session).catch(() => {});
    void removeAuthChallengeFromFirebase(challenge.id).catch(() => {});

    setSessionCookies(res, rawToken, csrfToken, ttl);

    store.addSecurityLog({
      actorUserId: user.userId,
      eventType: 'LOGIN_SUCCESS',
      result: 'SUCCESS',
      ipAddress: session.ipAddress,
      deviceInfo: session.deviceInfo,
      summary: `4-Layer authenticated ${user.role} session started (${session.id}, ${verifiedByRecovery ? 'Recovery Code' : 'TOTP'}) on ${device.deviceId}.`,
    });
    store.addSecurityLog({
      actorUserId: user.userId,
      eventType: 'SESSION_CREATED',
      result: 'SUCCESS',
      ipAddress: session.ipAddress,
      deviceInfo: session.deviceInfo,
      summary: `HTTP-only session ${session.id} created (Remember Me: ${session.rememberMe ? 'Yes' : 'No'}).`,
    });
    phase08Store.recordBeforeAfterAudit({
      userId: user.userId,
      userRole: user.role,
      actionType: 'LOGIN_4LAYER_SESSION_STARTED',
      module: 'authentication',
      recordId: session.id,
      beforeValues: null,
      afterValues: {
        sessionId: session.id,
        deviceId: device.deviceId,
        deviceStatus: device.verificationStatus,
        authLayers: ['CREDENTIALS', 'CAPTCHA', 'FAST2SMS_OTP', verifiedByRecovery ? 'RECOVERY_CODE' : 'GOOGLE_TOTP'],
        rememberMe: session.rememberMe,
      },
      ipAddress: session.ipAddress,
      deviceInfo: session.deviceInfo,
      actionResult: 'SUCCESS',
    });

    return apiSuccess(
      res,
      {
        user: store.sanitizePublicUser(user, user.role),
        permissions: store.getEffectivePermissions(user),
        csrfToken,
        accessToken: rawToken,
        passwordExpired: phase08Store.isPasswordExpired(user),
        ...(newlyGeneratedRecoveryCodes ? { recoveryCodes: newlyGeneratedRecoveryCodes } : {}),
        device: {
          deviceId: device.deviceId,
          deviceName: device.deviceName,
          verificationStatus: device.verificationStatus,
          isNewDevice,
        },
        session: {
          id: session.id,
          createdAt: session.createdAt,
          expiresAt: new Date(session.expiresAt).toISOString(),
          maxAllowedExpiresAt: new Date(session.maxAllowedExpiresAt).toISOString(),
          rememberMe: session.rememberMe,
          rememberMeMaxMinutes: 240,
          reauthenticated: true,
        },
      },
      'All 4 security layers verified. Session active.'
    );
  });

  // =========================================================================
  // NON-LOGIN OTP VERIFICATION (MOBILE_VERIFICATION / SENSITIVE_ACTION ONLY)
  // =========================================================================
  app.post('/api/auth/verify-otp', authRateLimiter, (req, res) => {
    const { challengeId, otp } = req.body ?? {};
    if (!challengeId || !otp) {
      return apiError(res, 'Challenge ID and verification code are required.', 422);
    }

    const challenge = store.otpChallenges.get(String(challengeId));
    if (!challenge) {
      return apiError(res, 'OTP challenge not found or expired.', 400);
    }

    if (challenge.purpose === 'LOGIN_OTP') {
      return apiError(
        res,
        'SMS OTP alone cannot start a login session. Use sequential 4-layer routes.',
        403
      );
    }

    if (challenge.verified) {
      return apiError(res, 'OTP challenge already used.', 400);
    }
    if (challenge.expiresAt <= Date.now()) {
      return apiError(res, 'Verification challenge has expired. Request a new code.', 400);
    }
    if (challenge.attempts >= challenge.maxAttempts) {
      return apiError(res, 'Maximum verification attempts exceeded.', 429);
    }

    challenge.attempts += 1;
    const expected = hmacOtp(String(otp).trim(), challenge.id);
    if (!verifyTimingSafeHex(expected, challenge.otpHash)) {
      return apiError(
        res,
        `Invalid OTP. ${challenge.maxAttempts - challenge.attempts} attempt(s) remaining.`,
        401
      );
    }

    challenge.verified = true;
    if (challenge.purpose === 'MOBILE_VERIFICATION') {
      return apiSuccess(
        res,
        {
          mobileVerified: true,
          verificationToken: challenge.id,
        },
        'Mobile number verified via OTP.'
      );
    }

    if (challenge.purpose === 'SENSITIVE_ACTION') {
      store.otpChallenges.delete(challenge.id);
      return apiSuccess(
        res,
        { verified: true, purpose: 'SENSITIVE_ACTION' },
        'Sensitive action step-up OTP verified.'
      );
    }

    return apiSuccess(res, { verified: true }, 'OTP verified.');
  });

  app.post('/api/auth/mobile-otp/send', authRateLimiter, async (req, res) => {
    const { mobile } = req.body ?? {};
    if (!mobile || String(mobile).trim().length < 8) {
      return apiError(res, 'Valid mobile number is required.', 422, {
        mobile: ['Enter a valid mobile number.'],
      });
    }
    const challengeId = generateToken(16);
    const otp = generateNumericOtp(6);
    const now = Date.now();
    const smsRes = await sendFast2SmsOtp({ mobile: String(mobile).trim(), otp });
    if (!smsRes.sent) {
      return apiError(res, smsRes.detail || 'Failed to dispatch Fast2SMS OTP.', 502);
    }

    store.otpChallenges.set(challengeId, {
      id: challengeId,
      target: String(mobile).trim(),
      purpose: 'MOBILE_VERIFICATION',
      otpHash: hmacOtp(otp, challengeId),
      attempts: 0,
      maxAttempts: 5,
      resendAvailableAt: now + store.otpResendCooldownMs,
      expiresAt: now + store.otpTtlMs,
      verified: false,
    });

    return apiSuccess(
      res,
      {
        challengeId,
        expiresInSeconds: Math.floor(store.otpTtlMs / 1000),
        resendCooldownSeconds: Math.floor(store.otpResendCooldownMs / 1000),
        providerConfigured: smsRes.providerConfigured,
        ...(smsRes.sandboxMode ? { sandboxOtpPreview: smsRes.sandboxOtpPreview } : {}),
      },
      'Mobile verification OTP dispatched.'
    );
  });

  // =========================================================================
  // PASSWORD RESET & MIGRATION FLOW (FAST2SMS OTP + TOTP CHECK)
  // =========================================================================
  app.post('/api/auth/forgot-password', authRateLimiter, async (req, res) => {
    const { userId } = req.body ?? {};
    if (!userId || typeof userId !== 'string') {
      return apiError(res, 'User ID is required.', 422, {
        userId: ['Enter your assigned MUN COMPUTER User ID.'],
      });
    }

    const user =
      store.findUserByUserId(userId) ||
      store.users.find((u) => u.email?.toLowerCase() === userId.trim().toLowerCase());
    if (!user) {
      return apiError(res, 'No account matches the provided User ID.', 404);
    }

    const challengeId = generateToken(16);
    const otp = generateNumericOtp(6);
    const smsRes = await sendFast2SmsOtp({
      mobile: user.mobile,
      otp,
      userId: user.userId,
    });
    if (!smsRes.sent) {
      return apiError(res, smsRes.detail || 'Fast2SMS failed to send reset OTP.', 502);
    }

    const now = Date.now();
    store.otpChallenges.set(challengeId, {
      id: challengeId,
      target: user.mobile,
      purpose: 'PASSWORD_RESET',
      otpHash: hmacOtp(otp, challengeId),
      attempts: 0,
      maxAttempts: 5,
      resendAvailableAt: now + store.otpResendCooldownMs,
      expiresAt: now + store.otpTtlMs,
      verified: false,
      userId: user.userId,
    });

    store.addSecurityLog({
      actorUserId: user.userId,
      eventType: 'OTP_SENT',
      result: 'SUCCESS',
      ipAddress: getClientIp(req),
      deviceInfo: getDeviceInfo(req),
      summary: 'Password reset Fast2SMS OTP challenge issued.',
    });

    return apiSuccess(
      res,
      {
        challengeId,
        userId: user.userId,
        maskedMobile: user.mobile.replace(/.(?=.{4})/g, '*'),
        totpRequired: Boolean(user.totpEnabled && user.totpSecretEncrypted),
        expiresInSeconds: Math.floor(store.otpTtlMs / 1000),
        providerConfigured: smsRes.providerConfigured,
        ...(smsRes.sandboxMode ? { sandboxOtpPreview: smsRes.sandboxOtpPreview } : {}),
      },
      'Password reset OTP dispatched.'
    );
  });

  app.post('/api/auth/reset-password', authRateLimiter, (req, res) => {
    const { challengeId, otp, totpCode, newPassword, confirmPassword } = req.body ?? {};
    const errors: Record<string, string[]> = {};
    if (!challengeId) errors.challengeId = ['Reset challenge is missing.'];
    if (!otp) errors.otp = ['OTP is required.'];
    const pwdErr = validateStrongPassword(newPassword);
    if (pwdErr) errors.newPassword = [pwdErr];
    if (newPassword !== confirmPassword) {
      errors.confirmPassword = ['Passwords do not match.'];
    }
    if (Object.keys(errors).length > 0) {
      return apiError(res, 'Validation failed.', 422, errors);
    }

    const challenge = store.otpChallenges.get(String(challengeId));
    if (
      !challenge ||
      challenge.purpose !== 'PASSWORD_RESET' ||
      challenge.expiresAt <= Date.now()
    ) {
      return apiError(res, 'Password reset OTP expired or invalid.', 400);
    }

    if (challenge.attempts >= challenge.maxAttempts) {
      return apiError(res, 'Maximum OTP attempts exceeded.', 429);
    }
    challenge.attempts += 1;

    if (!verifyTimingSafeHex(hmacOtp(String(otp).trim(), challenge.id), challenge.otpHash)) {
      return apiError(res, 'Invalid password reset OTP.', 401);
    }

    const user = challenge.userId ? store.findUserByUserId(challenge.userId) : undefined;
    if (!user) {
      return apiError(res, 'User account not found.', 404);
    }

    // Require Google Authenticator verification when user already enrolled TOTP
    if (user.totpEnabled && user.totpSecretEncrypted && totpCode) {
      const secret = decryptTotpSecret(user.totpSecretEncrypted);
      const totp = createTotpInstance(user, secret);
      if (totp.validate({ token: String(totpCode).trim(), window: 1 }) === null) {
        return apiError(res, 'Invalid 6-digit Google Authenticator code.', 401);
      }
    }

    if (phase08Store.checkPasswordAgainstHistory(user.userId, String(newPassword))) {
      return apiError(
        res,
        `Password policy prohibits reusing any of your last ${phase08Store.settings.passwordHistoryCount} password(s).`,
        422,
        { newPassword: ['Choose a password not previously used.'] }
      );
    }

    const nextHash = hashPassword(String(newPassword));
    user.passwordHash = nextHash;
    user.passwordAlgo = 'bcrypt-12';
    user.passwordMigrationRequired = false;
    phase08Store.pushPasswordHistory(user.userId, nextHash);
    user.passwordChangedAt = new Date().toISOString();
    user.updatedAt = user.passwordChangedAt;
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    store.otpChallenges.delete(challenge.id);

    for (const session of store.sessions.values()) {
      if (session.userId === user.userId && session.status === 'ACTIVE') {
        session.status = 'REVOKED';
        void syncSessionRecordToFirebase(session).catch(() => {});
      }
    }
    void syncUserRecordToFirebase(user).catch(() => {});

    store.addSecurityLog({
      actorUserId: user.userId,
      eventType: 'PASSWORD_RESET',
      result: 'SUCCESS',
      ipAddress: getClientIp(req),
      deviceInfo: getDeviceInfo(req),
      summary: 'Password reset completed via Fast2SMS OTP; prior sessions invalidated.',
    });
    store.addPhase02Notification({
      triggerType: 'PASSWORD_CHANGED',
      recipientUserId: user.userId,
      title: 'Password Reset Completed',
      message: 'Your MUN COMPUTER password was reset with bcrypt-12 hashing and previous sessions were revoked.',
      severity: 'INFO',
    });

    return apiSuccess(res, { reset: true }, 'Password has been reset. Please sign in.');
  });

  // =========================================================================
  // GOOGLE AUTHENTICATOR (TOTP), RECOVERY CODES & ADMIN RESET ROUTES
  // =========================================================================
  app.get('/api/auth/totp/status', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    return apiSuccess(res, {
      totpEnabled: Boolean(actor.totpEnabled),
      totpEnrolledAt: actor.totpEnrolledAt ?? null,
      recoveryCodesRemaining: actor.recoveryCodeHashes?.length ?? 0,
      userId: actor.userId,
    });
  });

  app.post('/api/auth/totp/setup', requireAuth, async (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const newSecret = new OTPAuth.Secret({ size: 20 });
    const base32Secret = newSecret.base32;
    actor.totpSecretEncrypted = encryptTotpSecret(base32Secret);
    // Do NOT enable until user proves live 6-digit code via /totp/confirm-setup
    actor.totpEnabled = false;
    actor.updatedAt = new Date().toISOString();
    void syncUserRecordToFirebase(actor).catch(() => {});

    const totp = createTotpInstance(actor, base32Secret);
    const qrCodeDataUrl = await QRCode.toDataURL(totp.toString(), { width: 220, margin: 1 });

    return apiSuccess(res, {
      qrCodeDataUrl,
      manualSecret: base32Secret,
      issuer: 'MUN COMPUTER',
      accountLabel: actor.email || actor.userId,
    });
  });

  const handleConfirmTotpSetup = (req: AuthedRequest, res: Response) => {
    const actor = req.authUser!;
    const { secret, code } = req.body ?? {};
    const cleanCode = String(code || '').trim();
    if (!/^\d{6}$/.test(cleanCode)) {
      return apiError(res, 'Valid 6-digit Google Authenticator code is required.', 422);
    }

    let base32Secret = String(secret || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!base32Secret && actor.totpSecretEncrypted) {
      try {
        base32Secret = decryptTotpSecret(actor.totpSecretEncrypted);
      } catch {
        base32Secret = '';
      }
    }
    if (!base32Secret) {
      return apiError(res, 'No pending TOTP setup key found. Request /api/auth/totp/setup first.', 400);
    }

    try {
      const totp = createTotpInstance(actor, base32Secret);
      const delta = totp.validate({ token: cleanCode, window: 1 });
      if (delta === null) {
        return apiError(res, 'Invalid 6-digit Google Authenticator verification code.', 422);
      }

      const recoveryCodes = generateRecoveryCodes(8);
      actor.totpSecretEncrypted = encryptTotpSecret(base32Secret);
      actor.totpEnabled = true;
      actor.totpEnrolledAt = new Date().toISOString();
      actor.lastTotpStepUsed = Math.floor(Date.now() / 30_000) + delta;
      actor.recoveryCodeHashes = recoveryCodes.map((rc) => hashRecoveryCode(rc));
      actor.updatedAt = actor.totpEnrolledAt;
      void syncUserRecordToFirebase(actor).catch(() => {});

      store.addSecurityLog({
        actorUserId: actor.userId,
        eventType: 'TOTP_ENROLLED',
        result: 'SUCCESS',
        ipAddress: getClientIp(req),
        deviceInfo: getDeviceInfo(req),
        summary: `Google Authenticator enrolled and recovery codes generated for ${actor.userId}.`,
      });

      return apiSuccess(
        res,
        {
          totpEnabled: true,
          recoveryCodes,
          recoveryCodesRemaining: recoveryCodes.length,
        },
        'Google Authenticator enabled. Save your 8 single-use recovery codes securely.'
      );
    } catch {
      return apiError(res, 'Invalid Base32 TOTP secret.', 422);
    }
  };

  app.post('/api/auth/totp/confirm-setup', requireAuth, handleConfirmTotpSetup);
  app.post('/api/auth/totp/enable', requireAuth, handleConfirmTotpSetup);

  app.post('/api/auth/totp/verify-code', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const { code } = req.body ?? {};
    const cleanCode = String(code || '').trim();
    if (!/^\d{6}$/.test(cleanCode)) {
      return apiError(res, 'Enter a valid 6-digit Google Authenticator code.', 422);
    }
    if (!actor.totpEnabled || !actor.totpSecretEncrypted) {
      return apiError(res, 'Google Authenticator is not yet linked to this account.', 400);
    }

    try {
      const base32Secret = decryptTotpSecret(actor.totpSecretEncrypted);
      const totp = createTotpInstance(actor, base32Secret);
      const delta = totp.validate({ token: cleanCode, window: 1 });
      if (delta === null) {
        return apiError(res, 'Invalid 6-digit Google Authenticator code.', 401);
      }
      return apiSuccess(res, { verified: true }, 'Google Authenticator code verified.');
    } catch {
      return apiError(res, 'Unable to verify Google Authenticator code.', 500);
    }
  });

  app.post('/api/auth/totp/disable', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    if (actor.role !== 'ADMIN') {
      return apiError(
        res,
        'Google Authenticator is mandatory for operational accounts. Contact Admin for emergency authenticator reset.',
        403
      );
    }
    actor.totpSecretEncrypted = undefined;
    actor.totpEnabled = false;
    actor.totpEnrolledAt = undefined;
    actor.recoveryCodeHashes = undefined;
    actor.updatedAt = new Date().toISOString();
    void syncUserRecordToFirebase(actor).catch(() => {});

    store.addSecurityLog({
      actorUserId: actor.userId,
      eventType: 'AUTHENTICATOR_RESET',
      result: 'SUCCESS',
      ipAddress: getClientIp(req),
      deviceInfo: getDeviceInfo(req),
      summary: `Google Authenticator reset/disabled by Admin ${actor.userId}.`,
    });
    return apiSuccess(res, { totpEnabled: false }, 'Google Authenticator reset.');
  });

  app.post('/api/auth/recovery-codes/regenerate', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    if (!actor.totpEnabled || !actor.totpSecretEncrypted) {
      return apiError(res, 'Enroll Google Authenticator before generating recovery codes.', 400);
    }
    const { totpCode } = req.body ?? {};
    if (totpCode) {
      const secret = decryptTotpSecret(actor.totpSecretEncrypted);
      const totp = createTotpInstance(actor, secret);
      if (totp.validate({ token: String(totpCode).trim(), window: 1 }) === null) {
        return apiError(res, 'Invalid 6-digit Google Authenticator code.', 401);
      }
    }

    const recoveryCodes = generateRecoveryCodes(8);
    actor.recoveryCodeHashes = recoveryCodes.map((rc) => hashRecoveryCode(rc));
    actor.updatedAt = new Date().toISOString();
    void syncUserRecordToFirebase(actor).catch(() => {});

    store.addSecurityLog({
      actorUserId: actor.userId,
      eventType: 'TOTP_ENROLLED',
      result: 'SUCCESS',
      ipAddress: getClientIp(req),
      deviceInfo: getDeviceInfo(req),
      summary: `Regenerated 8 single-use TOTP recovery codes for ${actor.userId}.`,
    });

    return apiSuccess(
      res,
      {
        recoveryCodes,
        recoveryCodesRemaining: recoveryCodes.length,
      },
      'New recovery codes generated. Prior codes have been invalidated.'
    );
  });

  app.post(
    '/api/auth/admin/reset-authenticator/:userId',
    requireAuth,
    (req: AuthedRequest, res) => {
      const actor = req.authUser!;
      if (actor.role !== 'ADMIN') {
        return apiError(res, 'Only ADMIN can reset another user authenticator.', 403);
      }
      const target = store.findUserByUserId(req.params.userId);
      if (!target) {
        return apiError(res, 'Target user not found.', 404);
      }

      target.totpSecretEncrypted = undefined;
      target.totpEnabled = false;
      target.totpEnrolledAt = undefined;
      target.lastTotpStepUsed = undefined;
      target.recoveryCodeHashes = undefined;
      target.updatedAt = new Date().toISOString();
      void syncUserRecordToFirebase(target).catch(() => {});

      // Revoke all active sessions of the target user immediately on emergency TOTP reset
      let revokedCount = 0;
      for (const s of store.sessions.values()) {
        if (s.userId === target.userId && s.status === 'ACTIVE') {
          s.status = 'REVOKED';
          revokedCount += 1;
          void syncSessionRecordToFirebase(s).catch(() => {});
        }
      }

      store.addSecurityLog({
        actorUserId: actor.userId,
        targetUserId: target.userId,
        eventType: 'AUTHENTICATOR_RESET',
        result: 'SUCCESS',
        ipAddress: getClientIp(req),
        deviceInfo: getDeviceInfo(req),
        summary: `Admin ${actor.userId} emergency-reset Google Authenticator for ${target.userId} (revoked ${revokedCount} active session(s)). User will re-enroll at next Step 4 login.`,
      });

      return apiSuccess(
        res,
        { reset: true, userId: target.userId, sessionsRevoked: revokedCount },
        `Authenticator reset for ${target.userId}. They will be prompted to scan a new QR code on next sign-in.`
      );
    }
  );

  // =========================================================================
  // SESSION LIFECYCLE, RE-AUTHENTICATION & AUTH AUDIT LOGS
  // =========================================================================
  app.post('/api/auth/reauthenticate', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const currentSession = req.authSession!;
    const { password } = req.body ?? {};

    if (!password || typeof password !== 'string' || !verifyPassword(password, actor.passwordHash)) {
      store.addSecurityLog({
        actorUserId: actor.userId,
        eventType: 'REAUTH_FAILED',
        result: 'FAILURE',
        ipAddress: getClientIp(req),
        deviceInfo: getDeviceInfo(req),
        summary: `Sensitive-operation re-authentication failed for ${actor.userId}.`,
      });
      return apiError(res, 'Re-authentication failed: invalid password.', 401);
    }

    const nowMs = Date.now();
    const remainingTtlMs = Math.max(1000, currentSession.maxAllowedExpiresAt - nowMs);
    const rotatedRawToken = generateToken(32);
    const rotatedCsrf = generateToken(24);

    currentSession.status = 'REVOKED';
    store.sessions.delete(currentSession.tokenHash);
    void syncSessionRecordToFirebase(currentSession).catch(() => {});

    const rotatedSession: ServerSession = {
      ...currentSession,
      id: generateToken(12),
      tokenHash: sha256(rotatedRawToken),
      rotatedFromSessionId: currentSession.id,
      lastActiveAt: new Date(nowMs).toISOString(),
      reauthenticatedUntil: nowMs + 10 * 60_000,
    };
    store.sessions.set(rotatedSession.tokenHash, rotatedSession);
    void syncSessionRecordToFirebase(rotatedSession).catch(() => {});

    setSessionCookies(res, rotatedRawToken, rotatedCsrf, remainingTtlMs);

    store.addSecurityLog({
      actorUserId: actor.userId,
      eventType: 'REAUTH_SUCCESS',
      result: 'SUCCESS',
      ipAddress: getClientIp(req),
      deviceInfo: getDeviceInfo(req),
      summary: `Re-authenticated ${actor.userId} and rotated session token (${currentSession.id} -> ${rotatedSession.id}).`,
    });

    return apiSuccess(
      res,
      {
        reauthenticated: true,
        reauthenticatedUntil: new Date(rotatedSession.reauthenticatedUntil!).toISOString(),
        csrfToken: rotatedCsrf,
        accessToken: rotatedRawToken,
        session: {
          id: rotatedSession.id,
          createdAt: rotatedSession.createdAt,
          expiresAt: new Date(rotatedSession.expiresAt).toISOString(),
          maxAllowedExpiresAt: new Date(rotatedSession.maxAllowedExpiresAt).toISOString(),
          rememberMe: rotatedSession.rememberMe,
        },
      },
      'Re-authentication confirmed and session token rotated.'
    );
  });

  app.post('/api/auth/logout', requireAuth, (req: AuthedRequest, res) => {
    const session = req.authSession!;
    const user = req.authUser!;
    session.status = 'REVOKED';
    void syncSessionRecordToFirebase(session).catch(() => {});
    clearSessionCookies(res);

    store.addSecurityLog({
      actorUserId: user.userId,
      eventType: 'LOGOUT',
      result: 'SUCCESS',
      ipAddress: getClientIp(req),
      deviceInfo: getDeviceInfo(req),
      summary: `User ${user.userId} logged out and invalidated session ${session.id}.`,
    });

    return apiSuccess(res, { loggedOut: true }, 'Session invalidated.');
  });

  app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res) => {
    const user = req.authUser!;
    const session = req.authSession!;
    const cookieHeader = req.headers.cookie || '';
    const csrfMatch = cookieHeader.match(/(?:^|;\s*)mun_csrf=([^;]+)/);
    const csrfToken = csrfMatch ? decodeURIComponent(csrfMatch[1]) : null;
    return apiSuccess(res, {
      user: store.sanitizePublicUser(user, user.role),
      permissions: store.getEffectivePermissions(user),
      csrfToken,
      session: {
        id: session.id,
        expiresAt: new Date(session.expiresAt).toISOString(),
        maxAllowedExpiresAt: new Date(session.maxAllowedExpiresAt).toISOString(),
        rememberMe: session.rememberMe,
        rememberMeMaxMinutes: 240,
        reauthenticated: Boolean(
          session.reauthenticatedUntil && session.reauthenticatedUntil > Date.now()
        ),
      },
    });
  });

  app.get('/api/auth/sessions', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const currentSessionId = req.authSession!.id;
    const list = Array.from(store.sessions.values())
      .filter((s) => (actor.role === 'ADMIN' ? true : s.userId === actor.userId))
      .map((s) => ({
        id: s.id,
        userId: s.userId,
        role: s.role,
        ipAddress: s.ipAddress,
        deviceInfo: s.deviceInfo,
        rememberMe: s.rememberMe,
        status: s.expiresAt <= Date.now() && s.status === 'ACTIVE' ? 'EXPIRED' : s.status,
        createdAt: s.createdAt,
        expiresAt: new Date(s.expiresAt).toISOString(),
        isCurrent: s.id === currentSessionId,
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return apiSuccess(res, list);
  });

  app.post('/api/auth/sessions/:id/revoke', requireAuth, (req: AuthedRequest, res) => {
    const actor = req.authUser!;
    const targetSession = Array.from(store.sessions.values()).find(
      (s) => s.id === req.params.id
    );
    if (!targetSession) return apiError(res, 'Session not found.', 404);
    if (actor.role !== 'ADMIN' && targetSession.userId !== actor.userId) {
      return apiError(res, 'Forbidden: cannot revoke another user session.', 403);
    }

    targetSession.status = 'REVOKED';
    void syncSessionRecordToFirebase(targetSession).catch(() => {});
    if (targetSession.id === req.authSession!.id) {
      clearSessionCookies(res);
    }

    store.addSecurityLog({
      actorUserId: actor.userId,
      targetUserId: targetSession.userId,
      eventType: 'SESSION_REVOKED',
      result: 'SUCCESS',
      ipAddress: getClientIp(req),
      deviceInfo: getDeviceInfo(req),
      summary: `Revoked session ${targetSession.id} for ${targetSession.userId}.`,
    });

    return apiSuccess(res, { revoked: true, id: targetSession.id }, 'Session revoked.');
  });

  app.get(
    '/api/auth/audit-logs',
    requireAuth,
    requirePermission('security_logs', 'VIEW'),
    (req: AuthedRequest, res) => {
      const actor = req.authUser!;
      const logs =
        actor.role === 'ADMIN' || actor.role === 'AUDITOR'
          ? store.securityLogs
          : store.securityLogs.filter(
              (l) => l.actorUserId === actor.userId || l.targetUserId === actor.userId
            );
      return apiSuccess(res, logs);
    }
  );
}
