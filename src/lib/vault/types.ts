import { FORMAT_VERSION } from './constants';

export interface VaultKdfParams {
  name: 'PBKDF2';
  hash: 'SHA-256';
  iterations: number;
  saltB64: string;
}

export interface VaultCipherBlob {
  name: 'AES-GCM';
  ivB64: string;
  /** Base64 of raw ciphertext bytes (AES-GCM tag included by Web Crypto). */
  ciphertextB64: string;
}

export interface VaultEnvelope {
  formatVersion: typeof FORMAT_VERSION;
  kdf: VaultKdfParams;
  cipher: VaultCipherBlob;
  updatedAt?: string;
}
