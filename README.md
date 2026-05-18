# MCP Explorer

A small Vite + React + TypeScript app that connects to **MCP servers over HTTP** from the browser, lists their tools, and lets you invoke them with auto-generated forms.

Add any MCP HTTP endpoint, the explorer auto-connects on add and persists the list to `localStorage`.

## Features

- **Add / edit / remove** any MCP HTTP server — persisted to `localStorage`, no presets.
- **Auto-connect on add** — registers the server and immediately establishes the streamable HTTP transport.
- **Auto-discovered tool list** — calls `tools/list` after connecting.
- **Generated input forms** from each tool's JSON Schema (strings, numbers, booleans, enums, JSON for objects/arrays).
- **Live tool invocation** with text + structured result display.
- **Meta-tool discovery** — recognizes tools that exist to discover *other* tools (`list_tools`, `search_tools`, `invoke_tool`, `get_manifest`, etc.) and surfaces a one-click **Discover all tools** button. Discovered tools appear in a collapsible section in the tool list and can be invoked directly or routed through a proxy meta-tool.

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
server.js                        # zero-dep static server for dist/ (used by `npm start`)
src/
├── App.tsx                      # 3-column layout + state
├── main.tsx                     # entry
├── index.css                    # Tailwind import
├── types.ts                     # ServerEntry, ToolDef, ToolResult, JSON Schema
├── lib/
│   ├── mcpClient.ts             # Client + StreamableHTTPClientTransport wrapper
│   └── storage.ts               # localStorage persistence for the server list
└── components/
    ├── Logo.tsx                 # logo mark (used in navbar + favicon)
    ├── ServerList.tsx           # left column — connect / disconnect / edit / remove
    ├── ToolList.tsx             # middle column — tools advertised by the server
    ├── ToolDetail.tsx           # right column — form + result
    ├── SchemaForm.tsx           # JSON Schema → form
    ├── ResultPane.tsx           # render MCP tool results
    └── ServerFormDialog.tsx     # add / edit server modal
```

## CORS notes

The browser sends preflight requests with `Mcp-Session-Id` and `Mcp-Protocol-Version` headers. Any server you connect to must allow those in its `Access-Control-Allow-Headers` and expose `Mcp-Session-Id` via `Access-Control-Expose-Headers`.

## License

MIT.
