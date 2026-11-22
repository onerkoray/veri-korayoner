// Önce/sonra kareleri: node betikler/kare.mjs <ön-ek> [yol ...]
// Derlenmiş siteyi (astro preview, 4331) masaüstü açık, masaüstü koyu ve telefonda çeker.
// Kareler "hareketi azalt" açıkken alınır. Çıktı: KARE_DIZIN (varsayılan ../kareler).
import { chromium, devices } from "@playwright/test";
import { mkdirSync } from "node:fs";

const [onek = "kare", ...yollar] = process.argv.slice(2);
const dizin = process.env.KARE_DIZIN ?? "../kareler";
mkdirSync(dizin, { recursive: true });
const taban = process.env.KARE_TABAN ?? "http://localhost:4331";
const b = await chromium.launch({ channel: process.env.PW_KANAL || undefined });
const ayarlar = [
  ["masaustu-acik", { viewport: { width: 1440, height: 900 }, colorScheme: "light" }],
  ["masaustu-koyu", { viewport: { width: 1440, height: 900 }, colorScheme: "dark" }],
  ["telefon", { ...devices["Pixel 7"], colorScheme: "light" }],
];
for (const yol of yollar.length ? yollar : ["/"]) {
  const ad = yol === "/" ? "ana" : yol.replace(/^\/|\/$/g, "").replace(/\//g, "_");
  for (const [tur, ayar] of ayarlar) {
    const c = await b.newContext({ ...ayar, reducedMotion: "reduce" });
    const p = await c.newPage();
    await p.goto(taban + yol, { waitUntil: "networkidle" });
    await p.waitForTimeout(600);
    await p.screenshot({ path: `${dizin}/${onek}-${ad}-${tur}.png`, fullPage: true });
    await c.close();
  }
}
await b.close();
