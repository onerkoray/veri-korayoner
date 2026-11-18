"""ILO bağlayıcısı ve yarıyıllık sıklık — ağsız. Fixture'lar ILOSTAT SDMX ve Eurostat'ın
18 Kasım 2026'daki gerçek yanıtları."""

from __future__ import annotations

from decimal import Decimal
from pathlib import Path

import pytest

from veri.baglayicilar.eurostat import Eurostat
from veri.baglayicilar.ilo import ILO
from veri.baglayicilar.sdmx import KaynakUyusmazligi
from veri.modeller import SeriTanimi
from veri.panel import topla

FIX = Path(__file__).parent / "fixtures"
KADIN = (FIX / "ilo-kadin-katilim-tr.csv").read_bytes()
ASGARI = (FIX / "eurostat-asgari-pps-tr.csv").read_bytes()


def _ilo(**k):
    return SeriTanimi(id="t-ilo", kaynak="ilo", kod="DF_EAP_DWAP_SEX_AGE_RT/TUR.A..SEX_F.AGE_YTHADULT_YGE15", ulke="TUR",
                      baslik="T", tema="t", siklik="yillik", birim="yuzde", **k)


def test_ilo_adres_alfa3_ve_kayipsiz_deger():
    istenen = []
    h = ILO(getirici=lambda u: istenen.append(u) or KADIN).cek(_ilo(baslangic="1980"))
    assert istenen == ["https://sdmx.ilo.org/rest/data/ILO,DF_EAP_DWAP_SEX_AGE_RT/TUR.A..SEX_F.AGE_YTHADULT_YGE15?format=csvfile&startPeriod=1980"]
    assert h.gozlemler[0].donem == "2022" and h.gozlemler[0].deger == Decimal("35.114")
    assert h.kaynak_adi == "DF_EAP_DWAP_SEX_AGE_RT"          # ILO CSV seri adı vermiyor: akış kimliği


def test_ilo_emsalde_alfa3_parcasi_degisir():
    istenen = []
    ILO(getirici=lambda u: istenen.append(u) or KADIN.replace(b",TUR,", b",POL,")).cek(_ilo().model_copy(update={"ulke": "POL"}))
    assert "/POL.A..SEX_F.AGE_YTHADULT_YGE15?" in istenen[0]


def test_ilo_ayni_yil_iki_kaynak_reddedilir():
    satirlar = KADIN.decode().splitlines()
    cift = "\n".join([*satirlar, satirlar[1].replace("LFS - Household", "Official estimate")]).encode()
    with pytest.raises(KaynakUyusmazligi, match="birden fazla"):
        ILO(getirici=lambda u: cift).cek(_ilo())


def test_ilo_html_hata_sayfasi_reddedilir():
    with pytest.raises(KaynakUyusmazligi, match="XML/HTML"):
        ILO(getirici=lambda u: b"<!DOCTYPE html><html>Error</html>").cek(_ilo())


def test_yariyillik_asgari_ucret_ve_yilliga_toplama():
    s = SeriTanimi(id="t-mw", kaynak="eurostat", kod="earn_mw_cur/S.PPS.TR", ulke="TUR", baslik="T", tema="t",
                   siklik="yariyillik", birim="PPS")
    h = Eurostat(getirici=lambda u: ASGARI).cek(s)
    assert [g.donem for g in h.gozlemler] == ["2024-S1", "2024-S2", "2025-S1", "2025-S2"]
    satir = topla([{"donem": g.donem, "deger": format(g.deger, "f")} for g in h.gozlemler], "yariyillik", "yillik")
    assert satir[0] == ["2024", "1014", "1014", 2, True]
    assert topla([{"donem": "2024-S1", "deger": "1"}], "yariyillik", "ceyreklik") == []   # yarıyıldan çeyrek üretilmez
