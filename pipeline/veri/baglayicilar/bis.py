"""BIS Data Portal, SDMX REST API v2 (CSV).

Belge: https://stats.bis.org/api-doc/v2/
Kullanım şartı: https://data.bis.org/help/legal — istatistik kullanımı serbest;
BIS kaynak olarak gösterilir, çeviri resmî değildir notu, onay ima edilmez,
ek ücret alınmaz. API şartı en güncel sürümün kullanılmasını ister (v2).

Kayıttaki `kod` = "{akış}/{sürüm}/{anahtar}", ör. "WS_CBPOL/1.0/M.TR".
Anahtar Türkiye için yazılır; emsal ülkede ülke boyutu (TR) değiştirilir.
BIS ülke boyutu ISO 3166 alfa-2'dir. OBS_CONF=F olmayan gözlem yayımlanmaz.
"""

from __future__ import annotations

from ..ag import getir
from ..modeller import SeriTanimi
from ..ulkeler import ALFA2, anahtar_ulke
from .sdmx import HamSeri, KaynakUyusmazligi
from .sdmx import ayristir as _ayristir

TABAN = "https://stats.bis.org/api/v2/data/dataflow/BIS"
ISO2 = ALFA2

__all__ = ["BIS", "HamSeri", "KaynakUyusmazligi", "ayristir"]


def ayristir(b: bytes, seri: SeriTanimi) -> HamSeri:
    return _ayristir(b, seri, ISO2.get(seri.ulke, seri.ulke))


class BIS:
    kaynak_id = "bis"

    def __init__(self, getirici=getir):
        self._getir = getirici

    def cek(self, seri: SeriTanimi) -> HamSeri:
        if seri.kod.count("/") != 2:
            raise KaynakUyusmazligi(f"BIS kodu 'akış/sürüm/anahtar' olmalı: {seri.kod}")
        akis, surum, anahtar = seri.kod.split("/")
        if seri.ulke != "TUR":
            anahtar = anahtar_ulke(anahtar, "TR", ISO2[seri.ulke])
        return ayristir(self._getir(f"{TABAN}/{akis}/{surum}/{anahtar}?format=csv"), seri)
