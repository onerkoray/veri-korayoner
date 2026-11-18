"""SDMX-CSV ayrıştırıcısı: BIS (v2), OECD, ECB ve Eurostat aynı biçimin
lehçelerini döndürür. Fark yalnız sütun adlarında:

- ülke: REF_AREA / BORROWERS_CTY (BIS, OECD), geo (Eurostat), CURRENCY (ECB kuru)
- sıklık: FREQ ya da freq
- gözlem durumu: OBS_STATUS ya da OBS_FLAG (Eurostat)
- gizlilik: OBS_CONF varsa yalnız "F" (free); CONF_STATUS varsa boş olmalı.
  İkisi de yoksa gözlem düzeyinde gizlilik bilgisi verilmiyor demektir ve
  veri setinin lisansı geçerlidir.

Doğrulama: her satırın ülke boyutu beklenen kodda, sıklığı kayıttaki sıklıkta
olmalı. Uyuşmazlıkta seri yazılmaz.
"""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from ..modeller import Gozlem, SeriTanimi

SIKLIK = {"A": "yillik", "S": "yariyillik", "Q": "ceyreklik", "M": "aylik", "D": "gunluk", "W": "haftalik"}
ULKE_SUTUNU = ("REF_AREA", "BORROWERS_CTY", "geo")


class KaynakUyusmazligi(ValueError):
    pass


@dataclass
class HamSeri:
    kaynak_adi: str | None
    kaynak_not: str | None
    kaynak_guncelleme: date | None
    gozlemler: list[Gozlem] = field(default_factory=list)
    elenen: int = 0    # serbest olmadığı için yayımlanmayan gözlem sayısı


def _eurostat_tarihi(s: str) -> date | None:
    """Eurostat 'LAST UPDATE' sütunu: '04/11/26 11:00:00' (gg/aa/yy)."""
    try:
        return datetime.strptime(s.strip(), "%d/%m/%y %H:%M:%S").date()
    except ValueError:
        return None


def ayristir(b: bytes, seri: SeriTanimi, ulke: str, varsayilan_ad: str | None = None,
             ulke_sutunu: tuple[str, ...] = ULKE_SUTUNU) -> HamSeri:
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
    guncel: date | None = None
    for r in satirlar:
        sutun = next((c for c in ulke_sutunu if c in r), None)
        if sutun is None or r[sutun] != ulke:
            raise KaynakUyusmazligi(f"{seri.kod}: satır ülkesi {r.get(sutun or '')!r}, beklenen {ulke}")
        frekans = r.get("FREQ") or r.get("freq") or ""
        if SIKLIK.get(frekans) != seri.siklik:
            raise KaynakUyusmazligi(f"{seri.kod}: sıklık {frekans!r}, kayıtta {seri.siklik}")
        ad = ad or (r.get("TITLE_TS") or r.get("TITLE") or "").strip() or None
        not_ = not_ or (r.get("SOURCE_REF") or "").strip() or None
        if r.get("LAST UPDATE"):
            t = _eurostat_tarihi(r["LAST UPDATE"])
            guncel = max(guncel, t) if (guncel and t) else (t or guncel)
        if (r.get("OBS_CONF") or "F") != "F" or (r.get("CONF_STATUS") or "").strip():
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
        durum = (r.get("OBS_STATUS") or r.get("OBS_FLAG") or "").strip() or None
        gozlem.append(Gozlem(donem=r["TIME_PERIOD"], deger=deger, durum=durum))
    gozlem.sort(key=lambda g: g.donem)
    while gozlem and gozlem[-1].deger is None:
        gozlem.pop()
    return HamSeri(kaynak_adi=ad or varsayilan_ad, kaynak_not=not_, kaynak_guncelleme=guncel,
                   gozlemler=gozlem, elenen=elenen)
