import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

const BCRYPT_COST = Math.max(
  10,
  Math.min(14, Number(process.env.BCRYPT_COST || 12))
);

const SERVER_SECRET =
  process.env.SESSION_SECRET ||
  process.env.JWT_SECRET ||
  crypto
    .createHash('sha256')
    .update('mun-computer-phase02-dev-secret-key')
    .digest('hex');

const AES_KEY = crypto
  .createHash('sha256')
  .update(SERVER_SECRET + ':aadhaar-aes-256')
  .digest();

const TOTP_AES_KEY = (() => {
  const raw = (process.env.TOTP_ENCRYPTION_KEY || '').trim();
  if (raw.length === 64 && /^[0-9a-fA-F]+$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  if (raw.length > 0) {
    return crypto.createHash('sha256').update(raw).digest();
  }
  return crypto
    .createHash('sha256')
    .update(SERVER_SECRET + ':totp-secret-aes-256')
    .digest();
})();

/**
 * Bcrypt cost-12 password hashing (never plaintext).
 */
export function hashPassword(password: string): string {
  const salt = bcrypt.genSaltSync(BCRYPT_COST);
  return bcrypt.hashSync(password, salt);
}

/**
 * Timing-safe password verification supporting bcrypt ($2a$/$2b$/$2y$) and legacy scrypt$16384$ hashes.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  if (!password || !storedHash) return false;
  if (storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$') || storedHash.startsWith('$2y$')) {
    try {
      return bcrypt.compareSync(password, storedHash);
    } catch {
      return false;
    }
  }
  const parts = storedHash.split('$');
  if (parts.length !== 4 || parts[0] !== 'scrypt') return false;
  const salt = parts[2];
  const expectedHex = parts[3];
  const derived = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(derived, expectedBuf);
}

/**
 * AES-256-GCM authenticated encryption for optional Aadhaar numbers.
 */
export function encryptSensitiveField(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', AES_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptSensitiveField(payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(':');
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error('Malformed encrypted payload');
  }
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    AES_KEY,
    Buffer.from(ivHex, 'hex')
  );
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

/**
 * AES-256-GCM authenticated encryption dedicated to TOTP secrets using TOTP_ENCRYPTION_KEY.
 */
export function encryptTotpSecret(base32Secret: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', TOTP_AES_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(base32Secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v2:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptTotpSecret(payload: string): string {
  if (!payload.startsWith('v2:')) {
    return decryptSensitiveField(payload);
  }
  const [, ivHex, tagHex, dataHex] = payload.split(':');
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error('Malformed encrypted TOTP payload');
  }
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    TOTP_AES_KEY,
    Buffer.from(ivHex, 'hex')
  );
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

export function generateRecoveryCodes(count = 8): string[] {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const codes: string[] = [];
  for (let i = 0; i < count; i += 1) {
    let raw = '';
    for (let j = 0; j < 8; j += 1) {
      raw += alphabet[crypto.randomInt(0, alphabet.length)];
    }
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4)}`);
  }
  return codes;
}

export function hashRecoveryCode(code: string): string {
  const normalized = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return crypto
    .createHmac('sha256', SERVER_SECRET)
    .update(`recovery:${normalized}`)
    .digest('hex');
}

export function verifyTimingSafeHex(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

export function maskAadhaar(last4?: string): string {
  if (!last4) return 'Not Provided';
  return `XXXX-XXXX-${last4}`;
}

export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function hmacOtp(otp: string, challengeId: string): string {
  return crypto
    .createHmac('sha256', SERVER_SECRET)
    .update(`${challengeId}:${otp}`)
    .digest('hex');
}

export function generateNumericOtp(digits = 6): string {
  const min = 10 ** (digits - 1);
  const max = 10 ** digits;
  return String(crypto.randomInt(min, max));
}

export function generateToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

export function generateCaptchaChallenge(): {
  id: string;
  answerHash: string;
  svg: string;
  questionHint: string;
} {
  const chars = 'ACDEFHJKMNPRTUVWXY34679';
  let code = '';
  for (let i = 0; i < 5; i += 1) {
    code += chars[crypto.randomInt(0, chars.length)];
  }
  const id = generateToken(12);
  const answerHash = hmacOtp(code.toUpperCase(), id);

  const svgLetters = code
    .split('')
    .map((ch, idx) => {
      const x = 22 + idx * 30;
      const y = 31 + (idx % 2 === 0 ? -2 : 2);
      const rot = idx % 2 === 0 ? -5 : 5;
      return `<text x="${x}" y="${y}" transform="rotate(${rot} ${x} ${y})" font-family="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" font-size="23" font-weight="700" fill="#0a0a0a">${ch}</text>`;
    })
    .join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="176" height="48" viewBox="0 0 176 48" role="img" aria-label="Security verification code">
    <rect width="176" height="48" rx="6" fill="#fafafa" stroke="#e5e5e5"/>
    <line x1="8" y1="12" x2="168" y2="16" stroke="#e4e4e7" stroke-width="1"/>
    <line x1="10" y1="38" x2="166" y2="34" stroke="#e4e4e7" stroke-width="1"/>
    ${svgLetters}
  </svg>`;

  return {
    id,
    answerHash,
    svg,
    questionHint: 'Enter the 5-character code',
  };
}

export function parseCookies(cookieHeader?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!cookieHeader) return out;
  cookieHeader.split(';').forEach((pair) => {
    const idx = pair.indexOf('=');
    if (idx > -1) {
      const key = pair.slice(0, idx).trim();
      const val = pair.slice(idx + 1).trim();
      out[key] = decodeURIComponent(val);
    }
  });
  return out;
}

export function sanitizeText(value: string): string {
  return value.replace(/[<>]/g, '').trim();
}
