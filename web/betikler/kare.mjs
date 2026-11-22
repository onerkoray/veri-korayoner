// Önce/sonra kareleri: node betikler/kare.mjs <ön-ek> [yol ...]
// Derlenmiş siteyi (astro preview, 4331) masaüstü açık, masaüstü koyu ve telefonda çeker.
// Kareler "hareketi azalt" açıkken alınır ve AVIF'e çevrilir (Pillow ≥ 11.3; PNG tutulmaz).
// Ayrıca üst kısmın kırpılmış bir kopyası (-ust.avif) yazılır. Çıktı: KARE_DIZIN (../kareler).
import { chromium, devices } from "@playwright/test";
import { mkdirSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";

const [onek = "kare", ...yollar] = process.argv.slice(2);
const dizin = process.env.KARE_DIZIN ?? "../kareler";
mkdirSync(dizin, { recursive: true });
const taban = process.env.KARE_TABAN ?? "http://localhost:4331";
const b = await chromium.launch({ channel: process.env.PW_KANAL || undefined });
const ayarlar = [
  ["masaustu-acik", { viewport: { width: 1440, height: 900 }, colorScheme: "light" }, 1500],
  ["masaustu-koyu", { viewport: { width: 1440, height: 900 }, colorScheme: "dark" }, 1500],
  ["telefon", { ...devices["Pixel 7"], colorScheme: "light" }, 5300],
];
const PY = `import sys
from PIL import Image
kaynak, hedef, ust = sys.argv[1], sys.argv[2], int(sys.argv[3])
im = Image.open(kaynak).convert("RGB")
im.crop((0, 0, im.width, min(im.height, 16000))).save(hedef + ".avif", quality=60)   # AVIF en çok 16384 px
im.crop((0, 0, im.width, min(im.height, ust))).save(hedef + "-ust.avif", quality=60)`;
for (const yol of yollar.length ? yollar : ["/"]) {
  const ad = yol === "/" ? "ana" : yol.replace(/^\/|\/$/g, "").replace(/[/#?&=]/g, "_");
  for (const [tur, ayar, ust] of ayarlar) {
    const c = await b.newContext({ ...ayar, reducedMotion: "reduce" });
    const p = await c.newPage();
    await p.goto(taban + yol, { waitUntil: "networkidle" });
    await p.waitForTimeout(600);
    const hedef = `${dizin}/${onek}-${ad}-${tur}`, gecici = `${hedef}.gecici.png`;
    await p.screenshot({ path: gecici, fullPage: true });
    const s = spawnSync("python", ["-c", PY, gecici, hedef, String(ust)], { encoding: "utf8" });
    rmSync(gecici, { force: true });
    if (s.status !== 0) throw new Error(`AVIF dönüşümü başarısız: ${s.stderr}`);
    await c.close();
  }
}
await b.close();
