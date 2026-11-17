"""Analitik göl: kanonik seri dosyalarından tek Parquet (ADR 0002, katman 2).

Yalnız API izni olan seriler girer. Değer DECIMAL(38,14): kanonik metinden
kayıpsız. Dosya her çalıştırmada baştan üretilir; içerik aynıysa yeniden
yazılmaz (bayt karşılaştırması yerine satır özeti).
"""

from __future__ import annotations

import hashlib
import json
import os
import tempfile
from pathlib import Path

import duckdb

SUTUNLAR = ("seri VARCHAR, donem VARCHAR, deger DECIMAL(38,14), birim VARCHAR, siklik VARCHAR, "
            "kaynak VARCHAR, kaynak_kod VARCHAR, ulke VARCHAR, cekildi TIMESTAMPTZ")


def satirlar(cikti: Path) -> list[tuple]:
    liste = []
    for yol in sorted((cikti / "api" / "v1" / "seri").glob("*.json")):
        d = json.loads(yol.read_text(encoding="utf-8"))
        for g in d["gozlemler"]:
            liste.append((d["id"], g["donem"], g["deger"], d["birim"], d["siklik"], d["kaynak"]["id"],
                          d["kaynak_kod"], d["ulke"], d["cekildi"]))
    return liste


def yaz(cikti: Path) -> bool:
    """Parquet'i üretir; değiştiyse True."""
    s = satirlar(cikti)
    ozet = hashlib.sha256(json.dumps(s, sort_keys=True).encode()).hexdigest()
    hedef = cikti / "api" / "v1" / "gozlemler.parquet"
    ozet_yolu = cikti / "api" / "v1" / "gozlemler.parquet.sha256"
    if hedef.exists() and ozet_yolu.exists() and ozet_yolu.read_text().strip() == ozet:
        return False
    hedef.parent.mkdir(parents=True, exist_ok=True)
    fd, gecici = tempfile.mkstemp(dir=hedef.parent, suffix=".parquet")
    os.close(fd)
    try:
        con = duckdb.connect()
        con.execute(f"CREATE TABLE g ({SUTUNLAR})")
        con.executemany("INSERT INTO g VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", s)
        con.execute("COPY (SELECT * FROM g ORDER BY seri, donem) TO ? (FORMAT parquet, COMPRESSION zstd)", [gecici])
        con.close()
        os.replace(gecici, hedef)
    except BaseException:
        Path(gecici).unlink(missing_ok=True)
        raise
    ozet_yolu.write_text(ozet + "\n", encoding="utf-8", newline="\n")   # Windows'ta da LF
    return True
