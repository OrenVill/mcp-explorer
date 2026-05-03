import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type { PluginOption } from 'vite';
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
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    passWithNoTests: true,
  },
});
