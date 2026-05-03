import { FORMAT_VERSION } from './constants';
import type { VaultEnvelope } from './types';

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

/** Runtime guard so HTML or arbitrary JSON is never treated as a vault envelope. */
export function isVaultEnvelope(value: unknown): value is VaultEnvelope {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  if (o.formatVersion !== FORMAT_VERSION) return false;

  const kdf = o.kdf;
  if (!kdf || typeof kdf !== 'object') return false;
  const k = kdf as Record<string, unknown>;
  if (k.name !== 'PBKDF2' || k.hash !== 'SHA-256') return false;
  if (typeof k.iterations !== 'number' || !Number.isFinite(k.iterations) || k.iterations < 1) {
    return false;
  }
  if (!isNonEmptyString(k.saltB64)) return false;

  const cipher = o.cipher;
  if (!cipher || typeof cipher !== 'object') return false;
  const c = cipher as Record<string, unknown>;
  if (c.name !== 'AES-GCM') return false;
  if (!isNonEmptyString(c.ivB64) || !isNonEmptyString(c.ciphertextB64)) return false;

  if (o.updatedAt !== undefined && typeof o.updatedAt !== 'string') return false;

  return true;
}

export function parseVaultEnvelope(value: unknown): VaultEnvelope | null {
  return isVaultEnvelope(value) ? value : null;
}
