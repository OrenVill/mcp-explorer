# MCP Explorer

A small Vite + React + TypeScript app that connects to **MCP servers over HTTP** from the browser, lists their tools, and lets you invoke them with auto-generated forms.

Add any MCP HTTP endpoint, the explorer auto-connects on add and persists the list to `localStorage`.

## Features

- **Add / edit / remove** any MCP HTTP server — persisted to `localStorage`, no presets.
- **Auto-connect on add** — registers the server and immediately establishes the streamable HTTP transport.
- **Auto-discovered tool list** — calls `tools/list` after connecting.
- **Generated input forms** from each tool's JSON Schema (strings, numbers, booleans, enums, JSON for objects/arrays).
- **Live tool invocation** with text + structured result display.

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

## Build

```bash
npm run build        # tsc + vite build → dist/
npm run preview      # serve dist/ locally
```

## Connecting to a server

The app starts with no servers. Click **+ Add** in the sidebar, fill in a name and the streamable HTTP URL (typically `http://host:port/mcp`), and the explorer will register and auto-connect.

Use the **✎** button next to a server to edit its name, URL, or description; **✕** removes it.

## Layout

```
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
