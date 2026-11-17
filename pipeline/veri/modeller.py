"""Veri modeli: kayıt (kaynak, seri) ve yayımlanan seri dosyası.

Kurallar (CLAUDE.md §2, §11):
- Değer `Decimal`'dır; kaynak metninden kayıpsız okunur, float'a çevrilmez.
- Bilinmeyen alan `None`dır, asla 0 değildir.
- Gözlemin ait olduğu dönem (`donem`), sistemin çektiği zaman (`cekildi`) ve
  kaynağın yayım/güncelleme zamanı (`kaynak_guncelleme`) ayrı alanlardır.
"""

from __future__ import annotations

import re
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

Siklik = Literal["yillik", "ceyreklik", "aylik", "haftalik", "gunluk"]
Durum = Literal["aktif", "gelistiriliyor", "planlandi", "anahtar-gerekli", "lisans-gerekli", "yalniz-katalog"]

DONEM_KALIBI: dict[str, re.Pattern[str]] = {
    "yillik": re.compile(r"^\d{4}$"),
    "ceyreklik": re.compile(r"^\d{4}-Q[1-4]$"),
    "aylik": re.compile(r"^\d{4}-(0[1-9]|1[0-2])$"),
    "haftalik": re.compile(r"^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$"),
    "gunluk": re.compile(r"^\d{4}-\d{2}-\d{2}$"),
}


class Kati(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class Izin(Kati):
    gosterim: bool = False
    indirme: bool = False
    api: bool = False

    def daralt(self, diger: Izin | None) -> Izin:
        """Seri izni kaynağınkini yalnız daraltabilir."""
        if diger is None:
            return self
        return Izin(gosterim=self.gosterim and diger.gosterim, indirme=self.indirme and diger.indirme,
                    api=self.api and diger.api)


class Lisans(Kati):
    ad: str | None = None
    kanit: str | None = None
    inceleme_tarihi: date | None = None
    atif_zorunlu: bool = True
    kosullar: list[str] = Field(default_factory=list)   # şartın okura gösterilecek maddeleri
    not_: str | None = Field(default=None, alias="not")


class Kaynak(Kati):
    id: str
    ad: str
    kurum: str
    adres: str
    api: str | None = None
    belge: str | None = None
    erisim: str
    anahtar: bool | None = None
    durum: Durum
    lisans: Lisans
    yayin: Izin

    @model_validator(mode="after")
    def izin_kanitsiz_acilmaz(self) -> Kaynak:
        acik = self.yayin.gosterim or self.yayin.indirme or self.yayin.api
        if acik and not (self.lisans.kanit and self.lisans.inceleme_tarihi and self.lisans.ad):
            raise ValueError(f"{self.id}: yayın izni açık ama lisans kanıtı/inceleme tarihi/adı eksik")
        if acik and self.durum in ("lisans-gerekli", "yalniz-katalog", "anahtar-gerekli"):
            raise ValueError(f"{self.id}: '{self.durum}' durumunda yayın izni açılamaz")
        return self


class SeriTanimi(Kati):
    id: str = Field(pattern=r"^[a-z0-9][a-z0-9-]+$")
    kaynak: str
    kod: str
    ulke: str = Field(pattern=r"^[A-Z]{3}$")
    baslik: str
    tema: str
    siklik: Siklik
    birim: str
    carpan: int = 1
    yayin: Izin | None = None
    baslangic: str | None = Field(default=None, pattern=r"^\d{4}(-\d{2}){0,2}$")   # kaynağa istenen ilk dönem
    emsal: list[str] = Field(default_factory=list)   # aynı serinin çekileceği karşılaştırma ülkeleri (alfa-3)
    not_: str | None = Field(default=None, alias="not")

    @field_validator("emsal")
    @classmethod
    def emsal_kodlari(cls, v: list[str]) -> list[str]:
        if len(set(v)) != len(v) or any(not re.fullmatch(r"[A-Z]{3}", x) or x == "TUR" for x in v):
            raise ValueError(f"emsal listesi alfa-3, tekrarsız ve Türkiye'siz olmalı: {v}")
        return v


class Gozlem(Kati):
    donem: str
    deger: Decimal | None
    durum: str | None = None   # kaynağın gözlem durumu bayrağı (ör. tahmini), varsa


class SeriDosyasi(BaseModel):
    """Yayımlanan tek seri: /api/v1/seri/{id}.json"""

    model_config = ConfigDict(extra="forbid")

    surum: Literal[1] = 1
    id: str
    baslik: str
    ulke: str
    siklik: Siklik
    birim: str
    carpan: int
    tema: str
    kaynak: dict
    kaynak_kod: str
    kaynak_adi: str | None = None          # kaynağın kendi seri adı (doğrulama için)
    kaynak_not: str | None = None          # kaynağın seri metaverisindeki kaynak notu
    kaynak_guncelleme: date | None = None  # kaynağın bildirdiği son güncelleme, bilinmiyorsa None
    cekildi: datetime
    izin: Izin
    gozlemler: list[Gozlem]

    @field_validator("cekildi")
    @classmethod
    def utc(cls, v: datetime) -> datetime:
        if v.tzinfo is None:
            raise ValueError("cekildi saat dilimi taşımalı (UTC)")
        return v.astimezone(UTC)

    @model_validator(mode="after")
    def donemler_tutarli(self) -> SeriDosyasi:
        kalip = DONEM_KALIBI[self.siklik]
        gorulen: set[str] = set()
        for g in self.gozlemler:
            if not kalip.match(g.donem):
                raise ValueError(f"{self.id}: '{g.donem}' {self.siklik} dönem biçimine uymuyor")
            if g.donem in gorulen:
                raise ValueError(f"{self.id}: '{g.donem}' iki kez")
            gorulen.add(g.donem)
        if [g.donem for g in self.gozlemler] != sorted(gorulen):
            raise ValueError(f"{self.id}: gözlemler dönem sırasında değil")
        return self
