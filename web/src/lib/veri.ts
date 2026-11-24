// Derleme zamanı veri katmanı: yayin/site-veri (kanonik) ve yayin/api (katalog).
import { readFileSync, existsSync } from "node:fs";
import { FARK_BIRIM, type Nokta } from "./okuma.ts";
import { join } from "node:path";

const YAYIN = join(process.cwd(), "..", "yayin");

export interface Izin { gosterim: boolean; indirme: boolean; api: boolean }
export interface Gozlem { donem: string; deger: string | null; durum?: string | null }
export interface KaynakOzet {
  id: string; ad: string; kurum: string; adres: string; belge: string | null;
  lisans: string | null; lisans_kanit: string | null; lisans_inceleme: string | null; atif_zorunlu: boolean;
  kosullar?: string[];
}
export interface Seri {
  id: string; baslik: string; ulke: string; siklik: string; birim: string; carpan: number; tema: string;
  kaynak: KaynakOzet; kaynak_kod: string; kaynak_adi: string | null; kaynak_not: string | null;
  kaynak_guncelleme: string | null; cekildi: string; izin: Izin; gozlemler: Gozlem[];
  /** Katalogdan: kaynağın gözlemi mi, kaynağın kendi model tahmini mi (kayıtta beyan). */
  deger_turu?: "gozlem" | "model_tahmini";
}
export interface Kaynak extends KaynakOzet { durum: string; erisim: string; yayin: Izin }

const oku = (y: string) => JSON.parse(readFileSync(join(YAYIN, y), "utf8"));

export function seriler(): Seri[] {
  const k = oku("site-veri/seriler.json");
  return k.seriler.map((s: { id: string; deger_turu?: Seri["deger_turu"] }) =>
    ({ ...oku(`site-veri/seri/${s.id}.json`), deger_turu: s.deger_turu ?? "gozlem" }) as Seri);
}
/** Model tahmini etiketi (denetim D-06): kaynağın modelle ürettiği seri; son değer içinde
 *  bulunulan ya da gelecek bir yıla aitse projeksiyondur. Gözlem serisinde null. */
export function degerTuru(s: Pick<Seri, "deger_turu" | "gozlemler" | "cekildi">): string | null {
  if (s.deger_turu !== "model_tahmini") return null;
  const sn = [...s.gozlemler].reverse().find((g) => g.deger != null);
  const proj = sn && Number(sn.donem.slice(0, 4)) >= Number(s.cekildi.slice(0, 4));
  return proj ? `Model tahmini · ${sn!.donem.slice(0, 4)} projeksiyon` : "Model tahmini";
}
export function kaynaklar(): Kaynak[] { return oku("api/v1/kaynaklar.json").kaynaklar; }
/** Kayıttaki okuma bilgisi (site-veri/seriler.json): bağlam metni, not, ilişkili göstergeler. */
export interface Baglam { baglam: string | null; not: string | null; iliskili: string[] }
export function baglamlar(): Map<string, Baglam> {
  return new Map((oku("site-veri/seriler.json").seriler as ({ id: string } & Partial<Baglam>)[])
    .map((s) => [s.id, { baglam: s.baglam ?? null, not: s.not ?? null, iliskili: s.iliskili ?? [] }]));
}

export interface Emsal { id: string; birim: string; siklik: string; kaynak: string; ulkeler: Record<string, Gozlem[]> }
/** Emsal ülke gözlemleri (yalnız kayıtta `emsal` listesi olan seriler). */
export function emsal(id: string): Emsal | null {
  const y = `site-veri/emsal/${id}.json`;
  return existsSync(join(YAYIN, y)) ? oku(y) : null;
}
export function emsalNoktalari(e: Emsal): Record<string, Nokta[]> {
  return Object.fromEntries(Object.entries(e.ulkeler).map(([u, g]) => [u, g.filter((x) => x.deger != null).map((x) => ({ donem: x.donem, v: Number(x.deger) }))]));
}
export interface Olay { gun: string; seri: string; tur: "yeni-donem" | "revizyon"; donem?: string; onceki?: string | null; yeni?: string | null; adet?: number; ilk?: string; son?: string }
export function degisiklikler(): Olay[] {
  const y = "site-veri/degisiklikler.json";
  return existsSync(join(YAYIN, y)) ? oku(y).kayitlar : [];
}
export interface SeriDurumu { id: string; gecikti: boolean; ardisik_hata: number; son_basarili_kontrol: string | null; son_gozlem: string | null }
export interface KaynakDurumu { id: string; seri: number; son_basarili_kontrol: string | null; hatali: string[]; geciken: string[] }
export interface Durum { son_kontrol: string; ozet: { seri: number; yayinda: number; hatali: number; geciken: number }; kaynaklar: KaynakDurumu[]; seriler: SeriDurumu[] }
/** api/v1/durum.json: sağlık ve tazelik (yoksa null). */
export function durum(): Durum | null {
  const y = "api/v1/durum.json";
  return existsSync(join(YAYIN, y)) ? oku(y) : null;
}
export function noktalar(s: Seri): Nokta[] { return dolu(s).map((g) => ({ donem: g.donem, v: Number(g.deger) })); }

export const ULKE: Record<string, string> = {
  TUR: "Türkiye", BRA: "Brezilya", MEX: "Meksika", ZAF: "Güney Afrika", POL: "Polonya", HUN: "Macaristan",
  IND: "Hindistan", IDN: "Endonezya", CHL: "Şili", COL: "Kolombiya", ROU: "Romanya", EUU: "AB-27",
};
export const ulkeAdi = (k: string) => ULKE[k] ?? k;
export function uretildi(): string { return oku("api/v1/kaynaklar.json").uretildi; }

export const TEMA: Record<string, string> = {
  buyume: "Büyüme ve gelir", enflasyon: "Enflasyon", "dis-sektor": "Dış sektör", isgucu: "İşgücü",
  "doviz-rezerv": "Döviz ve rezervler", "para-politikasi": "Para politikası", "kamu-maliyesi": "Kamu maliyesi",
  bankacilik: "Bankacılık ve kredi", konut: "Konut", "dis-ticaret": "Dış ticaret", toplum: "Nüfus ve toplum",
};
export const TEMA_SIRA = Object.keys(TEMA);

export const DURUM: Record<string, [string, string]> = {
  aktif: ["Aktif", "iyi"], gelistiriliyor: ["Geliştiriliyor", "bilgi"], planlandi: ["Planlandı", "soluk"],
  "anahtar-gerekli": ["Anahtar gerekli", "uyari"], "lisans-gerekli": ["Lisans gerekli", "uyari"],
  "yalniz-katalog": ["Yalnız katalog", "soluk"],
};

// ---- sayılar: Türkçe biçim ----------------------------------------------------
const AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
export function sayi(v: number, ondalik = 0): string {
  // Gösterim hassasiyetinde sıfıra yuvarlanan negatif değer "−0,0" yazılmaz (denetim D-09).
  if (Number(Math.abs(v).toFixed(ondalik)) === 0) v = 0;
  return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: ondalik, maximumFractionDigits: ondalik })
    .format(v).replace("-", "−");
}
export function deger(s: Pick<Seri, "birim" | "carpan">, ham: string | number | null, kisa = false): string {
  if (ham == null) return "—";
  const v = Number(ham) * (s.carpan || 1);
  if (!Number.isFinite(v)) return "—";
  switch (s.birim) {
    case "yuzde": return (v < 0 ? "−%" : "%") + sayi(Math.abs(v), 1);
    case "yuzde-gsyh": return (v < 0 ? "−%" : "%") + sayi(Math.abs(v), 1) + (kisa ? "" : " GSYH");
    // İki oranın farkı (ör. BIS kredi açığı: fiili − eğilim): yüzde değil yüzde puan.
    case "yuzde-puan": return sayi(v, 1) + (kisa ? "" : " yüzde puan");
    case "USD": {
      const a = Math.abs(v), isaret = v < 0 ? "−" : "";
      if (a >= 1e12) return isaret + sayi(a / 1e12, 2) + " trilyon $";
      if (a >= 1e9) return isaret + sayi(a / 1e9, 1) + " milyar $";
      if (a >= 1e6) return isaret + sayi(a / 1e6, 1) + " milyon $";
      return isaret + sayi(a, 0) + " $";
    }
    case "TRY/USD": case "TRY/EUR": return sayi(v, 2) + " TL";
    case "endeks": case "puan": return sayi(v, 1);
    case "PPS": return sayi(v, 0) + " PPS";
    case "yil": return sayi(v, 1) + " yıl";
    case "ay": return sayi(v, 1) + (kisa ? "" : " ay");
    case "dogum": return sayi(v, 2) + (kisa ? "" : " çocuk");
    case "kisi": return Math.abs(v) >= 1e6 ? sayi(v / 1e6, 1) + " milyon" : sayi(v, 0);
    default: return sayi(v, 2) + " " + s.birim;
  }
}
export function birimAdi(b: string): string {
  return ({ yuzde: "yüzde", "yuzde-gsyh": "GSYH'ye oran, yüzde", "yuzde-puan": "yüzde puan (iki oranın farkı)", USD: "ABD doları, cari", "TRY/USD": "1 ABD doları kaç TL", "TRY/EUR": "1 euro kaç TL", PPS: "satın alma gücü standardı (PPS)", yil: "yıl", kisi: "kişi", endeks: "endeks", puan: "puan (0–100 ölçek)", ay: "ay (ithalatı karşılama)", dogum: "kadın başına doğum" } as Record<string, string>)[b] ?? b;
}
export function siklikAdi(s: string): string {
  return ({ yillik: "Yıllık", yariyillik: "Yarıyıllık", ceyreklik: "Çeyreklik", aylik: "Aylık", haftalik: "Haftalık", gunluk: "Günlük" } as Record<string, string>)[s] ?? s;
}
export function tarih(iso: string | null): string {
  if (!iso) return "bilinmiyor";
  const [y, m, g] = iso.slice(0, 10).split("-").map(Number);
  return `${g} ${AYLAR[m - 1]} ${y}`;
}
/** Dönem anahtarını tarihe çevirir: 2025, 2025-03, 2025-Q2, 2025-03-14. */
export function donemTarihi(d: string): Date {
  const y = Number(d.slice(0, 4));
  const q = /-Q([1-4])$/.exec(d.replace(/-S([12])$/, (_: string, s: string) => (s === "1" ? "-Q1" : "-Q3")));
  if (q) return new Date(Date.UTC(y, (Number(q[1]) - 1) * 3, 1));
  const p = d.split("-");
  return new Date(Date.UTC(y, p[1] ? Number(p[1]) - 1 : 0, p[2] ? Number(p[2]) : 1));
}
export function dolu(s: Seri): Gozlem[] { return s.gozlemler.filter((g) => g.deger != null); }
export function son(s: Seri): Gozlem | null { const d = dolu(s); return d.length ? d[d.length - 1] : null; }
export function onceki(s: Seri): Gozlem | null { const d = dolu(s); return d.length > 1 ? d[d.length - 2] : null; }

/** Son değişim: oranlarda puan farkı, düzeylerde yüzde değişim. Formül sayfada yazılı. */
export function degisim(s: Seri): { metin: string; yon: number } | null {
  const a = onceki(s), b = son(s);
  if (!a || !b) return null;
  const x = Number(a.deger), y = Number(b.deger);
  if (s.birim.startsWith("yuzde")) {
    const f = y - x;
    return { metin: (Math.abs(f) < 0.05 ? "" : f > 0 ? "+" : "−") + sayi(Math.abs(f), 1) + " puan", yon: Math.sign(f) };
  }
  // Sınırlı ölçekli düzeyler: fark birincil; Gini'de göreli değişim yanında.
  if (s.birim === "puan" || s.birim in FARK_BIRIM) {
    const f = y - x, rel = x ? ` (göreli ${(f >= 0 ? "+%" : "−%") + sayi(Math.abs(f / x) * 100, 1)})` : "";
    return { metin: (f >= 0 ? "+" : "−") + sayi(Math.abs(f), s.birim === "dogum" ? 2 : 1) + (s.birim === "puan" ? " puan" + rel : " " + FARK_BIRIM[s.birim]), yon: Math.sign(f) };
  }
  if (x === 0) return null;
  const f = (y / x - 1) * 100;
  return { metin: (f >= 0 ? "+%" : "−%") + sayi(Math.abs(f), 1), yon: Math.sign(f) };
}
