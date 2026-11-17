"""Dünya Bankası Indicators API v2.

Belge: https://datahelpdesk.worldbank.org/knowledgebase/articles/889392
İki istek: gösterge metaverisi (/indicator/{kod}) ve Türkiye gözlemleri
(/country/{iso3}/indicator/{kod}). Yanıt [sayfa_bilgisi, kayıtlar] dizisidir.

Doğrulama: metaverideki gösterge kodu ve gözlemlerdeki ülke kodu kayıttakiyle
aynı olmalı; değilse seri yazılmaz. Değer metinden Decimal'e kayıpsız alınır
(json `parse_float=Decimal`). Boş değer `None` kalır.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from ..ag import getir
from ..modeller import Gozlem, SeriTanimi

TABAN = "https://api.worldbank.org/v2"
SAYFA = 1000


class KaynakUyusmazligi(ValueError):
    pass


@dataclass
class HamSeri:
    kaynak_adi: str | None
    kaynak_not: str | None
    kaynak_guncelleme: date | None
    gozlemler: list[Gozlem] = field(default_factory=list)


def _json(b: bytes):
    return json.loads(b, parse_float=Decimal)


def ayristir_metaveri(b: bytes, kod: str) -> tuple[str | None, str | None]:
    v = _json(b)
    if not isinstance(v, list) or len(v) < 2 or not v[1]:
        raise KaynakUyusmazligi(f"{kod}: metaveri boş ya da biçimsiz ({str(v)[:200]})")
    m = v[1][0]
    if m.get("id") != kod:
        raise KaynakUyusmazligi(f"metaveri kodu {m.get('id')!r}, beklenen {kod!r}")
    return m.get("name"), (m.get("sourceOrganization") or None)


def ayristir_gozlem(b: bytes, kod: str, iso3: str) -> tuple[list[Gozlem], date | None, int]:
    v = _json(b)
    if not isinstance(v, list) or not v or not isinstance(v[0], dict):
        raise KaynakUyusmazligi(f"{kod}: gözlem yanıtı biçimsiz ({str(v)[:200]})")
    bilgi = v[0]
    if "message" in bilgi:
        raise KaynakUyusmazligi(f"{kod}: kaynak hata döndü: {bilgi['message']}")
    kayitlar = v[1] if len(v) > 1 and v[1] else []
    gozlem: list[Gozlem] = []
    for k in kayitlar:
        if (k.get("indicator") or {}).get("id") != kod:
            raise KaynakUyusmazligi(f"gözlem göstergesi {k.get('indicator')}, beklenen {kod}")
        if k.get("countryiso3code") != iso3:
            raise KaynakUyusmazligi(f"gözlem ülkesi {k.get('countryiso3code')}, beklenen {iso3}")
        deger = k.get("value")
        if deger is not None and not isinstance(deger, Decimal):
            deger = Decimal(str(deger))
        gozlem.append(Gozlem(donem=str(k["date"]), deger=deger, durum=k.get("obs_status") or None))
    gozlem.sort(key=lambda g: g.donem)
    guncelleme = None
    if bilgi.get("lastupdated"):
        guncelleme = date.fromisoformat(str(bilgi["lastupdated"])[:10])
    return gozlem, guncelleme, int(bilgi.get("pages", 1))


class DunyaBankasi:
    kaynak_id = "world_bank"

    def __init__(self, getirici=getir):
        self._getir = getirici
        self._metaveri: dict[str, tuple[str | None, str | None]] = {}   # emsal ülkelerde tekrar çekilmez

    def cek(self, seri: SeriTanimi) -> HamSeri:
        if seri.siklik != "yillik":
            raise KaynakUyusmazligi("WDI bağlayıcısı bu sürümde yalnız yıllık seri alır")
        if seri.kod not in self._metaveri:
            self._metaveri[seri.kod] = ayristir_metaveri(
                self._getir(f"{TABAN}/indicator/{seri.kod}?format=json"), seri.kod)
        ad, kaynak = self._metaveri[seri.kod]
        gozlem, guncelleme, sayfa = ayristir_gozlem(
            self._getir(f"{TABAN}/country/{seri.ulke}/indicator/{seri.kod}?format=json&per_page={SAYFA}"),
            seri.kod, seri.ulke)
        if sayfa > 1:
            raise KaynakUyusmazligi(f"{seri.kod}: {sayfa} sayfa; sayfalama bu sürümde beklenmiyor")
        # Sondaki boş yıllar (henüz yayımlanmamış) atılır; aradaki boşluk None kalır.
        while gozlem and gozlem[-1].deger is None:
            gozlem.pop()
        return HamSeri(kaynak_adi=ad, kaynak_not=kaynak, kaynak_guncelleme=guncelleme, gozlemler=gozlem)

    def cek_coklu(self, seri: SeriTanimi, ulkeler: list[str]) -> dict[str, list[Gozlem]]:
        """Emsal ülkeler tek istekte: Dünya Bankası yavaşken ülke başına istek saatler sürer."""
        b = self._getir(f"{TABAN}/country/{';'.join(ulkeler)}/indicator/{seri.kod}?format=json&per_page={SAYFA * 20}")
        return ayristir_coklu(b, seri.kod, ulkeler)


def ayristir_coklu(b: bytes, kod: str, ulkeler: list[str]) -> dict[str, list[Gozlem]]:
    """Çok ülkeli yanıt (/country/A;B;C/indicator/kod): ülke ülke gruplanır.

    Her satırın göstergesi kayıttaki kod, ülkesi istenen kümede olmalı; sondaki boş yıllar atılır.
    """
    v = _json(b)
    if not isinstance(v, list) or not v or not isinstance(v[0], dict):
        raise KaynakUyusmazligi(f"{kod}: gözlem yanıtı biçimsiz ({str(v)[:200]})")
    if "message" in v[0]:
        raise KaynakUyusmazligi(f"{kod}: kaynak hata döndü: {v[0]['message']}")
    if int(v[0].get("pages", 1)) > 1:
        raise KaynakUyusmazligi(f"{kod}: çok ülkeli yanıt birden fazla sayfa")
    istenen = set(ulkeler)
    sonuc: dict[str, list[Gozlem]] = {}
    for k in (v[1] if len(v) > 1 and v[1] else []):
        if (k.get("indicator") or {}).get("id") != kod:
            raise KaynakUyusmazligi(f"gözlem göstergesi {k.get('indicator')}, beklenen {kod}")
        u = k.get("countryiso3code")
        if u not in istenen:
            raise KaynakUyusmazligi(f"istenmeyen ülke {u!r}")
        deger = k.get("value")
        if deger is not None and not isinstance(deger, Decimal):
            deger = Decimal(str(deger))
        sonuc.setdefault(u, []).append(Gozlem(donem=str(k["date"]), deger=deger, durum=k.get("obs_status") or None))
    for g in sonuc.values():
        g.sort(key=lambda x: x.donem)
        while g and g[-1].deger is None:
            g.pop()
    return {u: g for u, g in sonuc.items() if g}
