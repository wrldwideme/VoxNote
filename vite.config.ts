import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src-ui"),
    },
  },
  // Vite options tailored for Tauri development and only using localhost
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: false,
    host: "127.0.0.1",
  },
  build: {
    target: "es2022",
    outDir: "dist",
    emptyOutDir: true,
  },
});
