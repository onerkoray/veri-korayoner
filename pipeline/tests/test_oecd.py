"""OECD: emsal ülkeler tek istekte, yanıt ülkelere bölünür; ülke ve sıklık denetimi korunur."""

from __future__ import annotations

import pytest

from veri.baglayicilar.oecd import OECD
from veri.baglayicilar.sdmx import KaynakUyusmazligi
from veri.modeller import SeriTanimi

KOD = "OECD.SDD.STES,DSD_STES@DF_CLI,/TUR.M.BCICP.IX._Z.AA.IX._Z.H"
CSV = (
    "STRUCTURE,STRUCTURE_ID,ACTION,REF_AREA,FREQ,MEASURE,TIME_PERIOD,OBS_VALUE\n"
    "DATAFLOW,X,I,BRA,M,BCICP,2026-09,99.1\n"
    "DATAFLOW,X,I,BRA,M,BCICP,2026-10,99.4\n"
    "DATAFLOW,X,I,POL,M,BCICP,2026-10,100.2\n"
)


def _seri():
    return SeriTanimi(id="t-oecd", kaynak="oecd", kod=KOD, ulke="TUR", baslik="T", tema="t", siklik="aylik", birim="endeks")


def test_emsal_tek_istek_ve_bolme():
    istenen = []
    b = OECD(getirici=lambda u: istenen.append(u) or CSV.encode())
    sonuc = b.cek_coklu(_seri(), ["BRA", "POL", "MEX"])
    assert len(istenen) == 1 and "/BRA+POL+MEX.M.BCICP." in istenen[0]
    assert [g.donem for g in sonuc["BRA"]] == ["2026-09", "2026-10"]
    assert str(sonuc["POL"][0].deger) == "100.2"
    assert "MEX" not in sonuc                                     # verisi yok: hata değil, yok


def test_tek_ulke_anahtari_ve_ulke_denetimi():
    istenen = []
    b = OECD(getirici=lambda u: istenen.append(u) or CSV.encode())
    with pytest.raises(KaynakUyusmazligi):                          # BRA istendi, POL satırı da geldi
        b.cek(_seri().model_copy(update={"ulke": "BRA"}))
    assert "/BRA.M.BCICP." in istenen[0]


def test_gizlilik_bayragi_F_serbest_C_elenir_bos_seri_reddedilir():
    from veri.baglayicilar.sdmx import ayristir
    bas = "REF_AREA,FREQ,TIME_PERIOD,OBS_VALUE,CONF_STATUS\n"
    s = _seri()
    h = ayristir((bas + "TUR,M,2026-09,1.5,F\nTUR,M,2026-10,2.5,C\n").encode(), s, "TUR")
    assert [g.donem for g in h.gozlemler] == ["2026-09"] and h.elenen == 1
    with pytest.raises(KaynakUyusmazligi, match="değeri olan gözlem yok"):
        ayristir((bas + "TUR,M,2026-10,2.5,C\n").encode(), s, "TUR")
