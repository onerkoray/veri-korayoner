// Veri gezgininin DOM'suz çekirdeği: aralık, uygunluk, ölçek, arama, CSV ve metaveri.
// Saf fonksiyonlar; `node --test` ile sınanır (test/gezgin.test.ts).

export type Satir = [string, string, string, number, boolean];   // donem, ort, son, n, tam
export interface Tanim {
  id: string; baslik: string; birim: string; tema: string; kaynak: string; kaynak_kod: string;
  kaynak_siklik: string; lisans: string | null; turetilmis: boolean;
  deger_turu?: "gozlem" | "model_tahmini";
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

type PanelSikligi = (typeof GORUNUM_SIKLIK)[number];

export const donemSayisi = (siklik: PanelSikligi) => siklik === "aylik" ? 12 : siklik === "ceyreklik" ? 4 : 1;

export function yilAraligi(satir: Satir[], b: number, e: number, siklik?: PanelSikligi, ilk = 1, son = 0): Satir[] {
  const n = siklik ? donemSayisi(siklik) : 1;
  return satir.filter((r) => {
    const p = siklik ? donemSirasi(r[0], siklik) : Number(r[0].slice(0, 4));
    return p >= b * n + ilk - 1 && p < e * n + (son || n);
  });
}

/** Düzenli panelde iki dönemin ardışık olup olmadığını sayısal olarak ölçer. */
export function donemSirasi(donem: string, siklik: PanelSikligi): number {
  const y = Number(donem.slice(0, 4));
  if (siklik === "yillik") return y;
  return siklik === "aylik" ? y * 12 + Number(donem.slice(5)) - 1 : y * 4 + Number(donem.slice(6)) - 1;
}

const panelDegeri = (r: Satir, i: 1 | 2) => r[i].trim() ? Number(r[i]) : NaN;

/** Betimleyici özet: kısmi dönemler istatistiğe ve dönemlik değişime girmez. */
export function seriOzeti(satir: Satir[], i: 1 | 2, siklik: PanelSikligi, b: number, e: number, ilk = 1, sonDonem = 0) {
  const gecerli = satir.filter((r) => Number.isFinite(panelDegeri(r, i)));
  const tam = gecerli.filter((r) => r[4]);
  const sayilar = tam.map((r) => panelDegeri(r, i));
  const ortalama = sayilar.length ? sayilar.reduce((a, v) => a + v, 0) / sayilar.length : null;
  const standartSapma = ortalama !== null && sayilar.length > 1
    ? Math.sqrt(sayilar.reduce((a, v) => a + (v - ortalama) ** 2, 0) / (sayilar.length - 1)) : null;
  const son = gecerli.at(-1), onceki = gecerli.at(-2);
  const degisim = son?.[4] && onceki?.[4] && donemSirasi(son[0], siklik) - donemSirasi(onceki[0], siklik) === 1
    ? panelDegeri(son, i) - panelDegeri(onceki, i) : null;
  const n = donemSayisi(siklik);
  const beklenen = (e - b) * n - ilk + 1 + (sonDonem || n);
  return { son, degisim, ortalama, standartSapma, aralik: olcek(sayilar), tam: tam.length,
    kismi: gecerli.length - tam.length, beklenen };
}

/** Pearson r yalnız iki seride de gözlenen, ardışık ve tam dönem farklarıyla. */
export const KORELASYON_ASGARI = 12;
export function farkIliskisi(a: Satir[], b: Satir[], i: 1 | 2, siklik: PanelSikligi) {
  const farklar = (satir: Satir[]) => {
    const sonuc = new Map<string, number>();
    for (let j = 1; j < satir.length; j++) {
      const once = satir[j - 1], simdi = satir[j];
      const fark = panelDegeri(simdi, i) - panelDegeri(once, i);
      if (simdi[4] && once[4] && Number.isFinite(fark)
        && donemSirasi(simdi[0], siklik) - donemSirasi(once[0], siklik) === 1) sonuc.set(simdi[0], fark);
    }
    return sonuc;
  };
  const x = farklar(a), y = farklar(b);
  const eslesme = [...x].flatMap(([donem, v]) => y.has(donem) ? [{ donem, x: v, y: y.get(donem)! }] : []);
  const n = eslesme.length;
  if (n < KORELASYON_ASGARI) return { n, r: null, neden: "az", eslesme } as const;
  const ox = eslesme.reduce((s, p) => s + p.x, 0) / n, oy = eslesme.reduce((s, p) => s + p.y, 0) / n;
  let xx = 0, yy = 0, xy = 0;
  for (const p of eslesme) { const dx = p.x - ox, dy = p.y - oy; xx += dx * dx; yy += dy * dy; xy += dx * dy; }
  const r = xy / (Math.sqrt(xx) * Math.sqrt(yy));
  return Number.isFinite(r) ? { n, r: Math.max(-1, Math.min(1, r)), neden: null, eslesme } as const
    : { n, r: null, neden: "sabit", eslesme } as const;
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
  const m = anahtar(metin);
  const es: Record<string, string> = { tufe: "enflasyon", enflasyon: "tufe", gsyih: "gsyh", issizlik: "issiz", sagp: "ppp", ppp: "sagp" };
  return !q || q.split(/\s+/).every((p) => m.includes(p) || (Object.hasOwn(es, p) && m.includes(es[p])));
}

export function csvMetni(secili: Tanim[], satir: Record<string, Satir[]>, kolon: 1 | 2): string {
  const har = secili.map((t) => new Map(satir[t.id].map((r) => [r[0], r])));
  const donemler = [...new Set(secili.flatMap((t) => satir[t.id].map((r) => r[0])))].sort();
  const satirlar = [["donem", ...secili.flatMap((t) => [t.id, `${t.id}__tam`])].join(",")];
  for (const p of donemler) satirlar.push([p, ...har.flatMap((h) => { const r = h.get(p); return r ? [r[kolon], r[4] ? "1" : "0"] : ["", ""]; })].join(","));
  return satirlar.join("\n") + "\n";
}

export type Olcek = "deger" | "ortak" | "endeks" | "fark";
/** Ortak grafikte aynı eksene konabilecek seri sayısı: renk körlüğünde ayırt edilebilen palet 4 renk. */
export const ORTAK_AZAMI = 4;
/** Ölçek uygun mu: endeks (baz = 100) yalnız pozitif düzeylerde; oran ve puan serisinde oranın
 *  oranı anlamsız. Fark (baz döneme göre puan) yalnız yüzde serilerinde. */
export function olcekUygun(birim: string, o: Olcek): boolean {
  if (o === "deger" || o === "ortak") return true;
  const oran = birim.startsWith("yuzde");
  return o === "endeks" ? !oran && birim !== "puan" : oran;
}
/** Bütün serilerin değeri olan ilk dönem (ortak baz); yoksa null. */
export function ortakBaz(satirlar: Satir[][], i: 1 | 2): string | null {
  if (!satirlar.length) return null;
  const kume = satirlar.map((s) => new Set(s.filter((r) => Number.isFinite(Number(r[i])) && r[i] !== "").map((r) => r[0])));
  return [...kume[0]].sort().find((d) => kume.every((k) => k.has(d))) ?? null;
}
export interface Nokta { donem: string; v: number; tam: boolean }
/** Baz döneme göre dönüştürür; bazdan önceki dönemler düşer. Endeks: v / v0 × 100 (v0 > 0 değilse null).
 *  Fark: v − v0 (yüzde puan). Değer: aynen. */
export function donustur(sat: Satir[], i: 1 | 2, o: Olcek, baz: string | null): Nokta[] | null {
  const n = sat.map((r) => ({ donem: r[0], v: panelDegeri(r, i), tam: r[4] })).filter((x) => Number.isFinite(x.v) && (!baz || x.donem >= baz));
  if (o === "deger" || o === "ortak") return n;
  const v0 = n.find((x) => x.donem === baz)?.v;
  if (v0 === undefined) return null;
  if (o === "endeks") return v0 > 0 ? n.map((x) => ({ ...x, v: (x.v / v0) * 100 })) : null;
  return n.map((x) => ({ ...x, v: x.v - v0 }));
}
/** Tablo sıralaması: boş hücre yöne bakmadan sonda; eşitlikte dönem yeniden eskiye. */
export function sirala<T extends { donem: string }>(satirlar: T[], deger: (s: T) => number | null, yon: "artan" | "azalan"): T[] {
  const k = yon === "artan" ? 1 : -1;
  return [...satirlar].sort((a, b) => {
    const x = deger(a), y = deger(b);
    if (x == null || y == null) return x == null && y == null ? b.donem.localeCompare(a.donem) : x == null ? 1 : -1;
    return (x - y) * k || b.donem.localeCompare(a.donem);
  });
}

export interface GorunumDurumu { s: string; d: "ort" | "son"; b: number; e: number; p?: number; q?: number; o?: Olcek }
/** CSV'nin yanında indirilen metaveri: her sütunun kaynağı, lisansı, türetilmiş olup olmadığı. */
export function metaveri(secili: Tanim[], g: GorunumDurumu, yontem: string, baglanti: string, simdi: Date) {
  return {
    olusturuldu: simdi.toISOString(), baglanti, kaynak_site: "https://veri.korayoner.dev/gezgin",
    gorunum: { siklik: g.s, deger: g.d === "ort" ? "dönem ortalaması" : "dönem sonu", baslangic_yili: g.b, bitis_yili: g.e,
      ...(g.p && { baslangic_alt_donemi: g.p }), ...(g.q && { bitis_alt_donemi: g.q }),
      olcek: g.o === "endeks" ? "ekranda endeks (ortak baz dönemi = 100); CSV ham değerdir" : g.o === "fark" ? "ekranda baz döneme göre yüzde puan farkı; CSV ham değerdir" : "değer" },
    yontem,
    sutunlar: [{ ad: "donem", aciklama: "dönem anahtarı (YYYY, YYYY-Qn ya da YYYY-AA)" },
      ...secili.flatMap((t) => [
        { ad: t.id, baslik: t.baslik, birim: t.birim, kaynak: t.kaynak, kaynak_kod: t.kaynak_kod, lisans: t.lisans,
          kaynak_siklik: t.kaynak_siklik, turetilmis: t.turetilmis, deger_turu: t.deger_turu ?? "gozlem",
          deger: t.turetilmis ? `bu sitenin hesabı: ${g.d === "ort" ? "dönem ortalaması" : "dönemin son gözlemi"}` : "kaynaktaki değer" },
        { ad: `${t.id}__tam`, aciklama: "1: dönemin bütün alt dönemleri var; 0: eksik dönem" },
      ])],
  };
}

/** Adres parçası (#…): yalnız varsayılandan farklı ve boş olmayan alanlar, sırası sabit, virgül kodlanmaz
 *  (fragment'te serbest). Hepsi varsayılansa "" döner: çıplak adres, # yok. */
export function adresParcasi(alanlar: [string, string, string][]): string {
  const p = alanlar.filter(([, v, vars]) => v !== "" && v !== vars).map(([k, v]) => `${k}=${encodeURIComponent(v).replace(/%2C/gi, ",")}`);
  return p.length ? `#${p.join("&")}` : "";
}
