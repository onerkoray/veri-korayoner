// Panorama ana grafiği: aralık başlangıcı ve eksik ayların null kalması.
import { test } from "node:test";
import assert from "node:assert/strict";
import { aralikBaslangici, genisTablo, type AnaSeri } from "../src/lib/ana-grafik-cekirdek.ts";

const faiz: AnaSeri = { k: "faiz", ad: "F", kaynak: "BIS", d: [["2024-11", "50"], ["2025-10", "40.5"], ["2026-10", "36"]] };
const enf: AnaSeri = { k: "enf", ad: "E", kaynak: "BIS", d: [["2024-11", "47.1"], ["2025-10", "32.9"]] };

test("aralık: son N yıl, en yeni döneme göre; 0 hepsi", () => {
  assert.equal(aralikBaslangici([faiz, enf], 1), "2025-11");
  assert.equal(aralikBaslangici([faiz, enf], 10), "2016-11");
  assert.equal(aralikBaslangici([{ ...faiz, d: [["2026-01", "1"]] }], 1), "2025-02");
  assert.equal(aralikBaslangici([{ ...faiz, d: [["2026-12", "1"]] }], 1), "2026-01");
  assert.equal(aralikBaslangici([faiz], 0), null);
  assert.equal(aralikBaslangici([{ ...faiz, d: [] }], 5), null);
});

test("geniş tablo: dönem birleşimi, eksik ay null, ham metin korunur", () => {
  const t = genisTablo([faiz, enf], "2025-01");
  assert.deepEqual(t.map((r) => r.donem), ["2025-10", "2026-10"]);
  assert.equal(t[1].v.enf, null);
  assert.equal(t[1].ham.faiz, "36");
  assert.equal(t[0].ham.faiz, "40.5");
  assert.deepEqual(genisTablo([], null), []);
});
