"""ILOSTAT, SDMX REST (SDMX-CSV).

Uç nokta: https://sdmx.ilo.org/rest/data/ILO,{akış}/{anahtar}?format=csvfile
Kullanım şartı: https://www.ilo.org/node/9321 — 3 Mayıs 2023'ten beri ILO veri
tabanları ve veri setleri referans metaverisiyle birlikte CC BY 4.0. Kapsam
dışı: ILO'ya yalnız kendi kullanımı için verilmiş mikro veri (burada yok;
yayımlanan göstergeler toplulaştırılmış istatistiktir).

Kayıttaki `kod` = "{akış}/{anahtar}", ör.
"DF_UNE_DEAP_SEX_AGE_RT/TUR.A..SEX_T.AGE_YTHADULT_YGE15". Ülke boyutu alfa-3;
emsalde TUR parçası değiştirilir. Çok ülkeli (+) istek ILO'da reddedilir, ülke
başına istek atılır. Aynı yıl için iki kaynak satırı gelirse seri yazılmaz.
"""

from __future__ import annotations

from ..ag import getir
from ..modeller import SeriTanimi
from ..ulkeler import anahtar_ulke
from .sdmx import HamSeri, KaynakUyusmazligi, ayristir

TABAN = "https://sdmx.ilo.org/rest/data/ILO"


class ILO:
    kaynak_id = "ilo"

    def __init__(self, getirici=getir):
        self._getir = getirici

    def cek(self, seri: SeriTanimi) -> HamSeri:
        if seri.kod.count("/") != 1:
            raise KaynakUyusmazligi(f"ILO kodu 'akış/anahtar' olmalı: {seri.kod}")
        akis, anahtar = seri.kod.split("/")
        if seri.ulke != "TUR":
            anahtar = anahtar_ulke(anahtar, "TUR", seri.ulke)
        url = f"{TABAN},{akis}/{anahtar}?format=csvfile" + (f"&startPeriod={seri.baslangic}" if seri.baslangic else "")
        h = ayristir(self._getir(url), seri, seri.ulke, varsayilan_ad=akis)
        donemler = [g.donem for g in h.gozlemler]
        if len(set(donemler)) != len(donemler):
            raise KaynakUyusmazligi(f"{seri.kod}: aynı dönem için birden fazla kaynak satırı")
        return h
