// Birim ve değer türü gösterimi (denetim D-05, D-06, D-09). DOM'suz, veri dosyası okumaz.
import { test } from "node:test";
import assert from "node:assert/strict";
import { yaz } from "../src/lib/bicim.ts";
import { sayi, deger, degerTuru, degisim, type Seri } from "../src/lib/veri.ts";

test("yüzde puan: yüzde işareti yok, puan yazılır", () => {
  assert.equal(yaz("yuzde-puan", -24.71), "−24,7 puan");
  assert.equal(yaz("yuzde-puan", 3.2, "eksen"), "3,2");
  assert.equal(yaz("yuzde-puan", -3.25, "hucre"), "−3,3");
  assert.equal(deger({ birim: "yuzde-puan", carpan: 1 }, "-24.71"), "−24,7 yüzde puan");
  assert.equal(deger({ birim: "yuzde-puan", carpan: 1 }, "-24.71", true), "−24,7");
  // Diğer yüzde birimleri değişmedi.
  assert.equal(yaz("yuzde", -2.5), "−%2,5");
  assert.equal(deger({ birim: "yuzde-gsyh", carpan: 1 }, "41.1"), "%41,1 GSYH");
});

test("sıfıra yuvarlanan negatif değer −0,0 yazılmaz", () => {
  assert.equal(sayi(-0.04, 1), "0,0");
  assert.equal(sayi(-0.06, 1), "−0,1");
  assert.equal(yaz("yuzde", -0.004), "%0,0");
  assert.equal(yaz("yuzde-puan", -0.004), "0,0 puan");
  assert.equal(yaz("yuzde", -0.04), "%0,0");
  assert.equal(deger({ birim: "yuzde", carpan: 1 }, -0.04), "%0,0");
  const s = { birim: "yuzde", carpan: 1, siklik: "aylik", gozlemler: [{ donem: "2025-09", deger: "36.02" }, { donem: "2025-10", deger: "36.0" }] } as unknown as Seri;
  assert.equal(degisim(s)!.metin, "0,0 puan");
  assert.equal(degisim({ ...s, gozlemler: [s.gozlemler[0], { donem: "2025-11", deger: "36" }] }), null);
});

test("model tahmini: içinde bulunulan yılın değeri projeksiyon", () => {
  const s = (son: string, tur: Seri["deger_turu"] = "model_tahmini") =>
    ({ deger_turu: tur, cekildi: "2026-11-20T05:00:00Z", gozlemler: [{ donem: "2024", deger: "40" }, { donem: son, deger: "41.1" }, { donem: "2027", deger: null }] }) as unknown as Seri;
  assert.equal(degerTuru(s("2026")), "Model tahmini · 2026 projeksiyon");
  assert.equal(degerTuru(s("2025")), "Model tahmini");          // tamamlanmış yıl: projeksiyon denmez
  assert.equal(degerTuru(s("2026", "gozlem")), null);           // gözlem serisi etiketlenmez
});
