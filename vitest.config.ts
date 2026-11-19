import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src-ui"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src-ui/test/setup.ts"],
    css: false,
  },
});
