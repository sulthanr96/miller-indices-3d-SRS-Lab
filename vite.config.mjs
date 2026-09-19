import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: '/miller-indices-3d-SRS-Lab/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        miller: resolve(import.meta.dirname, 'miller.html'),
        molecule: resolve(import.meta.dirname, 'molecule.html'),
        orbital: resolve(import.meta.dirname, 'orbital.html')
      }
    }
  }
});