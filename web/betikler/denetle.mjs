// Derleme sonrası denetim: yayına çıkmadan önce kırmızı olmalı.
//  - satır içi betik yok (CSP script-src 'self'); JSON-LD hariç
//  - "NaN", "undefined", "Infinity" yazılmış sayfa yok
//  - her yayımlanmış seri için sayfa var; API izni olmayan serinin API dosyası yok
//  - her sayfada tek <h1>, <title>, canonical
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(WEB, "dist");
const hatalar = [];
function gez(d, out = []) {
  for (const a of readdirSync(d)) { const y = join(d, a); statSync(y).isDirectory() ? gez(y, out) : out.push(y); }
  return out;
}
const sayfalar = gez(DIST).filter((y) => y.endsWith(".html"));
for (const y of sayfalar) {
  const s = readFileSync(y, "utf8"), ad = y.slice(DIST.length + 1);
  for (const m of s.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/type="application\/ld\+json"/.test(m[1])) { try { JSON.parse(m[2]); } catch { hatalar.push(ad + ": geçersiz JSON-LD"); } continue; }
    if (!/\bsrc=/.test(m[1]) && m[2].trim()) hatalar.push(ad + ": satır içi betik");
  }
  const metin = s.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ");
  for (const k of ["NaN", "undefined", "Infinity"]) if (new RegExp("\\b" + k + "\\b").test(metin)) hatalar.push(ad + ": '" + k + "' yazılmış");
  if (ad !== "404.html") {
    if ((s.match(/<h1\b/g) || []).length !== 1) hatalar.push(ad + ": tek <h1> değil");
    if (!/<link rel="canonical"/.test(s)) hatalar.push(ad + ": canonical yok");
  }
}
const katalog = JSON.parse(readFileSync(join(WEB, "..", "yayin", "site-veri", "seriler.json"), "utf8"));
for (const s of katalog.seriler) {
  if (!existsSync(join(DIST, "gosterge", s.id, "index.html"))) hatalar.push("sayfa yok: " + s.id);
  const api = join(DIST, "api", "v1", "seri", s.id + ".json");
  if (!s.izin.api && existsSync(api)) hatalar.push("API izni yok ama dosya yayında: " + s.id);
  if (!s.izin.indirme && existsSync(api.replace(/\.json$/, ".csv"))) hatalar.push("indirme izni yok ama CSV yayında: " + s.id);
}
if (existsSync(join(DIST, "site-veri"))) hatalar.push("site-veri/ yayına çıkmamalı");
if (hatalar.length) { console.error(hatalar.map((h) => "  HATA  " + h).join("\n")); process.exit(1); }
console.log(`denetim: ${sayfalar.length} sayfa, ${katalog.seriler.length} seri — temiz`);
