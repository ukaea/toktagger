import { defineConfig } from "vite";
import path from "path";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, "../api/static"),
    commonjsOptions: {
      transformMixedEsModules: true, // ✅ fixes CJS/ESM interop
    },
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react"],
          plotly: ["plotly.js-dist-min"],
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"), // use @ as alias for src/
      stream: "stream-browserify",
    },
  },
  define: {
    global: "globalThis", // polyfill Node's global
  },
  optimizeDeps: {
    include: ["plotly.js-dist-min"],
  },
});
