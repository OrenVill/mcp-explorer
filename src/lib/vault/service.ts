import { clearLegacyServers, type StoredServer } from '../storage';
import {
  buildCipherBlob,
  buildKdfParams,
  createNewVaultKey,
  decryptUtf8,
  encryptUtf8,
  envelopeFromParts,
  fromB64,
  unlockKeyFromEnvelope,
} from './crypto';
import { deleteVaultRecord, getVaultEnvelope, putVaultEnvelope } from './vaultPersistence';
import type { VaultEnvelope } from './types';

export type BootstrapPhase = 'needs-setup' | 'needs-unlock';

function parseStoredServers(jsonText: string): StoredServer[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('Vault data is unreadable. Please reset the vault.');
  }
  if (!Array.isArray(parsed)) {
    throw new Error('Vault data is invalid. Please reset the vault.');
  }
  return parsed as StoredServer[];
}

function requireEnvelope(envelope: VaultEnvelope | null): VaultEnvelope {
  if (!envelope) {
    throw new Error('Vault is not set up yet.');
  }
  return envelope;
}

export async function getBootstrapPhase(): Promise<BootstrapPhase> {
  const envelope = await getVaultEnvelope();
  return envelope ? 'needs-unlock' : 'needs-setup';
}

export async function createVault(
  passphrase: string,
  servers: StoredServer[],
): Promise<CryptoKey> {
  const { aesKey, salt, iterations } = await createNewVaultKey(passphrase);
  const payload = JSON.stringify(servers);
  const { iv, ciphertext } = await encryptUtf8(payload, aesKey);
  const envelope = envelopeFromParts(
    buildKdfParams(salt, iterations),
    buildCipherBlob(iv, ciphertext),
  );
  await putVaultEnvelope(envelope);
  clearLegacyServers();
  return aesKey;
}

export async function unlockVault(
  passphrase: string,
): Promise<{ aesKey: CryptoKey; servers: StoredServer[] }> {
  const envelope = requireEnvelope(await getVaultEnvelope());
  const aesKey = await unlockKeyFromEnvelope(passphrase, envelope);
  try {
    const ciphertext = new Uint8Array(fromB64(envelope.cipher.ciphertextB64));
    const plaintext = await decryptUtf8(
      aesKey,
      fromB64(envelope.cipher.ivB64),
      ciphertext,
    );
    return { aesKey, servers: parseStoredServers(plaintext) };
  } catch {
    throw new Error('Could not unlock vault. Check your passphrase or reset the vault.');
  }
}

export async function saveVault(
  aesKey: CryptoKey,
  servers: StoredServer[],
): Promise<void> {
  const envelope = requireEnvelope(await getVaultEnvelope());
  const payload = JSON.stringify(servers);
  const { iv, ciphertext } = await encryptUtf8(payload, aesKey);
  await putVaultEnvelope({
    ...envelope,
    cipher: buildCipherBlob(iv, ciphertext),
    updatedAt: new Date().toISOString(),
  });
}

export async function resetVault(): Promise<void> {
  await deleteVaultRecord();
  clearLegacyServers();
}
