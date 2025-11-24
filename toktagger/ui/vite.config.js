import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist', // default folder for production build
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"), // use @ as alias for src/
      stream: "stream-browserify",
    },
  },
  define: {
    global: "globalThis", // polyfill Node's global
    "process.env": {},
  },
  optimizeDeps: {
    include: ["plotly.js-dist-min"],
  },
});
