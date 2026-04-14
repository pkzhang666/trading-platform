import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@trading-platform/common": fileURLToPath(new URL("../../packages/common/src/index.ts", import.meta.url))
    }
  }
});
