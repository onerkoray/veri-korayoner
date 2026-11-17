"""Eurostat, SDMX 2.1 REST (SDMX-CSV).

Uç nokta: https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/data/{veri seti}/{anahtar}?format=SDMX-CSV
Kullanım şartı: https://ec.europa.eu/eurostat/help/copyright-notice — CC BY 4.0
(Karar 2011/833/AB); ticari kullanım serbest, kaynak gösterilir, değişiklik
belirtilir. İstisna: AB/EFTA/aday ülke dışındaki ülkelerin verisi ticari
kullanılamaz. Türkiye aday ülkedir; emsal kümesi yalnız AB üyelerinden seçilir.

Kayıttaki `kod` = "{veri seti}/{anahtar}", ör. "une_rt_m/M.SA.TOTAL.PC_ACT.T.TR".
Ülke boyutu (geo) alfa-2'dir; AB toplamı EU27_2020.
"""

from __future__ import annotations

from ..ag import getir
from ..modeller import SeriTanimi
from ..ulkeler import EUROSTAT, anahtar_ulke
from .sdmx import HamSeri, KaynakUyusmazligi, ayristir

TABAN = "https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/data"
# Şartın istisnası: yalnız bu kümedeki ülkeler ticari yeniden kullanıma açık.
SART_KAPSAMI = frozenset({"TUR", "POL", "HUN", "ROU", "EUU"})


class Eurostat:
    kaynak_id = "eurostat"

    def __init__(self, getirici=getir):
        self._getir = getirici

    def cek(self, seri: SeriTanimi) -> HamSeri:
        if seri.kod.count("/") != 1:
            raise KaynakUyusmazligi(f"Eurostat kodu 'veri seti/anahtar' olmalı: {seri.kod}")
        if seri.ulke not in SART_KAPSAMI:
            raise KaynakUyusmazligi(f"{seri.ulke}: Eurostat şartı bu ülkenin verisinin ticari kullanımını kapsamıyor")
        veri_seti, anahtar = seri.kod.split("/")
        geo = EUROSTAT[seri.ulke]
        if seri.ulke != "TUR":
            anahtar = anahtar_ulke(anahtar, "TR", geo)
        b = self._getir(f"{TABAN}/{veri_seti}/{anahtar}?format=SDMX-CSV")
        return ayristir(b, seri, geo, varsayilan_ad=veri_seti)
