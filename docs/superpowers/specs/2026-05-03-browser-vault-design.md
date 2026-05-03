# Browser-only encrypted vault for MCP Explorer servers & credentials

**Status:** Draft for implementation planning  
**Scope:** Single-page web app (Vite SPA); **no external database**; **no OS keychain** (browser-only deployment).

## 1. Problem

Today, servers and `ServerAuth` secrets are persisted as **plaintext JSON** in `localStorage` (`mcp-explorer.servers.v1`). Anyone with access to browser storage (extensions, synced profiles, backups, same-origin scripts after XSS) can read credentials.

## 2. Goals & non-goals

### Goals

- Persist server definitions and authentication material **encrypted at rest** in the browser.
- Use only **standard Web APIs** (Web Crypto, IndexedDB).
- **No external DB**; storage remains entirely on the client.
- Support **migration** from the legacy plaintext key without leaving two long-lived sources of truth.

### Non-goals

- Protection against **active malware** or **same-origin XSS while the app is unlocked** (secrets exist in JS memory/DOM when in use).
- **Multi-device sync** without user-managed export/import or a future server (out of scope here).
- **OAuth interactive flows** or token refresh beyond what the app already does (separate feature).

## 3. Threat model

| Mitigated | Not promised |
|-----------|----------------|
| Offline inspection of **IndexedDB/local files** showing **plaintext tokens** | Full protection if the machine is compromised |
| Casual **profile copy** / backup exposing secrets | **XSS** exfiltrating data during an unlocked session |
| Shoulder-surfing **storage panel** without passphrase | Recovery without passphrase |

## 4. Architecture overview

1. User sets or enters a **vault passphrase**.
2. Passphrase is run through a **KDF** → **AES-GCM** encrypts the **entire server list JSON** (including `auth`).
3. Only **ciphertext + public crypto parameters** are written to **IndexedDB**.
4. **Decryption key material** stays in memory while unlocked; **refresh or explicit lock** clears it.

**v1 rule:** No plaintext “peek” list of server names/URLs outside the vault (everything user-visible about servers after migration lives inside ciphertext except bootstrap metadata listed below).

## 5. Data model

### 5.1 Encrypted payload (plaintext before encryption)

UTF-8 JSON array of persisted servers, matching current persisted shape:

- `id`, `name`, `url`, `description`, `custom`, `auth` (`ServerAuth`).

Runtime-only fields (`status`, `error`, `tools`) remain **not persisted** in the vault file format (same as today’s distinction between stored vs in-memory state).

### 5.2 Stored envelope (plaintext metadata beside ciphertext)

Minimal fields required to open the vault and evolve the format:

| Field | Purpose |
|-------|---------|
| `formatVersion` | e.g. `vault-v1` — drives migration |
| `kdf` | Algorithm identifier + **salt** + iteration count (or cost params) |
| `cipher` | `AES-GCM`, **IV** (12 bytes), ciphertext blob (includes auth tag per Web Crypto) |

Optional: `updatedAt` (ISO string) for UX only.

### 5.3 Legacy storage

- **Key:** `mcp-explorer.servers.v1` in **localStorage** (existing).
- **Migration:** If vault is absent but legacy exists, **import** legacy JSON into memory and require user to set passphrase to create first vault; **only delete legacy** after encrypted write succeeds.

If encrypted write fails, **do not delete** legacy data.

## 6. Cryptography

- **KDF:** PBKDF2 with SHA-256, per-vault random **salt**, iteration count **documented and tunable** (initial suggestion: **≥ 310k** iterations subject to UX perf testing on low-end devices).
- **Key length:** 256-bit AES key from derived material via `crypto.subtle.importKey`.
- **Encryption:** AES-GCM with 12-byte IV per encryption operation; unique IV every time the vault is re-encrypted.
- **Implementation:** Web Crypto (`crypto.subtle`) only; no external crypto npm for v1 unless needed for testing shims.

## 7. UX

### 7.1 First-time / no vault

- Flow to **set passphrase** (with confirmation).
- If legacy plaintext exists: after passphrase set, encrypt imported data; then remove legacy key on success.

### 7.2 Vault exists

- **Lock screen** gates the main app: passphrase entry → decrypt → load servers.

### 7.3 Unlocked session

- **`CryptoKey` / sensitive buffers only in memory** for v1.
- Full page **reload** → locked again (passphrase required).
- **Lock** button: zeroize in-memory key material and return to lock screen.

### 7.4 Deferred (not v1)

- Idle timeout auto-lock.
- “Remember for session” via `sessionStorage` key material.
- Plaintext metadata peek for lock screen.

## 8. Errors & edge cases

| Case | Behavior |
|------|----------|
| Wrong passphrase | Generic failure message; no decryption |
| Corrupt vault | Explain unreadable vault; offer **reset vault** (destructive, confirm); future: restore from export |
| Storage quota | Catch write errors; suggest freeing space / fewer servers |
| Forgotten passphrase | Cannot decrypt; user must **reset vault** (lose secrets) or use future **export backup** |

## 9. Testing

- **Crypto round-trip:** deterministic tests where feasible (fixtures with mocked `crypto.subtle` or integration in secure context).
- **Migration:** fixture legacy localStorage → import → encrypt → decrypt equals expected list.
- **Manual:** unlock → use app → lock → unlock; migration path on clean profile with legacy data.

## 10. Open follow-ups (post-v1)

- Encrypted **export/import file** for backup and device moves.
- Idle lock and iteration-count tuning UX.
- Argon2id via WASM if PBKDF2 cost becomes contentious.

## 11. Related code today

- Persistence: `src/lib/storage.ts`, key `mcp-explorer.servers.v1`.
- Types: `ServerEntry`, `ServerAuth` in `src/types.ts`.
