"""Kaynak bağlayıcıları. Her biri `Baglayici` sözleşmesini uygular."""

from __future__ import annotations

from typing import Protocol

from ..ag import getir
from ..modeller import Gozlem, SeriTanimi


class Ham(Protocol):
    """Bağlayıcının döndürdüğü ayrıştırılmış seri."""

    kaynak_adi: str | None
    kaynak_not: str | None
    kaynak_guncelleme: object
    gozlemler: list[Gozlem]


class Baglayici(Protocol):
    kaynak_id: str

    def cek(self, seri: SeriTanimi) -> Ham: ...


def baglayici(kaynak_id: str, getirici=getir) -> Baglayici:
    if kaynak_id == "world_bank":
        from .world_bank import DunyaBankasi
        return DunyaBankasi(getirici)
    if kaynak_id == "bis":
        from .bis import BIS
        return BIS(getirici)
    if kaynak_id == "oecd":
        from .oecd import OECD
        return OECD(getirici)
    if kaynak_id == "ecb":
        from .ecb import ECB
        return ECB(getirici)
    if kaynak_id == "ilo":
        from .ilo import ILO
        return ILO(getirici)
    if kaynak_id == "eurostat":
        from .eurostat import Eurostat
        return Eurostat(getirici)
    raise KeyError(f"bağlayıcı yok: {kaynak_id}")
