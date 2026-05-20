# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # dev server at http://localhost:5173
npm run build        # tsc -b && vite build → dist/
npm start            # serve dist/ with the built-in Node static server
npm run lint         # ESLint
npm test             # vitest run (all tests, single pass)
npm run test:watch   # vitest in watch mode

# Run a single test file
npx vitest run src/lib/discovery/detect.test.ts
```

## Architecture

### App bootstrap & vault gating

`App.tsx` is the root. Before rendering the 3-column layout it resolves a `VaultPhase` (`loading → needs-setup | needs-unlock → ready`) by checking whether an encrypted vault exists on disk. If the vault isn't unlocked the user sees `VaultSetup` or `VaultUnlock` instead of the main UI. All server state lives in the `servers` React array that is kept in sync with the vault on every mutation.

### 3-column layout

`ServerList` (left) → `ToolList` (middle) → `ToolDetail` (right). State lives entirely in `App.tsx`; columns are pure props-driven components. `selectedId` + `selectedToolName` are the two selection cursors.

### MCP connection layer (`src/lib/mcpClient.ts`)

All browser–MCP communication goes through the local proxy at `/__mcp_proxy` (implemented in `proxy.js`) so that cross-origin MCP servers and localhost servers that lack CORS headers work without modification. `mcpClient.ts` maintains two module-level `Map`s (`clients`, `transports`) keyed by `serverId`. The module exports plain async functions (`connect`, `disconnect`, `callTool`, `refetchTools`, `onToolsChanged`) used directly by `App.tsx`.

### Meta-tool discovery (`src/lib/discovery/`)

When a server exposes tools that themselves discover other tools (e.g. `list_tools`, `search_tools`, `invoke_tool`), the explorer surfaces a **Discover all tools** button.

1. **`detect.ts`** — scans the tool list returned by `tools/list` and scores each tool for being a meta-tool. Scoring combines name-pattern matching (regexes in `NAME_PATTERNS`), description keywords, and JSON Schema shape. Tools that score ≥ 0.5 become `MetaToolBinding`s, each assigned a `MetaToolKind`.
2. **`orchestrator.ts`** — `runDiscovery()` dispatches to the appropriate strategy based on `MetaToolKind`, manages abort signals, enforces limits (max calls, max tools, total timeout), and merges results.
3. **`strategies/`** — one file per kind (`bulkList`, `paginatedList`, `search`, `hybrid`, `category`, `enableCapability`, `manifest`, `proxy`). Each exports a `DiscoveryStrategy` with an async-generator `run(ctx)` method that yields batches of `DiscoveredTool`.

Discovered tools are stored in `ServerEntry.discovered` (in-memory, reset on reconnect) and can be invoked directly or routed through a `proxy_invoke` meta-tool.

### Vault encryption (`src/lib/vault/`)

Server configs (names, URLs, auth credentials) are encrypted at rest using the Web Crypto API:
- Key derivation: PBKDF2 (SHA-256, 310 000 iterations) over a user passphrase → 256-bit AES-GCM key.
- Encryption: AES-GCM with a random 12-byte IV per save.
- The envelope (`VaultEnvelope`) bundles KDF params, cipher blob, and a format version, serialized as JSON.

**Persistence** is dual-layer (`vaultPersistence.ts`):
- **Primary**: the running Node server (dev Vite middleware or production `server.js`) exposes `GET/PUT/DELETE /__vault_storage`, which reads/writes `~/.mcp-explorer/vault.json` (override with `MCP_EXPLORER_DATA_DIR`).
- **Fallback**: IndexedDB for `file://` contexts or when the HTTP endpoint is unreachable.

On first setup, any legacy unencrypted `localStorage` server list is migrated into the new vault. The `CryptoKey` is kept in an `aesKeyRef` ref and is never serialized or persisted.

### Server-side middleware

`proxy.js` and `vault-file-handler.js` are plain ESM Node modules (no dependencies) shared by three hosts:
- Vite dev server (`vite.config.ts`) — registered as Vite plugins via `configureServer`.
- Vite preview server — same plugins apply to `configurePreviewServer`.
- Production `server.js` — handled directly in the `createServer` request handler.
