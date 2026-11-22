// Bu sitenin hesapladığı seriler. Kaynak serileri değiştirmez; formül sayfasında yazılı,
// API'de yayımlanmaz (kurumların serisi değildir), hesap her derlemede yeniden yapılır.
import { seriler, emsal, emsalNoktalari, noktalar, deger, type Seri } from "./veri";
import { reelFaiz, sirala, type Nokta, type Sira } from "./okuma.ts";

export const REEL_ID = "reel-politika-faizi";

export interface ReelPaket { faiz: Seri; enf: Seri; r: Nokta[]; seri: Seri; emsal: Record<string, Nokta[]> | null }

export function reelPaket(): ReelPaket | null {
  const ss = seriler();
  const faiz = ss.find((s) => s.id === "bis-politika-faizi-tr"), enf = ss.find((s) => s.id === "bis-tufe-yillik-tr");
  if (!faiz || !enf) return null;
  const r = reelFaiz(noktalar(faiz), noktalar(enf));
  if (r.length < 2) return null;
  const ef = emsal(faiz.id), ee = emsal(enf.id);
  let em: Record<string, Nokta[]> | null = null;
  if (ef && ee) {
    const a = emsalNoktalari(ef), b = emsalNoktalari(ee);
    em = Object.fromEntries(Object.keys(a).filter((k) => b[k]).map((k) => [k, reelFaiz(a[k], b[k])]).filter(([, d]) => (d as Nokta[]).length));
  }
  const seri: Seri = {
    id: REEL_ID, baslik: "Reel politika faizi (gerçekleşen enflasyonla, ex post)", ulke: "TUR", siklik: "aylik", birim: "yuzde", carpan: 1, tema: "para-politikasi",
    kaynak: faiz.kaynak, kaynak_kod: `${faiz.kaynak_kod} ve ${enf.kaynak_kod}`, kaynak_adi: null, kaynak_not: null,
    kaynak_guncelleme: null, cekildi: faiz.cekildi > enf.cekildi ? faiz.cekildi : enf.cekildi,
    izin: { gosterim: true, indirme: false, api: false },
    gozlemler: r.map((p) => ({ donem: p.donem, deger: p.v.toFixed(6) })),
  };
  return { faiz, enf, r, seri, emsal: em };
}

/** Sondaki aynı işaretli dönem sayısı (reel faiz kaç aydır pozitif/negatif). */
export function isaretSuresi(d: Nokta[]): { isaret: number; ay: number; bas: string } {
  const s = Math.sign(d.at(-1)!.v);
  let i = d.length - 1;
  while (i > 0 && Math.sign(d[i - 1].v) === s) i--;
  return { isaret: s, ay: d.length - i, bas: d[i].donem };
}

// "Türkiye nerede": emsali olan her gösterge (ve reel faiz hesabı) için sıralama satırı.
const SIRA = ["bis-politika-faizi-tr", "bis-tufe-yillik-tr", "eurostat-hicp-yillik-tr", "wb-fp-cpi-totl-zg-tur",
  "wb-ny-gdp-mktp-kd-zg-tur", "wb-ny-gdp-pcap-cd-tur", "wb-ny-gdp-pcap-pp-kd-tur", "wb-ne-gdi-ftot-zs-tur", "wb-ny-gds-totl-zs-tur",
  "eurostat-asgari-ucret-pps-tr", "ilo-emek-payi-tr", "eurostat-issizlik-aylik-tr", "ilo-issizlik-tr", "wb-sl-uem-totl-zs-tur",
  "ilo-isgucune-katilim-tr", "ilo-kadin-isgucune-katilim-tr", "ilo-neet-tr", "ilo-kayitdisi-istihdam-tr",
  "wb-bn-cab-xoka-gd-zs-tur", "wb-ne-exp-gnfs-zs-tur", "wb-ne-imp-gnfs-zs-tur", "wb-bx-klt-dinv-wd-gd-zs-tur",
  "bis-ozel-kredi-gsyh-tr", "bis-borc-servis-orani-tr", "wb-si-pov-gini-tur", "wb-sp-dyn-le00-in-tur"];
export interface Satir { baslik: string; href: string; sira: Sira; yaz: (v: number) => string; kaynak: string; trSon: string }
export function emsalSatirlari(): Satir[] {
  const satirlar: Satir[] = [];
  const reel = reelPaket();
  if (reel?.emsal) {
    const s = sirala(reel.r, reel.emsal);
    if (s) satirlar.push({ baslik: "Reel politika faizi (hesap)", href: "/hesap/reel-politika-faizi", sira: s, yaz: (v) => deger(reel.seri, v), kaynak: "BIS verisiyle", trSon: reel.r.at(-1)!.donem });
  }
  for (const s of [...seriler()].sort((a, b) => (SIRA.indexOf(a.id) + 1 || 99) - (SIRA.indexOf(b.id) + 1 || 99))) {
    const e = emsal(s.id);
    if (!e) continue;
    const n = noktalar(s), sr = sirala(n, emsalNoktalari(e));
    if (sr) satirlar.push({ baslik: s.baslik, href: `/gosterge/${s.id}`, sira: sr, yaz: (v) => deger(s, v, true), kaynak: s.kaynak.kurum, trSon: n.at(-1)!.donem });
  }
  return satirlar;
}
