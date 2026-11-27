"""Yayımlanmış API dosyalarının şeması ve bütünlüğü — depodaki gerçek yayin/ üzerinde, ağsız.

v1 sözleşmesi: alan silinmez, yalnız eklenir. Bu testler istemcilerin dayandığı
alanların varlığını, dosyalar arası tutarlılığı ve lisans kapısını sınar.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
from decimal import ROUND_HALF_UP, Decimal, localcontext

import duckdb
import pytest

from veri.kayit import KOK, kaynaklar, seriler
from veri.modeller import SeriDosyasi
from veri.yayin import izin

API = KOK / "yayin" / "api" / "v1"
SITE = KOK / "yayin" / "site-veri"
pytestmark = pytest.mark.skipif(not (API / "seriler.json").exists(), reason="yayin/ henüz üretilmemiş")


def _j(yol):
    return json.loads(yol.read_text(encoding="utf-8"))


def test_katalog_v1_alanlari_ve_dosyalar():
    k = _j(API / "seriler.json")
    assert k["surum"] == 1 and k["uretildi"].endswith("Z")
    for s in k["seriler"]:
        assert {"id", "baslik", "tema", "siklik", "birim", "kaynak", "son", "cekildi", "izin", "api", "csv"} <= set(s)
        assert s["izin"]["api"] is True
        assert (KOK / "yayin" / s["api"].lstrip("/")).exists()
        if s["csv"]:
            assert (KOK / "yayin" / s["csv"].lstrip("/")).exists()


def test_her_seri_semaya_uyar_ve_csv_json_ile_ayni():
    for yol in sorted((API / "seri").glob("*.json")):
        d = SeriDosyasi.model_validate(_j(yol))
        csvyol = yol.with_suffix(".csv")
        if not csvyol.exists():
            assert not d.izin.indirme
            continue
        satir = list(csv.DictReader(io.StringIO(csvyol.read_text(encoding="utf-8"))))
        assert [r["donem"] for r in satir] == [g.donem for g in d.gozlemler], yol.name
        for r, g in zip(satir, d.gozlemler, strict=True):
            assert (Decimal(r["deger"]) if r["deger"] else None) == g.deger, (yol.name, g.donem)


def test_lisans_kapisi_yayinlanmis_dosyalarda():
    ks, ss = kaynaklar(), {s.id: s for s in seriler()}
    for yol in (API / "seri").glob("*"):
        s = ss[yol.stem]
        iz = izin(ks[s.kaynak], s)
        assert iz.api and (yol.suffix != ".csv" or iz.indirme), yol.name
    for yol in (API / "emsal").glob("*.json"):
        assert izin(ks[ss[yol.stem].kaynak], ss[yol.stem]).api, yol.name
    for yol in (API / "panel").glob("*.json"):
        for t in _j(yol)["seriler"]:
            assert izin(ks[ss[t["id"]].kaynak], ss[t["id"]]).indirme, (yol.name, t["id"])


def test_panel_semasi_ve_kaynak_degerleriyle_tutarlilik():
    for siklik in ("aylik", "ceyreklik", "yillik"):
        p = _j(API / "panel" / f"{siklik}.json")
        assert p["sutunlar"] == ["donem", "ort", "son", "n", "tam"] and p["siklik"] == siklik
        for t in p["seriler"]:
            satirlar = p["veri"][t["id"]]
            assert satirlar and all(len(r) == 5 for r in satirlar)
            if not t["turetilmis"]:          # kaynağın kendi sıklığı: değer aynen
                gozlem = _j(SITE / "seri" / f"{t['id']}.json")["gozlemler"]
                kaynak = {g["donem"]: g["deger"] for g in gozlem if g["deger"] is not None}
                assert {r[0]: r[1] for r in satirlar} == kaynak, t["id"]


def test_parquet_ozeti_dosyanin_kendisi():
    beklenen, ad = (API / "gozlemler.parquet.sha256").read_text(encoding="utf-8").split()
    assert ad == "gozlemler.parquet"
    assert hashlib.sha256((API / "gozlemler.parquet").read_bytes()).hexdigest() == beklenen


def test_parquet_ve_json_tum_donemlerde_eslesir():
    with duckdb.connect() as baglanti:
        satirlar = baglanti.execute(
            "SELECT seri, donem, deger, birim, siklik, kaynak, kaynak_kod, ulke FROM read_parquet(?)",
            [str(API / "gozlemler.parquet")],
        ).fetchall()
    beklenen = set()
    with localcontext() as ctx:
        ctx.prec = 38
        for yol in (API / "seri").glob("*.json"):
            d = _j(yol)
            for g in d["gozlemler"]:
                ham = g["deger"]
                deger = Decimal(ham).quantize(Decimal("1e-14"), rounding=ROUND_HALF_UP) if ham is not None else None
                beklenen.add((d["id"], g["donem"], deger, d["birim"], d["siklik"],
                              d["kaynak"]["id"], d["kaynak_kod"], d["ulke"]))
    assert len(satirlar) == len(beklenen)
    assert set(satirlar) == beklenen


def test_durum_ve_gunluk_semasi():
    d = _j(API / "durum.json")
    assert d["surum"] == 1 and {"son_kontrol", "ozet", "kaynaklar", "seriler"} <= set(d)
    for r in d["seriler"]:
        assert {"id", "kaynak", "son_kontrol", "son_basarili_kontrol", "son_gozlem", "gecikti", "ardisik_hata"} <= set(r)
    g = _j(API / "degisiklikler.json")
    for o in g["kayitlar"]:
        assert o["tur"] in ("yeni-donem", "revizyon") and {"gun", "seri"} <= set(o)
