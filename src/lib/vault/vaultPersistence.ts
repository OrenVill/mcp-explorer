/**
 * Primary: encrypted vault JSON on disk via the local dev/preview server (`vault-file-handler.js`).
 * Fallback: IndexedDB (file://, or if the app is not served with the Node/Vite API).
 * One-time: if the file is missing (404) but IndexedDB has a vault, we PUT to the file and clear IDB.
 */
import { VAULT_HTTP_PATH } from './constants';
import { parseVaultEnvelope } from './envelope';
import type { VaultEnvelope } from './types';
import * as idb from './idb';

function prefersVaultFileApi(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.protocol !== 'file:';
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** When the server has no file yet, move an existing IDB vault to disk. */
async function migrateIdbToFileIfPresent(
  idbEnv: VaultEnvelope | null,
): Promise<VaultEnvelope | null> {
  if (!idbEnv) return null;
  try {
    const res = await fetch(VAULT_HTTP_PATH, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(idbEnv),
    });
    if (res.ok) await idb.deleteVaultRecord().catch(() => {});
  } catch {
    /* keep IDB as source of truth */
  }
  return idbEnv;
}

export async function getVaultEnvelope(): Promise<VaultEnvelope | null> {
  if (!prefersVaultFileApi()) {
    const raw = await idb.getVaultEnvelope();
    return parseVaultEnvelope(raw);
  }

  const [idbRaw, res] = await Promise.all([
    idb.getVaultEnvelope(),
    fetch(VAULT_HTTP_PATH, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    }).catch(() => null),
  ]);

  const idbEnv = parseVaultEnvelope(idbRaw);

  if (!res) {
    return idbEnv;
  }

  const ct = res.headers.get('content-type') ?? '';
  let text: string;
  try {
    text = await res.text();
  } catch {
    return idbEnv;
  }

  const parsedJson =
    res.ok && ct.includes('application/json') && text.trim()
      ? safeJsonParse(text)
      : null;
  const httpEnv = parseVaultEnvelope(parsedJson);

  if (res.ok && ct.includes('application/json')) {
    if (httpEnv) {
      await idb.deleteVaultRecord().catch(() => {});
      return httpEnv;
    }
    return idbEnv;
  }

  if (res.status === 404 && ct.includes('application/json')) {
    return migrateIdbToFileIfPresent(idbEnv);
  }

  return idbEnv;
}

export async function putVaultEnvelope(envelope: VaultEnvelope): Promise<void> {
  if (!prefersVaultFileApi()) {
    return idb.putVaultEnvelope(envelope);
  }
  try {
    const res = await fetch(VAULT_HTTP_PATH, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(envelope),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(t || `HTTP ${res.status}`);
    }
    await idb.deleteVaultRecord().catch(() => {});
  } catch {
    await idb.putVaultEnvelope(envelope);
  }
}

export async function deleteVaultRecord(): Promise<void> {
  if (!prefersVaultFileApi()) {
    return idb.deleteVaultRecord();
  }
  try {
    await fetch(VAULT_HTTP_PATH, { method: 'DELETE' });
  } catch {
    /* still clear IDB */
  }
  await idb.deleteVaultRecord();
}
