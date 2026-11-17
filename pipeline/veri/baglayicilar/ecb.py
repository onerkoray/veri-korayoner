"""ECB Data Portal, SDMX REST (CSV).

Uç nokta: https://data-api.ecb.europa.eu/service/data/{akış}/{anahtar}?format=csvdata
Kullanım şartı: https://www.ecb.europa.eu/stats/ecb_statistics/governance_and_quality_framework/html/usage_policy.en.html
— ücretsiz yeniden kullanım, ticari dahil; kaynak "ECB statistics" gösterilir,
istatistik ve metaverisi değiştirilmez; üçüncü taraf verisi kapsam dışıdır
(referans kurları ECB'nin kendi hesabıdır).

Kayıttaki `kod` = "{akış}/{anahtar}", ör. "EXR/D.TRY.EUR.SP00.A".
Kur serisinde ülke boyutu yoktur; doğrulama para birimi sütunuyla yapılır
(Türkiye → TRY). Kayıttaki `baslangic` varsa `startPeriod` olarak gönderilir.
"""

from __future__ import annotations

from ..ag import getir
from ..modeller import SeriTanimi
from .sdmx import HamSeri, KaynakUyusmazligi, ayristir

TABAN = "https://data-api.ecb.europa.eu/service/data"
PARA = {"TUR": "TRY"}


class ECB:
    kaynak_id = "ecb"

    def __init__(self, getirici=getir):
        self._getir = getirici

    def cek(self, seri: SeriTanimi) -> HamSeri:
        kod, bas = seri.kod, seri.baslangic
        if kod.count("/") != 1:
            raise KaynakUyusmazligi(f"ECB kodu 'akış/anahtar' olmalı: {seri.kod}")
        if seri.ulke not in PARA:
            raise KaynakUyusmazligi(f"ECB kuru için para birimi bilinmiyor: {seri.ulke}")
        url = f"{TABAN}/{kod}?format=csvdata" + (f"&startPeriod={bas}" if bas else "")
        return ayristir(self._getir(url), seri, PARA[seri.ulke], ulke_sutunu=("CURRENCY",))
