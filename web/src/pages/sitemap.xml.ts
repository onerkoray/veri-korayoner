// Site haritası. lastmod yalnız içeriği veriyle değişen sayfalarda ve o verinin
// gerçekten yazıldığı ana göre (seri dosyası değişmeden yeniden yazılmaz).
import type { APIRoute } from "astro";
import { seriler } from "../lib/veri";
import { reelPaket } from "../lib/turetilmis";

export const GET: APIRoute = ({ site }) => {
  const ss = seriler();
  const gun = (iso: string) => iso.slice(0, 10);
  const enSon = ss.map((s) => s.cekildi).sort().at(-1)!;
  const reel = reelPaket();
  const satir: [string, string | null][] = [
    ["/", gun(enSon)],
    ...(reel ? [["/hesap/reel-politika-faizi", gun(reel.seri.cekildi)] as [string, string]] : []),
    ...ss.map((s) => [`/gosterge/${s.id}`, gun(s.cekildi)] as [string, string]),
    ["/kaynaklar", null], ["/api", null], ["/yontem", null], ["/koray-oner", gun(enSon)],
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    satir.map(([y, t]) => `  <url><loc>${new URL(y, site).href}</loc>${t ? `<lastmod>${t}</lastmod>` : ""}</url>`).join("\n") +
    "\n</urlset>\n";
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
};
