"""BIS Data Portal, SDMX REST API v2 (CSV).

Belge: https://stats.bis.org/api-doc/v2/
Kullanım şartı: https://data.bis.org/help/legal — istatistik kullanımı serbest;
BIS kaynak olarak gösterilir, çeviri resmî değildir notu, onay ima edilmez,
ek ücret alınmaz. API şartı en güncel sürümün kullanılmasını ister (v2).

Kayıttaki `kod` = "{akış}/{sürüm}/{anahtar}", ör. "WS_CBPOL/1.0/M.TR".

Doğrulama: her satırın ülke boyutu (REF_AREA ya da BORROWERS_CTY) "TR", FREQ
seri sıklığıyla aynı olmalı. Gözlem düzeyinde lisans: OBS_CONF "F" (free)
olmayan gözlem yayımlanmaz.
"""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal, InvalidOperation

from ..ag import getir
from ..modeller import Gozlem, SeriTanimi

TABAN = "https://stats.bis.org/api/v2/data/dataflow/BIS"
SIKLIK = {"A": "yillik", "Q": "ceyreklik", "M": "aylik", "D": "gunluk"}
ULKE_SUTUNU = ("REF_AREA", "BORROWERS_CTY")
ISO2 = {"TUR": "TR"}


class KaynakUyusmazligi(ValueError):
    pass


@dataclass
class HamSeri:
    kaynak_adi: str | None
    kaynak_not: str | None
    kaynak_guncelleme: date | None
    gozlemler: list[Gozlem] = field(default_factory=list)
    elenen: int = 0    # serbest olmadığı için yayımlanmayan gözlem sayısı


def ayristir(b: bytes, seri: SeriTanimi) -> HamSeri:
    metin = b.decode("utf-8-sig")
    if metin.lstrip().startswith("<"):
        raise KaynakUyusmazligi(f"{seri.kod}: CSV yerine XML/HTML döndü (hata iletisi): {metin[:200]}")
    satirlar = list(csv.DictReader(io.StringIO(metin)))
    if not satirlar:
        raise KaynakUyusmazligi(f"{seri.kod}: boş yanıt")
    ulke = ISO2.get(seri.ulke, seri.ulke)
    gozlem: list[Gozlem] = []
    elenen = 0
    ad = not_ = None
    for r in satirlar:
        sutun = next((c for c in ULKE_SUTUNU if c in r), None)
        if sutun is None or r[sutun] != ulke:
            raise KaynakUyusmazligi(f"{seri.kod}: satır ülkesi {r.get(sutun or '')!r}, beklenen {ulke}")
        if SIKLIK.get(r.get("FREQ", "")) != seri.siklik:
            raise KaynakUyusmazligi(f"{seri.kod}: sıklık {r.get('FREQ')!r}, kayıtta {seri.siklik}")
        ad = ad or (r.get("TITLE_TS") or r.get("TITLE") or "").strip() or None
        not_ = not_ or (r.get("SOURCE_REF") or "").strip() or None
        if (r.get("OBS_CONF") or "F") != "F":
            elenen += 1
            continue
        ham = (r.get("OBS_VALUE") or "").strip()
        if ham in ("", "NaN"):
            deger = None
        else:
            try:
                deger = Decimal(ham)
            except InvalidOperation as e:
                raise KaynakUyusmazligi(f"{seri.kod}: sayı değil: {ham!r}") from e
        gozlem.append(Gozlem(donem=r["TIME_PERIOD"], deger=deger, durum=(r.get("OBS_STATUS") or None)))
    gozlem.sort(key=lambda g: g.donem)
    while gozlem and gozlem[-1].deger is None:
        gozlem.pop()
    return HamSeri(kaynak_adi=ad, kaynak_not=not_, kaynak_guncelleme=None, gozlemler=gozlem, elenen=elenen)


class BIS:
    kaynak_id = "bis"

    def __init__(self, getirici=getir):
        self._getir = getirici

    def cek(self, seri: SeriTanimi) -> HamSeri:
        if seri.kod.count("/") != 2:
            raise KaynakUyusmazligi(f"BIS kodu 'akış/sürüm/anahtar' olmalı: {seri.kod}")
        return ayristir(self._getir(f"{TABAN}/{seri.kod}?format=csv"), seri)
