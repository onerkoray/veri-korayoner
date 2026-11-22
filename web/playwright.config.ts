// Tarayıcı testleri: derlenmiş siteyi (dist/) astro preview ile sunar.
// Yerelde sistem Chrome'u (PW_KANAL=chrome), CI'da Playwright'ın Chromium'u.
import { defineConfig, devices } from "@playwright/test";

const kanal = process.env.PW_KANAL || undefined;
export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://localhost:4329", reducedMotion: "reduce" },
  webServer: { command: "npx astro preview --port 4329", url: "http://localhost:4329/gezgin", reuseExistingServer: !process.env.CI, timeout: 60_000 },
  projects: [
    { name: "masaustu", use: { ...devices["Desktop Chrome"], channel: kanal } },
    { name: "telefon", use: { ...devices["Pixel 7"], channel: kanal } },
  ],
});
