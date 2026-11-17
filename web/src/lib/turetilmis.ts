// Bu sitenin hesapladığı seriler. Kaynak serileri değiştirmez; formül sayfasında yazılı,
// API'de yayımlanmaz (kurumların serisi değildir), hesap her derlemede yeniden yapılır.
import { seriler, emsal, emsalNoktalari, noktalar, type Seri } from "./veri";
import { reelFaiz, type Nokta } from "./okuma.ts";

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
    id: REEL_ID, baslik: "Reel politika faizi", ulke: "TUR", siklik: "aylik", birim: "yuzde", carpan: 1, tema: "para-politikasi",
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
