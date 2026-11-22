// Veri gezgininin DOM'suz çekirdeği: aralık, uygunluk, ölçek, arama, CSV ve metaveri.
// Saf fonksiyonlar; `node --test` ile sınanır (test/gezgin.test.ts).

export type Satir = [string, string, string, number, boolean];   // donem, ort, son, n, tam
export interface Tanim {
  id: string; baslik: string; birim: string; tema: string; kaynak: string; kaynak_kod: string;
  kaynak_siklik: string; lisans: string | null; turetilmis: boolean;
}

export const SIRA = ["gunluk", "haftalik", "aylik", "ceyreklik", "yariyillik", "yillik"];
export const GORUNUM_SIKLIK = ["aylik", "ceyreklik", "yillik"] as const;

/** Seri, istenen görünüm sıklığında var mı? (Yıllık seriden aylık üretilmez.) */
export function uygunMu(kaynakSiklik: string, gorunum: string): boolean {
  return SIRA.indexOf(kaynakSiklik) <= SIRA.indexOf(gorunum);
}
/** Seçilen serilerin hepsinin görülebileceği en sık görünüm (ör. aylık + yıllık seri → yıllık). */
export function ortakSiklik(kaynakSiklik: string[]): (typeof GORUNUM_SIKLIK)[number] {
  return GORUNUM_SIKLIK.find((g) => kaynakSiklik.every((k) => uygunMu(k, g))) ?? "yillik";
}

export function yilAraligi(satir: Satir[], b: number, e: number): Satir[] {
  return satir.filter((r) => { const y = Number(r[0].slice(0, 4)); return y >= b && y <= e; });
}
/** Serinin kapsadığı yıllar; boşsa null. */
export function kapsam(satir: Satir[]): [number, number] | null {
  return satir.length ? [Number(satir[0][0].slice(0, 4)), Number(satir.at(-1)![0].slice(0, 4))] : null;
}

export function tarih(d: string): Date {
  const y = Number(d.slice(0, 4)), q = /-Q(\d)$/.exec(d), h = /-S(\d)$/.exec(d);
  if (q) return new Date(Date.UTC(y, (Number(q[1]) - 1) * 3 + 1, 15));
  if (h) return new Date(Date.UTC(y, h[1] === "1" ? 3 : 9, 1));
  return d.length === 7 ? new Date(Date.UTC(y, Number(d.slice(5)) - 1, 15)) : new Date(Date.UTC(y, 6, 1));
}
/** Grafik zaman ekseni: boş veride null (geçersiz Date üretilmez). */
export function zamanAlani(satirlar: Satir[][]): [Date, Date] | null {
  const t = satirlar.flat().map((r) => +tarih(r[0])).filter(Number.isFinite);
  if (!t.length) return null;
  let lo = t[0], hi = t[0];
  for (const x of t) { if (x < lo) lo = x; if (x > hi) hi = x; }
  return lo === hi ? [new Date(lo - 180 * 864e5), new Date(hi + 180 * 864e5)] : [new Date(lo), new Date(hi)];
}
/** Renk ölçeği için en küçük/en büyük; boş ya da sonlu olmayan veride null. */
export function olcek(v: number[]): [number, number] | null {
  const s = v.filter(Number.isFinite);
  if (!s.length) return null;
  let lo = s[0], hi = s[0];
  for (const x of s) { if (x < lo) lo = x; if (x > hi) hi = x; }
  return [lo, hi];
}

/** Türkçe büyük/küçük harf ve aksan duyarsız arama anahtarı. */
export function anahtar(s: string): string {
  return s.toLocaleLowerCase("tr").normalize("NFD").replace(/\p{M}/gu, "").replace(/ı/g, "i");
}
export function eslesir(metin: string, sorgu: string): boolean {
  const q = anahtar(sorgu).trim();
  return !q || q.split(/\s+/).every((p) => anahtar(metin).includes(p));
}

export function csvMetni(secili: Tanim[], satir: Record<string, Satir[]>, kolon: 1 | 2): string {
  const har = secili.map((t) => new Map(satir[t.id].map((r) => [r[0], r])));
  const donemler = [...new Set(secili.flatMap((t) => satir[t.id].map((r) => r[0])))].sort();
  const satirlar = [["donem", ...secili.flatMap((t) => [t.id, `${t.id}__tam`])].join(",")];
  for (const p of donemler) satirlar.push([p, ...har.flatMap((h) => { const r = h.get(p); return r ? [r[kolon], r[4] ? "1" : "0"] : ["", ""]; })].join(","));
  return satirlar.join("\n") + "\n";
}

export interface GorunumDurumu { s: string; d: "ort" | "son"; b: number; e: number }
/** CSV'nin yanında indirilen metaveri: her sütunun kaynağı, lisansı, türetilmiş olup olmadığı. */
export function metaveri(secili: Tanim[], g: GorunumDurumu, yontem: string, baglanti: string, simdi: Date) {
  return {
    olusturuldu: simdi.toISOString(), baglanti, kaynak_site: "https://veri.korayoner.dev/gezgin",
    gorunum: { siklik: g.s, deger: g.d === "ort" ? "dönem ortalaması" : "dönem sonu", baslangic_yili: g.b, bitis_yili: g.e },
    yontem,
    sutunlar: [{ ad: "donem", aciklama: "dönem anahtarı (YYYY, YYYY-Qn ya da YYYY-AA)" },
      ...secili.flatMap((t) => [
        { ad: t.id, baslik: t.baslik, birim: t.birim, kaynak: t.kaynak, kaynak_kod: t.kaynak_kod, lisans: t.lisans,
          kaynak_siklik: t.kaynak_siklik, turetilmis: t.turetilmis,
          deger: t.turetilmis ? `bu sitenin hesabı: ${g.d === "ort" ? "dönem ortalaması" : "dönemin son gözlemi"}` : "kaynaktaki değer" },
        { ad: `${t.id}__tam`, aciklama: "1: dönemin bütün alt dönemleri var; 0: eksik dönem" },
      ])],
  };
}
