import { describe, expect, test } from 'vitest';
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

describe('vault crypto', () => {
  test('round-trips UTF-8 JSON', async () => {
    const passphrase = 'correct horse battery staple';
    const payload = JSON.stringify({ hello: '世界', emoji: '🎉', n: 42 });

    const { aesKey, salt, iterations } = await createNewVaultKey(passphrase);
    const { iv, ciphertext } = await encryptUtf8(payload, aesKey);
    const envelope = envelopeFromParts(buildKdfParams(salt, iterations), buildCipherBlob(iv, ciphertext));

    const unlockedKey = await unlockKeyFromEnvelope(passphrase, envelope);
    const ivDecoded = fromB64(envelope.cipher.ivB64);
    const ctDecoded = fromB64(envelope.cipher.ciphertextB64);
    const ciphertextBuf = ctDecoded.buffer.slice(
      ctDecoded.byteOffset,
      ctDecoded.byteOffset + ctDecoded.byteLength,
    ) as ArrayBuffer;

    const roundTrip = await decryptUtf8(unlockedKey, ivDecoded, ciphertextBuf);
    expect(roundTrip).toBe(payload);
  });

  test('fails decrypt with wrong passphrase', async () => {
    const passphrase = 'right-password';

    const { aesKey, salt, iterations } = await createNewVaultKey(passphrase);
    const { iv, ciphertext } = await encryptUtf8('{"x":1}', aesKey);
    const envelope = envelopeFromParts(buildKdfParams(salt, iterations), buildCipherBlob(iv, ciphertext));

    const wrongKey = await unlockKeyFromEnvelope('wrong-password', envelope);
    const ivDecoded = fromB64(envelope.cipher.ivB64);
    const ctDecoded = fromB64(envelope.cipher.ciphertextB64);
    const ciphertextBuf = ctDecoded.buffer.slice(
      ctDecoded.byteOffset,
      ctDecoded.byteOffset + ctDecoded.byteLength,
    ) as ArrayBuffer;

    await expect(decryptUtf8(wrongKey, ivDecoded, ciphertextBuf)).rejects.toThrow();
  });
});
