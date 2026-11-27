// favicon.svg'den favicon.ico (16/32/48), favicon-96.png ve apple-touch-icon.png üretir.
// Neden: dört dosya aynı işaretin rasterlenmiş halleri; SVG değişip ikililer unutulursa
// sekmede eski, sitede yeni işaret görünür. Kullanım (web/ içinde):
//   PW_KANAL=chrome node betikler/ikon.mjs
// ICO içine PNG kareler gömülür (Windows Vista'dan beri desteklenen biçim).
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const kok = fileURLToPath(new URL("../public/", import.meta.url));
const svg = readFileSync(kok + "favicon.svg", "utf8");
const tarayici = await chromium.launch(process.env.PW_KANAL ? { channel: process.env.PW_KANAL } : {});

const kucuk = readFileSync(fileURLToPath(new URL("./favicon-16.svg", import.meta.url)), "utf8");

// tam: iOS saydam köşeyi siyaha boyar; apple-touch simgesi zemini dolu kare çizilir
// (köşe yuvarlaması ve kenar çizgisi atılır).
async function png(boy, tam = false, kaynak = svg) {
  const s = await tarayici.newPage({ viewport: { width: boy, height: boy }, deviceScaleFactor: 1 });
  const govde = (tam ? kaynak.replace('rx="7" fill="#0B111D"', 'fill="#0B111D"').replace(/<rect x="\.5"[^>]*stroke[^>]*\/>/, "") : kaynak)
    .replace("<svg ", `<svg width="${boy}" height="${boy}" `);
  await s.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${govde}</body></html>`);
  const b = await s.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: boy, height: boy } });
  await s.close();
  return b;
}

function ico(kareler) {
  const bas = Buffer.alloc(6 + 16 * kareler.length);
  bas.writeUInt16LE(0, 0); bas.writeUInt16LE(1, 2); bas.writeUInt16LE(kareler.length, 4);
  let konum = bas.length;
  kareler.forEach(([boy, veri], i) => {
    const o = 6 + 16 * i;
    bas.writeUInt8(boy % 256, o); bas.writeUInt8(boy % 256, o + 1); bas.writeUInt8(0, o + 2); bas.writeUInt8(0, o + 3);
    bas.writeUInt16LE(1, o + 4); bas.writeUInt16LE(32, o + 6);
    bas.writeUInt32LE(veri.length, o + 8); bas.writeUInt32LE(konum, o + 12);
    konum += veri.length;
  });
  return Buffer.concat([bas, ...kareler.map(([, v]) => v)]);
}

const kareler = [];
for (const boy of [16, 32, 48]) kareler.push([boy, await png(boy, false, boy === 16 ? kucuk : svg)]);
writeFileSync(kok + "favicon.ico", ico(kareler));
writeFileSync(kok + "favicon-96.png", await png(96));
writeFileSync(kok + "apple-touch-icon.png", await png(180, true));
await tarayici.close();
console.log("favicon.ico (16/32/48), favicon-96.png, apple-touch-icon.png yazıldı.");
