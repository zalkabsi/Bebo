import { defineConfig } from "vitest/config";
import { beboMcpBridge } from "./src/integrations/mcpBridge.js";

export default defineConfig({
  plugins: [beboMcpBridge()],
  server: {
    port: 3000,
    strictPort: true,
  },
  build: {
    target: "es2022",
    outDir: "dist",
    sourcemap: true,
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
