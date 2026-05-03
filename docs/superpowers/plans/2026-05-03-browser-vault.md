# Browser encrypted vault — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist MCP Explorer servers (including `ServerAuth`) in an **AES-GCM encrypted vault** in **IndexedDB**, unlocked by a **passphrase** derived via **PBKDF2**, with **legacy localStorage migration** and a **lock screen** gating the UI.

**Architecture:** A small `src/lib/vault/` module owns **envelope types**, **Web Crypto** (derive → encrypt/decrypt), and **IndexedDB** I/O. `App.tsx` (or a thin `VaultGate` wrapper) holds **`CryptoKey` only while unlocked** (React `useRef` recommended so it does not trigger re-renders on every render); **autosave** on server list changes encrypts the full JSON payload and writes one IDB record. **Legacy** `mcp-explorer.servers.v1` is read once for migration and **removed only after** the first successful encrypted write.

**Tech Stack:** React 19, TypeScript, Vite 8, Web Crypto (`crypto.subtle`), IndexedDB (native API), **Vitest** (Node test environment using global `crypto` from Node 20+).

**Spec:** [`docs/superpowers/specs/2026-05-03-browser-vault-design.md`](../specs/2026-05-03-browser-vault-design.md)

---

## File map

| File | Responsibility |
|------|----------------|
| `src/lib/vault/constants.ts` | `FORMAT_VERSION`, `PBKDF2_ITERATIONS`, IDB names, legacy localStorage key |
| `src/lib/vault/types.ts` | `VaultEnvelope`, `StoredServer` re-export or alias matching current persisted shape |
| `src/lib/vault/crypto.ts` | PBKDF2 derive → `CryptoKey`, AES-GCM encrypt/decrypt UTF-8 JSON strings |
| `src/lib/vault/idb.ts` | Open DB, `getEnvelope`, `putEnvelope`, `deleteVault`, single-object-store API |
| `src/lib/vault/service.ts` | `bootstrapState()`, `unlock()`, `createVaultAndMigrate()`, `saveServers()`, `resetVault()`, error types |
| `src/components/VaultSetup.tsx` | First-run / set passphrase + confirm (and optional migration banner copy) |
| `src/components/VaultUnlock.tsx` | Passphrase form for existing vault |
| `src/components/VaultLockButton.tsx` | Header control calling `onLock` |
| `src/App.tsx` | Orchestrate locked vs unlocked; remove direct `loadInitial` from plaintext path; wire autosave |
| `src/lib/storage.ts` | Keep **legacy** `loadLegacyServers()` / `clearLegacyServers()` for migration only; **stop** writing plaintext on every change |
| `vite.config.ts` | Merge Vitest config (`test.environment: 'node'`) |
| `package.json` | Add `vitest`, script `test` |
| `src/lib/vault/crypto.test.ts` | Round-trip + wrong passphrase rejection |

---

### Task 1: Add Vitest (Node crypto)

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Create: `src/lib/vault/.gitkeep` (optional; remove when Task 2 adds files)

- [ ] **Step 1: Install dev dependency**

Run:

```bash
cd /home/oren/code/mcp-explorer && npm install -D vitest
```

Expected: `package.json` lists `"vitest"` under `devDependencies`.

- [ ] **Step 2: Add npm script**

In `package.json`, inside `"scripts"` add:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Extend Vite config for Vitest**

In `vite.config.ts`, switch the `defineConfig` import to Vitest’s re-export (includes Vite + `test` options) and add a `test` block:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { handleMcpProxy, PROXY_PATH } from './proxy.js';
import type { PluginOption } from 'vite';

// ... keep mcpProxyPlugin unchanged ...

export default defineConfig({
  plugins: [react(), tailwindcss(), mcpProxyPlugin()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

If TypeScript complains about `test`, ensure `vitest` is installed and `@types/node` is present (already in devDependencies).

- [ ] **Step 4: Verify runner**

Run:

```bash
npm run test
```

Expected: exits 0 with “No test files found” or similar until tests exist.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vite.config.ts
git commit -m "chore: add vitest for vault crypto tests"
```

---

### Task 2: Vault constants and envelope types

**Files:**
- Create: `src/lib/vault/constants.ts`
- Create: `src/lib/vault/types.ts`

- [ ] **Step 1: Add `constants.ts`**

```ts
/** localStorage key for pre-vault plaintext list (legacy). */
export const LEGACY_SERVERS_STORAGE_KEY = 'mcp-explorer.servers.v1';

export const IDB_NAME = 'mcp-explorer';
export const IDB_STORE = 'vault';
export const IDB_RECORD_KEY = 'encrypted-servers';

export const FORMAT_VERSION = 'vault-v1' as const;

/** Tunable; spec suggests ≥ 310k — balance UX on slow devices. */
export const PBKDF2_ITERATIONS = 310_000;
```

- [ ] **Step 2: Add `types.ts`**

```ts
import type { FORMAT_VERSION } from './constants';

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
```

Import `FORMAT_VERSION` as value + type — adjust if ESLint complains (use `import { FORMAT_VERSION } from './constants'` and `formatVersion: typeof FORMAT_VERSION` or literal `'vault-v1'`).

- [ ] **Step 3: Commit**

```bash
git add src/lib/vault/constants.ts src/lib/vault/types.ts
git commit -m "feat(vault): add constants and envelope types"
```

---

### Task 3: Web Crypto — encrypt / decrypt / derive

**Files:**
- Create: `src/lib/vault/crypto.ts`

- [ ] **Step 1: Implement helpers**

Full file `src/lib/vault/crypto.ts`:

```ts
import { PBKDF2_ITERATIONS } from './constants';
import type { VaultCipherBlob, VaultKdfParams, VaultEnvelope } from './types';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function randomBytes(length: number): Uint8Array {
  const b = new Uint8Array(length);
  crypto.getRandomValues(b);
  return b;
}

function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  bytes.forEach((x) => {
    binary += String.fromCharCode(x);
  });
  return btoa(binary);
}

function fromB64(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export async function deriveAesGcmKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptUtf8(
  plaintext: string,
  aesKey: CryptoKey,
): Promise<{ iv: Uint8Array; ciphertext: ArrayBuffer }> {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    textEncoder.encode(plaintext),
  );
  return { iv, ciphertext: ct };
}

export async function decryptUtf8(
  aesKey: CryptoKey,
  iv: Uint8Array,
  ciphertext: ArrayBuffer,
): Promise<string> {
  const buf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    ciphertext,
  );
  return textDecoder.decode(buf);
}

export function buildKdfParams(salt: Uint8Array, iterations: number): VaultKdfParams {
  return {
    name: 'PBKDF2',
    hash: 'SHA-256',
    iterations,
    saltB64: toB64(salt),
  };
}

export function buildCipherBlob(
  iv: Uint8Array,
  ciphertext: ArrayBuffer,
): VaultCipherBlob {
  return {
    name: 'AES-GCM',
    ivB64: toB64(iv),
    ciphertextB64: toB64(ciphertext),
  };
}

export function envelopeFromParts(
  kdf: VaultKdfParams,
  cipher: VaultCipherBlob,
): VaultEnvelope {
  return {
    formatVersion: 'vault-v1',
    kdf,
    cipher,
    updatedAt: new Date().toISOString(),
  };
}

export async function createNewVaultKey(passphrase: string): Promise<{
  aesKey: CryptoKey;
  salt: Uint8Array;
  iterations: number;
}> {
  const salt = randomBytes(16);
  const iterations = PBKDF2_ITERATIONS;
  const aesKey = await deriveAesGcmKey(passphrase, salt, iterations);
  return { aesKey, salt, iterations };
}

export async function unlockKeyFromEnvelope(
  passphrase: string,
  envelope: VaultEnvelope,
): Promise<CryptoKey> {
  const salt = fromB64(envelope.kdf.saltB64);
  return deriveAesGcmKey(passphrase, salt, envelope.kdf.iterations);
}
```

Ensure `FORMAT_VERSION` import is consistent with `types.ts` — use string literal `'vault-v1'` in `envelopeFromParts` or import constant.

- [ ] **Step 2: Run TypeScript build**

```bash
npm run build
```

Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/lib/vault/crypto.ts
git commit -m "feat(vault): add Web Crypto derive and AES-GCM helpers"
```

---

### Task 4: Failing test + round-trip for vault crypto

**Files:**
- Create: `src/lib/vault/crypto.test.ts`

- [ ] **Step 1: Write test**

```ts
import { describe, expect, it } from 'vitest';
import {
  createNewVaultKey,
  decryptUtf8,
  encryptUtf8,
  envelopeFromParts,
  buildCipherBlob,
  buildKdfParams,
  unlockKeyFromEnvelope,
} from './crypto';

describe('vault crypto', () => {
  it('round-trips UTF-8 JSON', async () => {
    const passphrase = 'correct horse battery staple';
    const { aesKey, salt, iterations } = await createNewVaultKey(passphrase);
    const payload = JSON.stringify([{ id: 'a', name: 'Test' }]);
    const { iv, ciphertext } = await encryptUtf8(payload, aesKey);
    const kdf = buildKdfParams(salt, iterations);
    const cipher = buildCipherBlob(iv, ciphertext);
    const envelope = envelopeFromParts(kdf, cipher);

    const key2 = await unlockKeyFromEnvelope(passphrase, envelope);
    const iv2 = Uint8Array.from(atob(envelope.cipher.ivB64), (c) => c.charCodeAt(0));
    const ctBuf = Uint8Array.from(atob(envelope.cipher.ciphertextB64), (c) =>
      c.charCodeAt(0),
    ).buffer;
    const plain = await decryptUtf8(key2, iv2, ctBuf);
    expect(plain).toBe(payload);
  });

  it('fails decrypt with wrong passphrase', async () => {
    const { aesKey, salt, iterations } = await createNewVaultKey('secret-one');
    const { iv, ciphertext } = await encryptUtf8('{}', aesKey);
    const envelope = envelopeFromParts(buildKdfParams(salt, iterations), buildCipherBlob(iv, ciphertext));
    const badKey = await unlockKeyFromEnvelope('secret-two', envelope);
    const iv2 = Uint8Array.from(atob(envelope.cipher.ivB64), (c) => c.charCodeAt(0));
    const ctBuf = Uint8Array.from(atob(envelope.cipher.ciphertextB64), (c) =>
      c.charCodeAt(0),
    ).buffer;
    await expect(decryptUtf8(badKey, iv2, ctBuf)).rejects.toThrow();
  });
});
```

Use shared `fromB64` if exported or duplicate minimal base64 decode — prefer exporting `parseEnvelopeToBuffers(envelope)` from `crypto.ts` in a follow-up refactor to avoid duplication (optional in same task).

- [ ] **Step 2: Run tests**

```bash
npm run test
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/vault/crypto.test.ts
git commit -m "test(vault): crypto round-trip and wrong passphrase"
```

---

### Task 5: IndexedDB persistence layer

**Files:**
- Create: `src/lib/vault/idb.ts`

- [ ] **Step 1: Implement IDB helpers**

```ts
import { IDB_NAME, IDB_RECORD_KEY, IDB_STORE } from './constants';
import type { VaultEnvelope } from './types';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

export async function getVaultEnvelope(): Promise<VaultEnvelope | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const store = tx.objectStore(IDB_STORE);
    const g = store.get(IDB_RECORD_KEY);
    g.onerror = () => reject(g.error);
    g.onsuccess = () => resolve((g.result as VaultEnvelope | undefined) ?? null);
    tx.oncomplete = () => db.close();
  });
}

export async function putVaultEnvelope(envelope: VaultEnvelope): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(envelope, IDB_RECORD_KEY);
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
  });
}

export async function deleteVaultRecord(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(IDB_RECORD_KEY);
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
  });
}
```

Note: **Vitest Node env has no `indexedDB`** — do **not** unit-test `idb.ts` in Node without `fake-indexeddb` (defer to manual / future). Plan stays YAGNI: no fake-indexeddb in v1 unless needed.

- [ ] **Step 2: Commit**

```bash
git add src/lib/vault/idb.ts
git commit -m "feat(vault): IndexedDB read/write/delete envelope"
```

---

### Task 6: Vault service (bootstrap, unlock, save, reset, migration)

**Files:**
- Create: `src/lib/vault/service.ts`
- Modify: `src/lib/storage.ts`
- Modify: `src/types.ts` (only if a shared `StoredServer` type is needed — optional)

- [ ] **Step 1: Slim legacy API in `storage.ts`**

Replace unconditional save with explicit legacy helpers used **only** during migration / transitional period:

```ts
import type { ServerEntry } from '../types';

export const LEGACY_SERVERS_STORAGE_KEY = 'mcp-explorer.servers.v1';

export type StoredServer = Pick<
  ServerEntry,
  'id' | 'name' | 'url' | 'description' | 'custom' | 'auth'
>;

export function loadLegacyServers(): StoredServer[] | null {
  try {
    const raw = localStorage.getItem(LEGACY_SERVERS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed as StoredServer[];
  } catch {
    return null;
  }
}

export function clearLegacyServers(): void {
  try {
    localStorage.removeItem(LEGACY_SERVERS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
```

Remove `saveServers` from this file once `App` uses vault service exclusively (same task).

- [ ] **Step 2: Implement `service.ts` façade**

Key exports:

- `export type BootstrapPhase = 'loading' | 'needs-setup' | 'needs-unlock' | 'ready';`

- `getBootstrapPhase(): Promise<'needs-setup' | 'needs-unlock'>` — `needs-unlock` if `getVaultEnvelope()` non-null; else `needs-setup`.

- `loadLegacyList(): StoredServer[] | null` — delegate `loadLegacyServers()`.

- `createVault(passphrase: string, servers: StoredServer[]): Promise<CryptoKey>` — generate salt/key, encrypt `JSON.stringify(servers)`, build envelope, `putVaultEnvelope`, then `clearLegacyServers()` **only after** successful put.

- `unlockVault(passphrase: string): Promise<{ aesKey: CryptoKey; servers: StoredServer[] }>` — `getVaultEnvelope`, derive key, decrypt, `JSON.parse`.

- `saveVault(aesKey: CryptoKey, servers: StoredServer[]): Promise<void>` — re-read envelope from IDB (for salt/iterations) OR pass salt/iterations alongside aesKey — **simplest:** store `{ aesKey }` in ref plus **last envelope** in ref after unlock to avoid re-fetch; on save, **new random IV** each time, keep same kdf params, encrypt new JSON, `putVaultEnvelope` updated envelope.

  Simpler implementation: **always** `getVaultEnvelope()` before save to copy `kdf` fields, then replace only `cipher` + `updatedAt`.

- `resetVault(): Promise<void>` — `deleteVaultRecord`, `clearLegacyServers`.

Use imports from `./crypto`, `./idb`, `./types`, and `../storage` for legacy.

Parse decrypted JSON as `StoredServer[]` with runtime check `Array.isArray`.

- [ ] **Step 3: Run build**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/vault/service.ts src/lib/storage.ts
git commit -m "feat(vault): service layer and legacy storage split"
```

---

### Task 7: UI — setup, unlock, lock button

**Files:**
- Create: `src/components/VaultSetup.tsx`
- Create: `src/components/VaultUnlock.tsx`
- Create: `src/components/VaultLockButton.tsx`

- [ ] **Step 1: `VaultUnlock.tsx`**

Props: `onUnlock: (passphrase: string) => Promise<void>`, `error: string | null`, `busy: boolean`.

UI: password input, Submit, display generic error on failure.

- [ ] **Step 2: `VaultSetup.tsx`**

Props: `onCreate: (passphrase: string) => Promise<void>`, `migrationHint: boolean`, `error`, `busy`.

UI: passphrase + confirm; disable submit if mismatch; optional short note when `migrationHint` that legacy data will be encrypted.

- [ ] **Step 3: `VaultLockButton.tsx`**

Props: `onLock: () => void` — calls parent to clear key and set phase locked.

- [ ] **Step 4: Commit**

```bash
git add src/components/VaultSetup.tsx src/components/VaultUnlock.tsx src/components/VaultLockButton.tsx
git commit -m "feat(vault): setup, unlock, and lock UI components"
```

---

### Task 8: Wire `App.tsx` — gate, autosave, migration

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Replace initial load**

Remove `useEffect` that calls `saveServers(servers)` from plaintext storage.

State machine:

- `phase: 'loading' | 'needs-setup' | 'needs-unlock' | 'ready'`
- `aesKeyRef = useRef<CryptoKey | null>(null)` — **never** store raw passphrase in state.

On mount `useEffect`:

```ts
void (async () => {
  const phase = await getBootstrapPhase();
  if (phase === 'needs-unlock') setPhase('needs-unlock');
  else setPhase('needs-setup');
})();
```

- [ ] **Step 2: Render gates**

- `loading` → full-screen spinner text “Loading…”
- `needs-setup` → `<VaultSetup migrationHint={!!loadLegacyServers()?.length} onCreate={...} />` — `onCreate` calls `createVault`, sets `aesKeyRef`, hydrates `servers` from legacy or `[]`, sets `ready` (import `loadLegacyServers` from `src/lib/storage.ts` or re-export from `service.ts`).
- `needs-unlock` → `<VaultUnlock ... />` — on success set servers + `aesKeyRef` + `ready`.
- `ready` → existing layout + `<VaultLockButton onLock={...} />` — on lock: `disconnect` all connected ids (reuse existing disconnect), clear servers state or reset to empty, clear `aesKeyRef`, set `needs-unlock`.

- [ ] **Step 3: Encrypted autosave**

When `phase === 'ready'` and `servers` changes, `useEffect` depends on `[servers, phase]`:

```ts
useEffect(() => {
  if (phase !== 'ready' || !aesKeyRef.current) return;
  void saveVault(aesKeyRef.current, toStoredServers(servers));
}, [servers, phase]);
```

Implement `toStoredServers` mapping stripping `status`, `error`, `tools`.

- [ ] **Step 4: Corrupt vault handling**

Wrap `unlockVault` in try/catch; on failure set error string “Could not unlock vault” + offer button **Reset vault** calling `resetVault()` + `setPhase('needs-setup')` with confirmation modal (browser `confirm` acceptable for v1 per spec destructive confirm).

- [ ] **Step 5: Verify**

```bash
npm run build && npm run lint && npm run test
```

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx
git commit -m "feat(vault): gate app behind passphrase and encrypted autosave"
```

---

### Task 9: Manual QA checklist (release-ready)

- [ ] Fresh profile: setup passphrase → add server → reload → unlock → server still there.
- [ ] Legacy only: prefill localStorage with old JSON → first launch setup → after save, legacy key removed (`Application` tab).
- [ ] Lock button → cannot see servers until unlock.
- [ ] Wrong passphrase → error, no crash.

---

## Spec coverage (self-review)

| Spec section | Task(s) |
|--------------|---------|
| Encrypted payload = server list JSON | Task 3, 6, 8 |
| Envelope metadata (format, kdf, cipher) | Task 2, 3, 6 |
| IndexedDB storage | Task 5, 6 |
| PBKDF2 + AES-GCM | Task 3, 4 |
| Legacy migration + delete after success | Task 6, 8 |
| Lock screen + setup + lock | Task 7, 8 |
| Key in memory only | Task 8 (`useRef`) |
| Wrong passphrase / corrupt / reset | Task 6, 8, Task 9 |
| Tests round-trip | Task 4 |

**Gaps addressed:** IDB not unit-tested in Node (documented); idle lock explicitly deferred per spec.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-03-browser-vault.md`.

**Two execution options:**

1. **Subagent-driven (recommended)** — dispatch a fresh subagent per task; review between tasks.  
2. **Inline execution** — run tasks in this session with checkpoints between chunks.

Which approach do you want?
