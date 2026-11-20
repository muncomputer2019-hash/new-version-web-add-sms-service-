import { generateCaptchaChallenge, hmacOtp, verifyTimingSafeHex } from './crypto.js';
import { SecurityStore } from './securityStore.js';

export type CaptchaProvider = 'turnstile' | 'recaptcha' | 'svg';

const CAPTCHA_TTL_MS = 10 * 60_000;

export function getCaptchaConfig(): {
  provider: CaptchaProvider;
  siteKey: string;
} {
  const providerRaw = (process.env.CAPTCHA_PROVIDER || '').trim().toLowerCase();
  const siteKey = (process.env.CAPTCHA_SITE_KEY || '').trim();
  const secretKey = (process.env.CAPTCHA_SECRET_KEY || '').trim();

  if ((providerRaw === 'turnstile' || providerRaw === 'recaptcha') && siteKey && secretKey) {
    return { provider: providerRaw, siteKey };
  }
  return { provider: 'svg', siteKey: '' };
}

function signCaptchaToken(expiresAt: number, nonce: string, answerHash: string): string {
  return hmacOtp(`${expiresAt}:${nonce}:${answerHash}`, 'captcha-v1-sig');
}

export function issueSvgCaptcha(store: SecurityStore): {
  captchaId: string;
  svg: string;
  questionHint: string;
} {
  const challenge = generateCaptchaChallenge();
  const expiresAt = Date.now() + CAPTCHA_TTL_MS;
  // Re-bind answerHash to challenge.id cleanly and sign statelessly
  const sig = signCaptchaToken(expiresAt, challenge.id, challenge.answerHash);
  const signedCaptchaId = `cap1.${expiresAt}.${challenge.id}.${challenge.answerHash}.${sig}`;

  store.captchaChallenges.set(signedCaptchaId, {
    id: challenge.id,
    answerHash: challenge.answerHash,
    expiresAt,
  });
  return {
    captchaId: signedCaptchaId,
    svg: challenge.svg,
    questionHint: challenge.questionHint,
  };
}

export async function verifyServerCaptcha(params: {
  store: SecurityStore;
  captchaId?: string;
  captchaAnswer?: string;
  captchaToken?: string;
  remoteIp?: string;
}): Promise<{ valid: boolean; reason?: string }> {
  const config = getCaptchaConfig();
  const secretKey = (process.env.CAPTCHA_SECRET_KEY || '').trim();

  if (config.provider === 'turnstile' && secretKey) {
    if (!params.captchaToken) {
      return { valid: false, reason: 'Turnstile CAPTCHA token is required.' };
    }
    try {
      const form = new URLSearchParams();
      form.set('secret', secretKey);
      form.set('response', params.captchaToken);
      if (params.remoteIp) form.set('remoteip', params.remoteIp);

      const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        body: form,
      });
      const json = (await resp.json().catch(() => ({}))) as { success?: boolean };
      return json.success
        ? { valid: true }
        : { valid: false, reason: 'Turnstile CAPTCHA verification failed.' };
    } catch {
      return { valid: false, reason: 'Turnstile verification service unreachable.' };
    }
  }

  if (config.provider === 'recaptcha' && secretKey) {
    if (!params.captchaToken) {
      return { valid: false, reason: 'reCAPTCHA verification token is required.' };
    }
    try {
      const form = new URLSearchParams();
      form.set('secret', secretKey);
      form.set('response', params.captchaToken);
      if (params.remoteIp) form.set('remoteip', params.remoteIp);

      const resp = await fetch('https://www.google.com/recaptcha/api/siteverify', {
        method: 'POST',
        body: form,
      });
      const json = (await resp.json().catch(() => ({}))) as { success?: boolean; score?: number };
      if (!json.success || (typeof json.score === 'number' && json.score < 0.5)) {
        return { valid: false, reason: 'reCAPTCHA verification failed.' };
      }
      return { valid: true };
    } catch {
      return { valid: false, reason: 'reCAPTCHA verification service unreachable.' };
    }
  }

  const captchaId = String(params.captchaId || '').trim();
  const captchaAnswer = String(params.captchaAnswer || '')
    .replace(/\s+/g, '')
    .toUpperCase();
  if (!captchaId || !captchaAnswer) {
    return { valid: false, reason: 'CAPTCHA challenge ID and verification code are required.' };
  }

  // Signed stateless + replay-protected cap1 token verification
  if (captchaId.startsWith('cap1.')) {
    const parts = captchaId.split('.');
    if (parts.length !== 5) {
      return { valid: false, reason: 'Invalid or expired CAPTCHA verification code.' };
    }
    const expiresAt = Number(parts[1]);
    const nonce = parts[2];
    const answerHash = parts[3];
    const sig = parts[4];
    const expectedSig = signCaptchaToken(expiresAt, nonce, answerHash);

    if (
      !Number.isFinite(expiresAt) ||
      !nonce ||
      !answerHash ||
      !verifyTimingSafeHex(expectedSig, sig)
    ) {
      return { valid: false, reason: 'Invalid or expired CAPTCHA verification code.' };
    }

    if (expiresAt < Date.now() || params.store.usedCaptchaNonces.has(nonce)) {
      params.store.captchaChallenges.delete(captchaId);
      return { valid: false, reason: 'Invalid or expired CAPTCHA verification code.' };
    }

    // Burn single-use CAPTCHA nonce immediately
    params.store.usedCaptchaNonces.add(nonce);
    if (params.store.usedCaptchaNonces.size > 5000) {
      const oldest = params.store.usedCaptchaNonces.values().next().value;
      if (oldest) params.store.usedCaptchaNonces.delete(oldest);
    }
    params.store.captchaChallenges.delete(captchaId);

    const candidateHash = hmacOtp(captchaAnswer, nonce);
    if (!verifyTimingSafeHex(candidateHash, answerHash)) {
      return { valid: false, reason: 'CAPTCHA verification code did not match.' };
    }

    return { valid: true };
  }

  const record = params.store.captchaChallenges.get(captchaId);
  // Single-use deletion immediately on read
  params.store.captchaChallenges.delete(captchaId);
  if (!record || record.expiresAt < Date.now()) {
    return { valid: false, reason: 'Invalid or expired CAPTCHA verification code.' };
  }

  if (hmacOtp(captchaAnswer, record.id) !== record.answerHash) {
    return { valid: false, reason: 'CAPTCHA verification code did not match.' };
  }

  return { valid: true };
}
