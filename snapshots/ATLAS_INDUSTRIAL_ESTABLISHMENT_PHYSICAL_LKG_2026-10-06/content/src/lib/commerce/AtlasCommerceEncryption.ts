/**
 * ATLAS COMMERCE SECURITY & ENCRYPTION ENGINE
 * AES-256-GCM for sensitive Mercado Pago access/refresh tokens.
 * Cryptographic state generator for OAuth CSRF protection.
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // Standard for GCM
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const secret = process.env.ATLAS_COMMERCE_SECRET || process.env.SUPABASE_SECRET_KEY || 'atlas-commerce-safe-key-default-2026';
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypts a sensitive string (MP access token / refresh token) using AES-256-GCM.
 * Output format: iv:authTag:encryptedHex
 */
export function encryptToken(plainText: string): string {
  if (!plainText) return '';
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts a token encrypted with encryptToken.
 */
export function decryptToken(encryptedPayload: string): string {
  if (!encryptedPayload) return '';
  const parts = encryptedPayload.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted payload structure');
  }

  const key = getEncryptionKey();
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const cipherText = parts[2];

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(cipherText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Generates an OAuth state containing userId, timestamp, and an HMAC-SHA256 signature.
 * Prevents CSRF and tampering.
 */
export function generateOAuthState(userId: string): string {
  const key = getEncryptionKey();
  const nonce = crypto.randomBytes(8).toString('hex');
  const payload = `${userId}:${Date.now()}:${nonce}`;
  const hmac = crypto.createHmac('sha256', key).update(payload).digest('hex');
  return Buffer.from(`${payload}:${hmac}`).toString('base64url');
}

/**
 * Verifies an OAuth state string and returns the authenticated userId, or null if invalid/expired.
 */
export function verifyOAuthState(state: string, maxAgeMs = 15 * 60 * 1000): string | null {
  try {
    const raw = Buffer.from(state, 'base64url').toString('utf8');
    const parts = raw.split(':');
    if (parts.length !== 4) return null;

    const [userId, tsStr, nonce, receivedHmac] = parts;
    const timestamp = parseInt(tsStr, 10);
    if (isNaN(timestamp) || Date.now() - timestamp > maxAgeMs) {
      return null; // Expired
    }

    const key = getEncryptionKey();
    const payload = `${userId}:${tsStr}:${nonce}`;
    const expectedHmac = crypto.createHmac('sha256', key).update(payload).digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(receivedHmac), Buffer.from(expectedHmac))) {
      return null; // Signature mismatch
    }

    return userId;
  } catch {
    return null;
  }
}
