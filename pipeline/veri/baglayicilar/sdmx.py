"""SDMX-CSV ayrıştırıcısı: BIS (v2) ve OECD aynı biçimi döndürür.

Doğrulama: her satırın ülke boyutu beklenen kodda, FREQ seri sıklığında
olmalı. OBS_CONF sütunu varsa yalnız "F" (free) gözlem yayımlanır; yoksa
gözlem düzeyinde gizlilik bilgisi verilmiyor demektir ve veri setinin
lisansı geçerlidir.
"""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal, InvalidOperation

from ..modeller import Gozlem, SeriTanimi

SIKLIK = {"A": "yillik", "Q": "ceyreklik", "M": "aylik", "D": "gunluk"}
ULKE_SUTUNU = ("REF_AREA", "BORROWERS_CTY")


class KaynakUyusmazligi(ValueError):
    pass


@dataclass
class HamSeri:
    kaynak_adi: str | None
    kaynak_not: str | None
    kaynak_guncelleme: date | None
    gozlemler: list[Gozlem] = field(default_factory=list)
    elenen: int = 0    # serbest olmadığı için yayımlanmayan gözlem sayısı


def ayristir(b: bytes, seri: SeriTanimi, ulke: str, varsayilan_ad: str | None = None) -> HamSeri:
    metin = b.decode("utf-8-sig")
    if metin.lstrip().startswith("<"):
        raise KaynakUyusmazligi(f"{seri.kod}: CSV yerine XML/HTML döndü (hata iletisi): {metin[:200]}")
    if metin.strip() == "NoRecordsFound":
        raise KaynakUyusmazligi(f"{seri.kod}: kaynakta kayıt yok")
    satirlar = list(csv.DictReader(io.StringIO(metin)))
    if not satirlar:
        raise KaynakUyusmazligi(f"{seri.kod}: boş yanıt")
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
    return HamSeri(kaynak_adi=ad or varsayilan_ad, kaynak_not=not_, kaynak_guncelleme=None, gozlemler=gozlem, elenen=elenen)
