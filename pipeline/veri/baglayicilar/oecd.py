"""OECD Data Explorer, SDMX REST (CSV).

Uç nokta: https://sdmx.oecd.org/public/rest/data/{ajans},{akış},{sürüm}/{anahtar}?format=csvfile
Kayıttaki `kod` = "{ajans},{akış},{sürüm}/{anahtar}", ör.
"OECD.SDD.STES,DSD_STES@DF_CLI,/TUR.M.LI...AA...H" (boş sürüm = son sürüm).
OECD ülke boyutu ISO 3166 alfa-3'tür. OECD API'sinin saatlik istek sınırı
düşüktür: emsal ülkeler tek istekte ("TUR+BRA+…" yerine "BRA+MEX+…") çekilir,
yanıt ülkelere bölünür ve her parça aynı ayrıştırıcıdan (ülke ve sıklık denetimiyle) geçer.
"""

from __future__ import annotations

import csv
import io

from ..ag import getir
from ..modeller import Gozlem, SeriTanimi
from ..ulkeler import anahtar_ulke
from .sdmx import HamSeri, KaynakUyusmazligi, ayristir

TABAN = "https://sdmx.oecd.org/public/rest/data"


def _parcala(kod: str) -> tuple[str, str]:
    if kod.count("/") != 1 or kod.split("/")[0].count(",") != 2:
        raise KaynakUyusmazligi(f"OECD kodu 'ajans,akış,sürüm/anahtar' olmalı: {kod}")
    akis, anahtar = kod.split("/")
    return akis, anahtar


class OECD:
    kaynak_id = "oecd"

    def __init__(self, getirici=getir):
        self._getir = getirici

    def cek(self, seri: SeriTanimi) -> HamSeri:
        akis, anahtar = _parcala(seri.kod)
        if seri.ulke != "TUR":
            anahtar = anahtar_ulke(anahtar, "TUR", seri.ulke)
        return ayristir(self._getir(f"{TABAN}/{akis}/{anahtar}?format=csvfile"), seri, seri.ulke)

    def cek_coklu(self, seri: SeriTanimi, ulkeler: list[str]) -> dict[str, list[Gozlem]]:
        """Emsal ülkeler tek istekte; verisi olmayan ülke sonuçta yer almaz (hata değil)."""
        akis, anahtar = _parcala(seri.kod)
        url = f"{TABAN}/{akis}/{anahtar_ulke(anahtar, 'TUR', '+'.join(ulkeler))}?format=csvfile"
        metin = self._getir(url).decode("utf-8-sig")
        okuyucu = csv.DictReader(io.StringIO(metin))
        if not okuyucu.fieldnames or "REF_AREA" not in okuyucu.fieldnames:
            raise KaynakUyusmazligi(f"{seri.kod}: emsal yanıtında REF_AREA yok")
        gruplar: dict[str, list[dict]] = {}
        for r in okuyucu:
            gruplar.setdefault(r["REF_AREA"], []).append(r)
        sonuc: dict[str, list[Gozlem]] = {}
        for u in ulkeler:
            if u not in gruplar:
                continue
            tampon = io.StringIO()
            w = csv.DictWriter(tampon, fieldnames=okuyucu.fieldnames)
            w.writeheader()
            w.writerows(gruplar[u])
            try:
                sonuc[u] = ayristir(tampon.getvalue().encode("utf-8"), seri.model_copy(update={"ulke": u}), u).gozlemler
            except KaynakUyusmazligi:       # o ülkenin değeri yok ya da gizli: yalnız o ülke düşer
                continue
        return sonuc
