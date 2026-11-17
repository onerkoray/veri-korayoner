"""ECB, Eurostat, emsal ülke ve değişiklik günlüğü — ağsız.

Fixture'lar ECB Data API ve Eurostat SDMX 2.1'in 17 Kasım 2026'daki gerçek yanıtları.
"""

from __future__ import annotations

import json
from datetime import UTC, date, datetime
from decimal import Decimal
from pathlib import Path

import pytest

from veri.baglayicilar.bis import BIS
from veri.baglayicilar.ecb import ECB
from veri.baglayicilar.eurostat import Eurostat
from veri.baglayicilar.sdmx import KaynakUyusmazligi
from veri.modeller import Gozlem, Izin, SeriDosyasi, SeriTanimi
from veri.ulkeler import anahtar_ulke
from veri.yayin import emsal_yaz, farklar, gunluge_ekle

FIX = Path(__file__).parent / "fixtures"
ECB_CSV = (FIX / "ecb-eur-try.csv").read_bytes()
UNE = (FIX / "eurostat-une-tr.csv").read_bytes()
CBPOL = (FIX / "bis-cbpol-tr.csv").read_bytes()


def _s(kaynak, kod, siklik, **k):
    return SeriTanimi(id="t-" + kaynak, kaynak=kaynak, kod=kod, ulke="TUR", baslik="T", tema="t",
                      siklik=siklik, birim="yuzde", **k)


# ---- ECB ---------------------------------------------------------------------------
def test_ecb_gunluk_kur_kayipsiz_ve_baslangic():
    istenen = []
    h = ECB(getirici=lambda u: istenen.append(u) or ECB_CSV).cek(
        _s("ecb", "EXR/D.TRY.EUR.SP00.A", "gunluk", baslangic="2005-01-01"))
    assert istenen == ["https://data-api.ecb.europa.eu/service/data/EXR/D.TRY.EUR.SP00.A?format=csvdata&startPeriod=2005-01-01"]
    assert h.gozlemler[0].donem == "2026-11-02" and h.gozlemler[0].deger == Decimal("56.0442")
    assert h.kaynak_adi == "Turkish lira/Euro ECB reference exchange rate"


def test_ecb_baska_para_birimi_reddedilir():
    with pytest.raises(KaynakUyusmazligi, match="ülkesi"):
        ECB(getirici=lambda u: ECB_CSV.replace(b",TRY,EUR,", b",ARS,EUR,")).cek(_s("ecb", "EXR/D.TRY.EUR.SP00.A", "gunluk"))


# ---- Eurostat ----------------------------------------------------------------------
def test_eurostat_kucuk_harfli_sutunlar_ve_guncelleme_tarihi():
    istenen = []
    h = Eurostat(getirici=lambda u: istenen.append(u) or UNE).cek(_s("eurostat", "une_rt_m/M.SA.TOTAL.PC_ACT.T.TR", "aylik"))
    assert istenen == ["https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/data/une_rt_m/M.SA.TOTAL.PC_ACT.T.TR?format=SDMX-CSV"]
    assert [g.donem for g in h.gozlemler][-1] == "2026-09" and h.gozlemler[-1].deger == Decimal("8.4")
    assert h.kaynak_guncelleme == date(2026, 11, 5)       # 'LAST UPDATE' gg/aa/yy


def test_eurostat_gizli_gozlem_yayimlanmaz():
    b = UNE.replace(b"2026-06,7.7,,", b"2026-06,7.7,,C")
    h = Eurostat(getirici=lambda u: b).cek(_s("eurostat", "une_rt_m/M.SA.TOTAL.PC_ACT.T.TR", "aylik"))
    assert h.elenen == 1 and "2026-06" not in [g.donem for g in h.gozlemler]


def test_eurostat_emsal_ab_toplami_ve_sart_kapsami():
    istenen = []
    yanit = UNE.replace(b",TR,", b",EU27_2020,")
    Eurostat(getirici=lambda u: istenen.append(u) or yanit).cek(
        _s("eurostat", "une_rt_m/M.SA.TOTAL.PC_ACT.T.TR", "aylik").model_copy(update={"ulke": "EUU"}))
    assert "/M.SA.TOTAL.PC_ACT.T.EU27_2020?" in istenen[0]
    # Şartın istisnası: AB/EFTA/aday dışı ülke verisi ticari kullanılamaz → çekilmez bile.
    with pytest.raises(KaynakUyusmazligi, match="kapsamıyor"):
        Eurostat(getirici=lambda u: UNE).cek(
            _s("eurostat", "une_rt_m/M.SA.TOTAL.PC_ACT.T.TR", "aylik").model_copy(update={"ulke": "BRA"}))


# ---- emsal ülke anahtarı -----------------------------------------------------------
def test_anahtar_ulke_yalniz_tam_parcayi_degistirir():
    assert anahtar_ulke("M.TR.771", "TR", "BR") == "M.BR.771"
    assert anahtar_ulke("Q.TR.P.A.M.770.A", "TR", "MX") == "Q.MX.P.A.M.770.A"
    with pytest.raises(ValueError):
        anahtar_ulke("D.TRY.EUR.SP00.A", "TR", "BR")


def test_bis_emsal_adresi_ve_ulke_dogrulamasi():
    istenen = []
    b = CBPOL.replace(b"M,TR,", b"M,BR,")
    BIS(getirici=lambda u: istenen.append(u) or b).cek(
        _s("bis", "WS_CBPOL/1.0/M.TR", "aylik").model_copy(update={"ulke": "BRA"}))
    assert istenen == ["https://stats.bis.org/api/v2/data/dataflow/BIS/WS_CBPOL/1.0/M.BR?format=csv"]


def test_emsal_listesi_dogrulanir():
    with pytest.raises(ValueError):
        _s("bis", "WS_CBPOL/1.0/M.TR", "aylik", emsal=["TUR"])
    with pytest.raises(ValueError):
        _s("bis", "WS_CBPOL/1.0/M.TR", "aylik", emsal=["BRA", "BRA"])


def test_emsal_yaz_dusen_ulkenin_eski_verisini_korur(tmp_path):
    s = _s("bis", "WS_CBPOL/1.0/M.TR", "aylik", emsal=["BRA", "MEX"])
    iz = Izin(gosterim=True, indirme=True, api=False)
    g = [Gozlem(donem="2026-01", deger=Decimal("15"))]
    assert emsal_yaz(s, iz, {"BRA": g, "MEX": g}, tmp_path)
    assert not emsal_yaz(s, iz, {"BRA": g}, tmp_path)          # MEX düştü: eski kalır, dosya aynı
    v = json.loads((tmp_path / "site-veri/emsal/t-bis.json").read_text(encoding="utf-8"))
    assert set(v["ulkeler"]) == {"BRA", "MEX"} and v["ulkeler"]["BRA"][0]["deger"] == "15"
    assert not (tmp_path / "api/v1/emsal/t-bis.json").exists()   # API izni yok


# ---- değişiklik günlüğü ------------------------------------------------------------
def _dosya(gozlem):
    return SeriDosyasi(id="t-gun", baslik="T", ulke="TUR", siklik="yillik", birim="yuzde", carpan=1, tema="t",
                       kaynak={"kurum": "K"}, kaynak_kod="X", cekildi=datetime(2026, 11, 17, tzinfo=UTC),
                       izin=Izin(gosterim=True), gozlemler=gozlem)


def test_farklar_yeni_donem_ve_revizyon(tmp_path):
    eski = {"gozlemler": [{"donem": "2024", "deger": "3.10"}, {"donem": "2025", "deger": "2.0"}]}
    d = _dosya([Gozlem(donem="2024", deger=Decimal("3.1")), Gozlem(donem="2025", deger=Decimal("2.4")),
                Gozlem(donem="2026", deger=Decimal("1.9"))])
    o = farklar(eski, d, "2026-11-18")
    assert {x["tur"] for x in o} == {"yeni-donem", "revizyon"}
    rev = next(x for x in o if x["tur"] == "revizyon")
    assert rev["donem"] == "2025" and rev["onceki"] == "2.0" and rev["yeni"] == "2.4"   # 3.10 = 3.1: revizyon değil
    assert farklar(None, d, "2026-11-18") == []                                        # ilk yayında olay yok
    gunluge_ekle(o, tmp_path)
    gunluge_ekle([{"gun": "2026-11-19", "seri": "t-gun", "tur": "yeni-donem", "donem": "2027", "yeni": "1"}], tmp_path)
    k = json.loads((tmp_path / "site-veri/degisiklikler.json").read_text(encoding="utf-8"))["kayitlar"]
    assert k[0]["gun"] == "2026-11-19" and len(k) == 3


def test_farklar_toplu_revizyon_tek_kayit():
    eski = {"gozlemler": [{"donem": str(y), "deger": "1"} for y in range(1990, 2020)]}
    d = _dosya([Gozlem(donem=str(y), deger=Decimal("2")) for y in range(1990, 2020)])
    o = farklar(eski, d, "2026-11-18")
    assert len(o) == 1 and o[0]["adet"] == 30 and o[0]["ilk"] == "1990"


# ---- Dünya Bankası: emsaller tek istekte ---------------------------------------------
def test_wb_cok_ulkeli_yanit_gruplanir_ve_dogrulanir():
    from veri.baglayicilar.world_bank import DunyaBankasi, ayristir_coklu
    from veri.baglayicilar.world_bank import KaynakUyusmazligi as WBUyusmazlik

    def satir(u, y, v):
        return {"indicator": {"id": "FP.CPI.TOTL.ZG"}, "countryiso3code": u, "date": y, "value": v}
    yanit = json.dumps([{"page": 1, "pages": 1}, [satir("BRA", "2025", 5.1), satir("BRA", "2026", None),
                                                  satir("MEX", "2024", 4.7), satir("MEX", "2025", 3.9)]]).encode()
    g = ayristir_coklu(yanit, "FP.CPI.TOTL.ZG", ["BRA", "MEX"])
    assert [x.donem for x in g["BRA"]] == ["2025"] and g["MEX"][-1].deger == Decimal("3.9")
    with pytest.raises(WBUyusmazlik, match="istenmeyen"):
        ayristir_coklu(yanit, "FP.CPI.TOTL.ZG", ["BRA"])
    istenen = []
    s = SeriTanimi(id="t-wb", kaynak="world_bank", kod="FP.CPI.TOTL.ZG", ulke="TUR", baslik="T", tema="t",
                   siklik="yillik", birim="yuzde", emsal=["BRA", "MEX"])
    DunyaBankasi(getirici=lambda u: istenen.append(u) or yanit).cek_coklu(s, s.emsal)
    assert istenen == ["https://api.worldbank.org/v2/country/BRA;MEX/indicator/FP.CPI.TOTL.ZG?format=json&per_page=20000"]
