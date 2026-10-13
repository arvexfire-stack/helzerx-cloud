import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      input: {
        main: resolve(process.cwd(), 'index.html'),
        vps: resolve(process.cwd(), 'vps/index.html'),
        legacyVps: resolve(process.cwd(), 'vps.html'),
      },
    },
  },
});
