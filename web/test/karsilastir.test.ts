// Ülke karşılaştırması: dönem kuralı okuma.ts ile aynı, eksik ülke sıfır sayılmaz.
import { test } from "node:test";
import assert from "node:assert/strict";
import { uygunDonemler, siralaDonem, medyanSerisi, esik } from "../src/lib/karsilastir-cekirdek.ts";
import { sirala, type Nokta } from "../src/lib/okuma.ts";

const y = (vs: (number | null)[], bas = 2020): Nokta[] => vs.flatMap((v, i) => (v == null ? [] : [{ donem: String(bas + i), v }]));
const tr = y([10, 20, 30, 40]);
const ulkeler = { BRA: y([5, 25, 35, null]), MEX: y([15, 15, null, null]), CHL: y([1, 2, 3, null]), EUU: y([7, 7, 7, 7]) };

test("eşik %60, en az 2", () => {
  assert.equal(esik(2), 2); assert.equal(esik(3), 2); assert.equal(esik(9), 6); assert.equal(esik(10), 6);
});

test("uygun dönemler yeniden eskiye; ilki okuma.ts sirala ile aynı", () => {
  assert.deepEqual(uygunDonemler(tr, ulkeler), ["2022", "2021", "2020"]);
  assert.equal(sirala(tr, ulkeler)!.donem, uygunDonemler(tr, ulkeler)[0]);
  assert.deepEqual(siralaDonem(tr, ulkeler, "2022"), { ...sirala(tr, ulkeler)!, eksik: ["MEX"] });
});

test("seçilen dönemde sıra, medyan, toplam başvuru ve eksik ülke", () => {
  const s = siralaDonem(tr, ulkeler, "2021")!;
  assert.deepEqual(s.satirlar.map((r) => r.kod), ["BRA", "TUR", "MEX", "CHL"]);
  assert.equal(s.sira, 2); assert.equal(s.toplam, 4); assert.equal(s.medyan, 15);
  assert.deepEqual(s.toplamlar, [{ kod: "EUU", v: 7 }]);
  assert.deepEqual(s.eksik, []);
  assert.equal(siralaDonem(tr, ulkeler, "2023"), null);           // yalnız 0/3 emsal: karşılaştırma yok
  assert.equal(siralaDonem(tr, ulkeler, "1999"), null);
});

test("medyan serisi yalnız eşiği sağlayan dönemlerde; AB-27 dahil değil", () => {
  const m = medyanSerisi(tr, ulkeler);
  assert.deepEqual(m.map((x) => x.donem), ["2020", "2021", "2022"]);
  assert.deepEqual(m[2], { donem: "2022", medyan: 19, lo: 3, hi: 35, n: 2 });
});
