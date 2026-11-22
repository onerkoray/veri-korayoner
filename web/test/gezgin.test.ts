// Veri gezgini çekirdeği: boş aralık, uygunluk, arama, CSV/metaveri — regresyon testleri.
import { test } from "node:test";
import assert from "node:assert/strict";
import { uygunMu, ortakSiklik, yilAraligi, kapsam, zamanAlani, olcek, eslesir, csvMetni, metaveri, tarih, type Satir, type Tanim } from "../src/lib/gezgin-cekirdek.ts";

const s = (d: string, v: string, tam = true): Satir => [d, v, v, 1, tam];

test("boş aralık geçersiz Date ya da sonsuz ölçek üretmez", () => {
  const veri = [s("2020", "1"), s("2021", "2")];
  const bos = yilAraligi(veri, 1990, 1999);
  assert.deepEqual(bos, []);
  assert.equal(zamanAlani([bos]), null);
  assert.equal(zamanAlani([]), null);
  assert.equal(olcek([]), null);
  assert.equal(olcek([NaN, Infinity]), null);
  assert.deepEqual(olcek([3, -1, 2]), [-1, 3]);
  assert.equal(kapsam(bos), null);
  assert.deepEqual(kapsam(veri), [2020, 2021]);
});

test("tek noktalı seride zaman alanı genişletilir, ters değil", () => {
  const [a, b] = zamanAlani([[s("2024", "1")]])!;
  assert.ok(+a < +b && Number.isFinite(+a));
  assert.ok(Number.isFinite(+tarih("2025-S2")) && Number.isFinite(+tarih("2025-Q4")));
});

test("sıklık uygunluğu: yıllıktan aylık üretilmez, ortak sıklık seçilir", () => {
  assert.equal(uygunMu("aylik", "yillik"), true);
  assert.equal(uygunMu("yillik", "aylik"), false);
  assert.equal(uygunMu("yariyillik", "ceyreklik"), false);
  assert.equal(ortakSiklik(["aylik", "ceyreklik"]), "ceyreklik");
  assert.equal(ortakSiklik(["aylik", "yillik"]), "yillik");
  assert.equal(ortakSiklik(["aylik"]), "aylik");
});

test("arama Türkçe harf ve büyük/küçük duyarsız", () => {
  assert.ok(eslesir("İşsizlik oranı, aylık", "issizlik"));
  assert.ok(eslesir("Kadınların işgücüne katılım oranı", "KADIN katılım"));
  assert.ok(eslesir("Gini katsayısı", ""));
  assert.ok(!eslesir("Nüfus", "faiz"));
});

test("CSV: eksik dönem işareti, boş hücre, ham değer", () => {
  const t = { id: "a-1" } as Tanim, u = { id: "b-2" } as Tanim;
  const csv = csvMetni([t, u], { "a-1": [s("2024", "1.5"), s("2025", "2", false)], "b-2": [s("2025", "-3")] }, 1);
  assert.equal(csv, "donem,a-1,a-1__tam,b-2,b-2__tam\n2024,1.5,1,,\n2025,2,0,-3,1\n");
});

test("metaveri her sütunu ve türetilmiş değeri açıklar", () => {
  const t: Tanim = { id: "x-1", baslik: "X", birim: "yuzde", tema: "t", kaynak: "BIS", kaynak_kod: "K", kaynak_siklik: "aylik", lisans: "L", turetilmis: true };
  const m = metaveri([t], { s: "yillik", d: "ort", b: 2010, e: 2026 }, "yöntem", "https://veri.korayoner.dev/gezgin#g=x-1", new Date("2026-11-19T00:00:00Z"));
  assert.equal(m.sutunlar.length, 3);
  assert.match(String(m.sutunlar[1].deger), /bu sitenin hesabı: dönem ortalaması/);
  assert.equal(m.baglanti, "https://veri.korayoner.dev/gezgin#g=x-1");
});

import { olcekUygun, ortakBaz, donustur, sirala } from "../src/lib/gezgin-cekirdek.ts";

test("ölçek uygunluğu: oranda endeks yok, düzeyde fark yok", () => {
  assert.equal(olcekUygun("USD", "endeks"), true);
  assert.equal(olcekUygun("yuzde", "endeks"), false);
  assert.equal(olcekUygun("puan", "endeks"), false);
  assert.equal(olcekUygun("yuzde-gsyh", "fark"), true);
  assert.equal(olcekUygun("kisi", "fark"), false);
  assert.equal(olcekUygun("kisi", "deger"), true);
});

test("ortak baz: hepsinin değeri olan ilk dönem; dönüştürme bazdan başlar", () => {
  const a = [s("2019", "50"), s("2020", "100"), s("2021", "150")], b = [s("2020", "4"), s("2021", "6")];
  assert.equal(ortakBaz([a, b], 1), "2020");
  assert.equal(ortakBaz([a, [s("1990", "1")]], 1), null);
  assert.deepEqual(donustur(a, 1, "endeks", "2020")!.map((x) => x.v), [100, 150]);
  assert.deepEqual(donustur(b, 1, "fark", "2020")!.map((x) => x.v), [0, 2]);
  assert.equal(donustur([s("2020", "-3"), s("2021", "2")], 1, "endeks", "2020"), null);   // negatif baz: endeks yok
  assert.equal(donustur(a, 1, "endeks", "1999"), null);
});

test("tablo sıralaması: boş hücre sonda, eşitlikte yeni dönem önce", () => {
  const r = [{ donem: "2020", v: 2 }, { donem: "2021", v: null }, { donem: "2022", v: 5 }, { donem: "2023", v: 2 }];
  assert.deepEqual(sirala(r, (x) => x.v, "artan").map((x) => x.donem), ["2023", "2020", "2022", "2021"]);
  assert.deepEqual(sirala(r, (x) => x.v, "azalan").map((x) => x.donem), ["2022", "2023", "2020", "2021"]);
});
