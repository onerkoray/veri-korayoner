"""Yayın sonrası denetim: canlı sitedeki API dosyaları depodaki yayin/ ile aynı mı.

Vercel bir commit'i sessizce kaçırabilir ya da eski derlemeyi sunmaya devam edebilir;
CI yeşilken canlı veri eski kalır. Bu modül canlı kataloğu, durum dosyasını ve
Parquet özetini depodakiyle karşılaştırır, katalogdaki her seri dosyasının
erişilebilir olduğunu yoklar. Yalnız sitenin kendi alan adına istek atar.
"""

from __future__ import annotations

import json
import time
from pathlib import Path
from urllib.parse import urlsplit

import httpx

from .ag import KULLANICI

IZINLI = frozenset({"veri.korayoner.dev"})
KARSILASTIR = ("api/v1/seriler.json", "api/v1/kaynaklar.json", "api/v1/durum.json", "api/v1/gozlemler.parquet.sha256")


def _icerik(yol: str, ham: bytes):
    return json.loads(ham) if yol.endswith(".json") else ham.decode("utf-8").strip()


def bir_tur(taban: str, yayin: Path, ist: httpx.Client) -> list[str]:
    sorun: list[str] = []
    for yol in KARSILASTIR:
        yerel = yayin / yol
        if not yerel.exists():
            continue
        y = ist.get(f"{taban}/{yol}")
        if y.status_code != 200:
            sorun.append(f"{yol}: HTTP {y.status_code}")
        elif _icerik(yol, y.content) != _icerik(yol, yerel.read_bytes()):
            sorun.append(f"{yol}: canlı sürüm depodakinden farklı")
    katalog = json.loads((yayin / "api/v1/seriler.json").read_text(encoding="utf-8"))
    for s in katalog["seriler"]:
        for adres in filter(None, (s["api"], s.get("csv"))):
            y = ist.head(f"{taban}{adres}")
            if y.status_code != 200:
                sorun.append(f"{adres}: HTTP {y.status_code}")
    return sorun


def denetle(taban: str, yayin: Path, *, deneme: int = 6, bekle: float = 20.0,
            istemci: httpx.Client | None = None, uyu=time.sleep) -> list[str]:
    """Önbellek yayılması için birkaç tur dener; son turun sorunlarını döndürür."""
    if urlsplit(taban).scheme != "https" or urlsplit(taban).hostname not in IZINLI:
        raise ValueError(f"izinsiz adres: {taban}")
    taban = taban.rstrip("/")
    ist = istemci or httpx.Client(timeout=20.0, follow_redirects=False, headers={"User-Agent": KULLANICI})
    try:
        sorun: list[str] = []
        for i in range(deneme):
            try:
                sorun = bir_tur(taban, yayin, ist)
            except httpx.HTTPError as e:
                sorun = [f"ağ hatası: {type(e).__name__}"]
            if not sorun:
                return []
            if i < deneme - 1:
                uyu(bekle)
        return sorun
    finally:
        if istemci is None:
            ist.close()
