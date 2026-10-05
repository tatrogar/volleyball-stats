/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served from https://tatrogar.github.io/volleyball-stats/
export default defineConfig({
  base: "/volleyball-stats/",
  plugins: [react()],
  test: {
    environment: "node",
    setupFiles: ["src/test-setup.ts"],
  },
});
