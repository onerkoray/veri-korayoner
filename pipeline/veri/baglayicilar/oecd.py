"""OECD Data Explorer, SDMX REST (CSV).

Uç nokta: https://sdmx.oecd.org/public/rest/data/{ajans},{akış},{sürüm}/{anahtar}?format=csvfile
Kayıttaki `kod` = "{ajans},{akış},{sürüm}/{anahtar}", ör.
"OECD.SDD.STES,DSD_STES@DF_CLI,/TUR.M.LI...AA...H" (boş sürüm = son sürüm).
OECD ülke boyutu ISO 3166 alfa-3'tür. OECD API'sinin saatlik istek sınırı
düşüktür; seri sayısı az tutulur ve ağ katmanı Retry-After'a uyar.
"""

from __future__ import annotations

from ..ag import getir
from ..modeller import SeriTanimi
from .sdmx import HamSeri, KaynakUyusmazligi, ayristir

TABAN = "https://sdmx.oecd.org/public/rest/data"


class OECD:
    kaynak_id = "oecd"

    def __init__(self, getirici=getir):
        self._getir = getirici

    def cek(self, seri: SeriTanimi) -> HamSeri:
        if seri.kod.count("/") != 1 or seri.kod.split("/")[0].count(",") != 2:
            raise KaynakUyusmazligi(f"OECD kodu 'ajans,akış,sürüm/anahtar' olmalı: {seri.kod}")
        return ayristir(self._getir(f"{TABAN}/{seri.kod}?format=csvfile"), seri, seri.ulke)
