import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: __dirname,
  publicDir: false,
  build: {
    outDir: path.resolve(__dirname, '../public/assets'),
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'index.html'),
      output: {
        entryFileNames: 'landing.js',
        chunkFileNames: 'landing-chunk.[hash].js',
        assetFileNames: (assetInfo) =>
          assetInfo.name?.endsWith('.css') ? 'landing.css' : 'landing.[hash].[ext]',
      },
    },
    sourcemap: true,
  },
  base: '/assets/',
  css: {
    devSourcemap: true,
  },
});
