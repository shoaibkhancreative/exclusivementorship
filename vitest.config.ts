import { defineConfig } from "vitest/config";

export default defineConfig({
  ssr: {
    external: ["node:sqlite"]
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/htmlRewriterPolyfill.ts"],
    server: {
      deps: {
        external: ["node:sqlite"]
      }
    }
  }
});
