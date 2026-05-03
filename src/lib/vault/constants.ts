/** localStorage key for pre-vault plaintext list (legacy). */
export const LEGACY_SERVERS_STORAGE_KEY = 'mcp-explorer.servers.v1';

/** Same-origin HTTP path; Node/Vite serve the vault file (see `vault-file-handler.js`). */
export const VAULT_HTTP_PATH = '/__vault_storage';

export const IDB_NAME = 'mcp-explorer';
export const IDB_STORE = 'vault';
export const IDB_RECORD_KEY = 'encrypted-servers';

export const FORMAT_VERSION = 'vault-v1' as const;

/** Tunable; spec suggests ≥ 310k — balance UX on slow devices. */
export const PBKDF2_ITERATIONS = 310_000;
