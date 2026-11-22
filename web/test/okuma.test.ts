// node --test test/  (Node ≥ 22.18 tür ayıklamasıyla .ts dosyasını doğrudan koşar)
import { test } from "node:test";
import assert from "node:assert/strict";
import { ek, donemAdi, konum, oku, sirala, siraCumlesi, reelFaiz, birYilOnce, seri_yon, type Nokta } from "../src/lib/okuma.ts";

const yuzde = (v: number) => "%" + v.toLocaleString("tr-TR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const yil = (vs: number[], bas = 2000): Nokta[] => vs.map((v, i) => ({ donem: String(bas + i), v }));
const ay = (vs: number[], y = 2024, m = 1): Nokta[] =>
  vs.map((v, i) => { const t = (m - 1) + i; return { donem: `${y + Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`, v }; });

test("Türkçe ek uyumu: yıl ve çeyrek", () => {
  assert.equal(ek("2002", "de"), "2002'de");
  assert.equal(ek("1960", "den"), "1960'tan");
  assert.equal(ek("2005", "den"), "2005'ten");
  assert.equal(ek("1990", "de"), "1990'da");
  assert.equal(ek("2000", "den"), "2000'den");
  assert.equal(ek("Mart 2023", "de"), "Mart 2023'te");
  assert.equal(ek("1986", "de"), "1986'da");
  assert.equal(ek("2024 2. çeyrek", "de"), "2024 2. çeyrekte");
  assert.equal(donemAdi("2026-03-04"), "4 Mart 2026");
  assert.equal(donemAdi("2025-Q3"), "2025 3. çeyrek");
  assert.equal(donemAdi("2025-S2"), "2025 2. yarıyıl");
  assert.equal(ek("2025 2. yarıyıl", "de"), "2025 2. yarıyılda");
  assert.equal(ek("2025 1. yarıyıl", "den"), "2025 1. yarıyıldan");
});

test("konum: zirve, dip ve en son ne zaman", () => {
  assert.equal(konum(yil([1, 2, 3, 4]), "yillik").tur, "zirve");
  assert.equal(konum(yil([4, 3, 2, 1]), "yillik").tur, "dip");
  // 2001'de 9; sonra hep düşük; son değer 8 → "en son 2001'de".
  const k = konum(yil([5, 9, 3, 2, 2, 3, 8]), "yillik");
  assert.deepEqual(k, { tur: "yuksek", donem: "2001" });
  // Eşik altı (yakın geçmiş) cümle üretmez: dün de bu kadar yüksekti demek bilgi değil.
  assert.equal(konum(yil([1, 2, 9, 3, 8]), "yillik").tur, null);
});

test("oku: oran serisinde bir yıl önce ve ortalama; sayılar seriden", () => {
  const d = ay([60, 70, 75, 72, 70, 68, 65, 62, 55, 52, 50, 48, 45, 44, 42, 40], 2024, 1);
  const c = oku(d, "aylik", "yuzde", yuzde);
  // Son gözlem Nisan 2025 (%40); bir yıl önce Nisan 2024 (%72).
  assert.deepEqual(c, [
    "%40,0, serinin Ocak 2024'ten bu yana kayıttaki en düşük değeri.",
    "Bir yıl önce %72,0 idi; fark −32,0 puan.",
    "Ocak 2024'ten bu yana ortalama %57,4.",      // seri kısa: "son on yıl" cümlesi yok
    "Son 13 ay üst üste düştü.",
  ]);
});

test("oku: kurda TL değer kaybı ile kur artışı ayrı hesaplanır", () => {
  const d: Nokta[] = [{ donem: "2025-11-14", v: 40 }, { donem: "2026-11-16", v: 50 }];
  const c = oku(d, "gunluk", "TRY/EUR", (v) => v.toFixed(2) + " TL");
  assert.ok(c.some((x) => x.includes("euro kuru %25,0 arttı") && x.includes("%20,0 değer kaybı")), c.join(" | "));
});

test("birYilOnce ve seri_yon", () => {
  assert.equal(birYilOnce(ay([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]), "aylik")?.donem, "2024-01");
  assert.equal(birYilOnce(yil([1, 2]), "yillik"), null);
  assert.equal(birYilOnce([{ donem: "2024-S2", v: 1 }, { donem: "2025-S1", v: 2 }, { donem: "2025-S2", v: 3 }], "yariyillik")?.donem, "2024-S2");
  assert.equal(seri_yon(yil([5, 4, 3, 2])), -3);
  assert.equal(seri_yon(yil([1, 2, 2])), 0);
});

test("sirala: emsallerin %60'ı olan en yeni dönem, toplam (AB) sıraya girmez", () => {
  const tr = yil([10, 30, 35], 2023);
  const u = {
    BRA: yil([5, 6], 2023), MEX: yil([4, 5], 2023), ZAF: yil([6, 7, 6], 2023), POL: yil([2, 3], 2023), EUU: yil([3, 2.5], 2023),
  };
  const s = sirala(tr, u)!;
  assert.equal(s.donem, "2024");                     // 2025'te yalnız ZAF var
  assert.equal(s.sira, 1); assert.equal(s.toplam, 5);
  assert.equal(s.medyan, 5.5);
  assert.deepEqual(s.toplamlar, [{ kod: "EUU", v: 2.5 }]);
  assert.equal(siraCumlesi(s, yuzde, (k) => (k === "EUU" ? "AB" : k)),
    "2024'te Türkiye 5 ülkenin en yükseği; emsal medyanı %5,5, AB %2,5.");
});

test("reelFaiz: Fisher formülü, yalnız ortak dönemler", () => {
  const r = reelFaiz(ay([50, 45]), ay([75], 2024, 2));
  assert.equal(r.length, 1);
  assert.equal(r[0].donem, "2024-02");
  assert.ok(Math.abs(r[0].v - ((1.45 / 1.75 - 1) * 100)) < 1e-9);
});

test("oku: Gini puan farkı ve göreli değişim; bileşik büyüme yok", () => {
  // Seyrek yayın: 2013 ve 2023 var, arada boşluk.
  const d: Nokta[] = [{ donem: "2003", v: 42 }, { donem: "2013", v: 40 }, { donem: "2019", v: 41.9 }, { donem: "2023", v: 43.7 }];
  const c = oku(d, "yillik", "puan", (v) => v.toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
  const s = c.find((x) => x.includes("arasında"))!;
  assert.match(s, /^2013–2023 arasında \+3,7 puan \(göreli değişim \+%9,3\)\.$/);
  assert.ok(!c.some((x) => /yıllık ortalama/.test(x)));
});

test("oku: yaşam süresinde fark yıl olarak", () => {
  const c = oku(yil([70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81]), "yillik", "yil", (v) => `${v} yıl`);
  assert.ok(c.some((x) => x === "2001–2011 arasında +10,0 yıl."), c.join(" | "));
});

test("siraCumlesi: karşılaştırma dönemi Türkiye'nin son döneminden eskiyse söyler", () => {
  const tr = yil([10, 20, 30], 2021);
  const s = sirala(tr, { BRA: yil([5, 25], 2021), MEX: yil([15, 15], 2021) })!;
  assert.equal(s.donem, "2022");
  const c = siraCumlesi(s, (v) => String(v), (k) => k, tr.at(-1));
  assert.match(c, /Karşılaştırma 2022'de yapılıyor/);
  assert.match(c, /o dönemdeki değeri 20, en son değeri 30 \(2023\)/);
  assert.ok(!/Karşılaştırma/.test(siraCumlesi(s, String, (k) => k, tr[1])));
});

import { yillikDegisimler } from "../src/lib/okuma.ts";

test("yıllık değişim: oranda puan, düzeyde yüzde, eşi yoksa yok", () => {
  const a = yillikDegisimler(ay([10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 25], 2024, 1), "aylik", "yuzde");
  assert.deepEqual(a.get("2025-01"), { fark: 15, tur: "puan" });
  assert.equal(a.get("2024-12"), undefined);
  const b = yillikDegisimler(yil([100, 110, 0, 50]), "yillik", "USD");
  assert.ok(Math.abs(b.get("2001")!.fark - 10) < 1e-9);
  assert.equal(b.get("2003"), undefined);                          // önceki 0: yüzde değişim tanımsız
  assert.deepEqual(yillikDegisimler(yil([70, 71.5]), "yillik", "yil").get("2001"), { fark: 1.5, tur: "yil" });
  assert.equal(yillikDegisimler([{ donem: "2025-01-02", v: 1 }], "gunluk", "USD").size, 0);
  assert.deepEqual(yillikDegisimler([{ donem: "2024-Q2", v: 4 }, { donem: "2025-Q2", v: 6 }], "ceyreklik", "endeks").get("2025-Q2"), { fark: 50, tur: "yuzde" });
});
