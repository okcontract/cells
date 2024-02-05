import { defineConfig } from "vite";

export default defineConfig({
  test: {
    environment: "happy-dom",
    coverage: {
      exclude: ["src/index.ts", "src/types.ts"],
    },
  },
});
