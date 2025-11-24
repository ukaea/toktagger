import { defineConfig } from 'vite'
import path from "path";
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist', // default folder for production build
    commonjsOptions: {
      transformMixedEsModules: true,   // ✅ fixes CJS/ESM interop
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"), // use ~ as alias for src/
      stream: 'stream-browserify'
    },
  },
  define: {
    global: "globalThis", // polyfill Node's global
  },
  optimizeDeps: {
    include: ["plotly.js-dist-min"],
  },
})
