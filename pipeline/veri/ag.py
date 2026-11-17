"""Ağ katmanı: tek yerden, güvenli varsayılanlarla HTTP.

- İzinli host listesi (SSRF önlemi): yalnız kayıttaki kaynakların hostları.
- Zaman aşımı, yanıt boyutu sınırı, üstel geri çekilme + jitter,
  `Retry-After` uyumu, 429/5xx'te yeniden deneme, 4xx'te deneme yok.
- Kimlik bilgisi yok: bu sürümdeki kaynakların hiçbiri anahtar istemiyor.
"""

from __future__ import annotations

import random
import time
from urllib.parse import urlsplit

import httpx

KULLANICI = "veri.korayoner.dev/0.1 (+https://veri.korayoner.dev/koray-oner)"
IZINLI_HOSTLAR = frozenset({"api.worldbank.org", "stats.bis.org", "sdmx.oecd.org", "data-api.ecb.europa.eu",
                            "ec.europa.eu"})
AZAMI_BOYUT = 20 * 1024 * 1024
DENEME = 5


class AgHatasi(RuntimeError):
    pass


def getir(url: str, *, istemci: httpx.Client | None = None, uyu=time.sleep) -> bytes:
    host = urlsplit(url).hostname
    if urlsplit(url).scheme != "https" or host not in IZINLI_HOSTLAR:
        raise AgHatasi(f"izinsiz adres: {url}")
    kendi = istemci is None
    ist = istemci or httpx.Client(timeout=httpx.Timeout(30.0, connect=10.0), follow_redirects=False,
                                   headers={"User-Agent": KULLANICI, "Accept": "application/json, text/csv;q=0.9"})
    try:
        son_hata: str = ""
        for deneme in range(DENEME):
            try:
                with ist.stream("GET", url) as y:
                    if y.status_code == 200:
                        parca: list[bytes] = []
                        boyut = 0
                        for b in y.iter_bytes():
                            boyut += len(b)
                            if boyut > AZAMI_BOYUT:
                                raise AgHatasi(f"yanıt {AZAMI_BOYUT} baytı aştı: {url}")
                            parca.append(b)
                        return b"".join(parca)
                    if y.status_code in (429, 500, 502, 503, 504):
                        son_hata = f"HTTP {y.status_code}"
                        bekle = _retry_after(y.headers.get("Retry-After"))
                    else:
                        raise AgHatasi(f"HTTP {y.status_code}: {url}")
            except (httpx.TimeoutException, httpx.TransportError) as e:
                son_hata = type(e).__name__
                bekle = None
            uyu(bekle if bekle is not None else min(60.0, 2 ** deneme) + random.uniform(0, 1))  # noqa: S311
        raise AgHatasi(f"{DENEME} denemede alınamadı ({son_hata}): {url}")
    finally:
        if kendi:
            ist.close()


def _retry_after(deger: str | None) -> float | None:
    if not deger:
        return None
    try:
        return min(120.0, max(0.0, float(deger)))
    except ValueError:
        return None
