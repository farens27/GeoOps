import { defineConfig } from "@solidjs/start/config";

export default defineConfig({
  // SolidStart configuration
  // Static build for Cloudflare Pages deployment
  server: {
    preset: "static",
  },
  vite: {
    // Environment variables prefixed with VITE_ are exposed to the client
    envPrefix: "VITE_",
  },
});
