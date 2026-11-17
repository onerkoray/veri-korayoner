"""Kayıt okuyucu: registry/*.yaml → doğrulanmış modeller."""

from __future__ import annotations

from pathlib import Path

import yaml

from .modeller import Kaynak, SeriTanimi

KOK = Path(__file__).resolve().parents[2]


def kaynaklar(kok: Path = KOK) -> dict[str, Kaynak]:
    v = yaml.safe_load((kok / "registry" / "kaynaklar.yaml").read_text(encoding="utf-8"))
    sonuc: dict[str, Kaynak] = {}
    for k in v["kaynaklar"]:
        m = Kaynak.model_validate(k)
        if m.id in sonuc:
            raise ValueError(f"kaynak iki kez: {m.id}")
        sonuc[m.id] = m
    return sonuc


def seriler(kok: Path = KOK) -> list[SeriTanimi]:
    v = yaml.safe_load((kok / "registry" / "seriler.yaml").read_text(encoding="utf-8"))
    ks = kaynaklar(kok)
    liste = [SeriTanimi.model_validate(s) for s in v["seriler"]]
    gorulen: set[str] = set()
    for s in liste:
        if s.id in gorulen:
            raise ValueError(f"seri iki kez: {s.id}")
        gorulen.add(s.id)
        if s.kaynak not in ks:
            raise ValueError(f"{s.id}: kayıtta olmayan kaynak {s.kaynak}")
    return liste
