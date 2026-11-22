// Ülke karşılaştırmasının DOM'suz çekirdeği (test/karsilastir.test.ts). Kural okuma.ts'deki
// `sirala` ile aynı: Türkiye'nin değeri olan ve emsallerin en az %60'ının (en az 2) değeri bulunan
// dönem; toplamlar (AB-27) sıraya ve medyana girmez, başvuru olarak gösterilir.
import { medyan, TOPLAM, type Nokta } from "./okuma.ts";

export const esik = (n: number) => Math.max(2, Math.ceil(n * 0.6));
const ulkelerOf = (u: Record<string, Nokta[]>) => Object.keys(u).filter((k) => !TOPLAM.has(k));
const harita = (u: Record<string, Nokta[]>) => Object.fromEntries(Object.entries(u).map(([k, d]) => [k, new Map(d.map((p) => [p.donem, p.v]))]));

/** Karşılaştırılabilir dönemler, yeniden eskiye. */
export function uygunDonemler(tr: Nokta[], ulkeler: Record<string, Nokta[]>): string[] {
  const u = ulkelerOf(ulkeler), h = harita(ulkeler), e = esik(u.length);
  return tr.map((p) => p.donem).filter((d) => u.filter((k) => h[k].has(d)).length >= e).reverse();
}

export interface Siralama {
  donem: string; sira: number; toplam: number; medyan: number;
  satirlar: { kod: string; v: number }[];        // Türkiye dahil, yüksekten düşüğe
  toplamlar: { kod: string; v: number }[];
  eksik: string[];                               // bu dönemde değeri olmayan emsaller
}
export function siralaDonem(tr: Nokta[], ulkeler: Record<string, Nokta[]>, donem: string): Siralama | null {
  const t = tr.find((p) => p.donem === donem);
  const u = ulkelerOf(ulkeler), h = harita(ulkeler);
  const var_ = u.filter((k) => h[k].has(donem));
  if (!t || var_.length < esik(u.length)) return null;
  const satirlar = [{ kod: "TUR", v: t.v }, ...var_.map((k) => ({ kod: k, v: h[k].get(donem)! }))].sort((a, b) => b.v - a.v);
  return {
    donem, sira: satirlar.findIndex((s) => s.kod === "TUR") + 1, toplam: satirlar.length,
    medyan: medyan(var_.map((k) => h[k].get(donem)!)), satirlar,
    toplamlar: Object.keys(ulkeler).filter((k) => TOPLAM.has(k) && h[k].has(donem)).map((k) => ({ kod: k, v: h[k].get(donem)! })),
    eksik: u.filter((k) => !h[k].has(donem)),
  };
}

/** Karşılaştırılabilir her dönemde emsal medyanı ve en düşük–en yüksek (Türkiye hariç). */
export function medyanSerisi(tr: Nokta[], ulkeler: Record<string, Nokta[]>): { donem: string; medyan: number; lo: number; hi: number; n: number }[] {
  const u = ulkelerOf(ulkeler), h = harita(ulkeler), e = esik(u.length);
  return tr.flatMap((p) => {
    const v = u.filter((k) => h[k].has(p.donem)).map((k) => h[k].get(p.donem)!);
    return v.length >= e ? [{ donem: p.donem, medyan: medyan(v), lo: Math.min(...v), hi: Math.max(...v), n: v.length }] : [];
  });
}
