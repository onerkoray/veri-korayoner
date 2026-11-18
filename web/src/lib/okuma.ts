// Veriden okuma: seriyi tarihine, bir yıl öncesine ve emsallerine göre konumlayan
// cümleler. Saf fonksiyonlar (dosya okumaz); `node --test` ile sınanır.
// Kural: cümledeki her rakam serinin kendisinden hesaplanır; yorum (iyi/kötü) yok.

export interface Nokta { donem: string; v: number }
export type Yaz = (v: number) => string;

const AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

export function zaman(d: string): number {
  const y = Number(d.slice(0, 4));
  const q = /-Q([1-4])$/.exec(d.replace(/-S([12])$/, (_: string, s: string) => (s === "1" ? "-Q1" : "-Q3")));
  if (q) return Date.UTC(y, (Number(q[1]) - 1) * 3, 1);
  const p = d.split("-");
  return Date.UTC(y, p[1] ? Number(p[1]) - 1 : 0, p[2] ? Number(p[2]) : 1);
}

/** "2025", "Mart 2025", "2025 2. çeyrek", "3 Mart 2025". */
export function donemAdi(d: string): string {
  const q = /^(\d{4})-Q([1-4])$/.exec(d);
  if (q) return `${q[1]} ${q[2]}. çeyrek`;
  const h = /^(\d{4})-S([12])$/.exec(d);
  if (h) return `${h[1]} ${h[2]}. yarıyıl`;
  const p = d.split("-");
  if (p.length === 1) return d;
  if (p.length === 2) return `${AYLAR[Number(p[1]) - 1]} ${p[0]}`;
  return `${Number(p[2])} ${AYLAR[Number(p[1]) - 1]} ${p[0]}`;
}

// Türkçe ek uyumu: yalnız bu sitenin ürettiği etiketlerin son sözcüğü için
// (yıl sayısı ya da "çeyrek"). [ünlü, sert ünsüz mü]
const BIRLER: Record<number, [string, boolean]> = { 1: ["e", false], 2: ["e", false], 3: ["e", true], 4: ["e", true], 5: ["e", true], 6: ["a", false], 7: ["e", false], 8: ["e", false], 9: ["a", false] };
const ONLAR: Record<number, [string, boolean]> = { 1: ["a", false], 2: ["e", false], 3: ["a", false], 4: ["a", true], 5: ["e", false], 6: ["a", true], 7: ["e", true], 8: ["e", false], 9: ["a", false] };
function sesUyumu(etiket: string): [string, boolean] {
  if (etiket.endsWith("çeyrek")) return ["e", true];
  if (etiket.endsWith("yarıyıl")) return ["a", false];
  const n = Number(/(\d+)$/.exec(etiket)?.[1] ?? NaN);
  if (!Number.isFinite(n)) return ["e", false];
  if (n % 10) return BIRLER[n % 10];
  if (n % 100) return ONLAR[(n % 100) / 10];
  return ["e", false];          // yüz, bin
}
/** Bulunma (de) ya da ayrılma (den) eki, kesme işaretiyle: "2002'de", "2025 2. çeyrekten". */
export function ek(etiket: string, tur: "de" | "den"): string {
  const [u, sert] = sesUyumu(etiket);
  const kok = (sert ? "t" : "d") + u + (tur === "den" ? "n" : "");
  return /(çeyrek|yarıyıl)$/.test(etiket) ? etiket + kok : `${etiket}'${kok}`;
}

const BIRIM_ADI: Record<string, string> = { yillik: "yıl", yariyillik: "yarıyıl", ceyreklik: "çeyrek", aylik: "ay", haftalik: "hafta", gunluk: "iş günü" };
const ESIK: Record<string, number> = { yillik: 3, yariyillik: 4, ceyreklik: 4, aylik: 6, haftalik: 8, gunluk: 20 };

export function ortalama(v: number[]): number { return v.reduce((a, b) => a + b, 0) / v.length; }
export function medyan(v: number[]): number {
  const s = [...v].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Bir yıl önceki gözlem: aylık/çeyreklikte aynı dönem, günlükte 365 gün önceki ya da hemen öncesi. */
export function birYilOnce(d: Nokta[], siklik: string): Nokta | null {
  const son = d.at(-1);
  if (!son || siklik === "yillik") return null;
  if (siklik === "gunluk" || siklik === "haftalik") {
    const hedef = zaman(son.donem) - 365 * 864e5;
    for (let i = d.length - 1; i >= 0; i--) if (zaman(d[i].donem) <= hedef) return d[i];
    return null;
  }
  const aranan = String(Number(son.donem.slice(0, 4)) - 1) + son.donem.slice(4);
  return d.find((p) => p.donem === aranan) ?? null;
}

/** Sondaki aynı yönlü ardışık değişim sayısı: +n yükseliş, −n düşüş. */
export function seri_yon(d: Nokta[]): number {
  let n = 0, yon = 0;
  for (let i = d.length - 1; i > 0; i--) {
    const f = Math.sign(d[i].v - d[i - 1].v);
    if (f === 0 || (yon && f !== yon)) break;
    yon = f; n++;
  }
  return n * yon;
}

export interface Konum { tur: "zirve" | "dip" | "yuksek" | "dusuk" | null; donem: string | null }
/** Son değerin tarihteki yeri: rekor mu, değilse en son ne zaman bu kadar yüksek/düşüktü. */
export function konum(d: Nokta[], siklik: string): Konum {
  if (d.length < 3) return { tur: null, donem: null };
  const son = d.at(-1)!.v, once = d.slice(0, -1);
  if (once.every((p) => p.v < son)) return { tur: "zirve", donem: null };
  if (once.every((p) => p.v > son)) return { tur: "dip", donem: null };
  const yukarida = son >= medyan(once.map((p) => p.v));
  for (let j = once.length - 1; j >= 0; j--) {
    if (yukarida ? once[j].v >= son : once[j].v <= son) {
      return d.length - 1 - j >= (ESIK[siklik] ?? 3) ? { tur: yukarida ? "yuksek" : "dusuk", donem: once[j].donem } : { tur: null, donem: null };
    }
  }
  return { tur: null, donem: null };
}

/** Seri okuması: en çok dört cümle. `birim` bu sitenin birim kodu, `yaz` değer biçimi. */
export function oku(d: Nokta[], siklik: string, birim: string, yaz: Yaz): string[] {
  const c: string[] = [];
  if (d.length < 2) return c;
  const son = d.at(-1)!, ilk = d[0];
  const oran = birim.startsWith("yuzde");
  const kur = birim === "TRY/USD" || birim === "TRY/EUR";

  const k = konum(d, siklik);
  if (k.tur === "zirve") c.push(`${yaz(son.v)}, serinin ${ek(donemAdi(ilk.donem), "den")} bu yana kayıttaki en yüksek değeri.`);
  else if (k.tur === "dip") c.push(`${yaz(son.v)}, serinin ${ek(donemAdi(ilk.donem), "den")} bu yana kayıttaki en düşük değeri.`);
  else if (k.tur && k.donem) c.push(`Bu kadar ${k.tur === "yuksek" ? "yüksek" : "düşük"} bir değer en son ${ek(donemAdi(k.donem), "de")} görülmüştü.`);

  const once = birYilOnce(d, siklik);
  if (once) {
    if (oran) {
      const f = son.v - once.v;
      c.push(`Bir yıl önce ${yaz(once.v)} idi; fark ${f >= 0 ? "+" : "−"}${Math.abs(f).toLocaleString("tr-TR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} puan.`);
    } else if (kur) {
      const artis = (son.v / once.v - 1) * 100, kayip = (1 - once.v / son.v) * 100;
      const para = birim === "TRY/USD" ? "dolar" : "euro";
      c.push(`Bir yıl önce ${yaz(once.v)} idi: ${para} kuru %${pct(artis)} ${artis >= 0 ? "arttı" : "azaldı"}; bu, TL'nin ${para} karşısında %${pct(Math.abs(kayip))} ${kayip >= 0 ? "değer kaybı" : "değer kazancı"} demek.`);
    } else {
      const f = (son.v / once.v - 1) * 100;
      c.push(`Bir yıl öncesine göre ${f >= 0 ? "+" : "−"}%${pct(Math.abs(f))} (${ek(donemAdi(once.donem), "de")} ${yaz(once.v)}).`);
    }
  } else if (siklik === "yillik" && !oran && d.length > 10) {
    const on = d.find((p) => p.donem === String(Number(son.donem) - 10));
    if (on && on.v > 0 && son.v > 0) {
      const top = (son.v / on.v - 1) * 100, yil = ((son.v / on.v) ** 0.1 - 1) * 100;
      c.push(`On yılda (${on.donem}–${son.donem}) ${top >= 0 ? "+" : "−"}%${pct(Math.abs(top))}; yıllık ortalama ${yil >= 0 ? "+" : "−"}%${pct(Math.abs(yil))}.`);
    }
  }

  if ((oran || birim === "endeks") && d.length >= 10 && siklik !== "gunluk") {
    const adet = ({ yillik: 10, yariyillik: 20, ceyreklik: 40, aylik: 120 } as Record<string, number>)[siklik] ?? 10;
    const tum = ortalama(d.map((p) => p.v)), on = ortalama(d.slice(-adet).map((p) => p.v));
    // Seri on yıldan belirgin uzun değilse "son on yıl" ayrı bilgi taşımaz.
    c.push(`${ek(donemAdi(ilk.donem), "den")} bu yana ortalama ${yaz(tum)}` +
      (d.length >= adet * 1.5 ? `; son on yılın ortalaması ${yaz(on)}.` : "."));
  }

  const y = seri_yon(d);
  if (Math.abs(y) >= 3 && siklik !== "yillik") c.push(`Son ${Math.abs(y)} ${BIRIM_ADI[siklik]} üst üste ${y > 0 ? "yükseldi" : "düştü"}.`);
  else if (Math.abs(y) >= 3) c.push(`${Math.abs(y)} yıldır üst üste ${y > 0 ? "yükseliyor" : "düşüyor"}.`);
  return c;
}

function pct(v: number): string { return v.toLocaleString("tr-TR", { maximumFractionDigits: 1, minimumFractionDigits: 1 }); }

// ---- emsal ülkeler ---------------------------------------------------------------
export const TOPLAM = new Set(["EUU"]);       // ülke değil, toplam: sıralamaya girmez, başvuru çizgisidir

export interface Sira {
  donem: string; sira: number; toplam: number; medyan: number;
  satirlar: { kod: string; v: number }[];    // Türkiye dahil, yüksekten düşüğe; toplamlar hariç
  toplamlar: { kod: string; v: number }[];
}

/** Türkiye'nin emsaller arasındaki yeri. Dönem: Türkiye'nin değeri olan ve emsallerin en az
 *  %60'ının (en az 2) değerinin bulunduğu en yeni dönem. Yoksa null. */
export function sirala(tr: Nokta[], ulkeler: Record<string, Nokta[]>): Sira | null {
  const ulke = Object.keys(ulkeler).filter((u) => !TOPLAM.has(u));
  const esik = Math.max(2, Math.ceil(ulke.length * 0.6));
  const harita = Object.fromEntries(Object.entries(ulkeler).map(([u, d]) => [u, new Map(d.map((p) => [p.donem, p.v]))]));
  for (let i = tr.length - 1; i >= 0; i--) {
    const p = tr[i];
    const var_ = ulke.filter((u) => harita[u].has(p.donem));
    if (var_.length < esik) continue;
    const satirlar = [{ kod: "TUR", v: p.v }, ...var_.map((u) => ({ kod: u, v: harita[u].get(p.donem)! }))]
      .sort((a, b) => b.v - a.v);
    return {
      donem: p.donem, sira: satirlar.findIndex((s) => s.kod === "TUR") + 1, toplam: satirlar.length,
      medyan: medyan(var_.map((u) => harita[u].get(p.donem)!)), satirlar,
      toplamlar: Object.keys(ulkeler).filter((u) => TOPLAM.has(u) && harita[u].has(p.donem)).map((u) => ({ kod: u, v: harita[u].get(p.donem)! })),
    };
  }
  return null;
}

export function siraCumlesi(s: Sira, yaz: Yaz, ad: (k: string) => string): string {
  const yer = s.sira === 1 ? `${s.toplam} ülkenin en yükseği` : s.sira === s.toplam ? `${s.toplam} ülkenin en düşüğü`
    : `${s.toplam} ülke arasında yüksekten düşüğe ${s.sira}.`;
  const ref = s.toplamlar.map((t) => `${ad(t.kod)} ${yaz(t.v)}`).join(", ");
  return `${ek(donemAdi(s.donem), "de")} Türkiye ${yer}; emsal medyanı ${yaz(s.medyan)}${ref ? `, ${ref}` : ""}.`;
}

// ---- türetilmiş seri: reel politika faizi ------------------------------------------
/** Fisher: (1 + i) / (1 + π) − 1, yüzde. Yalnız iki serinin de değeri olan dönemler. */
export function reelFaiz(faiz: Nokta[], enf: Nokta[]): Nokta[] {
  const e = new Map(enf.map((p) => [p.donem, p.v]));
  return faiz.filter((p) => e.has(p.donem)).map((p) => ({ donem: p.donem, v: ((1 + p.v / 100) / (1 + e.get(p.donem)! / 100) - 1) * 100 }));
}
