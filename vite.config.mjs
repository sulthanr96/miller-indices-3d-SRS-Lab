import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        miller: resolve(__dirname, 'miller.html'),
        molecule: resolve(__dirname, 'molecule.html'),
        orbital: resolve(__dirname, 'orbital.html')
      }
    }
  }
});
