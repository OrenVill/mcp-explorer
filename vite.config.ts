import { defineConfig, type PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { handleMcpProxy, PROXY_PATH } from './proxy.js';

function mcpProxyPlugin(): PluginOption {
  return {
    name: 'mcp-explorer-proxy',
    configureServer(server) {
      server.middlewares.use(PROXY_PATH, handleMcpProxy);
    },
    configurePreviewServer(server) {
      server.middlewares.use(PROXY_PATH, handleMcpProxy);
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), mcpProxyPlugin()],
});
