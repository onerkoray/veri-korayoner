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
  // Yinelenen id: getElementById ilkini döndürür, betik yanlış öğeye bağlanır (API deneme aracında oldu).
  const idler = [...s.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  for (const i of new Set(idler.filter((x, j) => idler.indexOf(x) !== j))) hatalar.push(ad + `: id="${i}" birden fazla`);
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
// Emsal API dosyası yalnız API izni olan seriye ait olabilir.
const emsalDizin = join(DIST, "api", "v1", "emsal");
const apiIzinli = new Set(katalog.seriler.filter((s) => s.izin.api).map((s) => s.id));
if (existsSync(emsalDizin)) for (const a of readdirSync(emsalDizin)) {
  if (!apiIzinli.has(a.replace(/\.json$/, ""))) hatalar.push("API izni yok ama emsal dosyası yayında: " + a);
}
// Değişiklik günlüğünün API kopyasında API izni olmayan seri olmamalı.
const gunluk = join(DIST, "api", "v1", "degisiklikler.json");
if (existsSync(gunluk)) for (const k of JSON.parse(readFileSync(gunluk, "utf8")).kayitlar) {
  if (!apiIzinli.has(k.seri)) hatalar.push("API izni yok ama günlükte: " + k.seri);
}
// Dizine açılış: hiçbir sayfa noindex taşımaz; site haritası her göstergeyi listeler.
for (const y of sayfalar) if (/<meta name="robots" content="[^"]*noindex/.test(readFileSync(y, "utf8"))) hatalar.push(y.slice(DIST.length + 1) + ": noindex");
const harita = existsSync(join(DIST, "sitemap.xml")) ? readFileSync(join(DIST, "sitemap.xml"), "utf8") : "";
if (!harita) hatalar.push("sitemap.xml yok");
for (const s of katalog.seriler) if (harita && !harita.includes(`/gosterge/${s.id}</loc>`)) hatalar.push("site haritasında yok: " + s.id);
if (!/Sitemap: https:\/\/veri\.korayoner\.dev\/sitemap\.xml/.test(readFileSync(join(DIST, "robots.txt"), "utf8"))) hatalar.push("robots.txt site haritasını göstermiyor");
if (hatalar.length) { console.error(hatalar.map((h) => "  HATA  " + h).join("\n")); process.exit(1); }
console.log(`denetim: ${sayfalar.length} sayfa, ${katalog.seriler.length} seri — temiz`);
