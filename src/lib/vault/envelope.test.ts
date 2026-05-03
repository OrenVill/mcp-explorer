import { describe, expect, it } from 'vitest';
import { isVaultEnvelope, parseVaultEnvelope } from './envelope';
import { FORMAT_VERSION } from './constants';
import type { VaultEnvelope } from './types';

const minimal: VaultEnvelope = {
  formatVersion: FORMAT_VERSION,
  kdf: {
    name: 'PBKDF2',
    hash: 'SHA-256',
    iterations: 310_000,
    saltB64: 'c2FsdA==',
  },
  cipher: {
    name: 'AES-GCM',
    ivB64: 'aXY=',
    ciphertextB64: 'ZGF0YQ==',
  },
};

describe('isVaultEnvelope', () => {
  it('accepts a minimal valid envelope', () => {
    expect(isVaultEnvelope(minimal)).toBe(true);
  });

  it('rejects wrong format version', () => {
    expect(isVaultEnvelope({ ...minimal, formatVersion: 'x' })).toBe(false);
  });

  it('rejects empty blobs', () => {
    expect(
      isVaultEnvelope({
        ...minimal,
        cipher: { name: 'AES-GCM', ivB64: '', ciphertextB64: 'eA==' },
      }),
    ).toBe(false);
  });

  it('rejects arbitrary objects', () => {
    expect(isVaultEnvelope({})).toBe(false);
    expect(isVaultEnvelope({ formatVersion: FORMAT_VERSION })).toBe(false);
  });
});

describe('parseVaultEnvelope', () => {
  it('returns null for invalid input', () => {
    expect(parseVaultEnvelope(null)).toBeNull();
    expect(parseVaultEnvelope({})).toBeNull();
  });

  it('returns the envelope when valid', () => {
    expect(parseVaultEnvelope(minimal)).toEqual(minimal);
  });
});
