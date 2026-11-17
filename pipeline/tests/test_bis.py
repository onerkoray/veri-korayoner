"""BIS bağlayıcısı — ağsız. Fixture'lar BIS SDMX v2'nin 17 Kasım 2026'daki gerçek yanıtları."""

from __future__ import annotations

from decimal import Decimal
from pathlib import Path

import pytest

from veri.baglayicilar.bis import BIS, KaynakUyusmazligi, ayristir
from veri.modeller import SeriTanimi

FIX = Path(__file__).parent / "fixtures"
CBPOL = (FIX / "bis-cbpol-tr.csv").read_bytes()
SPP = (FIX / "bis-spp-tr.csv").read_bytes()


def _seri(kod, siklik):
    return SeriTanimi(id="t-bis", kaynak="bis", kod=kod, ulke="TUR", baslik="T", tema="t", siklik=siklik, birim="yuzde")


def test_aylik_politika_faizi_ve_ulusal_kaynak():
    h = ayristir(CBPOL, _seri("WS_CBPOL/1.0/M.TR", "aylik"))
    assert h.gozlemler[0].donem == "2026-01"
    assert all(g.deger is not None and g.deger > 0 for g in h.gozlemler)
    assert h.kaynak_not == "Central Bank of the Republic of Turkey"
    assert h.kaynak_guncelleme is None          # BIS CSV bildirmiyor: uydurulmaz


def test_ceyreklik_kayipsiz():
    h = ayristir(SPP, _seri("WS_SPP/1.0/Q.TR.R.628", "ceyreklik"))
    assert [g.donem for g in h.gozlemler][:2] == ["2024-Q1", "2024-Q2"]
    assert h.gozlemler[0].deger == Decimal("237.2795")


def test_siklik_uyusmazligi_reddedilir():
    with pytest.raises(KaynakUyusmazligi, match="sıklık"):
        ayristir(SPP, _seri("WS_SPP/1.0/Q.TR.R.628", "aylik"))


def test_baska_ulke_reddedilir():
    b = SPP.replace(b"Q,TR,", b"Q,AR,")
    with pytest.raises(KaynakUyusmazligi, match="ülkesi"):
        ayristir(b, _seri("WS_SPP/1.0/Q.TR.R.628", "ceyreklik"))


def test_serbest_olmayan_gozlem_yayimlanmaz():
    satirlar = SPP.decode().splitlines()
    satirlar[1] = satirlar[1].replace(",A,F,", ",A,C,")   # 2024-Q1 gizli
    h = ayristir("\n".join(satirlar).encode(), _seri("WS_SPP/1.0/Q.TR.R.628", "ceyreklik"))
    assert h.elenen == 1 and h.gozlemler[0].donem == "2024-Q2"


def test_xml_hata_iletisi_reddedilir():
    b = b'<?xml version="1.0" ?><message:Error><message:ErrorMessage code="100"/></message:Error>'
    with pytest.raises(KaynakUyusmazligi, match="XML"):
        ayristir(b, _seri("WS_TC/1.0/Q.TR.P.A.M.770.A", "ceyreklik"))


def test_kod_bicimi_ve_adres():
    istenen = []
    BIS(getirici=lambda u: istenen.append(u) or CBPOL).cek(_seri("WS_CBPOL/1.0/M.TR", "aylik"))
    assert istenen == ["https://stats.bis.org/api/v2/data/dataflow/BIS/WS_CBPOL/1.0/M.TR?format=csv"]
    with pytest.raises(KaynakUyusmazligi):
        BIS(getirici=lambda u: CBPOL).cek(_seri("WS_CBPOL", "aylik"))


# ---- OECD (aynı SDMX-CSV ayrıştırıcısı, alfa-3 ülke kodu) ----------------------------
def test_oecd_cli_alfa3_ve_adres():
    from veri.baglayicilar.oecd import OECD
    b = (FIX / "oecd-cli-tr.csv").read_bytes()
    seri = SeriTanimi(id="t-oecd", kaynak="oecd", kod="OECD.SDD.STES,DSD_STES@DF_CLI,/TUR.M.LI...AA...H",
                      ulke="TUR", baslik="T", tema="t", siklik="aylik", birim="endeks")
    istenen = []
    h = OECD(getirici=lambda u: istenen.append(u) or b).cek(seri)
    assert istenen == ["https://sdmx.oecd.org/public/rest/data/OECD.SDD.STES,DSD_STES@DF_CLI,/TUR.M.LI...AA...H?format=csvfile"]
    assert h.gozlemler and all(g.donem.startswith("2026-") for g in h.gozlemler)
    with pytest.raises(KaynakUyusmazligi, match="kayıt yok"):
        OECD(getirici=lambda u: b"NoRecordsFound").cek(seri)
    with pytest.raises(KaynakUyusmazligi):
        OECD(getirici=lambda u: b).cek(seri.model_copy(update={"kod": "DF_CLI/TUR"}))
