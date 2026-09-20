import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { agentBridgePlugin } from './scripts/agentBridgePlugin';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), agentBridgePlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
  },
  assetsInclude: ['**/*.wgsl'],
});
