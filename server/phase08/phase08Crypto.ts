import crypto from 'node:crypto';
import { EncryptionKeyRingEntry } from './phase08Types.js';

const BASE_MASTER_MATERIAL =
  process.env.BACKUP_MASTER_KEY ||
  process.env.JWT_SECRET ||
  crypto
    .createHash('sha256')
    .update('mun-computer-phase08-backup-master-key-seed')
    .digest('hex');

/**
 * Derives a deterministic 32-byte AES-256 encryption key and a separate 32-byte HMAC-SHA256
 * signing key for a given keyVersion so prior backups ALWAYS remain decryptable after rotation.
 */
function deriveKeyMaterial(keyVersion: string): { encKey: Buffer; hmacKey: Buffer } {
  const encKey = crypto.scryptSync(
    `${BASE_MASTER_MATERIAL}:${keyVersion}`,
    `mun-aes-salt-${keyVersion}`,
    32,
    { N: 16384, r: 8, p: 1 }
  );
  const hmacKey = crypto
    .createHmac('sha256', BASE_MASTER_MATERIAL)
    .update(`mun-sig-${keyVersion}`)
    .digest();
  return { encKey, hmacKey };
}

const derivedKeyCache = new Map<string, { encKey: Buffer; hmacKey: Buffer }>();

export function getKeysForVersion(keyVersion: string): { encKey: Buffer; hmacKey: Buffer } {
  let cached = derivedKeyCache.get(keyVersion);
  if (!cached) {
    cached = deriveKeyMaterial(keyVersion);
    derivedKeyCache.set(keyVersion, cached);
  }
  return cached;
}

export interface EncryptedBackupEnvelope {
  version: 1;
  keyVersion: string;
  encryptionAlgo: 'AES-256-GCM';
  signatureAlgo: 'HMAC-SHA256';
  ivHex: string;
  authTagHex: string;
  ciphertextBase64: string;
  checksumSha256: string;
  signatureHmac: string;
}

export function encryptBackupSnapshot(
  snapshotJson: string,
  keyVersion: string
): {
  serializedBundle: string;
  envelope: EncryptedBackupEnvelope;
  fileSizeBytes: number;
} {
  const { encKey, hmacKey } = getKeysForVersion(keyVersion);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encKey, iv);
  const encrypted = Buffer.concat([cipher.update(snapshotJson, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const ciphertextBase64 = encrypted.toString('base64');

  const checksumSha256 = crypto.createHash('sha256').update(ciphertextBase64, 'utf8').digest('hex');
  const signatureHmac = crypto
    .createHmac('sha256', hmacKey)
    .update(`${keyVersion}:${iv.toString('hex')}:${authTag.toString('hex')}:${checksumSha256}`)
    .digest('hex');

  const envelope: EncryptedBackupEnvelope = {
    version: 1,
    keyVersion,
    encryptionAlgo: 'AES-256-GCM',
    signatureAlgo: 'HMAC-SHA256',
    ivHex: iv.toString('hex'),
    authTagHex: authTag.toString('hex'),
    ciphertextBase64,
    checksumSha256,
    signatureHmac,
  };

  const serializedBundle = JSON.stringify(envelope);
  return {
    serializedBundle,
    envelope,
    fileSizeBytes: Buffer.byteLength(serializedBundle, 'utf8'),
  };
}

export function verifyAndDecryptBackupBundle(
  serializedBundle: string,
  knownKeys: EncryptionKeyRingEntry[],
  expectedChecksumSha256?: string
): {
  checksumMatch: boolean;
  signatureMatch: boolean;
  decryptionOk: boolean;
  envelope: EncryptedBackupEnvelope;
  plaintextJson: string;
} {
  const envelope = JSON.parse(serializedBundle) as EncryptedBackupEnvelope;
  const computedSha = crypto
    .createHash('sha256')
    .update(String(envelope.ciphertextBase64 || ''), 'utf8')
    .digest('hex');
  const checksumMatch =
    computedSha === envelope.checksumSha256 &&
    (!expectedChecksumSha256 || expectedChecksumSha256 === computedSha);

  const keyRegistered = knownKeys.some((k) => k.keyVersion === envelope.keyVersion);
  if (!keyRegistered) {
    throw new Error(`Encryption key version ${envelope.keyVersion} is not in active/retired key ring.`);
  }

  const { encKey, hmacKey } = getKeysForVersion(envelope.keyVersion);
  const expectedSig = crypto
    .createHmac('sha256', hmacKey)
    .update(
      `${envelope.keyVersion}:${envelope.ivHex}:${envelope.authTagHex}:${envelope.checksumSha256}`
    )
    .digest('hex');

  const signatureMatch = crypto.timingSafeEqual(
    Buffer.from(expectedSig, 'hex'),
    Buffer.from(String(envelope.signatureHmac || ''), 'hex')
  );

  if (!checksumMatch) {
    throw new Error('Backup integrity verification failed: SHA-256 checksum mismatch.');
  }
  if (!signatureMatch) {
    throw new Error('Backup signature verification failed: HMAC-SHA256 mismatch.');
  }

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    encKey,
    Buffer.from(envelope.ivHex, 'hex')
  );
  decipher.setAuthTag(Buffer.from(envelope.authTagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertextBase64, 'base64')),
    decipher.final(),
  ]);

  return {
    checksumMatch,
    signatureMatch,
    decryptionOk: true,
    envelope,
    plaintextJson: decrypted.toString('utf8'),
  };
}

/**
 * Privacy-conscious device parser (uses User-Agent & client device label without invasive canvas/audio fingerprinting).
 */
export function parsePrivacyDeviceMetadata(
  userAgent?: string,
  clientDeviceLabel?: string
): {
  deviceId: string;
  deviceName: string;
  browserInfo: string;
  osInfo: string;
} {
  const ua = String(userAgent || 'Unknown Client').slice(0, 220);

  let browserInfo = 'Generic Client';
  if (/Edg\//i.test(ua)) browserInfo = 'Microsoft Edge';
  else if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) browserInfo = 'Google Chrome';
  else if (/Firefox\//i.test(ua)) browserInfo = 'Mozilla Firefox';
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browserInfo = 'Apple Safari';
  else if (/node|undici|curl|axios|tsx/i.test(ua)) browserInfo = 'API Client';

  let osInfo = 'Unknown OS';
  if (/Windows NT/i.test(ua)) osInfo = 'Windows';
  else if (/Android/i.test(ua)) osInfo = 'Android';
  else if (/iPhone|iPad|iOS/i.test(ua)) osInfo = 'iOS';
  else if (/Mac OS X/i.test(ua)) osInfo = 'macOS';
  else if (/Linux/i.test(ua)) osInfo = 'Linux';

  const cleanLabel = String(clientDeviceLabel || '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, 64);
  const deviceName = cleanLabel || `${browserInfo} on ${osInfo}`;
  const deviceId = `DEV-${crypto
    .createHash('sha256')
    .update(`${osInfo}|${browserInfo}|${cleanLabel || ua.slice(0, 80)}`)
    .digest('hex')
    .slice(0, 12)
    .toUpperCase()}`;

  return { deviceId, deviceName, browserInfo, osInfo };
}
