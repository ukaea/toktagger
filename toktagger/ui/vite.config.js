import { defineConfig } from "vite";
import path from "path";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  publicDir: "public",
  build: {
    outDir: path.resolve(__dirname, "../api/static"),
    commonjsOptions: {
      transformMixedEsModules: true, // ✅ fixes CJS/ESM interop
    },
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes("node_modules/react")) return "react";
          if (id.includes("node_modules/plotly.js-dist-min")) return "plotly";
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
    "process.env": {},
  },
  optimizeDeps: {
    include: ["plotly.js-dist-min"],
  },
});
