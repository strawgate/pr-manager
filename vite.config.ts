import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => ({
  base: mode === "ghpages" ? "/pr-manager/" : "/",
  plugins: [react()],
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
}));
