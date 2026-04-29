# MCP Explorer

A small Vite + React + TypeScript app that connects to **MCP servers over HTTP** from the browser, lists their tools, and lets you invoke them with auto-generated forms.

Pre-configured to work with every server from [awesome-mcp-servers](https://github.com/OrenVill/awesome-mcp-servers) (unified-mcp on `:8000` plus 16 single-API servers on `:3500`–`:3515`), but you can add any custom MCP HTTP server too.

## Features

- **One-click connect** to any MCP server via the streamable HTTP transport.
- **Auto-discovered tool list** — calls `tools/list` after connecting.
- **Generated input forms** from each tool's JSON Schema (strings, numbers, booleans, enums, JSON for objects/arrays).
- **Live tool invocation** with text + structured result display.
- **Add/remove custom servers** — persisted to `localStorage`.

## Tech

- [Vite](https://vite.dev) + [React 19](https://react.dev) + TypeScript
- [@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk) — browser client + `StreamableHTTPClientTransport`
- [Tailwind CSS v4](https://tailwindcss.com) via `@tailwindcss/vite`

## Quick start

```bash
npm install
npm run dev          # http://localhost:5173
```

Then start one of the MCP servers from [awesome-mcp-servers](https://github.com/OrenVill/awesome-mcp-servers) (e.g. `npm run start:http` from that repo to bring up `unified-mcp` on `:8000`) and click **Connect** in the sidebar.

## Build

```bash
npm run build        # tsc + vite build → dist/
npm run preview      # serve dist/ locally
```

## Connecting to a server

The app expects each MCP server to expose a streamable HTTP endpoint at `/mcp`. The 17 default servers below are pre-loaded:

| Server | Default URL |
|---|---|
| Unified MCP | `http://localhost:8000/mcp` |
| Open-Meteo | `http://localhost:3500/mcp` |
| REST Countries | `http://localhost:3501/mcp` |
| Hacker News | `http://localhost:3502/mcp` |
| Wikipedia | `http://localhost:3503/mcp` |
| arXiv | `http://localhost:3504/mcp` |
| Open Library | `http://localhost:3505/mcp` |
| Nominatim | `http://localhost:3506/mcp` |
| Dictionary | `http://localhost:3507/mcp` |
| Frankfurter | `http://localhost:3508/mcp` |
| USGS Earthquakes | `http://localhost:3509/mcp` |
| SpaceX | `http://localhost:3510/mcp` |
| GitHub (public) | `http://localhost:3511/mcp` |
| MDN | `http://localhost:3512/mcp` |
| Datamuse | `http://localhost:3513/mcp` |
| Open Trivia DB | `http://localhost:3514/mcp` |
| Crossref | `http://localhost:3515/mcp` |

Click **+ Add** in the sidebar to register any other MCP HTTP server.

## Layout

```
src/
├── App.tsx                      # 3-column layout + state
├── main.tsx                     # entry
├── index.css                    # Tailwind import
├── types.ts                     # ServerEntry, ToolDef, ToolResult, JSON Schema
├── lib/
│   ├── defaultServers.ts        # 17 pre-configured server entries
│   ├── mcpClient.ts             # Client + StreamableHTTPClientTransport wrapper
│   └── storage.ts               # localStorage persistence for the server list
└── components/
    ├── ServerList.tsx           # left column — connect / disconnect / add / remove
    ├── ToolList.tsx             # middle column — tools advertised by the server
    ├── ToolDetail.tsx           # right column — form + result
    ├── SchemaForm.tsx           # JSON Schema → form
    ├── ResultPane.tsx           # render MCP tool results
    └── AddServerDialog.tsx      # modal for custom server entries
```

## CORS notes

The HTTP MCP servers in [awesome-mcp-servers](https://github.com/OrenVill/awesome-mcp-servers) already enable permissive CORS (`origin: true`) and expose the `Mcp-Session-Id` header. Other MCP servers may not — if a connection fails with a CORS error in the browser console, the upstream server is at fault.

## License

MIT.
