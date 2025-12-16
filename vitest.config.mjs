import { defineConfig } from "vite";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./vitest-setup.ts"],
    coverage: {
      exclude: ["src/index.ts", "src/types.ts"],
    },
  },
});
