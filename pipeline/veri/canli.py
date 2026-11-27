"""Yayın sonrası denetim: canlı sitedeki API dosyaları depodaki yayin/ ile aynı mı.

Vercel bir commit'i sessizce kaçırabilir ya da eski derlemeyi sunmaya devam edebilir;
CI yeşilken canlı veri eski kalır. Bu modül canlı kataloğu, durum dosyasını ve
Parquet özetini depodakiyle karşılaştırır, katalogdaki her seri dosyasının
erişilebilir olduğunu yoklar. Yalnız sitenin kendi alan adına istek atar.
"""

from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path
from urllib.parse import urlsplit

import httpx

from .ag import KULLANICI

IZINLI = frozenset({"veri.korayoner.dev"})
KARSILASTIR = ("api/v1/manifest.json", "api/v1/seriler.json", "api/v1/kaynaklar.json", "api/v1/durum.json",
               "api/v1/gozlemler.parquet.sha256")
ORNEK = 12
SAYFALAR = ("/", "/gezgin", "/karsilastir", "/kaynaklar", "/api", "/yontem", "/hesap/reel-politika-faizi")


def ornekle(dosyalar: list[dict], n: int = ORNEK) -> list[dict]:
    """Deterministik örneklem: her dosya türünden (seri json/csv, emsal, panel) en az biri,
    kalanlar yola göre sıralı listeden eşit aralıkla. Rastgele değil: aynı sürüm aynı dosyaları sınar."""
    secim: dict[str, dict] = {}
    for tur in ("seri/*.json", "seri/*.csv", "emsal/", "panel/*.json", "panel/*.csv", "gozlemler.parquet", "sema/"):
        if len(secim) >= n:
            break
        bas, _, son = tur.partition("*")
        f = next((x for x in dosyalar if x["path"].startswith(bas) and x["path"].endswith(son)), None)
        if f:
            secim[f["path"]] = f
    kalan = [x for x in dosyalar if x["path"] not in secim]
    adim = max(1, len(kalan) // max(1, n - len(secim)))
    for x in kalan[::adim]:
        if len(secim) >= n:
            break
        secim[x["path"]] = x
    return list(secim.values())


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
        else:
            try:
                if _icerik(yol, y.content) != _icerik(yol, yerel.read_bytes()):
                    sorun.append(f"{yol}: canlı sürüm depodakinden farklı")
            except ValueError:
                sorun.append(f"{yol}: geçersiz yanıt gövdesi")
    manifest = yayin / "api/v1/manifest.json"
    if manifest.exists():
        m = json.loads(manifest.read_bytes())
        for sayfa in SAYFALAR:
            html = ist.get(taban + sayfa)
            if html.status_code != 200 or f'name="veri-release" content="{m["release_id"]}"' not in html.text:
                sorun.append(f"{sayfa}: HTML yayın kimliği farklı")
        for dosya in ornekle(m["files"]):
            y = ist.get(f"{taban}/api/v1/{dosya['path']}")
            if (y.status_code != 200 or len(y.content) != dosya["bytes"]
                    or hashlib.sha256(y.content).hexdigest() != dosya["sha256"]):
                sorun.append(f"{dosya['path']}: içerik özeti farklı")
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
