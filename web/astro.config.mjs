// @ts-check
import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://veri.korayoner.dev",
  output: "static",
  trailingSlash: "never",
  build: { format: "directory", inlineStylesheets: "auto" },
  // CSP `script-src 'self'`: hiçbir betik satır içine gömülmesin.
  vite: { build: { assetsInlineLimit: 0 } },
  devToolbar: { enabled: false },
});
