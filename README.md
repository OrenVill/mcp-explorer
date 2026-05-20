# MCP Explorer

A small Vite + React + TypeScript app that connects to **MCP servers over HTTP** from the browser, lists their tools, and lets you invoke them with auto-generated forms.

Add any MCP HTTP endpoint, the explorer auto-connects on add and persists the list to an encrypted vault on disk.

## Features

- **Add / edit / remove** any MCP HTTP server — persisted in an encrypted vault, no presets.
- **Auto-connect on add** — registers the server and immediately establishes the streamable HTTP transport.
- **Auto-discovered tool list** — calls `tools/list` after connecting.
- **Generated input forms** from each tool's JSON Schema (strings, numbers, booleans, enums, JSON for objects/arrays).
- **Live tool invocation** with text + structured result display.
- **Meta-tool discovery** — recognizes tools that exist to discover *other* tools (`list_tools`, `search_tools`, `invoke_tool`, `get_manifest`, etc.) and surfaces a one-click **Discover all tools** button. Discovered tools appear in a collapsible section in the tool list and can be invoked directly or routed through a proxy meta-tool.
- **Encrypted vault** — server configs and auth credentials are encrypted with AES-GCM (PBKDF2 key derivation) and stored in `~/.mcp-explorer/vault.json`. The key never leaves memory.

## Tech

- [Vite](https://vite.dev) + [React 19](https://react.dev) + TypeScript
- [@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk) — browser client + `StreamableHTTPClientTransport`
- [Tailwind CSS v4](https://tailwindcss.com) via `@tailwindcss/vite`

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

Then make sure an MCP server is running somewhere (it must expose a streamable-HTTP endpoint, typically at `/mcp`) and click **+ Add** in the sidebar.

## Run as a CLI

Install globally to get an `mcp-explorer` command that builds the app and serves the production bundle on `http://127.0.0.1:4173/` — and opens your default browser.

```bash
npm install -g .          # from a checkout, or `npm link`
mcp-explorer              # build + start + open browser
mcp-explorer 3000         # custom port
mcp-explorer --no-open    # skip browser (also: OPEN=0)
```

The CLI runs `vite build` silently and prints a single colored ready line:

```
  mcp-explorer  ➜  http://127.0.0.1:4173/
```

If the build fails, the captured vite output is printed.

## Build / serve

```bash
npm run build        # tsc + vite build → dist/
npm start            # serve dist/ via the built-in static server (server.js)
npm run preview      # vite preview (dev-only sanity check)
```

`npm start` runs a dependency-free Node static server (`server.js`) that serves
`dist/` with proper MIME types, immutable cache headers for hashed assets, and
SPA fallback. Configure with `PORT=3000 npm start` or `node server.js 3000`.

## Connecting to a server

The app starts with no servers. Click **+ Add** in the sidebar, fill in a name and the streamable HTTP URL (typically `http://host:port/mcp`), and the explorer will register and auto-connect.

Use the **✎** button next to a server to edit its name, URL, or description; **✕** removes it.

## Layout

```
bin/
└── mcp-explorer.js              # CLI: vite build (silent) → server.js → opens browser
proxy.js                         # zero-dep HTTP proxy for MCP servers (CORS bypass)
server.js                        # zero-dep static server for dist/ (used by `npm start`)
vault-file-handler.js            # /__vault_storage GET/PUT/DELETE → ~/.mcp-explorer/vault.json
src/
├── App.tsx                      # vault bootstrap, 3-column layout, all top-level state
├── main.tsx                     # entry
├── types.ts                     # ServerEntry, ToolDef, MetaToolBinding, DiscoveryRun, JSON Schema
├── lib/
│   ├── mcpClient.ts             # Client + StreamableHTTPClientTransport wrapper (routes via proxy)
│   ├── storage.ts               # legacy localStorage helpers (migration source)
│   ├── discovery/
│   │   ├── detect.ts            # score tools → MetaToolBinding[] (name patterns + schema shape)
│   │   ├── orchestrator.ts      # runDiscovery(): dispatch to strategy, enforce limits, merge results
│   │   ├── strategy.ts          # DiscoveryStrategy interface + shared types
│   │   └── strategies/          # one file per MetaToolKind
│   └── vault/
│       ├── crypto.ts            # PBKDF2 key derivation + AES-GCM encrypt/decrypt
│       ├── service.ts           # createVault / unlockVault / saveVault / resetVault
│       ├── vaultPersistence.ts  # GET/PUT/DELETE /__vault_storage (falls back to IndexedDB)
│       └── idb.ts               # IndexedDB fallback for file:// or offline use
└── components/
    ├── ServerList.tsx           # left column — connect / disconnect / edit / remove
    ├── ToolList.tsx             # middle column — tools + discovered tools
    ├── ToolDetail.tsx           # right column — form + result + discovery controls
    ├── SchemaForm.tsx           # JSON Schema → form
    ├── ResultPane.tsx           # render MCP tool results
    ├── ServerFormDialog.tsx     # add / edit server modal (supports Bearer, API key, Basic auth)
    ├── VaultSetup.tsx           # first-run passphrase creation
    ├── VaultUnlock.tsx          # passphrase entry on return
    ├── VaultLockButton.tsx      # lock button in header
    ├── DiscoveryHeader.tsx      # meta-tool discovery trigger + status
    ├── DiscoveryProgress.tsx    # live call/found counters during discovery
    └── DiscoveredToolsSection.tsx  # collapsible list of discovered tools
```

## Vault

On first launch the app asks you to create a passphrase. Your server list and auth credentials are then encrypted with AES-GCM (256-bit key derived via PBKDF2-SHA-256, 310 000 iterations) and stored in `~/.mcp-explorer/vault.json`. The passphrase and derived key are never written to disk.

Override the storage directory: `MCP_EXPLORER_DATA_DIR=/path/to/dir`.

If the Node server is unreachable (e.g. opened as `file://`) the encrypted blob falls back to IndexedDB automatically.

## CORS notes

The browser sends preflight requests with `Mcp-Session-Id` and `Mcp-Protocol-Version` headers. Any server you connect to must allow those in its `Access-Control-Allow-Headers` and expose `Mcp-Session-Id` via `Access-Control-Expose-Headers`.

## Releases

Versioning is SemVer, automated by [release-please](https://github.com/googleapis/release-please) from [Conventional Commit](https://www.conventionalcommits.org/) messages on `main`.

- Every push to `main` updates a long-lived **Release PR** that bumps `package.json`, updates `CHANGELOG.md`, and lists the included changes.
- Merging the Release PR creates a git tag (`vX.Y.Z`), a GitHub Release with the changelog section, and uploads a built `dist.tgz` artifact.
- Commit types that bump the version: `feat:` (minor, pre-1.0), `fix:` / `perf:` / `refactor:` (patch). `feat!:` or a `BREAKING CHANGE:` footer triggers a major bump (post-1.0) or a minor bump (pre-1.0).

The package is **not** currently published to the npm registry — the `mcp-explorer` name on npm is held by an unrelated placeholder. To install from source:

```bash
npm install -g github:OrenVill/mcp-explorer
```

Or download `dist.tgz` from a [GitHub Release](https://github.com/OrenVill/mcp-explorer/releases) and serve it with any static host.

## License

MIT.
